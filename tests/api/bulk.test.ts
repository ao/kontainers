// Bulk actions on the Containers page, and the container history, against the real server.
// Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const A = `bk-a-${run}`, B = `bk-b-${run}`, C = `bk-c-${run}`;
const api = (path: string, init: RequestInit = {}) => fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
const inspect = async (name: string) => (await (await api(`/containers/${name}/json`)).json()) as any;
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 30000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v as T; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await Bun.sleep(300); }
}

describe.skipIf(!DOCKER)('bulk actions and history', () => {
  let srv: Running, c: Client;
  const id: Record<string, string> = {};
  beforeAll(async () => {
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' }));
    for (const n of [A, B, C]) {
      await c.page('/containers/new');
      expect((await c.submit('/containers', { image: 'busybox:1.36', name: n, pull: 'on', cmd: `sh -c 'trap "exit 0" TERM; while true; do sleep 1; done'`, start: 'on' })).error).toBe('');
      id[n] = (await inspect(n)).Id;
    }
  }, 90000);
  afterAll(async () => {
    for (const n of [A, B, C]) await api(`/containers/${n}?force=1`, { method: 'DELETE' });
    await srv?.stop();
  });

  test('Stop, then Remove of the stopped ones only; what was left is said', async () => {
    await c.page('/containers');
    const stop = await c.submit('/containers/bulk', { op: 'stop', [`sel_${id[A]}`]: 'on', [`sel_${id[B]}`]: 'on' });
    expect(stop.error).toBe('');
    expect(stop.flash).toBe(`Stopped ${A}, ${B}.`);
    expect((await inspect(A)).State.Running).toBe(false);
    expect((await inspect(C)).State.Running).toBe(true);
    // Each one on Activity, by name.
    expect(await c.page(`/activity?q=${A}`)).toContain('one of the ticked containers');
    // The same container ticked by ID and by name is acted on once.
    const twice = await c.submit('/containers/bulk', { op: 'start', [`sel_${id[A]}`]: 'on', [`sel_${A}`]: 'on' });
    expect(twice.flash).toBe(`Started ${A}.`);
    await c.submit('/containers/bulk', { op: 'stop', [`sel_${id[A]}`]: 'on' });
    const rm = await c.submit('/containers/bulk', { op: 'remove', [`sel_${id[A]}`]: 'on', [`sel_${id[C]}`]: 'on' });
    expect(rm.flash).toBe(`Removed ${A}; left as they are: ${C} (running).`);
    expect((await api(`/containers/${A}/json`)).status).toBe(404);
    expect((await inspect(C)).State.Running).toBe(true);
    // Nothing ticked, or an unknown action: refused, nothing done.
    expect((await c.submit('/containers/bulk', { op: 'stop' })).error).toBe('tick the containers to act on first');
    expect((await c.submit('/containers/bulk', { op: 'kill', [`sel_${id[C]}`]: 'on' })).error).toBe('choose Start, Restart, Stop or Remove');
    expect((await inspect(C)).State.Running).toBe(true);
  }, 60000);

  test("the container page shows what happened to it, from Docker's events", async () => {
    await c.page('/containers');
    expect((await c.submit('/containers/bulk', { op: 'start', [`sel_${id[B]}`]: 'on' })).flash).toBe(`Started ${B}.`);
    const page = await until('the history', async () => { const p = await c.page(`/containers/${B}`); return p.includes('stopped on request') && /<td>started<\/td>[\s\S]*<td>stopped/.test(p) ? p : null; });
    expect(page).toContain('<h2 id="history">History</h2>');
    expect(page).toContain('created from busybox:1.36');
  }, 60000);
});
