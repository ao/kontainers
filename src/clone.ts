// Recreating a container that kontainers did not create (compose, docker run) from a newer image
// of its tag. Its whole configuration is copied from docker inspect (at the daemon's own API
// version), except what came from the old image: values equal to the old image's (environment
// entries, command, entrypoint, working directory, user, labels, healthcheck fields, stop signal)
// are left out, so the new image supplies its own. That cannot tell a value the owner set from
// the same value the image had; when the new image changes such a value, the update is refused for
// the riskiest ones and names the rest (imageDoubts). Anonymous volumes are kept by name, so their data stays.
// The copy is created, and compared with the old container (cloneDiff), before the old one is
// stopped: a copy that would lose something is removed again and nothing changes.
//
// The copy holds whatever the container had: privileged mode, capabilities, devices, the host's
// network. kontainers never sets those itself; it keeps what the owner set when the container was
// created. Edit settings stays limited to containers kontainers created.

const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
// Empty values the daemon reports in different ways (null, [], {}, '', 0, false) count as nothing.
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
  if (!ref || IMAGE_ID.test(ref) || String(c?.Image || '').replace(/^sha256:/, '').startsWith(ref.replace(/^sha256:/, ''))) return 'it was created from an image ID, not a tag, so there is nothing to pull';
  // Stopping it would make Docker remove it, and its anonymous volumes with it.
  if (c?.HostConfig?.AutoRemove) return 'it was started with --rm, so stopping it would remove it and its anonymous volumes; recreate it with docker run';
  const id = String(c?.Id || ''), name = nameOf(c);
  const byId = (r: string) => r.length >= 12 && /^[0-9a-f]+$/.test(r) && id.startsWith(r);
  const joins = (mode: unknown) => { const m = String(mode || ''); return m.startsWith('container:') && (m.slice(10) === name || byId(m.slice(10))); };
  const users = others.filter(o => String(o.Id) !== id && (joins(o.HostConfig?.NetworkMode) || joins(o.HostConfig?.PidMode) || joins(o.HostConfig?.IpcMode))).map(nameOf);
  if (users.length) return `${users.join(', ')} ${users.length === 1 ? 'shares' : 'share'} its network, process or IPC namespace, and a new container would cut ${users.length === 1 ? 'it' : 'them'} off; update them together with docker compose`;
  // --volumes-from by ID: the new container has another ID, so recreating those later would fail.
  const mounting = others.filter(o => String(o.Id) !== id && (o.HostConfig?.VolumesFrom || []).some((f: string) => byId(String(f).split(':')[0]))).map(nameOf);
  if (mounting.length) return `${mounting.join(', ')} ${mounting.length === 1 ? 'mounts' : 'mount'} its volumes by its ID (--volumes-from); update them together with docker compose`;
  return null;
}

// Keys of `a` that are not in `b`, as an object (ExposedPorts, Volumes).
const without = (a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a || {})) if (!(b && k in b)) out[k] = v;
  return out;
};

// The fields of a healthcheck that are the container's own; null when all are the image's. Docker
// fills the missing ones from the image, so a compose file that sets only `interval` keeps the new
// image's test.
function ownHealth(h: any, img: any): Record<string, unknown> | null {
  if (!h) return null;
  const out: Record<string, unknown> = {};
  for (const k of ['Test', 'Interval', 'Timeout', 'StartPeriod', 'StartInterval', 'Retries']) if (h[k] !== undefined && !same(h[k], img?.[k])) out[k] = h[k];
  return Object.keys(out).length ? out : null;
}

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

// What compose records as the image of a container it made (com.docker.compose.image), for the new
// image: the image ID with Docker's classic image store, the platform's manifest digest with the
// containerd store. Told apart by what it recorded for the old image.
export function composeImageLabel(oldLabel: string, oldImage: any, newImage: any): string {
  const manifest = (img: any) => img?.ImageManifestDescriptor?.digest ?? img?.ImageManifestDescriptor?.Digest ?? null;
  if (oldLabel === oldImage?.Id) return newImage.Id;
  return manifest(newImage) ?? newImage.Id;
}

// The entrypoint was cleared (docker run --entrypoint "", compose entrypoint: []): Docker shows
// none, and a create without one would use the image's.
const cleared = (cfg: any, img: any) => norm(cfg?.Entrypoint) === null && norm(img?.Entrypoint) !== null;

// The create body for a copy of `c` (inspected) on the newest image of its tag. oldImage: the image
// it runs (inspected), to tell its defaults apart from the container's own settings; composeImage:
// compose's record of the new image (composeImageLabel).
export function cloneBody(c: any, oldImage: any, composeImage: string): Record<string, any> {
  const cfg = c?.Config || {}, img = oldImage?.Config || {};
  const body: Record<string, any> = { ...cfg, Image: cfg.Image };
  const imgEnv = new Set<string>(img.Env || []);
  body.Env = (cfg.Env || []).filter((e: string) => !imgEnv.has(e));
  if (same(cfg.Entrypoint, img.Entrypoint)) {
    delete body.Entrypoint;
    if (same(cfg.Cmd, img.Cmd)) delete body.Cmd;
  } else if (cleared(cfg, img)) body.Entrypoint = [''];
  for (const k of ['WorkingDir', 'User', 'StopSignal', 'Shell', 'OnBuild', 'ArgsEscaped']) if (same(cfg[k], img[k])) delete body[k];
  const health = ownHealth(cfg.Healthcheck, img.Healthcheck);
  if (health) body.Healthcheck = health; else delete body.Healthcheck;
  body.ExposedPorts = without(cfg.ExposedPorts, img.ExposedPorts);
  body.Volumes = without(cfg.Volumes, img.Volumes);
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.Labels || {}) as [string, string][]) if (img.Labels?.[k] !== v) labels[k] = v;
  labels['kontainers.replaces'] = String(c.Id);
  // Compose recreates a container whose record of its image is not the image the tag points at.
  if ('com.docker.compose.image' in labels) labels['com.docker.compose.image'] = composeImage;
  body.Labels = labels;
  const mode = String(c?.HostConfig?.NetworkMode || '');
  const shared = mode === 'host' || mode.startsWith('container:');
  // Docker made these up (the short ID as the host name) or takes them from the network it shares.
  if (shared || cfg.Hostname === String(c.Id).slice(0, 12)) delete body.Hostname;
  if (shared) { delete body.Domainname; delete body.MacAddress; }
  if (!body.MacAddress) delete body.MacAddress;

  const host: Record<string, any> = { ...(c?.HostConfig || {}) };
  // The paths Docker masks are its own defaults, unless the owner unmasked them (security_opt
  // systempaths=unconfined, which is copied): left to the daemon, which may know more of them now.
  delete host.MaskedPaths;
  delete host.ReadonlyPaths;
  // Anonymous volumes: an image's VOLUME, or `docker run -v /path`, is not in the create settings at
  // all, only in Mounts; compose's (`- /path`) is a volume mount with no source. Both get the volume
  // the old container has, by name; otherwise the data would stay behind in it.
  const actual = new Map<string, string>((c?.Mounts || []).filter((m: any) => m.Type === 'volume' && m.Name).map((m: any) => [m.Destination, m.Name]));
  if (host.Mounts) host.Mounts = host.Mounts.map((m: any) => (m?.Type === 'volume' && !m.Source && actual.has(m.Target) ? { ...m, Source: actual.get(m.Target) } : m));
  const created = createdMountTargets(host);
  const extra = (c?.Mounts || []).filter((m: any) => m.Type === 'volume' && m.Name && m.Destination && !created.has(m.Destination))
    .map((m: any) => ({ Type: 'volume', Source: m.Name, Target: m.Destination, ReadOnly: m.RW === false }));
  if (extra.length) host.Mounts = [...(host.Mounts || []), ...extra];
  body.HostConfig = host;
  delete body.NetworkingConfig;
  return body;
}

const kv = (list: string[] | undefined) => new Map((list || []).map(e => { const i = e.indexOf('='); return [i < 0 ? e : e.slice(0, i), i < 0 ? '' : e.slice(i + 1)] as [string, string]; }));

// Values the container has that equal the old image's and that the new image changes: they may
// have been the image's (then the new one is right) or set on purpose to the same value (then it
// is not). kontainers cannot tell, so:
//   refuse: the user it runs as, and environment values that are paths into its volumes (a data
//           directory such as PGDATA): guessing wrong runs it as another user or on an empty
//           data directory, and nothing would show it;
//   taken:  the rest (other environment values, the working directory, the stop signal), which
//           the update names. PATH and the variables that change with every release (versions,
//           checksums, download URLs, keys) are not named.
export function imageDoubts(c: any, oldImage: any, newImage: any): { refuse: string[]; taken: string[] } {
  const cfg = c?.Config || {}, was = oldImage?.Config || {}, now = newImage?.Config || {};
  const refuse: string[] = [], taken: string[] = [];
  const user = (u: unknown) => String(u || '') || 'root';
  if (same(cfg.User, was.User) && !same(was.User, now.User)) refuse.push(`the user it runs as (${user(was.User)} in the old image, ${user(now.User)} in the new one)`);
  const mounts = (c?.Mounts || []).map((m: any) => String(m.Destination || '')).filter(Boolean);
  const intoVolume = (p: string) => p.startsWith('/') && mounts.some((m: string) => p === m || p.startsWith(m.endsWith('/') ? m : `${m}/`));
  const had = kv(cfg.Env), wasEnv = kv(was.Env), nowEnv = kv(now.Env);
  for (const [k, v] of had) {
    if (wasEnv.get(k) !== v || !nowEnv.has(k) || nowEnv.get(k) === v) continue;
    if (intoVolume(v)) refuse.push(`${k} (${v} in the old image, which is in one of its volumes; ${nowEnv.get(k)} in the new one)`);
    else if (k !== 'PATH' && !/(^|_)(VERSION|RELEASE|MAJOR|SHA1|SHA256|SHA512|MD5|CHECKSUM|URL|GPG_KEYS?)$/.test(k)) taken.push(`${k} (${v} -> ${nowEnv.get(k)})`);
  }
  for (const k of ['WorkingDir', 'StopSignal']) if (cfg[k] && same(cfg[k], was[k]) && now[k] && !same(was[k], now[k])) taken.push(`${k === 'WorkingDir' ? 'the working directory' : 'the stop signal'} (${cfg[k]} -> ${now[k]})`);
  return { refuse, taken };
}

// The networks of `c` with the aliases, fixed addresses, links and driver options it has on each;
// the names Docker gives it itself (its name, short ID, host name) are left out.
function networksOf(c: any): Record<string, unknown> {
  const own = new Set([String(c?.Id || '').slice(0, 12), nameOf(c), String(c?.Config?.Hostname || '')]);
  const out: Record<string, unknown> = {};
  for (const [n, ep] of Object.entries(c?.NetworkSettings?.Networks || {}) as [string, any][]) {
    out[n] = {
      aliases: (ep?.Aliases || []).filter((a: string) => a && !own.has(a)).sort(), v4: ep?.IPAMConfig?.IPv4Address || null, v6: ep?.IPAMConfig?.IPv6Address || null,
      linkLocal: [...(ep?.IPAMConfig?.LinkLocalIPs || [])].sort(), links: [...(ep?.Links || [])].sort(), driverOpts: ep?.DriverOpts || null,
    };
  }
  return out;
}

// The settings of `c` that are its own, not its image's: what a copy must keep.
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
    Entrypoint: entry ? null : cleared(cfg, img) ? ['(none)'] : cfg.Entrypoint,
    Cmd: entry && same(cfg.Cmd, img.Cmd) ? null : cfg.Cmd,
    WorkingDir: own('WorkingDir'), User: own('User'), StopSignal: own('StopSignal'),
    Healthcheck: ownHealth(cfg.Healthcheck, img.Healthcheck),
    Hostname: shared || cfg.Hostname === String(c.Id).slice(0, 12) ? null : cfg.Hostname,
    ...pick(cfg, ['Domainname', 'Tty', 'OpenStdin', 'StdinOnce', 'AttachStdin', 'StopTimeout']),
    // The network mode only where it is the network itself; otherwise the networks below say it.
    NetworkMode: shared || mode === 'none' ? mode : null,
    Networks: networksOf(c),
    HostConfig: pick(h, ['Binds', 'Privileged', 'CapAdd', 'CapDrop', 'Devices', 'DeviceRequests', 'DeviceCgroupRules', 'PortBindings', 'PublishAllPorts',
      'RestartPolicy', 'AutoRemove', 'Memory', 'MemoryReservation', 'MemorySwap', 'MemorySwappiness', 'NanoCpus', 'CpuShares', 'CpuQuota', 'CpuPeriod', 'CpusetCpus', 'CpusetMems',
      'BlkioWeight', 'PidsLimit', 'OomKillDisable', 'OomScoreAdj', 'SecurityOpt', 'ExtraHosts', 'Dns', 'DnsSearch', 'DnsOptions', 'Tmpfs', 'Sysctls', 'Ulimits', 'LogConfig',
      'PidMode', 'IpcMode', 'UTSMode', 'UsernsMode', 'CgroupnsMode', 'CgroupParent', 'ShmSize', 'Init', 'GroupAdd', 'ReadonlyRootfs', 'Links', 'VolumesFrom', 'Runtime',
      'Isolation', 'VolumeDriver', 'StorageOpt', 'Annotations']),
  };
}

// Mounts as "type name-or-source -> destination (ro)".
const mountsOf = (c: any) => (c?.Mounts || []).map((m: any) => `${m.Type} ${m.Type === 'volume' ? m.Name : m.Source} -> ${m.Destination}${m.RW === false ? ' (read-only)' : ''}`);

// Whether `actual` holds everything `want` has: a list holds every entry, an object every key with
// a value that holds, anything else is equal.
function holds(actual: unknown, want: unknown): boolean {
  const a = norm(actual), w = norm(want);
  if (w === null) return true;
  if (Array.isArray(w)) return Array.isArray(a) && w.every(x => a.some(y => JSON.stringify(y) === JSON.stringify(x)));
  if (typeof w === 'object') return !!a && typeof a === 'object' && !Array.isArray(a) && Object.entries(w as object).every(([k, v]) => holds((a as Record<string, unknown>)[k], v));
  return JSON.stringify(a) === JSON.stringify(w);
}

// What the copy (inspected, created, not started) lacks of the old container's own settings, by
// name; empty when it is faithful. Each setting is checked against what the old container had and
// what the copy actually has, not against the new image's defaults: a value the new image happens
// to share is still there. Settings of the host and the networks must be equal; a mount the new
// image adds (a new VOLUME) is fine, one the old container had and the copy lacks is not.
export function cloneDiff(old: any, oldImage: any, copy: any): string[] {
  const want = ownSettings(old, oldImage);
  const cfg = copy?.Config || {};
  const out: string[] = [];
  const env = new Set<string>(cfg.Env || []);
  if ((want.Env as string[]).some(e => !env.has(e))) out.push('Env');
  if (!holds(cfg.Labels, want.Labels)) out.push('Labels');
  const wantEntry = want.Entrypoint as string[] | null;
  if (wantEntry !== null && (wantEntry[0] === '(none)' && wantEntry.length === 1 ? norm(cfg.Entrypoint) !== null : !same(cfg.Entrypoint, wantEntry))) out.push('Entrypoint');
  if (want.Cmd !== null && !same(cfg.Cmd, want.Cmd)) out.push('Cmd');
  for (const k of ['WorkingDir', 'User', 'StopSignal']) if (want[k] !== null && !same(cfg[k], want[k])) out.push(k);
  if (!holds(cfg.Healthcheck, want.Healthcheck)) out.push('Healthcheck');
  const now = ownSettings(copy, null);
  if (!same(now.Hostname, want.Hostname)) out.push('Hostname');
  for (const k of ['Domainname', 'Tty', 'OpenStdin', 'StdinOnce', 'AttachStdin', 'StopTimeout']) if (!same(cfg[k], want[k])) out.push(k);
  if (!same(now.NetworkMode, want.NetworkMode)) out.push('NetworkMode');
  if (!same(now.Networks, want.Networks)) out.push('Networks');
  const ha = want.HostConfig as Record<string, unknown>, hb = now.HostConfig as Record<string, unknown>;
  for (const k of Object.keys(ha)) if (!same(ha[k], hb[k])) out.push(k);
  const had = new Set<string>(mountsOf(copy));
  const lost = mountsOf(old).filter((m: string) => !had.has(m));
  if (lost.length) out.push(`mounts (${lost.join(', ')})`);
  return out;
}
