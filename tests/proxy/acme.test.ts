// Proxy rules and certificates end to end: kontainers (with Caddy), a target container, Pebble
// (a test ACME server doing real HTTP-01 / TLS-ALPN validation) and a DNS server that points every
// name at kontainers, all inside a throwaway dind. scripts/test.sh proxy sets the variables.

import { describe, expect, test } from 'bun:test';
import { Client, PW } from '../api/helpers';
import { HTTP, peerCert, https, until } from './pebble';

const URL_ = process.env.KONTAINERS_TEST_URL || '';
const TOKEN = process.env.KONTAINERS_TEST_SETUP_TOKEN || '';

async function peerIssuer(host: string): Promise<string> {
  const c = await peerCert(host);
  return `${c.issuerCN} / ${c.san}`;
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

  test('kontainers recognises its own container from its hostname and will not stop it', async () => {
    // Here kontainers runs inside the daemon it manages, as on a real host.
    expect(await c.page('/containers')).toMatch(/data-name="kontainers"[\s\S]*?this is kontainers/);
    expect((await c.submit('/containers/kontainers/stop', {})).error).toContain('kontainers itself');
    expect((await fetch(URL_ + '/healthz')).status).toBe(200);
  });

  test('the proxy is running and answers 404 for unknown hosts', async () => {
    expect(await c.page('/proxy')).toContain('Proxy running');
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

  test('a rule can be edited in place', async () => {
    const id = /http:\/\/plain\.test[\s\S]*?\/proxy\/(\d+)\/edit/.exec(await c.page('/proxy'))![1];
    const form = await c.page(`/proxy/${id}/edit`);
    expect(form).toContain('value="plain.test"');
    expect(form).toContain('value="8000"');
    const edit = (over: Record<string, string>) => c.submit(`/proxy/${id}/edit`, { hostname: 'plain.test', path: '/', targetContainer: 'web', targetPort: '8000', ...over });

    expect((await edit({ targetPort: '8001' })).flash).toContain('Saved plain.test');
    await until('plain.test to fail on the wrong port', async () => ((await fetch(`http://plain.test:${HTTP}/`)).status === 502 ? true : null), 15000);
    expect((await edit({ hostname: 'bad host' })).error).toContain('invalid hostname');
    expect(await c.page(`/proxy/${id}/edit`)).toContain('value="8001"'); // the refused edit changed nothing
    expect((await edit({})).flash).toContain('Saved');
    await until('plain.test to work again', async () => ((await fetch(`http://plain.test:${HTTP}/`)).status === 200 ? true : null), 15000);
  }, 60000);

  test('the Proxy page shows the certificate expiry', async () => {
    const page = await c.page('/proxy');
    expect(page).toMatch(/certificate valid until \d{4}-\d{2}-\d{2}/);
  });

  test('a target recreated under the same name (as docker compose up does) is reconnected', async () => {
    expect((await dockerSock('DELETE', '/containers/web?force=1')).status).toBe(204);
    await until('the page to report the missing target', async () => ((await c.page('/proxy')).includes('no container named web') ? true : null), 20000);
    const r = await c.submit('/containers', {
      image: 'busybox:1.36', name: 'web', start: 'on',
      cmd: 'sh -c "mkdir /w && echo hello-again > /w/index.html && exec httpd -f -p 8000 -h /w"',
    });
    expect(r.error).toBe('');
    // Nothing re-adds the rule: the reconcile loop puts the new container on the proxy network.
    const body = await until('plain.test to route to the new container', async () => {
      const x = await fetch(`http://plain.test:${HTTP}/`);
      return x.status === 200 ? x.text() : null;
    }, 30000);
    expect(body).toContain('hello-again');
    expect(await c.page('/proxy')).not.toContain('no container named web');
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
    expect(body).toMatch(/hello-(proxy|again)/);
    expect(await c.page('/proxy')).toContain('app.test'); // the session survived too
  }, 90000);
});
