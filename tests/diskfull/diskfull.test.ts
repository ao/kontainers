// The image with its data volume on a 1 MB tmpfs (scripts/test.sh image starts it). The volume is
// filled through the app itself; then actions must still report their real outcome, pages must
// still load for a logged-in user, and a new login must say what is wrong.

import { describe, expect, test } from 'bun:test';
import { Client, PW } from '../api/helpers';

const URL_ = process.env.KONTAINERS_TEST_URL || '';
const TOKEN = process.env.KONTAINERS_TEST_SETUP_TOKEN || '';

describe.skipIf(!URL_)('a full data volume', () => {
  const c = new Client(URL_);
  // A long name, so the stop's activity entry is larger than the last ones that did not fit.
  const T = 'full-target-' + 'x'.repeat(90);

  test('setup, and a container to act on', async () => {
    expect((await c.post('/setup', { token: TOKEN, username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
    await c.page('/images');
    expect((await c.submit('/images/pull', { ref: 'busybox:1.36' })).error).toBe('');
    expect((await c.submit('/containers', { image: 'busybox:1.36', name: T, pull: '', cmd: 'sleep 600', start: 'on' })).error).toBe('');
  });

  test('fill the volume with activity-log entries until a write fails', async () => {
    // Each refused create writes one entry with a 200-character target.
    let full = false;
    for (let i = 0; i < 20000 && !full; i++) {
      const r = await c.submit('/containers', { image: '--x', name: 'n'.repeat(250) + i });
      full = r.error.includes('data volume is full') || r.flash.includes('could not be recorded');
      if (!full && i % 200 === 199) {
        // The flash itself may be the action's error; check the activity page writes still work.
        const res = await c.post('/settings/notify', { kind: 'webhook', url: 'not a url', ev_update: 'on' });
        expect([303, 507]).toContain(res.status);
      }
    }
    expect(full).toBe(true);
    // Then small entries, until one of those does not fit either: whether a write fits depends on
    // the room left in the database's last page and log, so the large ones alone leave it to chance.
    let small = false;
    for (let i = 0; i < 5000 && !small; i++) {
      const r = await c.submit('/containers', { image: '--x', name: 'a' });
      small = r.error.includes('data volume is full') || r.flash.includes('could not be recorded') || r.error.includes('could not be recorded');
    }
    expect(small).toBe(true);
  }, 170000);

  test('a stop that works says so, and that it could not be recorded', async () => {
    const r = await c.submit(`/containers/${T}/stop`, {});
    expect(r.error).toBe('');
    expect(r.flash).toBe('Done. (It could not be recorded in the activity log: the data volume is full or read-only.)');
    expect(await c.page(`/containers/${T}`)).toMatch(/<span class="state exited">exited<\/span>/);
  });

  test('pages still load for a logged-in user', async () => {
    for (const p of ['/containers', '/images', '/settings', '/activity']) expect((await c.get(p)).status).toBe(200);
  });

  test('a new login is refused with the reason, not a 500', async () => {
    const other = new Client(URL_);
    const res = await other.post('/login', { username: 'admin', password: PW }, { csrf: false });
    expect(res.status).toBe(507);
    expect(await res.text()).toContain('the data volume is full or read-only');
  });
});
