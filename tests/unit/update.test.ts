import { describe, expect, test } from 'bun:test';
import { recreateSpec, updatable } from '../../src/update';
import { summarizeStats } from '../../src/docker';

const image = { Config: { Env: ['PATH=/usr/bin', 'NGINX_VERSION=1.27.0'], Cmd: ['nginx', '-g', 'daemon off;'] } };
const container = (over: any = {}) => ({
  Id: 'a'.repeat(64), Name: '/web', Image: 'sha256:' + 'b'.repeat(64),
  Config: { Image: 'nginx:1.27', Env: ['PATH=/usr/bin', 'NGINX_VERSION=1.27.0', 'MODE=prod'], Cmd: ['nginx', '-g', 'daemon off;'], Labels: { 'kontainers.managed': 'true' }, ...over.Config },
  HostConfig: {
    PortBindings: { '80/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080' }], '53/udp': [{ HostIp: '', HostPort: '5353' }] },
    Mounts: [{ Type: 'volume', Source: 'data', Target: '/data', ReadOnly: true }, { Type: 'bind', Source: '/srv', Target: '/srv' }],
    RestartPolicy: { Name: 'unless-stopped' }, ...over.HostConfig,
  },
});

describe('recreateSpec', () => {
  test('keeps what the user set, drops the image defaults', () => {
    expect(recreateSpec(container(), image)).toEqual({
      name: 'web', image: 'nginx:1.27', cmd: undefined, env: ['MODE=prod'],
      ports: [{ container: 80, host: 8080, hostIp: '127.0.0.1', protocol: 'tcp' }, { container: 53, host: 5353, hostIp: '0.0.0.0', protocol: 'udp' }],
      volumes: [{ source: 'data', target: '/data', readOnly: true }, { source: '/srv', target: '/srv', readOnly: false }],
      restart: 'unless-stopped',
    });
  });
  test('a command the user gave is kept', () => {
    expect(recreateSpec(container({ Config: { Cmd: ['sh', '-c', 'echo hi'] } }), image).cmd).toEqual(['sh', '-c', 'echo hi']);
  });
  test('an env value the user changed from the image default is kept', () => {
    const c = container({ Config: { Env: ['PATH=/opt/bin', 'NGINX_VERSION=1.27.0'] } });
    expect(recreateSpec(c, image).env).toEqual(['PATH=/opt/bin']);
  });
  test('without the old image, everything set on the container is kept', () => {
    expect(recreateSpec(container(), null).env?.length).toBe(3);
  });
});

describe('updatable', () => {
  test('only containers kontainers created, never compose ones', () => {
    expect(updatable(container())).toBeNull();
    expect(updatable(container({ Config: { Labels: {} } }))).toContain('created in kontainers');
    expect(updatable(container({ Config: { Labels: { 'kontainers.managed': 'true', 'com.docker.compose.project': 'shop' } } }))).toContain('docker compose pull');
  });
});

describe('summarizeStats', () => {
  test('CPU percent as docker stats computes it, memory without page cache', () => {
    const s = summarizeStats({
      cpu_stats: { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 20_000_000_000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 10_000_000_000 },
      memory_stats: { usage: 300_000_000, limit: 1_000_000_000, stats: { inactive_file: 100_000_000 } },
      networks: { eth0: { rx_bytes: 10, tx_bytes: 20 }, eth1: { rx_bytes: 1, tx_bytes: 2 } },
      pids_stats: { current: 7 },
    });
    expect(s).toEqual({ cpuPercent: 40, memBytes: 200_000_000, memLimit: 1_000_000_000, netRx: 11, netTx: 22, pids: 7 });
  });
  test('missing samples give nulls, not NaN', () => {
    expect(summarizeStats({})).toEqual({ cpuPercent: null, memBytes: null, memLimit: null, netRx: 0, netTx: 0, pids: null });
  });
});
