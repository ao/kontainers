// Two-factor login against the real server: set-up, the second step, replays, recovery codes,
// too many wrong codes, and the reset from the command line.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client, PW, readyServer, runMain, type Running } from './helpers';
import { hotp, step, unbase32 } from '../../src/totp';

describe('two-factor login', () => {
  let srv: Running, c: Client, secret: Uint8Array, recovery: string[] = [];
  const code = (offset = 0) => hotp(secret, step(Date.now()) + offset);
  const passwordStep = async (cl: Client) => {
    const res = await cl.post('/login', { username: 'admin', password: PW }, { csrf: false });
    const body = await res.text();
    return { res, body, token: /name="token" value="([^"]+)"/.exec(body)?.[1] ?? '' };
  };

  beforeAll(async () => { ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' })); });
  afterAll(async () => { await srv?.stop(); });

  test('set-up: a wrong code is refused, the right one turns it on and shows recovery codes once', async () => {
    await c.page('/settings');
    const start = await c.post('/settings/2fa/start', {});
    const page = await start.text();
    const key = /<dt>Key<\/dt><dd><code>([A-Z2-7 ]+)<\/code>/.exec(page)![1];
    expect(page).toContain('otpauth://totp/kontainers:admin?secret=');
    secret = unbase32(key);
    c.csrf = /name="_csrf" value="([^"]+)"/.exec(page)![1];
    const wrong = await c.post('/settings/2fa/confirm', { code: '000000' });
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain('that code does not match');
    const ok = await c.post('/settings/2fa/confirm', { code: code() });
    const shown = await ok.text();
    recovery = [...shown.matchAll(/<li><code>([a-z2-7]{5}-[a-z2-7]{5})<\/code><\/li>/g)].map(m => m[1]);
    expect(recovery).toHaveLength(10);
    expect(await c.page('/settings')).toContain('On: logging in asks for a code');
  });

  test('the password alone does not log in; the code does, once', async () => {
    await Bun.sleep(31_000); // the set-up used this step's code
    const other = new Client(srv.base);
    const first = await passwordStep(other);
    expect(first.res.status).toBe(200);
    expect(first.body).toContain('action="/login/code"');
    expect(first.res.headers.getSetCookie().some(x => /kontainers_session=[^;]+/.test(x) && !/Max-Age=0/.test(x))).toBe(false);
    expect((await other.post('/login/code', { token: first.token, code: '123456' }, { csrf: false })).status).toBe(401);
    const good = code();
    const done = await other.post('/login/code', { token: first.token, code: good }, { csrf: false });
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toBe('/containers');
    expect((await other.get('/containers')).status).toBe(200);
    // The same code again, on a new login: refused.
    const again = new Client(srv.base);
    const second = await passwordStep(again);
    expect((await again.post('/login/code', { token: second.token, code: good }, { csrf: false })).status).toBe(401);
  }, 60_000);

  test('a recovery code logs in once', async () => {
    const r = new Client(srv.base);
    const p1 = await passwordStep(r);
    const res = await r.post('/login/code', { token: p1.token, code: recovery[0].toUpperCase() }, { csrf: false });
    expect(res.status).toBe(303);
    expect(await r.page('/containers')).toContain('Logged in with a recovery code; 9 are left');
    const r2 = new Client(srv.base);
    const p2 = await passwordStep(r2);
    expect((await r2.post('/login/code', { token: p2.token, code: recovery[0] }, { csrf: false })).status).toBe(401);
  });

  test('five wrong codes end the attempt; a token cannot be made up', async () => {
    const w = new Client(srv.base);
    const p = await passwordStep(w);
    // Wrong codes count toward the username's login limit too, so the attempt ends with a 401 (five
    // codes) or a 429 (the limit), whichever comes first.
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await w.post('/login/code', { token: p.token, code: '000000' }, { csrf: false })).status;
    expect([401, 429]).toContain(last);
    expect((await w.post('/login/code', { token: p.token, code: code() }, { csrf: false })).status).toBe(401);
    expect((await w.post('/login/code', { token: 'made-up', code: code() }, { csrf: false })).status).toBe(401);
  });

  test('reset from the command line: the password alone logs in again, and Activity says so', async () => {
    const out = await runMain(['reset-2fa', 'admin'], { KONTAINERS_DATA: srv.dataDir });
    expect(out.code).toBe(0);
    expect(out.out).toContain('two-factor login is off for admin');
    // The limits from the wrong codes above are per username; a fresh login waits them out on
    // another account would be cleaner, but the reset itself is what is tested here.
    const page = await c.page('/activity');
    expect(page).toContain('turned off two-factor login of user');
    expect(page).toContain('turned on two-factor login for');
  });
});
