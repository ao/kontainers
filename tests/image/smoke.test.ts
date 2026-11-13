// Runs against the built image, started the way compose.yaml starts it: Docker API through
// tecnativa/docker-socket-proxy. scripts/test.sh image sets the variables.

import { describe, expect, test } from 'bun:test';
import { Client, PW } from '../api/helpers';

const URL_ = process.env.KONTAINERS_TEST_URL || '';
const TOKEN = process.env.KONTAINERS_TEST_SETUP_TOKEN || '';
const PROXY = process.env.KONTAINERS_TEST_SOCKET_PROXY || '';

describe.skipIf(!URL_)('image', () => {
  const c = new Client(URL_);

  test('healthy and ready through the socket proxy', async () => {
    expect((await fetch(URL_ + '/healthz')).status).toBe(200);
    expect((await fetch(URL_ + '/readyz')).status).toBe(200);
  });

  test('first-run setup with the token from the container log', async () => {
    expect(TOKEN).not.toBe('');
    expect((await c.get('/containers')).headers.get('location')).toBe('/setup');
    const r = await c.post('/setup', { token: TOKEN, username: 'admin', password: PW }, { csrf: false });
    expect(r.status).toBe(303);
    await c.page('/containers');
  });

  test('pull, create, start, logs, remove through the proxy', async () => {
    expect((await c.submit('/images/pull', { ref: 'busybox:1.36' })).error).toBe('');
    const r = await c.submit('/containers', { image: 'busybox:1.36', name: 'smoke', cmd: 'sh -c echo${IFS}smoke-ok;sleep${IFS}300', start: 'on' });
    expect(r.error).toBe('');
    let logs = '';
    for (let i = 0; i < 20 && !logs.includes('smoke-ok'); i++) { logs = await (await c.get('/api/containers/smoke/logs')).text(); await Bun.sleep(200); }
    expect(logs).toContain('smoke-ok');
    expect((await c.submit('/containers/smoke/stop', {})).error).toBe('');
    expect((await c.submit('/containers/smoke/remove', {})).error).toBe('');
  });

  test('the socket proxy refuses endpoints kontainers does not use', async () => {
    expect(PROXY).not.toBe('');
    const base = PROXY.replace(/^tcp:/, 'http:');
    expect((await fetch(`${base}/v1.41/containers/json`)).status).toBe(200);
    for (const [method, path] of [['POST', '/v1.41/exec/0123456789ab/start'], ['GET', '/v1.41/info'], ['POST', '/v1.41/build'], ['GET', '/v1.41/secrets'], ['GET', '/v1.41/swarm']]) {
      expect((await fetch(base + path, { method })).status).toBe(403);
    }
  });
});
