// Editing a container kontainers created, which recreates it, against a real daemon.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run; skipped otherwise.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const NAME = `k-${run}-edit`, VOL = `kedit-${run}`, COMPOSED = `k-${run}-composed`, AUTO = `k-${run}-auto`;

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
}
const inspect = async (name: string) => (await (await api(`/containers/${name}/json`)).json()) as any;

describe.skipIf(!DOCKER)('edit and recreate', () => {
  let srv: Running, c: Client;
  beforeAll(async () => {
    ({ srv, c } = await readyServer());
    await c.page('/images');
    expect((await c.submit('/images/pull', { ref: 'busybox:1.36' })).error).toBe('');
  });
  afterAll(async () => {
    for (const n of [NAME, COMPOSED, AUTO]) await api(`/containers/${n}?force=1`, { method: 'DELETE' });
    await api(`/volumes/${VOL}`, { method: 'DELETE' });
    await srv.stop();
  });

  test('the form shows the current settings', async () => {
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: 'sh -c "echo it\'s up; sleep 600"', env: 'A=1\nQUOTE=a "b" c', ports: '18991:80', volumes: `${VOL}:/data`, restart: 'unless-stopped', start: 'on' })).error).toBe('');
    const page = await c.page(`/containers/${NAME}/edit`);
    expect(page).toContain('value="busybox:1.36"');
    expect(page).toContain('value="sh -c &#39;echo it&#39;\\&#39;&#39;s up; sleep 600&#39;"');
    expect(page).toContain('127.0.0.1:18991:80</textarea>');
    expect(page).toContain('A=1\nQUOTE=a &quot;b&quot; c</textarea>');
    expect(page).toContain(`${VOL}:/data</textarea>`);
    expect(page).toContain('<option selected>unless-stopped</option>');
  });

  test('saving recreates the container with the new settings and keeps its volume', async () => {
    const before = await inspect(NAME);
    const r = await c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', cmd: 'sleep 600', env: 'A=2\nB=3', ports: '18992:80\n[::1]:18993:81/udp', volumes: `${VOL}:/data:ro`, restart: 'always' });
    expect(r.error).toBe('');
    expect(r.flash).toBe(`Saved the settings of ${NAME}; it was recreated.`);
    const after = await inspect(NAME);
    expect(after.Id).not.toBe(before.Id);
    expect(after.State.Running).toBe(true);
    expect(after.Config.Cmd).toEqual(['sleep', '600']);
    expect(after.Config.Env).toEqual(expect.arrayContaining(['A=2', 'B=3']));
    expect(after.Config.Env).not.toContain('A=1');
    expect(after.HostConfig.PortBindings['80/tcp']).toEqual([{ HostIp: '127.0.0.1', HostPort: '18992' }]);
    expect(after.HostConfig.PortBindings['81/udp']).toEqual([{ HostIp: '::1', HostPort: '18993' }]);
    expect(after.HostConfig.RestartPolicy.Name).toBe('always');
    expect(after.Mounts[0]).toMatchObject({ Type: 'volume', Name: VOL, Destination: '/data', RW: false });
    expect((await api(`/containers/${before.Id}/json`)).status).toBe(404);
    // The page it lands on is the new container's.
    expect(r.body).toContain(`<h1>${NAME}</h1>`);
    // Linked by name, so this page still works after the recreation it just did.
    expect(r.body).toContain(`data-logs="/api/containers/${NAME}/logs"`);
    expect((await c.get(`/api/containers/${NAME}/logs?tail=5`)).status).toBe(200);
  });

  test('settings that make the container stop at once are rolled back', async () => {
    const before = await inspect(NAME);
    const r = await c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', cmd: 'sh -c "exit 7"', env: 'A=9', ports: '', volumes: '', restart: 'no' });
    expect(r.error).toBe('saving the settings failed, so the old container was put back: the new container stopped with exit code 7');
    const now = await inspect(NAME);
    expect(now.Id).toBe(before.Id);
    expect(now.State.Running).toBe(true);
    expect(now.Config.Env).toContain('A=2');
    const all = (await (await api('/containers/json?all=1')).json()) as any[];
    expect(all.filter(x => x.Names.some((n: string) => n.startsWith(`/${NAME}`)))).toHaveLength(1);
    // Back on the form, which still shows the settings that are in effect.
    expect(r.body).toContain('A=2\nB=3</textarea>');
  }, 60000);

  test('bad input is refused before anything changes', async () => {
    const before = await inspect(NAME);
    for (const [form, msg] of [
      [{ image: 'busybox:1.36', volumes: '/etc:/hostetc' }, 'host bind mounts are disabled'],
      [{ image: '--privileged' }, 'invalid image'],
      [{ image: 'busybox:1.36', ports: '99999:80' }, 'port'],
      [{ image: 'busybox:1.36', env: 'NOEQUALS' }, ''],
      [{ image: 'busybox:1.36', cmd: 'sh -c "unterminated' }, 'unterminated double quote'],
    ] as [Record<string, string>, string][]) {
      const r = await c.submit(`/containers/${NAME}/edit`, form);
      expect(r.error).not.toBe('');
      expect(r.error).toContain(msg);
    }
    const after = await inspect(NAME);
    expect(after.Id).toBe(before.Id);
    // Refused before the old container was stopped: it kept running the whole time.
    expect(after.State.StartedAt).toBe(before.State.StartedAt);
  }, 60000);

  test('containers kontainers did not create, and compose ones, cannot be edited', async () => {
    const created = await api(`/containers/create?name=${COMPOSED}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Image: 'busybox:1.36', Cmd: ['sleep', '300'], Labels: { 'com.docker.compose.project': 'shop' } }) });
    expect(created.status).toBe(201);
    const get = await c.get(`/containers/${COMPOSED}/edit`);
    expect(get.status).toBe(400);
    expect(await get.text()).toContain('change it in the compose file');
    expect((await c.submit(`/containers/${COMPOSED}/edit`, { image: 'busybox:1.36' })).error).toContain('compose');
    expect(await c.page(`/containers/${COMPOSED}`)).not.toContain('Edit settings');
  });

  test('a container can be opted into automatic updates when it is created', async () => {
    const r = await c.submit('/containers', { image: 'busybox:1.36', name: AUTO, pull: '', cmd: 'sleep 600', start: 'on', autoupdate: 'on' });
    expect(r.flash).toBe(`Created ${AUTO}; it is updated automatically when a check finds a newer image.`);
    expect(await c.page(`/containers/${AUTO}`)).toMatch(/<input type="checkbox" name="on" checked>/);
  });
});

describe.skipIf(!DOCKER)('forms and messages', () => {
  let srv: Running, c: Client;
  beforeAll(async () => { ({ srv, c } = await readyServer()); await c.page('/containers/new'); });
  afterAll(async () => { await srv.stop(); });

  test('a failed create goes back to the form, filled in as it was sent', async () => {
    const r = await c.submit('/containers', { image: 'busybox:1.36', name: 'kept-name', cmd: 'sleep 9', ports: '8081:80\n99999:1', env: 'A=1\nB=<two>', volumes: 'v1:/data', restart: 'always', pull: '', start: 'on', autoupdate: 'on' });
    expect(r.error).not.toBe('');
    expect(r.body).toContain('<h1>New container</h1>');
    expect(r.body).toContain('value="kept-name"');
    expect(r.body).toContain('value="sleep 9"');
    expect(r.body).toContain('8081:80\n99999:1</textarea>');
    expect(r.body).toContain('A=1\nB=&lt;two&gt;</textarea>');
    expect(r.body).toContain('<option selected>always</option>');
    expect(r.body).toMatch(/name="pull">/); // was unchecked
    expect(r.body).toMatch(/name="autoupdate" checked>/);
    // The next visit is a clean form again.
    expect(await c.page('/containers/new')).not.toContain('kept-name');
  });

  test('two actions at once in one session both report', async () => {
    const [a, b] = await Promise.all([c.post('/containers/nope-1/start', {}), c.post('/containers/nope-2/start', {})]);
    expect([a.status, b.status]).toEqual([303, 303]);
    const page = await c.page('/containers');
    const err = /<p class="error"[^>]*>([^<]*)<\/p>/.exec(page)?.[1] ?? '';
    expect(err.split('\n')).toHaveLength(2);
    expect(err).toContain('nope-1');
    expect(err).toContain('nope-2');
  });
});

describe.skipIf(!DOCKER)('an update interrupted by a restart', () => {
  test('the old container is put back when kontainers starts again', async () => {
    const name = `k-${run}-intr`;
    const { srv: s1, c: c1 } = await readyServer();
    expect((await c1.submit('/containers', { image: 'busybox:1.36', name, pull: '', cmd: 'sleep 600', start: 'on' })).error).toBe('');
    await s1.stop();
    // What kontainers leaves if it dies between setting the old container aside and creating the new one.
    const c = await inspect(name);
    await api(`/containers/${name}/stop?t=1`, { method: 'POST' });
    expect((await api(`/containers/${name}/rename?name=${name}-old-${c.Id.slice(0, 8)}`, { method: 'POST' })).status).toBe(204);
    const s2 = await (await import('./helpers')).startServer();
    try {
      for (let i = 0; i < 50 && !/put .* back/.test(s2.output()); i++) await Bun.sleep(100);
      expect(s2.output()).toContain(`put ${name} back: an update or edit was interrupted`);
      const now = await inspect(name);
      expect(now.Id).toBe(c.Id);
      expect(now.State.Running).toBe(true);
    } finally {
      await s2.stop();
      await api(`/containers/${name}?force=1`, { method: 'DELETE' });
    }
  }, 60000);
});
