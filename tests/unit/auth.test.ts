import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../../src/db';
import { Auth, RateLimiter, SESSION_IDLE_MS, SESSION_MAX_MS } from '../../src/auth';

const PW = 'correct horse battery';

function fresh(now = { t: 1_000_000 }) {
  const db = new Database(':memory:', { strict: true });
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return { db, now, auth: new Auth(db, () => now.t) };
}

describe('first-run setup', () => {
  test('needs the printed token, works once, then closes', async () => {
    const { auth } = fresh();
    expect(auth.needsSetup()).toBe(true);
    const tok = auth.issueSetupToken()!;
    expect(tok.length).toBeGreaterThan(20);
    await expect(auth.setup('wrong', 'admin', PW)).rejects.toMatchObject({ status: 403 });
    await expect(auth.setup(tok + 'x', 'admin', PW)).rejects.toMatchObject({ status: 403 });
    const u = await auth.setup(tok, 'admin', PW);
    expect(u.username).toBe('admin');
    expect(auth.needsSetup()).toBe(false);
    await expect(auth.setup(tok, 'second', PW)).rejects.toThrow('already complete');
    expect(auth.issueSetupToken()).toBeNull();
  });

  test('two setups sent at once with the right token create one account', async () => {
    const { auth } = fresh();
    const tok = auth.issueSetupToken()!;
    const results = await Promise.allSettled([auth.setup(tok, 'first', PW), auth.setup(tok, 'second', PW), auth.setup(tok, 'third', PW)]);
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);
    expect(auth.userCount()).toBe(1);
  });

  test('a refused password during setup leaves the token usable', async () => {
    const { auth } = fresh();
    const tok = auth.issueSetupToken()!;
    await expect(auth.setup(tok, 'admin', 'short')).rejects.toThrow('12');
    expect((await auth.setup(tok, 'admin', PW)).username).toBe('admin');
  });

  test('without a token issued, setup is impossible', async () => {
    const { auth } = fresh();
    await expect(auth.setup('', 'admin', PW)).rejects.toThrow();
  });

  test('rejects weak passwords', async () => {
    const { auth } = fresh();
    const tok = auth.issueSetupToken()!;
    await expect(auth.setup(tok, 'admin', 'short')).rejects.toThrow('12');
    expect(auth.needsSetup()).toBe(true);
  });
});

describe('login', () => {
  test('stores argon2id hashes, verifies, and does not care about username case', async () => {
    const { auth, db } = fresh();
    await auth.createUser('Admin', PW);
    const row = db.query('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(await auth.verifyLogin('admin', PW)).toMatchObject({ username: 'Admin' });
    expect(await auth.verifyLogin('admin', PW + 'x')).toBeNull();
    expect(await auth.verifyLogin('nobody', PW)).toBeNull();
    expect(await auth.verifyLogin(['admin'], PW)).toBeNull();
    expect(await auth.verifyLogin('admin', 'x'.repeat(2000))).toBeNull();
  });

  test('duplicate usernames are rejected', async () => {
    const { auth } = fresh();
    await auth.createUser('admin', PW);
    await expect(auth.createUser('ADMIN', PW)).rejects.toMatchObject({ status: 409 });
  });
});

describe('sessions', () => {
  let ctx: ReturnType<typeof fresh>;
  beforeEach(() => { ctx = fresh(); });

  test('stores only a hash of the session id', async () => {
    const u = await ctx.auth.createUser('admin', PW);
    const { id } = ctx.auth.createSession(u);
    const rows = ctx.db.query('SELECT id_hash FROM sessions').all() as { id_hash: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0].id_hash).not.toContain(id);
    expect(ctx.auth.getSession(id)?.user.username).toBe('admin');
  });

  test('each login gets a new id and csrf token', async () => {
    const u = await ctx.auth.createUser('admin', PW);
    const a = ctx.auth.createSession(u), b = ctx.auth.createSession(u);
    expect(a.id).not.toBe(b.id);
    expect(a.csrf).not.toBe(b.csrf);
  });

  test('idle expiry', async () => {
    const u = await ctx.auth.createUser('admin', PW);
    const { id } = ctx.auth.createSession(u);
    ctx.now.t += SESSION_IDLE_MS + 1;
    expect(ctx.auth.getSession(id)).toBeNull();
  });

  test('activity extends the idle window but not the absolute one', async () => {
    const u = await ctx.auth.createUser('admin', PW);
    const { id } = ctx.auth.createSession(u);
    let elapsed = 0;
    while (elapsed + SESSION_IDLE_MS / 2 < SESSION_MAX_MS) {
      ctx.now.t += SESSION_IDLE_MS / 2; elapsed += SESSION_IDLE_MS / 2;
      expect(ctx.auth.getSession(id)).not.toBeNull();
    }
    ctx.now.t += SESSION_MAX_MS - elapsed + 1; // past the absolute limit, though recently active
    expect(ctx.auth.getSession(id)).toBeNull();
  });

  test('logout destroys the session', async () => {
    const u = await ctx.auth.createUser('admin', PW);
    const { id } = ctx.auth.createSession(u);
    ctx.auth.destroySession(ctx.auth.getSession(id)!.idHash);
    expect(ctx.auth.getSession(id)).toBeNull();
  });

  test('password change logs out every session of that user only', async () => {
    const a = await ctx.auth.createUser('a', PW), b = await ctx.auth.createUser('b', PW);
    const s1 = ctx.auth.createSession(a), s2 = ctx.auth.createSession(a), s3 = ctx.auth.createSession(b);
    await expect(ctx.auth.changePassword(a.id, 'wrong password', 'new password 123')).rejects.toMatchObject({ status: 403 });
    expect(ctx.auth.getSession(s1.id)).not.toBeNull();
    await ctx.auth.changePassword(a.id, PW, 'new password 123');
    expect(ctx.auth.getSession(s1.id)).toBeNull();
    expect(ctx.auth.getSession(s2.id)).toBeNull();
    expect(ctx.auth.getSession(s3.id)).not.toBeNull();
    expect(await ctx.auth.verifyLogin('a', 'new password 123')).not.toBeNull();
  });

  test('deleting a user removes their sessions; the last user and yourself cannot be deleted', async () => {
    const a = await ctx.auth.createUser('a', PW), b = await ctx.auth.createUser('b', PW);
    const sb = ctx.auth.createSession(b);
    expect(() => ctx.auth.deleteUser(a.id, a.id)).toThrow('own account');
    ctx.auth.deleteUser(b.id, a.id);
    expect(ctx.auth.getSession(sb.id)).toBeNull();
    expect(() => ctx.auth.deleteUser(a.id, 999)).toThrow('last user');
  });

  test('garbage cookie values are ignored', () => {
    expect(ctx.auth.getSession(undefined)).toBeNull();
    expect(ctx.auth.getSession('')).toBeNull();
    expect(ctx.auth.getSession('x'.repeat(500))).toBeNull();
    expect(ctx.auth.getSession("' OR 1=1 --")).toBeNull();
  });
});

describe('RateLimiter', () => {
  test('blocks after max failures per key, for the window', () => {
    const now = { t: 0 };
    const rl = new RateLimiter(5, 60_000, () => now.t);
    for (let i = 0; i < 5; i++) { expect(rl.blocked('ip:1')).toBe(0); rl.fail('ip:1', 'user:a'); }
    expect(rl.blocked('ip:1')).toBeGreaterThan(0);
    expect(rl.blocked('ip:2', 'user:a')).toBeGreaterThan(0); // the account is locked from any address
    expect(rl.blocked('ip:2', 'user:b')).toBe(0);
    now.t += 60_001;
    expect(rl.blocked('ip:1')).toBe(0);
  });
  test('reset clears a key', () => {
    const rl = new RateLimiter(1, 60_000);
    rl.fail('k');
    expect(rl.blocked('k')).toBeGreaterThan(0);
    rl.reset('k');
    expect(rl.blocked('k')).toBe(0);
  });
});
