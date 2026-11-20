import { describe, expect, test } from 'bun:test';
import { composeFile, projectName } from '../../src/compose';

describe('a compose file for a container made in kontainers', () => {
  test('values come back exactly, with $ doubled for compose', () => {
    const env = ['A=$HOME and ${X}', 'B="q" \'s\' #x: y', 'C=- [a] {b} &c *d !e |f >g', 'D=\u2028\u0085é', 'E='];
    const cmd = ['sh', '-c', "echo 'a\nb' $1"];
    const yaml = composeFile({
      name: 'web', image: 'me/app:1.2', cmd, env, restart: 'no',
      ports: [{ host: 8080, container: 80, hostIp: '127.0.0.1' }, { host: 53, container: 53, hostIp: '::1', protocol: 'udp' }],
      volumes: [{ source: 'data', target: '/data' }, { source: '/srv/x', target: '/x', readOnly: true }],
      labels: { 'app.role': 'web: front', 'kontainers.autoupdate': 'true', 'odd': '\u0080\ufffe' }, memory: 512 * 1024 ** 2, nanoCpus: 1.5e9, pids: 100,
    }, { mode: 'bridge' }, ['data']);
    expect(yaml).not.toMatch(/[\u0080-\u009f\u2028\u2029\ufffe]/);
    expect(yaml).toContain('# an anonymous volume Docker made for /data');
    const doc = Bun.YAML.parse(yaml) as any;
    const s = doc.services.web;
    expect(s.environment).toEqual(env.map(e => e.replace(/\$/g, '$$$$')));
    expect(s.command).toEqual(['sh', '-c', "echo 'a\nb' $$1"]);
    expect(s).toMatchObject({ image: 'me/app:1.2', container_name: 'web', restart: 'no', mem_limit: 536870912, cpus: 1.5, pids_limit: 100, network_mode: 'bridge' });
    expect(s.ports).toEqual(['127.0.0.1:8080:80', '[::1]:53:53/udp']);
    expect(s.volumes).toEqual(['data:/data', '/srv/x:/x:ro']);
    expect(s.labels).toEqual({ 'app.role': 'web: front', 'kontainers.autoupdate': 'true', 'odd': '\u0080\ufffe' });
    expect(doc.name).toBe('web');
    expect(doc.volumes).toEqual({ data: { external: true } });
    expect(doc.networks).toBeUndefined();
  });
  test('a user network, external, with the aliases', () => {
    const doc = Bun.YAML.parse(composeFile({ name: 'My.DB', image: 'postgres:17', restart: 'unless-stopped' }, { networks: [{ name: 'backend', aliases: ['pg'], ipv4: '172.30.0.9' }, { name: 'other' }] })) as any;
    expect(doc.name).toBe(projectName('My.DB'));
    expect(new Set(['k.a', 'k-a', 'K-A'].map(projectName)).size).toBe(3);
    expect(projectName('k-a')).toBe('k-a');
    expect(projectName('K.A')).toMatch(/^k-a-[0-9a-f]{6}$/);
    const db = doc.services['My.DB'];
    expect(db.networks).toEqual({ backend: { aliases: ['pg'], ipv4_address: '172.30.0.9' }, other: {} });
    expect(db.network_mode).toBeUndefined();
    expect(doc.networks).toEqual({ backend: { external: true }, other: { external: true } });
    expect(doc.volumes).toBeUndefined();
    expect((Bun.YAML.parse(composeFile({ name: 'x', image: 'a' }, { mode: 'none' })) as any).services.x.network_mode).toBe('none');
  });
  test('keys are not interpolated by compose, so their $ is not doubled', () => {
    const doc = Bun.YAML.parse(composeFile({ name: 'x', image: 'a', labels: { 'a$b': 'c$d' } })) as any;
    expect(doc.services.x.labels).toEqual({ 'a$b': 'c$$d' });
  });
  test('one network with aliases', () => {
    const doc = Bun.YAML.parse(composeFile({ name: 'db', image: 'postgres:17', restart: 'unless-stopped' }, { networks: [{ name: 'backend', aliases: ['pg'] }] })) as any;
    expect(doc.services.db.networks).toEqual({ backend: { aliases: ['pg'] } });
    expect(doc.services.db.network_mode).toBeUndefined();
    expect(doc.networks).toEqual({ backend: { external: true } });
    expect(doc.volumes).toBeUndefined();
  });
});

describe('the compose file page', () => {
  const ctx = { user: 'admin', csrf: 'c' };
  test('notes: a stopped container, a CPU limit compose cannot hold, anonymous volumes, a moved tag', async () => {
    const { composePage } = await import('../../src/views');
    const c = { Id: 'a'.repeat(64), Name: '/web', Config: { Image: 'app:1' }, HostConfig: { NanoCpus: 333333333 }, State: { Running: false } };
    const page = composePage(ctx, c, 'services: {}\n', { anonymous: ['f'.repeat(64)], moved: true });
    expect(page).toContain('<code>docker compose create</code> (web is not running');
    expect(page).toContain('0.333333333 becomes about 0.3333333432674408');
    expect(page).toContain('One of its volumes is anonymous');
    expect(page).toContain('app:1 names another image now');
    expect(page).toContain('check it with <code>docker compose config</code>');
    const ok = composePage(ctx, { ...c, HostConfig: { NanoCpus: 5e8 }, State: { Running: true } }, '');
    expect(ok).toContain('run <code>docker compose up -d</code>');
    expect(ok).not.toContain('less precision');
    expect(ok).not.toContain('anonymous (Docker');
  });
});
