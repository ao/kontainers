import { describe, expect, test } from 'bun:test';
import { cpuLimit, formatMemory, memoryLimit, pidsLimit } from '../../src/validate';
import { Docker } from '../../src/docker';
import { recreateSpec } from '../../src/update';
import { limitsText } from '../../src/views';

describe('resource limits', () => {
  test('sizes, CPUs and processes as docker run takes them', () => {
    expect(memoryLimit('')).toBeUndefined();
    expect(memoryLimit('512m')).toBe(512 * 1024 ** 2);
    expect(memoryLimit('1.5G')).toBe(1.5 * 1024 ** 3);
    expect(memoryLimit('256MiB')).toBe(256 * 1024 ** 2);
    expect(memoryLimit(String(64 * 1024 ** 2))).toBe(64 * 1024 ** 2);
    for (const bad of ['5m', 'lots', '-1g', '1x', '1e9']) expect(() => memoryLimit(bad)).toThrow();
    expect(cpuLimit('0.5')).toBe(5e8);
    expect(cpuLimit('2')).toBe(2e9);
    // What docker update --cpus 0.125 sets reads back and saves unchanged; a decimal comma is fine.
    expect(cpuLimit('0.125')).toBe(1.25e8);
    expect(cpuLimit('0,5')).toBe(5e8);
    for (const bad of ['0', '0.001', '2000', 'half', '1.2345678901']) expect(() => cpuLimit(bad)).toThrow();
    expect(pidsLimit('200')).toBe(200);
    for (const bad of ['0', '-5', '1.5', 'many']) expect(() => pidsLimit(bad)).toThrow();
    expect(formatMemory(512 * 1024 ** 2)).toBe('512m');
    expect(formatMemory(1.5 * 1024 ** 3)).toBe('1.5g');
    expect(formatMemory(1000 * 1024 ** 2)).toBe('1000m');
    expect(formatMemory(1.5 * 1024 ** 3 + 7)).toBe(String(1.5 * 1024 ** 3 + 7)); // not rounded away
  });

  test('sent to Docker as HostConfig, checked again there', () => {
    const d = new Docker('tcp://127.0.0.1:1');
    const body = d.createBody({ image: 'nginx:1', memory: 512 * 1024 ** 2, nanoCpus: 5e8, pids: 100 }) as any;
    expect(body.HostConfig).toMatchObject({ Memory: 512 * 1024 ** 2, NanoCpus: 5e8, PidsLimit: 100 });
    expect(d.createBody({ image: 'nginx:1' }) as any).not.toHaveProperty('HostConfig.Memory');
    expect(() => d.createBody({ image: 'nginx:1', memory: 1024 })).toThrow('at least 6m');
    expect(() => d.createBody({ image: 'nginx:1', nanoCpus: 5 })).toThrow('CPU');
  });

  test('kept by Update image and Edit settings; shown on the page', () => {
    const c = { Name: '/web', Config: { Image: 'nginx:1', Env: [] }, HostConfig: { Memory: 268435456, NanoCpus: 1.5e9, PidsLimit: 64, PortBindings: {}, RestartPolicy: { Name: 'no' } }, Mounts: [] };
    expect(recreateSpec(c, { Config: { Env: [] } })).toMatchObject({ memory: 268435456, nanoCpus: 1.5e9, pids: 64 });
    expect(limitsText(c.HostConfig)).toBe('memory 256m, 1.5 CPUs, 64 processes');
    expect(limitsText({ CpuQuota: 50000, CpuPeriod: 100000 })).toBe('0.5 CPUs');
    expect(limitsText({ CpuQuota: 100000, CpuPeriod: 0 })).toBe('1 CPU'); // the kernel's default period
    expect(limitsText({ NanoCpus: 1e9, CpusetCpus: '0-1' })).toBe('1 CPU, on CPUs 0-1');
    expect(limitsText({})).toBe('none');
  });
});
