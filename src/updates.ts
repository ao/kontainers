// Update awareness: for each image reference a container uses, ask the registry (through the Docker
// daemon, so its registry credentials apply) which manifest the reference points at now, and compare
// it with the manifests the local image was pulled as.

import type { Docker } from './docker';

export type UpdateStatus = 'current' | 'available' | 'unknown';
// imageId: the local image the reference pointed at when checked.
export interface UpdateState { status: UpdateStatus; checkedAt: number; reason?: string; imageId?: string }

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

  // Checks every image reference in use. Concurrent calls share one run. Returns how many were checked.
  checkAll(): Promise<number> {
    if (this.running) return this.running;
    this.running = (async () => {
      const refs = new Set<string>();
      for (const c of await this.docker.listContainers()) if (checkable(c.Image)) refs.add(c.Image);
      for (const ref of refs) await this.check(ref);
      // Forget references no container uses any more.
      for (const ref of [...this.state.keys()]) if (!refs.has(ref)) this.state.delete(ref);
      this.lastRun = this.now();
      return refs.size;
    })().finally(() => { this.running = null; });
    return this.running;
  }

  async check(ref: string): Promise<UpdateState> {
    let st: UpdateState;
    try {
      const [local, remote] = await Promise.all([this.docker.inspectImage(ref), this.docker.distribution(ref)]);
      st = { ...compareDigests(local?.RepoDigests, remote?.Descriptor?.digest), checkedAt: this.now(), imageId: local?.Id };
    } catch (e) {
      // docker-socket-proxy answers 403 for API sections it was not told to allow.
      const reason = (e as { status?: number }).status === 403
        ? 'the Docker API refused the registry lookup; with docker-socket-proxy, set DISTRIBUTION=1 on it'
        : (e as Error).message.slice(0, 200);
      st = { status: 'unknown', reason, checkedAt: this.now() };
    }
    this.state.set(ref, st);
    return st;
  }
}
