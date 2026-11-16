// Clean up: what can be removed without touching anything in use, worked out from the daemon's
// lists, and removed one by one (not with the daemon's prune calls, whose meaning for volumes
// changed between API versions). Named volumes are never removed in bulk: they hold data, and an
// unused one may be waiting for a container to be created again. Only anonymous ones are.

import type { Docker } from './docker';

export interface ImageItem { id: string; tags: string[]; size: number; created: number }
export interface Plan {
  dangling: ImageItem[]; // no tag, used by no container
  unusedTagged: ImageItem[]; // tagged, used by no container (stopped ones count as users)
  networks: { id: string; name: string }[]; // user-defined, no container attached
  volumes: { name: string; created: string | null }[]; // anonymous, mounted by no container
  namedUnused: number; // named volumes no container mounts; listed, not removed here
}

const BUILTIN_NETS = new Set(['bridge', 'host', 'none']);

export function isAnonymousVolume(v: any): boolean {
  return v?.Labels?.['com.docker.volume.anonymous'] !== undefined || /^[0-9a-f]{64}$/.test(String(v?.Name || ''));
}

export function plan(images: any[], containers: any[], networks: any[], volumes: any[], networkUse: Map<string, number>): Plan {
  const used = new Set(containers.map(c => c.ImageID));
  const mounted = new Set<string>();
  for (const c of containers) for (const m of c.Mounts || []) if (m.Type === 'volume' && m.Name) mounted.add(m.Name);
  const items = images.filter(i => !used.has(i.Id)).map(i => ({
    id: i.Id as string, size: Number(i.Size) || 0, created: Number(i.Created) || 0,
    tags: (i.RepoTags || []).filter((t: string) => t && t !== '<none>:<none>'),
  }));
  const vols = volumes.filter(v => !mounted.has(v.Name));
  return {
    dangling: items.filter(i => !i.tags.length),
    unusedTagged: items.filter(i => i.tags.length).sort((a, b) => b.size - a.size),
    networks: networks.filter(n => !BUILTIN_NETS.has(n.Name) && (n.Scope ?? 'local') === 'local' && !(networkUse.get(n.Id) || 0) && !(networkUse.get(n.Name) || 0) && !n.Labels?.['kontainers.keep'])
      .map(n => ({ id: n.Id, name: n.Name })),
    volumes: vols.filter(isAnonymousVolume).map(v => ({ name: v.Name, created: v.CreatedAt ?? null })),
    namedUnused: vols.filter(v => !isAnonymousVolume(v)).length,
  };
}

export async function currentPlan(docker: Docker): Promise<Plan> {
  const [images, containers, networks, volumes] = await Promise.all([docker.listImages(), docker.listContainers(), docker.listNetworks(), docker.listVolumes()]);
  // The network list does not say which containers use a network; the container list does. A
  // container that is not running has no NetworkID yet, so networks are matched by name as well:
  // removing a network a stopped container is configured for would leave it unable to start.
  const use = new Map<string, number>();
  const add = (k: string | undefined) => { if (k) use.set(k, (use.get(k) || 0) + 1); };
  for (const c of containers) {
    for (const [name, n] of Object.entries(c.NetworkSettings?.Networks || {}) as [string, any][]) { add(name); add(n?.NetworkID); }
    add(c.HostConfig?.NetworkMode);
  }
  return plan(images, containers, networks, volumes, use);
}

export const sumSize = (items: ImageItem[]) => items.reduce((s, i) => s + i.size, 0);

export interface Outcome { removed: number; kept: number; errors: string[] }

// Removes each item; one that the daemon refuses (it came into use since, or an image is a parent
// of another) is kept and counted, never forced.
export async function removeAll<T>(items: T[], remove: (item: T) => Promise<void>, label: (item: T) => string): Promise<Outcome> {
  const out: Outcome = { removed: 0, kept: 0, errors: [] };
  for (const it of items) {
    try { await remove(it); out.removed++; } catch (e) { out.kept++; if (out.errors.length < 3) out.errors.push(`${label(it)}: ${(e as Error).message}`); }
  }
  return out;
}
