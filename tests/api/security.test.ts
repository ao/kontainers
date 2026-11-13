// Auth, sessions, CSRF, rate limiting, headers and bind safety, against the real server process.
// None of these need a Docker daemon.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, PW, readyServer, runMain, startServer, type Running } from './helpers';

describe('before setup', () => {
  let srv: Running;
  beforeAll(async () => { srv = await startServer(); });
  afterAll(() => srv.stop());

  test('prints a setup token and no default credentials', () => {
    expect(srv.setupToken).toMatch(/^[A-Za-z0-9_-]{24,}$/);
    expect(srv.output()).not.toMatch(/password[:=]/i);
  });

  test('health is public, everything else is closed', async () => {
    const c = new Client(srv.base);
    expect((await c.get('/healthz')).status).toBe(200);
    for (const p of ['/', '/containers', '/images', '/proxy', '/settings', '/login']) {
      const r = await c.get(p);
      expect(r.status).toBe(303);
      expect(r.headers.get('location')).toBe('/setup');
    }
    for (const p of ['/api/backup', '/api/containers/x/logs']) expect((await c.get(p)).status).toBe(401);
    expect((await c.post('/containers', { image: 'alpine' })).status).toBe(401);
    expect((await c.post('/register', { username: 'x', password: PW })).status).toBe(401);
  });

  test('setup with a wrong token fails and creates nothing', async () => {
    const c = new Client(srv.base);
    const r = await c.post('/setup', { token: 'wrong', username: 'admin', password: PW }, { csrf: false });
    expect(r.status).toBe(403);
    expect(c.cookies.size).toBe(0);
    expect((await c.get('/containers')).headers.get('location')).toBe('/setup');
  });

  test('setup from another origin is refused', async () => {
    const c = new Client(srv.base);
    const r = await c.post('/setup', { token: srv.setupToken!, username: 'admin', password: PW }, { csrf: false, headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
    expect(r.status).toBe(403);
  });

  test('setup works once, then is closed', async () => {
    const c = new Client(srv.base);
    const r = await c.post('/setup', { token: srv.setupToken!, username: 'admin', password: PW }, { csrf: false });
    expect(r.status).toBe(303);
    expect(c.cookies.size).toBe(1);
    const again = await new Client(srv.base).post('/setup', { token: srv.setupToken!, username: 'evil', password: PW }, { csrf: false });
    expect(again.status).toBe(303);
    expect(again.headers.get('location')).toBe('/login');
    expect(srv.output()).toContain('setup is closed');
  });
});

describe('with an account', () => {
  let srv: Running, c: Client;
  beforeAll(async () => ({ srv, c } = await readyServer()));
  afterAll(() => srv.stop());

  test('pages need a session', async () => {
    const anon = new Client(srv.base);
    expect((await anon.get('/containers')).headers.get('location')).toBe('/login');
    expect((await anon.get('/api/backup')).status).toBe(401);
    expect((await anon.post('/settings/users', { username: 'x', password: PW }, { csrf: false })).status).toBe(401);
  });

  test('forged or stolen-looking cookies do not work', async () => {
    const anon = new Client(srv.base);
    anon.cookies.set('kontainers_session', 'A'.repeat(43));
    expect((await anon.get('/containers')).status).toBe(303);
    anon.cookies.set('kontainers_session', "' OR '1'='1");
    expect((await anon.get('/containers')).status).toBe(303);
  });

  test('session cookie flags', async () => {
    const x = new Client(srv.base);
    const r = await x.post('/login', { username: 'admin', password: PW }, { csrf: false });
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^kontainers_session=[A-Za-z0-9_-]{40,};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure'); // plain HTTP on loopback; see the HTTPS test below
  });

  test('login replaces any existing session id (no fixation)', async () => {
    const x = new Client(srv.base);
    await x.post('/login', { username: 'admin', password: PW }, { csrf: false });
    const first = x.cookies.get('kontainers_session')!;
    await x.post('/login', { username: 'admin', password: PW }, { csrf: false });
    const second = x.cookies.get('kontainers_session')!;
    expect(second).not.toBe(first);
    const old = new Client(srv.base);
    old.cookies.set('kontainers_session', first);
    expect((await old.get('/containers')).status).toBe(303);
  });

  test('state changes need the CSRF token', async () => {
    const before = await c.page('/settings');
    expect(before).toContain('admin');
    expect((await c.post('/settings/users', { username: 'nocsrf', password: PW }, { csrf: false })).status).toBe(403);
    expect((await c.post('/settings/users', { username: 'badcsrf', password: PW, _csrf: 'x'.repeat(43) }, { csrf: false })).status).toBe(403);
    expect(await c.page('/settings')).not.toContain('nocsrf');
  });

  test('cross-origin posts are refused even with a valid token and cookie', async () => {
    await c.page('/settings');
    for (const headers of <Record<string, string>[]>[{ origin: 'https://evil.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
      const r = await c.post('/settings/users', { username: 'xsite', password: PW }, { headers });
      expect(r.status).toBe(403);
    }
    expect(await c.page('/settings')).not.toContain('xsite');
  });

  test('DNS rebinding: unknown Host names are refused', async () => {
    const r = await fetch(srv.base + '/login', { headers: { host: 'rebind.attacker.test' } });
    expect(r.status).toBe(421);
    const ok = await fetch(srv.base + '/login', { headers: { host: `localhost:${srv.port}` } });
    expect(ok.status).toBe(200);
  });

  test('wrong password and unknown user look the same', async () => {
    const a = await new Client(srv.base).post('/login', { username: 'admin', password: 'definitely wrong' }, { csrf: false });
    const b = await new Client(srv.base).post('/login', { username: 'nosuchuser', password: 'definitely wrong' }, { csrf: false });
    expect(a.status).toBe(b.status);
    const [ta, tb] = [await a.text(), await b.text()];
    expect(ta).toBe(tb);
  });

  test('security headers on every response', async () => {
    for (const p of ['/containers', '/login', '/healthz', '/static/app.js', '/nope']) {
      const r = await c.get(p);
      expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('x-frame-options')).toBe('DENY');
      // no-referrer would make browsers send "Origin: null" on our own form posts (see tests/e2e).
      expect(r.headers.get('referrer-policy')).toBe('same-origin');
    }
    expect((await c.get('/settings')).headers.get('cache-control')).toBe('no-store');
  });

  test('user names are escaped in pages', async () => {
    const r = await c.submit('/settings/users', { username: '<script>', password: PW });
    expect(r.error).toContain('invalid username');
    expect(r.body).not.toContain('<script>');
  });

  test('add a user, they can log in; remove them, their session ends', async () => {
    expect((await c.submit('/settings/users', { username: 'second', password: PW })).flash).toContain('Added second');
    const s = new Client(srv.base);
    expect((await s.post('/login', { username: 'second', password: PW }, { csrf: false })).status).toBe(303);
    expect((await s.get('/containers')).status).not.toBe(303);
    const page = await c.page('/settings');
    const id = /\/settings\/users\/(\d+)\/remove/.exec(page)![1];
    expect((await c.submit(`/settings/users/${id}/remove`, {})).flash).toBe('Done.');
    expect((await s.get('/settings')).status).toBe(303);
  });

  test('password change logs out other sessions and keeps this one', async () => {
    const other = new Client(srv.base);
    await other.post('/login', { username: 'admin', password: PW }, { csrf: false });
    await c.page('/settings');
    const r = await c.submit('/settings/password', { current: PW, next: 'a brand new password' });
    expect(r.flash).toContain('Password changed');
    expect((await other.get('/settings')).status).toBe(303);
    expect((await c.get('/settings')).status).toBe(200);
    await c.page('/settings');
    expect((await c.submit('/settings/password', { current: 'a brand new password', next: PW })).flash).toContain('Password changed');
  });

  test('logout revokes the session server-side', async () => {
    const x = new Client(srv.base);
    await x.post('/login', { username: 'admin', password: PW }, { csrf: false });
    const id = x.cookies.get('kontainers_session')!;
    await x.page('/settings');
    const r = await x.post('/logout', {});
    expect(r.status).toBe(303);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    const replay = new Client(srv.base);
    replay.cookies.set('kontainers_session', id);
    expect((await replay.get('/settings')).status).toBe(303);
  });

  test('backup download is a SQLite file', async () => {
    const r = await c.get('/api/backup');
    expect(r.status).toBe(200);
    const b = new Uint8Array(await r.arrayBuffer());
    expect(new TextDecoder().decode(b.slice(0, 15))).toBe('SQLite format 3');
  });

  test('non-form bodies and unknown methods are rejected', async () => {
    await c.page('/settings');
    const r = await fetch(srv.base + '/settings/users', { method: 'POST', headers: { ...c.headers(), 'content-type': 'application/json' }, body: JSON.stringify({ username: 'j', password: PW, _csrf: c.csrf }) });
    expect(r.status).toBe(400);
    expect((await fetch(srv.base + '/settings', { method: 'PUT', headers: c.headers() })).status).toBe(405);
  });
});

describe('login rate limiting', () => {
  test('6th failure is 429; spoofed X-Forwarded-For neither resets nor dodges it', async () => {
    const { srv } = await readyServer();
    try {
      const x = new Client(srv.base);
      const bad = (xff: string) => x.post('/login', { username: 'victim', password: 'wrong password!!' }, { csrf: false, headers: { 'x-forwarded-for': xff } });
      for (let i = 0; i < 5; i++) expect((await bad(`10.9.9.${i}`)).status).toBe(401);
      const r = await bad('10.9.9.200');
      expect(r.status).toBe(429);
      expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
      // The limit is on the socket address too, so the correct password for another account is also held off.
      const right = await new Client(srv.base).post('/login', { username: 'admin', password: PW }, { csrf: false, headers: { 'x-forwarded-for': '1.2.3.4' } });
      expect(right.status).toBe(429);
      expect(srv.output()).not.toContain('wrong password!!');
    } finally { await srv.stop(); }
  });

  test('with a trusted proxy, limits are per forwarded client', async () => {
    const { srv } = await readyServer({ KONTAINERS_TRUSTED_PROXIES: '127.0.0.1' });
    try {
      const x = new Client(srv.base);
      for (let i = 0; i < 5; i++) await x.post('/login', { username: `u${i}`, password: 'wrong password!!' }, { csrf: false, headers: { 'x-forwarded-for': '203.0.113.7' } });
      expect((await x.post('/login', { username: 'u9', password: 'wrong password!!' }, { csrf: false, headers: { 'x-forwarded-for': '203.0.113.7' } })).status).toBe(429);
      expect((await x.post('/login', { username: 'admin', password: PW }, { csrf: false, headers: { 'x-forwarded-for': '203.0.113.8' } })).status).toBe(303);
    } finally { await srv.stop(); }
  });
});

describe('HTTPS deployment', () => {
  test('behind TLS the cookie is __Host- and Secure, and HSTS is sent', async () => {
    const srv = await startServer({ KONTAINERS_PUBLIC_URL: 'https://k.example.com' });
    try {
      const c = new Client(srv.base);
      const r = await c.post('/setup', { token: srv.setupToken!, username: 'admin', password: PW }, { csrf: false });
      const cookie = r.headers.get('set-cookie')!;
      expect(cookie).toMatch(/^__Host-kontainers_session=/);
      expect(cookie).toContain('Secure');
      expect(r.headers.get('strict-transport-security')).toContain('max-age=');
    } finally { await srv.stop(); }
  });
});

describe('bind safety', () => {
  test('a wildcard bind over plain HTTP exits non-zero', async () => {
    const r = await runMain([], { KONTAINERS_LISTEN: '0.0.0.0:18080', KONTAINERS_DATA: '/tmp/k-bind-test' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('refusing to listen');
  });
  test('unknown commands exit 2', async () => {
    expect((await runMain(['nope'], { KONTAINERS_DATA: '/tmp/k-bind-test' })).code).toBe(2);
  });
});

describe('restarts', () => {
  test('accounts survive a restart and setup stays closed', async () => {
    const { srv } = await readyServer();
    const dir = srv.dataDir;
    await srv.stop();
    const again = await startServer({}, dir);
    try {
      expect(again.setupToken).toBeNull();
      const c = new Client(again.base);
      expect((await c.get('/setup')).headers.get('location')).toBe('/login');
      expect((await c.post('/login', { username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
    } finally { await again.stop(); }
  });

  test('backup command writes a snapshot and refuses to overwrite', async () => {
    const { srv } = await readyServer();
    await srv.stop();
    const out = `${srv.dataDir}/snap.db`;
    const env = { KONTAINERS_DATA: srv.dataDir };
    expect((await runMain(['backup', out], env)).code).toBe(0);
    expect((await runMain(['backup', out], env)).code).toBe(1);
    expect((await runMain(['backup'], env)).code).toBe(2);
  });

  test('restore: a snapshot copied in as kontainers.db brings the accounts back (README procedure)', async () => {
    const { srv } = await readyServer();
    const snap = `${srv.dataDir}/snap.db`;
    expect((await runMain(['backup', snap], { KONTAINERS_DATA: srv.dataDir })).code).toBe(0);
    await srv.stop();
    const fresh = (await import('node:fs')).mkdtempSync('/tmp/kontainers-restore-');
    (await import('node:fs')).copyFileSync(snap, `${fresh}/kontainers.db`);
    const restored = await startServer({}, fresh);
    try {
      expect(restored.setupToken).toBeNull();
      expect((await new Client(restored.base).post('/login', { username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
    } finally { await restored.stop(); }
  });
});
