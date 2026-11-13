import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bindProblem, loadConfig } from '../../src/config';
import { MIGRATIONS, migrate, openDb, schemaVersion, snapshot } from '../../src/db';

describe('config', () => {
  test('defaults to loopback', () => {
    const c = loadConfig({});
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(8080);
    expect(c.proxy.enabled).toBe(false);
    expect(c.allowBindMounts).toBe(false);
    expect(bindProblem(c)).toBeNull();
  });
  test('parses IPv6 listen addresses', () => {
    const c = loadConfig({ KONTAINERS_LISTEN: '[::1]:9000' });
    expect(c.host).toBe('::1');
    expect(c.port).toBe(9000);
    expect(bindProblem(c)).toBeNull();
  });
  test('refuses a wildcard bind over plain HTTP', () => {
    expect(bindProblem(loadConfig({ KONTAINERS_LISTEN: '0.0.0.0:8080' }))).toContain('refusing');
    expect(bindProblem(loadConfig({ KONTAINERS_LISTEN: '192.168.1.5:8080' }))).toContain('refusing');
    expect(bindProblem(loadConfig({ KONTAINERS_LISTEN: '0.0.0.0:8080', KONTAINERS_PUBLIC_URL: 'http://x.example' }))).toContain('refusing');
  });
  test('allows it behind HTTPS, inside the image, or with the explicit opt-in', () => {
    expect(bindProblem(loadConfig({ KONTAINERS_LISTEN: '0.0.0.0:8080', KONTAINERS_PUBLIC_URL: 'https://k.example.com' }))).toBeNull();
    expect(bindProblem(loadConfig({ KONTAINERS_LISTEN: '0.0.0.0:8080', KONTAINERS_IN_CONTAINER: '1' }))).toBeNull();
    expect(bindProblem(loadConfig({ KONTAINERS_LISTEN: '0.0.0.0:8080', KONTAINERS_ALLOW_INSECURE: '1' }))).toBeNull();
  });
  test('rejects bad values', () => {
    expect(() => loadConfig({ KONTAINERS_LISTEN: '8080' })).toThrow();
    expect(() => loadConfig({ KONTAINERS_LISTEN: '127.0.0.1:99999' })).toThrow();
    expect(() => loadConfig({ KONTAINERS_PUBLIC_URL: 'ftp://x' })).toThrow();
    expect(() => loadConfig({ KONTAINERS_HTTP_PORT: 'abc' })).toThrow();
  });
  test('public URL is reduced to its origin', () => {
    expect(loadConfig({ KONTAINERS_PUBLIC_URL: 'https://k.example.com/some/path' }).publicUrl).toBe('https://k.example.com');
  });
});

describe('db', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'kontainers-test-'));

  test('migrates a new database to the latest version', () => {
    const db = openDb(dir());
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
  });
  test('re-opening does not re-run migrations', () => {
    const d = dir();
    const a = openDb(d);
    a.query("INSERT INTO users (username, password_hash, created_at) VALUES ('x', 'h', 1)").run();
    a.close();
    const b = openDb(d);
    expect((b.query('SELECT count(*) AS n FROM users').get() as { n: number }).n).toBe(1);
  });
  test('refuses a database from a newer version', () => {
    const db = new Database(':memory:');
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    expect(() => migrate(db)).toThrow('newer');
  });
  test('data directory and file are private', () => {
    const d = join(dir(), 'data');
    openDb(d);
    expect(statSync(d).mode & 0o077).toBe(0);
    expect(statSync(join(d, 'kontainers.db')).mode & 0o077).toBe(0);
  });
  test('snapshot writes a readable copy', () => {
    const d = dir();
    const db = openDb(d);
    db.query("INSERT INTO users (username, password_hash, created_at) VALUES ('x', 'h', 1)").run();
    const out = join(d, 'snap.db');
    snapshot(db, out);
    expect(existsSync(out)).toBe(true);
    const copy = new Database(out, { readonly: true });
    expect((copy.query('SELECT username FROM users').get() as { username: string }).username).toBe('x');
    expect(schemaVersion(copy)).toBe(MIGRATIONS.length);
  });
});
