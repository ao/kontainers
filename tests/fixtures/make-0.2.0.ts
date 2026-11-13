// Writes the database that kontainers 0.2.0 leaves behind: schema version 1, MIGRATIONS[0] only.
// The upgrade tests start from this file.
//
//   docker run --rm -v "$PWD":/app -w /app oven/bun:1.3.1 \
//     bun tests/fixtures/make-0.2.0.ts tests/fixtures/kontainers-0.2.0.db
//
// The schema comes from MIGRATIONS[0], which is never edited. Timestamps are fixed, so the output
// is the same apart from the password hashes (argon2id uses a random salt). Commit the regenerated
// file only when the fixture itself changes.

import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { MIGRATIONS } from '../../src/db';

const out = process.argv[2];
if (!out) {
  console.error('usage: bun tests/fixtures/make-0.2.0.ts OUTPUT.db');
  process.exit(2);
}
if (existsSync(out)) rmSync(out);

const T = 1767225600000; // 2026-01-01T00:00:00Z
const ADMIN_PASSWORD = 'correct horse battery'; // the same password the API tests use
const OPS_PASSWORD = 'ops account, 0.2.0 fixture';
// Expired by any later date (idle limit is 12 hours), so the upgrade test can check that
// an old session is refused.
const OLD_SESSION = 'fixture-session-from-0.2.0-0123456789abcdef';

const db = new Database(out, { create: true, strict: true });
db.exec('PRAGMA journal_mode = DELETE'); // one file, no -wal or -shm next to it
db.exec(MIGRATIONS[0]);
db.exec('PRAGMA user_version = 1');

const hash = (s: string) => Bun.password.hashSync(s, { algorithm: 'argon2id' });
const addUser = db.query('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)');
addUser.run(1, 'admin', hash(ADMIN_PASSWORD), T);
addUser.run(2, 'ops', hash(OPS_PASSWORD), T + 60_000);

db.query('INSERT INTO sessions (id_hash, user_id, csrf, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
  .run(createHash('sha256').update(OLD_SESSION).digest('hex'), 1, 'fixture-csrf-token', T, T);

const addRule = db.query('INSERT INTO proxy_rules (hostname, path, target_container, target_port, tls, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
addRule.run('app.example.com', '/', 'web', 8000, 1, 1, T);
addRule.run('example.org', '/api', 'api', 3000, 0, 0, T + 120_000);

const addAudit = db.query('INSERT INTO audit_log (at, username, action, target, ip) VALUES (?, ?, ?, ?, ?)');
addAudit.run(T + 1_000, 'admin', 'setup', null, '127.0.0.1');
addAudit.run(T + 2_000, 'admin', 'proxy-create', 'app.example.com', '127.0.0.1');
addAudit.run(T + 3_000, 'admin', 'user-create', 'ops', '127.0.0.1');
addAudit.run(T + 4_000, null, 'login-failed', 'ops', '192.0.2.10');

db.exec('VACUUM');
const version = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
db.close();
console.log(`wrote ${out}: schema version ${version}, 2 users, 1 session, 2 proxy rules, 4 audit rows`);
