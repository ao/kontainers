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
      Id: id, Name: '/' + name, Image: this.tags.get(ref), RestartCount: 0,
      Config: { Image: ref, Env: [], Labels: managed ? { 'kontainers.managed': 'true' } : {} },
      HostConfig: { PortBindings: {}, Mounts: [], RestartPolicy: { Name: 'unless-stopped' } },
      NetworkSettings: { Networks: { bridge: {} } }, State: { Running: true, Status: 'running' },
    });
    return id;
  }
  async listContainers() { return [...this.containers.values()].map(c => ({ Id: c.Id, Names: [c.Name], Image: c.Config.Image, ImageID: c.Image, State: c.State.Status })); }
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
  const auto = new AutoUpdates(db, d as any, checker, notifier as any, { settleMs: 0, healthTimeoutMs: 0 }, (a, t) => audit.push(`${a} ${t}`));
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
    expect(audit).toEqual(['auto-update-failed web']);

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

  test('containers not opted in get one "newer image" note per new image', async () => {
    const { d, sent, cycle } = setup();
    d.run('web', 'app:1');
    d.registry.set('app:1', 'i2');
    await cycle();
    await cycle();
    expect(running(d, 'web').Image).toBe('i1');
    expect(sent.map(s => [s.kind, s.key])).toEqual([['update', 'update:web:sha256:i2'], ['update', 'update:web:sha256:i2']]);
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
    auto.busy.add('web');
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
