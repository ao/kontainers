// Newer version tags against the real server: a registry served by this test process (kontainers
// lists its tags itself), and images tagged with that registry's address in the test daemon (it
// never pulls from it). Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const api = (path: string, init: RequestInit = {}) => fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
const post = (path: string, body?: unknown) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 30000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v as T; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await Bun.sleep(300); }
}

describe.skipIf(!DOCKER)('newer version tags', () => {
  let srv: Running, c: Client, reg: ReturnType<typeof Bun.serve>;
  let host = '', OUT = '', MADE = '', REPO = '';
  const asked: string[] = [];

  beforeAll(async () => {
    // A registry that wants a bearer token from its realm (anonymous here) and pages its tags.
    reg = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const u = new URL(req.url);
      asked.push(u.pathname);
      if (u.pathname === '/token') return Response.json({ token: 'T' });
      if (req.headers.get('authorization') !== 'Bearer T') return new Response('', { status: 401, headers: { 'www-authenticate': `Bearer realm="http://127.0.0.1:${reg.port}/token",service="t",scope="repository:me/app:pull"` } });
      if (u.pathname !== '/v2/me/app/tags/list') return new Response('', { status: 404 });
      const second = u.searchParams.get('last') === '1.1';
      return Response.json({ tags: second ? ['1.2', '2.0', '2.0-rc1'] : ['1.0', '1.1'] }, second ? {} : { headers: { link: '</v2/me/app/tags/list?n=1000&last=1.1>; rel="next"' } });
    } });
    host = `127.0.0.1:${reg.port}`;
    REPO = `${host}/me/app`;
    OUT = `tg-out-${run}`; MADE = `tg-made-${run}`;
    await (await post('/images/create?fromImage=busybox&tag=1.36')).text();
    expect((await post(`/images/busybox:1.36/tag?repo=${encodeURIComponent(REPO)}&tag=1.0`)).status).toBe(201);
    expect((await post(`/containers/create?name=${OUT}`, { Image: `${REPO}:1.0`, Cmd: ['sleep', '600'] })).status).toBe(201);
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' }));
    await c.page('/containers/new');
    expect((await c.submit('/containers', { image: `${REPO}:1.0`, name: MADE, cmd: 'sleep 600', start: '' })).error).toBe('');
  }, 60000);
  afterAll(async () => {
    for (const n of [OUT, MADE]) await api(`/containers/${n}?force=1`, { method: 'DELETE' });
    await api(`/images/${encodeURIComponent(REPO)}:1.0`, { method: 'DELETE' });
    reg?.stop(true);
    await srv?.stop();
  });

  test('after a check, the pages say which newer versions are tagged', async () => {
    await c.submit('/updates/check', {});
    const page = await until('the newer version on the page', async () => { const p = await c.page(`/containers/${OUT}`); return p.includes('Newer version') ? p : null; });
    expect(page).toContain(`<span class="ref">${REPO}:1.2</span>`);
    expect(page).toContain(`<span class="ref">${REPO}:2.0</span> (a new major version)`);
    expect(page).not.toContain('2.0-rc1');
    expect(page).toContain('recreate the container with that tag to use it');
    expect(await c.page('/containers')).toContain('newer version 1.2');
    // Every page of tags, with the token.
    expect(asked.filter(p => p === '/v2/me/app/tags/list').length).toBe(3);
  }, 60000);

  test('for a container made here, Edit settings opens with the newer tag filled in', async () => {
    const page = await c.page(`/containers/${MADE}`);
    const link = /href="(\/containers\/[^"]+\/edit\?image=[^"]+)">use it<\/a>/.exec(page)?.[1];
    expect(link).toBeTruthy();
    const edit = await c.page(link!.replace(/&amp;/g, '&'));
    expect(edit).toContain(`name="image" required value="${REPO}:1.2"`);
  });
});
