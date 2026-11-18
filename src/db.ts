import { Database } from 'bun:sqlite';
import { mkdirSync, chmodSync, unlinkSync } from 'node:fs';
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
  // 2: v0.4.0: notifications and automatic updates
  `CREATE TABLE notify_targets (
     id INTEGER PRIMARY KEY,
     kind TEXT NOT NULL CHECK (kind IN ('webhook', 'ntfy')),
     url TEXT NOT NULL,
     token TEXT,
     events TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_at INTEGER,
     last_result TEXT
   );
   CREATE TABLE notify_sent (
     key TEXT PRIMARY KEY,
     at INTEGER NOT NULL
   );
   CREATE TABLE auto_update (
     container TEXT PRIMARY KEY,
     container_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_at INTEGER,
     last_result TEXT,
     held_image TEXT
   );
   ALTER TABLE audit_log ADD COLUMN result TEXT;
   CREATE INDEX audit_log_at ON audit_log (at);`,
  // 3: v0.4.0: registry logins (secret: AES-256-GCM, key in registry.key beside the database)
  `CREATE TABLE registry_logins (
     id INTEGER PRIMARY KEY,
     registry TEXT NOT NULL UNIQUE,
     username TEXT NOT NULL,
     secret BLOB NOT NULL,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER,
     last_result TEXT
   );`,
  // 4: v0.4.0: replacements in progress, so a restart in the middle of one can finish it
  `CREATE TABLE replacing (
     name TEXT PRIMARY KEY,
     old_id TEXT NOT NULL,
     was_running INTEGER NOT NULL,
     at INTEGER NOT NULL
   );`,
  // 5: v0.4.0: a replacement being rolled back
  `ALTER TABLE replacing ADD COLUMN rollback INTEGER NOT NULL DEFAULT 0;`,
  // 6: v0.5.0: settings made on the Settings page, and when checks first saw an image
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE image_seen (
     ref TEXT NOT NULL,
     image TEXT NOT NULL,
     first_seen INTEGER NOT NULL,
     PRIMARY KEY (ref, image)
   );`,
  // 7: v0.5.0: two-factor login
  `ALTER TABLE users ADD COLUMN totp_secret TEXT;
   ALTER TABLE users ADD COLUMN totp_last_step INTEGER;
   CREATE TABLE recovery_codes (
     user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     code_hash TEXT NOT NULL,
     used_at INTEGER,
     PRIMARY KEY (user_id, code_hash)
   );`,
];

// degraded: opened without the shared-memory file, because the data volume had no room for it.
export function openDb(dataDir: string): Database & { degraded?: string } {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, 'kontainers.db');
  const open = (exclusive: boolean) => {
    const db = new Database(file, { create: true, strict: true });
    try {
      try { chmodSync(file, 0o600); } catch { /* not fatal on odd filesystems */ }
      // In exclusive locking mode, set before WAL is first used, SQLite keeps the WAL index in
      // memory and never needs the -shm file, which a full volume cannot grow.
      // The wait for a lock first, so a second process (kontainers backup) waits instead of failing.
      db.exec('PRAGMA busy_timeout = 5000;');
      if (exclusive) db.exec('PRAGMA locking_mode = EXCLUSIVE;');
      db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      // A copy first, so an older kontainers can be started again on it: an upgrade that fails, or
      // one the owner wants to undo. No copy, no migration.
      migrate(db, (from, to) => {
        const dest = join(dataDir, 'backups', beforeMigrationName(to));
        try { backupDir(dataDir); snapshot(db, dest); } catch (e) {
          try { unlinkSync(dest); } catch { /* not written */ }
          throw new Error(`could not copy the database to ${dest} before migrating it from schema ${from} to ${to} (${(e as Error).message}); free space on the data volume and start again`);
        }
        console.log(`kontainers: copied the database to ${dest} before migrating it from schema ${from} to ${to}; an older kontainers can be started on that copy`);
      });
      // SQLite can fall back to a read-only shared-memory file it could not open for writing; then
      // every write fails later. Taking the write lock once finds that out now.
      db.exec('BEGIN IMMEDIATE; ROLLBACK;');
      return db;
    } catch (e) { db.close(); throw e; }
  };
  try {
    return open(false);
  } catch (e) {
    if (!/SHMSIZE|SHMOPEN|SHMMAP|READONLY|readonly database|disk I\/O error|database or disk is full|SQLITE_FULL|ENOSPC/i.test(`${(e as { code?: string }).code ?? ''} ${(e as Error).message}`)) throw e;
    const db: Database & { degraded?: string } = open(true);
    db.degraded = `${(e as Error).message}`;
    return db;
  }
}

export function schemaVersion(db: Database): number {
  return (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
}

// <data>/backups, private to kontainers' user (backups.ts).
export function backupDir(dataDir: string): string {
  const dir = join(dataDir, 'backups');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* odd filesystems */ }
  return dir;
}

// The name of the copy taken before migrating to `schema`, at `at`.
export function beforeMigrationName(schema: number, at = Date.now()): string {
  const t = new Date(at).toISOString();
  return `before-schema-${schema}-${t.slice(0, 10).replace(/-/g, '')}-${t.slice(11, 19).replace(/:/g, '')}.db`;
}

// before(from, to): called once before an existing database (schema `from`, not 0) is migrated.
export function migrate(db: Database, before?: (from: number, to: number) => void): void {
  const current = schemaVersion(db);
  if (current > MIGRATIONS.length) {
    throw new Error(`database schema ${current} is newer than this kontainers (${MIGRATIONS.length}); refusing to start`);
  }
  if (before && current > 0 && current < MIGRATIONS.length) before(current, MIGRATIONS.length);
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
