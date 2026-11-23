import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { migrate } from '../../src/db';
import { History, describe as say } from '../../src/history';
import { containerPage, containersPage } from '../../src/views';

const db = () => { const d = new Database(':memory:'); migrate(d); return d; };
let t = 1_700_000_000_000;
const ev = (action: string, id: string, attrs: Record<string, string> = {}) => ({ Type: 'container', Action: action, Actor: { ID: id, Attributes: attrs }, timeNano: (t += 1000) * 1e6 });
const A = 'a'.repeat(64), B = 'b'.repeat(64);

describe('container history', () => {
  test('the events worth showing, by name, newest first; nothing else, and no labels', () => {
    const h = new History(db(), 30, () => t);
    h.record(ev('create', A, { name: 'web', image: 'nginx:1', 'com.example.secret': 'x' }));
    h.record(ev('start', A, { name: 'web' }));
    h.record(ev('exec_start: sh -c true', A, { name: 'web' }));
    h.record(ev('health_status: unhealthy', A, { name: 'web' }));
    h.record(ev('kill', A, { name: 'web', signal: '15' }));
    h.record(ev('die', A, { name: 'web', exitCode: '143' }));
    h.record({ Type: 'image', Action: 'pull', Actor: { ID: 'x', Attributes: {} } });
    const rows = h.forName('web');
    expect(rows.map(say)).toEqual(['stopped with exit code 143', 'sent signal 15', 'turned unhealthy', 'started', 'created from nginx:1']);
    expect(JSON.stringify(rows)).not.toContain('secret');
  });
  test('an update: the set-aside old container is filed under the name; the stream and the replay can overlap', () => {
    const h = new History(db(), 30, () => t);
    const stop = ev('rename', A, { name: 'web-old-1a2b3c4d', oldName: '/web' });
    h.record(stop);
    h.record(stop); // the same event again (the replay at start)
    h.record(ev('create', B, { name: 'web', image: 'nginx:2' }));
    h.record(ev('destroy', A, { name: 'web-old-1a2b3c4d' }));
    const rows = h.forName('web');
    expect(rows.map(r => [say(r), r.container_id[0]])).toEqual([['removed', 'a'], ['created from nginx:2', 'b'], ['renamed from web', 'a']]);
    expect(h.lastSeconds()).toBeCloseTo(t / 1000, 0);
  });
  test('kept for the days set, and at most 2000 entries a name; 0 days records nothing', () => {
    const d = db();
    const h = new History(d, 1, () => t);
    h.record(ev('start', A, { name: 'old' }));
    t += 2 * 86_400_000;
    for (let i = 0; i < 2010; i++) h.record(ev('restart', B, { name: 'loop' }));
    h.record(ev('start', A, { name: 'quiet' }));
    h.prune();
    expect(h.forName('old')).toEqual([]);
    expect((d.query("SELECT COUNT(*) AS n FROM container_events WHERE name = 'loop'").get() as { n: number }).n).toBe(2000);
    expect(h.forName('quiet').length).toBe(1);
    const off = new History(d, 0, () => t);
    off.record(ev('start', A, { name: 'none' }));
    expect(off.forName('none')).toEqual([]);
  });
  test('the page shows it, marks entries of an earlier container, and pages back', () => {
    const c = { Id: B, Name: '/web', Config: { Image: 'nginx:2', Labels: {} }, HostConfig: {}, State: { Status: 'exited' } };
    const rows = Array.from({ length: 50 }, (_, i) => ({ at: 1_700_000_000_000 + i, container_id: i % 2 ? A : B, name: 'web', action: 'start', detail: null }));
    const page = containerPage({ user: 'u', csrf: 'c' }, c, null, null, null, false, false, { rows, before: null, days: 30 });
    expect(page).toContain('<h2 id="history">History</h2>');
    expect(page).toContain(`an earlier container under this name, ${A.slice(0, 12)}`);
    expect(page).toContain(`href="/containers/web?before=${rows[49].at}#history">Older</a>`);
    expect(page).toContain('kept for 30 days');
  });
});

describe('bulk actions on the Containers page', () => {
  const list = [
    { Id: A, Names: ['/web'], Image: 'nginx:1', Ref: 'nginx:1', ImageID: 'sha256:1', State: 'running', Status: 'Up', Labels: {}, Ports: [] },
    { Id: B, Names: ['/db'], Image: 'postgres:17', Ref: 'postgres:17', ImageID: 'sha256:2', State: 'exited', Status: 'Exited (0)', Labels: {}, Ports: [] },
  ];
  test('a box per container and the buttons, for an administrator; none for a read-only account', () => {
    const admin = containersPage({ user: 'u', csrf: 'c' }, list);
    expect(admin).toContain(`<input type="checkbox" class="sel" form="bulk" name="sel_${A}" aria-label="Select web">`);
    expect(admin).toContain('<form method="post" action="/containers/bulk" id="bulk" class="bulk">');
    expect(admin).toContain('value="remove" class="danger"');
    const busy = containersPage({ user: 'u', csrf: 'c', busy: n => (n === 'web' ? 'being updated or edited' : null) }, list);
    expect(busy).not.toContain(`name="sel_${A}"`);
    expect(busy).toContain(`name="sel_${B}"`);
  });
});

describe('history on a full volume', () => {
  test('a write that fails for want of room is not retried for a minute, nor thrown', () => {
    let now = 1_000_000, calls = 0;
    const fake = { query: () => ({ run: () => { calls++; throw Object.assign(new Error('database or disk is full'), { code: 'SQLITE_FULL' }); } }) } as any;
    const h = new History(fake, 30, () => now);
    h.record(ev('start', A, { name: 'web' }));
    h.record(ev('stop', A, { name: 'web' }));
    expect(calls).toBe(1);
    now += 61_000;
    h.record(ev('start', A, { name: 'web' }));
    expect(calls).toBe(2);
    // Any other error is not hidden.
    const broken = new History({ query: () => ({ run: () => { throw new Error('no such table'); } }) } as any, 30, () => now);
    expect(() => broken.record(ev('start', A, { name: 'web' }))).toThrow('no such table');
  });
});
