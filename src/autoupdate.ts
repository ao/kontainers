// Automatic updates: any container Update image can handle can be opted in, by name (the name
// survives the recreation an update does), on its page or with the label kontainers.autoupdate=true
// (which survives compose recreating it). After every update check, each opted-in container that has a newer
// image is updated the way Update image does it, and then watched: if the new container stops,
// restarts or turns unhealthy while it settles, the old one is put back and that image is held
// back, so the next check does not try it again. A newer image than the held one is tried.
// The same pass sends "update" notifications for containers that are not opted in.

import type { Database } from 'bun:sqlite';
import type { Docker } from './docker';
import type { Notifier } from './notify';
import { containerStatus, type UpdateChecker } from './updates';
import { inspectOthers, removeReplacedImage, updatable, updateContainerDetailed, UpdateFailed, type Journal } from './update';
import { cloneRefusal } from './clone';
import * as v from './validate';
import { NameLocks } from './locks';
import { writeFailed } from './storage';
import { inWindow, nextWindow, type ScheduleStore } from './schedule';

export interface AutoRow { container: string; container_id: string; created_at: number; last_at: number | null; last_result: string | null; held_image: string | null; held_digests?: string | null }

export interface AutoOptions { settleMs: number; healthTimeoutMs: number; signal?: AbortSignal; wasStopped?: (id: string) => boolean; journal?: Journal; schedule?: ScheduleStore }

// A container set aside by an update that is still running or was interrupted: <name>-old-<id>,
// one kontainers created or one its journal names.
const setAside = (c: any, name: string, journalled: Set<string>) => /-old-[0-9a-f]{8}$/.test(name) && String(c.Id).startsWith(name.slice(-8)) && (c.Labels?.['kontainers.managed'] === 'true' || journalled.has(String(c.Id)));

// The label that opts a container in from its own configuration (a compose file, docker run -l).
export const AUTO_LABEL = 'kontainers.autoupdate';
export const labelledOn = (labels: Record<string, string> | null | undefined) => String(labels?.[AUTO_LABEL] ?? '').toLowerCase() === 'true';

const nameOf = (c: any) => String(c.Names?.[0] || c.Name || '').replace(/^\//, '');

export class AutoUpdates {
  // Container names being updated right now, by this pass or by Update image.
  readonly busy = new NameLocks();
  private running: Promise<void> | null = null;
  // New container IDs that could not be written (a full data volume), so the container stays opted
  // in; written at the next pass.
  private unsaved = new Map<string, string>();

  constructor(
    private db: Database,
    private docker: Docker,
    private checker: UpdateChecker,
    private notifier: Notifier | null,
    private opts: AutoOptions,
    private audit: (action: string, target: string, result?: string) => void = () => {},
    private now: () => number = Date.now,
  ) {}

  get(name: string): AutoRow | null { return (this.db.query('SELECT * FROM auto_update WHERE container = ?').get(name) as AutoRow | null) ?? null; }
  names(): Set<string> { return new Set((this.db.query('SELECT container FROM auto_update').all() as { container: string }[]).map(r => r.container)); }

  // kontainers' own container and the one that serves its Docker API are never recreated by it,
  // whatever their labels say (set by the server, which knows them).
  protect: (c: any) => Promise<boolean> = async () => false;

  // Turns automatic updates on or off for a container, which must be one Update image can handle.
  async set(id: string, on: boolean): Promise<string> {
    const c = await this.docker.inspect(id);
    const name = String(c.Name || '').replace(/^\//, '');
    if (!on && labelledOn(c.Config?.Labels)) throw new v.ValidationError(`${name} has the label ${AUTO_LABEL}=true, which turns automatic updates on; remove the label (in its compose file, say) to turn them off`);
    // While it is replaced, the container under the name may be the one about to be rolled back.
    if (on && this.busy.has(name)) throw new v.ValidationError(`an update or edit of ${name} is running; turn automatic updates on when it has finished`);
    if (on) {
      const refusal = updatable(c, await inspectOthers(this.docker, c.Id));
      if (refusal) throw new v.ValidationError(refusal);
      this.db.query('INSERT INTO auto_update (container, container_id, created_at) VALUES (?, ?, ?) ON CONFLICT (container) DO UPDATE SET container_id = excluded.container_id').run(name, c.Id, this.now());
      return `${name} will be updated automatically when a check finds a newer image.`;
    }
    this.db.query('DELETE FROM auto_update WHERE container = ?').run(name);
    this.unsaved.delete(name);
    this.waiting.delete(name);
    return `${name} will no longer be updated automatically.${this.busy.has(name) ? ' An update or edit running now still finishes.' : ''}`;
  }

  // Forget a container that was removed.
  forget(name: string): void { this.db.query('DELETE FROM auto_update WHERE container = ?').run(name); this.unsaved.delete(name); this.waiting.delete(name); }

  // Update image, Edit settings or an automatic update recreated the container under a new ID: it
  // stays opted in. from: the container it replaced; only when that one was opted in (not one put
  // under the name outside kontainers, or one whose label was taken away). Never throws: an update
  // that worked must not be reported as failed.
  recreated(name: string, newId: string, from?: string): void {
    this.waiting.delete(name);
    if (from !== undefined) { const row = this.get(name); if (!row || this.idOf(row) !== from) return; }
    try {
      this.db.query('UPDATE auto_update SET container_id = ? WHERE container = ?').run(newId, name);
      this.unsaved.delete(name);
    } catch (e) {
      writeFailed(e, `could not save the new container ID of ${name}`);
      if (this.get(name)) this.unsaved.set(name, newId);
    }
  }

  // Holds an image back for a container (a replacement that failed when the tidy-up after a restart
  // watched it).
  hold(name: string, image: string): void {
    try { this.db.query('UPDATE auto_update SET held_image = ? WHERE container = ?').run(image, name); } catch (e) { writeFailed(e, `could not hold back the image of ${name}`); }
  }

  private idOf(row: AutoRow): string { return this.unsaved.get(row.container) ?? row.container_id; }

  // Opted in, and still the same container: a container removed outside kontainers and replaced
  // by another under the same name is not updated automatically.
  // labels: the container's, when at hand; the label opts it in too.
  isOn(name: string, id: string, labels?: Record<string, string> | null): boolean {
    if (labelledOn(labels)) return true;
    const row = this.get(name);
    return !!row && this.idOf(row) === id;
  }

  // The image an automatic update held back for this container, if any.
  heldImage(name: string): string | null { return this.get(name)?.held_image ?? null; }

  // The registry digests of the image held back for a container, saved when it was held. After a
  // failed update the tag points back at the image the container runs (update.ts), so a held image
  // is told apart by the digest the registry still serves for the tag; once untagged it may have
  // no digests of its own any more (the containerd store), or be pruned.
  heldDigests(name: string): string[] | undefined {
    const raw = this.get(name)?.held_digests;
    if (!raw) return undefined;
    try { const d = JSON.parse(raw); return Array.isArray(d) ? d.map(String) : undefined; } catch { return undefined; }
  }
  // Whether the image held back for this container is still what the registry serves for its tag.
  private heldIsNewest(row: AutoRow, st: { remoteDigest?: string; imageId?: string; status?: string } | null): boolean {
    if (!row.held_image || !st) return false;
    if (st.imageId === row.held_image && st.status !== 'available') return true;
    return !!st.remoteDigest && (this.heldDigests(row.container) || []).some(d => d.endsWith('@' + st.remoteDigest));
  }

  // Containers with a newer image that wait for the update window or the delay: until when, and why.
  private waiting = new Map<string, { until: number; why: 'window' | 'delay' }>();
  waitingFor(name: string): { until: number; why: 'window' | 'delay' } | null { return this.waiting.get(name) ?? null; }

  // Whether a newer image for `ref` must wait now (null: it may be installed).
  waitFor(ref: string, st: { remoteDigest?: string; imageId?: string } | null): { until: number; why: 'window' | 'delay' } | null {
    const store = this.opts.schedule;
    if (!store) return null;
    const sched = store.get();
    const now = this.now();
    if (sched.delayHours) {
      const ready = store.firstSeen(ref, st?.remoteDigest || st?.imageId || '') + sched.delayHours * 3600_000;
      if (now < ready) return { until: inWindow(sched, ready) ? ready : nextWindow(sched, ready), why: 'delay' };
    }
    if (!inWindow(sched, now)) return { until: nextWindow(sched, now), why: 'window' };
    return null;
  }

  // Every minute: when something that waited may now be installed, a pass runs (the update
  // check's results are still at hand; the image is pulled again by the update itself).
  private ticker: ReturnType<typeof setInterval> | null = null;
  start(): void {
    this.ticker ??= setInterval(() => {
      if ([...this.waiting.values()].some(w => w.until <= this.now())) void this.afterCheck().catch(e => console.error(`kontainers: automatic updates: ${(e as Error).message}`));
    }, 60_000);
    (this.ticker as any).unref?.();
  }
  stop(): void { if (this.ticker) clearInterval(this.ticker); this.ticker = null; }

  // After a check: update opted-in containers, notify about the others. One pass at a time.
  // A check that finishes while a pass runs (a long settle) gets a pass of its own after it, so what
  // it found is not left until the next check.
  private queued: Promise<void> | null = null;
  afterCheck(): Promise<void> {
    if (this.running) return (this.queued ??= this.running.catch(() => {}).then(() => { this.queued = null; return this.afterCheck(); }));
    if (this.opts.signal?.aborted) return Promise.resolve();
    this.running = this.pass().finally(() => { this.running = null; });
    return this.running;
  }

  // A container kontainers made to replace an opted-in one carries kontainers.replaces=<old ID>.
  // If the new ID could not be saved (a full data volume, then a restart), this finds it again.
  // Only a finished replacement: none running now for that name, none recorded as unfinished (the
  // tidy-up after a restart decides those), and the container it replaced is gone.
  adopt(list: any[]): void {
    const unfinished = new Set((() => { try { return this.opts.journal?.all() ?? []; } catch { return []; } })().map(r => r.name));
    const ids = new Set(list.map(c => String(c.Id)));
    for (const c of list) {
      const name = nameOf(c);
      if (this.busy.has(name) || unfinished.has(name)) continue;
      const row = this.get(name);
      const prev = c.Labels?.['kontainers.replaces'];
      if (row && prev && !ids.has(prev) && this.idOf(row) !== c.Id && (prev === row.container_id || prev === this.unsaved.get(name))) this.recreated(name, c.Id);
    }
  }

  private async pass(): Promise<void> {
    for (const [name, id] of [...this.unsaved]) this.recreated(name, id);
    // Worked out again below, into a new map that replaces the old one at the end: a Docker error
    // half way keeps what was waiting, so the ticker still fires for it.
    const waiting = new Map<string, { until: number; why: 'window' | 'delay' }>();
    try { await this.passInto(waiting); } finally { this.waiting = this.lastPassFailed ? new Map([...this.waiting, ...waiting]) : waiting; }
  }
  private lastPassFailed = false;

  private async passInto(waiting: Map<string, { until: number; why: 'window' | 'delay' }>): Promise<void> {
    this.lastPassFailed = true;
    // "Newer image" notes go out once per image, naming every container that uses it.
    const newer = new Map<string, { ref: string; names: string[] }>();
    const list = await this.docker.listContainersWithRefs();
    try { this.adopt(list); } catch (e) { console.error(`kontainers: ${(e as Error).message}`); }
    const journalled = new Set((() => { try { return this.opts.journal?.all() ?? []; } catch { return []; } })().map(r => String(r.old_id)));
    for (const c of list) {
      const name = nameOf(c);
      // One container's trouble (a full data volume, a daemon error) must not stop the others.
      try {
        if (setAside(c, name, journalled)) continue;
        // A container kontainers created on the host's network or another container's is never
        // recreated by it (Edit cannot make one); a copied one keeps its network as it is.
        const mode = String(c.HostConfig?.NetworkMode || '');
        const madeHere = c.Labels?.['kontainers.managed'] === 'true' && !c.Labels?.['com.docker.compose.project'];
        const recreatable = !madeHere || (mode !== 'host' && !mode.startsWith('container:'));
        const st = this.checker.get(c.Ref);
        if (containerStatus(st, c.ImageID)?.status !== 'available') continue;
        // The label opts this container in, whichever container had the name before; not one that
        // Update image refuses at a glance (a digest, an image ID, a swarm task).
        const refusedAtAGlance = String(c.Ref || '').includes('@') || /^(sha256:)?[0-9a-f]{12,64}$/.test(String(c.Ref || '')) || !!c.Labels?.['com.docker.swarm.task.id'];
        if (labelledOn(c.Labels) && !refusedAtAGlance && !this.busy.has(name) && !(await this.protect(c))) {
          // Not one Update image would refuse (--rm, shared namespaces): it would fail every pass.
          const full = await this.docker.inspect(c.Id).catch(() => null);
          if (full && full.Config?.Labels?.['kontainers.managed'] !== 'true' && cloneRefusal(full, await inspectOthers(this.docker, c.Id))) continue;
          const had = this.get(name);
          if (!had) this.db.query('INSERT INTO auto_update (container, container_id, created_at) VALUES (?, ?, ?) ON CONFLICT (container) DO NOTHING').run(name, c.Id, this.now());
          else if (this.idOf(had) !== c.Id && !list.some(x => String(x.Id) === this.idOf(had))) this.recreated(name, c.Id);
        }
        // Reported like any container that is not opted in.
        const row = (await this.protect(c)) ? null : this.get(name);
        if (!row || this.idOf(row) !== c.Id || !recreatable) {
          const k = `${c.Ref}|${st?.remoteDigest || st?.imageId || ''}`;
          const g = newer.get(k) ?? { ref: String(c.Ref), names: [] as string[] };
          g.names.push(name);
          newer.set(k, g);
          continue;
        }
        if (this.busy.has(name)) continue; // a person is updating or editing it
        // An interrupted update of it is not tidied up yet. Once its old container is gone (removed
        // by hand after a "check by hand" note) and the replacement has the name, it is settled.
        const open = (() => { try { return this.opts.journal?.all().find(r => r.name === name) ?? null; } catch { return null; } })();
        if (open) {
          // A finished copy whose old container could not be removed: removed now, if it stopped.
          const leftover = list.find(x => String(x.Id) === open.old_id);
          if (leftover && c.Labels?.['kontainers.replaces'] === open.old_id && c.State === 'running' && ['exited', 'created', 'dead'].includes(String(leftover.State)) && open.phase === 'started') {
            try { await this.docker.remove(open.old_id, false); } catch { continue; }
          } else if (leftover || c.Labels?.['kontainers.replaces'] !== open.old_id) continue;
          try { this.opts.journal?.end(name); } catch { /* looked at again next time */ }
          this.recreated(name, c.Id);
          continue;
        }
        // The image that failed is still the newest for the tag.
        if (this.heldIsNewest(row, st)) continue;
        // Outside the update window, or the newer image not seen for long enough yet: later. With a
        // delay, the registry is asked again first: the last check may be hours old, and the update
        // must install the image that waited, not one pushed since.
        let fresh = st;
        if (this.opts.schedule?.get().delayHours) fresh = await this.checker.check(c.Ref).catch(() => st);
        if (containerStatus(fresh, c.ImageID)?.status !== 'available') continue;
        const wait = this.waitFor(c.Ref, fresh);
        if (wait) { waiting.set(name, wait); continue; }
        if (this.opts.signal?.aborted) return;
        await this.updateOne(c.Id, name, c.Ref, this.opts.schedule?.get().delayHours ? fresh?.remoteDigest : undefined);
      } catch (e) {
        console.error(`kontainers: automatic update pass, ${name}: ${(e as Error).message}`);
      }
    }
    this.lastPassFailed = false;
    for (const [k, g] of newer) {
      const list = g.names.length > 10 ? `${g.names.slice(0, 10).join(', ')} and ${g.names.length - 10} more` : g.names.join(', ');
      const one = g.names.length === 1;
      await this.notifier?.send({ kind: 'update', title: `Newer image for ${g.ref}`, message: `${g.ref} has a newer image than the one ${list} ${one ? 'runs' : `run (${g.names.length} containers)`}.`, container: one ? g.names[0] : undefined },
        `update:${k}`).catch(e => console.error(`kontainers: notification failed: ${(e as Error).message}`));
    }
  }

  // expectDigest: the registry digest that waited out the delay; anything newer is not installed.
  private async updateOne(id: string, name: string, ref: string, expectDigest?: string): Promise<void> {
    const row = this.get(name);
    const release = this.busy.take(name);
    if (!release) return;
    let result: string;
    let held: string | null = row?.held_image ?? null;
    let heldDigests: string | null = row?.held_digests ?? null;
    // Sent after the lock is released: while it is held, the new container's own events are quiet.
    let note: { n: Parameters<Notifier['send']>[0]; key?: string; within?: number } | null = null;
    // Bookkeeping after the update must not turn an update that worked into a failure.
    const quietly = (what: string, fn: () => void) => { try { fn(); } catch (e) { writeFailed(e, `${what} for ${name}`); } };
    try {
      const r = await updateContainerDetailed(this.docker, id, { settleMs: this.opts.settleMs, healthTimeoutMs: this.opts.healthTimeoutMs, skipImage: held, signal: this.opts.signal, wasStopped: this.opts.wasStopped, journal: this.opts.journal, expectDigest });
      result = r.message;
      if (r.changed) {
        // The image it ran before, if Settings says so and nothing else uses it.
        const removed = this.opts.schedule?.cleanup() ? await removeReplacedImage(this.docker, r.oldImage) : null;
        if (removed) result = `${result.replace(/\.$/, '')}; ${removed}.`;
        held = null;
        heldDigests = null;
        this.recreated(name, r.id, id);
        quietly('could not record the automatic update', () => this.audit('auto-update', name));
        const what = r.running === false ? `${name} was recreated from the newest ${ref}; it was stopped before and is left stopped` : `${name} now runs the newest ${ref}`;
        note = { n: { kind: 'autoupdate', title: `Updated ${name}`, message: `${what}${r.note ? `; ${r.note}` : ''}.`, container: name } };
      }
    } catch (e) {
      result = (e as Error).message;
      // Held back only when the new image ran and then failed; a port in use or a failed pull is
      // not the image's fault, and the next check tries again.
      const holds = e instanceof UpdateFailed && e.held && !!e.newImage;
      if (holds) { held = (e as UpdateFailed).newImage; heldDigests = JSON.stringify((e as UpdateFailed).digests || []); }
      quietly('could not record the failed automatic update', () => this.audit('auto-update', name, `failed: ${result}`.slice(0, 500)));
      const next = holds ? 'That image is held back until a newer one appears.' : 'It will be tried again at the next check.';
      // kontainers stopping is not news to anyone; the next start's check tries again.
      if (this.opts.signal?.aborted) { quietly('could not save the result', () => this.db.query('UPDATE auto_update SET last_at = ?, last_result = ? WHERE container = ?').run(this.now(), result.slice(0, 500), name)); return; }
      note = { n: { kind: 'autoupdate', title: `Update of ${name} failed`, message: `${result}. ${next}`, container: name },
        key: `autoupdate-failed:${name}:${held ?? ''}:${Bun.hash(result).toString(36)}`, within: 86400_000 };
    } finally {
      release();
    }
    quietly('could not save the result', () => this.db.query('UPDATE auto_update SET last_at = ?, last_result = ?, held_image = ?, held_digests = ? WHERE container = ?').run(this.now(), result.slice(0, 500), held, held ? heldDigests : null, name));
    if (note) await this.notifier?.send(note.n, note.key, note.within).catch(e => console.error(`kontainers: notification failed: ${(e as Error).message}`));
    await this.checker.check(ref).catch(() => {});
  }
}
