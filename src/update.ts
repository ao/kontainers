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
  const volumes = (c.HostConfig?.Mounts || []).map((m: any) => ({ source: m.Source, target: m.Target, readOnly: !!m.ReadOnly }));
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
  constructor(message: string, public newImage: string | null) { super(message); }
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
  if (c.State?.Health?.Status === 'starting') return 'the new container did not become healthy in time';
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

  await docker.pull(ref);
  const fresh = await docker.inspectImage(ref);
  if (fresh.Id === c.Image) return { changed: false, message: `${name} already runs the newest ${ref}.`, oldImage: c.Image, newImage: fresh.Id, id: c.Id };
  if (opts.skipImage && fresh.Id === opts.skipImage) {
    return { changed: false, held: true, message: `${name} was not updated: this image of ${ref} failed before.`, oldImage: c.Image, newImage: fresh.Id, id: c.Id };
  }

  const oldImage = await docker.inspectImage(c.Image).catch(() => null);
  try {
    const newId = await replaceContainer(docker, c, recreateSpec(c, oldImage), { ...opts, keepBindMounts: true }, 'update');
    return { changed: true, message: `Updated ${name} to the newest ${ref}.`, oldImage: c.Image, newImage: fresh.Id, id: newId };
  } catch (e) {
    throw new UpdateFailed((e as Error).message, fresh.Id);
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
  const aside = `${name}-old-${String(c.Id).slice(0, 8)}`;
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
  try {
    newId = (await docker.create({ ...spec, name }, { keepBindMounts: opts.keepBindMounts, allowedBindSources: opts.allowedBindSources })).Id;
    for (const n of networks) await docker.connect(n, newId);
    if (wasRunning) {
      await docker.start(newId);
      const problem = await watchNew(docker, newId, opts);
      if (problem) throw new v.ValidationError(problem);
    }
  } catch (e) {
    if (newId) await docker.remove(newId, true).catch(() => {});
    await docker.rename(c.Id, name).catch(() => {});
    if (wasRunning) await docker.start(c.Id).catch(() => {});
    const msg = e instanceof DockerError || e instanceof v.ValidationError ? e.message : 'internal error';
    throw new v.ValidationError(`${what} failed, so the old container was put back: ${msg}`);
  }
  await docker.remove(c.Id, false).catch(err => console.error(`kontainers: could not remove ${aside}: ${(err as Error).message}`));
  return newId;
}
