// Local accounts, server-side sessions, first-run setup and login rate limiting.
// Every account is a full administrator: access to the Docker API is root on the host.

import type { Database } from 'bun:sqlite';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import * as v from './validate';

export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export interface User { id: number; username: string }
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
    const user = await this.createUser(username, password);
    this.setupToken = null;
    return user;
  }

  async createUser(username: string, password: string): Promise<User> {
    const u = v.username(username);
    const h = await Bun.password.hash(v.password(password), { algorithm: 'argon2id' });
    try {
      const row = this.db.query('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?) RETURNING id, username')
        .get(u, h, this.now()) as User;
      return row;
    } catch (e) {
      if (String(e).includes('UNIQUE')) { const err = new v.ValidationError('username already exists'); err.status = 409; throw err; }
      throw e;
    }
  }

  listUsers(): (User & { created_at: number })[] {
    return this.db.query('SELECT id, username, created_at FROM users ORDER BY id').all() as any;
  }

  deleteUser(id: number, actingUserId: number): void {
    if (id === actingUserId) throw new v.ValidationError('you cannot delete your own account');
    if (this.userCount() <= 1) throw new v.ValidationError('cannot delete the last user');
    this.db.query('DELETE FROM users WHERE id = ?').run(id);
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

  getSession(id: string | undefined): Session | null {
    if (!id || id.length > 100) return null;
    const idHash = hash(id);
    const row = this.db.query(
      'SELECT s.csrf, s.created_at, s.last_seen, u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?'
    ).get(idHash) as { csrf: string; created_at: number; last_seen: number; id: number; username: string } | null;
    if (!row) return null;
    const t = this.now();
    if (t - row.last_seen > SESSION_IDLE_MS || t - row.created_at > SESSION_MAX_MS) {
      this.db.query('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
      return null;
    }
    if (t - row.last_seen > 60000) this.db.query('UPDATE sessions SET last_seen = ? WHERE id_hash = ?').run(t, idHash);
    return { user: { id: row.id, username: row.username }, csrf: row.csrf, idHash };
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
}
