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
import { updatable, updateContainerDetailed, UpdateFailed } from './update';
import * as v from './validate';
import { NameLocks } from './locks';

export interface AutoRow { container: string; container_id: string; created_at: number; last_at: number | null; last_result: string | null; held_image: string | null }

export interface AutoOptions { settleMs: number; healthTimeoutMs: number }

const nameOf = (c: any) => String(c.Names?.[0] || c.Name || '').replace(/^\//, '');

export class AutoUpdates {
  // Container names being updated right now, by this pass or by Update image.
  readonly busy = new NameLocks();
  private running: Promise<void> | null = null;

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
    return `${name} will no longer be updated automatically.`;
  }

  // Forget a container that was removed.
  forget(name: string): void { this.db.query('DELETE FROM auto_update WHERE container = ?').run(name); }

  // Update image recreated the container under a new ID: it stays opted in.
  recreated(name: string, newId: string): void { this.db.query('UPDATE auto_update SET container_id = ? WHERE container = ?').run(newId, name); }

  // Opted in, and still the same container: a container removed outside kontainers and replaced
  // by another under the same name is not updated automatically.
  isOn(name: string, id: string): boolean { return this.get(name)?.container_id === id; }

  // After a check: update opted-in containers, notify about the others. One pass at a time.
  afterCheck(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.pass().finally(() => { this.running = null; });
    return this.running;
  }

  private async pass(): Promise<void> {
    for (const c of await this.docker.listContainersWithRefs()) {
      const name = nameOf(c);
      const st = this.checker.get(c.Ref);
      if (containerStatus(st, c.ImageID)?.status !== 'available') continue;
      const row = this.get(name);
      if (!row || row.container_id !== c.Id) {
        await this.notifier?.send({ kind: 'update', title: `Newer image for ${name}`, message: `${c.Ref} has a newer image than the one ${name} runs.`, container: name },
          `update:${name}:${st?.remoteDigest || st?.imageId || ''}`);
        continue;
      }
      if (this.busy.has(name)) continue; // a person is updating or editing it
      // The image that failed is what the tag points at here, and the registry has nothing newer.
      if (row.held_image && st?.imageId === row.held_image && st.status !== 'available') continue;
      await this.updateOne(c.Id, name, c.Ref);
    }
  }

  private async updateOne(id: string, name: string, ref: string): Promise<void> {
    const row = this.get(name);
    const release = this.busy.take(name);
    if (!release) return;
    let result: string;
    let held: string | null = row?.held_image ?? null;
    // Bookkeeping after the update must not turn an update that worked into a failure.
    const quietly = (what: string, fn: () => void) => { try { fn(); } catch (e) { console.error(`kontainers: ${what} for ${name}: ${(e as Error).message}`); } };
    try {
      const r = await updateContainerDetailed(this.docker, id, { settleMs: this.opts.settleMs, healthTimeoutMs: this.opts.healthTimeoutMs, skipImage: held });
      result = r.message;
      if (r.changed) {
        held = null;
        quietly('could not note the new container ID', () => this.recreated(name, r.id));
        quietly('could not record the automatic update', () => this.audit('auto-update', name));
        await this.notifier?.send({ kind: 'autoupdate', title: `Updated ${name}`, message: `${name} now runs the newest ${ref}.`, container: name });
      }
    } catch (e) {
      result = (e as Error).message;
      // Held back only when the new image ran and then failed; a port in use or a failed pull is
      // not the image's fault, and the next check tries again.
      const holds = e instanceof UpdateFailed && e.held && !!e.newImage;
      if (holds) held = (e as UpdateFailed).newImage;
      quietly('could not record the failed automatic update', () => this.audit('auto-update', name, `failed: ${result}`.slice(0, 500)));
      const next = holds ? 'That image is held back until a newer one appears.' : 'It will be tried again at the next check.';
      await this.notifier?.send({ kind: 'autoupdate', title: `Update of ${name} failed`, message: `${result}. ${next}`, container: name },
        `autoupdate-failed:${name}:${held ?? ''}:${Bun.hash(result).toString(36)}`, 86400_000);
    } finally {
      release();
    }
    quietly('could not save the result', () => this.db.query('UPDATE auto_update SET last_at = ?, last_result = ?, held_image = ? WHERE container = ?').run(this.now(), result.slice(0, 500), held, name));
    await this.checker.check(ref).catch(() => {});
  }
}
