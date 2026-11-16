import { describe, expect, test } from 'bun:test';
import { checkable, compareDigests, containerStatus, digestsFor, lookupReason, repoOf, UpdateChecker, type UpdateStatus } from '../../src/updates';
import { containersPage, containerPage } from '../../src/views';

const D = (n: string) => 'sha256:' + n.repeat(64);

describe('compareDigests', () => {
  test('current when the registry digest is one the image was pulled as', () => {
    expect(compareDigests([`nginx@${D('a')}`], D('a')).status).toBe('current');
    expect(compareDigests([`docker.io/library/nginx@${D('b')}`, `nginx@${D('a')}`], D('a')).status).toBe('current');
  });
  test('available when the tag now points elsewhere', () => {
    expect(compareDigests([`nginx@${D('a')}`], D('c')).status).toBe('available');
  });
  test('unknown without a digest on either side', () => {
    expect(compareDigests([], D('a'))).toMatchObject({ status: 'unknown', reason: expect.stringContaining('not pulled') });
    expect(compareDigests(null, D('a')).status).toBe('unknown');
    expect(compareDigests([`nginx@${D('a')}`], undefined).status).toBe('unknown');
  });
  test('a container on an older image than its current tag has a newer image', () => {
    const st = { status: 'current' as const, checkedAt: 1, imageId: D('1') };
    expect(containerStatus(st, D('1'))?.status).toBe('current');
    expect(containerStatus(st, D('0'))).toMatchObject({ status: 'available', reason: expect.stringContaining('already pulled') });
    expect(containerStatus({ ...st, status: 'available' }, D('1'))?.status).toBe('available');
    expect(containerStatus({ ...st, status: 'unknown' }, undefined)?.status).toBe('unknown');
    expect(containerStatus(null, D('1'))).toBeNull();
  });
  test('only tags are checked, not IDs or pinned digests', () => {
    expect(checkable('nginx:1.27')).toBe(true);
    expect(checkable('ghcr.io/org/app')).toBe(true);
    expect(checkable(D('a'))).toBe(false);
    expect(checkable('a'.repeat(12))).toBe(false);
    expect(checkable(`nginx@${D('a')}`)).toBe(false);
    expect(checkable('')).toBe(false);
  });
});

function fakeDocker(images: Record<string, { local: string[]; remote?: string; fail?: boolean }>, containers: string[]) {
  const calls = { distribution: 0 };
  return {
    calls,
    listContainers: async () => containers.map(Image => ({ Image })),
    listContainersWithRefs: async () => containers.map(Image => ({ Image, Ref: Image })),
    inspectImage: async (ref: string) => ({ RepoDigests: images[ref]?.local ?? [] }),
    distribution: async (ref: string) => {
      calls.distribution++;
      if (images[ref]?.fail) throw new Error('registry unreachable');
      return { Descriptor: { digest: images[ref]?.remote } };
    },
  };
}

describe('UpdateChecker', () => {
  test('checks each image reference once, however many containers use it', async () => {
    const d = fakeDocker({ 'nginx:1': { local: [`nginx@${D('a')}`], remote: D('b') }, 'redis:7': { local: [`redis@${D('c')}`], remote: D('c') } },
      ['nginx:1', 'nginx:1', 'redis:7', D('f')]);
    const u = new UpdateChecker(d as any, 0, () => 1000);
    expect(await u.checkAll()).toBe(2);
    expect(d.calls.distribution).toBe(3); // two lookups, and for the newer one a check that the registry knows our digest
    expect(u.get('nginx:1')?.status).toBe('available');
    expect(u.get('redis:7')?.status).toBe('current');
    expect(u.lastRun).toBe(1000);
  });
  test('a registry error is unknown with the reason, not a crash', async () => {
    const d = fakeDocker({ 'private/app:1': { local: [`private/app@${D('a')}`], fail: true } }, ['private/app:1']);
    const u = new UpdateChecker(d as any, 0);
    await u.checkAll();
    expect(u.get('private/app:1')).toMatchObject({ status: 'unknown', reason: 'the registry did not answer (registry unreachable)' });
  });
  test('a socket proxy without DISTRIBUTION=1 gets a reason that says how to fix it', async () => {
    const d = fakeDocker({ 'a:1': { local: [`a@${D('a')}`] } }, ['a:1']);
    d.distribution = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
    const u = new UpdateChecker(d as any, 0);
    await u.checkAll();
    expect(u.get('a:1')).toMatchObject({ status: 'unknown', reason: expect.stringContaining('DISTRIBUTION=1') });
  });
  test('references no container uses any more are forgotten', async () => {
    const images = { 'a:1': { local: [`a@${D('a')}`], remote: D('a') }, 'b:1': { local: [`b@${D('b')}`], remote: D('b') } };
    const containers = ['a:1', 'b:1'];
    const u = new UpdateChecker(fakeDocker(images, containers) as any, 0);
    await u.checkAll();
    containers.pop();
    await u.checkAll();
    expect(u.get('b:1')).toBeNull();
  });
  test('concurrent checks share one run', async () => {
    const d = fakeDocker({ 'a:1': { local: [`a@${D('a')}`], remote: D('a') } }, ['a:1']);
    const u = new UpdateChecker(d as any, 0);
    await Promise.all([u.checkAll(), u.checkAll(), u.checkAll()]);
    expect(d.calls.distribution).toBe(1);
  });
});

describe('pages', () => {
  const ctx = { user: 'admin', csrf: 'tok' };
  const view = (status: UpdateStatus | null, lastRun: number | null = Date.now()) => ({
    get: () => (status ? { status, checkedAt: Date.now() } : null), lastRun, scheduled: 6,
  });
  const row = { Id: 'a'.repeat(64), Names: ['/web'], Image: 'nginx:1', State: 'running', Status: '', Ports: [] };
  test('a row with a newer image says so, and the toolbar counts them', () => {
    const page = containersPage(ctx, [row], null, view('available'));
    expect(page).toContain('newer image available');
    expect(page).toContain('1 with a newer image');
    expect(page).toContain('Check for updates');
    expect(containersPage(ctx, [row], null, view('current'))).not.toContain('newer image available');
    expect(containersPage(ctx, [row], null, view(null, null))).toContain('not checked for updates yet');
  });
  test('the container page explains the state and highlights Update image', () => {
    const c = { Id: 'b'.repeat(64), Name: '/web', State: { Status: 'running' }, Config: { Image: 'nginx:1', Labels: { 'kontainers.managed': 'true' } }, HostConfig: {} };
    const page = containerPage(ctx, c, null, view('available'));
    expect(page).toContain('a newer image is available for this tag');
    expect(page).toMatch(/<button class="primary">Update image<\/button>/);
    expect(containerPage(ctx, c, null, view('current'))).toContain('the newest image for this tag');
  });
  test('a container left on an older image after a pull is flagged on the list and its page', () => {
    const v = { get: () => ({ status: 'current' as const, checkedAt: Date.now(), imageId: 'sha256:new' }), lastRun: Date.now(), scheduled: 6 };
    expect(containersPage(ctx, [{ ...row, ImageID: 'sha256:old' }], null, v)).toContain('newer image available');
    expect(containersPage(ctx, [{ ...row, ImageID: 'sha256:new' }], null, v)).not.toContain('newer image available');
    const c = { Id: 'b'.repeat(64), Name: '/web', Image: 'sha256:old', State: { Status: 'running' }, Config: { Image: 'nginx:1', Labels: {} }, HostConfig: {} };
    expect(containerPage(ctx, c, null, v)).toContain('recreate the container to use it');
  });
});

describe('references and registries', () => {
  test('repoOf strips the tag and digest, not a registry port', () => {
    expect(repoOf('nginx:1.27')).toBe('nginx');
    expect(repoOf('ghcr.io/org/app:2')).toBe('ghcr.io/org/app');
    expect(repoOf('localhost:5000/kt/app:1')).toBe('localhost:5000/kt/app');
    expect(repoOf('localhost:5000/kt/app')).toBe('localhost:5000/kt/app');
    expect(repoOf(`nginx@${D('a')}`)).toBe('nginx');
  });
  test('digestsFor keeps the reference\'s own repository, Docker Hub names short or long', () => {
    const rd = [`nginx@${D('a')}`, `ghcr.io/x/nginx@${D('b')}`, `docker.io/library/nginx@${D('c')}`];
    expect(digestsFor('nginx:1.27', rd)).toEqual([`nginx@${D('a')}`, `docker.io/library/nginx@${D('c')}`]);
    expect(digestsFor('docker.io/library/nginx:1.27', rd)).toEqual([`nginx@${D('a')}`, `docker.io/library/nginx@${D('c')}`]);
    expect(digestsFor('ghcr.io/x/nginx:1', rd)).toEqual([`ghcr.io/x/nginx@${D('b')}`]);
    expect(digestsFor('other:1', rd)).toEqual([]);
  });
  test('lookup failures in words', () => {
    expect(lookupReason(Object.assign(new Error('Forbidden'), { status: 403 }))).toContain('DISTRIBUTION=1');
    expect(lookupReason(new Error('errors: denied: requested access to the resource is denied'))).toContain('no such image, or it needs a login');
    expect(lookupReason(new Error('Get "https://10.255.255.1:5000/v2/": context deadline exceeded'))).toContain('did not answer');
  });
  test('a digest the registry never served is a local build, not a newer image', async () => {
    const d = fakeDocker({ 'mine:1': { local: [`mine@${D('a')}`], remote: D('b') } }, ['mine:1']);
    const known = new Set([`mine@${D('b')}`]);
    const plain = d.distribution;
    d.distribution = async (ref: string) => { if (ref.includes('@') && !known.has(ref)) throw new Error('manifest unknown'); return plain(ref); };
    const u = new UpdateChecker(d as any, 0);
    await u.checkAll();
    expect(u.get('mine:1')).toMatchObject({ status: 'unknown', reason: expect.stringContaining('built on this host, or the registry has since deleted it') });
    known.add(`mine@${D('a')}`); // the registry did serve ours once: then it is older
    await u.checkAll();
    expect(u.get('mine:1')?.status).toBe('available');
  });
  test('a container whose tag moved is checked under its reference, not its image ID', async () => {
    const d = fakeDocker({ 'web:1': { local: [`web@${D('a')}`], remote: D('a') } }, []);
    d.listContainersWithRefs = async () => [{ Image: D('9'), Ref: 'web:1' }];
    const u = new UpdateChecker(d as any, 0);
    expect(await u.checkAll()).toBe(1);
    expect(u.get('web:1')?.status).toBe('current');
  });
});
