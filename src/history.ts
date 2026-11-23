// What happened to each container, from Docker's events, kept in the database: Docker keeps only
// its last few hundred events in memory (on a busy host, minutes), and none across a restart.
// Recorded by name, so the history follows a container across updates (each makes a new one).

import type { Database } from 'bun:sqlite';
import type { DockerEvent } from './events';
import { diskFull } from './storage';

// The events worth showing; exec_* (every healthcheck), attach, resize, top and the like are not.
const KEPT = new Set(['create', 'start', 'restart', 'die', 'kill', 'stop', 'oom', 'pause', 'unpause', 'rename', 'destroy', 'health_status', 'update']);
// Per name, so a container that crashes in a loop does not push out everyone else's history.
const PER_NAME = 2000;

export interface HistoryRow { at: number; container_id: string; name: string; action: string; detail: string | null }

export class History {
  private inserts = 0;
  // After a write fails for want of room, none is tried for a minute (and it is said once), so a
  // full volume does not log an error per event.
  private fullUntil = 0;
  constructor(private db: Database, private days: number, private now: () => number = Date.now) {}

  get enabled(): boolean { return this.days > 0; }

  // One event from the stream (or a replay of the daemon's buffer): duplicates are ignored, so
  // the two can overlap.
  record(ev: DockerEvent): void {
    if (!this.enabled || (ev.Type ?? 'container') !== 'container') return;
    const full = String(ev.Action ?? ev.status ?? '');
    const action = full.startsWith('health_status') ? 'health_status' : full;
    if (!KEPT.has(action)) return;
    const id = String(ev.Actor?.ID || ev.id || '');
    const a = ev.Actor?.Attributes || {};
    // A container an update set aside (<name>-old-<8 hex>) is recorded under its name: its stop and
    // removal are part of that container's story.
    const own = String(a.name || id.slice(0, 12)).replace(/^\//, '');
    const name = /^(.+)-old-[0-9a-f]{8}$/.exec(own)?.[1] ?? own;
    if (!id || !name) return;
    const nano = ev.timeNano ?? (ev.time ? ev.time * 1e9 : this.now() * 1e6);
    // Only what the page says: never the container's labels, which Docker puts in the attributes.
    const detail = action === 'die' ? a.exitCode ?? null
      : action === 'kill' ? a.signal ?? null
      : action === 'health_status' ? full.split(':')[1]?.trim() || null
      : action === 'rename' ? String(a.oldName || '').replace(/^\//, '') || null
      : action === 'create' ? a.image ?? null
      : null;
    if (this.now() < this.fullUntil) return;
    try {
      this.db.query('INSERT OR IGNORE INTO container_events (at, nano, container_id, name, action, detail) VALUES (?, ?, ?, ?, ?, ?)')
        .run(Math.floor(nano / 1e6), nano, id, name.slice(0, 255), action, detail === null ? null : String(detail).slice(0, 255));
    } catch (e) {
      if (!diskFull(e)) throw e;
      if (!this.fullUntil) console.error('kontainers: the container history is not recorded while the data volume is full or read-only');
      this.fullUntil = this.now() + 60_000;
      return;
    }
    if (++this.inserts % 1000 === 0) this.prune();
  }

  // The newest entries for a container name, newest first; before: older than this time (ms).
  forName(name: string, limit = 100, before = Number.MAX_SAFE_INTEGER): HistoryRow[] {
    return this.db.query('SELECT at, container_id, name, action, detail FROM container_events WHERE name = ? AND at < ? ORDER BY nano DESC LIMIT ?')
      .all(name, before, limit) as HistoryRow[];
  }

  // The time of the newest event recorded, in seconds, to replay the daemon's buffer from at start.
  lastSeconds(): number | null {
    const r = this.db.query('SELECT MAX(nano) AS n FROM container_events').get() as { n: number | null };
    return r.n ? r.n / 1e9 : null;
  }

  // Older than the kept days, and beyond the newest PER_NAME of a name.
  prune(): void {
    this.db.query('DELETE FROM container_events WHERE at < ?').run(this.now() - this.days * 86_400_000);
    const big = this.db.query('SELECT name FROM container_events GROUP BY name HAVING COUNT(*) > ?').all(PER_NAME) as { name: string }[];
    for (const { name } of big) {
      this.db.query('DELETE FROM container_events WHERE name = ? AND rowid NOT IN (SELECT rowid FROM container_events WHERE name = ? ORDER BY nano DESC LIMIT ?)').run(name, name, PER_NAME);
    }
  }
}

// What an entry says on the page.
export function describe(r: HistoryRow): string {
  switch (r.action) {
    case 'create': return r.detail ? `created from ${r.detail}` : 'created';
    case 'start': return 'started';
    case 'restart': return 'restarted';
    case 'die': return r.detail === '0' ? 'exited (exit code 0)' : r.detail === '137' ? 'killed (exit code 137, SIGKILL)' : r.detail ? `stopped with exit code ${r.detail}` : 'stopped';
    case 'kill': return r.detail ? `sent ${/^\d+$/.test(r.detail) ? `signal ${r.detail}` : r.detail.startsWith('SIG') ? r.detail : `SIG${r.detail}`}` : 'killed';
    case 'stop': return 'stopped (docker stop)';
    case 'oom': return 'ran out of memory';
    case 'pause': return 'paused';
    case 'unpause': return 'unpaused';
    case 'rename': return r.detail ? `renamed from ${r.detail}` : 'renamed';
    case 'destroy': return 'removed';
    case 'health_status': return r.detail === 'unhealthy' ? 'turned unhealthy' : r.detail === 'healthy' ? 'turned healthy' : `health: ${r.detail ?? 'unknown'}`;
    case 'update': return 'its limits or restart policy were changed';
    default: return r.action;
  }
}
