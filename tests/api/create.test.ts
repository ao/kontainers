// Creating containers with limits and on a user network, and Edit settings keeping them.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const NET = `cr-net-${run}`, NAME = `cr-app-${run}`, PEER = `cr-peer-${run}`, DUP = `cr-dup-${run}`, SRC = `cr-src-${run}`, MV = `cr-mv-${run}`, MOVED = `cr-moved-${run}`;
const api = (path: string, init: RequestInit = {}) => fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
const inspect = async (name: string) => (await (await api(`/containers/${name}/json`)).json()) as any;
// The New container form's fields as a browser would send them (ticked boxes only).
const unesc = (x: string) => x.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function formFields(page: string): Record<string, string> {
  const form = /<form method="post" action="\/containers" class="stack">([\s\S]*?)<\/form>/.exec(page)![1];
  const f: Record<string, string> = {};
  for (const [, a] of form.matchAll(/<input ([^>]*)>/g)) {
    const name = /name="([^"]+)"/.exec(a)?.[1];
    if (!name) continue;
    if (/type="checkbox"/.test(a)) { if (/ checked/.test(a)) f[name] = 'on'; continue; }
    f[name] = unesc(/ value="([^"]*)"/.exec(a)?.[1] ?? '');
  }
  for (const [, name, text] of form.matchAll(/<textarea name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) f[name] = unesc(text);
  for (const [, name, opts] of form.matchAll(/<select name="([^"]+)">([\s\S]*?)<\/select>/g)) {
    const o = /<option(?: value="([^"]*)")? selected>([^<]*)<\/option>/.exec(opts) ?? /<option(?: value="([^"]*)")?>([^<]*)<\/option>/.exec(opts)!;
    f[name] = unesc(o[1] ?? o[2]);
  }
  return f;
}

describe.skipIf(!DOCKER)('create with limits and a network', () => {
  let srv: Running, c: Client;
  beforeAll(async () => { ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' })); }, 60000);
  afterAll(async () => {
    for (const n of [NAME, PEER, DUP, SRC, MV]) await api(`/containers/${n}?force=1`, { method: 'DELETE' });
    await api(`/images/${MOVED}:1?force=1`, { method: 'DELETE' });
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

  test('Duplicate fills in the form from a container made here; sent as it is, it makes the same container without ports or volumes', async () => {
    expect(await c.page(`/containers/${NAME}`)).toContain(`href="/containers/new?from=${NAME}">Duplicate</a>`);
    await c.page('/containers/new');
    const made = await c.submit('/containers', {
      image: 'busybox:1.36', name: SRC, cmd: "sh -c $'echo \\'it is\\'\\nsleep 600'", env: 'A=b=c\nQ=<x>&"y"', labels: 'app.role=web', restart: 'unless-stopped',
      network: NET, aliases: 'srcalias', memory: '64m', cpus: '0.5', pids: '50', ports: '127.0.0.1:18089:80', start: 'on',
    });
    expect(made.error).toBe('');
    const page = await c.page(`/containers/new?from=${SRC}`);
    expect(page).toContain(`The settings of ${SRC}`);
    const f = formFields(page);
    expect(f).toMatchObject({ image: 'busybox:1.36', name: '', ports: '', volumes: '', aliases: '', network: NET, restart: 'unless-stopped', memory: '64m', cpus: '0.5', pids: '50', labels: 'app.role=web' });
    expect(f.pull).toBeUndefined();
    expect(f.start).toBeUndefined();
    const r = await c.submit('/containers', { ...f, name: DUP, start: 'on' });
    expect(r.error).toBe('');
    const [src, dup] = [await inspect(SRC), await inspect(DUP)];
    expect(src.Config.Cmd).toEqual(['sh', '-c', "echo 'it is'\nsleep 600"]);
    expect(dup.Config.Cmd).toEqual(src.Config.Cmd);
    expect(dup.Config.Env).toEqual(expect.arrayContaining(['A=b=c', 'Q=<x>&"y"']));
    expect(dup.Config.Labels['app.role']).toBe('web');
    expect(dup.HostConfig).toMatchObject({ Memory: 64 * 1024 ** 2, NanoCpus: 5e8, PidsLimit: 50, NetworkMode: NET, RestartPolicy: { Name: 'unless-stopped' } });
    expect(Object.keys(dup.HostConfig.PortBindings || {})).toEqual([]);
    expect(dup.NetworkSettings.Networks[NET].Aliases || []).not.toContain('srcalias');
    // Nothing to duplicate: the form says why and is empty.
    const none = await c.page('/containers/new?from=no-such-container');
    expect(none).toContain('no-such-container cannot be duplicated: there is no such container.');
    expect(formFields(none).image).toBe('');
    expect(await c.page('/containers/new?from=..%2Fx')).toContain('cannot be duplicated: that is not a container name or ID.');
  }, 60000);

  test('Duplicate says when the tag has moved to another image, and refuses when it names none', async () => {
    expect((await api(`/images/busybox:1.36/tag?repo=${MOVED}&tag=1`, { method: 'POST' })).status).toBe(201);
    await c.page('/containers/new');
    expect((await c.submit('/containers', { image: `${MOVED}:1`, name: MV, cmd: 'sleep 600', start: '' })).error).toBe('');
    expect(await c.page(`/containers/new?from=${MV}`)).not.toContain('the tag has moved since');
    // The tag moves to another image (a rebuild): the form says so.
    expect((await api(`/commit?container=${MV}&repo=${MOVED}&tag=1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(201);
    expect(await c.page(`/containers/new?from=${MV}`)).toContain('the tag has moved since');
    // The tag gone, the image here only by ID: no button, and the reason.
    expect((await api(`/images/${MOVED}:1`, { method: 'DELETE' })).status).toBe(200);
    expect(await c.page(`/containers/new?from=${MV}`)).toContain(`${MOVED}:1 no longer names an image on this host`);
    expect(await c.page(`/containers/${MV}`)).not.toContain('>Duplicate</a>');
  }, 60000);

  test('the images page says which containers use each image, and lists the unused ones', async () => {
    const all = await c.page('/images');
    expect(all).toContain('<th>Used by</th>');
    expect(all).toContain(NAME);
    expect(all).toContain('href="/images?unused=1"');
    const unused = await c.page('/images?unused=1');
    expect(unused).toContain('no container uses. <a href="/images">Show all</a>');
    expect(unused).not.toContain('busybox:1.36');
  });

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

describe.skipIf(!DOCKER)('labels on create and edit', () => {
  let srv: Running, c: Client;
  const L = `cr-lab-${run}`;
  beforeAll(async () => { ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' })); }, 60000);
  afterAll(async () => { await api(`/containers/${L}?force=1`, { method: 'DELETE' }); await srv?.stop(); });
  test('set, kept by Edit, changed by Edit; reserved names refused', async () => {
    await c.page('/containers/new');
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: L, pull: 'on', cmd: 'sleep 600', start: 'on', labels: 'team=web\nkontainers.autoupdate=true' })).error).toBe('');
    expect((await inspect(L)).Config.Labels).toMatchObject({ team: 'web', 'kontainers.autoupdate': 'true', 'kontainers.managed': 'true' });
    expect(await c.page(`/containers/${L}`)).toContain('the container has the label <code>kontainers.autoupdate=true</code>');
    const edit = await c.page(`/containers/${L}/edit`);
    expect(edit).toContain('team=web');
    expect((await c.submit(`/containers/${L}/edit`, { image: 'busybox:1.36', cmd: 'sleep 600', ports: '', env: '', volumes: '', restart: 'no', labels: 'team=api' })).error).toBe('');
    const now = (await inspect(L)).Config.Labels;
    expect(now.team).toBe('api');
    expect(now['kontainers.autoupdate']).toBeUndefined();
    await c.page('/containers/new');
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: `cr-lab2-${run}`, cmd: 'true', labels: 'com.docker.compose.project=x' })).error).toContain('sets itself');
  }, 60000);
});

describe.skipIf(!DOCKER)('labels an image carries', () => {
  let srv: Running, c: Client;
  const X = `cr-inh-${run}`, IMG = `cr-inh-img${run}:1`;
  beforeAll(async () => {
    const tmp = `cr-inh-tmp-${run}`;
    await api('/images/create?fromImage=busybox&tag=1.36', { method: 'POST' }).then(r => r.text());
    expect((await api(`/containers/create?name=${tmp}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Image: 'busybox:1.36', Cmd: ['true'] }) })).status).toBe(201);
    const [repo, tag] = IMG.split(':');
    expect((await api(`/commit?container=${tmp}&repo=${repo}&tag=${tag}&changes=${encodeURIComponent('LABEL kontainers.managed=true\nLABEL kontainers.autoupdate=true')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(201);
    await api(`/containers/${tmp}?force=1`, { method: 'DELETE' });
    expect((await api(`/containers/create?name=${X}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Image: IMG, Cmd: ['sleep', '600'], HostConfig: { CapAdd: ['NET_ADMIN'] } }) })).status).toBe(201);
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' }));
  }, 60000);
  afterAll(async () => { await api(`/containers/${X}?force=1`, { method: 'DELETE' }); await api(`/images/${IMG}?force=1`, { method: 'DELETE' }); await srv?.stop(); });
  test('do not make a docker run container look made in kontainers, nor opt it into automatic updates', async () => {
    expect(await c.page(`/containers/${X}/edit`)).toContain('only containers created in kontainers can be edited here');
    expect(await c.page(`/containers/new?from=${X}`)).toContain(`${X} cannot be duplicated: only containers created in kontainers can be duplicated.`);
    expect(await c.page(`/containers/${X}`)).not.toContain('>Duplicate</a>');
    const page = await c.page(`/containers/${X}`);
    expect(page).not.toContain('the container has the label');
    expect(page).toContain('Created outside kontainers');
    expect(page).toContain('name="on"'); // the switch, off
  });
});
