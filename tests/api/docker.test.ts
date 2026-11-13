// Container, image, network and volume flows against a real Docker daemon (docker-in-docker in CI).
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run; skipped otherwise.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, startServer, type Running } from './helpers';

const IMAGE = 'busybox:1.36';
const run = Math.random().toString(36).slice(2, 8);

async function dockerApi(path: string, init: RequestInit = {}) {
  const base = DOCKER.replace(/^tcp:\/\//, 'http://');
  return fetch(`${base}/v1.41${path}`, init);
}

describe.skipIf(!DOCKER)('docker flows', () => {
  let srv: Running, c: Client;
  beforeAll(async () => {
    ({ srv, c } = await readyServer());
    await c.page('/images');
  });
  afterAll(async () => {
    for (const n of [`k-${run}-a`, `k-${run}-b`, `k-${run}-bind`]) await dockerApi(`/containers/${n}?force=1`, { method: 'DELETE' });
    await srv.stop();
  });

  test('readyz is green with a daemon', async () => {
    expect((await fetch(srv.base + '/readyz')).status).toBe(200);
  });

  test('pull an image', async () => {
    const r = await c.submit('/images/pull', { ref: IMAGE });
    expect(r.error).toBe('');
    expect(r.flash).toContain(`Pulled ${IMAGE}`);
    expect(r.body).toContain(IMAGE);
  }, 120000);

  test('pulling a missing image reports the daemon error', async () => {
    const r = await c.submit('/images/pull', { ref: 'busybox:no-such-tag-kontainers' });
    expect(r.error).not.toBe('');
  }, 120000);

  test('create, list, logs, stop, start, restart, remove', async () => {
    const name = `k-${run}-a`;
    const r = await c.submit('/containers', { image: IMAGE, name, cmd: 'sh -c echo${IFS}hello-from-kontainers;sleep${IFS}600', env: 'GREETING=hi', ports: '18999:80', restart: 'no', start: 'on' });
    expect(r.error).toBe('');
    expect(r.flash).toContain(`Created ${name}`);
    expect(r.body).toContain(name);

    const insp = await (await dockerApi(`/containers/${name}/json`)).json() as any;
    expect(insp.State.Running).toBe(true);
    expect(insp.Config.Labels['kontainers.managed']).toBe('true');
    expect(insp.HostConfig.Privileged).toBe(false);
    expect(insp.HostConfig.PortBindings['80/tcp'][0]).toEqual({ HostIp: '127.0.0.1', HostPort: '18999' }); // loopback by default

    const detail = await c.page(`/containers/${insp.Id}`);
    expect(detail).toContain('GREETING=…');
    expect(detail).not.toContain('GREETING=hi'); // env values are not shown

    let logs = '';
    for (let i = 0; i < 20 && !logs.includes('hello-from-kontainers'); i++) { logs = await (await c.get(`/api/containers/${insp.Id}/logs?tail=50`)).text(); await Bun.sleep(200); }
    expect(logs).toContain('hello-from-kontainers');

    expect((await c.submit(`/containers/${name}/stop`, {})).error).toBe('');
    expect(((await (await dockerApi(`/containers/${name}/json`)).json()) as any).State.Running).toBe(false);
    expect((await c.submit(`/containers/${name}/start`, {})).error).toBe('');
    expect((await c.submit(`/containers/${name}/restart`, {})).error).toBe('');
    expect(((await (await dockerApi(`/containers/${name}/json`)).json()) as any).State.Running).toBe(true);
    // A running container is not removed (no force); stopped, it is.
    expect((await c.submit(`/containers/${name}/remove`, {})).error.toLowerCase()).toMatch(/running|stop/);
    expect((await dockerApi(`/containers/${name}/json`)).status).toBe(200);
    expect((await c.submit(`/containers/${name}/stop`, {})).error).toBe('');
    expect((await c.submit(`/containers/${name}/remove`, {})).error).toBe('');
    expect((await dockerApi(`/containers/${name}/json`)).status).toBe(404);
  }, 120000);

  test('quoted commands run as typed', async () => {
    const name = `k-${run}-q`;
    expect((await c.submit('/containers', { image: IMAGE, name, cmd: `sh -c "echo 'quoted ok'; sleep 300"`, start: 'on' })).error).toBe('');
    const insp = await (await dockerApi(`/containers/${name}/json`)).json() as any;
    expect(insp.Config.Cmd).toEqual(['sh', '-c', "echo 'quoted ok'; sleep 300"]);
    let logs = '';
    for (let i = 0; i < 20 && !logs.includes('quoted ok'); i++) { logs = await (await c.get(`/api/containers/${name}/logs`)).text(); await Bun.sleep(200); }
    expect(logs).toContain('quoted ok');
    await dockerApi(`/containers/${name}?force=1`, { method: 'DELETE' });
  });

  test('a container that cannot start is not left behind', async () => {
    const holder = `k-${run}-port1`, second = `k-${run}-port2`;
    expect((await c.submit('/containers', { image: IMAGE, name: holder, cmd: 'sleep 300', ports: '18998:80', start: 'on' })).error).toBe('');
    const r = await c.submit('/containers', { image: IMAGE, name: second, cmd: 'sleep 300', ports: '18998:80', start: 'on' });
    expect(r.error).toContain('not kept');
    expect(r.error.toLowerCase()).toContain('allocated');
    expect((await dockerApi(`/containers/${second}/json`)).status).toBe(404);
    // The name is free again: retrying with another port works.
    expect((await c.submit('/containers', { image: IMAGE, name: second, cmd: 'sleep 300', ports: '18997:80', start: 'on' })).error).toBe('');
    for (const n of [holder, second]) await dockerApi(`/containers/${n}?force=1`, { method: 'DELETE' });
  });

  test('a paused container can be unpaused', async () => {
    const name = `k-${run}-p`;
    expect((await c.submit('/containers', { image: IMAGE, name, cmd: 'sleep 300', start: 'on' })).error).toBe('');
    expect((await dockerApi(`/containers/${name}/pause`, { method: 'POST' })).status).toBe(204);
    const list = await c.page('/containers');
    expect(list).toMatch(new RegExp(`data-name="${name}"[\\s\\S]*?/unpause`));
    expect((await c.submit(`/containers/${name}/unpause`, {})).error).toBe('');
    expect(((await (await dockerApi(`/containers/${name}/json`)).json()) as any).State.Status).toBe('running');
    await dockerApi(`/containers/${name}?force=1`, { method: 'DELETE' });
  });

  test('usage stats for a running container', async () => {
    const name = `k-${run}-s`;
    expect((await c.submit('/containers', { image: IMAGE, name, cmd: 'sleep 300', start: 'on' })).error).toBe('');
    const r = await c.get(`/api/containers/${name}/stats`);
    expect(r.status).toBe(200);
    const s = await r.json() as any;
    expect(s.memBytes).toBeGreaterThan(0);
    expect(s.pids).toBeGreaterThanOrEqual(1);
    expect(typeof s.netRx).toBe('number');
    expect(await c.page(`/containers/${name}`)).toContain('data-stats=');
    expect((await new Client(srv.base).get(`/api/containers/${name}/stats`)).status).toBe(401);
    await dockerApi(`/containers/${name}?force=1`, { method: 'DELETE' });
  });

  describe('update image', () => {
    // "busybox:1.36" is pointed at alpine locally, so pulling it again moves the tag back: a changed image.
    const FAKE_OLD = 'alpine:3.20';
    const imageId = async (ref: string) => ((await (await dockerApi(`/images/${encodeURIComponent(ref)}/json`)).json()) as any).Id;
    const fakeOldTag = async () => {
      expect((await c.submit('/images/pull', { ref: FAKE_OLD })).error).toBe('');
      expect((await dockerApi(`/images/${FAKE_OLD}/tag?repo=busybox&tag=1.36`, { method: 'POST' })).status).toBe(201);
      expect(await imageId(IMAGE)).toBe(await imageId(FAKE_OLD));
    };

    test('recreates with the newer image and the same settings', async () => {
      await fakeOldTag();
      const name = `k-${run}-u`;
      expect((await c.submit('/containers', { image: IMAGE, name, pull: '', cmd: 'sleep 300', env: 'MODE=prod', ports: '18990:80', volumes: `kupd-${run}:/data`, restart: 'unless-stopped', start: 'on' })).error).toBe('');
      const before = await (await dockerApi(`/containers/${name}/json`)).json() as any;
      const r = await c.submit(`/containers/${name}/update`, {});
      expect(r.error).toBe('');
      expect(r.flash).toContain(`Updated ${name}`);
      const after = await (await dockerApi(`/containers/${name}/json`)).json() as any;
      expect(after.Id).not.toBe(before.Id);
      expect(after.Image).not.toBe(before.Image);
      expect(after.Image).toBe(await imageId(IMAGE));
      expect(after.State.Running).toBe(true);
      expect(after.Config.Env).toContain('MODE=prod');
      expect(after.Config.Cmd).toEqual(['sleep', '300']);
      expect(after.HostConfig.PortBindings['80/tcp'][0]).toEqual({ HostIp: '127.0.0.1', HostPort: '18990' });
      expect(after.HostConfig.RestartPolicy.Name).toBe('unless-stopped');
      expect(after.Mounts[0]).toMatchObject({ Type: 'volume', Name: `kupd-${run}`, Destination: '/data' });
      expect((await dockerApi(`/containers/${before.Id}/json`)).status).toBe(404);

      const again = await c.submit(`/containers/${name}/update`, {});
      expect(again.flash).toContain('already runs the newest');
      expect(((await (await dockerApi(`/containers/${name}/json`)).json()) as any).Id).toBe(after.Id);
      await dockerApi(`/containers/${name}?force=1`, { method: 'DELETE' });
      await dockerApi(`/volumes/kupd-${run}`, { method: 'DELETE' });
    }, 120000);

    test('when the new container cannot start, the old one is put back', async () => {
      await fakeOldTag();
      const name = `k-${run}-rb`;
      // /usr/bin/tail exists in alpine but not in busybox, so the new container cannot start.
      expect((await c.submit('/containers', { image: IMAGE, name, pull: '', cmd: '/usr/bin/tail -f /dev/null', start: 'on' })).error).toBe('');
      const before = await (await dockerApi(`/containers/${name}/json`)).json() as any;
      const r = await c.submit(`/containers/${name}/update`, {});
      expect(r.error).toContain('old container was put back');
      const now = await (await dockerApi(`/containers/${name}/json`)).json() as any;
      expect(now.Id).toBe(before.Id);
      expect(now.State.Running).toBe(true);
      const all = await (await dockerApi('/containers/json?all=1')).json() as any[];
      expect(all.filter(x => x.Names.some((n: string) => n.startsWith(`/${name}`))).length).toBe(1);
      await dockerApi(`/containers/${name}?force=1`, { method: 'DELETE' });
    }, 120000);

    test('containers kontainers did not create are refused', async () => {
      const name = `k-${run}-ext`;
      const created = await dockerApi(`/containers/create?name=${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Image: IMAGE, Cmd: ['sleep', '300'], Labels: { 'com.docker.compose.project': 'shop' } }) });
      expect(created.status).toBe(201);
      expect((await c.submit(`/containers/${name}/update`, {})).error).toContain('docker compose pull');
      await dockerApi(`/containers/${name}?force=1`, { method: 'DELETE' });
    });
  });

  test('removing one tag of a multi-tag image keeps the image', async () => {
    const tag = `kontainers-test/extra:${run}`;
    const [repo, t] = tag.split(':');
    expect((await dockerApi(`/images/${IMAGE}/tag?repo=${encodeURIComponent(repo)}&tag=${t}`, { method: 'POST' })).status).toBe(201);
    const r = await c.submit('/images/remove', { ref: tag });
    expect(r.error).toBe('');
    expect((await dockerApi(`/images/${encodeURIComponent(tag)}/json`)).status).toBe(404);
    expect((await dockerApi(`/images/${IMAGE}/json`)).status).toBe(200);
  });

  test('a container that is gone mid-flow gives 404 or a message, not a crash', async () => {
    expect((await c.get('/containers/doesnotexist')).status).toBe(404);
    expect((await c.get('/api/containers/doesnotexist/logs')).status).toBe(404);
    const r = await c.submit('/containers/doesnotexist/stop', {});
    expect(r.error.toLowerCase()).toContain('no such container');
  });

  test('host bind mounts are refused by default', async () => {
    const r = await c.submit('/containers', { image: IMAGE, name: `k-${run}-bind`, volumes: '/:/host', start: 'on' });
    expect(r.error).toContain('bind mounts are disabled');
    expect((await dockerApi(`/containers/k-${run}-bind/json`)).status).toBe(404);
  });

  test.each([
    ['option-looking image', { image: '--privileged' }, 'invalid image'],
    ['image with a shell metacharacter', { image: 'busybox;id' }, 'invalid image'],
    ['option-looking name', { image: IMAGE, name: '--help' }, 'invalid name'],
    ['path traversal name', { image: IMAGE, name: '../x' }, 'invalid name'],
    ['bad env', { image: IMAGE, env: 'not an env' }, 'environment'],
    ['volume target traversal', { image: IMAGE, volumes: 'data:relative' }, 'invalid volume'],
    ['bad port', { image: IMAGE, ports: '99999:80' }, 'host port'],
  ])('refuses %s', async (_label, form, msg) => {
    const r = await c.submit('/containers', form as Record<string, string>);
    expect(r.error).toContain(msg);
  });

  test('path traversal and option injection in URL ids', async () => {
    for (const p of ['/containers/..%2F..%2Fimages%2Fjson/stop', '/containers/-f/remove', '/networks/..%2Fx/remove', '/volumes/..x/remove', '/volumes/a%00b/remove']) {
      const r = await c.submit(p, {});
      expect(r.error).toMatch(/invalid/);
    }
  });

  test('networks: create and remove', async () => {
    const n = `knet-${run}`;
    expect((await c.submit('/networks', { name: n })).body).toContain(n);
    const list = await (await dockerApi('/networks')).json() as any[];
    const net = list.find(x => x.Name === n);
    expect(net.Labels['kontainers.managed']).toBe('true');
    expect((await c.submit(`/networks/${net.Id}/remove`, {})).error).toBe('');
    expect((await dockerApi(`/networks/${n}`)).status).toBe(404);
  });

  test('volumes: create, use, remove', async () => {
    const v = `kvol-${run}`;
    expect((await c.submit('/volumes', { name: v })).body).toContain(v);
    expect((await c.submit('/containers', { image: IMAGE, name: `k-${run}-b`, cmd: 'true', volumes: `${v}:/data:ro` })).error).toBe('');
    const insp = await (await dockerApi(`/containers/k-${run}-b/json`)).json() as any;
    expect(insp.Mounts[0]).toMatchObject({ Type: 'volume', Name: v, Destination: '/data', RW: false });
    expect((await c.submit(`/volumes/${v}/remove`, {})).error.toLowerCase()).toContain('in use');
    await c.submit(`/containers/k-${run}-b/remove`, {});
    expect((await c.submit(`/volumes/${v}/remove`, {})).error).toBe('');
  }, 60000);

  test('remove an image', async () => {
    const r = await c.submit('/images/remove', { ref: IMAGE });
    expect(r.error).toBe('');
    expect(r.flash).toContain(`Removed ${IMAGE}`);
    expect((await dockerApi(`/images/${IMAGE}/json`)).status).toBe(404);
  });
});

describe('daemon down', () => {
  test('readyz is 503, pages show an error, the server keeps running', async () => {
    const { srv, c } = await readyServer({ DOCKER_HOST: 'tcp://127.0.0.1:1' });
    try {
      expect((await fetch(srv.base + '/readyz')).status).toBe(503);
      expect((await fetch(srv.base + '/healthz')).status).toBe(200);
      const r = await c.get('/containers');
      expect(r.status).toBe(502);
      expect(await r.text()).toContain('Docker daemon unreachable');
      expect((await c.submit('/networks', { name: 'x' })).error).toContain('unreachable');
      expect((await c.get('/settings')).status).toBe(200);
      expect(srv.output()).toContain('Docker is not reachable');
    } finally { await srv.stop(); }
  });

  test('a bad DOCKER_HOST fails at start with a clear message', async () => {
    await expect(startServer({ DOCKER_HOST: 'ssh://x' })).rejects.toThrow('unsupported DOCKER_HOST');
  });
});
