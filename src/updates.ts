// Update awareness: for each image reference a container uses, ask the registry (through the Docker
// daemon, so its registry credentials apply) which manifest the reference points at now, and compare
// it with the manifests the local image was pulled as.

import type { Docker } from './docker';

export type UpdateStatus = 'current' | 'available' | 'unknown';
// imageId: the local image the reference pointed at when checked.
export interface UpdateState { status: UpdateStatus; checkedAt: number; reason?: string; imageId?: string; remoteDigest?: string }

// What a container's row should say. A container keeps the image it was created from, so after a
// `docker pull` of its tag it runs an older image than the tag, even when the tag itself is current.
export function containerStatus(st: UpdateState | null, containerImageId: string | undefined): { status: UpdateStatus; reason?: string } | null {
  if (!st) return null;
  if (st.status !== 'available' && st.imageId && containerImageId && containerImageId !== st.imageId) {
    return { status: 'available', reason: 'a newer image for this tag is already pulled; recreate the container to use it' };
  }
  return { status: st.status, reason: st.reason };
}

// Pure comparison. RepoDigests lists "repo@sha256:..." for each manifest the local image was pulled
// as (for a multi-platform image, the index digest). An image built locally has none.
export function compareDigests(repoDigests: string[] | undefined | null, remoteDigest: string | undefined | null): { status: UpdateStatus; reason?: string } {
  if (!remoteDigest) return { status: 'unknown', reason: 'the registry did not return a digest' };
  if (!repoDigests || repoDigests.length === 0) return { status: 'unknown', reason: 'the image was not pulled from a registry' };
  return repoDigests.some(d => d.endsWith('@' + remoteDigest)) ? { status: 'current' } : { status: 'available' };
}

// References that can be checked: a tag, not an image ID and not a digest-pinned reference.
export function checkable(ref: string): boolean {
  return !!ref && !ref.startsWith('sha256:') && !/^[a-f0-9]{12,64}$/.test(ref) && !ref.includes('@');
}

export class UpdateChecker {
  private state = new Map<string, UpdateState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<number> | null = null;
  lastRun: number | null = null;
  // Called, not awaited, after every completed check: automatic updates and notifications.
  onChecked: (() => Promise<void>) | null = null;

  // intervalMs 0 turns scheduled checks off; "Check now" still works.
  constructor(private docker: Docker, private intervalMs: number, private now: () => number = Date.now) {}

  get(ref: string): UpdateState | null { return this.state.get(ref) ?? null; }

  start(): void {
    if (this.intervalMs <= 0) return;
    // First check shortly after start, then on the interval.
    setTimeout(() => void this.checkAll().catch(() => {}), 15000);
    this.timer = setInterval(() => void this.checkAll().catch(() => {}), this.intervalMs);
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }

  // Checks every image reference in use. Concurrent calls share one run; with `fresh`, a call made
  // while one runs gets the next run instead, which starts when the current one ends (a person who
  // clicks Check for updates wants the registries asked now). Returns how many were checked.
  private next: Promise<number> | null = null;
  checkAll(fresh = false): Promise<number> {
    if (this.running && fresh) return (this.next ??= this.running.catch(() => 0).then(() => { this.next = null; return this.checkAll(); }));
    if (this.running) return this.running;
    this.running = (async () => {
      const refs = new Set<string>();
      for (const c of await this.docker.listContainersWithRefs()) if (checkable(c.Ref)) refs.add(c.Ref);
      // Four at a time: a registry that does not answer costs the daemon about 15 s per lookup.
      const queue = [...refs];
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { for (let r = queue.shift(); r; r = queue.shift()) await this.check(r); }));
      // Forget references no container uses any more.
      for (const ref of [...this.state.keys()]) if (!refs.has(ref)) this.state.delete(ref);
      this.lastRun = this.now();
      if (this.onChecked) void this.onChecked().catch(e => console.error(`kontainers: after the update check: ${(e as Error).message}`));
      return refs.size;
    })().finally(() => { this.running = null; });
    return this.running;
  }

  async check(ref: string): Promise<UpdateState> {
    let st: UpdateState;
    try {
      const [local, remote] = await Promise.all([this.docker.inspectImage(ref), this.docker.distribution(ref)]);
      const own = digestsFor(ref, local?.RepoDigests);
      st = { ...compareDigests(own, remote?.Descriptor?.digest), checkedAt: this.now(), imageId: local?.Id, remoteDigest: remote?.Descriptor?.digest };
      // A different digest is a newer image only if the registry has ever served ours. Docker's
      // containerd image store gives locally built images a digest too; one the registry does not
      // know was built (or changed) here, and "newer image available" would be wrong.
      if (st.status === 'available') {
        const known = await Promise.any(own.map(d => this.docker.distribution(`${repoOf(ref)}@${d.split('@')[1]}`))).catch(() => null);
        if (!known) st = { ...st, status: 'unknown', reason: 'the registry does not have the image this tag points at here: it was built on this host, or the registry has since deleted it. Update image still pulls whatever the tag points at now' };
      }
    } catch (e) {
      st = { status: 'unknown', reason: lookupReason(e), checkedAt: this.now() };
    }
    this.state.set(ref, st);
    return st;
  }
}

// "nginx:1.27" -> "nginx", "ghcr.io/org/app:2" -> "ghcr.io/org/app" (a port is not a tag).
export function repoOf(ref: string): string {
  const at = ref.indexOf('@');
  const r = at >= 0 ? ref.slice(0, at) : ref;
  const colon = r.lastIndexOf(':');
  return colon > r.lastIndexOf('/') ? r.slice(0, colon) : r;
}

// Docker Hub names appear in RepoDigests without docker.io/ and library/.
const shortRepo = (r: string) => r.replace(/^(docker\.io|index\.docker\.io|registry-1\.docker\.io)\//, '').replace(/^library\//, '');

// The RepoDigests that belong to the reference's repository: a digest pulled from another
// repository says nothing about this one.
export function digestsFor(ref: string, repoDigests: string[] | undefined | null): string[] {
  const repo = shortRepo(repoOf(ref));
  return (repoDigests || []).filter(d => shortRepo(d.split('@')[0]) === repo);
}

// What a failed lookup means, in words.
export function lookupReason(e: unknown): string {
  const status = (e as { status?: number }).status;
  const msg = String((e as Error)?.message || e);
  // docker-socket-proxy answers 403 for API sections it was not told to allow.
  if (status === 403 && !/denied|unauthorized/i.test(msg)) return 'the Docker API refused the registry lookup; with docker-socket-proxy, set DISTRIBUTION=1 on it';
  if (/refused the login saved/.test(msg)) return 'the registry refused the login saved for it on the Settings page';
  if (/denied|unauthorized|not found|manifest unknown|name unknown|repository does not exist/i.test(msg)) return 'the registry has no such image, or it needs a login: for a private image, add one on the Settings page';
  if (/deadline exceeded|timeout|timed out|no such host|connection refused|i\/o timeout|unreachable/i.test(msg)) return `the registry did not answer (${msg.slice(0, 120)})`;
  return msg.slice(0, 200);
}
