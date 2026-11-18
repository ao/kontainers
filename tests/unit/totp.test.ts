import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../../src/db';
import { TwoFactor, base32, hotp, matchStep, otpauthUri, step, unbase32 } from '../../src/totp';

const RFC = new TextEncoder().encode('12345678901234567890'); // RFC 6238 appendix B, SHA-1

describe('TOTP', () => {
  test('the RFC 6238 test vectors (last six digits)', () => {
    expect(hotp(RFC, step(59_000))).toBe('287082');
    expect(hotp(RFC, step(1111111109_000))).toBe('081804');
    expect(hotp(RFC, step(1234567890_000))).toBe('005924');
    expect(hotp(RFC, step(2000000000_000))).toBe('279037');
  });
  test('base32 both ways', () => {
    expect(base32(RFC)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect([...unbase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')]).toEqual([...RFC]);
    expect(() => unbase32('not!base32')).toThrow();
  });
  test('a code from the step before or after is accepted; others and non-codes are not', () => {
    const t = 1111111109_000;
    expect(matchStep(RFC, '081804', t)).toBe(step(t));
    expect(matchStep(RFC, hotp(RFC, step(t) - 1), t)).toBe(step(t) - 1);
    expect(matchStep(RFC, hotp(RFC, step(t) + 2), t)).toBeNull();
    expect(matchStep(RFC, '08180', t)).toBeNull();
    expect(matchStep(RFC, 'abcdef', t)).toBeNull();
    expect(matchStep(RFC, '081 804', t)).toBe(step(t));
  });
  test('the app link', () => {
    expect(otpauthUri('ABC', 'admin user')).toBe('otpauth://totp/kontainers:admin%20user?secret=ABC&issuer=kontainers&algorithm=SHA1&digits=6&period=30');
  });
});

describe('TwoFactor', () => {
  const setup = () => {
    const db = new Database(':memory:', { strict: true }); migrate(db);
    db.query("INSERT INTO users (username, password_hash, created_at) VALUES ('admin', 'x', 0)").run();
    let now = 1111111109_000;
    const tf = new TwoFactor(db, () => now);
    return { db, tf, at: (ms: number) => { now = ms; }, now: () => now };
  };
  test('turning on needs a right code; each code works once; recovery codes work once', () => {
    const { tf, at, now } = setup();
    const secret = base32(RFC);
    expect(() => tf.enable(1, secret, '000000')).toThrow('does not match');
    const codes = tf.enable(1, secret, hotp(RFC, step(now())));
    expect(codes).toHaveLength(10);
    expect(codes.every(c => /^[a-z2-7]{5}-[a-z2-7]{5}$/.test(c))).toBe(true);
    expect(tf.enabled(1)).toBe(true);
    // The code used to turn it on does not log in.
    expect(tf.verify(1, hotp(RFC, step(now())))).toBeNull();
    at(now() + 30_000);
    expect(tf.verify(1, hotp(RFC, step(now())))).toBe('totp');
    expect(tf.verify(1, hotp(RFC, step(now())))).toBeNull(); // replayed
    expect(tf.verify(1, codes[3].toUpperCase())).toBe('recovery');
    expect(tf.verify(1, codes[3])).toBeNull();
    expect(tf.recoveryLeft(1)).toBe(9);
    tf.disable(1);
    expect(tf.enabled(1)).toBe(false);
    expect(tf.verify(1, codes[4])).toBeNull();
  });
});
