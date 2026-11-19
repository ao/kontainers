// Local accounts, server-side sessions, first-run setup and login rate limiting.
// Every account is a full administrator: access to the Docker API is root on the host.

import type { Database } from 'bun:sqlite';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import * as v from './validate';

export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

// admin: everything. viewer: looks at everything an admin sees on the pages (not the settings of
// other accounts, notification targets, registry logins or backups) and changes nothing but its
// own password and two-factor login.
export type Role = 'admin' | 'viewer';
export const ROLES: Role[] = ['admin', 'viewer'];
export interface User { id: number; username: string; role?: Role }
export const roleOf = (r: unknown): Role => (r === 'viewer' ? 'viewer' : 'admin');
export interface Session { user: User; csrf: string; idHash: string }

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class Auth {
  private setupToken: string | null = null;
  // A fixed hash to compare against when the user does not exist, so timing does not reveal usernames.
  private dummyHash = Bun.password.hashSync('kontainers-dummy-password', { algorithm: 'argon2id' });

  constructor(private db: Database, private now: () => number = Date.now) {}

  userCount(): number {
    return (this.db.query('SELECT count(*) AS n FROM users').get() as { n: number }).n;
  }

  needsSetup(): boolean { return this.userCount() === 0; }

  // Called at startup. Returns the one-time token to print, or null when setup is done.
  issueSetupToken(): string | null {
    this.setupToken = this.needsSetup() ? token(24) : null;
    return this.setupToken;
  }

  async setup(setupToken: string, username: string, password: string): Promise<User> {
    if (!this.needsSetup() || !this.setupToken) throw new v.ValidationError('setup is already complete');
    if (typeof setupToken !== 'string' || !safeEqual(setupToken, this.setupToken)) {
      const e = new v.ValidationError('wrong setup token'); e.status = 403; throw e;
    }
    // Claim the token before the slow password hash, so two requests sent at once cannot both
    // create an account. A refused username or password gives it back for another try.
    const claimed = this.setupToken;
    this.setupToken = null;
    try {
      return await this.createUser(username, password);
    } catch (e) {
      if (this.needsSetup()) this.setupToken = claimed;
      throw e;
    }
  }

  async createUser(username: string, password: string, role: unknown = 'admin'): Promise<User> {
    const u = v.username(username);
    if (role !== 'admin' && role !== 'viewer') throw new v.ValidationError('the role must be admin or viewer');
    const h = await Bun.password.hash(v.password(password), { algorithm: 'argon2id' });
    try {
      const row = this.db.query('INSERT INTO users (username, password_hash, created_at, role) VALUES (?, ?, ?, ?) RETURNING id, username, role')
        .get(u, h, this.now(), role) as User;
      return row;
    } catch (e) {
      if (String(e).includes('UNIQUE')) { const err = new v.ValidationError('username already exists'); err.status = 409; throw err; }
      throw e;
    }
  }

  listUsers(): (User & { created_at: number; role: Role })[] {
    return (this.db.query('SELECT id, username, created_at, role FROM users ORDER BY id').all() as any[]).map(u => ({ ...u, role: roleOf(u.role) }));
  }

  private admins(): number { return (this.db.query("SELECT COUNT(*) AS n FROM users WHERE role != 'viewer'").get() as { n: number }).n; }

  deleteUser(id: number, actingUserId: number): void {
    if (id === actingUserId) throw new v.ValidationError('you cannot delete your own account');
    if (this.userCount() <= 1) throw new v.ValidationError('cannot delete the last user');
    const row = this.db.query('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | null;
    // One administrator always stays, or nobody could change anything again.
    this.db.transaction(() => {
      if (row && roleOf(row.role) === 'admin' && this.admins() <= 1) throw new v.ValidationError('cannot remove the last administrator');
      this.db.query('DELETE FROM users WHERE id = ?').run(id);
    })();
  }

  // Changes an account's role; its sessions end, so pages opened with the old role go too.
  // actingUserId: null from the command line, which may change any account.
  setRole(id: number, role: unknown, actingUserId: number | null): User {
    if (role !== 'admin' && role !== 'viewer') throw new v.ValidationError('the role must be admin or viewer');
    if (actingUserId !== null && id === actingUserId) throw new v.ValidationError('you cannot change your own role; another administrator can');
    return this.db.transaction(() => {
      const row = this.db.query('SELECT id, username, role FROM users WHERE id = ?').get(id) as { id: number; username: string; role: string } | null;
      if (!row) throw Object.assign(new v.ValidationError('no such user'), { status: 404 });
      if (roleOf(row.role) === 'admin' && role === 'viewer' && this.admins() <= 1) throw new v.ValidationError('cannot make the last administrator read-only');
      this.db.query('UPDATE users SET role = ? WHERE id = ?').run(role, id);
      if (roleOf(row.role) !== role) this.db.query('DELETE FROM sessions WHERE user_id = ?').run(id);
      return { id: row.id, username: row.username, role: role as Role };
    })();
  }

  async changePassword(userId: number, current: string, next: string): Promise<void> {
    const row = this.db.query('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | null;
    if (!row || typeof current !== 'string' || !(await Bun.password.verify(current, row.password_hash))) {
      const e = new v.ValidationError('current password is wrong'); e.status = 403; throw e;
    }
    const h = await Bun.password.hash(v.password(next), { algorithm: 'argon2id' });
    this.db.transaction(() => {
      this.db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(h, userId);
      this.db.query('DELETE FROM sessions WHERE user_id = ?').run(userId); // log out everywhere
    })();
  }

  async verifyLogin(username: unknown, password: unknown): Promise<User | null> {
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 1024) return null;
    const row = this.db.query('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as
      { id: number; username: string; password_hash: string } | null;
    const ok = await Bun.password.verify(password, row ? row.password_hash : this.dummyHash);
    return ok && row ? { id: row.id, username: row.username } : null;
  }

  // Creates a new session. The caller sets the returned id as the cookie value.
  createSession(user: User): { id: string; csrf: string } {
    const id = token(32), csrf = token(32), t = this.now();
    this.db.query('INSERT INTO sessions (id_hash, user_id, csrf, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .run(hash(id), user.id, csrf, t, t);
    this.db.query('DELETE FROM sessions WHERE last_seen < ? OR created_at < ?').run(t - SESSION_IDLE_MS, t - SESSION_MAX_MS);
    return { id, csrf };
  }

  hasUser(username: string): boolean {
    return !!this.db.query('SELECT 1 FROM users WHERE username = ?').get(username);
  }

  getSession(id: string | undefined): Session | null {
    if (!id || id.length > 100) return null;
    const idHash = hash(id);
    const row = this.db.query(
      'SELECT s.csrf, s.created_at, s.last_seen, u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?'
    ).get(idHash) as { csrf: string; created_at: number; last_seen: number; id: number; username: string; role: string } | null;
    if (!row) return null;
    const t = this.now();
    if (t - row.last_seen > SESSION_IDLE_MS || t - row.created_at > SESSION_MAX_MS) {
      this.db.query('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
      return null;
    }
    // A failed write (full data volume) must not log everyone out: the session is still valid.
    if (t - row.last_seen > 60000) {
      try { this.db.query('UPDATE sessions SET last_seen = ? WHERE id_hash = ?').run(t, idHash); } catch { /* noted by the next write that matters */ }
    }
    return { user: { id: row.id, username: row.username, role: roleOf(row.role) }, csrf: row.csrf, idHash };
  }

  // Every session of the account but one (after two-factor login is turned on, a session made
  // with the password alone should not stay).
  endOtherSessions(userId: number, keepIdHash: string): void {
    this.db.query('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(userId, keepIdHash);
  }

  destroySession(idHash: string): void {
    this.db.query('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
  }
}

// Fixed-window failure counter, in memory. Keys are "ip:<addr>" and "user:<name>".
export class RateLimiter {
  private hits = new Map<string, { n: number; until: number }>();
  constructor(private max = 5, private windowMs = 15 * 60 * 1000, private now: () => number = Date.now) {}

  blocked(...keys: string[]): number {
    const t = this.now();
    let wait = 0;
    for (const k of keys) {
      const h = this.hits.get(k);
      if (h && h.until > t && h.n >= this.max) wait = Math.max(wait, Math.ceil((h.until - t) / 1000));
    }
    return wait;
  }

  fail(...keys: string[]): void {
    const t = this.now();
    for (const k of keys) {
      const h = this.hits.get(k);
      if (!h || h.until <= t) this.hits.set(k, { n: 1, until: t + this.windowMs });
      else h.n++;
    }
    if (this.hits.size > 10000) for (const [k, h] of this.hits) if (h.until <= t) this.hits.delete(k);
  }

  reset(...keys: string[]): void { for (const k of keys) this.hits.delete(k); }

  // Takes back one counted attempt (one that turned out not to be a failure).
  undo(...keys: string[]): void {
    for (const k of keys) { const h = this.hits.get(k); if (h && h.n > 0) h.n--; }
  }
}
