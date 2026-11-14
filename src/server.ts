// HTTP handling: security gate (Host, Origin, session, CSRF), then routes.
// Pages are server-rendered; state changes are HTML form POSTs that redirect (POST/redirect/GET).

import type { Database } from 'bun:sqlite';
import { readFileSync, unlinkSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { Config } from './config';
import { isLoopback } from './config';
import { Auth, RateLimiter, safeEqual, type Session } from './auth';
import { Docker, DockerError, summarizeStats, type CreateSpec } from './docker';
import type { ProxyManager, RuleStore } from './proxy';
import { snapshot } from './db';
import { updateContainer } from './update';
import { containerStatus, type UpdateChecker } from './updates';
import { STATIC } from './static';
import * as v from './validate';
import * as views from './views';

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

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  if (!ct.startsWith('application/x-www-form-urlencoded')) throw new v.ValidationError('expected a form submission');
  const out: Record<string, string> = {};
  for (const [k, val] of new URLSearchParams(await req.text())) if (!(k in out)) out[k] = val;
  return out;
}

const lines = (s: string | undefined) => (s || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

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
    env: lines(f.env),
    ports: lines(f.ports).map(parsePort),
    volumes: lines(f.volumes).map(parseVolume),
    restart: (f.restart as CreateSpec['restart']) || 'no',
  };
}

function errorStatus(e: unknown): number {
  if (e instanceof v.ValidationError) return e.status;
  if (e instanceof DockerError) return e.status;
  const s = (e as { status?: number })?.status;
  return typeof s === 'number' ? s : 500;
}

function errorMessage(e: unknown): string {
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
  // Pulls that outlived the request (see /images/pull), shown on the Images page.
  const pulls = new Map<string, { state: 'pulling' | 'failed'; error?: string; at: number }>();
  const secure = !!cfg.publicUrl?.startsWith('https:');
  const cookieName = secure ? COOKIE_SECURE : COOKIE_PLAIN;
  const flashes = new Map<string, { flash?: string; error?: string }>();

  const setCookie = (id: string) => `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  const clearCookie = () => `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;

  const audit = (s: Session | null, action: string, target: string | null, ip: string) =>
    db.query('INSERT INTO audit_log (at, username, action, target, ip) VALUES (?, ?, ?, ?, ?)').run(Date.now(), s?.user.username ?? null, action, target, ip);

  function ctx(s: Session): views.PageCtx {
    const f = flashes.get(s.idHash);
    flashes.delete(s.idHash);
    return { user: s.user.username, csrf: s.csrf, flash: f?.flash, error: f?.error, proxyEnabled: cfg.proxy.enabled };
  }

  // kontainers' own container and, under compose, the rest of its project (the socket proxy):
  // stopping or removing one of them from the UI would cut the UI off from Docker or kill it.
  let selfCache: views.SelfInfo | null | undefined;
  async function self(): Promise<views.SelfInfo | null> {
    if (selfCache !== undefined) return selfCache;
    if (!d.selfContainer) return (selfCache = null);
    try {
      const c = await docker.inspect(d.selfContainer);
      selfCache = { id: c.Id, project: c.Config?.Labels?.['com.docker.compose.project'] ?? null };
    } catch (e) {
      if (e instanceof DockerError && e.status === 404) selfCache = null; // not a container after all
      else return null; // daemon unreachable: try again on the next request
    }
    return selfCache ?? null;
  }
  const updateView = (): views.UpdateView | null => d.updates
    ? { get: (ref: string) => d.updates!.get(ref), lastRun: d.updates.lastRun, scheduled: cfg.updateCheckHours > 0 ? cfg.updateCheckHours : null }
    : null;

  async function refuseSelf(id: string): Promise<void> {
    const me = await self();
    if (!me) return;
    if (views.isSelf(await docker.inspect(id), me)) {
      throw new v.ValidationError('this is kontainers itself, or part of its compose project; stopping or removing it here would cut off this page. Manage it on the host with docker compose or docker');
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
  async function refuseProxyTarget(name: string): Promise<void> {
    const no = await proxyTargetRefusal(name);
    if (no) throw new v.ValidationError(no.reason);
  }

  // Runs a state change, stores the outcome as a flash message, redirects back.
  async function act(s: Session, ip: string, back: string, action: string, target: string | null, fn: () => Promise<string | void> | string | void): Promise<Response> {
    try {
      const msg = await fn();
      audit(s, action, target, ip);
      flashes.set(s.idHash, { flash: msg || 'Done.' });
    } catch (e) {
      if (errorStatus(e) >= 500 && !(e instanceof DockerError)) console.error(`kontainers: ${action} failed:`, e);
      flashes.set(s.idHash, { error: errorMessage(e) });
    }
    return redirect(back);
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
      audit(null, 'login-failed', user, ip);
      return page(views.loginPage({ username: typed, error: 'Wrong username or password.' }), 401);
    }
    limiter.reset(`user:${user}`);
    ipLimiter.reset(`ip:${ip}`);
    const old = cookieId ? auth.getSession(cookieId) : null;
    if (old) auth.destroySession(old.idHash); // never reuse a session id across a login
    const { id } = auth.createSession(u);
    audit({ user: u, csrf: '', idHash: '' }, 'login', null, ip);
    return redirect('/containers', { 'set-cookie': setCookie(id) });
  }

  async function setup(req: Request, ip: string): Promise<Response> {
    const f = await readForm(req);
    const wait = limiter.blocked(`setup:${ip}`);
    if (wait > 0) return page(views.setupPage({ error: 'Too many attempts. Try again later.' }), 429, { 'retry-after': String(wait) });
    try {
      const u = await auth.setup(f.token, f.username, f.password);
      const { id } = auth.createSession(u);
      audit({ user: u, csrf: '', idHash: '' }, 'setup', null, ip);
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
      if (p === '/containers') return page(views.containersPage(ctx(s), await docker.listContainers(), await self(), updateView()));
      if (p === '/containers/new') return page(views.newContainerPage(ctx(s), cfg.allowBindMounts));
      if ((r = /^\/containers\/([^/]+)$/.exec(p))) return page(views.containerPage(ctx(s), await docker.inspect(r[1]), await self(), updateView()));
      if ((r = /^\/api\/containers\/([^/]+)\/stats$/.exec(p))) {
        return new Response(JSON.stringify(summarizeStats(await docker.stats(r[1]))), { headers: { 'content-type': 'application/json' } });
      }
      if ((r = /^\/api\/containers\/([^/]+)\/logs$/.exec(p))) return text(await docker.logs(r[1], v.intInRange(url.searchParams.get('tail'), 1, 10000, 200)));
      if (p === '/images') {
        for (const [k, j] of pulls) if (j.state === 'failed' && Date.now() - j.at > 30 * 60 * 1000) pulls.delete(k);
        return page(views.imagesPage(ctx(s), await docker.listImages(), [...pulls].map(([ref, j]) => ({ ref, ...j }))));
      }
      if (p === '/networks') return page(views.networksPage(ctx(s), await docker.listNetworks()));
      if (p === '/volumes') return page(views.volumesPage(ctx(s), await docker.listVolumes()));
      if (p === '/proxy') {
        const list = rules.list();
        const status = (r: (typeof list)[number]) => ({
          target: proxy.targetState.get(r.target_container) ?? null,
          cert: r.tls ? proxy.certificate(r.hostname) : null,
          refused: proxy.refusalFor(r.target_container),
        });
        return page(views.proxyPage(ctx(s), list, { running: proxy.running, lastError: proxy.lastError }, status));
      }
      if ((r = /^\/proxy\/(\d+)\/edit$/.exec(p))) {
        const rule = rules.get(Number(r[1]));
        return rule ? page(views.editRulePage(ctx(s), rule)) : text('rule not found\n', 404);
      }
      if (p === '/settings') return page(views.settingsPage(ctx(s), auth.listUsers(), s.user.id));
      if (p === '/api/backup') { audit(s, 'backup', null, ip); return backup(); }
      return text('not found\n', 404);
    }

    if (m !== 'POST') return text('method not allowed\n', 405, { allow: 'GET, POST' });

    const f = await readForm(req);
    if (typeof f._csrf !== 'string' || !safeEqual(f._csrf, s.csrf)) return text('invalid or missing CSRF token\n', 403);

    if (p === '/logout') {
      auth.destroySession(s.idHash);
      audit(s, 'logout', null, ip);
      return redirect('/login', { 'set-cookie': clearCookie() });
    }

    if (p === '/containers') {
      return act(s, ip, '/containers', 'container-create', f.name || f.image || null, async () => {
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
        return `Created ${spec.name || Id.slice(0, 12)}.`;
      });
    }
    if ((r = /^\/containers\/([^/]+)\/update$/.exec(p))) {
      const id = r[1];
      // The container gets a new ID, so return to the list.
      return act(s, ip, '/containers', 'container-update', id, async () => {
        await refuseSelf(id);
        const ref = (await docker.inspect(id)).Config?.Image;
        const msg = await updateContainer(docker, id);
        if (ref && d.updates) await d.updates.check(ref).catch(() => {});
        return msg;
      });
    }
    if (p === '/updates/check') {
      return act(s, ip, '/containers', 'update-check', null, async () => {
        if (!d.updates) throw new v.ValidationError('update checks are not available');
        const n = await d.updates.checkAll();
        const available = n === 0 ? 0 : (await docker.listContainers()).filter(c => containerStatus(d.updates!.get(c.Image), c.ImageID)?.status === 'available').length;
        return `Checked ${n} image${n === 1 ? '' : 's'}: ${available === 0 ? 'every container runs the newest image for its tag' : `${available} container${available === 1 ? ' has' : 's have'} a newer image`}.`;
      });
    }
    if ((r = /^\/containers\/([^/]+)\/(start|stop|restart|unpause|remove)$/.exec(p))) {
      const [, id, op] = r;
      const back = op === 'remove' ? '/containers' : (f.back === 'detail' ? `/containers/${encodeURIComponent(id)}` : '/containers');
      return act(s, ip, back, `container-${op}`, id, async () => {
        if (op !== 'start' && op !== 'unpause') await refuseSelf(id);
        if (op === 'start') await docker.start(id);
        else if (op === 'stop') await docker.stop(id);
        else if (op === 'restart') await docker.restart(id);
        else if (op === 'unpause') await docker.unpause(id);
        else await docker.remove(id, false); // not forced: Docker refuses a running container
      });
    }

    if (p === '/images/pull') {
      return act(s, ip, '/images', 'image-pull', f.ref ?? null, async () => {
        const ref = v.image(f.ref);
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
    if (p === '/images/remove') return act(s, ip, '/images', 'image-remove', f.ref ?? null, async () => { await docker.removeImage(f.ref); return `Removed ${f.ref}.`; });

    if (p === '/networks') return act(s, ip, '/networks', 'network-create', f.name ?? null, async () => { await docker.createNetwork(f.name); return `Created network ${f.name}.`; });
    if ((r = /^\/networks\/([^/]+)\/remove$/.exec(p))) { const id = r[1]; return act(s, ip, '/networks', 'network-remove', id, () => docker.removeNetwork(id)); }

    if (p === '/volumes') return act(s, ip, '/volumes', 'volume-create', f.name ?? null, async () => { await docker.createVolume(f.name); return `Created volume ${f.name}.`; });
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
    if ((r = /^\/settings\/users\/(\d+)\/remove$/.exec(p))) { const id = Number(r[1]); return act(s, ip, '/settings', 'user-remove', String(id), () => auth.deleteUser(id, s.user.id)); }

    return text('not found\n', 404);
  }

  async function handle(req: Request, socketIp: string): Promise<Response> {
    // kontainers' container is on the proxy network so that Caddy can reach the targets. The UI must
    // not be served there: any proxy target, typically an internet-facing app, could reach it.
    if (d.proxy?.fromTargetNetwork(socketIp)) return text('kontainers is not served on the proxy network.\n', 403);
    const url = new URL(req.url);
    const p = url.pathname;
    const ip = clientIp(socketIp, req.headers.get('x-forwarded-for'), cfg.trustedProxies);

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
