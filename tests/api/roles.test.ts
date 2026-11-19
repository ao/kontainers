// Read-only accounts against the real server: what they may see, that every change is refused,
// and the role changes and their limits. Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, PW, readyServer, runMain, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const NAME = `ro-web-${run}`;
const api = (path: string, init: RequestInit = {}) => fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
const inspect = async (name: string) => (await (await api(`/containers/${name}/json`)).json()) as any;

describe.skipIf(!DOCKER)('read-only accounts', () => {
  let srv: Running, admin: Client, reader: Client, readerId = 0;
  const login = async (user: string, pw = PW) => { const c = new Client(srv.base); expect((await c.post('/login', { username: user, password: pw }, { csrf: false })).status).toBe(303); return c; };

  beforeAll(async () => {
    ({ srv, c: admin } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' }));
    await admin.page('/containers');
    expect((await admin.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: 'on', cmd: 'sleep 600', start: 'on' })).error).toBe('');
    await admin.page('/settings');
    expect((await admin.submit('/settings/users', { username: 'reader', password: PW, role: 'viewer' })).flash).toBe('Added reader, read-only.');
    readerId = Number(/action="\/settings\/users\/(\d+)\/role"/.exec(await admin.page('/settings'))![1]);
    reader = await login('reader');
  }, 120000);
  afterAll(async () => { await api(`/containers/${NAME}?force=1`, { method: 'DELETE' }); await srv?.stop(); });

  test('it sees the pages and the logs, without the controls', async () => {
    for (const p of ['/containers', `/containers/${NAME}`, '/images', '/networks', '/volumes', '/activity', '/settings', '/cleanup']) {
      const res = await reader.get(p);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body.match(/<form method="post" action="([^"]+)"/g)?.filter(f => !/\/logout"|\/settings\/password"|\/settings\/2fa\//.test(f)) ?? []).toEqual([]);
    }
    expect((await reader.get(`/api/containers/${NAME}/logs`)).status).toBe(200);
    expect(await reader.page('/settings')).not.toContain('admin</td>');
  });

  test('every change is refused, and nothing changes', async () => {
    const page = await reader.page('/settings');
    const csrf = /name="_csrf" value="([^"]+)"/.exec(page)![1];
    reader.csrf = csrf;
    const tries: [string, Record<string, string>][] = [
      [`/containers/${NAME}/stop`, {}], [`/containers/${NAME}/remove`, {}], [`/containers/${NAME}/update`, {}], [`/containers/${NAME}/autoupdate`, { on: 'on' }],
      ['/containers', { image: 'busybox:1.36', name: `ro-x-${run}` }], ['/updates/check', {}], ['/images/pull', { image: 'busybox:1.36' }], ['/networks', { name: `ro-n-${run}` }],
      ['/volumes', { name: `ro-v-${run}` }], ['/settings/users', { username: 'mallory', password: PW }], [`/settings/users/${readerId}/role`, { role: 'admin' }],
      ['/settings/notify', { kind: 'ntfy', url: 'https://ntfy.sh/x' }], ['/settings/registries', { registry: 'ghcr.io', username: 'u', password: 'p' }],
      ['/settings/autoupdate', { start: '', end: '' }], ['/projects/x/update', {}], ['/cleanup/volumes', {}], ['/proxy', { hostname: 'a.test', targetContainer: NAME, targetPort: '80' }],
    ];
    for (const [p, form] of tries) {
      const res = await reader.post(p, form);
      expect([p, res.status]).toEqual([p, 403]);
    }
    expect((await inspect(NAME)).State.Running).toBe(true);
    expect(await admin.page('/settings')).not.toContain('mallory');
    expect((await reader.get('/api/backup')).status).toBe(403);
    expect((await reader.get('/containers/new')).status).toBe(403);
    expect((await reader.get(`/containers/${NAME}/edit`)).status).toBe(403);
    expect(await admin.page('/activity?q=read-only')).toContain('was refused, as a read-only account,');
  });

  test('its own password it can change', async () => {
    await reader.page('/settings');
    const r = await reader.submit('/settings/password', { current: PW, next: `${PW} 2` });
    expect(r.status).toBe(303);
    reader = await login('reader', `${PW} 2`);
  });

  test('an administrator changes the role; the last administrator stays one', async () => {
    await admin.page('/settings');
    const r = await admin.submit(`/settings/users/${readerId}/role`, { role: 'admin' });
    expect(r.flash).toBe('reader is an administrator now; its sessions were ended.');
    expect((await reader.get('/containers')).status).toBe(303); // logged out
    reader = await login('reader', `${PW} 2`);
    expect(await reader.page(`/containers/${NAME}`)).toContain(`action="/containers/${NAME}/stop"`);
    // Back to read-only from the command line; then the only administrator cannot be made read-only.
    const out = await runMain(['set-role', 'reader', 'viewer'], { KONTAINERS_DATA: srv.dataDir });
    expect(out.out).toContain('reader is read-only now');
    const adminId = Number(/<tr><td>admin<\/td>/.test(await admin.page('/settings')) ? 1 : 0);
    expect(adminId).toBe(1);
    const cli = await runMain(['set-role', 'admin', 'viewer'], { KONTAINERS_DATA: srv.dataDir });
    expect(cli.code).toBe(1);
    expect(cli.out).toContain('cannot make the last administrator read-only');
    expect((await admin.submit(`/settings/users/1/role`, { role: 'viewer' })).error).toContain('your own role');
  });
});
