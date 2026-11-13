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

export async function updateContainer(docker: Docker, id: string): Promise<string> {
  const c = await docker.inspect(id);
  const refusal = updatable(c);
  if (refusal) throw new v.ValidationError(refusal);
  const name = String(c.Name).replace(/^\//, '');
  const ref = c.Config.Image as string;

  await docker.pull(ref);
  const fresh = await docker.inspectImage(ref);
  if (fresh.Id === c.Image) return `${name} already runs the newest ${ref}.`;

  const oldImage = await docker.inspectImage(c.Image).catch(() => null);
  const spec = recreateSpec(c, oldImage);
  const networks = Object.keys(c.NetworkSettings?.Networks || {}).filter(n => n !== 'bridge');
  const wasRunning = !!c.State?.Running;
  const aside = `${name}-old-${String(c.Id).slice(0, 8)}`;

  if (wasRunning) await docker.stop(c.Id);
  try {
    await docker.rename(c.Id, aside);
  } catch (e) {
    if (wasRunning) await docker.start(c.Id).catch(() => {});
    throw new v.ValidationError(`update failed before anything changed (could not rename the old container to ${aside}): ${(e as Error).message}`);
  }
  let newId: string | null = null;
  try {
    newId = (await docker.create(spec, { keepBindMounts: true })).Id;
    for (const n of networks) await docker.connect(n, newId);
    if (wasRunning) await docker.start(newId);
  } catch (e) {
    if (newId) await docker.remove(newId, true).catch(() => {});
    await docker.rename(c.Id, name).catch(() => {});
    if (wasRunning) await docker.start(c.Id).catch(() => {});
    const msg = e instanceof DockerError || e instanceof v.ValidationError ? e.message : 'internal error';
    throw new v.ValidationError(`update failed, so the old container was put back: ${msg}`);
  }
  await docker.remove(c.Id, false).catch(err => console.error(`kontainers: could not remove ${aside}: ${(err as Error).message}`));
  return `Updated ${name} to the newest ${ref}.`;
}
