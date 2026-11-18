// Recreating a container that kontainers did not create (compose, docker run) from a newer image
// of its tag. Its whole configuration is copied from docker inspect, except what came from the old
// image (environment, command, working directory, user, healthcheck, labels...), which the new image
// supplies, as docker compose does. Anonymous volumes are kept by name, so their data stays. Before
// the new container starts, its settings are compared with the old one's: any difference stops the
// update and the old container is put back (cloneDiff).
//
// The copy holds whatever the container had: privileged mode, capabilities, devices, the host's
// network. kontainers never sets those itself; it keeps what the owner set when the container was
// created. Edit settings stays limited to containers kontainers created.

const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
// Empty values the daemon reports in different ways (null, [], {}, '') count as nothing.
function norm(x: unknown): unknown {
  if (x === undefined || x === null || x === '' || x === 0 || x === false) return null;
  if (Array.isArray(x)) return x.length ? x.map(norm) : null;
  if (typeof x === 'object') {
    const keys = Object.keys(x as object).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) { const n = norm((x as Record<string, unknown>)[k]); if (n !== null) out[k] = n; }
    return Object.keys(out).length ? out : null;
  }
  return x;
}

const nameOf = (c: any) => String(c?.Name || c?.Names?.[0] || '').replace(/^\//, '');
const IMAGE_ID = /^(sha256:)?[0-9a-f]{12,64}$/;

// Why `c` cannot be recreated by copying, or null. `others`: every other container, inspected.
export function cloneRefusal(c: any, others: any[]): string | null {
  const labels = c?.Config?.Labels || {};
  if (labels['com.docker.swarm.service.id'] || labels['com.docker.swarm.task.id']) return 'it is a task of a swarm service; update the service with docker service update';
  const ref = String(c?.Config?.Image || '');
  if (ref.includes('@')) return `it was created from a digest (${ref}), which always means the same image; change the reference to update it`;
  if (IMAGE_ID.test(ref) || String(c?.Image || '').replace(/^sha256:/, '').startsWith(ref.replace(/^sha256:/, ''))) return 'it was created from an image ID, not a tag, so there is nothing to pull';
  const id = String(c?.Id || ''), name = nameOf(c);
  const joins = (mode: unknown) => { const m = String(mode || ''); return m === `container:${id}` || m === `container:${name}` || (m.startsWith('container:') && m.length > 22 && id.startsWith(m.slice(10))); };
  const users = others.filter(o => String(o.Id) !== id && (joins(o.HostConfig?.NetworkMode) || joins(o.HostConfig?.PidMode) || joins(o.HostConfig?.IpcMode))).map(nameOf);
  if (users.length) return `${users.join(', ')} ${users.length === 1 ? 'shares' : 'share'} its network, process or IPC namespace, and a new container would cut ${users.length === 1 ? 'it' : 'them'} off; update them together with docker compose`;
  return null;
}

// Keys of `a` that are not in `b`, as an object (ExposedPorts, Volumes).
const without = (a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a || {})) if (!(b && k in b)) out[k] = v;
  return out;
};

// The mount destinations the container was created with (Binds "src:dst[:opts]" and Mounts).
function createdMountTargets(h: any): Set<string> {
  const out = new Set<string>();
  for (const b of h?.Binds || []) {
    const parts = String(b).split(':');
    if (parts.length >= 2) out.add(parts[1]);
  }
  for (const m of h?.Mounts || []) if (m?.Target) out.add(m.Target);
  return out;
}

// The create body for a copy of `c` (inspected) on the newest image of its tag. oldImage: the image
// it runs (inspected), to tell its defaults apart from the container's own settings; newImageId: the
// image the copy gets, for compose's own record of it.
export function cloneBody(c: any, oldImage: any, newImageId: string): Record<string, any> {
  const cfg = c?.Config || {}, img = oldImage?.Config || {};
  const body: Record<string, any> = { ...cfg, Image: cfg.Image };
  const imgEnv = new Set<string>(img.Env || []);
  body.Env = (cfg.Env || []).filter((e: string) => !imgEnv.has(e));
  if (same(cfg.Entrypoint, img.Entrypoint)) {
    delete body.Entrypoint;
    if (same(cfg.Cmd, img.Cmd)) delete body.Cmd;
  }
  for (const k of ['WorkingDir', 'User', 'StopSignal', 'Shell', 'Healthcheck', 'OnBuild', 'ArgsEscaped']) if (same(cfg[k], img[k])) delete body[k];
  body.ExposedPorts = without(cfg.ExposedPorts, img.ExposedPorts);
  body.Volumes = without(cfg.Volumes, img.Volumes);
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.Labels || {}) as [string, string][]) if (img.Labels?.[k] !== v) labels[k] = v;
  labels['kontainers.replaces'] = String(c.Id);
  // Compose recreates a container whose record of its image is not the image the tag points at.
  if ('com.docker.compose.image' in labels) labels['com.docker.compose.image'] = newImageId;
  body.Labels = labels;
  const mode = String(c?.HostConfig?.NetworkMode || '');
  const shared = mode === 'host' || mode.startsWith('container:');
  // Docker made these up (the short ID as the host name) or takes them from the network it shares.
  if (shared || cfg.Hostname === String(c.Id).slice(0, 12)) delete body.Hostname;
  if (shared) { delete body.Domainname; delete body.MacAddress; }
  if (!body.MacAddress) delete body.MacAddress;

  const host: Record<string, any> = { ...(c?.HostConfig || {}) };
  // Anonymous volumes (an image's VOLUME, compose's volumes without a name) are not in the create
  // settings, only in Mounts; without them the data would stay behind in the old container's volume.
  const created = createdMountTargets(host);
  const extra = (c?.Mounts || []).filter((m: any) => m.Type === 'volume' && m.Name && m.Destination && !created.has(m.Destination))
    .map((m: any) => ({ Type: 'volume', Source: m.Name, Target: m.Destination, ReadOnly: m.RW === false }));
  if (extra.length) host.Mounts = [...(host.Mounts || []), ...extra];
  body.HostConfig = host;
  delete body.NetworkingConfig;
  return body;
}

// The networks of `c` with the aliases and fixed addresses it has on each; the names Docker gives
// it itself (its name, short ID, host name) are left out.
function networksOf(c: any): Record<string, unknown> {
  const own = new Set([String(c?.Id || '').slice(0, 12), nameOf(c), String(c?.Config?.Hostname || '')]);
  const out: Record<string, unknown> = {};
  for (const [n, ep] of Object.entries(c?.NetworkSettings?.Networks || {}) as [string, any][]) {
    out[n] = { aliases: (ep?.Aliases || []).filter((a: string) => a && !own.has(a)).sort(), v4: ep?.IPAMConfig?.IPv4Address || null, v6: ep?.IPAMConfig?.IPv6Address || null };
  }
  return out;
}

// The settings of `c` that are its own, not its image's: what must be the same in a copy.
export function ownSettings(c: any, image: any): Record<string, unknown> {
  const cfg = c?.Config || {}, img = image?.Config || {}, h = c?.HostConfig || {};
  const imgEnv = new Set<string>(img.Env || []);
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.Labels || {}) as [string, string][]) if (img.Labels?.[k] !== v && k !== 'kontainers.replaces' && k !== 'com.docker.compose.image') labels[k] = v;
  const entry = same(cfg.Entrypoint, img.Entrypoint);
  const pick = (o: any, keys: string[]) => Object.fromEntries(keys.map(k => [k, o?.[k]]));
  const own = (k: string) => (same(cfg[k], img[k]) ? null : cfg[k]);
  const mode = String(h.NetworkMode || '');
  const shared = mode === 'host' || mode.startsWith('container:');
  return {
    Env: (cfg.Env || []).filter((e: string) => !imgEnv.has(e)).sort(),
    Labels: labels,
    Entrypoint: entry ? null : cfg.Entrypoint,
    Cmd: entry && same(cfg.Cmd, img.Cmd) ? null : cfg.Cmd,
    WorkingDir: own('WorkingDir'), User: own('User'), Healthcheck: own('Healthcheck'), StopSignal: own('StopSignal'),
    Hostname: shared || cfg.Hostname === String(c.Id).slice(0, 12) ? null : cfg.Hostname,
    ...pick(cfg, ['Domainname', 'Tty', 'OpenStdin', 'StdinOnce', 'AttachStdin', 'StopTimeout']),
    // The network mode only where it is the network itself; otherwise the networks below say it.
    NetworkMode: shared || mode === 'none' ? mode : null,
    Networks: networksOf(c),
    HostConfig: pick(h, ['Binds', 'Privileged', 'CapAdd', 'CapDrop', 'Devices', 'DeviceRequests', 'DeviceCgroupRules', 'PortBindings', 'PublishAllPorts',
      'RestartPolicy', 'AutoRemove', 'Memory', 'MemoryReservation', 'MemorySwap', 'MemorySwappiness', 'NanoCpus', 'CpuShares', 'CpuQuota', 'CpuPeriod', 'CpusetCpus', 'CpusetMems',
      'BlkioWeight', 'PidsLimit', 'OomKillDisable', 'OomScoreAdj', 'SecurityOpt', 'ExtraHosts', 'Dns', 'DnsSearch', 'DnsOptions', 'Tmpfs', 'Sysctls', 'Ulimits', 'LogConfig',
      'PidMode', 'IpcMode', 'UTSMode', 'UsernsMode', 'CgroupnsMode', 'CgroupParent', 'ShmSize', 'Init', 'GroupAdd', 'ReadonlyRootfs', 'Links', 'VolumesFrom', 'Runtime',
      'Isolation', 'MaskedPaths', 'ReadonlyPaths', 'VolumeDriver', 'StorageOpt']),
  };
}

// Mounts as "type name-or-source -> destination (ro)".
const mountsOf = (c: any) => (c?.Mounts || []).map((m: any) => `${m.Type} ${m.Type === 'volume' ? m.Name : m.Source} -> ${m.Destination}${m.RW === false ? ' (read-only)' : ''}`);

// What differs between the old container and its copy (both inspected), by setting name; empty when
// the copy is faithful. A mount the new image adds (a new VOLUME) is fine; one the old container had
// and the copy lacks is not.
export function cloneDiff(old: any, oldImage: any, copy: any, newImage: any): string[] {
  const a = ownSettings(old, oldImage), b = ownSettings(copy, newImage);
  const out: string[] = [];
  for (const k of Object.keys(a)) {
    if (k === 'HostConfig') continue;
    if (!same(a[k], b[k])) out.push(k);
  }
  const ha = a.HostConfig as Record<string, unknown>, hb = b.HostConfig as Record<string, unknown>;
  for (const k of Object.keys(ha)) if (!same(ha[k], hb[k])) out.push(k);
  const had = new Set<string>(mountsOf(copy));
  const lost = mountsOf(old).filter((m: string) => !had.has(m));
  if (lost.length) out.push(`mounts (${lost.join(', ')})`);
  return out;
}
