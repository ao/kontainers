// HTTP handling: security gate (Host, Origin, session, CSRF), then routes.
// Pages are server-rendered; state changes are HTML form POSTs that redirect (POST/redirect/GET).

import type { Database } from 'bun:sqlite';
import { readFileSync, unlinkSync } from 'node:fs';
import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Config } from './config';
import { isLoopback } from './config';
import { Auth, RateLimiter, safeEqual, type Session } from './auth';
import { Docker, DockerError, summarizeStats, type CreateSpec } from './docker';
import type { ProxyManager, RuleStore } from './proxy';
import { snapshot } from './db';
import { editable, recreateSpec, replaceContainer, updateContainerDetailed, type Journal } from './update';
import type { Notifier } from './notify';
import { EVENT_KINDS } from './notify';
import { labelledOn, type AutoUpdates } from './autoupdate';
import type { EventWatcher } from './events';
import { containerStatus, type UpdateChecker } from './updates';
import { STATIC } from './static';
import * as v from './validate';
import * as views from './views';
import * as cleanup from './cleanup';
import { NameLocks } from './locks';
import { diskFull, DISK_FULL, storageTrouble, writeFailed } from './storage';
import { validateRegistry, type Registries } from './registries';
import { validateSchedule, describeSchedule, DAY_NAMES, type ScheduleStore } from './schedule';
import { otpauthUri, type TwoFactor } from './totp';
import type { Backups } from './backups';

export interface Deps {
  cfg: Config;
  db: Database;
  auth: Auth;
  docker: Docker;
  rules: RuleStore;
  proxy: ProxyManager;
  limiter?: RateLimiter;
  // The container kontainers runs in (ID or name), when it runs in one.
  selfContainer?: string;
  updates?: UpdateChecker;
  notifier?: Notifier;
  autoUpdates?: AutoUpdates;
  events?: EventWatcher;
  // Aborted at shutdown: replacements being watched are undone instead of left half done.
  stopping?: AbortSignal;
  registries?: Registries;
  journal?: Journal;
  schedule?: ScheduleStore;
  twoFactor?: TwoFactor;
  backups?: Backups;
}

export type Handler = (req: Request, socketIp: string) => Promise<Response>;

const COOKIE_PLAIN = 'kontainers_session';
const COOKIE_SECURE = '__Host-kontainers_session'; // __Host- requires Secure, Path=/ and no Domain

// --- small helpers -----------------------------------------------------------

export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
}

// The host name in a tcp:// or http:// DOCKER_HOST, e.g. "docker-proxy" for tcp://docker-proxy:2375.
export function dockerApiHost(dockerHost: string): string | null {
  const m = /^(?:tcp|http):\/\/(\[[^\]]+\]|[^:/]+)/.exec(dockerHost);
  return m ? m[1].replace(/^\[|\]$/g, '') : null;
}

// The Docker API's host and port, as "host:port": the port the Docker client connects to (2375 for
// tcp:// and 80 for http:// when none is given).
export function dockerApiAddress(dockerHost: string): string | null {
  const m = /^(tcp|http):\/\/(\[[^\]]+\]|[^:/]+)(?::(\d+))?/.exec(dockerHost);
  return m ? `${m[2]}:${m[3] || (m[1] === 'tcp' ? '2375' : '80')}` : null;
}

// The client address for rate limiting. X-Forwarded-For is believed only when the socket peer is a
// configured proxy, and then the right-most address that is not itself a trusted proxy is used.
export function clientIp(socketIp: string, xff: string | null, trusted: string[]): string {
  const peer = normalizeIp(socketIp);
  if (!xff || !trusted.includes(peer)) return peer;
  const hops = xff.split(',').map(s => normalizeIp(s.trim())).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) if (!trusted.includes(hops[i])) return hops[i];
  return peer;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

// Host names a browser could legitimately use for this instance. Without KONTAINERS_PUBLIC_URL only
// loopback names and IP literals are accepted: a DNS name pointing at 127.0.0.1 is how DNS rebinding works.
export function hostAllowed(hostHeader: string | null, cfg: Config): boolean {
  if (!hostHeader) return false;
  let raw: string;
  try { raw = new URL(`http://${hostHeader}`).hostname; } catch { return false; }
  const host = raw.replace(/^\[|\]$/g, '');
  if (cfg.publicUrl) {
    if (host === new URL(cfg.publicUrl).hostname.replace(/^\[|\]$/g, '')) return true;
    return isLoopback(host); // health checks and SSH tunnels still work
  }
  // An IPv6 literal only in brackets: bare hex words such as "cafe" are DNS names a rebinding
  // attacker could answer for.
  return isLoopback(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || (raw.startsWith('[') && isIP(host) === 6);
}

// Rejects cross-site requests. Browsers send Origin on every POST and Sec-Fetch-Site on every request.
export function sameOrigin(req: Request, cfg: Config): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (origin === null) return true; // not a browser form post; state changes still need the CSRF token
  const expected = new Set<string>();
  const host = req.headers.get('host');
  if (cfg.publicUrl) expected.add(cfg.publicUrl);
  if (host) { expected.add(`http://${host}`); expected.add(`https://${host}`); }
  return expected.has(origin);
}

function securityHeaders(h: Headers, cfg: Config): void {
  h.set('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  h.set('x-content-type-options', 'nosniff');
  h.set('x-frame-options', 'DENY');
  // Not no-referrer: with that, browsers send "Origin: null" on same-origin form posts and the
  // origin check would refuse them. same-origin still sends nothing to other sites.
  h.set('referrer-policy', 'same-origin');
  h.set('cross-origin-opener-policy', 'same-origin');
  h.set('cross-origin-resource-policy', 'same-origin');
  if (!h.has('cache-control')) h.set('cache-control', 'no-store');
  if (cfg.publicUrl?.startsWith('https:')) h.set('strict-transport-security', 'max-age=31536000');
}

const page = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const text = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } });
const redirect = (to: string, headers: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, ...headers } });

// The most a form may be. The server itself takes up to 16 MB (main.ts), so a bigger form gets a
// page that says what happened instead of a bare 413.
export const MAX_FORM = 1024 * 1024;
// exact: the size is known (Content-Length); otherwise reading stopped at the limit.
const tooLarge = (n: number, exact = true) => Object.assign(new v.ValidationError(`the form was ${exact ? '' : 'more than '}${Math.ceil((exact ? n : MAX_FORM) / 1024)} KB; kontainers accepts at most ${MAX_FORM / 1024} KB (a very large environment paste?). Go back and shorten it`), { status: 413 });

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  if (!ct.startsWith('application/x-www-form-urlencoded')) throw new v.ValidationError('expected a form submission');
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_FORM) throw tooLarge(len);
  // Read as a stream and given up past the limit, so a body without a length is never held whole.
  const parts: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_FORM) { await reader.cancel().catch(() => {}); throw tooLarge(size, false); }
      parts.push(value);
    }
  }
  const body = new TextDecoder().decode(parts.length === 1 ? parts[0] : Buffer.concat(parts));
  const out: Record<string, string> = {};
  for (const [k, val] of new URLSearchParams(body)) if (!(k in out)) out[k] = val;
  return out;
}

const lines = (s: string | undefined) => (s || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
// Environment lines keep trailing spaces: they can be part of a value.
const envLines = (s: string | undefined) => (s || '').split(/\r?\n/).map(l => l.trimStart()).filter(l => l.trim() !== '');

// "[host-ip:]host:container[/udp]"; an IPv6 host IP goes in brackets.
export function parsePort(line: string): NonNullable<CreateSpec['ports']>[number] {
  const m = /^(?:(\[[0-9a-fA-F:]+\]|[0-9.]+):)?(\d+):(\d+)(?:\/(tcp|udp))?$/.exec(line);
  if (!m) throw new v.ValidationError(`invalid port mapping "${line}", expected [host-ip:]host:container[/udp]`);
  return { hostIp: m[1] ? m[1].replace(/^\[|\]$/g, '') : undefined, host: Number(m[2]), container: Number(m[3]), protocol: (m[4] as 'tcp' | 'udp') || 'tcp' };
}

// "source:/target[:ro]"
export function parseVolume(line: string): NonNullable<CreateSpec['volumes']>[number] {
  const ro = line.endsWith(':ro');
  const body = ro ? line.slice(0, -3) : line;
  const i = body.indexOf(':/');
  if (i < 1) throw new v.ValidationError(`invalid volume "${line}", expected name:/path[:ro]`);
  return { source: body.slice(0, i), target: body.slice(i + 1), readOnly: ro };
}

// Splits a command line into arguments the way a POSIX shell quotes them: 'single' quotes are
// literal, "double" quotes allow \" \\ \$ \` escapes, a backslash outside quotes escapes the next
// character. Nothing is expanded and no shell runs: the result goes to Docker as an argv array.
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = '', inArg = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      if (end === -1) throw new v.ValidationError('command has an unterminated single quote');
      cur += s.slice(i + 1, end); inArg = true; i = end + 1;
    } else if (c === '"') {
      i++; inArg = true;
      for (;;) {
        if (i >= s.length) throw new v.ValidationError('command has an unterminated double quote');
        const d = s[i];
        if (d === '"') { i++; break; }
        if (d === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) { cur += s[i + 1]; i += 2; continue; }
        cur += d; i++;
      }
    } else if (c === '\\') {
      if (i + 1 >= s.length) throw new v.ValidationError('command ends with a backslash');
      cur += s[i + 1]; inArg = true; i += 2;
    } else if (/\s/.test(c)) {
      if (inArg) { out.push(cur); cur = ''; inArg = false; }
      i++;
    } else {
      cur += c; inArg = true; i++;
    }
  }
  if (inArg) out.push(cur);
  return out;
}

export function containerSpec(f: Record<string, string>): CreateSpec {
  return {
    image: f.image?.trim(),
    name: f.name?.trim() || undefined,
    cmd: f.cmd?.trim() ? splitArgs(f.cmd.trim()) : undefined,
    env: envLines(f.env),
    ports: lines(f.ports).map(parsePort),
    volumes: lines(f.volumes).map(parseVolume),
    restart: (f.restart as CreateSpec['restart']) || 'no',
  };
}

// SQLite cannot write: the data volume is full (or read-only).

function errorStatus(e: unknown): number {
  if (diskFull(e)) return 507;
  if (e instanceof v.ValidationError) return e.status;
  if (e instanceof DockerError) return e.status;
  const s = (e as { status?: number })?.status;
  return typeof s === 'number' ? s : 500;
}

function errorMessage(e: unknown): string {
  if (diskFull(e)) return DISK_FULL;
  if (e instanceof v.ValidationError || e instanceof DockerError) return e.message;
  if ((e as { status?: number })?.status) return (e as Error).message;
  return 'internal error, see the kontainers log';
}

// --- handler -----------------------------------------------------------------

export function createHandler(d: Deps): Handler {
  const { cfg, db, auth, docker, rules, proxy } = d;
  // 5 failures per username, 20 per client address, per 15 minutes. The address limit is higher
  // because everyone behind one SSH tunnel or proxy shares an address.
  const limiter = d.limiter ?? new RateLimiter(5);
  const ipLimiter = new RateLimiter(20);
  // Wrong two-factor codes per account over a day: someone who has the password cannot keep
  // guessing at the per-15-minute rate for long.
  const codeLimiter = new RateLimiter(20, 24 * 3600_000);
  // Pulls that outlived the request (see /images/pull), shown on the Images page.
  const pulls = new Map<string, { state: 'pulling' | 'failed'; error?: string; at: number }>();
  const secure = !!cfg.publicUrl?.startsWith('https:');
  const cookieName = secure ? COOKIE_SECURE : COOKIE_PLAIN;
  // Outcomes waiting to be shown, per session. Several actions at once (two tabs) each add theirs;
  // form: what a failed form held, to fill it in again.
  let downloads = 0;
  // Two-factor set-ups not confirmed yet, per session.
  const totpSetup = new Map<string, { secret: string; until: number }>();
  const flashes = new Map<string, { flash?: string; error?: string; form?: Record<string, string> }>();
  const addFlash = (idHash: string, m: { flash?: string; error?: string; form?: Record<string, string> }) => {
    const f = flashes.get(idHash) ?? {};
    // The newest five of each, so a script that posts without reading pages cannot grow them.
    const add = (old: string | undefined, msg: string) => (old ? `${old}\n${msg}` : msg).split('\n').slice(-5).join('\n').slice(-4000);
    if (m.flash) f.flash = add(f.flash, m.flash);
    if (m.error) f.error = add(f.error, m.error);
    if (m.form) f.form = m.form;
    flashes.set(idHash, f);
  };

  const setCookie = (id: string) => `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  const clearCookie = () => `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;

  // result: null for success, or what went wrong.
  // target is what the request named, before validation: cut to 200 characters so a huge form
  // field cannot bloat the log.
  const audit = (s: Session | null, action: string, target: string | null, ip: string, result: string | null = null) =>
    db.query('INSERT INTO audit_log (at, username, action, target, ip, result) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), s?.user.username ?? null, action, target === null ? null : String(target).slice(0, 200), ip, result);
  // For records that must not stop the request they belong to (a login, a logout).
  const safeAudit = (...a: Parameters<typeof audit>) => { try { audit(...a); } catch (e) { writeFailed(e, `could not record ${a[1]}`); } };

  function ctx(s: Session): views.PageCtx {
    const f = flashes.get(s.idHash);
    flashes.delete(s.idHash);
    return { user: s.user.username, csrf: s.csrf, flash: f?.flash, error: f?.error, form: f?.form, proxyEnabled: cfg.proxy.enabled, alert: storageTrouble(),
      busy: (name: string) => locks.has(name) ? 'being updated or edited' : setAsideOf(name) ? `old container of ${setAsideOf(name)}, kept until its update or edit finishes` : null };
  }

  // kontainers' own container and, under compose, the rest of its project (the socket proxy):
  // stopping or removing one of them from the UI would cut the UI off from Docker or kill it.
  let selfCache: views.SelfInfo | null | undefined;
  let selfAt = 0;
  async function self(): Promise<views.SelfInfo | null> {
    if (selfCache !== undefined && (selfCache === null || Date.now() - selfAt < 30_000)) return selfCache;
    if (!d.selfContainer) return (selfCache = null);
    try {
      const c = await docker.inspect(d.selfContainer);
      const project = c.Config?.Labels?.['com.docker.compose.project'] ?? null;
      selfCache = { id: c.Id, project, apiId: await apiContainerId(project) };
      selfAt = Date.now();
    } catch (e) {
      if (e instanceof DockerError && e.status === 404) selfCache = null; // not a container after all
      else return selfCache ?? null; // daemon unreachable: keep what was known, try again later
    }
    return selfCache ?? null;
  }
  if (d.autoUpdates) d.autoUpdates.protect = async (c: any) => views.isSelf(c, await self());

  // The container that serves kontainers' Docker API, when DOCKER_HOST names one (tcp://docker-proxy:2375
  // in compose.yaml): by container name, by compose service in kontainers' own project, or by address.
  // Looked up again every 30 s, because compose recreates it under a new ID.
  async function apiContainerId(project: string | null): Promise<string | null> {
    const api = dockerApiHost(cfg.dockerHost);
    if (!api) return null;
    for (const c of await docker.listContainers()) {
      const labels = c.Labels || {};
      if ((c.Names || []).some((n: string) => n.replace(/^\//, '') === api)
        || (!!project && labels['com.docker.compose.project'] === project && labels['com.docker.compose.service'] === api)
        || Object.values(c.NetworkSettings?.Networks || {}).some((n: any) => n?.IPAddress === api)) return c.Id;
    }
    return null;
  }
  const updateView = (): views.UpdateView | null => d.updates
    ? { get: (ref: string) => d.updates!.get(ref), lastRun: d.updates.lastRun, scheduled: cfg.updateCheckHours > 0 ? cfg.updateCheckHours : null,
        held: (name: string, id: string) => (d.autoUpdates?.isOn(name, id) ? d.autoUpdates.heldImage(name) : null) }
    : null;

  // A password asked again from a logged-in session (turning off two-factor, replacing its key,
  // changing the password) counts toward the same per-account limit as logging in, so an open
  // session cannot be used to guess it.
  async function passwordAgain(s: Session, password: unknown): Promise<void> {
    // Its own key: wrong passwords sent to the login page by someone else must not stop the owner,
    // logged in, from changing the password or turning two-factor off.
    const key = `again:${s.user.username.toLowerCase()}`;
    const wait = limiter.blocked(key);
    if (wait > 0) throw Object.assign(new v.ValidationError(`too many wrong passwords; try again in ${Math.ceil(wait / 60)} minutes`), { status: 429 });
    limiter.fail(key);
    if (!(await auth.verifyLogin(s.user.username, password))) throw new v.ValidationError('the password is not right');
    limiter.undo(key);
  }

  async function refuseSelf(id: string): Promise<void> {
    const me = await self();
    if (!me) return;
    const c = await docker.inspect(id);
    if (views.isSelf(c, me)) {
      throw new v.ValidationError(c.Id === me.id ? 'this is kontainers itself; stopping or removing it here would cut off this page. Manage it on the host with docker compose or docker' : "this container serves kontainers' Docker API; stopping or removing it here would cut this page off from Docker. Manage it on the host with docker compose or docker");
    }
  }

  // A proxy rule connects its target to the shared proxy network, which every other target can
  // reach. Two containers must not be targets: kontainers itself (its UI would be reachable from
  // the targets), and the container that serves kontainers' Docker API, such as the socket proxy
  // in compose.yaml (any target could then control Docker, which is root on the host).
  async function proxyTargetRefusal(name: string): Promise<{ reason: string; self: boolean } | null> {
    let t: any;
    try { t = await docker.inspect(name); } catch (e) { if (e instanceof DockerError && e.status === 404) return null; throw e; }
    const me = await self();
    if (me && t.Id === me.id) return { self: true, reason: 'this is kontainers itself; a proxy rule to it would put its login page in reach of every proxy target' };
    const api = dockerApiHost(cfg.dockerHost);
    if (!api) return null;
    const labels = t.Config?.Labels || {};
    const nets: any[] = Object.values(t.NetworkSettings?.Networks || {});
    const serves = String(t.Name || '').replace(/^\//, '') === api
      || (!!me?.project && labels['com.docker.compose.project'] === me.project && labels['com.docker.compose.service'] === api)
      || nets.some(n => (n.Aliases || []).includes(api) || (n.DNSNames || []).includes(api) || n.IPAddress === api);
    return serves ? { self: false, reason: "this container serves kontainers' Docker API; on the proxy network every proxy target could use it to control Docker" } : null;
  }
  if (d.proxy) d.proxy.guard = proxyTargetRefusal;
  // Per-name locks shared with automatic updates.
  const locks = d.autoUpdates?.busy ?? new NameLocks();
  // The container set aside while <name> is replaced, <name>-old-<id>: starting or removing it
  // meanwhile would leave two instances on the same data, or nothing to put back.
  // Also while a replacement a restart interrupted is not tidied up yet (its journal entry is open),
  // and for a name shortened to fit Docker's 128 characters.
  const setAsideOf = (name: string) => {
    const m = /^(.+)-old-([0-9a-f]{8})$/.exec(name);
    if (!m) return null;
    if (locks.has(m[1])) return m[1];
    if (name.length >= 128) { const long = locks.names().find(n => n.startsWith(m[1])); if (long) return long; }
    try { const row = d.journal?.all().find(r => String(r.old_id).startsWith(m[2])); if (row) return row.name; } catch { /* no record */ }
    return null;
  };
  function refuseSetAside(name: string): void {
    const base = setAsideOf(name);
    if (base) throw new v.ValidationError(`${name} is the old container, set aside while ${base} is updated or edited; it is removed or put back when that finishes`);
  }
  async function refuseBusy(id: string): Promise<void> {
    const name = String((await docker.inspect(id)).Name || '').replace(/^\//, '');
    refuseSetAside(name);
    if (locks.has(name)) throw new v.ValidationError(`an update or edit of ${name} is running; wait for it to finish (a minute or two) and try again`);
  }
  const replaceOpts = () => ({ signal: d.stopping, journal: d.journal, wasStopped: d.events ? (cid: string) => d.events!.wasStopped(cid) : undefined });
  async function refuseProxyTarget(name: string): Promise<void> {
    const no = await proxyTargetRefusal(name);
    if (no) throw new v.ValidationError(no.reason);
  }

  // Runs a state change, stores the outcome as a flash message, redirects back.
  // back: where to go after, or a function of whether it failed. keep: on failure, the form to fill
  // in again (never a password field).
  async function act(s: Session, ip: string, back: string | ((failed: boolean) => string), action: string, target: string | null, fn: () => Promise<string | void> | string | void, keep?: Record<string, string>): Promise<Response> {
    // The outcome shown is the action's own. Recording it comes after and cannot turn a stop that
    // worked into an error (with a full data volume the record fails, and says so).
    let result: string | null = null;
    try {
      const msg = await fn();
      addFlash(s.idHash, { flash: msg || 'Done.' });
    } catch (e) {
      // A stack only for the unexpected; a refusal with a reason is logged as its message.
      if (errorStatus(e) >= 500 && !(e instanceof DockerError)) console.error(`kontainers: ${action} failed:`, e instanceof v.ValidationError ? e.message : e);
      const form = keep ? Object.fromEntries(Object.entries(keep).filter(([k]) => k !== '_csrf' && !/password/i.test(k))) : undefined;
      addFlash(s.idHash, { error: errorMessage(e), form });
      result = `failed: ${errorMessage(e)}`.slice(0, 500);
    }
    try {
      audit(s, action, target, ip, result);
    } catch (e) {
      writeFailed(e, `could not record ${action} in the activity log`);
      const f = flashes.get(s.idHash);
      const note = ' (It could not be recorded in the activity log: the data volume is full or read-only.)';
      if (f?.flash) f.flash += note;
      else if (f?.error) f.error += note;
    }
    return redirect(typeof back === 'function' ? back(result !== null) : back);
  }

  async function login(req: Request, ip: string, cookieId: string | undefined): Promise<Response> {
    const f = await readForm(req);
    const user = String(f.username || '').toLowerCase().slice(0, 64);
    const typed = typeof f.username === 'string' ? f.username.slice(0, 64) : '';
    const wait = Math.max(limiter.blocked(`user:${user}`), ipLimiter.blocked(`ip:${ip}`));
    if (wait > 0) return page(views.loginPage({ username: typed, error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minutes.` }), 429, { 'retry-after': String(wait) });
    // Count the attempt before the password check, which is slow and asynchronous: counted after it,
    // many requests sent at once all passed blocked() before any of them was recorded.
    limiter.fail(`user:${user}`);
    ipLimiter.fail(`ip:${ip}`);
    const u = await auth.verifyLogin(f.username, f.password);
    if (!u) {
      // The name only if such an account exists: a password typed into the username field must not
      // end up on the Activity page.
      safeAudit(null, 'login-failed', auth.hasUser(user) ? user : '(no such user)', ip);
      return page(views.loginPage({ username: typed, error: 'Wrong username or password.' }), 401);
    }
    // With two-factor on, the password only opens the second step: a code from the app.
    if (d.twoFactor?.enabled(u.id)) {
      // The right password is not a failure: the count made before checking it is taken back, so
      // the five tries per 15 minutes are left for the codes.
      limiter.undo(`user:${user}`);
      ipLimiter.undo(`ip:${ip}`);
      const dayWait = codeLimiter.blocked(`code:${user}`);
      if (dayWait > 0) return page(views.loginPage({ username: typed, error: `Too many wrong two-factor codes for this account today. Try again in ${Math.ceil(dayWait / 3600)} hours, or ask another account to turn its two-factor login off.` }), 429, { 'retry-after': String(dayWait) });
      const token = newPending(u.id, user);
      return page(views.twoFactorPage({ token }), 200);
    }
    return finishLogin(u, user, ip, cookieId, typed);
  }

  // since: when this login's second step began; wrong codes from before it are reported.
  function finishLogin(u: { id: number; username: string }, user: string, ip: string, cookieId: string | undefined, typed: string, how?: string, since = Date.now()): Response {
    limiter.reset(`user:${user}`);
    ipLimiter.reset(`ip:${ip}`);
    codeLimiter.reset(`code:${user}`);
    const old = cookieId ? auth.getSession(cookieId) : null;
    if (old) auth.destroySession(old.idHash); // never reuse a session id across a login
    let id: string;
    try { ({ id } = auth.createSession(u)); } catch (e) {
      if (!diskFull(e)) throw e;
      return page(views.loginPage({ username: typed, error: DISK_FULL + '.' }), 507);
    }
    // Wrong two-factor codes since this account's last login: someone may have the password.
    let wrong = 0;
    try {
      wrong = (db.query(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'login-failed' AND target = ? AND result LIKE '%two-factor%' AND at < ?
        AND at > (SELECT COALESCE(MAX(at), 0) FROM audit_log WHERE action = 'login' AND username = ?)`).get(u.username.toLowerCase(), since, u.username) as { n: number }).n;
    } catch { /* not shown */ }
    safeAudit({ user: u, csrf: '', idHash: '' }, 'login', how ?? null, ip);
    const notes: string[] = [];
    if (how === 'with a recovery code') notes.push(`Logged in with a recovery code; ${d.twoFactor!.recoveryLeft(u.id)} are left. Set up two-factor again on the Settings page if the phone is lost.`);
    if (wrong) notes.push(`${wrong} wrong two-factor code${wrong === 1 ? ' was' : 's were'} entered for this account since its last login: whoever entered ${wrong === 1 ? 'it' : 'them'} knew the password. Change it on the Settings page if that was not you.`);
    if (notes.length) flashes.set(auth.getSession(id)!.idHash, wrong ? { error: notes.join('\n') } : { flash: notes.join('\n') });
    return redirect('/containers', { 'set-cookie': setCookie(id) });
  }

  // Logins waiting for their second step: a random token in the form, five minutes, five tries.
  const pending = new Map<string, { userId: number; user: string; until: number; tries: number; at: number }>();
  function newPending(userId: number, user: string): string {
    const now = Date.now();
    for (const [k, p] of pending) if (p.until < now) pending.delete(k);
    if (pending.size > 1000) pending.clear();
    const token = randomBytes(24).toString('base64url');
    pending.set(token, { userId, user, until: now + 5 * 60_000, tries: 0, at: now });
    return token;
  }

  async function loginCode(req: Request, ip: string, cookieId: string | undefined): Promise<Response> {
    const f = await readForm(req);
    const p = pending.get(String(f.token || ''));
    if (!p || p.until < Date.now()) return page(views.loginPage({ error: 'The login timed out. Enter the password again.' }), 401);
    const wait = Math.max(limiter.blocked(`user:${p.user}`), ipLimiter.blocked(`ip:${ip}`), codeLimiter.blocked(`code:${p.user}`));
    if (wait > 0) return page(views.loginPage({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minutes.` }), 429, { 'retry-after': String(wait) });
    limiter.fail(`user:${p.user}`);
    ipLimiter.fail(`ip:${ip}`);
    const how = d.twoFactor?.verify(p.userId, String(f.code || '')) ?? null;
    if (!how) {
      codeLimiter.fail(`code:${p.user}`);
      safeAudit(null, 'login-failed', p.user, ip, 'failed: wrong two-factor code');
      if (++p.tries >= 5) { pending.delete(String(f.token)); return page(views.loginPage({ error: 'Too many wrong codes. Enter the password again.' }), 401); }
      return page(views.twoFactorPage({ token: String(f.token), error: 'That code is not right, or it was used already. Enter the code the app shows now.' }), 401);
    }
    pending.delete(String(f.token));
    // The same account the password was for (an ID can be reused after a removal).
    const u = auth.listUsers().find(x => x.id === p.userId && x.username.toLowerCase() === p.user);
    if (!u) return page(views.loginPage({ error: 'That account was removed.' }), 401);
    return finishLogin(u, p.user, ip, cookieId, p.user, how === 'recovery' ? 'with a recovery code' : undefined, p.at);
  }

  async function setup(req: Request, ip: string): Promise<Response> {
    const f = await readForm(req);
    const wait = limiter.blocked(`setup:${ip}`);
    if (wait > 0) return page(views.setupPage({ error: 'Too many attempts. Try again later.' }), 429, { 'retry-after': String(wait) });
    try {
      const u = await auth.setup(f.token, f.username, f.password);
      const { id } = auth.createSession(u);
      safeAudit({ user: u, csrf: '', idHash: '' }, 'setup', null, ip);
      console.log(`kontainers: first account "${u.username}" created; setup is closed`);
      return redirect('/containers', { 'set-cookie': setCookie(id) });
    } catch (e) {
      if (errorStatus(e) === 403) limiter.fail(`setup:${ip}`);
      if (!auth.needsSetup()) return redirect('/login');
      const keep = { token: typeof f.token === 'string' ? f.token.slice(0, 100) : '', username: typeof f.username === 'string' ? f.username.slice(0, 64) : '' };
      return page(views.setupPage({ error: errorMessage(e), ...keep }), errorStatus(e));
    }
  }

  async function backup(): Promise<Response> {
    const file = join(cfg.dataDir, 'run', `backup-${process.pid}-${Date.now()}.db`);
    snapshot(db, file);
    try {
      const data = readFileSync(file);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      return new Response(data, { headers: { 'content-type': 'application/vnd.sqlite3', 'content-disposition': `attachment; filename="kontainers-${stamp}.db"` } });
    } finally {
      try { unlinkSync(file); } catch { /* already gone */ }
    }
  }

  async function routes(req: Request, url: URL, s: Session, ip: string): Promise<Response> {
    const p = url.pathname, m = req.method;
    let r: RegExpExecArray | null;

    if (m === 'GET') {
      if (p === '/') return redirect('/containers');
      if (p === '/containers') return page(views.containersPage(ctx(s), await docker.listContainersWithRefs(), await self(), updateView(), views.parseFilter(url.searchParams)));
      if (p === '/containers/new') return page(views.newContainerPage(ctx(s), cfg.allowBindMounts, !!d.autoUpdates));
      if ((r = /^\/containers\/([^/]+)\/edit$/.exec(p))) {
        const c = await docker.inspect(r[1]);
        const me = await self();
        if (me && views.isSelf(c, me)) throw new v.ValidationError("this is kontainers itself or the container that serves its Docker API; change it on the host");
        const refusal = editable(c);
        if (refusal) throw new v.ValidationError(refusal);
        const oldImage = await docker.inspectImage(c.Image).catch(() => null);
        const spec = recreateSpec(c, oldImage);
        return page(views.editContainerPage(ctx(s), c, spec, cfg.allowBindMounts, !oldImage));
      }
      if ((r = /^\/containers\/([^/]+)$/.exec(p))) {
        const c = await docker.inspect(r[1]);
        const name = String(c.Name || '').replace(/^\//, '');
        const row = d.autoUpdates?.get(name) ?? null;
        const auto = d.autoUpdates ? { on: d.autoUpdates.isOn(name, c.Id, c.Config?.Labels), label: labelledOn(c.Config?.Labels), row, waiting: d.autoUpdates.waitingFor(name) } : null;
        return page(views.containerPage(ctx(s), c, await self(), updateView(), auto));
      }
      if ((r = /^\/api\/containers\/([^/]+)\/stats$/.exec(p))) {
        return new Response(JSON.stringify(summarizeStats(await docker.stats(r[1]))), { headers: { 'content-type': 'application/json' } });
      }
      if ((r = /^\/api\/containers\/([^/]+)\/logs$/.exec(p))) return text(await docker.logs(r[1], v.intInRange(url.searchParams.get('tail'), 1, 10000, 200), url.searchParams.get('timestamps') !== '0'));
      if ((r = /^\/api\/containers\/([^/]+)\/logs\.txt$/.exec(p))) {
        // A download: up to 100000 lines and 20 MB, named after the container and the time. Two at a
        // time, since each holds its text in memory.
        if (downloads >= 2) return text('Two log downloads are already running; try again when one has finished.\n', 429);
        downloads++;
        try {
          const c = await docker.inspect(r[1]);
          const name = String(c.Name || '').replace(/^\//, '').replace(/[^A-Za-z0-9_.-]/g, '_');
          const body = await docker.logs(c.Id, v.intInRange(url.searchParams.get('tail'), 1, 100000, 10000), url.searchParams.get('timestamps') !== '0', 100000, 20 << 20);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${name}-${stamp}.log"` } });
        } finally { downloads--; }
      }
      if (p === '/images') {
        for (const [k, j] of pulls) if (j.state === 'failed' && Date.now() - j.at > 30 * 60 * 1000) pulls.delete(k);
        return page(views.imagesPage(ctx(s), await docker.listImages(), [...pulls].map(([ref, j]) => ({ ref, ...j }))));
      }
      if (p === '/networks' || p === '/volumes') {
        // Who uses what, from the container list (names, which the pages link to).
        const users = new Map<string, string[]>();
        const add = (k: string, n: string) => (users.get(k) || users.set(k, []).get(k)!).push(n);
        for (const c of await docker.listContainers()) {
          const n = String(c.Names?.[0] || '').replace(/^\//, '');
          if (p === '/networks') for (const net of Object.keys(c.NetworkSettings?.Networks || {})) add(net, n);
          else for (const m of c.Mounts || []) if (m.Type === 'volume' && m.Name) add(m.Name, n);
        }
        return page(p === '/networks' ? views.networksPage(ctx(s), await docker.listNetworks(), users) : views.volumesPage(ctx(s), await docker.listVolumes(), users));
      }
      if (p === '/activity') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
        const before = v.intInRange(url.searchParams.get('before'), 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        const like = `%${q.replace(/[\\%_]/g, ch => '\\' + ch)}%`;
        const keys = views.actionsMatching(q);
        const rows = db.query(`SELECT id, at, username, action, target, ip, result FROM audit_log WHERE id < ? AND (? = ''
            OR username LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\' OR result LIKE ? ESCAPE '\\'
            OR action IN (SELECT value FROM json_each(?))
            OR (username IS NULL AND ip IS NULL AND 'kontainers' LIKE ? ESCAPE '\\')) ORDER BY id DESC LIMIT 101`)
          .all(before, q, like, like, like, like, JSON.stringify(keys), like) as views.AuditRow[];
        return page(views.activityPage(ctx(s), rows.slice(0, 100), q, rows.length > 100 ? rows[99].id : null));
      }
      if (p === '/cleanup') return page(views.cleanupPage(ctx(s), await cleanup.currentPlan(docker)));
      if (p === '/proxy') {
        const list = rules.list();
        const status = (r: (typeof list)[number]) => ({
          target: proxy.targetState.get(r.target_container) ?? null,
          port: proxy.portState.get(`${r.target_container}:${r.target_port}`),
          cert: r.tls ? proxy.certificate(r.hostname) : null,
          refused: proxy.refusalFor(r.target_container),
        });
        return page(views.proxyPage(ctx(s), list, { running: proxy.running, lastError: proxy.lastError, networkError: proxy.networkError }, status));
      }
      if ((r = /^\/proxy\/(\d+)\/edit$/.exec(p))) {
        const rule = rules.get(Number(r[1]));
        return rule ? page(views.editRulePage(ctx(s), rule)) : page(views.layout('Not found', ctx(s), views.html`<p>There is no proxy rule ${r[1]}. <a href="/proxy">Proxy</a></p>`), 404);
      }
      if (p === '/settings') return page(views.settingsPage(ctx(s), auth.listUsers(), s.user.id, d.notifier ? d.notifier.list() : null, d.events ? { connected: d.events.connected, error: d.events.lastError } : null, d.registries ? d.registries.list() : null, d.schedule ? d.schedule.get() : null,
        d.twoFactor ? { mine: d.twoFactor.enabled(s.user.id), left: d.twoFactor.recoveryLeft(s.user.id), users: new Set(auth.listUsers().filter(u => d.twoFactor!.enabled(u.id)).map(u => u.id)) } : null,
        d.backups ? { keep: d.backups.keep, files: d.backups.list() } : null));
      if (p === '/api/backup') { safeAudit(s, 'backup', null, ip); return backup(); }
      if ((r = /^\/settings\/backups\/([^/]+)$/.exec(p)) && d.backups) {
        const name = decodeURIComponent(r[1]);
        const file = d.backups.path(name);
        safeAudit(s, 'backup', name, ip);
        return new Response(Bun.file(file), { headers: { 'content-type': 'application/vnd.sqlite3', 'content-disposition': `attachment; filename="${name}"` } });
      }
      if (p.startsWith('/api/')) return text('not found\n', 404);
      return page(views.layout('Not found', ctx(s), views.html`<p>There is no page at this address. <a href="/containers">Containers</a></p>`), 404);
    }

    if (m !== 'POST') return text('method not allowed\n', 405, { allow: 'GET, POST' });

    let f: Record<string, string>;
    try { f = await readForm(req); } catch (e) {
      if (errorStatus(e) !== 413) throw e;
      return page(views.layout('Form too large', ctx(s), views.html`<p class="error">${errorMessage(e)}.</p>`), 413);
    }
    if (typeof f._csrf !== 'string' || !safeEqual(f._csrf, s.csrf)) return text('invalid or missing CSRF token\n', 403);

    if (p === '/logout') {
      auth.destroySession(s.idHash);
      safeAudit(s, 'logout', null, ip);
      return redirect('/login', { 'set-cookie': clearCookie() });
    }

    if (p === '/containers') {
      return act(s, ip, failed => (failed ? '/containers/new' : '/containers'), 'container-create', f.name || f.image || null, async () => {
        const spec = containerSpec(f);
        if (f.pull) await docker.pull(spec.image);
        const { Id } = await docker.create(spec);
        if (f.start) {
          try {
            await docker.start(Id);
          } catch (e) {
            // Do not leave a created-but-unstartable container behind holding the name.
            await docker.remove(Id, true).catch(() => {});
            throw new v.ValidationError(`could not start the container, so it was not kept: ${errorMessage(e)}`);
          }
        }
        if (f.autoupdate && d.autoUpdates) await d.autoUpdates.set(Id, true);
        return `Created ${spec.name || Id.slice(0, 12)}${f.autoupdate && d.autoUpdates ? '; it is updated automatically when a check finds a newer image' : ''}.`;
      }, f);
    }
    if ((r = /^\/containers\/([^/]+)\/edit$/.exec(p))) {
      const id = r[1];
      // Back to the form on a failure; to the new container's page once it is saved.
      let back = `/containers/${encodeURIComponent(id)}/edit`;
      return act(s, ip, () => back, 'container-edit', id, async () => {
        await refuseSelf(id);
        const c = await docker.inspect(id);
        const refusal = editable(c);
        if (refusal) throw new v.ValidationError(refusal);
        const name = String(c.Name || '').replace(/^\//, '');
        refuseSetAside(name);
        // Taken straight after the inspect, with nothing awaited in between, and held for the pull too.
        const release = locks.take(name);
        if (!release) throw new v.ValidationError(`an update or edit of ${name} is already running; try again in a minute`);
        const spec = containerSpec(f);
        let rep: { id: string; note: string | null };
        try {
          if (f.pull) await docker.pull(spec.image);
          // Host paths the container already has may stay (read-only ones read-only); new ones follow
          // KONTAINERS_ALLOW_BIND_MOUNTS.
          const binds = [
            ...(c.Mounts || []).filter((m: any) => m.Type === 'bind').map((m: any) => ({ source: String(m.Source), readOnly: m.RW === false })),
            ...(c.HostConfig?.Mounts || []).filter((m: any) => m.Type === 'bind').map((m: any) => ({ source: String(m.Source), readOnly: !!m.ReadOnly })),
          ];
          rep = await replaceContainer(docker, c, spec, { settleMs: Math.min(cfg.autoUpdateSettle, 5) * 1000, allowedBinds: binds, ...replaceOpts() }, 'saving the settings');
          d.autoUpdates?.recreated(name, rep.id);
          back = `/containers/${encodeURIComponent(name)}`;
        } finally { release(); }
        // After the lock is released: a crash of the new container from now on is reported as one.
        if (d.updates) await d.updates.check(spec.image).catch(() => {});
        return `Saved the settings of ${name}; it was recreated${rep.note ? `; ${rep.note}` : ''}.`;
      }, { ...f, _edit: String(id) });
    }
    if ((r = /^\/containers\/([^/]+)\/update$/.exec(p))) {
      const id = r[1];
      // The container gets a new ID, so return to the list.
      return act(s, ip, '/containers', 'container-update', id, async () => {
        await refuseSelf(id);
        const c = await docker.inspect(id);
        const name = String(c.Name || '').replace(/^\//, '');
        refuseSetAside(name);
        const release = locks.take(name);
        if (!release) throw new v.ValidationError(`an update or edit of ${name} is already running; try again in a minute`);
        let r: Awaited<ReturnType<typeof updateContainerDetailed>>;
        try {
          // Watched for a few seconds, so an image that crashes at once is caught and rolled back.
          r = await updateContainerDetailed(docker, id, { settleMs: Math.min(cfg.autoUpdateSettle, 5) * 1000, healthTimeoutMs: 0, ...replaceOpts() });
          if (r.changed) d.autoUpdates?.recreated(name, r.id);
        } finally { release(); }
        if (c.Config?.Image && d.updates) await d.updates.check(c.Config.Image).catch(() => {});
        return r.message;
      });
    }
    if (p === '/updates/check') {
      return act(s, ip, '/containers', 'update-check', null, async () => {
        if (!d.updates) throw new v.ValidationError('update checks are not available');
        // Registries that do not answer make a check slow; after 20 s it carries on in the background.
        // A scheduled check already running started before this click; a new one follows it.
        const running = d.updates.checkAll(true);
        const finished = await Promise.race([running.then(() => true, () => true), Bun.sleep(20000).then(() => false)]);
        if (!finished) { running.catch(() => {}); return 'Still checking: some registries are slow to answer. The results show here when the check is done; reload in a minute.'; }
        const n = await running;
        const newer = n === 0 ? [] : (await docker.listContainersWithRefs()).filter(c => containerStatus(d.updates!.get(c.Ref), c.ImageID)?.status === 'available');
        const uv = updateView();
        const opted = newer.filter(c => { const nm = String(c.Names?.[0] || '').replace(/^\//, ''); return d.autoUpdates?.isOn(nm, c.Id, c.Labels) && !views.heldBack(uv, nm, c.Id, c.Ref); });
        const waits = opted.filter(c => d.autoUpdates?.waitFor(c.Ref, d.updates!.get(c.Ref))).length;
        const auto = opted.length - waits;
        const available = newer.length;
        return `Checked ${n} image${n === 1 ? '' : 's'}: ${available === 0 ? 'every container runs the newest image for its tag' : `${available} container${available === 1 ? ' has' : 's have'} a newer image`}${auto ? `; ${auto} ${auto === 1 ? 'is' : 'are'} being updated automatically` : ''}${waits ? `; ${waits} ${waits === 1 ? 'waits' : 'wait'} for the update window or delay (Settings)` : ''}.`;
      });
    }
    if ((r = /^\/projects\/([^/]+)\/(start|stop|restart)$/.exec(p))) {
      const [, project, op] = r;
      return act(s, ip, '/containers', `project-${op}`, project, async () => {
        v.name(project, 'compose project');
        const me = await self();
        const members = (await docker.listContainers()).filter(c => c.Labels?.['com.docker.compose.project'] === project);
        if (!members.length) throw Object.assign(new v.ValidationError(`no containers in compose project ${project}`), { status: 404 });
        // kontainers and its Docker API container are never touched; the rest only if the action fits.
        const todo = members.filter(c => !views.isSelf(c, me) && (op === 'start' ? c.State !== 'running' : c.State === 'running'));
        const fails: string[] = [];
        for (const c of todo) {
          const n = String(c.Names?.[0] || c.Id).replace(/^\//, '');
          if (locks.has(n) || setAsideOf(n)) { fails.push(`${n}: an update or edit is running`); continue; }
          try { if (op === 'start') await docker.start(c.Id); else if (op === 'stop') await docker.stop(c.Id); else await docker.restart(c.Id); }
          catch (e) { fails.push(`${n}: ${errorMessage(e)}`); }
        }
        const verb = op === 'start' ? 'Started' : op === 'stop' ? 'Stopped' : 'Restarted';
        const msg = `${verb} ${todo.length - fails.length} of ${todo.length} container${todo.length === 1 ? '' : 's'} of ${project}`;
        if (fails.length) throw new v.ValidationError(`${msg}; ${fails.join('; ')}`);
        return `${msg}.`;
      });
    }
    if ((r = /^\/containers\/([^/]+)\/autoupdate$/.exec(p))) {
      const id = r[1];
      return act(s, ip, `/containers/${encodeURIComponent(id)}`, f.on ? 'autoupdate-on' : 'autoupdate-off', id, async () => {
        if (!d.autoUpdates) throw new v.ValidationError('automatic updates are not available');
        await refuseSelf(id);
        return d.autoUpdates.set(id, !!f.on);
      });
    }
    if (p === '/settings/notify') {
      return act(s, ip, '/settings', 'notify-add', null, async () => {
        if (!d.notifier) throw new v.ValidationError('notifications are not available');
        // Checked by address now too, so a target that would never be sent to is refused at once.
        const no = typeof f.url === 'string' && /^https?:\/\//i.test(f.url.trim()) ? await d.notifier.refusal(f.url.trim()).catch(() => null) : null;
        if (no) throw new v.ValidationError(`notifications cannot be sent there: ${no}`);
        const t = d.notifier.add({ kind: f.kind, url: f.url, token: f.token, events: EVENT_KINDS.filter(k => f[`ev_${k}`]) });
        return `Added the ${t.kind} target. Send a test to check that it works.`;
      });
    }
    if (p === '/settings/2fa/start') {
      // A new secret for this session's account, kept here until it is confirmed with a code.
      if (!d.twoFactor) return text('not available\n', 404);
      // Replacing a key that is on needs the password, as turning it off does.
      if (d.twoFactor.enabled(s.user.id)) {
        try { await passwordAgain(s, f.password); } catch (e) { return act(s, ip, '/settings', '2fa-enable', s.user.username, () => { throw e; }); }
      }
      for (const [k, t] of totpSetup) if (t.until < Date.now()) totpSetup.delete(k);
      // A set-up already started in this session (another tab) keeps its key: the one the phone
      // may have scanned already.
      const secret = totpSetup.get(s.idHash)?.secret ?? d.twoFactor.newSecret();
      totpSetup.set(s.idHash, { secret, until: Date.now() + 15 * 60_000 });
      return page(views.twoFactorSetupPage(ctx(s), secret, otpauthUri(secret, s.user.username)));
    }
    if (p === '/settings/2fa/confirm') {
      const pend = totpSetup.get(s.idHash);
      if (!d.twoFactor || !pend || pend.until < Date.now()) {
        const on = d.twoFactor?.enabled(s.user.id);
        return act(s, ip, '/settings', '2fa-enable', s.user.username, () => { throw new v.ValidationError(on ? 'two-factor login is on already (it was set up in another tab or window)' : 'the set-up timed out; start again'); });
      }
      let codes: string[] = [];
      try {
        codes = d.twoFactor.enable(s.user.id, pend.secret, String(f.code || ''));
        codeLimiter.reset(`code:${s.user.username.toLowerCase()}`);
      } catch (e) {
        const msg = errorMessage(e);
        if (errorStatus(e) >= 500) console.error('kontainers: two-factor set-up failed:', e);
        safeAudit(s, '2fa-enable', s.user.username, ip, `failed: ${msg}`);
        return page(views.twoFactorSetupPage({ ...ctx(s), error: msg }, pend.secret, otpauthUri(pend.secret, s.user.username)), errorStatus(e) >= 500 ? 500 : 400);
      }
      totpSetup.delete(s.idHash);
      // Sessions made with the password alone end; this one stays.
      auth.endOtherSessions(s.user.id, s.idHash);
      safeAudit(s, '2fa-enable', s.user.username, ip);
      return page(views.recoveryCodesPage(ctx(s), codes));
    }
    if (p === '/settings/2fa/disable') {
      return act(s, ip, '/settings', '2fa-disable', s.user.username, async () => {
        if (!d.twoFactor) throw new v.ValidationError('not available');
        await passwordAgain(s, f.password);
        d.twoFactor.disable(s.user.id);
        codeLimiter.reset(`code:${s.user.username.toLowerCase()}`);
        return 'Two-factor login is off for your account.';
      });
    }
    if ((r = /^\/settings\/users\/(\d+)\/2fa-reset$/.exec(p))) {
      const id = Number(r[1]);
      return act(s, ip, '/settings', '2fa-reset', auth.listUsers().find(x => x.id === id)?.username ?? String(id), async () => {
        if (!d.twoFactor) throw new v.ValidationError('not available');
        const u = auth.listUsers().find(x => x.id === id);
        if (!u) throw Object.assign(new v.ValidationError('no such user'), { status: 404 });
        if (u.id === s.user.id) throw new v.ValidationError('turn off your own two-factor login with your password, above');
        if (!d.twoFactor.enabled(u.id)) throw new v.ValidationError(`two-factor login is already off for ${u.username}`);
        d.twoFactor.disable(u.id);
        codeLimiter.reset(`code:${u.username.toLowerCase()}`);
        return `Two-factor login is off for ${u.username}; they log in with the password alone until they set it up again.`;
      });
    }
    if (p === '/settings/autoupdate') {
      let target: string | null = null;
      try { target = describeSchedule(validateSchedule({ start: f.start, end: f.end, days: DAY_NAMES.map((_, i) => i).filter(i => f[`day_${i}`]), delayHours: f.delay })); } catch { /* the action says why */ }
      return act(s, ip, '/settings', 'schedule-set', target, async () => {
        if (!d.schedule) throw new v.ValidationError('automatic updates are not available');
        const sched = validateSchedule({ start: f.start, end: f.end, days: DAY_NAMES.map((_, i) => i).filter(i => f[`day_${i}`]), delayHours: f.delay });
        d.schedule.set(sched);
        // Something that waited may be due now.
        void d.autoUpdates?.afterCheck().catch(() => {});
        return `Automatic updates now run ${describeSchedule(sched)}.`;
      });
    }
    if (p === '/settings/registries') {
      // Recorded under the registry it names, never as typed: a token pasted into the wrong field
      // must not end up on the Activity page.
      let target = '(invalid registry)';
      try { target = validateRegistry(f.registry); } catch { /* the action says why */ }
      return act(s, ip, '/settings', 'registry-add', target, async () => {
        if (!d.registries) throw new v.ValidationError('registry logins are not available');
        const l = d.registries.validate({ registry: f.registry, username: f.username, password: f.password });
        // A key file that cannot be used is said before the registry is asked.
        d.registries.ready();
        // Checked before it is saved: a wrong Docker Hub login would make every pull from Docker
        // Hub fail, public images too.
        let note: string;
        try {
          await docker.checkLogin(l.registry, l.username, l.password);
          note = '; the registry accepted it';
        } catch (e) {
          const m = errorMessage(e);
          // A 403 from the daemon that carries the registry's own words ("denied: denied", as GHCR
          // answers a bad token) is the registry refusing; docker-socket-proxy's 403 is a bare page.
          // A 403 with the daemon's own message (anything but HAProxy's bare "Forbidden") is the
          // registry's answer too.
          // The daemon also wraps a registry's 403 in a 500: "failed with status: 403 Forbidden",
          // "unknown: access forbidden".
          const daemon403 = e instanceof DockerError && e.fromDaemon && (errorStatus(e) === 403 || /status: 40[13]\b|\bforbidden\b/i.test(m));
          if (errorStatus(e) === 401 || daemon403 || /unauthorized|incorrect username or password|authentication required|(?<!permission )\bdenied\b/i.test(m)) {
            throw new v.ValidationError(`the registry refused this login, so it was not saved: ${m}`);
          }
          note = errorStatus(e) === 403
            ? '. It could not be checked: the Docker API refused the check (with docker-socket-proxy, set AUTH=1 on it); the next pull uses it'
            : `. It could not be checked (${m}); the next pull uses it`;
        }
        const saved = d.registries.add(l);
        d.registries.noteResult(saved.registry, note.startsWith(';') ? 'accepted when it was saved' : 'saved without a check');
        return `Saved the login for ${saved.registry}${note}.`;
      });
    }
    if ((r = /^\/settings\/registries\/(\d+)\/remove$/.exec(p))) {
      const id = Number(r[1]);
      return act(s, ip, '/settings', 'registry-remove', String(id), async () => {
        if (!d.registries) throw new v.ValidationError('registry logins are not available');
        return `Removed the login for ${d.registries.remove(id)}.`;
      });
    }
    if ((r = /^\/settings\/notify\/(\d+)\/(test|remove)$/.exec(p))) {
      const id = Number(r[1]), op = r[2];
      return act(s, ip, '/settings', `notify-${op}`, String(id), async () => {
        if (!d.notifier) throw new v.ValidationError('notifications are not available');
        if (op === 'remove') { d.notifier.remove(id); return 'Removed the notification target.'; }
        const res = await d.notifier.test(id);
        if (res.startsWith('failed')) throw new v.ValidationError(`the test notification ${res}`);
        return `Test notification ${res}.`;
      });
    }
    if ((r = /^\/containers\/([^/]+)\/(start|stop|restart|unpause|remove)$/.exec(p))) {
      const [, id, op] = r;
      const back = op === 'remove' ? '/containers' : (f.back === 'detail' ? `/containers/${encodeURIComponent(id)}` : '/containers');
      return act(s, ip, back, `container-${op}`, id, async () => {
        if (op !== 'start' && op !== 'unpause') await refuseSelf(id);
        // Stopping or starting a container while it is being replaced would undo the replacement.
        await refuseBusy(id);
        if (op === 'start') { if (!(await docker.start(id))) return `${id} was already running.`; }
        else if (op === 'stop') { if (!(await docker.stop(id))) return `${id} was already stopped.`; }
        else if (op === 'restart') await docker.restart(id);
        else if (op === 'unpause') await docker.unpause(id);
        else {
          const name = String((await docker.inspect(id)).Name || '').replace(/^\//, '');
          await docker.remove(id, false); // not forced: Docker refuses a running container
          d.autoUpdates?.forget(name);
        }
      });
    }

    if (p === '/images/pull') {
      return act(s, ip, '/images', 'image-pull', f.ref ?? null, async () => {
        const ref = v.image(String(f.ref ?? '').trim());
        if (pulls.get(ref)?.state === 'pulling') return `${ref} is already being pulled.`;
        pulls.delete(ref);
        // Wait up to 20 s; a longer pull carries on in the background and the Images page shows it.
        let background = false;
        const job = docker.pull(ref).then(() => { pulls.delete(ref); }, e => {
          if (background) pulls.set(ref, { state: 'failed', error: errorMessage(e), at: Date.now() });
          else pulls.delete(ref);
          throw e;
        });
        pulls.set(ref, { state: 'pulling', at: Date.now() });
        const done = await Promise.race([job.then(() => true), Bun.sleep(20000).then(() => false)]);
        if (done) return `Pulled ${ref}.`;
        background = true;
        job.catch(() => { /* recorded in pulls */ });
        return `Still pulling ${ref}. It is listed below while it runs; reload to see the result.`;
      });
    }
    if (p === '/cleanup/images' || p === '/cleanup/networks' || p === '/cleanup/volumes') {
      const what = p.slice('/cleanup/'.length);
      return act(s, ip, '/cleanup', `cleanup-${what}`, what === 'images' ? (f.scope === 'unused' ? 'unused' : 'dangling') : null, async () => {
        // Worked out again now, from the daemon: never from what the page showed.
        const pl = await cleanup.currentPlan(docker);
        const said = (o: cleanup.Outcome, noun: string, extra = '') =>
          `Removed ${o.removed} ${noun}${o.removed === 1 ? '' : 's'}${extra}${o.kept ? `; kept ${o.kept} the daemon would not remove (${o.errors.join('; ')})` : ''}.`;
        if (what === 'images') {
          const items = f.scope === 'unused' ? [...pl.dangling, ...pl.unusedTagged] : pl.dangling;
          let freed = 0;
          const o = await cleanup.removeAll(items, async i => {
            // Tag by tag (the daemon will not remove a multi-tag image by ID without force); the last
            // tag takes the image with it. One that came into use since is refused by the daemon.
            if (i.tags.length) for (const t of i.tags) await docker.removeImage(t, false);
            else await docker.removeImage(i.id, false);
            freed += i.size;
          }, i => i.tags[0] || i.id.slice(7, 19));
          return said(o, 'image', o.removed ? ` (up to ${(freed / 1e6).toFixed(1)} MB)` : '');
        }
        if (what === 'networks') return said(await cleanup.removeAll(pl.networks, n => docker.removeNetwork(n.id), n => n.name), 'network');
        // Only the ones ticked, and only if they are still unmounted anonymous volumes.
        const chosen = pl.volumes.filter(vol => f[`vol_${vol.name}`]);
        if (!chosen.length) throw new v.ValidationError('choose the volumes to remove; none was selected');
        return said(await cleanup.removeAll(chosen, vol => docker.removeVolume(vol.name), vol => vol.name.slice(0, 12)), 'anonymous volume');
      });
    }
    if (p === '/images/remove') return act(s, ip, '/images', 'image-remove', f.ref ?? null, async () => { await docker.removeImage(f.ref); return `Removed ${f.ref}.`; });

    if (p === '/networks') return act(s, ip, '/networks', 'network-create', f.name ?? null, async () => { await docker.createNetwork(f.name); return `Created network ${f.name}.`; });
    if ((r = /^\/networks\/([^/]+)\/remove$/.exec(p))) { const id = r[1]; return act(s, ip, '/networks', 'network-remove', id, () => docker.removeNetwork(id)); }

    if (p === '/volumes') return act(s, ip, '/volumes', 'volume-create', f.name ?? null, async () => {
      // Docker answers a create for an existing name with that volume, as if it had made it.
      if ((await docker.listVolumes()).some(x => x.Name === f.name)) throw new v.ValidationError(`a volume named ${f.name} already exists`);
      await docker.createVolume(f.name);
      return `Created volume ${f.name}.`;
    });
    if ((r = /^\/volumes\/([^/]+)\/remove$/.exec(p))) { const name = r[1]; return act(s, ip, '/volumes', 'volume-remove', name, () => docker.removeVolume(name)); }

    if (p === '/proxy') {
      return act(s, ip, '/proxy', 'proxy-create', f.hostname ?? null, async () => {
        if (!cfg.proxy.enabled) throw new v.ValidationError('the proxy is off (KONTAINERS_PROXY)');
        const input = { hostname: f.hostname, path: f.path, targetContainer: f.targetContainer, targetPort: f.targetPort, tls: !!f.tls };
        rules.validate(input);
        await refuseProxyTarget(String(f.targetContainer));
        await proxy.attach(String(f.targetContainer));
        const rule = rules.create(input);
        try { await proxy.apply(); } catch (e) { rules.remove(rule.id); await proxy.apply().catch(() => {}); throw e; }
        await proxy.reconcile().catch(() => {});
        return `Added ${rule.hostname}${rule.path === '/' ? '' : rule.path}.`;
      });
    }
    if ((r = /^\/proxy\/(\d+)\/edit$/.exec(p))) {
      const id = Number(r[1]);
      return act(s, ip, '/proxy', 'proxy-edit', String(id), async () => {
        const old = rules.get(id);
        if (!old) throw Object.assign(new v.ValidationError('rule not found'), { status: 404 });
        const input = { hostname: f.hostname, path: f.path, targetContainer: f.targetContainer, targetPort: f.targetPort, tls: !!f.tls };
        rules.validate(input);
        await refuseProxyTarget(String(f.targetContainer));
        await proxy.attach(String(f.targetContainer));
        const updated = rules.update(id, input);
        try {
          await proxy.apply();
        } catch (e) {
          // Put the old rule back so the running proxy and the database agree.
          rules.update(id, { hostname: old.hostname, path: old.path, targetContainer: old.target_container, targetPort: old.target_port, tls: old.tls });
          await proxy.apply().catch(() => {});
          throw e;
        }
        await proxy.reconcile().catch(() => {});
        return `Saved ${updated.hostname}${updated.path === '/' ? '' : updated.path}.`;
      });
    }
    if ((r = /^\/proxy\/(\d+)\/(toggle|remove)$/.exec(p))) {
      const id = Number(r[1]), op = r[2];
      return act(s, ip, '/proxy', `proxy-${op}`, String(id), async () => {
        const rule = rules.get(id);
        if (!rule) throw Object.assign(new v.ValidationError('rule not found'), { status: 404 });
        if (op === 'toggle') rules.setEnabled(id, !rule.enabled); else rules.remove(id);
        await proxy.apply();
        await proxy.reconcile().catch(() => {});
      });
    }

    if (p === '/settings/password') {
      try {
        await passwordAgain(s, f.current);
        await auth.changePassword(s.user.id, f.current, f.next);
      } catch (e) {
        flashes.set(s.idHash, { error: errorMessage(e) });
        return redirect('/settings');
      }
      // changePassword ended every session of this user, including this one: start a new one.
      const { id } = auth.createSession(s.user);
      const fresh = auth.getSession(id)!;
      audit(s, 'password-change', null, ip);
      flashes.set(fresh.idHash, { flash: 'Password changed. Other sessions were logged out.' });
      return redirect('/settings', { 'set-cookie': setCookie(id) });
    }
    if (p === '/settings/users') return act(s, ip, '/settings', 'user-create', f.username ?? null, async () => { const u = await auth.createUser(f.username, f.password); return `Added ${u.username}.`; });
    if ((r = /^\/settings\/users\/(\d+)\/remove$/.exec(p))) { const id = Number(r[1]); return act(s, ip, '/settings', 'user-remove', auth.listUsers().find(x => x.id === id)?.username ?? String(id), () => auth.deleteUser(id, s.user.id)); }

    return text('not found\n', 404);
  }

  async function handle(req: Request, socketIp: string): Promise<Response> {
    // kontainers' container is on the proxy network so that Caddy can reach the targets. The UI must
    // not be served there: any proxy target, typically an internet-facing app, could reach it.
    if (d.proxy?.fromTargetNetwork(socketIp)) return text('kontainers is not served on the proxy network.\n', 403);
    const url = new URL(req.url);
    const p = url.pathname;
    const ip = clientIp(socketIp, req.headers.get('x-forwarded-for'), cfg.trustedProxies);

    // A body over the form limit is refused before anything else, logged in or not, and without
    // reading it; a logged-in user's form gets the page that says why (in routes).
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > MAX_FORM && !auth.getSession(parseCookies(req.headers.get('cookie'))[cookieName])) {
      return text(`${errorMessage(tooLarge(declared))}.\n`, 413, { connection: 'close' });
    }
    if (p === '/healthz') return text('ok\n');
    if (p === '/readyz') {
      let dbOk = false;
      try { db.query('SELECT 1').get(); dbOk = true; } catch { /* reported below */ }
      const ok = dbOk && await docker.ping();
      return text(ok ? 'ready\n' : 'not ready\n', ok ? 200 : 503);
    }

    if (!hostAllowed(req.headers.get('host'), cfg)) {
      return text('This host name is not allowed. Set KONTAINERS_PUBLIC_URL to the address you use.\n', 421);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req, cfg)) return text('cross-origin request refused\n', 403);

    const st = STATIC[p];
    if (st) return new Response(st.body, { headers: { 'content-type': st.type, 'cache-control': 'public, max-age=3600' } });

    if (auth.needsSetup()) {
      if (p === '/setup' && req.method === 'GET') return page(views.setupPage({}));
      if (p === '/setup' && req.method === 'POST') return setup(req, ip);
      return req.method === 'GET' && !p.startsWith('/api/') ? redirect('/setup') : text('setup required\n', 401);
    }
    if (p === '/setup') return redirect('/login');

    const cookieId = parseCookies(req.headers.get('cookie'))[cookieName];
    if (p === '/login/code' && req.method === 'POST') return loginCode(req, ip, cookieId);
    if (p === '/login') {
      if (req.method === 'POST') return login(req, ip, cookieId);
      if (cookieId && auth.getSession(cookieId)) return redirect('/containers');
      return page(views.loginPage({}));
    }

    const s = auth.getSession(cookieId);
    if (!s) return req.method === 'GET' && !p.startsWith('/api/') ? redirect('/login') : text('login required\n', 401);

    try {
      return await routes(req, url, s, ip);
    } catch (e) {
      const status = errorStatus(e);
      if (status >= 500 && !(e instanceof DockerError)) console.error('kontainers: request failed:', e);
      if (req.method === 'GET' && !p.startsWith('/api/')) return page(views.layout('Error', ctx(s), views.html`<p class="error">${errorMessage(e)}</p>`), status);
      return text(errorMessage(e) + '\n', status);
    }
  }

  return async (req, socketIp) => {
    let res: Response;
    try {
      res = await handle(req, socketIp);
    } catch (e) {
      const status = errorStatus(e);
      if (status >= 500) console.error('kontainers: request failed:', e);
      res = text(errorMessage(e) + '\n', status);
    }
    securityHeaders(res.headers, cfg);
    return res;
  };
}
