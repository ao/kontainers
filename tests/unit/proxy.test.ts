import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../../src/db';
import { loadConfig } from '../../src/config';
import { RuleStore, buildCaddyConfig, type Rule } from '../../src/proxy';

const cfg = loadConfig({ KONTAINERS_PROXY: '1', KONTAINERS_DATA: '/data' });

function store() {
  const db = new Database(':memory:', { strict: true });
  migrate(db);
  return new RuleStore(db);
}

const rule = (over: Partial<Rule>): Rule => ({ id: 1, hostname: 'a.example.com', path: '/', target_container: 'web', target_port: 80, tls: true, enabled: true, created_at: 0, ...over });

describe('RuleStore', () => {
  test('create, update, toggle, remove', () => {
    const s = store();
    const r = s.create({ hostname: 'App.Example.com', targetContainer: '/web', targetPort: '8080' });
    expect(r).toMatchObject({ hostname: 'app.example.com', path: '/', target_container: 'web', target_port: 8080, tls: true, enabled: true });
    expect(s.update(r.id, { hostname: 'app.example.com', path: '/api', targetContainer: 'api', targetPort: 3000, tls: false })).toMatchObject({ path: '/api', tls: false });
    expect(s.setEnabled(r.id, false).enabled).toBe(false);
    s.remove(r.id);
    expect(s.list()).toEqual([]);
    expect(() => s.remove(r.id)).toThrow('not found');
  });
  test('a wildcard hostname is allowed over plain HTTP but refused with HTTPS', () => {
    const s = store();
    expect(() => s.create({ hostname: '*.example.com', targetContainer: 'web', targetPort: 80 })).toThrow('DNS challenge');
    expect(() => s.create({ hostname: '*.example.com', targetContainer: 'web', targetPort: 80, tls: true })).toThrow('DNS challenge');
    expect(s.create({ hostname: '*.example.com', targetContainer: 'web', targetPort: 80, tls: false }).hostname).toBe('*.example.com');
    const id = s.list()[0].id;
    expect(() => s.update(id, { hostname: '*.example.com', targetContainer: 'web', targetPort: 80, tls: true })).toThrow('DNS challenge');
  });
  test('hostname + path is unique', () => {
    const s = store();
    s.create({ hostname: 'a.example.com', targetContainer: 'web', targetPort: 80 });
    expect(() => s.create({ hostname: 'A.example.com', targetContainer: 'other', targetPort: 81 })).toThrow('already exists');
    expect(s.create({ hostname: 'a.example.com', path: '/x', targetContainer: 'other', targetPort: 81 }).path).toBe('/x');
  });
  test.each([
    [{ hostname: 'a.com\n}', targetContainer: 'web', targetPort: 80 }],
    [{ hostname: 'a.com', targetContainer: 'web;rm', targetPort: 80 }],
    [{ hostname: 'a.com', targetContainer: 'web', targetPort: 0 }],
    [{ hostname: 'a.com', path: '/../etc', targetContainer: 'web', targetPort: 80 }],
    [{ hostname: 'a.com', targetContainer: 'web:80', targetPort: 80 }],
  ])('rejects bad input %#', input => {
    expect(() => store().create(input as any)).toThrow();
  });
});

describe('buildCaddyConfig', () => {
  test('no rules: only an HTTP server answering 404, no TLS app', () => {
    const c = buildCaddyConfig([], cfg, '/data/run/caddy-admin.sock') as any;
    expect(c.admin.listen).toBe('unix//data/run/caddy-admin.sock');
    expect(Object.keys(c.apps.http.servers)).toEqual(['http']);
    expect(c.apps.http.servers.http.routes.at(-1).handle[0].status_code).toBe(404);
    expect(c.apps.tls).toBeUndefined();
  });

  test('a TLS rule gets an ACME policy and an HTTPS route', () => {
    const c = buildCaddyConfig([rule({})], cfg, '/s') as any;
    const route = c.apps.http.servers.https.routes[0];
    expect(route.match).toEqual([{ host: ['a.example.com'], path: ['/*'] }]);
    expect(route.handle[0]).toEqual({ handler: 'reverse_proxy', upstreams: [{ dial: 'web:80' }] });
    expect(c.apps.tls.automation.policies[0].subjects).toEqual(['a.example.com']);
    expect(c.apps.tls.automation.policies[0].issuers[0].module).toBe('acme');
    expect(c.apps.http.servers.http.routes.length).toBe(1); // only the 404; Caddy adds the HTTP->HTTPS redirect itself
  });

  test('a plain HTTP rule stays on port 80 with no certificate', () => {
    const c = buildCaddyConfig([rule({ tls: false })], cfg, '/s') as any;
    expect(c.apps.http.servers.https).toBeUndefined();
    expect(c.apps.tls).toBeUndefined();
    expect(c.apps.http.servers.http.routes[0].match[0].host).toEqual(['a.example.com']);
  });

  test('disabled rules are left out', () => {
    const c = buildCaddyConfig([rule({ enabled: false })], cfg, '/s') as any;
    expect(c.apps.http.servers.https).toBeUndefined();
  });

  test('longer path prefixes are matched first', () => {
    const c = buildCaddyConfig([rule({ id: 1, path: '/' }), rule({ id: 2, path: '/api', target_container: 'api' })], cfg, '/s') as any;
    const routes = c.apps.http.servers.https.routes;
    expect(routes[0].match[0].path).toEqual(['/api', '/api/*']);
    expect(routes[1].match[0].path).toEqual(['/*']);
  });

  test('ACME directory, email and trusted root come from config', () => {
    const c2 = loadConfig({ KONTAINERS_PROXY: '1', KONTAINERS_ACME_CA: 'https://pebble:14000/dir', KONTAINERS_ACME_EMAIL: 'ops@kontainers-ci.dev', KONTAINERS_ACME_CA_ROOT: '/pebble.pem' });
    const issuer = (buildCaddyConfig([rule({})], c2, '/s') as any).apps.tls.automation.policies[0].issuers[0];
    expect(issuer).toEqual({ module: 'acme', ca: 'https://pebble:14000/dir', email: 'ops@kontainers-ci.dev', trusted_roots_pem_files: ['/pebble.pem'] });
  });

  test('the renewal check interval is optional and passed to Caddy in seconds', () => {
    const none = (buildCaddyConfig([rule({})], cfg, '/s') as any).apps.tls.automation;
    expect(none.renew_interval).toBeUndefined();
    const c3 = loadConfig({ KONTAINERS_PROXY: '1', KONTAINERS_ACME_RENEW_CHECK: '10' });
    expect((buildCaddyConfig([rule({})], c3, '/s') as any).apps.tls.automation.renew_interval).toBe('10s');
  });

  test('the renewal check interval must be a whole number of seconds from 1 to 86400', () => {
    for (const bad of ['0', '-5', '1.5', '10s', 'soon', '86401']) {
      expect(() => loadConfig({ KONTAINERS_ACME_RENEW_CHECK: bad })).toThrow('KONTAINERS_ACME_RENEW_CHECK');
    }
    expect(loadConfig({ KONTAINERS_ACME_RENEW_CHECK: '86400' }).proxy.acmeRenewCheck).toBe(86400);
    expect(loadConfig({}).proxy.acmeRenewCheck).toBeNull();
  });

  test('every hostname in the output passed validation', () => {
    const s = store();
    s.create({ hostname: 'ok.example.com', targetContainer: 'web', targetPort: 80 });
    const json = JSON.stringify(buildCaddyConfig(s.list(), cfg, '/s'));
    expect(json).not.toMatch(/[{}]\s*"?[^"]*\n/);
    expect(json).toContain('"ok.example.com"');
  });
});
