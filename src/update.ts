// "Update image": pull a container's image again and, if it changed, recreate the container with the
// same settings. A container kontainers created is made again from the settings it was created
// with; any other (compose, docker run) is copied whole, as clone.ts describes.

import { Docker, DockerError, type CreateSpec } from './docker';
import * as v from './validate';
import { cloneBody, cloneDiff, cloneRefusal, composeImageLabel, imageDoubts } from './clone';

// Edit settings: only containers kontainers created; compose owns its containers' settings.
export function editable(c: any): string | null {
  const labels = c?.Config?.Labels || {};
  if (labels['com.docker.compose.project']) return 'this container belongs to a compose project; change it in the compose file and run docker compose up -d';
  if (labels['kontainers.managed'] !== 'true') return 'only containers created in kontainers can be edited here';
  const mode = String(c?.HostConfig?.NetworkMode || '');
  if (mode === 'host' || mode.startsWith('container:')) return `it uses ${mode === 'host' ? "the host's network" : "another container's network"}, which kontainers does not set up, so it cannot be recreated here; recreate it with docker`;
  return null;
}

// How Update image recreates a container: from the settings kontainers made it with, or by copying.
export const recreatedBy = (c: any): 'spec' | 'clone' => {
  const labels = c?.Config?.Labels || {};
  return labels['kontainers.managed'] === 'true' && !labels['com.docker.compose.project'] ? 'spec' : 'clone';
};

// Why Update image cannot handle `c`, or null. others: every other container, inspected (a copy
// must not cut off containers that share its namespaces); without it that is not checked.
export function updatable(c: any, others: any[] = []): string | null {
  return recreatedBy(c) === 'spec' ? editable(c) : cloneRefusal(c, others);
}

// Every container but `id`, inspected, a few at a time. One that went away meanwhile is left out.
export async function inspectOthers(docker: Docker, id: string): Promise<any[]> {
  const list = (await docker.listContainers()).filter(c => String(c.Id) !== String(id));
  const out: any[] = [];
  for (let i = 0; i < list.length; i += 16) {
    const got = await Promise.all(list.slice(i, i + 16).map(c => docker.inspect(c.Id).catch(() => null)));
    for (const g of got) if (g) out.push(g);
  }
  return out;
}

const sameList = (a: unknown, b: unknown) => JSON.stringify(a || []) === JSON.stringify(b || []);

// The settings the user gave, recovered from the container and the image it was created from:
// image defaults (ENV, CMD) are left out so the new image's own defaults apply.
export function recreateSpec(c: any, oldImage: any): CreateSpec {
  const imgEnv = new Set<string>(oldImage?.Config?.Env || []);
  const cmd = c.Config?.Cmd && !sameList(c.Config.Cmd, oldImage?.Config?.Cmd) ? c.Config.Cmd : undefined;
  const ports: NonNullable<CreateSpec['ports']> = [];
  for (const [key, binds] of Object.entries(c.HostConfig?.PortBindings || {}) as [string, any[]][]) {
    const [port, proto] = key.split('/');
    for (const b of binds || []) {
      // An empty HostIp means all interfaces; keep it that way rather than narrowing to 127.0.0.1.
      ports.push({ container: Number(port), host: Number(b.HostPort), hostIp: b.HostIp || '0.0.0.0', protocol: proto === 'udp' ? 'udp' : 'tcp' });
    }
  }
  // The container's actual mounts, not only the ones it was created with: an image's VOLUME gets an
  // anonymous volume that appears only here. Leaving it out lost its data on every update.
  const volumes: NonNullable<CreateSpec['volumes']> = [];
  const seen = new Set<string>();
  for (const m of c.Mounts || []) {
    if ((m.Type !== 'volume' && m.Type !== 'bind') || seen.has(m.Destination)) continue;
    seen.add(m.Destination);
    volumes.push({ source: m.Type === 'volume' ? m.Name : m.Source, target: m.Destination, readOnly: m.RW === false });
  }
  for (const m of c.HostConfig?.Mounts || []) {
    if (seen.has(m.Target) || (m.Type && m.Type !== 'volume' && m.Type !== 'bind')) continue;
    seen.add(m.Target);
    volumes.push({ source: m.Source, target: m.Target, readOnly: !!m.ReadOnly });
  }
  const restart = c.HostConfig?.RestartPolicy?.Name;
  return {
    name: String(c.Name || '').replace(/^\//, ''),
    image: c.Config?.Image,
    cmd,
    env: (c.Config?.Env || []).filter((e: string) => !imgEnv.has(e)),
    ports,
    volumes,
    restart: ['no', 'always', 'unless-stopped', 'on-failure'].includes(restart) ? restart : 'no',
  };
}

export interface UpdateOptions {
  // After starting the new container, watch it this long; if it stops, restarts or turns unhealthy,
  // put the old one back. 0 checks only that it starts.
  settleMs?: number;
  // With a healthcheck, how long after settling to wait for "healthy" before giving up.
  healthTimeoutMs?: number;
  // An image ID not to update to (one that failed before); the container is left as it is.
  skipImage?: string | null;
  sleep?: (ms: number) => Promise<void>;
  // Aborted when kontainers shuts down: a replacement still being watched is undone, so it is not
  // left half done and unwatched.
  signal?: AbortSignal;
  // Install only this registry digest (one that waited out the automatic-update delay): when the
  // tag has moved on to a newer one since, nothing changes.
  expectDigest?: string;
  // The event watcher's answer to "did someone stop or kill this container?"
  wasStopped?: (id: string) => boolean;
  // Where a replacement in progress is written down, so a restart in the middle can finish it.
  journal?: Journal;
}

export interface Journal {
  // false: it could not be written (a full data volume).
  begin(name: string, oldId: string, wasRunning: boolean): boolean | void;
  // kontainers is putting the old container back: what follows (its own kills) is not a stop
  // someone asked for.
  rollingBack?(name: string): void;
  end(name: string): void;
  all(): { name: string; old_id: string; was_running: number; at: number; rollback?: number }[];
}

export interface UpdateResult { changed: boolean; message: string; oldImage: string; newImage: string; held?: boolean; id: string; note?: string | null; running?: boolean }

// The update failed and the old container was put back; newImage is the image that failed.
export class UpdateFailed extends v.ValidationError {
  // held: the new image itself failed (it ran and then stopped or turned unhealthy).
  constructor(message: string, public newImage: string | null, public held = false) { super(message); }
}

// Why a just-started container is not good, or null while it looks fine. "starting" health is fine
// until the caller stops waiting.
export function settleProblem(c: any): string | null {
  const st = c?.State || {};
  if (st.Restarting) return `the new container is restarting (exit code ${st.ExitCode ?? '?'})`;
  if (!st.Running) return `the new container stopped${st.OOMKilled ? ' (out of memory)' : ''} with exit code ${st.ExitCode ?? '?'}`;
  if ((c.RestartCount ?? 0) > 0) return `the new container restarted ${c.RestartCount} time${c.RestartCount === 1 ? '' : 's'}`;
  if (st.Health?.Status === 'unhealthy') return 'the new container is unhealthy';
  return null;
}

export class Interrupted extends v.ValidationError {}

// Watches a container that runs now, as an update watches its new container: null if it is good,
// or why not.
export async function watchRunning(docker: Docker, id: string, opts: UpdateOptions): Promise<{ problem: string | null; note?: string }> {
  return watchNew(docker, id, opts, Date.now() / 1000 - 1);
}

// Signals sent to a running process to make it do something, not to end it: a kill event with one
// of these (docker kill -s HUP for a reload, USR1 to reopen logs) is not a stop.
const NOT_ENDING = new Set(['1', '10', '12', '28', 'HUP', 'USR1', 'USR2', 'WINCH', 'SIGHUP', 'SIGUSR1', 'SIGUSR2', 'SIGWINCH']);
export const endingSignal = (signal: unknown) => !NOT_ENDING.has(String(signal ?? '').toUpperCase());

// True if someone stopped or killed the container on purpose (docker stop, docker restart, a
// backup script): then its stopping says nothing about the image. `live` is the event watcher's
// record (no clock involved: the container ID is new); the daemon's past events are asked too, in
// case the watcher is not connected. Docker sends the container's own stop signal (SIGTERM,
// SIGQUIT, SIGINT...) and a stop event after it.
async function stoppedOnPurpose(docker: Docker, id: string, sinceSec: number, opts: UpdateOptions): Promise<boolean> {
  if (opts.wasStopped?.(id)) return true;
  if (opts.wasStopped) { await (opts.sleep ?? Bun.sleep)(300); if (opts.wasStopped(id)) return true; }
  // A minute's margin for a daemon whose clock is behind ours; one second's wait at most after.
  const evs = await docker.pastEvents({ container: [id], event: ['kill', 'stop'] }, sinceSec - 60, Date.now() / 1000 + 1).catch(() => []);
  return evs.some(e => (e.Action ?? e.status) === 'stop' || endingSignal(e.Actor?.Attributes?.signal));
}

// Why the new container is not good, or null if it is. A stop someone asked for is not a problem:
// the container is left as they left it. `note` says so.
async function watchNew(docker: Docker, id: string, opts: UpdateOptions, sinceSec: number): Promise<{ problem: string | null; note?: string }> {
  const sleep = opts.sleep ?? ((ms: number) => Bun.sleep(ms));
  const pause = async (ms: number) => {
    await sleep(ms);
    if (opts.signal?.aborted) throw new Interrupted('kontainers was stopped while the new container was being watched');
  };
  const judge = async (c: any): Promise<{ problem: string | null; note?: string } | null> => {
    const p = settleProblem(c);
    if (!p) return null;
    if (!c.State?.Running && !c.State?.Restarting && await stoppedOnPurpose(docker, id, sinceSec, opts)) {
      return { problem: null, note: 'it was stopped by someone (docker stop or restart) while it settled, and is left as it is' };
    }
    return { problem: p };
  };
  const settle = opts.settleMs ?? 0;
  for (let waited = 0; waited < settle; waited += 1000) {
    await pause(Math.min(1000, settle - waited));
    const j = await judge(await docker.inspect(id));
    if (j) return j;
  }
  let c = await docker.inspect(id);
  const j = await judge(c);
  if (j) return j;
  // With a healthcheck, an update counts only once the container reports healthy.
  for (let waited = 0; c.State?.Health?.Status === 'starting' && waited < (opts.healthTimeoutMs ?? 0); waited += 1000) {
    await pause(1000);
    c = await docker.inspect(id);
    const q = await judge(c);
    if (q) return q;
  }
  // Without a wait for health (Update image and Edit by hand), "starting" is fine: Docker's first
  // check comes after its interval, 30 s by default, and a healthy image would always be rolled back.
  if (c.State?.Health?.Status === 'starting' && (opts.healthTimeoutMs ?? 0) > 0) return { problem: 'the new container did not become healthy in time' };
  return { problem: null };
}

export async function updateContainer(docker: Docker, id: string, opts: UpdateOptions = {}): Promise<string> {
  return (await updateContainerDetailed(docker, id, opts)).message;
}

// When an update does not install the image it pulled (it failed, or that image is held back or
// newer than the one that waited out the delay), the tag is pointed back at the image the
// container runs: otherwise a `docker compose up -d` would install the pulled one unwatched. Not
// when another container already runs the pulled image (compose would then recreate that one).
async function tagBack(docker: Docker, ref: string, oldImage: string, pulled: string): Promise<void> {
  if (pulled === oldImage || ref.includes('@')) return;
  try {
    if ((await docker.listContainers()).some(x => x.ImageID === pulled)) return;
    await docker.tag(oldImage, ref);
  } catch (e) { console.error(`kontainers: could not point ${ref} back at ${oldImage.slice(7, 19)}: ${(e as Error).message}`); }
}

const platformOf = (img: any) => (img?.Os && img?.Architecture ? `${img.Os}/${img.Architecture}${img.Variant ? `/${img.Variant}` : ''}` : null);

export async function updateContainerDetailed(docker: Docker, id: string, opts: UpdateOptions = {}): Promise<UpdateResult> {
  const first = await docker.inspect(id);
  const how = recreatedBy(first);
  // A copy is made from everything the daemon knows about the container.
  const c = how === 'clone' ? await docker.inspectFull(first.Id) : first;
  const refusal = updatable(c, how === 'clone' ? await inspectOthers(docker, c.Id) : []);
  if (refusal) throw new v.ValidationError(refusal);
  const name = String(c.Name).replace(/^\//, '');
  const ref = c.Config.Image as string;
  // The image the container was made from, before the pull: its ENV and CMD tell the image's own
  // settings apart from the user's. A docker build that reused the tag can have deleted it; then
  // the two cannot be told apart, and guessing would copy the old image's settings into the new
  // container, so the update is refused.
  const oldImage = await (how === 'clone' ? docker.inspectImageFull(c.Image) : docker.inspectImage(c.Image)).catch(() => null);
  if (!oldImage) throw new v.ValidationError(`the image ${name} was created from is no longer on this host (was ${ref} rebuilt?), so its settings cannot be told apart from the image's; ${how === 'spec' ? 'use Edit settings to recreate it' : 'recreate it with docker compose up -d or docker'}`);

  // The platform the container runs, so one emulated on this host is not moved to the native one.
  const platform = platformOf(oldImage);
  try {
    await docker.pull(ref, platform);
  } catch (e) {
    // Built (docker compose build) or loaded on this host: a login hint would only mislead.
    if (!(oldImage.RepoDigests || []).length && /pull access denied|repository does not exist|not found|manifest unknown|unauthorized|denied/i.test((e as Error).message)) {
      throw new v.ValidationError(`${ref} was built or loaded on this host, and its registry does not have it, so there is nothing to update to; rebuild it (docker compose build) and recreate the container`);
    }
    throw e;
  }
  const fresh = await (how === 'clone' ? docker.inspectImageFull(ref) : docker.inspectImage(ref));
  if (fresh.Id === c.Image) return { changed: false, message: `${name} already runs the newest ${ref}.`, oldImage: c.Image, newImage: fresh.Id, id: c.Id };
  if (opts.expectDigest && !(fresh.RepoDigests || []).some((d: string) => d.endsWith('@' + opts.expectDigest))) {
    await tagBack(docker, ref, c.Image, fresh.Id);
    return { changed: false, message: `${name} was not updated: ${ref} has moved on to an image newer than the one that waited out the delay, and that one waits its own delay.`, oldImage: c.Image, newImage: fresh.Id, id: c.Id };
  }
  if (opts.skipImage && fresh.Id === opts.skipImage) {
    await tagBack(docker, ref, c.Image, fresh.Id);
    return { changed: false, held: true, message: `${name} was not updated: this image of ${ref} failed before.`, oldImage: c.Image, newImage: fresh.Id, id: c.Id };
  }

  // kontainers never sets the user of a container it creates: that one is always the image's.
  const doubts = imageDoubts(c, oldImage, fresh);
  if (how === 'spec') doubts.refuse = doubts.refuse.filter(d => !d.startsWith('the user'));
  if (doubts.refuse.length) {
    await tagBack(docker, ref, c.Image, fresh.Id);
    throw new UpdateFailed(`${name} was not updated: the new image changes ${doubts.refuse.join(' and ')}, and the container has the old image's value, which may have been set on purpose (in a compose file, say). kontainers cannot tell, so it does not guess: update it with docker compose pull && docker compose up -d, or recreate it with the value it should have`, fresh.Id, true);
  }
  try {
    const taken = doubts.taken;
    const composeImage = composeImageLabel(String(c.Config?.Labels?.['com.docker.compose.image'] ?? ''), oldImage, fresh);
    const r = how === 'spec'
      ? await replaceContainer(docker, c, recreateSpec(c, oldImage), { ...opts, keepBindMounts: true }, 'update')
      : await replaceContainer(docker, c, { name, image: ref }, { ...opts, clone: { body: cloneBody(c, oldImage, composeImage), oldImage, newImage: fresh, platform } }, 'update');
    const extra = [r.note, taken.length ? `it now has the new image's value of ${taken.join(', ')}, which the old one had from its image (or set to the same value)` : null].filter(Boolean).join('; ');
    return { changed: true, message: `Updated ${name} to the newest ${ref}${r.running ? '' : '; it was stopped and is left stopped'}${extra ? `; ${extra}` : ''}.`, oldImage: c.Image, newImage: fresh.Id, id: r.id, note: extra || null, running: r.running };
  } catch (e) {
    await tagBack(docker, ref, c.Image, fresh.Id);
    const stage = (e as { stage?: string }).stage;
    // A copy that could not be made faithfully is held back like an image that failed: trying it
    // again at every check would only say the same.
    throw new UpdateFailed((e as Error).message, fresh.Id, stage === 'settle' || stage === 'verify');
  }
}

// Replaces container `c` (inspected) with a new one made from `spec`, under the same name and on
// the same networks: stop, set the old one aside under another name, create, connect, start and
// watch. On any failure the new container is removed and the old one is put back and started
// again. Returns the new container's ID, and a note when something worth saying happened (it was
// stopped on purpose while it settled). `what` names the operation in error messages.
export interface Replaced { id: string; note: string | null; running: boolean }

// The aliases and fixed addresses a container has on a network, as connect takes them. Docker adds
// the short container ID (and on newer versions the name) as aliases itself; those are left out.
export interface Endpoint { Aliases?: string[]; IPAMConfig?: Record<string, unknown>; Links?: string[]; DriverOpts?: Record<string, string> }
export function endpointOf(c: any, ep: any): Endpoint {
  const own = new Set([String(c.Id || '').slice(0, 12), String(c.Name || '').replace(/^\//, ''), String(c.Config?.Hostname || '')]);
  const out: Endpoint = {};
  const aliases = (ep?.Aliases || []).filter((a: string) => a && !own.has(a));
  if (aliases.length) out.Aliases = aliases;
  const ipam: Record<string, unknown> = {};
  for (const k of ['IPv4Address', 'IPv6Address']) if (ep?.IPAMConfig?.[k]) ipam[k] = ep.IPAMConfig[k];
  if (ep?.IPAMConfig?.LinkLocalIPs?.length) ipam.LinkLocalIPs = ep.IPAMConfig.LinkLocalIPs;
  if (Object.keys(ipam).length) out.IPAMConfig = ipam;
  // Links on a user network (compose links:, docker run --link with --network) and driver options.
  if (ep?.Links?.length) out.Links = ep.Links;
  if (ep?.DriverOpts && Object.keys(ep.DriverOpts).length) out.DriverOpts = ep.DriverOpts;
  return out;
}

// How a replacement for `c` gets c's networks: made on the default bridge when c is on it, else on
// c's first network (or none), then connected to the rest. The host's network and another
// container's cannot be recreated by kontainers, which never creates such containers.
// disconnect: a network to leave after creating it, for a container that had been disconnected from
// every network: it is made on its own network mode and taken off it, so it can be connected later
// (a container made with --network none can never be).
export function networkPlan(c: any): { network?: { mode: string; endpoint?: Endpoint }; connect: [string, Endpoint][]; disconnect?: string } {
  const mode = String(c.HostConfig?.NetworkMode || 'default');
  if (mode === 'host' || mode.startsWith('container:')) throw new v.ValidationError(`it uses ${mode === 'host' ? "the host's network" : "another container's network"}, which kontainers does not set up; recreate it with docker`);
  const nets = Object.entries(c.NetworkSettings?.Networks || {}) as [string, any][];
  if (mode === 'none') return { network: { mode: 'none' }, connect: [] };
  if (!nets.length) return mode === 'default' || mode === 'bridge' ? { connect: [], disconnect: 'bridge' } : { network: { mode }, connect: [], disconnect: mode };
  const onBridge = nets.some(([n]) => n === 'bridge');
  const rest = nets.filter(([n]) => n !== 'bridge').map(([n, ep]) => [n, endpointOf(c, ep)] as [string, Endpoint]);
  if (onBridge) return { connect: rest };
  // Docker lists networks by name, not in the order they were joined: the one the container was
  // made on is its network mode, when it is still on it.
  const first = rest.find(([n]) => n === mode) ?? rest[0];
  return { network: { mode: first[0], endpoint: first[1] }, connect: rest.filter(r => r !== first) };
}

// clone: a copy of a container kontainers did not create (clone.ts): its create body, and the old
// and new images, to compare the copy with the old container before it starts.
export interface CloneJob { body: Record<string, any>; oldImage: any; newImage: any; platform?: string | null }

export async function replaceContainer(docker: Docker, c: any, spec: CreateSpec, opts: UpdateOptions & { keepBindMounts?: boolean; allowedBinds?: { source: string; readOnly: boolean }[]; clone?: CloneJob }, what: string): Promise<Replaced> {
  const name = String(c.Name).replace(/^\//, '');
  const mode = String(c.HostConfig?.NetworkMode || '');
  // A copy keeps the host's network or another container's as it is: nothing to connect.
  const sharedNet = !!opts.clone && (mode === 'host' || mode.startsWith('container:'));
  let plan: ReturnType<typeof networkPlan>;
  try { plan = sharedNet ? { connect: [] } : networkPlan(c); } catch (e) { throw new v.ValidationError(`${what} is not possible for ${name}: ${(e as Error).message}`); }
  const wasRunning = !!c.State?.Running;
  const createOpts = { keepBindMounts: opts.keepBindMounts, allowedBinds: opts.allowedBinds, replaces: String(c.Id), network: plan.network };
  // Docker names are at most 128 characters.
  const aside = `${name.slice(0, 128 - 13)}-old-${String(c.Id).slice(0, 8)}`;
  let cloneBodyNet: Record<string, any> | null = null;
  if (opts.clone) {
    cloneBodyNet = { ...opts.clone.body, HostConfig: { ...opts.clone.body.HostConfig } };
    if (!sharedNet) {
      cloneBodyNet.HostConfig.NetworkMode = plan.network?.mode ?? plan.disconnect ?? (mode === 'default' ? 'default' : 'bridge');
      const ep = plan.network?.endpoint;
      if (plan.network && plan.network.mode !== 'none' && ep && Object.keys(ep).length) cloneBodyNet.NetworkingConfig = { EndpointsConfig: { [plan.network.mode]: ep } };
    }
  } else {
    // Bad input fails here, before the old container is touched: the settings, and an image that is
    // not on this host (a typo, or Pull left unticked).
    docker.createBody({ ...spec, name }, createOpts);
  }
  try {
    await docker.inspectImage(spec.image);
  } catch (e) {
    if ((e as { status?: number })?.status === 404) throw new v.ValidationError(`the image ${spec.image} is not on this host; tick "Pull the image first" or pull it on the Images page. Nothing was changed`);
    throw e;
  }
  for (const [n] of plan.connect) v.ref(n, 'network');
  const shutting = () => new Interrupted('kontainers is shutting down, so nothing was changed');
  if (opts.signal?.aborted) throw shutting();
  // An earlier replacement of this name that a restart interrupted, not tidied up yet: its record
  // would be overwritten and its old container left without one.
  const open = (() => { try { return opts.journal?.all().find(r => r.name === name && r.old_id !== c.Id) ?? null; } catch { return null; } })();
  const sameOpen = (() => { try { return opts.journal?.all().find(r => r.name === name && r.old_id === c.Id && r.was_running && !c.State?.Running) ?? null; } catch { return null; } })();
  if (sameOpen) throw new v.ValidationError(`${name} was stopped by an update or edit that a restart interrupted, and kontainers is about to start it again; try again in a minute`);
  if (open && await docker.inspect(open.old_id).then(() => true, () => false)) {
    throw new v.ValidationError(`an earlier update or edit of ${name} was interrupted and its old container (${String(open.old_id).slice(0, 12)}) is not tidied up yet; kontainers tries again shortly, or remove it by hand`);
  }

  // A copy is made and checked while the old container still runs (it is only renamed), and is
  // found again after a crash only through the journal: without the record it does not go ahead.
  const written = opts.journal ? opts.journal.begin(name, c.Id, wasRunning) : true;
  if (opts.clone && written === false) throw new v.ValidationError(`${what} of ${name} did not go ahead: kontainers could not write down what it is replacing (is the data volume full?), and without that a crash in the middle could leave it down. Nothing was changed`);
  // The container's own stop timeout (stop_grace_period), as docker compose would use it.
  const stopOld = () => docker.stop(c.Id, c.Config?.StopTimeout ?? null);
  let oldStopped = false;
  if (wasRunning && !opts.clone) {
    try { await stopOld(); oldStopped = true; } catch (e) { opts.journal?.end(name); throw e; }
  }
  // Stopping can take the container's whole stop timeout; kontainers may have been told to stop
  // meanwhile.
  if (opts.signal?.aborted) {
    if (oldStopped) await docker.start(c.Id).catch(() => {});
    opts.journal?.end(name);
    throw shutting();
  }
  try {
    await docker.rename(c.Id, aside);
  } catch (e) {
    if (oldStopped) await docker.start(c.Id).catch(() => {});
    opts.journal?.end(name);
    throw new v.ValidationError(`${what} failed before anything changed (could not rename the old container to ${aside}): ${(e as Error).message}`);
  }
  let newId: string | null = null;
  // Where it failed: only a container that started and then stopped, restarted or turned unhealthy
  // says something about the image ("settle"), or a copy that was not faithful ("verify"); the
  // rest can be the host (a port in use, say).
  let stage = 'create';
  let note: string | null = null;
  const check = () => { if (opts.signal?.aborted) throw new Interrupted('kontainers was stopped during the replacement'); };
  try {
    check();
    newId = (cloneBodyNet ? await docker.createCopy(name, cloneBodyNet, opts.clone?.platform) : await docker.create({ ...spec, name }, createOpts)).Id;
    for (const [n, ep] of plan.connect) await docker.connect(n, newId, ep);
    if (plan.disconnect) await docker.disconnect(plan.disconnect, newId);
    if (opts.clone) {
      // The copy must have every setting the old container had, before the old one stops.
      const diff = cloneDiff(c, opts.clone.oldImage, await docker.inspectFull(newId));
      if (diff.length) { stage = 'verify'; throw new v.ValidationError(`the new container's settings would differ from the old one's (${diff.join('; ')}); kontainers cannot copy this container faithfully, so recreate it with docker compose or docker`); }
      if (wasRunning) { check(); stage = 'stop'; await stopOld(); oldStopped = true; }
      check();
    }
    if (wasRunning) {
      check();
      stage = 'start';
      const since = Date.now() / 1000 - 1;
      await docker.start(newId);
      stage = 'settle';
      const w = await watchNew(docker, newId, opts, since);
      if (w.problem) throw new v.ValidationError(w.problem);
      note = w.note ?? null;
    }
  } catch (e) {
    if (e instanceof Interrupted) stage = 'interrupted';
    // Each step of putting the old container back is checked: a message that says it is back must
    // be true.
    const wrong: string[] = [];
    const why = (err: unknown) => (err as Error)?.message || String(err);
    try { opts.journal?.rollingBack?.(name); } catch { /* the entry stays as it was */ }
    const removed = !newId || await docker.remove(newId, true).then(() => true, err => { wrong.push(`the new container could not be removed (${why(err)})`); return false; });
    const renamed = await docker.rename(c.Id, name).then(() => true, err => { wrong.push(`the old container could not get its name back and is still ${aside} (${why(err)})`); return false; });
    // Never two copies on the same data: the old one starts again only once the new one is gone.
    if (wasRunning && removed) await docker.start(c.Id).catch(err => wrong.push(`the old container could not be started again (${why(err)})`));
    else if (wasRunning) wrong.push('so the old container was not started again');
    if (renamed && !wrong.length) opts.journal?.end(name);
    const msg = e instanceof DockerError || e instanceof v.ValidationError ? e.message : 'internal error';
    throw Object.assign(new v.ValidationError(wrong.length
      ? `${what} failed (${msg}), and putting the old container back went wrong: ${wrong.join('; ')}`
      : !oldStopped && wasRunning ? `${what} did not go ahead, and the old container kept running: ${msg}`
      : `${what} failed, so the old container was put back: ${msg}`), { stage });
  }
  const removedOld = await docker.remove(c.Id, false).then(() => true, err => { console.error(`kontainers: could not remove ${aside}: ${(err as Error).message}`); return false; });
  // A copy's old container left over is known only by the journal entry: it stays until the next
  // start's tidy-up removes it (or someone does), so it is not taken for a container of its own.
  if (removedOld || !opts.clone) opts.journal?.end(name);
  return { id: newId, note, running: wasRunning };
}

// After a restart in the middle of a replacement (kontainers stopped while an update or an edit
// ran), things can be left half done. The journal says which containers were being replaced,
// whether they were running, and whether kontainers was already putting the old one back. Each
// name is handled under its own lock, with its journal entry read again under it, from a fresh
// listing; names are handled at the same time.
//
// A container is removed only on clear evidence; when the evidence is not clear, both are left and
// the note says to check them by hand. With the old container set aside as <name>-old-<id> and its
// replacement (labelled kontainers.replaces=<old ID>) under the name:
//   replacement                       outcome
//   ----------------------------      -----------------------------------------------------------
//   kontainers was rolling back       the old one comes back
//   dead, or created (never started)  the old one comes back (a created one is kept, the old one
//     and the old one was running     going, only when the old one was stopped too and the new one
//                                     got all its networks)
//   removing                          tried again later
//   running, update began recently    watched as the update would have: good, it stays and the
//                                     old one goes; bad, the old one comes back, image held back
//   restarting, recently              the old one comes back, image held back
//   exited, recently                  someone stopped it: it stays as they left it; the old one
//                                     was stopped too: it stays; a stop's exit code (0, 130, 137,
//                                     143) that the daemon cannot explain: both are left for a look
//                                     by hand; any other: the old one comes back, the image held
//                                     back only if the daemon remembers no stop of it
//   paused                            both are left for a look by hand
//   running, long ago                 looked at once: no sign of trouble, it stays; any sign (it
//                                     restarted, is unhealthy, stopped), both are left by hand
//   restarting or exited, long ago    both are left for a look by hand
// The old container is stopped first only while its replacement runs (the two must not share the
// data), and started again only if it was running.
// Nothing with the name: the old one is put back. Not set aside, but stopped for the replacement
// (after it began, or while kontainers was rolling back): started again.
// Without a journal entry (another kontainers on this host may be in the middle of its own update,
// or the entry could not be written), only "nothing has the name" is acted on.
// A journal entry is crossed out only once its name is settled; a look by hand keeps it (the next
// start settles it once one container is gone); anything else comes back with retry set, and on
// the final attempt as a note to check by hand (the entry kept for the next start). take(name): the name's lock, or null while a replacement of it runs now.
// kept(name, id): the container that stays under the name. more: watch(id) watches a running
// replacement; held(name, image) holds an image back (false if not opted in); windowMs: how recent
// an update counts as recent; report(r): each outcome as it is reached; signal: shutdown.
export interface Recovered { name: string; text: string; trouble: boolean; retry?: boolean }
export interface RecoverMore {
  watch?: (id: string) => Promise<{ problem: string | null; note?: string }>;
  held?: (name: string, image: string) => boolean;
  windowMs?: number;
  report?: (r: Recovered) => void;
  signal?: AbortSignal;
}
export async function recoverInterrupted(docker: Docker, kept: (name: string, id: string) => void = () => {}, journal?: Journal, take: (name: string) => (() => void) | null = () => () => {}, final = false, more: RecoverMore = {}): Promise<Recovered[]> {
  const out: Recovered[] = [];
  const push = (r: Recovered) => { out.push(r); more.report?.(r); };
  const ASIDE = /^(.+)-old-([0-9a-f]{8})$/;
  const nameOf = (c: any) => String(c.Names?.[0] || '').replace(/^\//, '');
  const readRows = () => { try { return journal?.all() ?? []; } catch { return []; } };
  // A container set aside as <name>-old-<id>: one kontainers created, or any container (a copied
  // one, from compose or docker run) that a journal entry names as the one it set aside. Without
  // an entry, the name alone is never enough for one kontainers did not create.
  const journalled = new Set(readRows().map(r => String(r.old_id)));
  const asideOf = (c: any, oldId?: string) => {
    const m = ASIDE.exec(nameOf(c));
    if (!m || !String(c.Id).startsWith(m[2])) return null;
    return c.Labels?.['kontainers.managed'] === 'true' || String(c.Id) === oldId || journalled.has(String(c.Id)) ? m : null;
  };
  const endRow = (n: string) => { try { journal?.end(n); } catch { /* written again at the next replacement */ } };
  const later = (base: string, text: string) => push(final
    ? { name: base, trouble: true, text: `${text}; kontainers gave up trying for now (it looks again at its next start), so check them by hand` }
    : { name: base, trouble: true, retry: true, text: `${text}; kontainers tries again shortly` });
  // Names whose old container this tidy-up stopped (it ran beside its replacement).
  const stoppedOld = new Set<string>();
  const byHand = (base: string, text: string) => push({ name: base, trouble: true, text: `${text}; both are left${stoppedOld.has(base) ? ' (the old one stopped, so the two do not share data)' : ' as they are'}, so check them by hand; automatic updates of it wait until one of them is gone` });
  const runs = (st: string) => st === 'running' || st === 'restarting' || st === 'paused';

  const first = await docker.listContainers();
  const rows0 = readRows();
  const bases = new Set(rows0.map(r => r.name));
  for (const c of first) { const m = asideOf(c); if (m) bases.add(rows0.find(r => String(r.old_id).startsWith(m[2]))?.name ?? m[1]); }

  // First, quickly: an old container that runs beside a running replacement (a daemon restart
  // starts both) is stopped, so no two copies share the data while the replacements are judged.
  // The stops at the same time: each can take its container's stop timeout.
  await Promise.allSettled([...bases].map(async base => {
    if (more.signal?.aborted) return;
    const release = take(base);
    if (!release) return;
    try {
      const row = readRows().find(r => r.name === base);
      if (!row) return;
      const now = first.find(x => nameOf(x) === base);
      const c = first.find(x => asideOf(x, row.old_id) && String(x.Id) === row.old_id);
      if (c && now && now.Labels?.['kontainers.replaces'] === c.Id && runs(now.State) && runs(c.State)) { await docker.stop(c.Id); stoppedOld.add(base); }
    } catch { /* judged below */ } finally { release(); }
  }));

  // Then every name at once: a watch of one replacement does not hold up the others.
  const settledAll = await Promise.allSettled([...bases].map(async base => {
    const release = take(base);
    if (!release) {
      // At the final attempt nothing is said: the entry stays for the next start.
      if (!final && readRows().some(r => r.name === base)) later(base, `${base} is being updated or edited now, so its interrupted update was not looked at`);
      return;
    }
    let row: ReturnType<typeof readRows>[number] | null = null;
    try {
      row = readRows().find(r => r.name === base) ?? null;
      if (more.signal?.aborted) { if (row) later(base, `kontainers is shutting down, so the interrupted update of ${base} was not finished`); return; }
      const list = await docker.listContainers();
      const now = list.find(x => nameOf(x) === base);
      const c = list.find(x => { const m = asideOf(x, row?.old_id); return m && (row ? String(x.Id) === row.old_id : m[1] === base); });
      const wasRunning = row ? !!row.was_running : true;

      if (!c) {
        if (!row) return;
        // A container that carries the replacement label for this entry, under any name: someone
        // sorted it out by hand (renamed the new one, say), so nothing is started.
        const replacementElsewhere = list.some(x => x.Labels?.['kontainers.replaces'] === row!.old_id && String(x.Id) !== String(now?.Id));
        const fresh = Date.now() - row.at < (more.windowMs ?? 10 * 60_000) + 10 * 60_000;
        // A rollback that did not get to start it is finished however long kontainers was down;
        // otherwise only while the entry is fresh (an entry left for a look by hand can be days old).
        // Still running, maybe only for now: a stop kontainers began before it was killed.
        const stopped = now && String(now.Id) === row.old_id && now.State === 'running' && wasRunning ? await stoppingSince(docker, now.Id, row.at, more.signal) : false;
        if (now && String(now.Id) === row.old_id && wasRunning && (now.State !== 'running' || stopped) && !replacementElsewhere && (row.rollback || fresh || stopped)) {
          // Stopped for the replacement and then nothing more, or put back by a rollback that did
          // not get to start it: started again, only while the entry is fresh. One stopped since,
          // by someone, stays stopped.
          const info = await docker.inspect(now.Id);
          const finished = Date.parse(info?.State?.FinishedAt || '') || 0;
          // Within the container's own stop timeout of the entry (and two minutes more).
          if (row.rollback || stopped || (finished >= row.at - 5000 && finished <= row.at + ((info?.Config?.StopTimeout ?? 10) + 120) * 1000)) {
            try {
              await docker.start(now.Id);
              push({ name: base, trouble: false, text: `started ${base} again: kontainers stopped while ${base} was stopped for an update or edit` });
            } catch (e) {
              // Nothing is set aside to protect: at the end the entry goes, so Edit can fix it.
              if (!final) throw e;
              push({ name: base, trouble: true, text: `could not start ${base} again after an interrupted update or edit (${(e as Error).message}); start it, or change its settings with Edit settings` });
            }
          }
        } else if (now && now.Labels?.['kontainers.replaces'] === row.old_id) {
          kept(base, now.Id); // the replacement finished; only the journal entry was left
        }
        endRow(base);
        return;
      }
      const name = nameOf(c);
      if (name.length >= 128 && !row) { push({ name, trouble: true, text: `${name} looks set aside by an interrupted update, but its name was shortened; check it by hand` }); return; }
      if (!now) {
        await docker.rename(c.Id, base);
        const stoppedNow = c.State === 'running' && row ? await stoppingSince(docker, c.Id, row.at, more.signal) : false;
        if (wasRunning && (c.State !== 'running' || stoppedNow)) await docker.start(c.Id);
        kept(base, c.Id);
        push({ name: base, trouble: false, text: `put ${base} back: an update or edit was interrupted, and no container had its name` });
        if (row) endRow(base);
        return;
      }
      if (!row) {
        // Another kontainers on this host may be in the middle of its own update.
        if (final) push({ name: base, trouble: true, text: `${name} and ${base} both exist, and kontainers has no record of replacing ${base} (another kontainers on this host may have been updating it); check them by hand` });
        else push({ name: base, trouble: true, retry: true, text: `${name} and ${base} both exist, and kontainers has no record of replacing ${base}; it looks again shortly` });
        return;
      }
      if (now.Labels?.['kontainers.replaces'] !== c.Id) { later(base, `${name} and ${base} both exist, and ${base} is not the container that replaced it`); return; }
      if (now.State === 'removing') { later(base, `${name} and ${base} both exist, and Docker is still removing ${base}`); return; }

      // Docker may have started the old one since the first look (a reboot starts restart-policy
      // containers alongside kontainers): never two copies on the same data while judging.
      if (runs(c.State) && runs(now.State)) { await docker.stop(c.Id); stoppedOld.add(base); }
      const recent = Date.now() - row.at < (more.windowMs ?? 10 * 60_000);
      // keep: the replacement stays and the old one goes; back: the old one comes back.
      let verdict: { keep: string } | { back: string; hold: boolean } | null = null;
      if (now.State === 'dead') verdict = { back: 'and the new container is dead', hold: false };
      else if (row.rollback) verdict = { back: 'while kontainers was putting the old container back', hold: false };
      else if (now.State === 'created') {
        if (wasRunning) verdict = { back: 'before the new container started', hold: false };
        else {
          // An edit of a stopped container: kept only if it got every network the old one had.
          const missing = Object.keys(c.NetworkSettings?.Networks || {}).filter(n => !(n in (now.NetworkSettings?.Networks || {})));
          verdict = missing.length ? { back: `before the new container joined ${missing.join(', ')}`, hold: false } : { keep: `the new ${base} is stopped, as ${base} was` };
        }
      } else if (now.State === 'paused') { byHand(base, `${name} and ${base} both exist, and the new ${base} was paused by someone`); return; }
      else if (now.State === 'running') {
        if (recent && more.watch) {
          const w = await more.watch(now.Id);
          if (w.problem) verdict = { back: `and when kontainers watched the new container it ${w.problem.replace(/^the new container /, '')}`, hold: true };
          else verdict = { keep: w.note ? `the new ${base} ${w.note.replace(/^it /, '')}` : `the new ${base} was watched after the restart and works` };
        } else {
          const p = settleProblem(await docker.inspect(now.Id));
          if (p) { byHand(base, `${name} and ${base} both exist; the update began a while ago and ${p}`); return; }
          verdict = { keep: `the new ${base} ran unwatched since the update began, so check that it works` };
        }
      } else if (now.State === 'restarting' || now.State === 'exited') {
        if (!recent) { byHand(base, `${name} and ${base} both exist; the update began a while ago and ${base} is ${now.State}`); return; }
        if (now.State === 'restarting') verdict = { back: 'and the new container keeps restarting', hold: true };
        else {
          const purpose = await stoppedOnPurposeSince(docker, now.Id, row.at);
          const info = await docker.inspect(now.Id);
          const code = Number(info?.State?.ExitCode ?? -1);
          // Codes a stop gives (0, 130 for SIGINT, 137 SIGKILL, 143 SIGTERM) when it was not for memory.
          const stopCode = [0, 130, 137, 143].includes(code) && !info?.State?.OOMKilled;
          if (purpose === true) verdict = { keep: `the new ${base} was stopped by someone and is left as it is` };
          else if (!wasRunning) verdict = { keep: `the new ${base} is stopped, as ${base} was` };
          // A stop by someone or by Docker going down, which the daemon may no longer remember: not
          // a reason to put the old one back or to blame the image.
          else if (stopCode && (purpose === null || code === 137 || code === 143)) { byHand(base, `${name} and ${base} both exist; the new ${base} stopped with exit code ${code}, which a docker stop or Docker going down also gives`); return; }
          // Held back only when the daemon remembers the container and no stop of it.
          else verdict = { back: `and the new container then stopped (${now.Status || `exit code ${code}`})`, hold: purpose === false };
        }
      }
      if (!verdict) { later(base, `${name} and ${base} both exist, and ${base} is ${now.State}`); return; }
      if (more.signal?.aborted) { later(base, `kontainers is shutting down, so the interrupted update of ${base} was not finished`); return; }

      if ('keep' in verdict) {
        if (c.State !== 'exited' && c.State !== 'created' && c.State !== 'dead') await docker.stop(c.Id);
        await docker.remove(c.Id, false);
        kept(base, now.Id);
        push({ name: base, trouble: false, text: `removed ${name}, left over from an interrupted update or edit of ${base}; ${verdict.keep}` });
        endRow(base);
        return;
      }
      // Held before anything is removed, and only when the image changed (an edit that kept the
      // image says nothing against it).
      const changed = !!now.ImageID && now.ImageID !== c.ImageID;
      const isHeld = verdict.hold && changed ? !!more.held?.(base, now.ImageID) : false;
      try { journal?.rollingBack?.(base); } catch { /* the entry stays as it was */ }
      if (runs(now.State)) await docker.stop(now.Id);
      await docker.remove(now.Id, now.State === 'dead');
      await docker.rename(c.Id, base);
      // A copy is made while the old container still runs: a stop of it may still be under way.
      const stoppedNow = c.State === 'running' ? await stoppingSince(docker, c.Id, row.at, more.signal) : false;
      if (wasRunning && (c.State !== 'running' || stoppedNow)) await docker.start(c.Id);
      kept(base, c.Id);
      // Held only for a container that is updated automatically; otherwise its tag now points at
      // the image that failed, and Update image would try it again.
      const after = !verdict.hold || !changed ? '' : isHeld ? '; that image is held back' : '; its tag now points at the image that failed, so Update image would try that image again';
      push({ name: base, trouble: verdict.hold || now.State !== 'created', text: `put ${base} back: an update or edit was interrupted ${verdict.back}${after}` });
      endRow(base);
    } catch (e) {
      if (e instanceof Interrupted) { if (row) push({ name: base, trouble: false, retry: true, text: `kontainers is shutting down, so the interrupted update of ${base} is finished at its next start` }); return; }
      if (row) later(base, `could not tidy up ${base} yet: ${(e as Error).message}`);
      else push({ name: base, trouble: true, text: `could not tidy up ${base}: ${(e as Error).message}` });
    } finally {
      release();
    }
  }));
  for (const r of settledAll) if (r.status === 'rejected') console.error(`kontainers: tidy-up failed: ${(r.reason as Error)?.message ?? r.reason}`);
  return out;
}

// A container that still runs, but that kontainers (or anyone) began to stop since `sinceMs`: killed
// in the middle of an update while it stopped the old container, the daemon finishes that stop on
// its own. Waits for it (its own stop timeout and a margin) and says whether it stopped; false at
// once when no stop began.
async function stoppingSince(docker: Docker, id: string, sinceMs: number, signal?: AbortSignal): Promise<boolean> {
  const evs = await docker.pastEvents({ container: [id], event: ['kill', 'stop'] }, sinceMs / 1000 - 5, Date.now() / 1000 + 1).catch(() => []);
  if (!evs.length) return false;
  const limit = ((await docker.inspect(id).catch(() => null))?.Config?.StopTimeout ?? 10) + 20;
  for (let i = 0; i < limit && !signal?.aborted; i++) {
    const x = await docker.inspect(id).catch(() => null);
    if (!x?.State?.Running) return true;
    await Bun.sleep(1000);
  }
  return false;
}

// A stop or kill of this container (with a signal that ends a process) since `sinceMs`, as far as
// the daemon still remembers.
// null when it cannot be known: the daemon could not be asked, or it does not remember the
// container being created or started (it keeps 256 events, and none from before a restart), so
// the absence of a stop says nothing.
async function stoppedOnPurposeSince(docker: Docker, id: string, sinceMs: number): Promise<boolean | null> {
  const evs = await docker.pastEvents({ container: [id], event: ['create', 'start', 'kill', 'stop'] }, sinceMs / 1000 - 60, Date.now() / 1000 + 1).catch(() => null);
  if (!evs) return null;
  const act = (e: any) => e.Action ?? e.status;
  if (evs.some(e => act(e) === 'stop' || (act(e) === 'kill' && endingSignal(e.Actor?.Attributes?.signal)))) return true;
  return evs.some(e => act(e) === 'create' || act(e) === 'start') ? false : null;
}
