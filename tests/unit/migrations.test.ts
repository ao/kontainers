import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MIGRATIONS, migrate } from '../../src/db';

const FIXTURE = join(import.meta.dir, '../fixtures/kontainers-0.2.0.db');

// The schema as SQLite stores it (the SQL text of every object) plus the version. Two databases
// with the same schema give the same string.
function schemaOf(db: Database): string {
  const objects = db.query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  const version = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
  return JSON.stringify({ version, objects });
}

function freshDb(): Database {
  const db = new Database(':memory:', { strict: true });
  migrate(db);
  return db;
}

// A database as release n left it: the first n migrations applied, user_version = n.
function databaseAtVersion(n: number): Database {
  const db = new Database(':memory:', { strict: true });
  for (let v = 0; v < n; v++) {
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }
  return db;
}

describe('migrations', () => {
  test('every earlier schema, migrated in order, ends with the same schema as a fresh database', () => {
    const want = schemaOf(freshDb());
    for (let n = 0; n < MIGRATIONS.length; n++) {
      const db = databaseAtVersion(n);
      migrate(db);
      expect(schemaOf(db)).toBe(want);
    }
  });

  test('each migration is non-empty SQL', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    for (const m of MIGRATIONS) expect(m.trim().length).toBeGreaterThan(0);
  });

  test('the 0.2.0 fixture is at schema version 1 and migrates to the fresh schema without losing rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kontainers-fixture-'));
    const file = join(dir, 'kontainers.db');
    copyFileSync(FIXTURE, file);
    const db = new Database(file, { strict: true });
    expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
    expect(schemaOf(db)).toBe(schemaOf(databaseAtVersion(1)));

    migrate(db);
    expect(schemaOf(db)).toBe(schemaOf(freshDb()));
    const count = (t: string) => (db.query(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
    expect([count('users'), count('sessions'), count('proxy_rules'), count('audit_log')]).toEqual([2, 1, 2, 4]);
    db.close();
  });
});
