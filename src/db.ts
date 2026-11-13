import { Database } from 'bun:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

// Ordered schema migrations. Never edit a released entry; append a new one.
export const MIGRATIONS: string[] = [
  // 1: v0.2.0
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     id_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     csrf TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_seen INTEGER NOT NULL
   );
   CREATE TABLE proxy_rules (
     id INTEGER PRIMARY KEY,
     hostname TEXT NOT NULL,
     path TEXT NOT NULL DEFAULT '/',
     target_container TEXT NOT NULL,
     target_port INTEGER NOT NULL,
     tls INTEGER NOT NULL DEFAULT 1,
     enabled INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL,
     UNIQUE (hostname, path)
   );
   CREATE TABLE audit_log (
     id INTEGER PRIMARY KEY,
     at INTEGER NOT NULL,
     username TEXT,
     action TEXT NOT NULL,
     target TEXT,
     ip TEXT
   );`,
];

export function openDb(dataDir: string): Database {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, 'kontainers.db');
  const db = new Database(file, { create: true, strict: true });
  try { chmodSync(file, 0o600); } catch { /* not fatal on odd filesystems */ }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function schemaVersion(db: Database): number {
  return (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
}

export function migrate(db: Database): void {
  const current = schemaVersion(db);
  if (current > MIGRATIONS.length) {
    throw new Error(`database schema ${current} is newer than this kontainers (${MIGRATIONS.length}); refusing to start`);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

// Consistent online snapshot of the database.
export function snapshot(db: Database, dest: string): void {
  // The copy holds password hashes and live session data: create it private, not with the umask.
  const old = process.umask(0o077);
  try { db.query('VACUUM INTO ?').run(dest); } finally { process.umask(old); }
  chmodSync(dest, 0o600);
}
