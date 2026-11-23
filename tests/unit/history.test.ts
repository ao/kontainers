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
    const rows = Array.from({ length: 50 }, (_, i) => ({ at: 1_700_000_000_000 + i, nano: String(1_700_000_000_000_000_000n + BigInt(i)), cursor: `${1_700_000_000_000_000_000n + BigInt(i)}-${i + 1}`, container_id: (i % 2 ? A : B).slice(0, 16), name: 'web', action: 'start', detail: null }));
    const page = containerPage({ user: 'u', csrf: 'c' }, c, null, null, null, false, false, { rows, more: true, before: null, days: 30 });
    expect(page).toContain('<h2 id="history">History</h2>');
    expect(page).toContain(`another container under this name, ${A.slice(0, 12)}`);
    expect(page).toContain(`href="/containers/web?before=${rows[49].cursor}#history">Older</a>`);
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

describe('the Events page and crash counts', () => {
  test('problems only: crashes nobody asked for, out of memory, unhealthy; a name search', () => {
    const h = mk();
    h.record(ev('start', A, { name: 'web_1%x' }));
    h.record(ev('die', A, { name: 'web_1%x', exitCode: '1' }));           // a crash
    h.record(ev('kill', B, { name: 'db', signal: '15' }));
    h.record(ev('die', B, { name: 'db', exitCode: '143' }));               // docker stop: not a crash
    h.record(ev('oom', C, { name: 'big' }));
    h.record(ev('die', C, { name: 'big', exitCode: '137' }));              // killed for memory
    h.record(ev('health_status: unhealthy', B, { name: 'db' }));
    const all = h.recent();
    expect(all.rows.length).toBe(7);
    expect(h.recent({ problems: true }).rows.map(r => `${r.name} ${say(r)}`)).toEqual(['db turned unhealthy', 'big killed (exit code 137, SIGKILL)', 'big ran out of memory', 'web_1%x stopped with exit code 1']);
    // % and _ are taken as they are, not as wildcards.
    expect(h.recent({ q: '1%' }).rows.map(r => r.name)).toEqual(['web_1%x', 'web_1%x']);
    expect(h.recent({ q: 'd_' }).rows).toEqual([]);
    expect(h.crashes(0)).toEqual(new Map([[A.slice(0, 16), 1], [C.slice(0, 16), 1]]));
  });
  test('the Containers page: a crash count, and three or more in a day need attention', () => {
    const list = [
      { Id: A, Names: ['/web'], Image: 'nginx:1', Ref: 'nginx:1', ImageID: 'sha256:1', State: 'running', Status: 'Up 2 minutes', Labels: {}, Ports: [] },
      { Id: B, Names: ['/db'], Image: 'pg:17', Ref: 'pg:17', ImageID: 'sha256:2', State: 'running', Status: 'Up 1 hour', Labels: {}, Ports: [] },
    ];
    const page = containersPage({ user: 'u', csrf: 'c' }, list, null, null, undefined, new Map([[A.slice(0, 16), 4], [B.slice(0, 16), 1]]));
    expect(page).toContain('crashed 4 times in 24 h');
    expect(page).toContain('crashed once in 24 h');
    expect(page).toMatch(/<tr data-name="web"[^>]*data-attention="1"/);
    expect(page).not.toMatch(/<tr data-name="db"[^>]*data-attention="1"/);
    expect(page).toContain('1 needs attention');
    const only = containersPage({ user: 'u', csrf: 'c' }, list, null, null, { q: '', state: 'attention', group: false }, new Map([[A.slice(0, 16), 4]]));
    expect(only).toMatch(/<tr data-name="web"[^>]*data-attention="1"(?![^>]*hidden)/);
    expect(only).toMatch(/<tr data-name="db"[^>]* hidden>/);
  });
  test('the page, with its filter and paging; off when the history is', async () => {
    const { eventsPage } = await import('../../src/views');
    const rows = [{ at: 1_700_000_000_000, nano: '1700000000000000000', cursor: '1700000000000000000-2', container_id: 'a'.repeat(16), name: 'web', action: 'start', detail: null },
      { at: 1_700_000_000_000, nano: '1700000000000000000', cursor: '1700000000000000000-3', container_id: 'b'.repeat(16), name: 'gone', action: 'die', detail: '1' },
      { at: 1_700_000_000_000, nano: '1699999999000000000', cursor: '1699999999000000000-1', container_id: '', name: '*', action: 'gap', detail: null }];
    const page = eventsPage({ user: 'u', csrf: 'c' }, { rows, more: true }, { q: 'we', problems: true, before: null }, 30, new Map([['web', 'web']]));
    expect(page).toContain('<a href="/containers/web#history">web</a>');
    // A removed container has no page: its name searches the Events.
    expect(page).toContain('<a href="/events?q=gone">gone</a> <small class="muted">removed</small>');
    expect(page).toContain('some of what happened before this may be missing');
    expect(page).toContain('href="/events?q=we&amp;problems=1&amp;before=1699999999000000000-1">Older</a>');
    expect(page).toContain('aria-current="page">Events</a>');
    expect(eventsPage({ user: 'u', csrf: 'c' }, null, { q: '', problems: false, before: null }, 0)).toContain('The container history is off');
  });
});

describe('what counts as a crash', () => {
  test('after a restart the next crash counts; a long stop does not; a reload signal is not a stop', () => {
    const h = mk();
    const at = (ms: number, action: string, id: string, attrs: Record<string, string>) => ({ Type: 'container', Action: action, Actor: { ID: id, Attributes: attrs }, timeNano: (t + ms) * 1e6 });
    // docker restart, then a crash 5 s later: the restart's own die is asked for, the next is not.
    h.record(at(0, 'start', A, { name: 'app' }));
    h.record(at(1000, 'kill', A, { name: 'app', signal: '15' }));
    h.record(at(1100, 'die', A, { name: 'app', exitCode: '143' }));
    h.record(at(1200, 'stop', A, { name: 'app' }));
    h.record(at(1300, 'start', A, { name: 'app' }));
    h.record(at(6300, 'die', A, { name: 'app', exitCode: '1' }));
    // A graceful stop that takes 70 s and exits 1: asked for.
    h.record(at(0, 'start', B, { name: 'es' }));
    h.record(at(1000, 'kill', B, { name: 'es', signal: 'SIGTERM' }));
    h.record(at(71000, 'die', B, { name: 'es', exitCode: '1' }));
    // A reload signal, then the process exits 1: a crash.
    h.record(at(0, 'start', C, { name: 'nginx' }));
    h.record(at(1000, 'kill', C, { name: 'nginx', signal: '1' }));
    h.record(at(2000, 'die', C, { name: 'nginx', exitCode: '1' }));
    t += 100_000;
    expect(h.crashes(0)).toEqual(new Map([[A.slice(0, 16), 1], [C.slice(0, 16), 1]]));
    expect(h.recent({ problems: true }).rows.map(r => r.name).sort()).toEqual(['app', 'nginx']);
  });
  test('paging through rows that share a nanosecond, across containers', () => {
    const h = mk();
    const nano = (t += 1000) * 1e6;
    for (let i = 0; i < 150; i++) h.record({ Type: 'container', Action: 'start', Actor: { ID: i.toString(16).padStart(4, '0').padEnd(64, 'f'), Attributes: { name: `c${i}` } }, timeNano: nano });
    const seen: string[] = [];
    let before: string | undefined;
    for (let p = 0; p < 5; p++) {
      const pg = h.recent({ limit: 40, before });
      seen.push(...pg.rows.map(r => r.name));
      if (!pg.more) break;
      before = pg.rows[pg.rows.length - 1].cursor;
    }
    expect(seen.length).toBe(150);
    expect(new Set(seen).size).toBe(150);
  });
});
