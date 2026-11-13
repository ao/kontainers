// Proxy rules and certificates end to end: kontainers (with Caddy), a target container, Pebble
// (a test ACME server doing real HTTP-01 / TLS-ALPN validation) and a DNS server that points every
// name at kontainers, all inside a throwaway dind. scripts/test.sh proxy sets the variables.

import { describe, expect, test } from 'bun:test';
import { connect } from 'node:tls';
import { request as httpsRequest } from 'node:https';
import { Client, PW } from '../api/helpers';

const URL_ = process.env.KONTAINERS_TEST_URL || '';
const TOKEN = process.env.KONTAINERS_TEST_SETUP_TOKEN || '';
const PEBBLE_MGMT = process.env.KONTAINERS_TEST_PEBBLE_MGMT || '';
const HTTP = 5002, HTTPS = 5001;

// Pebble's API and management endpoints use a fixed test certificate signed by its "minica" CA.
const MINICA = process.env.KONTAINERS_TEST_PEBBLE_CA ? await Bun.file(process.env.KONTAINERS_TEST_PEBBLE_CA).text() : '';

// The roots Pebble generated at startup sign the certificates it issues.
// Returned as one PEM per array entry: Bun reads only the first certificate of a concatenated string.
let roots: string[] = [];
async function pebbleRoots(): Promise<string[]> {
  if (roots.length) return roots;
  const opt = { tls: { ca: MINICA } } as RequestInit;
  const pem = (await (await fetch(`${PEBBLE_MGMT}/roots/0`, opt)).text()) + '\n' + (await (await fetch(`${PEBBLE_MGMT}/intermediates/0`, opt)).text());
  roots = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  return roots;
}

// node:https rather than fetch: Bun 1.3.1's fetch rejects a chain that ends in a server-sent
// intermediate even when the root is in tls.ca; node:tls verifies the same chain correctly.
async function https(host: string, path = '/'): Promise<{ status: number; text: () => Promise<string> }> {
  const ca = await pebbleRoots();
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ host, port: HTTPS, path, servername: host, ca, timeout: 5000 }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: async () => body }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function peerIssuer(host: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const s = connect({ host, port: HTTPS, servername: host, ca: await pebbleRoots() }, () => {
      const c = s.getPeerCertificate();
      s.end();
      resolve(`${c.issuer.CN} / ${c.subjectaltname}`);
    });
    s.on('error', reject);
  });
}

async function until<T>(what: string, fn: () => Promise<T | null>, timeoutMs = 90000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    try { const v = await fn(); if (v !== null) return v; } catch (e) { last = e; }
    await Bun.sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}: ${last}`);
}

async function dockerSock(method: string, path: string): Promise<Response> {
  return fetch(`http://docker/v1.41${path}`, { method, unix: '/var/run/docker.sock' } as RequestInit);
}

describe.skipIf(!URL_)('proxy with ACME', () => {
  const c = new Client(URL_);

  test('setup and a target container', async () => {
    expect((await c.post('/setup', { token: TOKEN, username: 'admin', password: PW }, { csrf: false })).status).toBe(303);
    await c.page('/proxy');
    expect((await c.submit('/images/pull', { ref: 'busybox:1.36' })).error).toBe('');
    const r = await c.submit('/containers', {
      image: 'busybox:1.36', name: 'web', start: 'on',
      cmd: 'sh -c mkdir${IFS}/w&&echo${IFS}hello-proxy>/w/index.html&&exec${IFS}httpd${IFS}-f${IFS}-p${IFS}8000${IFS}-h${IFS}/w',
    });
    expect(r.error).toBe('');
  });

  test('the proxy is running and answers 404 for unknown hosts', async () => {
    expect(await c.page('/proxy')).toContain('Proxy: running');
    const r = await fetch(`http://nothing.test:${HTTP}/`);
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('no proxy rule');
  });

  test('rules with injection attempts are refused', async () => {
    for (const hostname of ['evil.test\n}', 'evil.test; reverse_proxy x', 'evil.test{', '*']) {
      const r = await c.submit('/proxy', { hostname, path: '/', targetContainer: 'web', targetPort: '8000', tls: 'on' });
      expect(r.error).toMatch(/invalid hostname/);
    }
    expect((await c.submit('/proxy', { hostname: 'ok.test', path: '/../x', targetContainer: 'web', targetPort: '8000' })).error).toContain('invalid path');
    expect((await c.submit('/proxy', { hostname: 'ok.test', path: '/', targetContainer: 'web:8000', targetPort: '8000' })).error).toContain('invalid target');
  });

  test('an HTTPS rule gets a certificate from the ACME server and serves the container', async () => {
    const r = await c.submit('/proxy', { hostname: 'app.test', path: '/', targetContainer: 'web', targetPort: '8000', tls: 'on' });
    expect(r.error).toBe('');
    expect(r.flash).toContain('Added app.test');
    const body = await until('a certificate for app.test', async () => {
      const res = await https('app.test');
      return res.status === 200 ? res.text() : null;
    });
    expect(body).toContain('hello-proxy');
    const issuer = await peerIssuer('app.test');
    expect(issuer).toMatch(/Pebble/i);
    expect(issuer).toContain('DNS:app.test');
  }, 120000);

  test('plain HTTP on the same host redirects to HTTPS', async () => {
    const r = await fetch(`http://app.test:${HTTP}/x`, { redirect: 'manual' });
    expect([301, 302, 307, 308]).toContain(r.status);
    // Caddy redirects to the default HTTPS port; on a real host that is 443, which is what is published.
    expect(r.headers.get('location')).toMatch(/^https:\/\/app\.test(:\d+)?\/x$/);
  });

  test('a plain HTTP rule is served without a certificate', async () => {
    expect((await c.submit('/proxy', { hostname: 'plain.test', path: '/', targetContainer: 'web', targetPort: '8000' })).error).toBe('');
    const r = await until('plain.test', async () => { const x = await fetch(`http://plain.test:${HTTP}/`); return x.status === 200 ? x : null; }, 15000);
    expect(await r.text()).toContain('hello-proxy');
  });

  test('a disabled rule stops serving; enabling restores it', async () => {
    const page = await c.page('/proxy');
    const id = new RegExp(String.raw`https://app\.test[\s\S]*?/proxy/(\d+)/toggle`).exec(page)![1];
    expect((await c.submit(`/proxy/${id}/toggle`, {})).error).toBe('');
    await until('app.test to stop', async () => { try { const r = await https('app.test'); return r.status === 200 ? null : true; } catch { return true; } }, 15000);
    expect((await c.submit(`/proxy/${id}/toggle`, {})).error).toBe('');
    await until('app.test to come back', async () => ((await https('app.test')).status === 200 ? true : null), 30000);
  }, 60000);

  test('a rule for a container that does not exist is refused and not saved', async () => {
    const r = await c.submit('/proxy', { hostname: 'ghost.test', path: '/', targetContainer: 'ghost', targetPort: '80' });
    expect(r.error.toLowerCase()).toContain('no such container');
    expect(r.body).not.toContain('ghost.test');
  });

  test('rules and certificates survive a restart of kontainers', async () => {
    expect((await dockerSock('POST', '/containers/kontainers/restart?t=10')).status).toBe(204);
    await until('kontainers to come back', async () => ((await fetch(URL_ + '/healthz')).ok ? true : null), 30000);
    const body = await until('app.test after restart', async () => { const r = await https('app.test'); return r.status === 200 ? r.text() : null; }, 30000);
    expect(body).toContain('hello-proxy');
    expect(await c.page('/proxy')).toContain('app.test'); // the session survived too
  }, 90000);
});
