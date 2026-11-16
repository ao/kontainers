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
}

export interface UpdateResult { changed: boolean; message: string; oldImage: string; newImage: string; held?: boolean; id: string }

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

async function watchNew(docker: Docker, id: string, opts: UpdateOptions): Promise<string | null> {
  const sleep = opts.sleep ?? ((ms: number) => Bun.sleep(ms));
  const settle = opts.settleMs ?? 0;
  for (let waited = 0; waited < settle; waited += 1000) {
    await sleep(Math.min(1000, settle - waited));
    const p = settleProblem(await docker.inspect(id));
    if (p) return p;
  }
  let c = await docker.inspect(id);
  const p = settleProblem(c);
  if (p) return p;
  // With a healthcheck, an update counts only once the container reports healthy.
  for (let waited = 0; c.State?.Health?.Status === 'starting' && waited < (opts.healthTimeoutMs ?? 0); waited += 1000) {
    await sleep(1000);
    c = await docker.inspect(id);
    const q = settleProblem(c);
    if (q) return q;
  }
  // Without a wait for health (Update image and Edit by hand), "starting" is fine: Docker's first
  // check comes after its interval, 30 s by default, and a healthy image would always be rolled back.
  if (c.State?.Health?.Status === 'starting' && (opts.healthTimeoutMs ?? 0) > 0) return 'the new container did not become healthy in time';
  return null;
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
    const newId = await replaceContainer(docker, c, recreateSpec(c, oldImage), { ...opts, keepBindMounts: true }, 'update');
    return { changed: true, message: `Updated ${name} to the newest ${ref}.`, oldImage: c.Image, newImage: fresh.Id, id: newId };
  } catch (e) {
    throw new UpdateFailed((e as Error).message, fresh.Id, (e as { stage?: string }).stage === 'settle');
  }
}

// Replaces container `c` (inspected) with a new one made from `spec`, under the same name and on
// the same networks: stop, set the old one aside under another name, create, connect, start and
// watch. On any failure the new container is removed and the old one is put back and started
// again. Returns the new container's ID. `what` names the operation in error messages.
export async function replaceContainer(docker: Docker, c: any, spec: CreateSpec, opts: UpdateOptions & { keepBindMounts?: boolean; allowedBindSources?: string[] }, what: string): Promise<string> {
  const name = String(c.Name).replace(/^\//, '');
  const networks = Object.keys(c.NetworkSettings?.Networks || {}).filter(n => n !== 'bridge');
  const wasRunning = !!c.State?.Running;
  // Docker names are at most 128 characters.
  const aside = `${name.slice(0, 128 - 13)}-old-${String(c.Id).slice(0, 8)}`;
  // Bad input fails here, before the old container is touched.
  docker.createBody({ ...spec, name }, { keepBindMounts: opts.keepBindMounts, allowedBindSources: opts.allowedBindSources });

  if (wasRunning) await docker.stop(c.Id);
  try {
    await docker.rename(c.Id, aside);
  } catch (e) {
    if (wasRunning) await docker.start(c.Id).catch(() => {});
    throw new v.ValidationError(`${what} failed before anything changed (could not rename the old container to ${aside}): ${(e as Error).message}`);
  }
  let newId: string | null = null;
  // Where it failed: only a container that started and then stopped, restarted or turned unhealthy
  // says something about the image ("settle"); the rest can be the host (a port in use, say).
  let stage = 'create';
  try {
    newId = (await docker.create({ ...spec, name }, { keepBindMounts: opts.keepBindMounts, allowedBindSources: opts.allowedBindSources })).Id;
    for (const n of networks) await docker.connect(n, newId);
    if (wasRunning) {
      stage = 'start';
      await docker.start(newId);
      stage = 'settle';
      const problem = await watchNew(docker, newId, opts);
      if (problem) throw new v.ValidationError(problem);
    }
  } catch (e) {
    if (newId) await docker.remove(newId, true).catch(() => {});
    await docker.rename(c.Id, name).catch(() => {});
    if (wasRunning) await docker.start(c.Id).catch(() => {});
    const msg = e instanceof DockerError || e instanceof v.ValidationError ? e.message : 'internal error';
    throw Object.assign(new v.ValidationError(`${what} failed, so the old container was put back: ${msg}`), { stage });
  }
  await docker.remove(c.Id, false).catch(err => console.error(`kontainers: could not remove ${aside}: ${(err as Error).message}`));
  return newId;
}

// After a restart in the middle of a replacement (kontainers stopped while an update or an edit
// ran), the old container may still be set aside as <name>-old-<id>. If nothing has the name any
// more, it is put back and started; if the new container is running, the old one is removed.
// A new container that exists but is not running is left alone, with a log line.
export async function recoverInterrupted(docker: Docker): Promise<string[]> {
  const out: string[] = [];
  const list = await docker.listContainers();
  const byName = new Map(list.map(c => [String(c.Names?.[0] || '').replace(/^\//, ''), c]));
  for (const [name, c] of byName) {
    const m = /^(.+)-old-([0-9a-f]{8})$/.exec(name);
    if (!m || c.Labels?.['kontainers.managed'] !== 'true' || !String(c.Id).startsWith(m[2])) continue;
    const base = m[1];
    // At Docker's 128-character limit the set-aside name was shortened, so it no longer says the name.
    if (name.length >= 128) { out.push(`${name} looks set aside by an interrupted update, but its name was shortened; check it by hand`); continue; }
    const now = byName.get(base);
    try {
      if (!now) {
        await docker.rename(c.Id, base);
        if (c.State !== 'running') await docker.start(c.Id).catch(() => {});
        out.push(`put ${base} back: an update or edit was interrupted before the new container existed`);
      } else if (now.State === 'running' && now.Labels?.['kontainers.managed'] === 'true' && Number(now.Created) >= Number(c.Created)) {
        // The running one is the replacement: made by kontainers, and after the old one.
        if (c.State === 'running') await docker.stop(c.Id);
        await docker.remove(c.Id, false);
        out.push(`removed ${name}, left over from an interrupted update of ${base}`);
      } else {
        out.push(`${name} and ${base} both exist, and ${base} is not running or not its replacement; check them by hand`);
      }
    } catch (e) {
      out.push(`could not tidy up ${name}: ${(e as Error).message}`);
    }
  }
  return out;
}
