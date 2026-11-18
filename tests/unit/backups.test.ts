import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MIGRATIONS, migrate, openDb, schemaVersion } from '../../src/db';
import { Backups } from '../../src/backups';

const FIXTURE = join(import.meta.dir, '../fixtures/kontainers-0.2.0.db');
const DAY = 86400_000;

function setup(keep = 7, start = Date.UTC(2026, 10, 19, 10)) {
  const dir = mkdtempSync(join(tmpdir(), 'kbak-'));
  const db = openDb(dir);
  let now = start;
  const b = new Backups(db, dir, keep, () => now);
  return { dir, db, b, later: (ms: number) => { now += ms; } };
}

describe('daily copies of the database', () => {
  test('one a day, private, the newest few kept', () => {
    const { dir, b, later } = setup(3);
    expect(b.daily()).toBe('kontainers-2026-11-19.db');
    expect(b.daily()).toBeNull(); // the same day
    expect(statSync(join(dir, 'backups')).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'backups', 'kontainers-2026-11-19.db')).mode & 0o777).toBe(0o600);
    // A real database: it opens and has the schema.
    const copy = new Database(join(dir, 'backups', 'kontainers-2026-11-19.db'), { readonly: true });
    expect(schemaVersion(copy)).toBe(MIGRATIONS.length);
    copy.close();
    for (let i = 1; i <= 4; i++) { later(DAY); expect(b.daily()).toBe(`kontainers-2026-11-${19 + i}.db`); }
    expect(b.list().map(f => f.name)).toEqual(['kontainers-2026-11-23.db', 'kontainers-2026-11-22.db', 'kontainers-2026-11-21.db']);
    // No half-written file is left over.
    expect(readdirSync(join(dir, 'backups')).filter(n => n.endsWith('.part'))).toEqual([]);
  });

  test('KONTAINERS_BACKUP_KEEP=0 turns them off', () => {
    const { dir, b } = setup(0);
    expect(b.daily()).toBeNull();
    expect(() => readdirSync(join(dir, 'backups'))).toThrow();
    expect(b.list()).toEqual([]);
  });

  test('only backup names can be downloaded', () => {
    const { b } = setup();
    b.daily();
    expect(b.path('kontainers-2026-11-19.db')).toEndWith('/backups/kontainers-2026-11-19.db');
    for (const bad of ['../kontainers.db', 'kontainers.db', 'registry.key', '..%2fkontainers.db', 'kontainers-2026-11-19.db/../../x', '', 'before-schema-7-x.db']) {
      expect(() => b.path(bad)).toThrow('no such backup');
    }
    expect(() => b.path('kontainers-2026-11-20.db')).toThrow('no such backup');
  });
});

describe('a copy before a migration', () => {
  test('an older database is copied before it is migrated, and the copy is the old schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kmig-'));
    copyFileSync(FIXTURE, join(dir, 'kontainers.db'));
    const db = openDb(dir);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    const files = readdirSync(join(dir, 'backups'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(new RegExp(`^before-schema-${MIGRATIONS.length}-\\d{8}-\\d{6}\\.db$`));
    const copy = new Database(join(dir, 'backups', files[0]), { readonly: true });
    expect(schemaVersion(copy)).toBe(1);
    copy.close();
    db.close();
    // Opened again, at the current schema: no new copy.
    openDb(dir).close();
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
  });

  test('a new database and a current one are not copied; the callback is told the schemas', () => {
    const calls: [number, number][] = [];
    const fresh = new Database(':memory:');
    migrate(fresh, (a, b) => calls.push([a, b]));
    migrate(fresh, (a, b) => calls.push([a, b]));
    expect(calls).toEqual([]);
    const old = new Database(':memory:');
    old.exec(MIGRATIONS[0]); old.exec('PRAGMA user_version = 1');
    migrate(old, (a, b) => calls.push([a, b]));
    expect(calls).toEqual([[1, MIGRATIONS.length]]);
  });

  test('no copy, no migration: a copy that cannot be written leaves the database as it was', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kmig-'));
    copyFileSync(FIXTURE, join(dir, 'kontainers.db'));
    // A file where the backups directory should be.
    writeFileSync(join(dir, 'backups'), 'not a directory');
    expect(() => openDb(dir)).toThrow('before migrating it from schema 1');
    const db = new Database(join(dir, 'kontainers.db'), { readonly: true });
    expect(schemaVersion(db)).toBe(1);
    db.close();
  });

  test('the newest three copies before migrations are kept', () => {
    const { dir, b } = setup();
    const names = ['before-schema-5-20261101-000000.db', 'before-schema-6-20261110-000000.db', 'before-schema-7-20261118-000000.db', 'before-schema-8-20261119-000000.db'];
    mkdirSync(join(dir, 'backups'));
    for (const n of names) writeFileSync(join(dir, 'backups', n), 'x');
    b.prune();
    expect(b.list().filter(f => f.kind === 'before-migration').map(f => f.name)).toEqual(names.slice(1).reverse());
  });
});
