// The Activity page: what was done, by whom, including failures, with search and paging.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run; skipped otherwise.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const NAME = `k-${run}-act`;

describe.skipIf(!DOCKER)('activity', () => {
  let srv: Running, c: Client;
  beforeAll(async () => {
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' }));
    await c.page('/images');
    expect((await c.submit('/images/pull', { ref: 'busybox:1.36' })).error).toBe('');
  });
  afterAll(async () => {
    await fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41/containers/${NAME}?force=1`, { method: 'DELETE' });
    await srv.stop();
  });

  test('actions and failed attempts are listed, newest first', async () => {
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: NAME, pull: '', cmd: 'sleep 600', start: 'on' })).error).toBe('');
    expect((await c.submit(`/containers/${NAME}/remove`, {})).error).not.toBe('');
    expect((await c.submit(`/containers/${NAME}/stop`, {})).error).toBe('');
    await new Client(srv.base).post('/login', { username: 'admin', password: 'wrong password!!' }, { csrf: false });
    await new Client(srv.base).post('/login', { username: 'Secret-Typed-Here', password: 'x' }, { csrf: false });
    const page = await c.page('/activity');
    const what = [...page.matchAll(/<td>([a-z ]+?) <span class="ref">([^<]*)<\/span>/g)].map(m => `${m[1]} ${m[2]}`);
    expect(what.slice(0, 5)).toEqual(['failed to log in (no such user)', 'failed to log in admin', `stopped ${NAME}`, `removed ${NAME}`, `created a container ${NAME}`]);
    expect(await c.page('/activity')).not.toContain('Secret-Typed-Here');
    expect(page).toMatch(/<tr class="failed">[\s\S]*?removed <span class="ref">[^<]+<\/span><br><small class="error">failed: [^<]+<\/small>/);
    expect(page).toContain('<span class="muted">not logged in</span>');
  });

  test('search matches descriptions, names and results', async () => {
    expect(await c.page('/activity?q=stopped')).toContain(`stopped <span class="ref">${NAME}</span>`);
    const byName = await c.page(`/activity?q=${NAME}`);
    expect(byName).toContain(`created a container <span class="ref">${NAME}</span>`);
    expect(byName).not.toContain('failed to log in');
    expect(await c.page('/activity?q=%25')).toContain('Nothing matches.'); // a literal %, not a wildcard
  });

  test('100 entries a page, then Older', async () => {
    // A refused notification target: quick, touches nothing, and is recorded as a failed attempt.
    for (let i = 0; i < 105; i++) await c.post('/settings/notify', { kind: 'webhook', url: 'not a url', ev_update: 'on' });
    const first = await c.page('/activity');
    expect([...first.matchAll(/<tr( class="failed")?><td>\d{4}-/g)].length).toBe(100);
    const older = /href="(\/activity\?before=\d+)"/.exec(first)![1];
    const second = await c.page(older);
    expect(second).toContain(`created a container <span class="ref">${NAME}</span>`);
    expect(second).not.toContain('Older');
  }, 60000);
});
