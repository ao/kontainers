// Update image and automatic updates for containers kontainers did not create: a real compose
// project (docker compose from the docker:29-cli image, run inside the test daemon) and a docker
// run container, against a registry:2 inside the test daemon.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run; skipped otherwise.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, PW, readyServer, startServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const REG = `k-creg-${run}`;
const REPO = `localhost:5002/kt/cp${run}`;
const REF = `${REPO}:1`;
const PROJ = `cp${run}`;
const WEB = `${PROJ}-web-1`, WORKER = `${PROJ}-worker-1`, PLAIN = `cp-plain-${run}`;
const AUTH = { 'X-Registry-Auth': Buffer.from('{}').toString('base64') };

const COMPOSE = `
services:
  web:
    image: ${REF}
    command: ["sh", "-c", "date >> /cache/marker; exec httpd -f -p 8080"]
    environment: { MODE: live }
    labels: { team: web }
    cap_add: [NET_ADMIN]
    mem_limit: 64m
    volumes: ["data:/data", "/cache"]
    healthcheck: { test: ["CMD", "true"], interval: 2s }
    networks: { default: { aliases: [shopweb] } }
  worker:
    image: ${REF}
    command: ["sleep", "600"]
    labels: { kontainers.autoupdate: "true" }
volumes: { data: {} }
`;

const api = (path: string, init: RequestInit = {}) => fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
const post = (path: string, body?: unknown) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const inspect = async (name: string) => (await (await api(`/containers/${name}/json`)).json()) as any;
const imageId = async (ref: string) => ((await (await api(`/images/${encodeURIComponent(ref)}/json`)).json()) as any).Id as string;
async function stream(path: string, headers: Record<string, string> = {}) {
  const res = await api(path, { method: 'POST', headers });
  const body = await res.text();
  if (res.status !== 200 || /"error"/.test(body)) throw new Error(`${path}: ${res.status} ${body.slice(-300)}`);
}
const push = async (repo = REPO) => {
  for (let i = 0; ; i++) {
    try { return await stream(`/images/${encodeURIComponent(repo)}/push?tag=1`, AUTH); } catch (e) { if (i > 20) throw e; await Bun.sleep(500); }
  }
};
// Publishes busybox with Dockerfile-style changes under repo:1, as a new release, and points the
// local tag back at what it was (with first, the release stays local too). Returns its image ID.
async function publish(changes: string, repo = REPO, first = false): Promise<string> {
  const before = first ? null : await imageId(`${repo}:1`);
  const tmp = `cp-tmp-${Math.random().toString(36).slice(2, 8)}`;
  expect((await post(`/containers/create?name=${tmp}`, { Image: 'busybox:1.36', Cmd: ['true'] })).status).toBe(201);
  expect((await post(`/commit?container=${tmp}&repo=${encodeURIComponent(repo)}&tag=1&changes=${encodeURIComponent(changes)}`, {})).status).toBe(201);
  await api(`/containers/${tmp}?force=1`, { method: 'DELETE' });
  await push(repo);
  const id = await imageId(`${repo}:1`);
  if (before) expect((await api(`/images/${before}/tag?repo=${encodeURIComponent(repo)}&tag=1`, { method: 'POST' })).status).toBe(201);
  return id;
}
// Docker's multiplexed log stream to text.
function demux(buf: Uint8Array): string {
  let out = '', i = 0;
  const dec = new TextDecoder();
  while (i + 8 <= buf.length) {
    const n = (buf[i + 4] << 24) | (buf[i + 5] << 16) | (buf[i + 6] << 8) | buf[i + 7];
    out += dec.decode(buf.slice(i + 8, i + 8 + n));
    i += 8 + n;
  }
  return out;
}
// docker compose, run in a docker:29-cli container on the test daemon's own socket.
async function compose(args: string, yaml = COMPOSE, proj = PROJ): Promise<string> {
  const name = `cp-cli-${Math.random().toString(36).slice(2, 8)}`;
  expect((await post(`/containers/create?name=${name}`, {
    Image: 'docker:29-cli', Env: [`F=${yaml}`], Cmd: ['sh', '-c', `printf '%s' "$F" > /c.yaml && docker compose -p ${proj} -f /c.yaml ${args}`],
    HostConfig: { Binds: ['/var/run/docker.sock:/var/run/docker.sock'] },
  })).status).toBe(201);
  await post(`/containers/${name}/start`);
  const w = (await (await post(`/containers/${name}/wait`)).json()) as { StatusCode: number };
  const out = demux(new Uint8Array(await (await api(`/containers/${name}/logs?stdout=1&stderr=1`)).arrayBuffer()));
  await api(`/containers/${name}?force=1`, { method: 'DELETE' });
  if (w.StatusCode !== 0) throw new Error(`docker compose ${args}: exit ${w.StatusCode}\n${out}`);
  return out;
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
const own = (c: any) => Object.fromEntries(Object.entries(c.Config.Labels).filter(([k]) => !k.startsWith('org.')));

describe.skipIf(!DOCKER)('updating containers made outside kontainers', () => {
  let srv: Running, c: Client;
  let v2 = '';

  beforeAll(async () => {
    await stream('/images/create?fromImage=registry&tag=2');
    await stream('/images/create?fromImage=busybox&tag=1.36');
    await stream('/images/create?fromImage=docker&tag=29-cli');
    expect((await post(`/containers/create?name=${REG}`, { Image: 'registry:2', HostConfig: { PortBindings: { '5000/tcp': [{ HostIp: '127.0.0.1', HostPort: '5002' }] } } })).status).toBe(201);
    expect((await post(`/containers/${REG}/start`)).status).toBe(204);
    // A release made here: with Docker 29's containerd store, pushing a retagged multi-platform
    // busybox sends one platform's manifest, so the registry's digest would not be the local one.
    await publish('ENV RELEASE=1', REPO, true);
    await compose('up -d --quiet-pull');
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0', KONTAINERS_AUTOUPDATE_SETTLE: '3', KONTAINERS_AUTOUPDATE_HEALTH_TIMEOUT: '20' }));
  }, 180000);
  afterAll(async () => {
    await compose('down -v').catch(() => {});
    for (const n of [PLAIN, REG]) await api(`/containers/${n}?force=1&v=1`, { method: 'DELETE' });
    await srv?.stop();
  }, 120000);

  test('a compose container offers Update image and automatic updates, not Edit settings', async () => {
    const page = await c.page(`/containers/${WEB}`);
    expect(page).toContain(`action="/containers/${WEB}/update"`);
    expect(page).toContain(`Part of compose project ${PROJ}`);
    expect(page).not.toContain(`href="/containers/${WEB}/edit"`);
    expect(page).toContain(`action="/containers/${WEB}/autoupdate"`);
    expect((await c.page(`/containers/${WEB}/edit`))).toContain('change it in the compose file');
    // The worker opted in with its label.
    expect(await c.page(`/containers/${WORKER}`)).toContain('the container has the label <code>kontainers.autoupdate=true</code>');
  });

  test('a newer image: the labelled worker is updated automatically, web is only reported', async () => {
    const web0 = await inspect(WEB), worker0 = await inspect(WORKER);
    v2 = await publish('ENV RELEASE=2');
    const r = await c.submit('/updates/check', {});
    expect(r.flash).toMatch(/\d+ containers have a newer image; 1 is being updated automatically/);
    const w = await until('the worker on the new image', async () => { const x = await inspect(WORKER); return x.Image === v2 && x.State?.Running ? x : null; }, 60000);
    expect(w.Id).not.toBe(worker0.Id);
    expect(w.Config.Labels['kontainers.autoupdate']).toBe('true');
    expect(w.Config.Labels['com.docker.compose.service']).toBe('worker');
    expect((await inspect(WEB)).Id).toBe(web0.Id);
  }, 90000);

  test('Update image of the compose web container keeps every setting, its volumes and its alias', async () => {
    const old = await inspect(WEB);
    const r = await c.submit(`/containers/${WEB}/update`, {});
    expect(r.error).toBe('');
    expect(r.flash).toBe(`Updated ${WEB} to the newest ${REF}.`); // RELEASE changes with every release: not named
    const now = await inspect(WEB);
    expect(now.Id).not.toBe(old.Id);
    expect(now.Image).toBe(v2);
    expect(now.State.Running).toBe(true);
    expect(now.Config.Env).toContain('MODE=live');
    expect(now.Config.Env).toContain('RELEASE=2');
    expect(now.Config.Cmd).toEqual(old.Config.Cmd);
    expect(now.Config.Healthcheck).toEqual(old.Config.Healthcheck);
    const labels = own(now);
    expect(labels).toEqual({ ...own(old), 'com.docker.compose.image': v2, 'kontainers.replaces': old.Id });
    expect(now.HostConfig.CapAdd).toEqual(old.HostConfig.CapAdd);
    expect(String(now.HostConfig.CapAdd)).toContain('NET_ADMIN');
    expect(now.HostConfig.Memory).toBe(64 * 1024 * 1024);
    expect(now.HostConfig.RestartPolicy).toEqual(old.HostConfig.RestartPolicy);
    // The named volume and the anonymous one are the same volumes as before.
    const vols = (x: any) => x.Mounts.filter((m: any) => m.Type === 'volume').map((m: any) => `${m.Name}:${m.Destination}`).sort();
    expect(vols(now)).toEqual(vols(old));
    expect(now.NetworkSettings.Networks[`${PROJ}_default`].Aliases).toContain('shopweb');
    expect(Object.keys(now.NetworkSettings.Networks)).toEqual(Object.keys(old.NetworkSettings.Networks));
  }, 60000);

  test('docker compose up -d afterwards leaves both containers as they are', async () => {
    const web = (await inspect(WEB)).Id, worker = (await inspect(WORKER)).Id;
    // Compose's own pull: the local tag now points at the newer image, as kontainers left it.
    const out = await compose('up -d');
    expect(out).not.toMatch(/Recreate/);
    expect((await inspect(WEB)).Id).toBe(web);
    expect((await inspect(WORKER)).Id).toBe(worker);
  }, 120000);

  test('a newer image that crashes: web is put back, the worker is put back and that image held back', async () => {
    const web = (await inspect(WEB)).Id, worker = (await inspect(WORKER)).Id;
    const bad = await publish('ENTRYPOINT ["false"]');
    const r = await c.submit(`/containers/${WEB}/update`, {});
    expect(r.error).toContain('update failed, so the old container was put back');
    expect((await inspect(WEB)).Id).toBe(web);
    expect((await inspect(WEB)).State.Running).toBe(true);
    await c.submit('/updates/check', {});
    await until('the worker held back', async () => (await c.page(`/containers/${WORKER}`)).includes('failed when it was tried and is held back'), 60000);
    const w = await inspect(WORKER);
    expect(w.Id).toBe(worker);
    expect(w.State.Running).toBe(true);
    expect(w.Image).not.toBe(bad);
    // Nothing was left behind under another name.
    const all = (await (await api('/containers/json?all=1')).json()) as any[];
    expect(all.filter(x => String(x.Names[0]).includes('-old-'))).toEqual([]);
    // The tag points back at the image they run, so docker compose does not install the one that
    // failed behind kontainers' back.
    expect(await imageId(REF)).toBe(v2);
    expect(await compose('up -d')).not.toMatch(/Recreate/);
    expect((await inspect(WEB)).Id).toBe(web);
  }, 180000);

  test('a container started with --rm is refused, and keeps running', async () => {
    const rm = `cp-rm-${run}`;
    expect((await post(`/containers/create?name=${rm}`, { Image: REF, Cmd: ['sleep', '600'], HostConfig: { AutoRemove: true } })).status).toBe(201);
    expect((await post(`/containers/${rm}/start`)).status).toBe(204);
    try {
      const r = await c.submit(`/containers/${rm}/update`, {});
      expect(r.error).toContain('started with --rm');
      expect((await inspect(rm)).State.Running).toBe(true);
    } finally { await api(`/containers/${rm}?force=1`, { method: 'DELETE' }); }
  });

  test('a docker run container with privileges of its own is copied with them', async () => {
    await publish('ENV RELEASE=4');
    // Made from the good image of before (the failed update left the tag on the one that crashes).
    expect((await api(`/images/${v2}/tag?repo=${encodeURIComponent(REPO)}&tag=1`, { method: 'POST' })).status).toBe(201);
    expect((await post(`/containers/create?name=${PLAIN}`, {
      Image: REF, Cmd: ['sleep', '600'], Labels: { app: 'plain' }, Env: ['TOKEN=abc'], MacAddress: '02:42:ac:11:00:99',
      HostConfig: { CapAdd: ['SYS_PTRACE'], SecurityOpt: ['no-new-privileges'], ExtraHosts: ['db:10.1.2.3'], RestartPolicy: { Name: 'always' }, Tmpfs: { '/run/x': 'size=1m' } },
    })).status).toBe(201);
    expect((await post(`/containers/${PLAIN}/start`)).status).toBe(204);
    const old = await inspect(PLAIN);
    const page = await c.page(`/containers/${PLAIN}`);
    expect(page).toContain('Created outside kontainers: Update image copies all of its settings');
    const r = await c.submit(`/containers/${PLAIN}/update`, {});
    expect(r.error).toBe('');
    const now = await inspect(PLAIN);
    expect(now.Id).not.toBe(old.Id);
    expect(now.Config.Env).toContain('RELEASE=4');
    expect(now.Config.Env).toContain('TOKEN=abc');
    for (const k of ['CapAdd', 'SecurityOpt', 'ExtraHosts', 'RestartPolicy', 'Tmpfs']) expect(now.HostConfig[k]).toEqual(old.HostConfig[k]);
    expect(now.NetworkSettings.Networks.bridge.MacAddress).toBe('02:42:ac:11:00:99');
    expect(now.Config.Labels.app).toBe('plain');
  }, 60000);

  test('a cleared entrypoint stays cleared in the copy', async () => {
    const repo = `localhost:5002/kt/ep${run}`, name = `cp-ep-${run}`;
    await publish('ENTRYPOINT ["sh", "-c", "echo IMAGE-ENTRYPOINT; sleep 600"]', repo, true);
    expect((await post(`/containers/create?name=${name}`, { Image: `${repo}:1`, Entrypoint: [''], Cmd: ['sh', '-c', 'echo OWN-COMMAND; sleep 600'] })).status).toBe(201);
    expect((await post(`/containers/${name}/start`)).status).toBe(204);
    try {
      await publish('ENTRYPOINT ["sh", "-c", "echo IMAGE-ENTRYPOINT; sleep 600"]\nENV RELEASE=2', repo);
      const r = await c.submit(`/containers/${name}/update`, {});
      expect(r.error).toBe('');
      const now = await inspect(name);
      expect(now.Config.Env).toContain('RELEASE=2');
      expect(now.Config.Entrypoint ?? []).toEqual([]);
      const logs = demux(new Uint8Array(await (await api(`/containers/${name}/logs?stdout=1&stderr=1`)).arrayBuffer()));
      expect(logs).toContain('OWN-COMMAND');
      expect(logs).not.toContain('IMAGE-ENTRYPOINT');
    } finally { await api(`/containers/${name}?force=1`, { method: 'DELETE' }); }
  }, 60000);

  test('a new image that changes the user it runs as is refused, before anything stops', async () => {
    const repo = `localhost:5002/kt/us${run}`, name = `cp-us-${run}`;
    await publish('USER 1000', repo, true);
    expect((await post(`/containers/create?name=${name}`, { Image: `${repo}:1`, Cmd: ['sleep', '600'] })).status).toBe(201);
    expect((await post(`/containers/${name}/start`)).status).toBe(204);
    try {
      const before = await inspect(name);
      await publish('USER 0', repo);
      const r = await c.submit(`/containers/${name}/update`, {});
      expect(r.error).toContain('the user it runs as (1000 in the old image, 0 in the new one)');
      const now = await inspect(name);
      expect(now.Id).toBe(before.Id);
      expect(now.State.StartedAt).toBe(before.State.StartedAt);
      // The tag is back on the image it runs.
      expect(await imageId(`${repo}:1`)).toBe(before.Image);
    } finally { await api(`/containers/${name}?force=1`, { method: 'DELETE' }); }
  }, 60000);

  test('another container sharing its network: Update image is refused and nothing changes', async () => {
    const side = `cp-side-${run}`;
    expect((await post(`/containers/create?name=${side}`, { Image: 'busybox:1.36', Cmd: ['sleep', '600'], HostConfig: { NetworkMode: `container:${PLAIN}` } })).status).toBe(201);
    try {
      const before = (await inspect(PLAIN)).Id;
      const r = await c.submit(`/containers/${PLAIN}/update`, {});
      expect(r.error).toContain(`${side} shares its network, process or IPC namespace`);
      expect((await inspect(PLAIN)).Id).toBe(before);
    } finally { await api(`/containers/${side}?force=1`, { method: 'DELETE' }); }
  });

  test('Update all updates the members of a compose project that have a newer image, one at a time', async () => {
    const proj2 = `${PROJ}b`;
    const yaml = `\nservices:\n  a:\n    image: ${REF}\n    command: ["sleep", "600"]\n  b:\n    image: ${REF}\n    command: ["sleep", "601"]\n`;
    await compose('up -d', yaml, proj2);
    try {
      const before = [await inspect(`${proj2}-a-1`), await inspect(`${proj2}-b-1`)];
      await publish('ENV RELEASE=8');
      await c.submit('/updates/check', {});
      const page = await c.page('/containers');
      expect(page).toContain(`action="/projects/${proj2}/update"`);
      expect(page).toContain('Update all (2)');
      const r = await c.submit(`/projects/${proj2}/update`, {});
      expect(r.error).toBe('');
      expect(r.flash).toBe(`Updated 2 of 2 containers of ${proj2} (${proj2}-a-1, ${proj2}-b-1).`);
      const after = [await inspect(`${proj2}-a-1`), await inspect(`${proj2}-b-1`)];
      for (let i = 0; i < 2; i++) { expect(after[i].Id).not.toBe(before[i].Id); expect(after[i].Config.Env).toContain('RELEASE=8'); expect(after[i].State.Running).toBe(true); }
      expect(await compose('up -d', yaml, proj2)).not.toMatch(/Recreate/);
      // Nothing newer now.
      expect((await c.submit(`/projects/${proj2}/update`, {})).flash).toContain(`Nothing to update in ${proj2}`);
    } finally { await compose('down', yaml, proj2).catch(() => {}); }
  }, 180000);

  test('kontainers killed while the copy settles: the next start keeps the copy and removes the old one', async () => {
    await publish('ENV RELEASE=5');
    const old = await inspect(WEB);
    const updating = c.submit(`/containers/${WEB}/update`, {}).catch(() => null);
    await until('the copy running', async () => { const x = await inspect(WEB); return x.Id && x.Id !== old.Id && x.State?.Running; }, 30000);
    await srv.kill();
    await updating;
    // The old container is set aside, with no kontainers.managed label: only the journal knows it.
    const aside = `${WEB}-old-${old.Id.slice(0, 8)}`;
    expect((await inspect(aside)).Id).toBe(old.Id);
    srv = await startServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0', KONTAINERS_AUTOUPDATE_SETTLE: '3' }, srv.dataDir);
    c = new Client(srv.base);
    expect((await c.post('/login', { username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
    await until('the old container removed', async () => (await api(`/containers/${aside}/json`)).status === 404, 60000);
    const now = await inspect(WEB);
    expect(now.Config.Labels['kontainers.replaces']).toBe(old.Id);
    expect(now.State.Running).toBe(true);
    expect(await c.page('/activity')).toContain(`left over from an interrupted update or edit of ${WEB}`);
  }, 120000);
});
