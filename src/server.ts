// HTTP handling: security gate (Host, Origin, session, CSRF), then routes.
// Pages are server-rendered; state changes are HTML form POSTs that redirect (POST/redirect/GET).

import type { Database } from 'bun:sqlite';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config';
import { isLoopback } from './config';
import { Auth, RateLimiter, safeEqual, type Session } from './auth';
import { Docker, DockerError, type CreateSpec } from './docker';
import type { ProxyManager, RuleStore } from './proxy';
import { snapshot } from './db';
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
}

export type Handler = (req: Request, socketIp: string) => Promise<Response>;

const COOKIE_PLAIN = 'kontainers_session';
const COOKIE_SECURE = '__Host-kontainers_session'; // __Host- requires Secure, Path=/ and no Domain

// --- small helpers -----------------------------------------------------------

export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
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
  let host: string;
  try { host = new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, ''); } catch { return false; }
  if (cfg.publicUrl) {
    if (host === new URL(cfg.publicUrl).hostname.replace(/^\[|\]$/g, '')) return true;
    return isLoopback(host); // health checks and SSH tunnels still work
  }
  return isLoopback(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^[0-9a-f:]+$/i.test(host);
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

export function containerSpec(f: Record<string, string>): CreateSpec {
  return {
    image: f.image?.trim(),
    name: f.name?.trim() || undefined,
    cmd: f.cmd?.trim() ? f.cmd.trim().split(/\s+/) : undefined,
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
  const limiter = d.limiter ?? new RateLimiter();
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
    const keys = [`ip:${ip}`, `user:${user}`];
    const wait = limiter.blocked(...keys);
    if (wait > 0) return page(views.loginPage({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minutes.` }), 429, { 'retry-after': String(wait) });
    const u = await auth.verifyLogin(f.username, f.password);
    if (!u) {
      limiter.fail(...keys);
      audit(null, 'login-failed', user, ip);
      return page(views.loginPage({ error: 'Wrong username or password.' }), 401);
    }
    limiter.reset(...keys);
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
      return page(views.setupPage({ error: errorMessage(e) }), errorStatus(e));
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
      if (p === '/containers') return page(views.containersPage(ctx(s), await docker.listContainers()));
      if (p === '/containers/new') return page(views.newContainerPage(ctx(s), cfg.allowBindMounts));
      if ((r = /^\/containers\/([^/]+)$/.exec(p))) return page(views.containerPage(ctx(s), await docker.inspect(r[1])));
      if ((r = /^\/api\/containers\/([^/]+)\/logs$/.exec(p))) return text(await docker.logs(r[1], v.intInRange(url.searchParams.get('tail'), 1, 10000, 200)));
      if (p === '/images') return page(views.imagesPage(ctx(s), await docker.listImages()));
      if (p === '/networks') return page(views.networksPage(ctx(s), await docker.listNetworks()));
      if (p === '/volumes') return page(views.volumesPage(ctx(s), await docker.listVolumes()));
      if (p === '/proxy') return page(views.proxyPage(ctx(s), rules.list(), { running: proxy.running, lastError: proxy.lastError }));
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
        if (f.start) await docker.start(Id);
        return `Created ${spec.name || Id.slice(0, 12)}.`;
      });
    }
    if ((r = /^\/containers\/([^/]+)\/(start|stop|restart|remove)$/.exec(p))) {
      const [, id, op] = r;
      const back = op === 'remove' ? '/containers' : (f.back === 'detail' ? `/containers/${encodeURIComponent(id)}` : '/containers');
      return act(s, ip, back, `container-${op}`, id, async () => {
        if (op === 'start') await docker.start(id);
        else if (op === 'stop') await docker.stop(id);
        else if (op === 'restart') await docker.restart(id);
        else await docker.remove(id, true);
      });
    }

    if (p === '/images/pull') return act(s, ip, '/images', 'image-pull', f.ref ?? null, async () => { await docker.pull(f.ref); return `Pulled ${f.ref}.`; });
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
        await proxy.attach(String(f.targetContainer));
        const rule = rules.create(input);
        try { await proxy.apply(); } catch (e) { rules.remove(rule.id); await proxy.apply().catch(() => {}); throw e; }
        return `Added ${rule.hostname}${rule.path === '/' ? '' : rule.path}.`;
      });
    }
    if ((r = /^\/proxy\/(\d+)\/(toggle|remove)$/.exec(p))) {
      const id = Number(r[1]), op = r[2];
      return act(s, ip, '/proxy', `proxy-${op}`, String(id), async () => {
        const rule = rules.get(id);
        if (!rule) throw Object.assign(new v.ValidationError('rule not found'), { status: 404 });
        if (op === 'toggle') rules.setEnabled(id, !rule.enabled); else rules.remove(id);
        await proxy.apply();
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
