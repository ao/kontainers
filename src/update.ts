// "Update image": pull a container's image again and, if it changed, recreate the container with the
// same settings. Only for containers kontainers created; compose owns its containers and would
// recreate them its own way.

import { Docker, DockerError, type CreateSpec } from './docker';
import * as v from './validate';

export function updatable(c: any): string | null {
  const labels = c?.Config?.Labels || {};
  if (labels['com.docker.compose.project']) return 'this container belongs to a compose project; update it with docker compose pull && docker compose up -d';
  if (labels['kontainers.managed'] !== 'true') return 'only containers created in kontainers can be updated here';
  return null;
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
  // The event watcher's answer to "did someone stop or kill this container?"
  wasStopped?: (id: string) => boolean;
  // Where a replacement in progress is written down, so a restart in the middle can finish it.
  journal?: Journal;
}

export interface Journal {
  begin(name: string, oldId: string, wasRunning: boolean): void;
  end(name: string): void;
  all(): { name: string; old_id: string; was_running: number }[];
}

export interface UpdateResult { changed: boolean; message: string; oldImage: string; newImage: string; held?: boolean; id: string; note?: string | null }

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

export async function updateContainerDetailed(docker: Docker, id: string, opts: UpdateOptions = {}): Promise<UpdateResult> {
  const c = await docker.inspect(id);
  const refusal = updatable(c);
  if (refusal) throw new v.ValidationError(refusal);
  const name = String(c.Name).replace(/^\//, '');
  const ref = c.Config.Image as string;
  // The image the container was made from, before the pull: its ENV and CMD tell the image's own
  // settings apart from the user's. A docker build that reused the tag can have deleted it; then
  // the two cannot be told apart, and guessing would copy the old image's settings into the new
  // container, so the update is refused.
  const oldImage = await docker.inspectImage(c.Image).catch(() => null);
  if (!oldImage) throw new v.ValidationError(`the image ${name} was created from is no longer on this host (was ${ref} rebuilt?), so its settings cannot be told apart from the image's; use Edit settings to recreate it`);

  await docker.pull(ref);
  const fresh = await docker.inspectImage(ref);
  if (fresh.Id === c.Image) return { changed: false, message: `${name} already runs the newest ${ref}.`, oldImage: c.Image, newImage: fresh.Id, id: c.Id };
  if (opts.skipImage && fresh.Id === opts.skipImage) {
    return { changed: false, held: true, message: `${name} was not updated: this image of ${ref} failed before.`, oldImage: c.Image, newImage: fresh.Id, id: c.Id };
  }

  try {
    const r = await replaceContainer(docker, c, recreateSpec(c, oldImage), { ...opts, keepBindMounts: true }, 'update');
    return { changed: true, message: `Updated ${name} to the newest ${ref}${r.note ? `; ${r.note}` : ''}.`, oldImage: c.Image, newImage: fresh.Id, id: r.id, note: r.note };
  } catch (e) {
    throw new UpdateFailed((e as Error).message, fresh.Id, (e as { stage?: string }).stage === 'settle');
  }
}

// Replaces container `c` (inspected) with a new one made from `spec`, under the same name and on
// the same networks: stop, set the old one aside under another name, create, connect, start and
// watch. On any failure the new container is removed and the old one is put back and started
// again. Returns the new container's ID, and a note when something worth saying happened (it was
// stopped on purpose while it settled). `what` names the operation in error messages.
export interface Replaced { id: string; note: string | null }

// The aliases and fixed addresses a container has on a network, as connect takes them. Docker adds
// the short container ID (and on newer versions the name) as aliases itself; those are left out.
export function endpointOf(c: any, ep: any): { Aliases?: string[]; IPAMConfig?: Record<string, string> } {
  const own = new Set([String(c.Id || '').slice(0, 12), String(c.Name || '').replace(/^\//, ''), String(c.Config?.Hostname || '')]);
  const out: { Aliases?: string[]; IPAMConfig?: Record<string, string> } = {};
  const aliases = (ep?.Aliases || []).filter((a: string) => a && !own.has(a));
  if (aliases.length) out.Aliases = aliases;
  const ipam: Record<string, string> = {};
  for (const k of ['IPv4Address', 'IPv6Address']) if (ep?.IPAMConfig?.[k]) ipam[k] = ep.IPAMConfig[k];
  if (Object.keys(ipam).length) out.IPAMConfig = ipam;
  return out;
}

export async function replaceContainer(docker: Docker, c: any, spec: CreateSpec, opts: UpdateOptions & { keepBindMounts?: boolean; allowedBinds?: { source: string; readOnly: boolean }[] }, what: string): Promise<Replaced> {
  const name = String(c.Name).replace(/^\//, '');
  const networks = Object.entries(c.NetworkSettings?.Networks || {}).filter(([n]) => n !== 'bridge') as [string, any][];
  const wasRunning = !!c.State?.Running;
  // Docker names are at most 128 characters.
  const aside = `${name.slice(0, 128 - 13)}-old-${String(c.Id).slice(0, 8)}`;
  // Bad input fails here, before the old container is touched: the settings, and an image that is
  // not on this host (a typo, or Pull left unticked).
  docker.createBody({ ...spec, name }, { keepBindMounts: opts.keepBindMounts, allowedBinds: opts.allowedBinds });
  try {
    await docker.inspectImage(spec.image);
  } catch (e) {
    if ((e as { status?: number })?.status === 404) throw new v.ValidationError(`the image ${spec.image} is not on this host; tick "Pull the image first" or pull it on the Images page. Nothing was changed`);
    throw e;
  }
  const shutting = () => new Interrupted('kontainers is shutting down, so nothing was changed');
  if (opts.signal?.aborted) throw shutting();

  opts.journal?.begin(name, c.Id, wasRunning);
  if (wasRunning) {
    try { await docker.stop(c.Id); } catch (e) { opts.journal?.end(name); throw e; }
  }
  // Stopping can take the container's whole stop timeout; kontainers may have been told to stop
  // meanwhile.
  if (opts.signal?.aborted) {
    if (wasRunning) await docker.start(c.Id).catch(() => {});
    opts.journal?.end(name);
    throw shutting();
  }
  try {
    await docker.rename(c.Id, aside);
  } catch (e) {
    if (wasRunning) await docker.start(c.Id).catch(() => {});
    opts.journal?.end(name);
    throw new v.ValidationError(`${what} failed before anything changed (could not rename the old container to ${aside}): ${(e as Error).message}`);
  }
  let newId: string | null = null;
  // Where it failed: only a container that started and then stopped, restarted or turned unhealthy
  // says something about the image ("settle"); the rest can be the host (a port in use, say).
  let stage = 'create';
  let note: string | null = null;
  const check = () => { if (opts.signal?.aborted) throw new Interrupted('kontainers was stopped during the replacement'); };
  try {
    check();
    newId = (await docker.create({ ...spec, name }, { keepBindMounts: opts.keepBindMounts, allowedBinds: opts.allowedBinds })).Id;
    for (const [n, ep] of networks) await docker.connect(n, newId, endpointOf(c, ep));
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
    if (newId) await docker.remove(newId, true).catch(err => wrong.push(`the new container could not be removed (${why(err)})`));
    const renamed = await docker.rename(c.Id, name).then(() => true, err => { wrong.push(`the old container could not get its name back and is still ${aside} (${why(err)})`); return false; });
    if (wasRunning) await docker.start(c.Id).catch(err => wrong.push(`the old container could not be started again (${why(err)})`));
    if (renamed && !wrong.length) opts.journal?.end(name);
    const msg = e instanceof DockerError || e instanceof v.ValidationError ? e.message : 'internal error';
    throw Object.assign(new v.ValidationError(wrong.length
      ? `${what} failed (${msg}), and putting the old container back went wrong: ${wrong.join('; ')}`
      : `${what} failed, so the old container was put back: ${msg}`), { stage });
  }
  await docker.remove(c.Id, false).catch(err => console.error(`kontainers: could not remove ${aside}: ${(err as Error).message}`));
  opts.journal?.end(name);
  return { id: newId, note };
}

// After a restart in the middle of a replacement (kontainers stopped while an update or an edit
// ran), things can be left half done. The journal says which containers were being replaced and
// whether they were running. For each:
//   - the old one set aside as <name>-old-<id> and nothing with the name: it is put back (and
//     started if it was running);
//   - set aside, and a new container that runs, made by kontainers after it: the old one goes;
//   - set aside, and a new one that was created but never started: the new one goes and the old
//     one is put back;
//   - not set aside but stopped, though it was running: it was stopped for the replacement, which
//     never got further, so it is started again.
// Anything else is left alone, with a note. kept(name, id): the new container stays; its ID
// replaces the old one's. Returns what it did or found, per container name.
export async function recoverInterrupted(docker: Docker, kept: (name: string, id: string) => void = () => {}, journal?: Journal): Promise<{ name: string; text: string; trouble: boolean }[]> {
  const out: { name: string; text: string; trouble: boolean }[] = [];
  const rows = (() => { try { return journal?.all() ?? []; } catch { return []; } })();
  const list = await docker.listContainers();
  const byName = new Map(list.map(c => [String(c.Names?.[0] || '').replace(/^\//, ''), c]));
  const handled = new Set<string>();
  for (const [name, c] of byName) {
    const m = /^(.+)-old-([0-9a-f]{8})$/.exec(name);
    if (!m || c.Labels?.['kontainers.managed'] !== 'true' || !String(c.Id).startsWith(m[2])) continue;
    const row = rows.find(r => String(r.old_id).startsWith(m[2]));
    // At Docker's 128-character limit the set-aside name was shortened, so it no longer says the name.
    if (name.length >= 128 && !row) { out.push({ name, trouble: true, text: `${name} looks set aside by an interrupted update, but its name was shortened; check it by hand` }); continue; }
    const base = row?.name ?? m[1];
    handled.add(base);
    // Without a journal entry (an older kontainers, or a full data volume), it is taken to have run.
    const wasRunning = row ? !!row.was_running : true;
    const now = byName.get(base);
    const replacement = now && now.Labels?.['kontainers.managed'] === 'true' && Number(now.Created) >= Number(c.Created);
    try {
      if (!now) {
        await docker.rename(c.Id, base);
        if (wasRunning && c.State !== 'running') await docker.start(c.Id);
        out.push({ name: base, trouble: false, text: `put ${base} back: an update or edit was interrupted before the new container existed` });
      } else if (replacement && now.State === 'running') {
        if (c.State === 'running') await docker.stop(c.Id);
        await docker.remove(c.Id, false);
        kept(base, now.Id);
        out.push({ name: base, trouble: false, text: `removed ${name}, left over from an interrupted update of ${base}; the new ${base} was not watched to the end, so check that it works` });
      } else if (replacement && now.State === 'created' && row?.was_running) {
        // Never started, so nothing of it is lost.
        await docker.remove(now.Id, false);
        await docker.rename(c.Id, base);
        if (c.State !== 'running') await docker.start(c.Id);
        out.push({ name: base, trouble: false, text: `put ${base} back: an update or edit was interrupted before the new container started` });
      } else if (replacement && now.State === 'created' && row && !row.was_running) {
        // It was stopped before the edit, and the new one is too: only the old one is left to go.
        await docker.remove(c.Id, false);
        kept(base, now.Id);
        out.push({ name: base, trouble: false, text: `removed ${name}, left over from an interrupted edit of ${base}` });
      } else {
        out.push({ name: base, trouble: true, text: `${name} and ${base} both exist, and ${base} is not running or not its replacement; check them by hand` });
      }
    } catch (e) {
      out.push({ name: base, trouble: true, text: `could not tidy up ${name}: ${(e as Error).message}` });
    }
  }
  for (const r of rows) {
    if (!handled.has(r.name)) {
      const c = byName.get(r.name);
      // Stopped for the replacement, and then nothing: started again.
      if (c && String(c.Id) === r.old_id && r.was_running && c.State !== 'running') {
        try {
          await docker.start(c.Id);
          out.push({ name: r.name, trouble: false, text: `started ${r.name} again: kontainers stopped while it was stopped for an update or edit, before anything else changed` });
        } catch (e) {
          out.push({ name: r.name, trouble: true, text: `could not start ${r.name} again after an interrupted update: ${(e as Error).message}` });
        }
      }
    }
    try { journal?.end(r.name); } catch { /* written again at the next replacement */ }
  }
  return out;
}
