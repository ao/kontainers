// Two-factor login with time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30 s), as
// authenticator apps make them, and one-time recovery codes. Per account, kept in the database:
// the secret as base32, the last time step used (a code works once), and the recovery codes as
// SHA-256 hashes. The database backup therefore holds the secrets: keep it as private as the data
// volume (it already holds password hashes and sessions).

import type { Database } from 'bun:sqlite';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as v from './validate';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function unbase32(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('not base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

// The code for a time step (RFC 4226 dynamic truncation).
export function hotp(secret: Uint8Array, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const step = (ms: number) => Math.floor(ms / 30_000);

// The step a code belongs to, one step either side allowed for clock drift; null if none.
export function matchStep(secret: Uint8Array, code: string, ms: number): number | null {
  const c = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  for (const d of [0, -1, 1]) {
    const s = step(ms) + d;
    if (timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}

// What an authenticator app reads (as a link on a phone, or typed in by its key).
export function otpauthUri(secretB32: string, username: string, issuer = 'kontainers'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const hashCode = (c: string) => createHash('sha256').update(c.toLowerCase().replace(/[\s-]/g, '')).digest('hex');

export class TwoFactor {
  constructor(private db: Database, private now: () => number = Date.now) {}

  enabled(userId: number): boolean {
    return !!(this.db.query('SELECT totp_secret FROM users WHERE id = ?').get(userId) as { totp_secret: string | null } | null)?.totp_secret;
  }

  newSecret(): string { return base32(randomBytes(20)); }

  // Turns two-factor on with a secret the user's app produced `code` for. Returns the recovery
  // codes, shown once.
  enable(userId: number, secretB32: string, code: string): string[] {
    const s = matchStep(unbase32(secretB32), code, this.now());
    if (s === null) throw new v.ValidationError('that code does not match: check the time on the phone, and enter the code the app shows now');
    const codes = Array.from({ length: 10 }, () => { const r = base32(randomBytes(8)).toLowerCase().slice(0, 10); return `${r.slice(0, 5)}-${r.slice(5)}`; });
    this.db.transaction(() => {
      this.db.query('UPDATE users SET totp_secret = ?, totp_last_step = ? WHERE id = ?').run(secretB32, s, userId);
      this.db.query('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
      for (const c of codes) this.db.query('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)').run(userId, hashCode(c));
    })();
    return codes;
  }

  disable(userId: number): void {
    this.db.transaction(() => {
      this.db.query('UPDATE users SET totp_secret = NULL, totp_last_step = NULL WHERE id = ?').run(userId);
      this.db.query('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    })();
  }

  // A code from the app (each works once: not the last step used, nor one before it), or an
  // unused recovery code. Returns what it was, or null.
  verify(userId: number, code: string): 'totp' | 'recovery' | null {
    const row = this.db.query('SELECT totp_secret, totp_last_step FROM users WHERE id = ?').get(userId) as { totp_secret: string | null; totp_last_step: number | null } | null;
    if (!row?.totp_secret) return null;
    const s = matchStep(unbase32(row.totp_secret), code, this.now());
    if (s !== null && (row.totp_last_step === null || s > row.totp_last_step)) {
      this.db.query('UPDATE users SET totp_last_step = ? WHERE id = ?').run(s, userId);
      return 'totp';
    }
    const used = this.db.query('UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL').run(this.now(), userId, hashCode(code));
    return used.changes ? 'recovery' : null;
  }

  recoveryLeft(userId: number): number {
    return (this.db.query('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').get(userId) as { n: number }).n;
  }
}
