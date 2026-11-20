import { describe, expect, test } from 'bun:test';
import { TagChecker, listTags, newerTags, parseChallenge, parseRef, registryBase, versionOf } from '../../src/tags';

describe('version tags', () => {
  test('what counts as a version, and its shape', () => {
    expect(versionOf('1.27')).toEqual({ prefix: '', nums: [1, 27], suffix: '' });
    expect(versionOf('v2.3.4-alpine')).toEqual({ prefix: 'v', nums: [2, 3, 4], suffix: '-alpine' });
    for (const t of ['latest', 'alpine', 'stable-slim', 'sha-abc', '']) expect(versionOf(t)).toBeNull();
  });
  test('the newest of the same shape, within the major version and above it', () => {
    const tags = ['1.26', '1.27', '1.28', '1.29-alpine', '1.30-rc1', '1.28.1', '2.0', '2.1', 'v1.40', 'latest', '1.29'];
    expect(newerTags('1.27', tags)).toEqual({ minor: '1.29', major: '2.1' });
    expect(newerTags('1.27-alpine', ['1.27-alpine', '1.29-alpine', '1.30-alpine3.20', '2.0-alpine'])).toEqual({ minor: '1.29-alpine', major: '2.0-alpine' });
    expect(newerTags('17', ['16', '17', '18', '19-alpine', '20'])).toEqual({ minor: null, major: '20' });
    expect(newerTags('2.1', tags)).toEqual({ minor: null, major: null });
    expect(newerTags('latest', tags)).toEqual({ minor: null, major: null });
    // 1.10 is newer than 1.9.
    expect(newerTags('1.9', ['1.10', '1.8'])).toEqual({ minor: '1.10', major: null });
  });
  test('where a reference lives', () => {
    expect(parseRef('nginx:1.27')).toEqual({ registry: 'docker.io', repo: 'library/nginx', tag: '1.27' });
    expect(parseRef('grafana/grafana:11.0.0')).toEqual({ registry: 'docker.io', repo: 'grafana/grafana', tag: '11.0.0' });
    expect(parseRef('docker.io/library/redis:7')).toEqual({ registry: 'docker.io', repo: 'library/redis', tag: '7' });
    expect(parseRef('ghcr.io/me/app:1.2')).toEqual({ registry: 'ghcr.io', repo: 'me/app', tag: '1.2' });
    expect(parseRef('localhost:5000/kt/app')).toEqual({ registry: 'localhost:5000', repo: 'kt/app', tag: 'latest' });
    expect(parseRef('nginx@sha256:' + 'a'.repeat(64))).toBeNull();
    expect(registryBase('docker.io')).toBe('https://registry-1.docker.io');
    expect(registryBase('localhost:5000')).toBe('http://localhost:5000');
    expect(registryBase('127.0.0.1:5000')).toBe('http://127.0.0.1:5000');
    expect(registryBase('ghcr.io')).toBe('https://ghcr.io');
    expect(parseChallenge('Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"'))
      .toEqual({ scheme: 'bearer', params: { realm: 'https://auth.docker.io/token', service: 'registry.docker.io', scope: 'repository:library/nginx:pull' } });
  });
});

// A registry that asks for a bearer token from its realm, pages its tags and checks the token.
function fakeRegistry(opts: { realm?: string; basicOnly?: boolean; pages?: string[][]; nextOrigin?: string } = {}) {
  const calls: { url: string; auth: string | null }[] = [];
  const pages = opts.pages ?? [['1.0', '1.1'], ['1.2', '2.0']];
  const f = async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? null;
    calls.push({ url, auth });
    const u = new URL(url);
    if (u.pathname === '/token') {
      if (auth !== `Basic ${Buffer.from('me:pw').toString('base64')}`) return new Response('no', { status: 401 });
      return Response.json({ token: 'T' });
    }
    const ok = opts.basicOnly ? auth === `Basic ${Buffer.from('me:pw').toString('base64')}` : auth === 'Bearer T';
    if (!ok) return new Response('', { status: 401, headers: { 'www-authenticate': opts.basicOnly ? 'Basic realm="reg"' : `Bearer realm="${opts.realm ?? 'https://reg.example/token'}",service="reg",scope="repository:me/app:pull"` } });
    const last = u.searchParams.get('last');
    const i = last ? pages.findIndex(p => p.includes(last)) + 1 : 0;
    const headers: Record<string, string> = {};
    if (i + 1 < pages.length) headers.link = `<${opts.nextOrigin ?? ''}/v2/me/app/tags/list?n=1000&last=${pages[i][pages[i].length - 1]}>; rel="next"`;
    return Response.json({ name: 'me/app', tags: pages[i] }, { headers });
  };
  return { f, calls };
}

describe('listing tags from the registry', () => {
  test('a bearer token from the realm, with the saved login, and every page', async () => {
    const { f, calls } = fakeRegistry();
    expect(await listTags(f, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).toEqual(['1.0', '1.1', '1.2', '2.0']);
    expect(calls.map(c => new URL(c.url).pathname)).toEqual(['/v2/me/app/tags/list', '/token', '/v2/me/app/tags/list', '/v2/me/app/tags/list']);
    expect(new URL(calls[1].url).searchParams.get('scope')).toBe('repository:me/app:pull');
  });
  test('basic auth when the registry asks for it; a refusal says what to do', async () => {
    const { f } = fakeRegistry({ basicOnly: true, pages: [['3.1']] });
    expect(await listTags(f, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).toEqual(['3.1']);
    await expect(listTags(f, 'reg.example', 'me/app', null)).rejects.toThrow('needs a login');
    await expect(listTags(f, 'reg.example', 'me/app', { username: 'me', password: 'wrong' })).rejects.toThrow('refused the login');
  });
  test('a token service on plain HTTP, or on a link-local address, is not used; nor pages elsewhere', async () => {
    await expect(listTags(fakeRegistry({ realm: 'http://evil.example/token' }).f, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).rejects.toThrow('does not use');
    await expect(listTags(fakeRegistry({ realm: 'https://169.254.169.254/token' }).f, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).rejects.toThrow('link-local');
    await expect(listTags(fakeRegistry({ realm: 'https://[::ffff:169.254.169.254]/token' }).f, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).rejects.toThrow('link-local');
    await expect(listTags(fakeRegistry({ realm: 'https://[fd00:ec2::254]/token' }).f, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).rejects.toThrow('link-local');
    // A local registry may name a token service on plain HTTP only on this host or itself.
    const local = fakeRegistry({ realm: 'http://other.example/token' });
    await expect(listTags(local.f, 'localhost:5000', 'me/app', { username: 'me', password: 'pw' })).rejects.toThrow('does not use');
    expect(local.calls.some(x => x.url.startsWith('http://other.example'))).toBe(false);
    // The check notifications use (the Docker API, a name that resolves to a metadata address).
    await expect(listTags(fakeRegistry().f, 'reg.example', 'me/app', null, async u => (u.includes('/token') ? 'it reaches the Docker API' : null))).rejects.toThrow('it reaches the Docker API');
    const { f, calls } = fakeRegistry({ nextOrigin: 'https://other.example' });
    expect(await listTags(f, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).toEqual(['1.0', '1.1']);
    expect(calls.some(c => c.url.startsWith('https://other.example'))).toBe(false);
  });
  test('an answer too large, or a redirect from the token service, is refused', async () => {
    const big = async () => new Response('{"tags":[' + '"1.0",'.repeat(900_000) + '"1.1"]}', { headers: { 'content-type': 'application/json' } });
    await expect(listTags(big, 'reg.example', 'me/app', null)).rejects.toThrow('too large');
    const moved = async (url: string) => (url.includes('/token') ? new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } })
      : new Response('', { status: 401, headers: { 'www-authenticate': 'Bearer realm="https://reg.example/token",service="r"' } }));
    await expect(listTags(moved, 'reg.example', 'me/app', { username: 'me', password: 'pw' })).rejects.toThrow('redirect');
  });
  test('a date or build number is not a newer version of a small one; leading zeros are a shape of their own', () => {
    expect(newerTags('3', ['3', '4', '20250108'])).toEqual({ minor: null, major: '4' });
    expect(newerTags('1.9', ['01.20', '1.10'])).toEqual({ minor: '1.10', major: null });
  });

  test('the checker looks each repository up once and keeps what it found per reference', async () => {
    const { f, calls } = fakeRegistry({ pages: [['1.0', '1.1', '1.2', '2.0']] });
    const t = new TagChecker(f, () => ({ username: 'me', password: 'pw' }), () => 1000);
    await t.checkAll(['reg.example/me/app:1.0', 'reg.example/me/app:1.2', 'reg.example/me/app:latest', 'nginx@sha256:' + 'a'.repeat(64)]);
    expect(calls.filter(c => c.url.includes('/tags/list')).length).toBe(2); // one 401, one with the token
    expect(t.get('reg.example/me/app:1.0')).toEqual({ checkedAt: 1000, minor: '1.2', major: '2.0' });
    expect(t.get('reg.example/me/app:1.2')).toEqual({ checkedAt: 1000, minor: null, major: '2.0' });
    expect(t.get('reg.example/me/app:latest')).toBeNull();
    // A reference no container uses any more is forgotten.
    await t.checkAll(['reg.example/me/app:1.2']);
    expect(t.get('reg.example/me/app:1.0')).toBeNull();
  });
});
