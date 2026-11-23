import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { migrate } from '../../src/db';
import { History, describe as say } from '../../src/history';
import { containerPage, containersPage } from '../../src/views';

const db = () => { const d = new Database(':memory:'); migrate(d); return d; };
let t = 1_700_000_000_000;
const ev = (action: string, id: string, attrs: Record<string, string> = {}, same = false) => ({ Type: 'container', Action: action, Actor: { ID: id, Attributes: attrs }, timeNano: (same ? t : (t += 1000)) * 1e6 });
const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64);
const mk = (d = db(), days = 30) => new History(d, days, () => t, () => null);

describe('container history', () => {
  test('the events worth showing, newest first; nothing else, and no labels', () => {
    const h = mk();
    h.record(ev('create', A, { name: 'web', image: 'nginx:1', 'com.example.secret': 'x' }));
    h.record(ev('start', A, { name: 'web' }));
    h.record(ev('exec_start: sh -c true', A, { name: 'web' }));
    h.record(ev('health_status: unhealthy', A, { name: 'web' }));
    h.record(ev('kill', A, { name: 'web', signal: '15' }));
    h.record(ev('die', A, { name: 'web', exitCode: '143' }));
    h.record({ Type: 'image', Action: 'pull', Actor: { ID: 'x', Attributes: {} } });
    const { rows, more } = h.forName('web', A);
    expect(rows.map(say)).toEqual(['stopped with exit code 143', 'sent SIGTERM', 'turned unhealthy', 'started', 'created from nginx:1']);
    expect(more).toBe(false);
    expect(JSON.stringify(rows)).not.toContain('secret');
  });
  test('an update: the set-aside old container is filed under the name; the stream and the replay can overlap', () => {
    const h = mk();
    const aside = ev('rename', A, { name: `web-old-${A.slice(0, 8)}`, oldName: '/web' });
    h.record(aside);
    h.record(aside); // the same event again (the replay at start)
    h.record(ev('create', B, { name: 'web', image: 'nginx:2' }));
    h.record(ev('destroy', A, { name: `web-old-${A.slice(0, 8)}` }));
    const { rows } = h.forName('web', B);
    expect(rows.map(r => [say(r), r.container_id[0]])).toEqual([['removed', 'a'], ['created from nginx:2', 'b'], ['set aside by an update or edit', 'a']]);
    expect(h.lastSeconds()).toBeCloseTo(t / 1000, 0);
  });
  test('a container really named like a set-aside one keeps its name; compose replacements keep their own entries', () => {
    const h = mk();
    h.record(ev('start', C, { name: 'pg-old-20250101' }));
    expect(h.forName('pg-old-20250101', C).rows.length).toBe(1);
    expect(h.forName('pg', A).rows.length).toBe(0);
    // compose: the replacement is made as <old id>_<name> and renamed.
    h.record(ev('create', B, { name: `${A.slice(0, 12)}_shop-web-1`, image: 'shop:2' }));
    h.record(ev('rename', B, { name: 'shop-web-1', oldName: `/${A.slice(0, 12)}_shop-web-1` }));
    expect(h.forName('shop-web-1', B).rows.map(say)).toEqual(['recreated by docker compose', 'created from shop:2']);
    // docker rename: the container's page keeps its entries (by ID); the old name says where it went.
    h.record(ev('die', C, { name: 'h-crash', exitCode: '3' }));
    h.record(ev('rename', C, { name: 'h-crash2', oldName: '/h-crash' }));
    expect(h.forName('h-crash2', C).rows.map(say)).toEqual(['renamed from h-crash', 'stopped with exit code 3', 'started']);
    expect(h.forName('h-crash', A).rows.map(say)).toEqual(['renamed to h-crash2', 'stopped with exit code 3']);
  });
  test('a rename back shows once on the page; compose recreation is said as such; a gap shows everywhere', () => {
    const h = mk();
    h.record(ev('rename', A, { name: 'rn-b', oldName: '/rn-a' }));
    h.record(ev('rename', A, { name: 'rn-a', oldName: '/rn-b' }));
    expect(h.forName('rn-a', A).rows.map(say)).toEqual(['renamed from rn-b', 'renamed from rn-a']);
    expect(say({ action: 'rename', detail: `${B.slice(0, 12)}_web`, name: 'web' })).toBe('recreated by docker compose');
    h.gap(t * 1e6 + 5);
    expect(h.forName('other', C).rows.map(r => r.action)).toEqual(['gap']);
  });
  test('a long name cut in the set-aside name is filed under the whole name', () => {
    const h = mk();
    const long = 'n'.repeat(120);
    const cut = `${long.slice(0, 115)}-old-${A.slice(0, 8)}`;
    h.record(ev('rename', A, { name: cut, oldName: `/${long}` }));
    h.record(ev('destroy', A, { name: cut }));
    expect(h.forName(long, B).rows.map(say)).toEqual(['removed', 'set aside by an update or edit']);
  });
  test('paging by the nanosecond: entries in the same millisecond are not skipped', () => {
    const h = mk();
    for (let i = 0; i < 60; i++) h.record({ ...ev('start', A, { name: 'web' }, true), timeNano: t * 1e6 + i * 1000 });
    const first = h.forName('web', A, 50);
    expect(first.rows.length).toBe(50);
    expect(first.more).toBe(true);
    const second = h.forName('web', A, 50, first.rows[49].nano);
    expect(second.rows.length).toBe(10);
    expect(second.more).toBe(false);
    expect(new Set([...first.rows, ...second.rows].map(r => r.nano)).size).toBe(60);
  });
  test('kept for the days set, and at most 2000 entries a name; 0 days records nothing', () => {
    const d = db();
    const h = mk(d, 1);
    h.record(ev('start', A, { name: 'old' }));
    t += 2 * 86_400_000;
    for (let i = 0; i < 2010; i++) h.record(ev('restart', B, { name: 'loop' }));
    h.record(ev('start', A, { name: 'quiet' }));
    h.prune();
    expect(h.forName('old', C).rows).toEqual([]);
    expect((d.query("SELECT COUNT(*) AS n FROM container_events WHERE name = 'loop'").get() as { n: number }).n).toBe(2000);
    expect(h.forName('quiet', C).rows.length).toBe(1);
    const off = mk(d, 0);
    off.record(ev('start', A, { name: 'none' }));
    expect(off.forName('none', C).rows).toEqual([]);
  });
  test('the page shows it, marks entries of another container, and pages back', () => {
    const c = { Id: B, Name: '/web', Config: { Image: 'nginx:2', Labels: {} }, HostConfig: {}, State: { Status: 'exited' } };
    const rows = Array.from({ length: 50 }, (_, i) => ({ at: 1_700_000_000_000 + i, nano: String(1_700_000_000_000_000_000n + BigInt(i)), container_id: (i % 2 ? A : B).slice(0, 16), name: 'web', action: 'start', detail: null }));
    const page = containerPage({ user: 'u', csrf: 'c' }, c, null, null, null, false, false, { rows, more: true, before: null, days: 30 });
    expect(page).toContain('<h2 id="history">History</h2>');
    expect(page).toContain(`another container under this name, ${A.slice(0, 12)}`);
    expect(page).toContain(`href="/containers/web?before=${rows[49].nano}#history">Older</a>`);
    expect(page).toContain('kept for 30 days');
    expect(containerPage({ user: 'u', csrf: 'c' }, c, null, null, null, false, false, { rows, more: false, before: null, days: 30 })).not.toContain('>Older</a>');
  });
});

describe('history on a full volume', () => {
  test('a write that fails for want of room is not retried for a minute, nor thrown', () => {
    let now = 1_000_000, calls = 0;
    const full = { query: () => ({ run: () => { calls++; throw Object.assign(new Error('database or disk is full'), { code: 'SQLITE_FULL' }); } }), transaction: (fn: () => void) => () => fn() } as any;
    const h = new History(full, 30, () => now, () => null);
    h.record(ev('start', A, { name: 'web' })); h.flush();
    h.record(ev('stop', A, { name: 'web' })); h.flush();
    expect(calls).toBe(1);
    now += 61_000;
    h.record(ev('start', A, { name: 'web' })); h.flush();
    expect(calls).toBe(2);
    // Any other error is not hidden.
    const broken = new History({ query: () => ({ run: () => { throw new Error('no such table'); } }), transaction: (fn: () => void) => () => fn() } as any, 30, () => now, () => null);
    broken.record(ev('start', A, { name: 'web' }));
    expect(() => broken.flush()).toThrow('no such table');
  });
});

describe('bulk actions on the Containers page', () => {
  const list = [
    { Id: A, Names: ['/web'], Image: 'nginx:1', Ref: 'nginx:1', ImageID: 'sha256:1', State: 'running', Status: 'Up', Labels: {}, Ports: [] },
    { Id: B, Names: ['/db'], Image: 'postgres:17', Ref: 'postgres:17', ImageID: 'sha256:2', State: 'exited', Status: 'Exited (0)', Labels: {}, Ports: [] },
  ];
  test('a box per container and the buttons, for an administrator; none for a read-only account', () => {
    const admin = containersPage({ user: 'u', csrf: 'c' }, list);
    expect(admin).toContain(`<input type="checkbox" class="sel" form="bulk" name="sel_${A}" autocomplete="off" aria-label="Select web">`);
    expect(admin).toContain('<form method="post" action="/containers/bulk" id="bulk" class="bulk">');
    expect(admin).toContain('value="remove" class="danger"');
    const busy = containersPage({ user: 'u', csrf: 'c', busy: n => (n === 'web' ? 'being updated or edited' : null) }, list);
    expect(busy).not.toContain(`name="sel_${A}"`);
    expect(busy).toContain(`name="sel_${B}"`);
    // No box anywhere: no buttons either.
    expect(containersPage({ user: 'u', csrf: 'c', busy: () => 'being updated or edited' }, list)).not.toContain('/containers/bulk');
  });
});
