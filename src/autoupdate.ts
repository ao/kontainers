// Automatic updates: containers kontainers created can be opted in, by name (the name survives the
// recreation an update does). After every update check, each opted-in container that has a newer
// image is updated the way Update image does it, and then watched: if the new container stops,
// restarts or turns unhealthy while it settles, the old one is put back and that image is held
// back, so the next check does not try it again. A newer image than the held one is tried.
// The same pass sends "update" notifications for containers that are not opted in.

import type { Database } from 'bun:sqlite';
import type { Docker } from './docker';
import type { Notifier } from './notify';
import { containerStatus, type UpdateChecker } from './updates';
import { updatable, updateContainerDetailed, UpdateFailed, type Journal } from './update';
import * as v from './validate';
import { NameLocks } from './locks';
import { writeFailed } from './storage';

export interface AutoRow { container: string; container_id: string; created_at: number; last_at: number | null; last_result: string | null; held_image: string | null }

export interface AutoOptions { settleMs: number; healthTimeoutMs: number; signal?: AbortSignal; wasStopped?: (id: string) => boolean; journal?: Journal }

// A container set aside by an update that is still running or was interrupted: <name>-old-<id>.
const setAside = (c: any, name: string) => c.Labels?.['kontainers.managed'] === 'true' && /-old-[0-9a-f]{8}$/.test(name) && String(c.Id).startsWith(name.slice(-8));

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

  // Turns automatic updates on or off for a container, which must be one Update image can handle.
  async set(id: string, on: boolean): Promise<string> {
    const c = await this.docker.inspect(id);
    const name = String(c.Name || '').replace(/^\//, '');
    if (on) {
      const refusal = updatable(c);
      if (refusal) throw new v.ValidationError(refusal);
      this.db.query('INSERT INTO auto_update (container, container_id, created_at) VALUES (?, ?, ?) ON CONFLICT (container) DO UPDATE SET container_id = excluded.container_id').run(name, c.Id, this.now());
      return `${name} will be updated automatically when a check finds a newer image.`;
    }
    this.db.query('DELETE FROM auto_update WHERE container = ?').run(name);
    this.unsaved.delete(name);
    return `${name} will no longer be updated automatically.${this.busy.has(name) ? ' An update or edit running now still finishes.' : ''}`;
  }

  // Forget a container that was removed.
  forget(name: string): void { this.db.query('DELETE FROM auto_update WHERE container = ?').run(name); this.unsaved.delete(name); }

  // Update image, Edit settings or an automatic update recreated the container under a new ID: it
  // stays opted in. Never throws: an update that worked must not be reported as failed.
  recreated(name: string, newId: string): void {
    try {
      this.db.query('UPDATE auto_update SET container_id = ? WHERE container = ?').run(newId, name);
      this.unsaved.delete(name);
    } catch (e) {
      writeFailed(e, `could not save the new container ID of ${name}`);
      if (this.get(name)) this.unsaved.set(name, newId);
    }
  }

  private idOf(row: AutoRow): string { return this.unsaved.get(row.container) ?? row.container_id; }

  // Opted in, and still the same container: a container removed outside kontainers and replaced
  // by another under the same name is not updated automatically.
  isOn(name: string, id: string): boolean { const row = this.get(name); return !!row && this.idOf(row) === id; }

  // The image an automatic update held back for this container, if any.
  heldImage(name: string): string | null { return this.get(name)?.held_image ?? null; }

  // After a check: update opted-in containers, notify about the others. One pass at a time.
  afterCheck(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.pass().finally(() => { this.running = null; });
    return this.running;
  }

  private async pass(): Promise<void> {
    for (const [name, id] of [...this.unsaved]) this.recreated(name, id);
    // "Newer image" notes go out once per image, naming every container that uses it.
    const newer = new Map<string, { ref: string; names: string[] }>();
    for (const c of await this.docker.listContainersWithRefs()) {
      const name = nameOf(c);
      // One container's trouble (a full data volume, a daemon error) must not stop the others.
      try {
        if (setAside(c, name)) continue;
        const st = this.checker.get(c.Ref);
        if (containerStatus(st, c.ImageID)?.status !== 'available') continue;
        const row = this.get(name);
        if (!row || this.idOf(row) !== c.Id) {
          const k = `${c.Ref}|${st?.remoteDigest || st?.imageId || ''}`;
          const g = newer.get(k) ?? { ref: String(c.Ref), names: [] as string[] };
          g.names.push(name);
          newer.set(k, g);
          continue;
        }
        if (this.busy.has(name)) continue; // a person is updating or editing it
        // The image that failed is what the tag points at here, and the registry has nothing newer.
        if (row.held_image && st?.imageId === row.held_image && st.status !== 'available') continue;
        if (this.opts.signal?.aborted) return;
        await this.updateOne(c.Id, name, c.Ref);
      } catch (e) {
        console.error(`kontainers: automatic update pass, ${name}: ${(e as Error).message}`);
      }
    }
    for (const [k, g] of newer) {
      const list = g.names.length > 10 ? `${g.names.slice(0, 10).join(', ')} and ${g.names.length - 10} more` : g.names.join(', ');
      const one = g.names.length === 1;
      await this.notifier?.send({ kind: 'update', title: `Newer image for ${g.ref}`, message: `${g.ref} has a newer image than the one ${list} ${one ? 'runs' : `run (${g.names.length} containers)`}.`, container: one ? g.names[0] : undefined },
        `update:${k}`).catch(e => console.error(`kontainers: notification failed: ${(e as Error).message}`));
    }
  }

  private async updateOne(id: string, name: string, ref: string): Promise<void> {
    const row = this.get(name);
    const release = this.busy.take(name);
    if (!release) return;
    let result: string;
    let held: string | null = row?.held_image ?? null;
    // Sent after the lock is released: while it is held, the new container's own events are quiet.
    let note: { n: Parameters<Notifier['send']>[0]; key?: string; within?: number } | null = null;
    // Bookkeeping after the update must not turn an update that worked into a failure.
    const quietly = (what: string, fn: () => void) => { try { fn(); } catch (e) { writeFailed(e, `${what} for ${name}`); } };
    try {
      const r = await updateContainerDetailed(this.docker, id, { settleMs: this.opts.settleMs, healthTimeoutMs: this.opts.healthTimeoutMs, skipImage: held, signal: this.opts.signal, wasStopped: this.opts.wasStopped, journal: this.opts.journal });
      result = r.message;
      if (r.changed) {
        held = null;
        this.recreated(name, r.id);
        quietly('could not record the automatic update', () => this.audit('auto-update', name));
        note = { n: { kind: 'autoupdate', title: `Updated ${name}`, message: `${name} now runs the newest ${ref}${r.note ? `; ${r.note}` : ''}.`, container: name } };
      }
    } catch (e) {
      result = (e as Error).message;
      // Held back only when the new image ran and then failed; a port in use or a failed pull is
      // not the image's fault, and the next check tries again.
      const holds = e instanceof UpdateFailed && e.held && !!e.newImage;
      if (holds) held = (e as UpdateFailed).newImage;
      quietly('could not record the failed automatic update', () => this.audit('auto-update', name, `failed: ${result}`.slice(0, 500)));
      const next = holds ? 'That image is held back until a newer one appears.' : 'It will be tried again at the next check.';
      // kontainers stopping is not news to anyone; the next start's check tries again.
      if (this.opts.signal?.aborted) { quietly('could not save the result', () => this.db.query('UPDATE auto_update SET last_at = ?, last_result = ? WHERE container = ?').run(this.now(), result.slice(0, 500), name)); return; }
      note = { n: { kind: 'autoupdate', title: `Update of ${name} failed`, message: `${result}. ${next}`, container: name },
        key: `autoupdate-failed:${name}:${held ?? ''}:${Bun.hash(result).toString(36)}`, within: 86400_000 };
    } finally {
      release();
    }
    quietly('could not save the result', () => this.db.query('UPDATE auto_update SET last_at = ?, last_result = ?, held_image = ? WHERE container = ?').run(this.now(), result.slice(0, 500), held, name));
    if (note) await this.notifier?.send(note.n, note.key, note.within).catch(e => console.error(`kontainers: notification failed: ${(e as Error).message}`));
    await this.checker.check(ref).catch(() => {});
  }
}
