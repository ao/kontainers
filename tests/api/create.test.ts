// Creating containers with limits and on a user network, and Edit settings keeping them.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const NET = `cr-net-${run}`, NAME = `cr-app-${run}`, PEER = `cr-peer-${run}`;
const api = (path: string, init: RequestInit = {}) => fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
const inspect = async (name: string) => (await (await api(`/containers/${name}/json`)).json()) as any;

describe.skipIf(!DOCKER)('create with limits and a network', () => {
  let srv: Running, c: Client;
  beforeAll(async () => { ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' })); }, 60000);
  afterAll(async () => {
    for (const n of [NAME, PEER]) await api(`/containers/${n}?force=1`, { method: 'DELETE' });
    await api(`/networks/${NET}`, { method: 'DELETE' });
    await srv?.stop();
  });

  test('the form offers the user networks; limits and aliases are set', async () => {
    await c.page('/networks');
    expect((await c.submit('/networks', { name: NET })).error).toBe('');
    const form = await c.page('/containers/new');
    expect(form).toContain(`<option>${NET}</option>`);
    expect(form).toContain('name="memory"');
    const r = await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: 'on', cmd: 'sleep 600', start: 'on', network: NET, aliases: 'db, primary', memory: '64m', cpus: '0.5', pids: '50' });
    expect(r.error).toBe('');
    const x = await inspect(NAME);
    expect(x.HostConfig).toMatchObject({ Memory: 64 * 1024 ** 2, NanoCpus: 5e8, PidsLimit: 50, NetworkMode: NET });
    expect(x.NetworkSettings.Networks[NET].Aliases).toEqual(expect.arrayContaining(['db', 'primary']));
    expect(Object.keys(x.NetworkSettings.Networks)).toEqual([NET]);
    expect(await c.page(`/containers/${NAME}`)).toContain('memory 64m, 0.5 CPUs, 50 processes');
    // Another container on the network reaches it by its alias.
    await c.page('/containers/new');
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: PEER, cmd: 'sh -c "nslookup db > /tmp/r 2>&1; sleep 600"', start: 'on', network: NET })).error).toBe('');
  }, 60000);

  test('Edit settings keeps the limits and changes them', async () => {
    const edit = await c.page(`/containers/${NAME}/edit`);
    expect(edit).toContain('name="memory" value="64m"');
    expect(edit).toContain('name="cpus" value="0.5"');
    const r = await c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', cmd: 'sleep 600', ports: '', env: '', volumes: '', restart: 'no', memory: '128m', cpus: '0.5', pids: '' });
    expect(r.error).toBe('');
    const x = await inspect(NAME);
    expect(x.HostConfig.Memory).toBe(128 * 1024 ** 2);
    expect(x.HostConfig.PidsLimit ?? 0).toBeLessThanOrEqual(0);
    expect(x.NetworkSettings.Networks[NET].Aliases).toEqual(expect.arrayContaining(['db', 'primary']));
  }, 60000);

  test('the proxy network is not offered, and not accepted', async () => {
    await c.page('/networks');
    await c.submit('/networks', { name: 'kontainers-proxy' });
    expect(await c.page('/containers/new')).not.toContain('<option>kontainers-proxy</option>');
    await c.page('/containers/new');
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: `cr-px-${run}`, cmd: 'true', network: 'kontainers-proxy' })).error).toContain('only bridge networks');
    await api('/networks/kontainers-proxy', { method: 'DELETE' });
  });

  test('an Edit form without the limit fields keeps the limits', async () => {
    const before = (await inspect(NAME)).HostConfig.Memory;
    await c.page(`/containers/${NAME}/edit`);
    expect((await c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', cmd: 'sleep 600', ports: '', env: '', volumes: '', restart: 'no' })).error).toBe('');
    expect((await inspect(NAME)).HostConfig.Memory).toBe(before);
  }, 60000);

  test('a bad limit in Edit settings is refused, and the container can be edited again at once', async () => {
    await c.page(`/containers/${NAME}/edit`);
    expect((await c.submit(`/containers/${NAME}/edit`, { image: 'busybox:1.36', cmd: 'sleep 600', ports: '', env: '', volumes: '', restart: 'no', memory: '5m' })).error).toContain('at least 6m');
    expect(await c.page(`/containers/${NAME}`)).toContain(`action="/containers/${NAME}/stop"`); // not stuck as busy
  });

  test('bad values are refused before anything is made', async () => {
    for (const [form, msg] of [
      [{ memory: '2m' }, 'at least 6m'], [{ cpus: 'lots' }, 'CPUs must be'], [{ pids: '0' }, 'process limit'],
      [{ aliases: 'x' }, 'aliases need a network'], [{ network: 'nope-' + run }, 'there is no network'], [{ network: NET, aliases: 'bad alias!' }, 'not a network alias'],
      [{ network: 'host' }, 'only bridge networks'], [{ network: 'none' }, 'only bridge networks'],
      // Names already on the network: a container's name, and an alias another one has.
      [{ network: NET, aliases: NAME }, 'already a name'], [{ network: NET, aliases: 'db' }, 'already a name'], [{ network: NET, aliases: 'DB' }, 'already a name'],
      [{ network: NET, aliases: 'a b c d e f g h i j k' }, 'at most 10 aliases'],
    ] as [Record<string, string>, string][]) {
      await c.page('/containers/new');
      const r = await c.submit('/containers', { image: 'busybox:1.36', name: `cr-bad-${run}`, cmd: 'true', ...form });
      expect([JSON.stringify(form), r.error]).toEqual([JSON.stringify(form), expect.stringContaining(msg)]);
    }
    expect((await api(`/containers/cr-bad-${run}/json`)).status).toBe(404);
  }, 60000);
});
