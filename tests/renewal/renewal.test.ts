// Certificate renewal. scripts/test.sh renewal starts Pebble with short-lived certificates and
// kontainers with a short renewal check interval. Caddy must renew the certificate on its own,
// before the old one expires, and HTTPS must keep answering with a verifying certificate throughout.

import { describe, expect, test } from 'bun:test';
import { Client, PW } from '../api/helpers';
import { https, peerCert, until, type PeerCert } from '../proxy/pebble';

const URL_ = process.env.KONTAINERS_TEST_URL || '';
const TOKEN = process.env.KONTAINERS_TEST_SETUP_TOKEN || '';
const VALIDITY_MS = Number(process.env.KONTAINERS_TEST_CERT_VALIDITY || 90) * 1000;
const HOST = 'renew.test';
const RENEWALS = 2;

const log = (...a: unknown[]) => console.log('[renewal]', ...a);
const secs = (ms: number) => (ms / 1000).toFixed(1) + 's';

describe.skipIf(!URL_)('certificate renewal', () => {
  const c = new Client(URL_);
  const t0 = Date.now();

  test('setup and a target container', async () => {
    expect((await c.post('/setup', { token: TOKEN, username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
    await c.page('/proxy');
    expect((await c.submit('/images/pull', { ref: 'busybox:1.36' })).error).toBe('');
    const r = await c.submit('/containers', {
      image: 'busybox:1.36', name: 'web', start: 'on',
      cmd: 'sh -c mkdir${IFS}/w&&echo${IFS}hello-renew>/w/index.html&&exec${IFS}httpd${IFS}-f${IFS}-p${IFS}8000${IFS}-h${IFS}/w',
    });
    expect(r.error).toBe('');
  });

  test('an HTTPS rule gets a short-lived certificate', async () => {
    const r = await c.submit('/proxy', { hostname: HOST, path: '/', targetContainer: 'web', targetPort: '8000', tls: 'on' });
    expect(r.error).toBe('');
    await until('a certificate for renew.test', async () => ((await https(HOST)).status === 200 ? true : null), 120000);
    const first = await peerCert(HOST);
    log(`first certificate: serial ${first.serial}, lifetime ${secs(first.to - first.from)}, ${secs(first.to - Date.now())} left, issuer ${first.issuerCN}`);
    expect(first.issuerCN).toMatch(/Pebble/i);
    expect(first.san).toContain(`DNS:${HOST}`);
    // Pebble's lifetime setting took effect (a few seconds of slack for its clock and rounding).
    expect(first.to - first.from).toBeLessThanOrEqual(VALIDITY_MS + 5000);
  }, 180000);

  test('Caddy renews before expiry, and every request in between succeeds', async () => {
    const seen: PeerCert[] = [await peerCert(HOST)];
    const seenAt: number[] = [Date.now()];
    let probes = 0;
    const end = Date.now() + 4 * 60_000;
    while (seen.length <= RENEWALS && Date.now() < end) {
      const res = await https(HOST);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('hello-renew');
      probes++;
      const now = await peerCert(HOST); // throws if the certificate has expired or does not verify
      const last = seen[seen.length - 1];
      if (now.serial !== last.serial) {
        log(`renewed: serial ${now.serial}, ${secs(last.to - Date.now())} before the old certificate expired, ${Date.now() - seenAt[seenAt.length - 1]} ms after the previous change`);
        expect(Date.now()).toBeLessThan(last.to);
        expect(now.from).toBeGreaterThanOrEqual(last.from);
        expect(now.issuerCN).toMatch(/Pebble/i);
        seen.push(now);
        seenAt.push(Date.now());
      }
      await Bun.sleep(1000);
    }
    log(`${probes} requests, ${seen.length - 1} renewals in ${secs(Date.now() - t0)} since start`);
    expect(seen.length - 1).toBeGreaterThanOrEqual(RENEWALS);
    expect(new Set(seen.map(s => s.serial)).size).toBe(seen.length);
  }, 300000);
});
