// Minimal Docker Engine API client over a unix socket or TCP. Only typed calls;
// request bodies are built here, never passed through from the client.

import * as v from './validate';

const API = '/v1.41';

export class DockerError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface CreateSpec {
  name?: string;
  image: string;
  cmd?: string[];
  env?: string[];
  ports?: { container: number; host: number; hostIp?: string; protocol?: 'tcp' | 'udp' }[];
  volumes?: { source: string; target: string; readOnly?: boolean }[];
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
}

export interface DockerOptions {
  allowBindMounts: boolean;
}

export class Docker {
  private base: string;
  private unix?: string;

  constructor(dockerHost: string, private opts: DockerOptions = { allowBindMounts: false }) {
    if (dockerHost.startsWith('unix://')) {
      this.unix = dockerHost.slice('unix://'.length);
      this.base = 'http://docker';
    } else if (dockerHost.startsWith('tcp://')) {
      this.base = 'http://' + dockerHost.slice('tcp://'.length);
    } else if (dockerHost.startsWith('http://')) {
      this.base = dockerHost.replace(/\/$/, '');
    } else {
      throw new Error(`unsupported DOCKER_HOST "${dockerHost}"`);
    }
  }

  private async req(method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<Response> {
    const init: RequestInit & { unix?: string } = {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (this.unix) init.unix = this.unix;
    let res: Response;
    try {
      res = await fetch(this.base + API + path, init);
    } catch (e) {
      throw new DockerError(`Docker daemon unreachable: ${(e as Error).message}`, 502);
    }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = ((await res.json()) as { message?: string }).message || msg; } catch { /* keep statusText */ }
      throw new DockerError(msg, res.status === 404 ? 404 : res.status === 409 ? 409 : res.status >= 500 ? 502 : 400);
    }
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const res = await this.req(method, path, body, timeoutMs);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async ping(): Promise<boolean> {
    try { await this.req('GET', '/_ping', undefined, 3000); return true; } catch { return false; }
  }

  version() { return this.json<Record<string, unknown>>('GET', '/version'); }

  // Containers
  listContainers() { return this.json<any[]>('GET', '/containers/json?all=1'); }
  inspect(id: string) { return this.json<any>('GET', `/containers/${encodeURIComponent(v.ref(id))}/json`); }
  async start(id: string) { await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/start`); }
  async stop(id: string) { await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/stop?t=10`, undefined, 60000); }
  async restart(id: string) { await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/restart?t=10`, undefined, 60000); }
  async remove(id: string, force = false) {
    await this.req('DELETE', `/containers/${encodeURIComponent(v.ref(id))}?force=${force ? 1 : 0}&v=0`);
  }

  async logs(id: string, tail = 200): Promise<string> {
    const t = v.intInRange(tail, 1, 10000, 200);
    const res = await this.req('GET', `/containers/${encodeURIComponent(v.ref(id))}/logs?stdout=1&stderr=1&timestamps=1&tail=${t}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return demux(buf);
  }

  async create(spec: CreateSpec): Promise<{ Id: string }> {
    const image = v.image(spec.image);
    const body: Record<string, unknown> = { Image: image, Env: (spec.env || []).map(v.envVar), Labels: { 'kontainers.managed': 'true' } };
    if (spec.cmd && spec.cmd.length) {
      if (!Array.isArray(spec.cmd) || spec.cmd.some(c => typeof c !== 'string' || c.length > 4096)) throw new v.ValidationError('invalid command');
      body.Cmd = spec.cmd;
    }
    const exposed: Record<string, object> = {};
    const bindings: Record<string, { HostIp: string; HostPort: string }[]> = {};
    for (const p of spec.ports || []) {
      const proto = p.protocol === 'udp' ? 'udp' : 'tcp';
      const key = `${v.port(p.container, 'container port')}/${proto}`;
      exposed[key] = {};
      (bindings[key] ||= []).push({ HostIp: v.hostIp(p.hostIp), HostPort: String(v.port(p.host, 'host port')) });
    }
    const mounts = (spec.volumes || []).map(m => {
      const target = typeof m.target === 'string' && /^\/[^\0:]*$/.test(m.target) ? m.target : null;
      if (!target) throw new v.ValidationError('invalid mount target');
      if (typeof m.source === 'string' && m.source.startsWith('/')) {
        if (!this.opts.allowBindMounts) throw new v.ValidationError('host bind mounts are disabled (KONTAINERS_ALLOW_BIND_MOUNTS)');
        if (/[\0:]/.test(m.source)) throw new v.ValidationError('invalid mount source');
        return { Type: 'bind', Source: m.source, Target: target, ReadOnly: !!m.readOnly };
      }
      return { Type: 'volume', Source: v.name(m.source, 'volume name'), Target: target, ReadOnly: !!m.readOnly };
    });
    const restart = ['no', 'always', 'unless-stopped', 'on-failure'].includes(spec.restart || '') ? spec.restart : 'no';
    body.ExposedPorts = exposed;
    // Only these HostConfig fields are ever sent. No Privileged, CapAdd, host network/PID/IPC, devices.
    body.HostConfig = { PortBindings: bindings, Mounts: mounts, RestartPolicy: { Name: restart } };
    const q = spec.name ? `?name=${encodeURIComponent(v.name(spec.name))}` : '';
    return this.json('POST', `/containers/create${q}`, body);
  }

  // Images
  listImages() { return this.json<any[]>('GET', '/images/json'); }
  async pull(ref: string): Promise<void> {
    const img = v.image(ref);
    let [repo, tag] = [img, 'latest'];
    const at = img.indexOf('@');
    const colon = img.lastIndexOf(':');
    if (at === -1 && colon > img.lastIndexOf('/')) { repo = img.slice(0, colon); tag = img.slice(colon + 1); }
    const res = await this.req('POST', `/images/create?fromImage=${encodeURIComponent(repo)}${at === -1 ? `&tag=${encodeURIComponent(tag)}` : ''}`, undefined, 600000);
    // The daemon streams progress and reports failures inside the stream.
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { const m = JSON.parse(line); if (m.error) throw new DockerError(m.error, 400); } catch (e) { if (e instanceof DockerError) throw e; }
    }
  }
  async removeImage(ref: string, force = false) {
    await this.req('DELETE', `/images/${encodeURIComponent(v.imageRef(ref))}?force=${force ? 1 : 0}`);
  }

  // Networks
  listNetworks() { return this.json<any[]>('GET', '/networks'); }
  inspectNetwork(id: string) { return this.json<any>('GET', `/networks/${encodeURIComponent(v.ref(id, 'network'))}`); }
  createNetwork(name: string) { return this.json<{ Id: string }>('POST', '/networks/create', { Name: v.name(name, 'network name'), Driver: 'bridge', CheckDuplicate: true, Labels: { 'kontainers.managed': 'true' } }); }
  async removeNetwork(id: string) { await this.req('DELETE', `/networks/${encodeURIComponent(v.ref(id, 'network'))}`); }
  async connect(network: string, container: string) {
    await this.req('POST', `/networks/${encodeURIComponent(v.ref(network, 'network'))}/connect`, { Container: v.ref(container) });
  }

  // Volumes
  async listVolumes(): Promise<any[]> { return (await this.json<{ Volumes: any[] | null }>('GET', '/volumes')).Volumes || []; }
  createVolume(name: string) { return this.json<any>('POST', '/volumes/create', { Name: v.name(name, 'volume name'), Labels: { 'kontainers.managed': 'true' } }); }
  async removeVolume(name: string) { await this.req('DELETE', `/volumes/${encodeURIComponent(v.name(name, 'volume name'))}`); }
}

// Docker multiplexes stdout/stderr with an 8-byte header per frame when the container has no TTY.
export function demux(buf: Uint8Array): string {
  const looksFramed = buf.length >= 8 && (buf[0] === 1 || buf[0] === 2 || buf[0] === 0) && buf[1] === 0 && buf[2] === 0 && buf[3] === 0;
  if (!looksFramed) return new TextDecoder().decode(buf);
  const parts: Uint8Array[] = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const size = (buf[i + 4] << 24) | (buf[i + 5] << 16) | (buf[i + 6] << 8) | buf[i + 7];
    parts.push(buf.subarray(i + 8, Math.min(buf.length, i + 8 + size)));
    i += 8 + size;
  }
  return parts.map(p => new TextDecoder().decode(p)).join('');
}
