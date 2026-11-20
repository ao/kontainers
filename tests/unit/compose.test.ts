import { describe, expect, test } from 'bun:test';
import { composeFile } from '../../src/compose';

describe('a compose file for a container made in kontainers', () => {
  test('values come back exactly, with $ doubled for compose', () => {
    const env = ['A=$HOME and ${X}', 'B="q" \'s\' #x: y', 'C=- [a] {b} &c *d !e |f >g', 'D=\u2028\u0085é', 'E='];
    const cmd = ['sh', '-c', "echo 'a\nb' $1"];
    const yaml = composeFile({
      name: 'web', image: 'me/app:1.2', cmd, env, restart: 'no',
      ports: [{ host: 8080, container: 80, hostIp: '127.0.0.1' }, { host: 53, container: 53, hostIp: '::1', protocol: 'udp' }],
      volumes: [{ source: 'data', target: '/data' }, { source: '/srv/x', target: '/x', readOnly: true }],
      labels: { 'app.role': 'web: front', 'kontainers.autoupdate': 'true' }, memory: 512 * 1024 ** 2, nanoCpus: 1.5e9, pids: 100,
    });
    expect(yaml).not.toMatch(/[\u0085\u2028\u2029]/);
    const doc = Bun.YAML.parse(yaml) as any;
    const s = doc.services.web;
    expect(s.environment).toEqual(env.map(e => e.replace(/\$/g, '$$$$')));
    expect(s.command).toEqual(['sh', '-c', "echo 'a\nb' $$1"]);
    expect(s).toMatchObject({ image: 'me/app:1.2', container_name: 'web', restart: 'no', mem_limit: 536870912, cpus: 1.5, pids_limit: 100, network_mode: 'bridge' });
    expect(s.ports).toEqual(['127.0.0.1:8080:80', '[::1]:53:53/udp']);
    expect(s.volumes).toEqual(['data:/data', '/srv/x:/x:ro']);
    expect(s.labels).toEqual({ 'app.role': 'web: front', 'kontainers.autoupdate': 'true' });
    expect(doc.volumes).toEqual({ data: { external: true } });
    expect(doc.networks).toBeUndefined();
  });
  test('a user network, external, with the aliases', () => {
    const doc = Bun.YAML.parse(composeFile({ name: 'db', image: 'postgres:17', restart: 'unless-stopped' }, { name: 'backend', aliases: ['pg'] })) as any;
    expect(doc.services.db.networks).toEqual({ backend: { aliases: ['pg'] } });
    expect(doc.services.db.network_mode).toBeUndefined();
    expect(doc.networks).toEqual({ backend: { external: true } });
    expect(doc.volumes).toBeUndefined();
  });
});
