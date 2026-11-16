// Registry logins against a real registry that requires one: registry:2 with htpasswd, inside the
// test daemon on 127.0.0.1:5001. Set KONTAINERS_TEST_DOCKER_HOST=tcp://dind:2375 to run.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client, DOCKER, readyServer, type Running } from './helpers';

const run = Math.random().toString(36).slice(2, 8);
const REG = `k-preg-${run}`;
const HOST = 'localhost:5001';
const REF = `${HOST}/private/app${run}:1`;
const USER = 'puller', PASS = `pw-${run}-Secret`;
const NAME = `preg-app-${run}`;

const api = (path: string, init: RequestInit = {}) => fetch(`${DOCKER.replace(/^tcp:\/\//, 'http://')}/v1.41${path}`, init);
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => api(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const authHeader = (password: string) => Buffer.from(JSON.stringify({ username: USER, password, serveraddress: HOST })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
async function stream(path: string, headers: Record<string, string> = {}) {
  const res = await api(path, { method: 'POST', headers });
  const body = await res.text();
  if (res.status !== 200 || /"error"/.test(body)) throw new Error(`${path}: ${res.status} ${body.slice(-300)}`);
}

describe.skipIf(!DOCKER)('registry logins', () => {
  let srv: Running, c: Client;

  beforeAll(async () => {
    await stream('/images/create?fromImage=registry&tag=2');
    await stream('/images/create?fromImage=busybox&tag=1.36');
    const hash = (await Bun.password.hash(PASS, { algorithm: 'bcrypt', cost: 5 })).replace(/^\$2b\$/, '$2y$');
    expect((await post(`/containers/create?name=${REG}`, {
      Image: 'registry:2',
      Entrypoint: ['sh', '-c', 'mkdir -p /auth && printf "%s\\n" "$HT" > /auth/htpasswd && exec /entrypoint.sh /etc/docker/registry/config.yml'],
      Env: [`HT=${USER}:${hash}`, 'REGISTRY_AUTH=htpasswd', 'REGISTRY_AUTH_HTPASSWD_REALM=test', 'REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd'],
      HostConfig: { PortBindings: { '5000/tcp': [{ HostIp: '127.0.0.1', HostPort: '5001' }] } },
    })).status).toBe(201);
    expect((await post(`/containers/${REG}/start`)).status).toBe(204);
    expect((await api(`/images/busybox:1.36/tag?repo=${encodeURIComponent(REF.split(':1')[0])}&tag=1`, { method: 'POST' })).status).toBe(201);
    for (let i = 0; ; i++) {
      try { await stream(`/images/${encodeURIComponent(REF.split(':1')[0])}/push?tag=1`, { 'X-Registry-Auth': authHeader(PASS) }); break; } catch (e) { if (i > 20) throw e; await Bun.sleep(500); }
    }
    // Gone from the host, so a pull has to go to the registry.
    await api(`/images/${encodeURIComponent(REF)}`, { method: 'DELETE' });
    ({ srv, c } = await readyServer({ KONTAINERS_UPDATE_CHECK_HOURS: '0' }));
  }, 120000);
  afterAll(async () => {
    for (const n of [NAME, REG]) await api(`/containers/${n}?force=1&v=1`, { method: 'DELETE' });
    await api(`/images/${encodeURIComponent(REF)}?force=1`, { method: 'DELETE' });
    await srv?.stop();
  });

  test('without a login a pull of the private image fails, and says what to do', async () => {
    const r = await c.submit('/containers', { image: REF, name: NAME, pull: 'on', cmd: 'sleep 600', start: 'on' });
    expect(r.error).toContain(`add a login for ${HOST} on the Settings page`);
  }, 60000);

  test('a wrong password is saved but reported as refused', async () => {
    await c.page('/settings');
    const r = await c.submit('/settings/registries', { registry: HOST, username: USER, password: 'wrong' });
    expect(r.flash).toContain(`Saved the login for ${HOST}, but the registry refused it`);
    const pull = await c.submit('/containers', { image: REF, name: NAME, pull: 'on', cmd: 'sleep 600', start: 'on' });
    expect(pull.error).toContain(`the registry refused the login saved for ${HOST}`);
  }, 60000);

  test('with the right login: pull, run, and the update check can read the registry', async () => {
    await c.page('/settings');
    const r = await c.submit('/settings/registries', { registry: HOST, username: USER, password: PASS });
    expect(r.flash).toBe(`Saved the login for ${HOST}; the registry accepted it.`);
    expect(r.body).toContain(`<span class="ref">${HOST}</span></td><td>${USER}</td>`);
    expect(r.body).not.toContain(PASS);
    const made = await c.submit('/containers', { image: REF, name: NAME, pull: 'on', cmd: 'sleep 600', start: 'on' });
    expect(made.error).toBe('');
    expect(made.flash).toContain(`Created ${NAME}`);
    const checked = await c.submit('/updates/check', {});
    expect(checked.flash).toContain('every container runs the newest image');
    const page = await c.page(`/containers/${NAME}`);
    expect(page).toContain('the newest image for this tag');
    expect((await c.page('/settings'))).toContain(`pulled ${REF}`);
  }, 120000);

  test('the database holds the password only encrypted; the key file is private and not in the backup', async () => {
    const files = readdirSync(srv.dataDir);
    expect(files).toContain('registry.key');
    for (const f of files.filter(f => f.startsWith('kontainers.db'))) expect(readFileSync(join(srv.dataDir, f)).includes(PASS)).toBe(false);
    const backup = Buffer.from(await (await c.get('/api/backup')).arrayBuffer());
    expect(backup.length).toBeGreaterThan(1000);
    expect(backup.includes(PASS)).toBe(false);
  });

  test('removing the login', async () => {
    const settings = await c.page('/settings');
    const id = /action="\/settings\/registries\/(\d+)\/remove"/.exec(settings)![1];
    const r = await c.submit(`/settings/registries/${id}/remove`, {});
    expect(r.flash).toBe(`Removed the login for ${HOST}.`);
    expect(await c.page('/activity?q=registry')).toContain('saved the registry login for');
  });
});
