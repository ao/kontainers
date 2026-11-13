// The server process starts on a copy of the database written by kontainers 0.2.0
// (tests/fixtures/kontainers-0.2.0.db, made by tests/fixtures/make-0.2.0.ts). It must open the
// data, keep the account, the rules and the audit log, and leave the schema at the current version.
// This is the base for upgrade tests from 0.2.0 onward: add a new fixture per release that changes
// the schema, and point the same checks at it.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MIGRATIONS } from '../../src/db';
import { Client, PW, startServer, type Running } from './helpers';

const FIXTURE = join(import.meta.dir, '../fixtures/kontainers-0.2.0.db');
const OLD_SESSION = 'fixture-session-from-0.2.0-0123456789abcdef';

describe('upgrade from the 0.2.0 database', () => {
  let srv: Running;
  let dataDir: string;
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'kontainers-upgrade-'));
    copyFileSync(FIXTURE, join(dataDir, 'kontainers.db'));
    // The rules page lists rules only when the proxy is enabled. Caddy is deliberately missing here,
    // so the server logs that the proxy did not start and keeps serving the UI.
    srv = await startServer({ KONTAINERS_PROXY: '1', KONTAINERS_CADDY_BIN: '/nonexistent/caddy' }, dataDir);
  });
  afterAll(async () => { await srv?.stop(); });

  test('starts without a setup token, because accounts exist', () => {
    expect(srv.setupToken).toBeNull();
    expect(srv.output()).not.toContain('refusing to start');
  });

  test('the account logs in with its 0.2.0 password', async () => {
    const c = new Client(srv.base);
    const r = await c.post('/login', { username: 'admin', password: PW }, { csrf: false });
    expect(r.status).toBe(303);
    expect(r.headers.get('set-cookie')).toMatch(/^kontainers_session=/);
  });

  test('the rules from 0.2.0 are listed', async () => {
    const c = new Client(srv.base);
    await c.post('/login', { username: 'admin', password: PW }, { csrf: false });
    const page = await c.page('/proxy');
    expect(page).toContain('Proxy: not running'); // no Caddy in this test
    expect(page).toContain('app.example.com');
    expect(page).toContain('example.org');
    expect(srv.output()).toContain('proxy did not start');
  });

  test('a session from 0.2.0 that has expired is still refused', async () => {
    const c = new Client(srv.base);
    c.cookies.set('kontainers_session', OLD_SESSION);
    expect((await c.get('/proxy')).headers.get('location')).toBe('/login');
  });

  test('the schema is at the current version and the rows are all there', async () => {
    await srv.stop();
    const db = new Database(join(dataDir, 'kontainers.db'), { readonly: true, strict: true });
    try {
      expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
      const count = (t: string) => (db.query(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
      expect(count('users')).toBe(2);
      expect(count('proxy_rules')).toBe(2);
      // The four 0.2.0 rows plus the login made above.
      expect(count('audit_log')).toBeGreaterThanOrEqual(5);
      expect((db.query("SELECT count(*) AS n FROM audit_log WHERE action = 'proxy-create'").get() as { n: number }).n).toBe(1);
    } finally {
      db.close();
    }
  });
});
