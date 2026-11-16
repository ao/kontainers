// Automatic updates and notifications against a real daemon and registry: a registry:2 inside the
// test daemon, and a webhook receiver in this process that kontainers posts to.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run; skipped otherwise.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, PW, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const REG = `k-areg-${run}`;
const REPO = `localhost:5000/kt/au${run}`;
const REF = `${REPO}:1`;
const WEB = `au-web-${run}`, OTHER = `au-other-${run}`, CRASH = `au-crash-${run}`, SICK = `au-sick-${run}`;
const AUTH = { 'X-Registry-Auth': Buffer.from('{}').toString('base64') };

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
}
async function stream(path: string, headers: Record<string, string> = {}) {
  const res = await api(path, { method: 'POST', headers });
  const body = await res.text();
  if (res.status !== 200 || /"error"/.test(body)) throw new Error(`${path}: ${res.status} ${body.slice(-300)}`);
}
const post = (path: string, body?: unknown) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const inspect = async (name: string) => (await (await api(`/containers/${name}/json`)).json()) as any;
const imageId = async (ref: string) => ((await (await api(`/images/${encodeURIComponent(ref)}/json`)).json()) as any).Id as string;
const push = async () => {
  for (let i = 0; ; i++) {
    try { return await stream(`/images/${encodeURIComponent(REPO)}/push?tag=1`, AUTH); } catch (e) { if (i > 20) throw e; await Bun.sleep(500); }
  }
};
// Publishes an image built from `from` with Dockerfile-style changes under REF, then points the
// local tag back at `localId`, as if someone else had pushed a release. Returns the new image ID.
async function publish(from: string, changes: string, localId: string): Promise<string> {
  const tmp = `au-tmp-${Math.random().toString(36).slice(2, 8)}`;
  expect((await post(`/containers/create?name=${tmp}`, { Image: from, Cmd: ['true'] })).status).toBe(201);
  expect((await post(`/commit?container=${tmp}&repo=${encodeURIComponent(REPO)}&tag=1&changes=${encodeURIComponent(changes)}`, {})).status).toBe(201);
  await api(`/containers/${tmp}?force=1`, { method: 'DELETE' });
  await push();
  const id = await imageId(REF);
  expect((await api(`/images/${localId}/tag?repo=${encodeURIComponent(REPO)}&tag=1`, { method: 'POST' })).status).toBe(201);
  return id;
}
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 60000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(500);
  }
}

describe.skipIf(!DOCKER)('automatic updates and notifications', () => {
  let srv: Running, c: Client;
  const got: any[] = [];
  let hook: ReturnType<typeof Bun.serve>;

  beforeAll(async () => {
    hook = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) { got.push(await req.json()); return new Response(null, { status: 204 }); } });
    await stream('/images/create?fromImage=registry&tag=2');
    await stream('/images/create?fromImage=busybox&tag=1.36');
    expect((await post(`/containers/create?name=${REG}`, { Image: 'registry:2', HostConfig: { PortBindings: { '5000/tcp': [{ HostIp: '127.0.0.1', HostPort: '5000' }] } } })).status).toBe(201);
    expect((await post(`/containers/${REG}/start`)).status).toBe(204);
    expect((await api(`/images/busybox:1.36/tag?repo=${encodeURIComponent(REPO)}&tag=1`, { method: 'POST' })).status).toBe(201);
    await push();
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0', KONTAINERS_AUTOUPDATE_SETTLE: '3', KONTAINERS_AUTOUPDATE_HEALTH_TIMEOUT: '15' }));
  });
  afterAll(async () => {
    for (const n of [WEB, OTHER, CRASH, SICK, REG]) await api(`/containers/${n}?force=1&v=1`, { method: 'DELETE' });
    hook?.stop(true);
    await srv?.stop();
  });

  test('a webhook target can be added and tested; its URL path is not shown', async () => {
    await c.page('/settings');
    const form: Record<string, string> = { kind: 'webhook', url: `http://127.0.0.1:${hook.port}/hook/secret-part` };
    for (const k of ['update', 'autoupdate', 'exit', 'health', 'cert']) form[`ev_${k}`] = 'on';
    const added = await c.submit('/settings/notify', form);
    expect(added.error).toBe('');
    expect(added.body).toContain(`http://127.0.0.1:${hook.port}/…`);
    expect(added.body).not.toContain('secret-part');
    const id = /action="\/settings\/notify\/(\d+)\/test"/.exec(added.body)![1];
    const t = await c.submit(`/settings/notify/${id}/test`, {});
    expect(t.flash).toBe('Test notification sent (HTTP 204).');
    expect(got.pop()).toMatchObject({ event: 'test', title: 'kontainers test notification' });
    expect((await c.submit('/settings/notify', { kind: 'webhook', url: 'file:///etc/passwd', ev_update: 'on' })).error).toContain('https:// or http://');
  });

  test('an opted-in container is updated automatically; another gets a "newer image" note', async () => {
    const oldId = await imageId(REF);
    expect((await c.submit('/containers', { image: REF, name: WEB, pull: '', cmd: 'sleep 600', start: 'on' })).error).toBe('');
    expect((await post(`/containers/create?name=${OTHER}`, { Image: REF, Cmd: ['sleep', '600'] })).status).toBe(201);
    expect((await post(`/containers/${OTHER}/start`)).status).toBe(204);
    const on = await c.submit(`/containers/${WEB}/autoupdate`, { on: 'on' });
    expect(on.flash).toContain('will be updated automatically');
    expect(on.body).toMatch(/<input type="checkbox" name="on" checked>/);
    // Containers kontainers did not create cannot be opted in.
    expect((await c.submit(`/containers/${OTHER}/autoupdate`, { on: 'on' })).error).toContain('only containers created in kontainers');

    const newId = await publish('busybox:1.36', 'LABEL release=2', oldId);
    const checked = await c.submit('/updates/check', {});
    expect(checked.flash).toContain('2 containers have a newer image; 1 is being updated automatically');
    await until('the automatic update', async () => (await inspect(WEB)).Image === newId);
    const now = await inspect(WEB);
    expect(now.State.Running).toBe(true);
    expect(now.Config.Cmd).toEqual(['sleep', '600']);
    await until('the autoupdate note', async () => got.find(g => g.event === 'autoupdate'));
    expect(got.find(g => g.event === 'autoupdate')).toMatchObject({ title: `Updated ${WEB}`, container: WEB });
    expect(got.filter(g => g.event === 'update').map(g => g.container)).toEqual([OTHER]);
    expect((await inspect(OTHER)).Image).toBe(oldId); // not opted in: left alone
    const page = await c.page(`/containers/${WEB}`);
    expect(page).toMatch(/<input type="checkbox" name="on" checked>/); // still opted in after recreation
    expect(page).toContain(`Last automatic update just now: Updated ${WEB} to the newest ${REF}.`);
    // A second check: the "newer image" note for the other container is not sent again.
    await c.submit('/updates/check', {});
    await Bun.sleep(1500);
    expect(got.filter(g => g.event === 'update')).toHaveLength(1);
    got.length = 0;
  }, 180000);

  test('a new image that crashes is rolled back, reported, and not tried again', async () => {
    const before = await inspect(WEB);
    const badId = await publish('busybox:1.36', 'ENTRYPOINT ["false"]', before.Image);
    await c.submit('/updates/check', {});
    const note = await until('the failure note', async () => got.find(g => g.event === 'autoupdate'));
    expect(note.title).toBe(`Update of ${WEB} failed`);
    expect(note.message).toContain('old container was put back: the new container stopped with exit code 1');
    const after = await inspect(WEB);
    expect(after.Id).toBe(before.Id);
    expect(after.Image).toBe(before.Image);
    expect(after.State.Running).toBe(true);
    const all = (await (await api('/containers/json?all=1')).json()) as any[];
    expect(all.filter(x => x.Names.some((n: string) => n.startsWith(`/${WEB}`)))).toHaveLength(1);
    const page = await c.page(`/containers/${WEB}`);
    expect(page).toContain(`Image ${badId.replace(/^sha256:/, '').slice(0, 12)} failed when it was tried and is held back`);
    // The rollback is reported once, as a failed update, not also as a container that stopped.
    expect(got.filter(g => g.event === 'exit' && g.container === WEB)).toEqual([]);
    // The same image again: nothing happens.
    got.length = 0;
    await c.submit('/updates/check', {});
    await Bun.sleep(5000);
    expect((await inspect(WEB)).Id).toBe(before.Id);
    expect(got.filter(g => g.event === 'autoupdate')).toEqual([]);
  }, 180000);

  test('a container that exits on its own is reported; one stopped in kontainers is not', async () => {
    got.length = 0;
    expect((await post(`/containers/create?name=${CRASH}`, { Image: 'busybox:1.36', Cmd: ['sh', '-c', 'sleep 1; exit 3'] })).status).toBe(201);
    expect((await post(`/containers/${CRASH}/start`)).status).toBe(204);
    const note = await until('the exit note', async () => got.find(g => g.event === 'exit' && g.container === CRASH), 30000);
    expect(note.message).toBe(`${CRASH} (busybox:1.36) stopped with exit code 3.`);
    expect((await c.submit(`/containers/${WEB}/stop`, {})).error).toBe('');
    await Bun.sleep(3000);
    expect(got.filter(g => g.event === 'exit' && g.container === WEB)).toEqual([]);
  }, 60000);

  test('a container whose healthcheck fails is reported as unhealthy', async () => {
    expect((await post(`/containers/create?name=${SICK}`, { Image: 'busybox:1.36', Cmd: ['sleep', '600'], Healthcheck: { Test: ['CMD', 'false'], Interval: 1e9, Timeout: 1e9, Retries: 1 } })).status).toBe(201);
    expect((await post(`/containers/${SICK}/start`)).status).toBe(204);
    const note = await until('the health note', async () => got.find(g => g.event === 'health' && g.container === SICK), 30000);
    expect(note.title).toBe(`${SICK} is unhealthy`);
  }, 60000);

  test('Update image keeps the data in a volume the image declares', async () => {
    const VREPO = `${REPO}vol`, VREF = `${VREPO}:1`, NAME = `au-vol-${run}`;
    const build = async (changes: string) => {
      const tmp = `au-tmp-${Math.random().toString(36).slice(2, 8)}`;
      expect((await post(`/containers/create?name=${tmp}`, { Image: 'busybox:1.36', Cmd: ['true'] })).status).toBe(201);
      expect((await post(`/commit?container=${tmp}&repo=${encodeURIComponent(VREPO)}&tag=1&changes=${encodeURIComponent(changes)}`, {})).status).toBe(201);
      await api(`/containers/${tmp}?force=1`, { method: 'DELETE' });
      await stream(`/images/${encodeURIComponent(VREPO)}/push?tag=1`, AUTH);
      return imageId(VREF);
    };
    const exec = async (cmd: string[]) => {
      const e = await (await post(`/containers/${NAME}/exec`, { Cmd: cmd, AttachStdout: true, AttachStderr: true })).json() as any;
      return (await post(`/exec/${e.Id}/start`, { Detach: false, Tty: false })).text();
    };
    const v1 = await build('VOLUME /data');
    try {
      expect((await c.submit('/containers', { image: VREF, name: NAME, pull: '', cmd: 'sleep 600', start: 'on' })).error).toBe('');
      await exec(['sh', '-c', 'echo precious > /data/important.txt']);
      const before = await inspect(NAME);
      const vol = before.Mounts.find((m: any) => m.Destination === '/data').Name;
      await build('VOLUME /data\nLABEL release=2');
      expect((await api(`/images/${v1}/tag?repo=${encodeURIComponent(VREPO)}&tag=1`, { method: 'POST' })).status).toBe(201);
      // Two people press Update image at once: one update runs, the other is refused.
      const c2 = new Client(srv.base);
      expect((await c2.post('/login', { username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
      await c2.page(`/containers/${NAME}`);
      const [r, r2] = await Promise.all([c.submit(`/containers/${NAME}/update`, {}), c2.submit(`/containers/${NAME}/update`, {})]);
      expect([r.flash, r2.flash].filter(f => f.includes(`Updated ${NAME}`))).toHaveLength(1);
      expect([r.error, r2.error].filter(e => e.includes('already running'))).toHaveLength(1);
      const all = (await (await api('/containers/json?all=1')).json()) as any[];
      expect(all.filter(x => x.Names.some((n: string) => n.startsWith(`/${NAME}`)))).toHaveLength(1);
      const after = await inspect(NAME);
      expect(after.Id).not.toBe(before.Id);
      expect(after.Mounts.find((m: any) => m.Destination === '/data').Name).toBe(vol);
      expect(await exec(['cat', '/data/important.txt'])).toContain('precious');
    } finally {
      await api(`/containers/${NAME}?force=1&v=1`, { method: 'DELETE' });
    }
  }, 120000);

  test('one change at a time: Edit, Update image and Stop on one container while another runs', async () => {
    const NAME = `au-lock-${run}`;
    // busybox, not REF: by now REF points at the image that fails on purpose.
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: 'sleep 600', start: 'on' })).error).toBe('');
    expect((await inspect(NAME)).State.Running).toBe(true);
    try {
      const c2 = new Client(srv.base);
      expect((await c2.post('/login', { username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
      await c2.page(`/containers/${NAME}`);
      // An edit that recreates (and so settles for 3 s) against an update and a stop sent meanwhile.
      const c3 = new Client(srv.base);
      expect((await c3.post('/login', { username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
      await c3.page(`/containers/${NAME}`);
      const [edit, upd, stop] = await Promise.all([
        c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', pull: '', cmd: 'sleep 601', ports: '', env: '', volumes: '', restart: 'no' }),
        (async () => { await Bun.sleep(1500); return c2.submit(`/containers/${NAME}/update`, {}); })(),
        (async () => { await Bun.sleep(1500); return c3.submit(`/containers/${NAME}/stop`, {}); })(),
      ]);
      expect(edit.flash).toBe(`Saved the settings of ${NAME}; it was recreated.`);
      expect(upd.error, JSON.stringify({ edit: [edit.flash, edit.error], upd: [upd.flash, upd.error], stop: [stop.flash, stop.error] })).toContain('already running');
      expect(stop.error).toContain('wait for it to finish');
      const all = (await (await api('/containers/json?all=1')).json()) as any[];
      const mine = all.filter(x => x.Names.some((n: string) => n.startsWith(`/${NAME}`)));
      expect(mine).toHaveLength(1);
      expect(mine[0].State).toBe('running');
      expect((await inspect(NAME)).Config.Cmd).toEqual(['sleep', '601']);
    } finally {
      await api(`/containers/${NAME}?force=1`, { method: 'DELETE' });
    }
  }, 120000);

  // A command that stops at once on SIGTERM, so a replacement does not wait 10 s for the old one.
  const quick = (cmd = 'sleep 600') => `sh -c 'trap "exit 0" TERM; ${cmd} & wait'`;
  const mine = async (name: string) => ((await (await api('/containers/json?all=1')).json()) as any[]).filter(x => x.Names.some((n: string) => n === `/${name}` || n.startsWith(`/${name}-old-`)));

  test('two Edit saves at once with Pull ticked: one is refused, and the old container does not come back', async () => {
    const NAME = `au-edit2-${run}`;
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: quick(), start: 'on' })).error).toBe('');
    try {
      const c2 = new Client(srv.base);
      expect((await c2.post('/login', { username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
      await c2.page(`/containers/${NAME}/edit`);
      await c.page(`/containers/${NAME}/edit`);
      const form = { image: 'busybox:1.36', pull: 'on', cmd: quick('sleep 601'), ports: '', env: '', volumes: '', restart: 'no' };
      const [a, b] = await Promise.all([c.submit(`/containers/${NAME}/edit`, form), c2.submit(`/containers/${NAME}/edit`, form)]);
      expect([a.flash, b.flash].filter(f => f.startsWith(`Saved the settings of ${NAME}`))).toHaveLength(1);
      expect([a.error, b.error].filter(e => e.includes('already running'))).toHaveLength(1);
      const left = await mine(NAME);
      expect(left.map(x => [x.Names[0], x.State])).toEqual([[`/${NAME}`, 'running']]);
    } finally {
      await api(`/containers/${NAME}?force=1`, { method: 'DELETE' });
    }
  }, 120000);

  test('a docker stop while the new container settles is not undone, and nothing is held back', async () => {
    const NAME = `au-stopped-${run}`;
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: quick(), start: 'on' })).error).toBe('');
    try {
      const old = (await inspect(NAME)).Id;
      await c.page(`/containers/${NAME}/edit`);
      const saving = c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', pull: '', cmd: quick('sleep 602'), ports: '', env: '', volumes: '', restart: 'no' });
      // As a backup script would: stop the new container from outside while it settles.
      const fresh = await until('the new container', async () => { const x = await inspect(NAME); return x.Id && x.Id !== old && x.State?.Running ? x.Id : null; }, 30000);
      expect((await post(`/containers/${fresh}/stop?t=2`)).status).toBe(204);
      const r = await saving;
      expect(r.error).toBe('');
      expect(r.flash).toContain('stopped by someone');
      const now = await inspect(NAME);
      expect(now.Id).toBe(fresh);
      expect(now.State.Running).toBe(false);
      expect((await mine(NAME)).length).toBe(1);
    } finally {
      await api(`/containers/${NAME}?force=1`, { method: 'DELETE' });
    }
  }, 120000);

  test('Edit to an image that is not on this host, without Pull, changes nothing', async () => {
    const NAME = `au-typo-${run}`;
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: quick(), start: 'on' })).error).toBe('');
    try {
      const before = await inspect(NAME);
      await c.page(`/containers/${NAME}/edit`);
      const r = await c.submit(`/containers/${NAME}/edit`, { image: 'busybox:no-such-tag', pull: '', cmd: quick('sleep 603'), ports: '8099:80', env: 'KEEP=me', volumes: '', restart: 'always' });
      expect(r.error).toContain('not on this host');
      expect(r.error).toContain('Nothing was changed');
      // The form comes back as it was typed.
      expect(r.body).toContain('value="busybox:no-such-tag"');
      expect(r.body).toContain('KEEP=me</textarea>');
      expect(r.body).toContain('<option selected>always</option>');
      const after = await inspect(NAME);
      expect(after.Id).toBe(before.Id);
      expect(after.State.StartedAt).toBe(before.State.StartedAt);
    } finally {
      await api(`/containers/${NAME}?force=1`, { method: 'DELETE' });
    }
  }, 60000);

  test('network aliases and a fixed address survive Edit settings', async () => {
    const NAME = `au-alias-${run}`, NET = `au-net-${run}`;
    expect((await post('/networks/create', { Name: NET, IPAM: { Config: [{ Subnet: '10.123.0.0/24' }] } })).status).toBe(201);
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: quick(), start: 'on' })).error).toBe('');
    try {
      expect((await post(`/networks/${NET}/connect`, { Container: NAME, EndpointConfig: { Aliases: ['svc-alias'], IPAMConfig: { IPv4Address: '10.123.0.50' } } })).status).toBe(200);
      await c.page(`/containers/${NAME}/edit`);
      const r = await c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', pull: '', cmd: quick('sleep 604'), ports: '', env: '', volumes: '', restart: 'no' });
      expect(r.error).toBe('');
      const ep = (await inspect(NAME)).NetworkSettings.Networks[NET];
      expect(ep.Aliases).toContain('svc-alias');
      expect(ep.IPAMConfig?.IPv4Address).toBe('10.123.0.50');
      expect(ep.IPAddress).toBe('10.123.0.50');
    } finally {
      await api(`/containers/${NAME}?force=1`, { method: 'DELETE' });
      await api(`/networks/${NET}`, { method: 'DELETE' });
    }
  }, 60000);

  test('Activity: a search for "kontainers" finds what it did on its own', async () => {
    expect(await c.page('/activity?q=kontainers')).toContain('updated automatically');
  });

  test('a form over 1 MB gets a page that says so', async () => {
    await c.page('/containers/new');
    const res = await c.post('/containers', { image: 'busybox:1.36', name: 'big', env: 'A=' + 'x'.repeat(1_200_000) });
    expect(res.status).toBe(413);
    expect(await res.text()).toContain('kontainers accepts at most 1 MB');
  });

  test('the container list shows the unhealthy and exited containers as needing attention', async () => {
    const page = await c.page('/containers?state=attention');
    for (const n of [CRASH, SICK]) expect(page).toMatch(new RegExp(`<tr data-name="${n}"[^>]*data-attention="1"(?! hidden)[^>]*>`));
  });

  // Last: it stops the server.
  test('stopping kontainers while a new container settles puts the old one back', async () => {
    const NAME = `au-restart-${run}`;
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: quick(), start: 'on' })).error).toBe('');
    try {
      const old = (await inspect(NAME)).Id;
      await c.page(`/containers/${NAME}/edit`);
      const saving = c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', pull: '', cmd: quick('sleep 605'), ports: '', env: '', volumes: '', restart: 'no' }).catch(() => null);
      await until('the new container', async () => { const x = await inspect(NAME); return x.Id && x.Id !== old && x.State?.Running; }, 30000);
      const t = Date.now();
      await srv.stop();
      expect(Date.now() - t).toBeLessThan(9000); // before Docker's 10 s would kill it
      await saving;
      expect(srv.output()).toContain('SIGTERM, shutting down');
      const now = await inspect(NAME);
      expect(now.Id).toBe(old);
      expect(now.State.Running).toBe(true);
      expect((await mine(NAME)).length).toBe(1);
    } finally {
      await api(`/containers/${NAME}?force=1`, { method: 'DELETE' });
    }
  }, 120000);
});
