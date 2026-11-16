import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../../src/db';
import { AutoUpdates } from '../../src/autoupdate';
import { UpdateChecker } from '../../src/updates';
import { settleProblem } from '../../src/update';

// An in-memory Docker: images by ID with a behaviour, local tags, a registry, and containers.
class FakeDocker {
  images = new Map<string, { Id: string; behaviour: 'ok' | 'crash' | 'unhealthy' }>();
  tags = new Map<string, string>(); // ref -> image ID, locally
  registry = new Map<string, string>(); // ref -> image ID the registry serves
  containers = new Map<string, any>();
  pulls: string[] = [];
  private n = 0;

  image(id: string, behaviour: 'ok' | 'crash' | 'unhealthy' = 'ok') { this.images.set(id, { Id: id, behaviour }); }
  find(idOrName: string) {
    const c = this.containers.get(idOrName) || [...this.containers.values()].find(x => x.Name === '/' + idOrName);
    if (!c) throw Object.assign(new Error(`No such container: ${idOrName}`), { status: 404 });
    return c;
  }
  run(name: string, ref: string, managed = true) {
    const id = `c${++this.n}`.padEnd(12, '0');
    this.containers.set(id, {
      Id: id, Name: '/' + name, Image: this.tags.get(ref), RestartCount: 0, Created: this.n,
      Config: { Image: ref, Env: [], Labels: managed ? { 'kontainers.managed': 'true' } : {} },
      HostConfig: { PortBindings: {}, Mounts: [], RestartPolicy: { Name: 'unless-stopped' } },
      NetworkSettings: { Networks: { bridge: {} } }, State: { Running: true, Status: 'running' },
    });
    return id;
  }
  async listContainers() { return [...this.containers.values()].map(c => ({ Id: c.Id, Names: [c.Name], Image: c.Config.Image, ImageID: c.Image, State: c.State.Status, Labels: c.Config.Labels, Created: c.Created ?? 0 })); }
  async listContainersWithRefs() { return (await this.listContainers()).map(c => ({ ...c, Ref: c.Image })); }
  async inspect(id: string) { return structuredClone(this.find(id)); }
  async inspectImage(ref: string) {
    const id = this.tags.get(ref) ?? (this.images.has(ref) ? ref : undefined);
    if (!id) throw Object.assign(new Error('No such image'), { status: 404 });
    const repo = ref.split(':')[0];
    return { Id: id, Config: { Env: [] }, RepoDigests: [`${repo}@sha256:${id}`] };
  }
  async distribution(ref: string) { return { Descriptor: { digest: `sha256:${this.registry.get(ref)}` } }; }
  async pull(ref: string) { this.pulls.push(ref); this.tags.set(ref, this.registry.get(ref)!); }
  async stop(id: string) { const c = this.find(id); c.State = { Running: false, Status: 'exited', ExitCode: 0 }; }
  async start(id: string) {
    const c = this.find(id);
    if (this.killOnStart) { this.killed.add(c.Id); c.State = { Running: false, Status: 'exited', ExitCode: 143 }; return; }
    const b = this.images.get(c.Image)?.behaviour ?? 'ok';
    c.State = b === 'crash' ? { Running: false, Status: 'exited', ExitCode: 1 }
      : b === 'unhealthy' ? { Running: true, Status: 'running', Health: { Status: 'unhealthy' } } : { Running: true, Status: 'running' };
  }
  async rename(id: string, name: string) {
    if ([...this.containers.values()].some(x => x.Name === '/' + name && x.Id !== this.find(id).Id)) throw new Error('name in use');
    this.find(id).Name = '/' + name;
  }
  async create(spec: any) {
    const id = `c${++this.n}`.padEnd(12, '0');
    this.containers.set(id, {
      Id: id, Name: '/' + spec.name, Image: this.tags.get(spec.image), RestartCount: 0,
      Config: { Image: spec.image, Env: spec.env, Labels: { 'kontainers.managed': 'true' } },
      HostConfig: { PortBindings: {}, Mounts: [], RestartPolicy: { Name: spec.restart } },
      NetworkSettings: { Networks: { bridge: {} } }, State: { Running: false, Status: 'created' },
    });
    return { Id: id };
  }
  async connect() {}
  // Containers someone stopped on purpose: the events API reports a kill for them. killOnStart:
  // every container started from now on is "stopped by someone" at once.
  killed = new Set<string>();
  killOnStart = false;
  async pastEvents(f: { container: string[] }) { return f.container.filter(id => this.killed.has(id)).map(id => ({ Action: 'kill', Actor: { ID: id } })); }
  createBody() { return {}; }
  async remove(id: string) { this.containers.delete(this.find(id).Id); }
}

function setup() {
  const d = new FakeDocker();
  d.image('i1'); d.image('i2'); d.image('i3', 'crash'); d.image('i4'); d.image('i5', 'unhealthy');
  d.tags.set('app:1', 'i1'); d.registry.set('app:1', 'i1');
  const db = new Database(':memory:', { strict: true }); migrate(db);
  const checker = new UpdateChecker(d as any, 0);
  const sent: { kind: string; title: string; key?: string }[] = [];
  const notifier = { send: async (n: any, key?: string) => { sent.push({ kind: n.kind, title: n.title, key }); return 1; } };
  const audit: string[] = [];
  const auto = new AutoUpdates(db, d as any, checker, notifier as any, { settleMs: 0, healthTimeoutMs: 0 }, (a, t, r) => audit.push(`${a} ${t}${r ? ` (${r.slice(0, 21)})` : ''}`));
  const cycle = async () => { await checker.checkAll(); await auto.afterCheck(); };
  return { d, db, checker, sent, audit, auto, cycle };
}

const running = (d: FakeDocker, name: string) => d.find(name);

describe('AutoUpdates', () => {
  test('an opted-in container is updated to the newer image and stays opted in', async () => {
    const { d, auto, sent, audit, cycle } = setup();
    const id = d.run('web', 'app:1');
    expect(await auto.set(id, true)).toContain('updated automatically');
    d.registry.set('app:1', 'i2');
    await cycle();
    const now = running(d, 'web');
    expect(now.Image).toBe('i2');
    expect(now.Id).not.toBe(id);
    expect(now.State.Running).toBe(true);
    expect(d.containers.size).toBe(1);
    expect(auto.get('web')).toMatchObject({ container_id: now.Id, held_image: null, last_result: 'Updated web to the newest app:1.' });
    expect(auto.isOn('web', now.Id)).toBe(true);
    expect(sent).toEqual([{ kind: 'autoupdate', title: 'Updated web', key: undefined }]);
    expect(audit).toEqual(['auto-update web']);
    // Nothing newer: the next cycle does nothing.
    d.pulls.length = 0;
    await cycle();
    expect(d.pulls).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test('a new image that crashes is rolled back and held back; a newer good one is tried', async () => {
    const { d, auto, sent, audit, cycle } = setup();
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    d.registry.set('app:1', 'i3');
    await cycle();
    let now = running(d, 'web');
    expect(now.Id).toBe(id);
    expect(now.Image).toBe('i1');
    expect(now.State.Running).toBe(true);
    expect(d.containers.size).toBe(1);
    expect(auto.get('web')).toMatchObject({ held_image: 'i3' });
    expect(auto.get('web')!.last_result).toContain('old container was put back: the new container stopped with exit code 1');
    expect(sent.map(s => s.title)).toEqual(['Update of web failed']);
    expect(audit).toEqual(['auto-update web (failed: update failed)']);

    // The same bad image again: not pulled, not tried, no new note.
    d.pulls.length = 0;
    await cycle();
    expect(d.pulls).toEqual([]);
    expect(running(d, 'web').Id).toBe(id);
    expect(sent).toHaveLength(1);

    // A newer, good image: tried, and the hold is cleared.
    d.registry.set('app:1', 'i4');
    await cycle();
    now = running(d, 'web');
    expect(now.Image).toBe('i4');
    expect(auto.get('web')).toMatchObject({ held_image: null, container_id: now.Id });
    expect(sent.map(s => s.title)).toEqual(['Update of web failed', 'Updated web']);
  });

  test('an image that turns unhealthy is rolled back', async () => {
    const { d, auto, cycle } = setup();
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    d.registry.set('app:1', 'i5');
    await cycle();
    expect(running(d, 'web').Id).toBe(id);
    expect(auto.get('web')!.last_result).toContain('the new container is unhealthy');
  });

  test('containers not opted in get one "newer image" note per new image, naming every container', async () => {
    const { d, sent, cycle } = setup();
    d.run('web', 'app:1');
    d.run('web2', 'app:1');
    d.run('web3', 'app:1');
    d.registry.set('app:1', 'i2');
    await cycle();
    await cycle();
    expect(running(d, 'web').Image).toBe('i1');
    // The Notifier's key decides what goes out: the same key each time, one note per check.
    expect(sent.map(s => [s.kind, s.title, s.key])).toEqual([['update', 'Newer image for app:1', 'update:app:1|sha256:i2'], ['update', 'Newer image for app:1', 'update:app:1|sha256:i2']]);
  });

  test('a container someone stops while it settles keeps the new image; nothing is held back', async () => {
    const { d, auto, sent, cycle } = setup();
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    d.registry.set('app:1', 'i3'); // stops at once, as a container stopped by docker stop would
    d.killOnStart = true;
    await cycle();
    const now = running(d, 'web');
    expect(now.Id).not.toBe(id);
    expect(now.Image).toBe('i3');
    expect(d.containers.size).toBe(1);
    expect(auto.get('web')).toMatchObject({ held_image: null, container_id: now.Id });
    expect(auto.get('web')!.last_result).toContain('stopped by someone');
    expect(sent.map(s => s.title)).toEqual(['Updated web']);
  });

  test('kontainers stopping while the new container settles: the old one is put back, nothing is held, no note', async () => {
    const d = new FakeDocker();
    d.image('i1'); d.image('i2');
    d.tags.set('app:1', 'i1'); d.registry.set('app:1', 'i1');
    const db = new Database(':memory:', { strict: true }); migrate(db);
    const checker = new UpdateChecker(d as any, 0);
    const sent: string[] = [];
    const stop = new AbortController();
    const auto = new AutoUpdates(db, d as any, checker, { send: async (n: any) => { sent.push(n.title); return 1; } } as any, { settleMs: 1000, healthTimeoutMs: 0, signal: stop.signal });
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    d.registry.set('app:1', 'i2');
    setTimeout(() => stop.abort(), 200);
    await checker.checkAll(); await auto.afterCheck();
    expect(running(d, 'web').Id).toBe(id);
    expect(running(d, 'web').State.Running).toBe(true);
    expect(d.containers.size).toBe(1);
    expect(auto.get('web')).toMatchObject({ held_image: null, container_id: id });
    expect(auto.get('web')!.last_result).toContain('kontainers was stopped');
    expect(sent).toEqual([]);
  });

  test('with a full data volume the new ID is kept in memory, so the container stays opted in', async () => {
    const { d, db, auto, cycle } = setup();
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    let full = true;
    const query = db.query.bind(db);
    (db as any).query = (sql: string) => {
      if (full && /^UPDATE auto_update/.test(sql)) throw new Error('database or disk is full');
      return query(sql);
    };
    d.registry.set('app:1', 'i2');
    await cycle();
    const now = running(d, 'web');
    expect(now.Image).toBe('i2');
    expect(auto.isOn('web', now.Id)).toBe(true);
    expect(auto.get('web')!.container_id).toBe(id); // not written yet
    full = false;
    await cycle();
    expect(auto.get('web')!.container_id).toBe(now.Id);
  });

  test('a container replaced under the same name outside kontainers is not updated automatically', async () => {
    const { d, auto, cycle } = setup();
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    await d.remove(id);
    const other = d.run('web', 'app:1');
    d.registry.set('app:1', 'i2');
    await cycle();
    expect(running(d, 'web').Id).toBe(other);
    expect(auto.isOn('web', other)).toBe(false);
  });

  test('only containers kontainers created can be opted in; off forgets', async () => {
    const { d, auto } = setup();
    const ext = d.run('ext', 'app:1', false);
    await expect(auto.set(ext, true)).rejects.toThrow('only containers created in kontainers');
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    expect(await auto.set(id, false)).toContain('no longer');
    expect(auto.get('web')).toBeNull();
  });

  test('a container being updated by hand is skipped', async () => {
    const { d, auto, cycle } = setup();
    const id = d.run('web', 'app:1');
    await auto.set(id, true);
    d.registry.set('app:1', 'i2');
    auto.busy.take('web');
    await cycle();
    expect(running(d, 'web').Id).toBe(id);
  });
});

describe('settleProblem', () => {
  test('running and healthy or starting is fine; anything else says why', () => {
    expect(settleProblem({ State: { Running: true }, RestartCount: 0 })).toBeNull();
    expect(settleProblem({ State: { Running: true, Health: { Status: 'starting' } } })).toBeNull();
    expect(settleProblem({ State: { Running: false, ExitCode: 3 } })).toBe('the new container stopped with exit code 3');
    expect(settleProblem({ State: { Running: false, ExitCode: 137, OOMKilled: true } })).toBe('the new container stopped (out of memory) with exit code 137');
    expect(settleProblem({ State: { Running: true, Restarting: true, ExitCode: 1 } })).toBe('the new container is restarting (exit code 1)');
    expect(settleProblem({ State: { Running: true }, RestartCount: 2 })).toBe('the new container restarted 2 times');
    expect(settleProblem({ State: { Running: true, Health: { Status: 'unhealthy' } } })).toBe('the new container is unhealthy');
  });
});

describe('Update image safeguards', () => {
  test('refused, without stopping anything, when the old image is gone from the host', async () => {
    const { d } = setup();
    const id = d.run('web', 'app:1');
    d.images.delete('i1'); // as a docker build that reuses the tag can do
    d.registry.set('app:1', 'i2');
    const { updateContainerDetailed } = await import('../../src/update');
    await expect(updateContainerDetailed(d as any, id)).rejects.toThrow('no longer on this host');
    expect(running(d, 'web').Id).toBe(id);
    expect(running(d, 'web').State.Running).toBe(true);
    expect(d.pulls).toEqual([]);
  });
  test('a 120-character name still fits the name the old container is set aside under', async () => {
    const { d } = setup();
    const long = 'x'.repeat(120);
    const id = d.run(long, 'app:1');
    d.registry.set('app:1', 'i2');
    const renames: string[] = [];
    const rename = d.rename.bind(d);
    d.rename = async (i: string, n: string) => { renames.push(n); if (n.length > 128) throw new Error('invalid name'); return rename(i, n); };
    const { updateContainerDetailed } = await import('../../src/update');
    const r = await updateContainerDetailed(d as any, id);
    expect(r.changed).toBe(true);
    expect(renames[0].length).toBeLessThanOrEqual(128);
    expect(running(d, long).Image).toBe('i2');
  });
});

describe('recoverInterrupted', () => {
  const aside = (d: FakeDocker, name: string, running: boolean) => {
    const id = d.run(name, 'app:1');
    const c = d.find(id);
    c.Id = 'abcdef12' + c.Id.slice(8); d.containers.delete(id); d.containers.set(c.Id, c);
    c.Name = `/${name}-old-abcdef12`;
    c.State = running ? { Running: true, Status: 'running' } : { Running: false, Status: 'exited', ExitCode: 0 };
    return c.Id;
  };
  test('nothing has the name: the old container is put back and started', async () => {
    const { d } = setup();
    const id = aside(d, 'web', false);
    const { recoverInterrupted } = await import('../../src/update');
    expect((await recoverInterrupted(d as any)).map(r => r.text)).toEqual(['put web back: an update or edit was interrupted before the new container existed']);
    expect(d.find('web').Id).toBe(id);
    expect(d.find('web').State.Running).toBe(true);
  });
  test('the new one runs: the leftover is removed', async () => {
    const { d } = setup();
    const old = aside(d, 'web', false);
    d.run('web', 'app:1');
    const { recoverInterrupted } = await import('../../src/update');
    const kept: string[] = [];
    const rows = [{ name: 'web', old_id: old, was_running: 1 }];
    expect((await recoverInterrupted(d as any, (n, id) => kept.push(`${n}=${id}`), journalOf(rows))).map(r => r.text)).toEqual(['removed web-old-abcdef12, left over from an interrupted update of web; the new web was not watched to the end, so check that it works']);
    expect(kept.length).toBe(1);
    expect(d.containers.has(old)).toBe(false);
  });
  test('without a journal entry a running replacement is left alone (another kontainers may be updating it)', async () => {
    const { d } = setup();
    aside(d, 'web', false);
    d.run('web', 'app:1');
    const { recoverInterrupted } = await import('../../src/update');
    const r = await recoverInterrupted(d as any);
    expect(r[0].text).toContain('no record of replacing web');
    expect(d.containers.size).toBe(2);
  });
  test('with the journal: a new container that stopped once nobody watched it goes, and the old one is back', async () => {
    const { d } = setup();
    const old = aside(d, 'web', false);
    const now = d.run('web', 'app:1');
    d.find(now).State = { Running: false, Status: 'exited', ExitCode: 1 };
    const rows = [{ name: 'web', old_id: old, was_running: 1 }];
    const { recoverInterrupted } = await import('../../src/update');
    const r = await recoverInterrupted(d as any, () => {}, journalOf(rows));
    expect(r[0]).toMatchObject({ trouble: true });
    expect(r[0].text).toContain('the new container then stopped');
    expect(d.find('web').Id).toBe(old);
    expect(d.find('web').State.Running).toBe(true);
  });
  test('with the journal: what cannot be settled yet keeps its entry, to be tried again', async () => {
    const { d } = setup();
    const old = aside(d, 'web', false);
    const now = d.run('web', 'app:1');
    d.find(now).State = { Running: false, Status: 'exited', ExitCode: 1 };
    const remove = d.remove.bind(d);
    d.remove = async (i: string) => { if (i === now) throw new Error('removal of container is already in progress'); return remove(i); };
    const rows = [{ name: 'web', old_id: old, was_running: 1 }];
    const { recoverInterrupted } = await import('../../src/update');
    const r = await recoverInterrupted(d as any, () => {}, journalOf(rows));
    expect(r[0]).toMatchObject({ retry: true });
    expect(rows).toHaveLength(1);
    d.remove = remove;
    await d.remove(now);
    await recoverInterrupted(d as any, () => {}, journalOf(rows));
    expect(d.find('web').Id).toBe(old);
    expect(rows).toHaveLength(0);
  });
  const journalOf = (rows: { name: string; old_id: string; was_running: number }[]) => ({ begin() {}, end(n: string) { const i = rows.findIndex(r => r.name === n); if (i >= 0) rows.splice(i, 1); }, all: () => [...rows] });
  test('with the journal: a new one that never started goes, and the old one is back and running', async () => {
    const { d } = setup();
    const old = aside(d, 'web', false);
    const now = d.run('web', 'app:1');
    d.find(now).State = { Running: false, Status: 'created' };
    const rows = [{ name: 'web', old_id: old, was_running: 1 }];
    const { recoverInterrupted } = await import('../../src/update');
    expect((await recoverInterrupted(d as any, () => {}, journalOf(rows)))[0].text).toContain('before the new container started');
    expect(d.find('web').Id).toBe(old);
    expect(d.find('web').State.Running).toBe(true);
    expect(d.containers.size).toBe(1);
    expect(rows).toEqual([]);
  });
  test('with the journal: stopped for an update and nothing else happened, it is started again', async () => {
    const { d } = setup();
    const id = d.run('web', 'app:1');
    d.find(id).State = { Running: false, Status: 'exited', ExitCode: 0 };
    const rows = [{ name: 'web', old_id: id, was_running: 1 }];
    const { recoverInterrupted } = await import('../../src/update');
    expect((await recoverInterrupted(d as any, () => {}, journalOf(rows)))[0].text).toContain(`started web again`);
    expect(d.find('web').State.Running).toBe(true);
  });
  test('with the journal: a container that was stopped before its edit is put back stopped', async () => {
    const { d } = setup();
    const old = aside(d, 'web', false);
    const rows = [{ name: 'web', old_id: old, was_running: 0 }];
    const { recoverInterrupted } = await import('../../src/update');
    await recoverInterrupted(d as any, () => {}, journalOf(rows));
    expect(d.find('web').Id).toBe(old);
    expect(d.find('web').State.Running).toBe(false);
  });
  test('without a journal entry, a new one that is not running: both are left, with a note', async () => {
    const { d } = setup();
    aside(d, 'web', false);
    const now = d.run('web', 'app:1');
    d.find(now).State = { Running: false, Status: 'created' };
    const { recoverInterrupted } = await import('../../src/update');
    expect((await recoverInterrupted(d as any))[0].text).toContain('no record of replacing web');
    expect(d.containers.size).toBe(2);
  });
  test('names that only look like it are ignored', async () => {
    const { d } = setup();
    d.run('backup-old-12345678', 'app:1'); // the ID does not start with 12345678
    d.run('x-old-abcdef12', 'app:1', false); // not created by kontainers
    const { recoverInterrupted } = await import('../../src/update');
    expect(await recoverInterrupted(d as any)).toEqual([]);
  });
});

describe('health while settling', () => {
  test('by hand (no health wait) a container still starting its healthcheck is kept; with a wait it must turn healthy', async () => {
    const { d } = setup();
    d.image('i6');
    const start = d.start.bind(d);
    d.start = async (id: string) => { await start(id); const c = d.find(id); if (c.Image === 'i6') c.State = { Running: true, Status: 'running', Health: { Status: 'starting' } }; };
    const id = d.run('web', 'app:1');
    d.registry.set('app:1', 'i6');
    const { updateContainerDetailed } = await import('../../src/update');
    const r = await updateContainerDetailed(d as any, id, { settleMs: 0, healthTimeoutMs: 0 });
    expect(r.changed).toBe(true);
    const id2 = d.run('api', 'app:1');
    d.find(id2).Image = 'i1';
    await expect(updateContainerDetailed(d as any, id2, { settleMs: 0, healthTimeoutMs: 2000, sleep: async () => {} })).rejects.toThrow('did not become healthy in time');
  });
});

describe('replacing a container', () => {
  test('an image that is not on this host is refused before the old container is stopped', async () => {
    const { d } = setup();
    const id = d.run('web', 'app:1');
    const { replaceContainer } = await import('../../src/update');
    await expect(replaceContainer(d as any, d.find(id), { name: 'web', image: 'app:nope' }, {}, 'saving the settings')).rejects.toThrow('not on this host');
    expect(running(d, 'web').Id).toBe(id);
    expect(running(d, 'web').State.Running).toBe(true);
  });
  test('aliases and fixed addresses on a network are carried over; the ones Docker adds are not', async () => {
    const { endpointOf } = await import('../../src/update');
    const c = { Id: 'abcdef123456' + '0'.repeat(52), Name: '/web', Config: { Hostname: 'abcdef123456' } };
    expect(endpointOf(c, { Aliases: ['abcdef123456', 'web', 'api', 'api.internal'], IPAMConfig: { IPv4Address: '10.5.0.9' } }))
      .toEqual({ Aliases: ['api', 'api.internal'], IPAMConfig: { IPv4Address: '10.5.0.9' } });
    expect(endpointOf(c, { Aliases: null, IPAMConfig: null })).toEqual({});
  });
});

describe('replacing a container, when things go wrong', () => {
  test('kontainers told to stop while the old container stops: it is started again and nothing else changes', async () => {
    const { d } = setup();
    const id = d.run('web', 'app:1');
    const stop = new AbortController();
    const realStop = d.stop.bind(d);
    d.stop = async (i: string) => { await realStop(i); stop.abort(); };
    const { replaceContainer } = await import('../../src/update');
    await expect(replaceContainer(d as any, d.find(id), { name: 'web', image: 'app:1' }, { signal: stop.signal }, 'update')).rejects.toThrow('nothing was changed');
    expect(d.find('web').Id).toBe(id);
    expect(d.find('web').State.Running).toBe(true);
    expect(d.containers.size).toBe(1);
  });
  test('a rollback that cannot give the old container its name back says so', async () => {
    const { d } = setup();
    const id = d.run('web', 'app:1');
    d.image('bad', 'crash'); d.tags.set('bad:1', 'bad');
    const rename = d.rename.bind(d);
    d.rename = async (i: string, n: string) => { if (n === 'web') throw new Error('name in use'); return rename(i, n); };
    const { replaceContainer } = await import('../../src/update');
    const err = await replaceContainer(d as any, d.find(id), { name: 'web', image: 'bad:1' }, {}, 'saving the settings').catch(e => e);
    expect(err.message).toContain('putting the old container back went wrong');
    expect(err.message).toContain('could not get its name back and is still web-old-');
    expect(err.message).not.toContain('so the old container was put back');
  });
  test('a kill with HUP while it settles is not a stop someone asked for: a crash is still rolled back', async () => {
    const { d } = setup();
    const id = d.run('web', 'app:1');
    d.image('bad', 'crash'); d.tags.set('bad:1', 'bad');
    d.pastEvents = async (f: { container: string[] }) => f.container.map(cid => ({ Action: 'kill', Actor: { ID: cid, Attributes: { signal: '1' } } }));
    const { replaceContainer } = await import('../../src/update');
    await expect(replaceContainer(d as any, d.find(id), { name: 'web', image: 'bad:1' }, { sleep: async () => {} }, 'update')).rejects.toThrow('old container was put back');
    expect(d.find('web').Id).toBe(id);
  });
  test('the event watcher\'s record of a stop is enough', async () => {
    const { d } = setup();
    const id = d.run('web', 'app:1');
    d.image('bad', 'crash'); d.tags.set('bad:1', 'bad');
    d.pastEvents = async () => [];
    const { replaceContainer } = await import('../../src/update');
    const r = await replaceContainer(d as any, d.find(id), { name: 'web', image: 'bad:1' }, { wasStopped: () => true }, 'update');
    expect(r.note).toContain('stopped by someone');
  });
});

describe('networks of a replacement', () => {
  test('made on the network the old one was made on; bridge only if it was on bridge; host refused', async () => {
    const { networkPlan } = await import('../../src/update');
    const c = (mode: string, nets: Record<string, any>) => ({ Id: 'a'.repeat(64), Name: '/web', HostConfig: { NetworkMode: mode }, NetworkSettings: { Networks: nets } });
    expect(networkPlan(c('bridge', { bridge: {}, app: { Aliases: ['api'] } }))).toEqual({ connect: [['app', { Aliases: ['api'] }]] });
    expect(networkPlan(c('bridge', { internal_only: {} }))).toEqual({ network: { mode: 'internal_only', endpoint: {} }, connect: [] });
    expect(networkPlan(c('front', { front: { IPAMConfig: { IPv4Address: '10.1.0.5' } }, back: {} }))).toEqual({ network: { mode: 'front', endpoint: { IPAMConfig: { IPv4Address: '10.1.0.5' } } }, connect: [['back', {}]] });
    expect(networkPlan(c('none', { none: {} }))).toEqual({ network: { mode: 'none' }, connect: [] });
    expect(networkPlan(c('bridge', {}))).toEqual({ network: { mode: 'none' }, connect: [] });
    expect(() => networkPlan(c('host', { host: {} }))).toThrow("host's network");
    expect(() => networkPlan(c('container:abc', {}))).toThrow("another container's network");
  });
});
