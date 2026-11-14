// Update checks against a real registry: a registry:2 container inside the test daemon, so the tag
// can be moved on the registry side and kontainers has to notice through GET /distribution.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run; skipped otherwise.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const REG = `k-reg-${run}`;
const REPO = `localhost:5000/kt/app${run}`;
const REF = `${REPO}:1`;
const NAME = `k-${run}-upd`;
const AUTH = { 'X-Registry-Auth': Buffer.from('{}').toString('base64') };

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
}
// Pull and push answer 200 and report failure inside the stream.
async function stream(path: string, headers: Record<string, string> = {}) {
  const res = await api(path, { method: 'POST', headers });
  const body = await res.text();
  if (res.status !== 200 || /"error"/.test(body)) throw new Error(`${path}: ${res.status} ${body.slice(-300)}`);
}
const imageId = async (ref: string) => ((await (await api(`/images/${encodeURIComponent(ref)}/json`)).json()) as any).Id as string;
const push = async () => {
  for (let i = 0; ; i++) { // the registry takes a moment to listen
    try { return await stream(`/images/${encodeURIComponent(REPO)}/push?tag=1`, AUTH); } catch (e) { if (i > 20) throw e; await Bun.sleep(500); }
  }
};

describe.skipIf(!DOCKER)('update checks', () => {
  let srv: Running, c: Client;
  beforeAll(async () => {
    await stream('/images/create?fromImage=registry&tag=2');
    await stream('/images/create?fromImage=busybox&tag=1.36');
    const created = await api(`/containers/create?name=${REG}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ Image: 'registry:2', HostConfig: { PortBindings: { '5000/tcp': [{ HostIp: '127.0.0.1', HostPort: '5000' }] } } }),
    });
    expect(created.status).toBe(201);
    expect((await api(`/containers/${REG}/start`, { method: 'POST' })).status).toBe(204);
    expect((await api(`/images/busybox:1.36/tag?repo=${encodeURIComponent(REPO)}&tag=1`, { method: 'POST' })).status).toBe(201);
    await push();
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' }));
  });
  afterAll(async () => {
    for (const n of [NAME, REG]) await api(`/containers/${n}?force=1&v=1`, { method: 'DELETE' });
    await srv?.stop();
  });

  test('scheduled checks can be turned off', async () => {
    expect(await c.page('/containers')).toContain('update checks are off');
  });

  test('current, then a newer image on the registry, then Update image brings it in', async () => {
    expect((await c.submit('/containers', { image: REF, name: NAME, pull: '', cmd: 'sleep 300', start: 'on' })).error).toBe('');
    const oldId = await imageId(REF);

    let r = await c.submit('/updates/check', {});
    expect(r.error).toBe('');
    expect(r.flash).toContain('every container runs the newest image');
    const id = ((await (await api(`/containers/${NAME}/json`)).json()) as any).Id;
    expect(await c.page(`/containers/${id}`)).toContain('the newest image for this tag');

    // Publish a different image under the same tag, then point the local tag back at the old one,
    // as if someone else had pushed a new release.
    const commit = await api(`/commit?container=${NAME}&repo=${encodeURIComponent(REPO)}&tag=1&changes=${encodeURIComponent('LABEL release=2')}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(commit.status).toBe(201);
    await push();
    const newId = await imageId(REF);
    expect(newId).not.toBe(oldId);
    expect((await api(`/images/${oldId}/tag?repo=${encodeURIComponent(REPO)}&tag=1`, { method: 'POST' })).status).toBe(201);

    r = await c.submit('/updates/check', {});
    expect(r.flash).toContain('1 container has a newer image');
    expect(r.body).toContain('newer image available');
    const page = await c.page(`/containers/${id}`);
    expect(page).toContain('a newer image is available for this tag');
    expect(page).toMatch(/<button class="primary">Update image<\/button>/);

    r = await c.submit(`/containers/${id}/update`, {});
    expect(r.error).toBe('');
    expect(r.flash).toContain(`Updated ${NAME}`);
    const now = (await (await api(`/containers/${NAME}/json`)).json()) as any;
    expect(now.Image).toBe(newId);
    expect(r.body).not.toContain('newer image available');
    expect(await c.page(`/containers/${now.Id}`)).toContain('the newest image for this tag');
  }, 180000);

  test('an image the registry does not know is unknown, with the reason', async () => {
    const goneRepo = `localhost:5000/kt/missing${run}`, gone = `${goneRepo}:1`;
    expect((await api(`/images/busybox:1.36/tag?repo=${encodeURIComponent(goneRepo)}&tag=1`, { method: 'POST' })).status).toBe(201);
    const n = `${NAME}-missing`;
    expect((await c.submit('/containers', { image: gone, name: n, pull: '', cmd: 'sleep 300', start: 'on' })).error).toBe('');
    const r = await c.submit('/updates/check', {});
    expect(r.error).toBe('');
    expect(r.body).not.toContain('newer image available');
    const id = ((await (await api(`/containers/${n}/json`)).json()) as any).Id;
    expect(await c.page(`/containers/${id}`)).toContain('update status unknown');
    await api(`/containers/${n}?force=1`, { method: 'DELETE' });
  }, 120000);
});
