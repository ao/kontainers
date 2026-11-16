// Clean up against a real daemon: only what no container uses goes, named volumes never do.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run; skipped otherwise.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const REPO = `kc${run}/img`;
const USER = `k-${run}-user`, ANONMAKER = `k-${run}-anon`;
const NET_UNUSED = `kc-net-${run}`, NET_USED = `kc-used-${run}`, NAMED = `kc-named-${run}`;

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
}
const post = (path: string, body?: unknown) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const exists = async (path: string) => (await api(path)).status === 200;
async function commit(tag: string, label: string): Promise<string> {
  const tmp = `kc-tmp-${Math.random().toString(36).slice(2, 8)}`;
  expect((await post(`/containers/create?name=${tmp}`, { Image: 'busybox:1.36', Cmd: ['true'] })).status).toBe(201);
  const r = await post(`/commit?container=${tmp}&repo=${encodeURIComponent(REPO)}&tag=${tag}&changes=${encodeURIComponent(`LABEL kc=${label}`)}`, {});
  expect(r.status).toBe(201);
  await api(`/containers/${tmp}?force=1`, { method: 'DELETE' });
  return ((await r.json()) as any).Id;
}

describe.skipIf(!DOCKER)('clean up', () => {
  let srv: Running, c: Client;
  let dangling = '', unused = '', inUse = '';
  beforeAll(async () => {
    ({ srv, c } = await readyServer());
    await c.page('/images');
    expect((await c.submit('/images/pull', { ref: 'busybox:1.36' })).error).toBe('');
    dangling = await commit('1', `a-${run}`);
    await commit('1', `b-${run}`); // moves REPO:1, leaving the first image untagged
    unused = await commit('2', `c-${run}`);
    expect((await api(`/images/${unused}/tag?repo=${encodeURIComponent(REPO)}&tag=two-tags`, { method: 'POST' })).status).toBe(201);
    inUse = await commit('3', `d-${run}`);
    expect((await post(`/networks/create`, { Name: NET_UNUSED })).status).toBe(201);
    expect((await post(`/networks/create`, { Name: NET_USED })).status).toBe(201);
    expect((await post(`/containers/create?name=${USER}`, { Image: `${REPO}:3`, Cmd: ['sleep', '600'], HostConfig: { NetworkMode: NET_USED } })).status).toBe(201);
    expect((await post(`/volumes/create`, { Name: NAMED })).status).toBe(201);
    // An anonymous volume left behind by a container removed without its volumes.
    expect((await post(`/containers/create?name=${ANONMAKER}`, { Image: 'busybox:1.36', Cmd: ['true'], Volumes: { '/data': {} } })).status).toBe(201);
    await api(`/containers/${ANONMAKER}`, { method: 'DELETE' });
  });
  afterAll(async () => {
    await api(`/containers/${USER}?force=1`, { method: 'DELETE' });
    for (const n of [NET_UNUSED, NET_USED]) await api(`/networks/${n}`, { method: 'DELETE' });
    await api(`/volumes/${NAMED}`, { method: 'DELETE' });
    await srv.stop();
    // Later test files expect busybox to be there.
    await (await post('/images/create?fromImage=busybox&tag=1.36')).text();
  });

  test('the page lists what no container uses', async () => {
    const page = await c.page('/cleanup');
    expect(page).toContain(`${REPO}:2`);
    expect(page).toContain(`${REPO}:two-tags`);
    expect(page).not.toContain(`${REPO}:3`); // used by a stopped container
    expect(page).toContain(NET_UNUSED);
    expect(page).not.toContain(NET_USED);
    expect(page).not.toContain(NAMED);
    expect(page).toMatch(/named volumes? (is|are) not mounted by any container/);
  });

  test('untagged images go; tagged and used ones stay', async () => {
    const r = await c.submit('/cleanup/images', { scope: 'dangling' });
    expect(r.error).toBe('');
    expect(r.flash).toMatch(/^Removed \d+ images? \(up to [\d.]+ MB\)/);
    expect(await exists(`/images/${dangling}/json`)).toBe(false);
    expect(await exists(`/images/${unused}/json`)).toBe(true);
    expect(await exists(`/images/${inUse}/json`)).toBe(true);
  });

  test('every unused pulled image goes, a two-tag one too; built ones and used ones stay', async () => {
    // A pulled image, under a second tag too.
    await (await post('/images/create?fromImage=alpine&tag=3.18')).text();
    const pulled = ((await (await api('/images/alpine:3.18/json')).json()) as any).Id;
    expect((await api(`/images/alpine:3.18/tag?repo=kc${run}/alpine&tag=x`, { method: 'POST' })).status).toBe(201);
    const page = await c.page('/cleanup');
    expect(page).toContain('Images built on this host');
    expect(page).toContain(`${REPO}:2`); // committed here: listed as built here
    const r = await c.submit('/cleanup/images', { scope: 'unused' });
    expect(r.error).toBe('');
    expect(await exists(`/images/${pulled}/json`)).toBe(false);
    expect(await exists(`/images/${unused}/json`)).toBe(true); // built here, cannot be pulled again
    expect(await exists(`/images/${inUse}/json`)).toBe(true);
  });

  test('unused networks go, connected ones stay', async () => {
    const r = await c.submit('/cleanup/networks', {});
    expect(r.flash).toMatch(/^Removed [1-9]\d* networks?\./);
    expect(await exists(`/networks/${NET_UNUSED}`)).toBe(false);
    expect(await exists(`/networks/${NET_USED}`)).toBe(true);
    expect(await exists('/networks/bridge')).toBe(true);
  });

  test('anonymous volumes go, named ones never do', async () => {
    const before = ((await (await api('/volumes')).json()) as any).Volumes.map((v: any) => v.Name);
    expect((await c.submit('/cleanup/volumes', {})).error).toContain('none was selected');
    // Each one is chosen by hand; tick every one the page offers.
    const offered = [...(await c.page('/cleanup')).matchAll(/name="(vol_[0-9a-f]{64})"/g)].map(m => m[1]);
    expect(offered.length).toBeGreaterThan(0);
    const r = await c.submit('/cleanup/volumes', Object.fromEntries(offered.map(k => [k, 'on'])));
    expect(r.flash).toMatch(/^Removed [1-9]\d* anonymous volumes?\./);
    const after = ((await (await api('/volumes')).json()) as any).Volumes.map((v: any) => v.Name);
    expect(after).toContain(NAMED);
    for (const n of before.filter((x: string) => !/^[0-9a-f]{64}$/.test(x))) expect(after).toContain(n);
  });

  test('the actions are POST-only and need the CSRF token', async () => {
    expect((await c.post('/cleanup/images', { scope: 'unused' }, { csrf: false })).status).toBe(403);
    expect((await c.get('/cleanup/images')).status).toBe(404);
  });
});
