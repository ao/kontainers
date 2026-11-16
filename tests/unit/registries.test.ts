import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrate } from '../../src/db';
import { Registries, registryOf, validateRegistry, loginHint, DOCKER_HUB } from '../../src/registries';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'kreg-'));
  const db = new Database(':memory:', { strict: true });
  migrate(db);
  return { dir, db, key: join(dir, 'registry.key'), r: new Registries(db, join(dir, 'registry.key')) };
}
const decode = (h: string) => JSON.parse(Buffer.from(h.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

describe('which registry an image comes from', () => {
  test('a host in the first part, otherwise Docker Hub', () => {
    expect(registryOf('nginx')).toBe(DOCKER_HUB);
    expect(registryOf('nginx:1.27')).toBe(DOCKER_HUB);
    expect(registryOf('library/nginx:1.27')).toBe(DOCKER_HUB);
    expect(registryOf('me/app:1')).toBe(DOCKER_HUB);
    expect(registryOf('docker.io/me/app:1')).toBe(DOCKER_HUB);
    expect(registryOf('index.docker.io/me/app')).toBe(DOCKER_HUB);
    expect(registryOf('ghcr.io/me/app:1')).toBe('ghcr.io');
    expect(registryOf('GHCR.io/me/app')).toBe('ghcr.io');
    expect(registryOf('localhost:5000/kt/app:1')).toBe('localhost:5000');
    expect(registryOf('localhost/app')).toBe('localhost');
    expect(registryOf('registry.example.com:5000/a/b/c@sha256:' + 'a'.repeat(64))).toBe('registry.example.com:5000');
  });
  test('what may be saved as a registry', () => {
    expect(validateRegistry(' https://GHCR.io/ ')).toBe('ghcr.io');
    expect(validateRegistry('hub.docker.com')).toBe(DOCKER_HUB);
    expect(validateRegistry('registry.example.com:5000')).toBe('registry.example.com:5000');
    expect(validateRegistry('[fd00::5]:5000')).toBe('[fd00::5]:5000');
    for (const bad of ['', 'a b', 'reg:0', 'reg:70000', 'x;rm', '-bad.example', 'a'.repeat(254)]) expect(() => validateRegistry(bad)).toThrow('host name');
  });
});

describe('Registries', () => {
  test('a saved login becomes the header for that registry only; the password is not stored in the clear', () => {
    const { r, db, key, dir } = setup();
    r.add({ registry: 'ghcr.io', username: 'me', password: 'ghp_s3cret-token' });
    const h = r.header('ghcr.io/me/app:1')!;
    expect(decode(h)).toEqual({ username: 'me', password: 'ghp_s3cret-token', serveraddress: 'ghcr.io' });
    expect(h).not.toMatch(/[+/]/);
    expect(r.header('nginx:1.27')).toBeNull();
    expect(r.header('quay.io/x/y')).toBeNull();
    const row = db.query('SELECT secret FROM registry_logins').get() as { secret: Uint8Array };
    expect(Buffer.from(row.secret).toString('latin1')).not.toContain('s3cret');
    expect(JSON.stringify(r.list())).not.toContain('s3cret');
    expect(statSync(key).mode & 0o777).toBe(0o600);
    rmSync(dir, { recursive: true });
  });
  test('Docker Hub gets its classic address; saving again replaces the login', () => {
    const { r } = setup();
    r.add({ registry: 'docker.io', username: 'a', password: 'one' });
    r.add({ registry: 'index.docker.io', username: 'b', password: 'two' });
    expect(r.list().map(l => [l.registry, l.username])).toEqual([['docker.io', 'b']]);
    expect(decode(r.header('me/private:1')!)).toEqual({ username: 'b', password: 'two', serveraddress: 'https://index.docker.io/v1/' });
  });
  test('without the key file (a restored backup) the login is skipped and the page says why', () => {
    const { r, db, key, dir } = setup();
    r.add({ registry: 'ghcr.io', username: 'me', password: 'pw' });
    rmSync(key);
    const fresh = new Registries(db, key);
    expect(fresh.header('ghcr.io/me/app')).toBeNull();
    expect(fresh.list()[0].last_result).toContain('registry.key');
    // A new key is not made up to read the old secret with.
    expect(() => readFileSync(key)).toThrow();
    rmSync(dir, { recursive: true });
  });
  test('bad input and removal', () => {
    const { r } = setup();
    expect(() => r.add({ registry: 'ghcr.io', username: '', password: 'x' })).toThrow('username');
    expect(() => r.add({ registry: 'ghcr.io', username: 'me', password: '' })).toThrow('password');
    expect(() => r.add({ registry: 'ghcr.io', username: 'me', password: 'a\nb' })).toThrow('control characters');
    const l = r.add({ registry: 'ghcr.io', username: 'me', password: 'x' });
    expect(r.remove(l.id)).toBe('ghcr.io');
    expect(() => r.remove(l.id)).toThrow('not found');
  });
  test('hints for refused pulls', () => {
    expect(loginHint('pull access denied for me/app, repository does not exist or may require \'docker login\'', 'docker.io', 'none')).toContain('add a login for docker.io');
    expect(loginHint('Head "https://ghcr.io/v2/me/app/manifests/1": unauthorized', 'ghcr.io', 'sent')).toContain('refused the login saved for ghcr.io');
    expect(loginHint('manifest unknown', 'ghcr.io', 'none')).toBe('');
    expect(loginHint('open /var/lib/docker/x: permission denied', 'ghcr.io', 'sent')).toBe('');
    expect(loginHint('unauthorized: authentication required', 'ghcr.io', 'unreadable')).toContain('cannot be read');
    // GHCR's answer to a bad token, for public images too.
    expect(loginHint('error from registry: denied', 'ghcr.io', 'sent')).toContain('refused the login saved for ghcr.io');
  });
});

describe('the key file and sealed secrets', () => {
  test('an empty key file (a failed write) counts as none; a secret moved to another registry does not open', () => {
    const { r, db, key, dir } = setup();
    require('node:fs').writeFileSync(key, '');
    r.add({ registry: 'ghcr.io', username: 'me', password: 'pw-a' });
    expect(readFileSync(key).length).toBe(32);
    r.add({ registry: 'quay.io', username: 'me', password: 'pw-b' });
    const a = db.query("SELECT secret FROM registry_logins WHERE registry = 'ghcr.io'").get() as { secret: Uint8Array };
    db.query("UPDATE registry_logins SET secret = ? WHERE registry = 'quay.io'").run(a.secret);
    expect(r.header('quay.io/me/app')).toBeNull();
    expect(decode(r.header('ghcr.io/me/app')!).password).toBe('pw-a');
    rmSync(dir, { recursive: true });
  });
});
