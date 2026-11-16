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

  // The list, with Ref: the image reference each container was created with. The list's Image field
  // holds an image ID instead once that reference has moved to a newer image (a docker pull), so
  // those few are inspected for it.
  async listContainersWithRefs(): Promise<any[]> {
    const list = await this.listContainers();
    await Promise.all(list.map(async c => {
      c.Ref = c.Image;
      if (isImageId(c.Image)) c.Ref = (await this.inspect(c.Id).catch(() => null))?.Config?.Image ?? c.Image;
    }));
    return list;
  }
  inspect(id: string) { return this.json<any>('GET', `/containers/${encodeURIComponent(v.ref(id))}/json`); }
  async start(id: string) { await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/start`); }
  async stop(id: string) { await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/stop?t=10`, undefined, 60000); }
  async unpause(id: string) { await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/unpause`); }
  async restart(id: string) { await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/restart?t=10`, undefined, 60000); }
  async remove(id: string, force = false) {
    await this.req('DELETE', `/containers/${encodeURIComponent(v.ref(id))}?force=${force ? 1 : 0}&v=0`);
  }

  // One sample. Without one-shot, Docker waits for a second reading so precpu_stats is filled in.
  stats(id: string) { return this.json<any>('GET', `/containers/${encodeURIComponent(v.ref(id))}/stats?stream=false`, undefined, 15000); }

  // The daemon's container events from `sinceSec` (Unix seconds) on, as they happen, until the
  // signal aborts or the daemon closes the stream. One parsed event per item.
  async *events(sinceSec: number, signal: AbortSignal): AsyncGenerator<any> {
    const filters = encodeURIComponent(JSON.stringify({ type: ['container'] }));
    const init: RequestInit & { unix?: string } = { method: 'GET', signal };
    if (this.unix) init.unix = this.unix;
    let res: Response;
    try {
      res = await fetch(`${this.base}${API}/events?since=${Math.floor(sinceSec)}&filters=${filters}`, init);
    } catch (e) {
      throw new DockerError(`Docker daemon unreachable: ${(e as Error).message}`, 502);
    }
    if (!res.ok || !res.body) throw new DockerError(`the Docker API refused the event stream: HTTP ${res.status}`, res.status === 403 ? 403 : 502);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { yield JSON.parse(line); } catch { /* not an event */ }
      }
      if (buf.length > 1 << 20) buf = ''; // a runaway line: drop it
    }
  }

  // Logs, newest `tail` lines, keeping at most `maxBytes` of output while reading, so one container
  // that printed a 20 MB line cannot make kontainers hold 40 MB per request. What is cut is the
  // oldest output, and the text says so.
  async logs(id: string, tail = 200, timestamps = true, max = 10000, maxBytes = 2 << 20): Promise<string> {
    const t = v.intInRange(tail, 1, max, 200);
    const res = await this.req('GET', `/containers/${encodeURIComponent(v.ref(id))}/logs?stdout=1&stderr=1&timestamps=${timestamps ? 1 : 0}&tail=${t}`, undefined, 60000);
    const out = new BoundedLog(maxBytes);
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) { const { value, done } = await reader.read(); if (done) break; out.push(value); }
    }
    return out.text();
  }

  // keepBindMounts: an update recreating a container that already has them. allowedBindSources: an
  // edit, which may keep the host paths the container had but not add new ones.
  async create(spec: CreateSpec, opts: { keepBindMounts?: boolean; allowedBindSources?: string[] } = {}): Promise<{ Id: string }> {
    const body = this.createBody(spec, opts);
    const q = spec.name ? `?name=${encodeURIComponent(v.name(spec.name))}` : '';
    return this.json('POST', `/containers/create${q}`, body);
  }

  // The request body for create, after every check; throws a ValidationError for bad input. Called
  // on its own before a container is replaced, so bad input never stops the old one.
  createBody(spec: CreateSpec, opts: { keepBindMounts?: boolean; allowedBindSources?: string[] } = {}): Record<string, unknown> {
    if (spec.name) v.name(spec.name);
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
        if (!this.opts.allowBindMounts && !opts.keepBindMounts && !(opts.allowedBindSources || []).includes(m.source)) throw new v.ValidationError('host bind mounts are disabled (KONTAINERS_ALLOW_BIND_MOUNTS)');
        if (/[\0:]/.test(m.source)) throw new v.ValidationError('invalid mount source');
        return { Type: 'bind', Source: m.source, Target: target, ReadOnly: !!m.readOnly };
      }
      return { Type: 'volume', Source: v.name(m.source, 'volume name'), Target: target, ReadOnly: !!m.readOnly };
    });
    const restart = ['no', 'always', 'unless-stopped', 'on-failure'].includes(spec.restart || '') ? spec.restart : 'no';
    body.ExposedPorts = exposed;
    // Only these HostConfig fields are ever sent. No Privileged, CapAdd, host network/PID/IPC, devices.
    body.HostConfig = { PortBindings: bindings, Mounts: mounts, RestartPolicy: { Name: restart } };
    return body;
  }

  // Images
  listImages() { return this.json<any[]>('GET', '/images/json'); }
  inspectImage(ref: string) { return this.json<any>('GET', `/images/${encodeURIComponent(v.imageRef(ref))}/json`); }
  // The registry's current manifest for an image reference, asked by the daemon with its own
  // registry credentials. Nothing is downloaded.
  distribution(ref: string) { return this.json<any>('GET', `/distribution/${encodeURIComponent(v.image(ref))}/json`, undefined, 30000); }
  async rename(id: string, name: string) {
    await this.req('POST', `/containers/${encodeURIComponent(v.ref(id))}/rename?name=${encodeURIComponent(v.name(name))}`);
  }
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
  async disconnect(network: string, container: string) {
    await this.req('POST', `/networks/${encodeURIComponent(v.ref(network, 'network'))}/disconnect`, { Container: v.ref(container), Force: false });
  }

  // Volumes
  async listVolumes(): Promise<any[]> { return (await this.json<{ Volumes: any[] | null }>('GET', '/volumes')).Volumes || []; }
  createVolume(name: string) { return this.json<any>('POST', '/volumes/create', { Name: v.name(name, 'volume name'), Labels: { 'kontainers.managed': 'true' } }); }
  async removeVolume(name: string) { await this.req('DELETE', `/volumes/${encodeURIComponent(v.name(name, 'volume name'))}`); }
}

export interface StatsSummary {
  cpuPercent: number | null; // of one CPU, so 200 means two CPUs busy, as docker stats shows it
  memBytes: number | null;
  memLimit: number | null;
  netRx: number; netTx: number;
  pids: number | null;
}

// The numbers `docker stats` shows, from one Engine API stats response (cgroup v1 or v2).
export function summarizeStats(s: any): StatsSummary {
  const cpu = s?.cpu_stats, pre = s?.precpu_stats;
  let cpuPercent: number | null = null;
  if (cpu?.cpu_usage && pre?.cpu_usage && cpu.system_cpu_usage && pre.system_cpu_usage) {
    const d = cpu.cpu_usage.total_usage - pre.cpu_usage.total_usage;
    const sys = cpu.system_cpu_usage - pre.system_cpu_usage;
    const n = cpu.online_cpus || cpu.cpu_usage.percpu_usage?.length || 1;
    if (sys > 0 && d >= 0) cpuPercent = Math.round((d / sys) * n * 1000) / 10;
  }
  const m = s?.memory_stats;
  let memBytes: number | null = null;
  if (typeof m?.usage === 'number') {
    const cache = m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? 0; // v2 / v1
    memBytes = Math.max(0, m.usage - cache);
  }
  let netRx = 0, netTx = 0;
  for (const n of Object.values(s?.networks || {}) as any[]) { netRx += n.rx_bytes || 0; netTx += n.tx_bytes || 0; }
  return { cpuPercent, memBytes, memLimit: typeof m?.limit === 'number' ? m.limit : null, netRx, netTx, pids: s?.pids_stats?.current ?? null };
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

// An image ID rather than a reference: "sha256:<hex>" or bare hex.
export const isImageId = (s: unknown) => typeof s === 'string' && /^(sha256:)?[a-f0-9]{12,64}$/.test(s);

// Docker's log stream, demultiplexed as it arrives (8-byte frame headers when the container has
// no TTY, raw bytes when it has one), keeping only the newest `max` bytes of output.
export class BoundedLog {
  private parts: Uint8Array[] = [];
  private size = 0;
  dropped = 0;
  private mode: 'unknown' | 'framed' | 'raw' = 'unknown';
  private pending: Uint8Array = new Uint8Array(0); // bytes not yet parsed (a header split across chunks)
  private left = 0; // payload bytes still due for the current frame
  constructor(private max: number) {}

  push(chunk: Uint8Array): void {
    let buf: Uint8Array = this.pending.length ? concat(this.pending, chunk) : chunk;
    this.pending = new Uint8Array(0);
    if (this.mode === 'unknown') {
      if (buf.length < 8) { this.pending = buf; return; }
      this.mode = (buf[0] === 0 || buf[0] === 1 || buf[0] === 2) && buf[1] === 0 && buf[2] === 0 && buf[3] === 0 ? 'framed' : 'raw';
    }
    if (this.mode === 'raw') { this.keep(buf); return; }
    let i = 0;
    while (i < buf.length) {
      if (this.left > 0) {
        const n = Math.min(this.left, buf.length - i);
        this.keep(buf.subarray(i, i + n));
        this.left -= n; i += n;
        continue;
      }
      if (buf.length - i < 8) { this.pending = buf.slice(i); return; }
      this.left = ((buf[i + 4] << 24) >>> 0) + (buf[i + 5] << 16) + (buf[i + 6] << 8) + buf[i + 7];
      i += 8;
    }
  }

  private keep(b: Uint8Array): void {
    if (!b.length) return;
    this.parts.push(b.slice());
    this.size += b.length;
    while (this.size - this.parts[0].length >= this.max) { this.size -= this.parts[0].length; this.dropped += this.parts.shift()!.length; }
    if (this.size > this.max) {
      const cut = this.size - this.max;
      this.parts[0] = this.parts[0].subarray(cut);
      this.size -= cut; this.dropped += cut;
    }
  }

  text(): string {
    let s = new TextDecoder().decode(this.parts.length === 1 ? this.parts[0] : concat(...this.parts));
    if (!this.dropped) return s;
    const nl = s.indexOf('\n');
    if (nl >= 0 && nl < 4096) s = s.slice(nl + 1); // start at a whole line
    return `[earlier output not shown: ${(this.dropped / 1e6).toFixed(1)} MB more than kontainers shows at once]\n${s}`;
  }
}

function concat(...a: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
}
