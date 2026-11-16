import { describe, expect, test } from 'bun:test';
import { isAnonymousVolume, plan, removeAll } from '../../src/cleanup';
import { cleanupPage } from '../../src/views';

const H = (c: string) => 'sha256:' + c.repeat(64);
const anon = 'a'.repeat(64);

describe('plan', () => {
  const images = [
    { Id: H('1'), RepoTags: ['nginx:1.27'], Size: 50e6 }, // used by a running container
    { Id: H('2'), RepoTags: ['redis:7'], Size: 40e6 }, // used by a stopped container
    { Id: H('3'), RepoTags: ['old:1', 'old:latest'], RepoDigests: [`old@${H('9')}`], Size: 30e6 }, // unused, two tags
    { Id: H('4'), RepoTags: ['<none>:<none>'], Size: 20e6 }, // dangling
    { Id: H('5'), RepoTags: null, Size: 10e6 }, // dangling, no tag list at all
    { Id: H('6'), RepoTags: ['big:1'], RepoDigests: [`big@${H('8')}`], Size: 90e6 }, // unused
    { Id: H('7'), RepoTags: ['mybuild:dev'], Size: 70e6 }, // unused, built here
  ];
  const containers = [
    { ImageID: H('1'), State: 'running', Mounts: [{ Type: 'volume', Name: 'data' }, { Type: 'bind', Source: '/srv' }], NetworkSettings: { Networks: { app: { NetworkID: 'n-app' } } } },
    { ImageID: H('2'), State: 'exited', Mounts: [{ Type: 'volume', Name: anon.replace(/a/g, 'b') }] },
  ];
  const networks = [
    { Id: 'n-bridge', Name: 'bridge', Scope: 'local' }, { Id: 'n-host', Name: 'host', Scope: 'local' }, { Id: 'n-none', Name: 'none', Scope: 'local' },
    { Id: 'n-app', Name: 'app', Scope: 'local' }, { Id: 'n-old', Name: 'old-net', Scope: 'local' }, { Id: 'n-swarm', Name: 'ingress', Scope: 'swarm' },
    { Id: 'n-keep', Name: 'keep-me', Scope: 'local', Labels: { 'kontainers.keep': 'true' } },
  ];
  const volumes = [
    { Name: 'data' }, { Name: 'backups' }, { Name: anon }, { Name: anon.replace(/a/g, 'b') }, { Name: 'named-anon', Labels: { 'com.docker.volume.anonymous': '' } },
  ];
  const use = new Map([['n-app', 1]]);
  const p = plan(images, containers, networks, volumes, use);

  test('images used by any container, running or stopped, stay', () => {
    expect(p.dangling.map(i => i.id)).toEqual([H('4'), H('5')]);
    expect(p.unusedTagged.map(i => i.tags)).toEqual([['big:1'], ['old:1', 'old:latest']]); // biggest first
    expect(p.localUnused.map(i => i.tags)).toEqual([['mybuild:dev']]); // listed, never in the bulk removal
  });
  test('networks: built-in, swarm, labelled keep and connected ones stay', () => {
    expect(p.networks).toEqual([{ id: 'n-old', name: 'old-net' }]);
  });
  test('only anonymous volumes no container mounts; named ones are counted, not listed', () => {
    expect(p.volumes.map(v => v.name)).toEqual([anon, 'named-anon']);
    expect(p.namedUnused).toBe(1); // "backups"; "data" is mounted
  });
  test('isAnonymousVolume', () => {
    expect(isAnonymousVolume({ Name: anon })).toBe(true);
    expect(isAnonymousVolume({ Name: 'x', Labels: { 'com.docker.volume.anonymous': '' } })).toBe(true);
    expect(isAnonymousVolume({ Name: 'pgdata' })).toBe(false);
    expect(isAnonymousVolume({ Name: 'a'.repeat(63) })).toBe(false);
  });
  test('the page shows each group and never offers named volumes', () => {
    const page = cleanupPage({ user: 'a', csrf: 't' }, p);
    expect(page).toContain('2 images, up to 30.0 MB');
    expect(page).toContain('<span class="ref">old:1</span><br><span class="ref">old:latest</span>');
    expect(page).toContain('Remove 1 unused network');
    expect(page).toContain(`<input type="checkbox" name="vol_${anon}"> <code>${anon.slice(0, 12)}</code>`);
    expect(page).toContain('Remove the selected volumes');
    expect(page).toContain('1 named volume is not mounted by any container');
    expect(page).not.toContain('backups');
    const empty = cleanupPage({ user: 'a', csrf: 't' }, { dangling: [], unusedTagged: [], networks: [], volumes: [], namedUnused: 0 });
    expect(empty.match(/None/g)?.length).toBe(4);
    expect(empty).not.toContain('action="/cleanup');
  });
});

test('removeAll keeps going past refusals and reports them', async () => {
  const o = await removeAll([1, 2, 3, 4, 5], async n => { if (n % 2 === 0) throw new Error(`in use ${n}`); }, n => `#${n}`);
  expect(o).toEqual({ removed: 3, kept: 2, errors: ['#2: in use 2', '#4: in use 4'] });
});

test('a network a stopped container is configured for stays, matched by name', () => {
  const p = plan([], [{ ImageID: 'x', State: 'created', NetworkSettings: { Networks: { mine: { NetworkID: '' } } } }],
    [{ Id: 'n-mine', Name: 'mine', Scope: 'local' }, { Id: 'n-other', Name: 'other', Scope: 'local' }], [], new Map([['mine', 1]]));
  expect(p.networks.map(n => n.name)).toEqual(['other']);
});
