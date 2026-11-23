// What happened to each container, from Docker's events, kept in the database: Docker keeps only
// its last few hundred events in memory (on a busy host, minutes), and none across a restart.
// Recorded by name, so the history follows a container across updates (each makes a new one), and
// by the container's ID, so its own entries stay with it under another name (compose creates a
// replacement as <id>_<name> and renames it; docker rename).

import type { Database } from 'bun:sqlite';
import type { DockerEvent } from './events';
import { diskFull } from './storage';

// The events worth showing; exec_* (every healthcheck), attach, resize, top and the like are not.
const KEPT = new Set(['create', 'start', 'restart', 'die', 'kill', 'stop', 'oom', 'pause', 'unpause', 'rename', 'destroy', 'health_status', 'update']);
// Per name, so a container that crashes in a loop does not push out everyone else's history; and
// in all, so a host that runs a new container a minute (CI jobs, --rm) does not fill the volume.
const PER_NAME = 2000;
const TOTAL = 300_000;
// A container ID is kept as its first 16 characters: enough to tell containers apart.
export const ID_CHARS = 16;
const FULL_DISK = (e: unknown) => diskFull(e) || /SQLITE_IOERR|disk I\/O error/i.test(`${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? ''}`);

// nano: the event's time in nanoseconds, as text (it does not fit a JavaScript number exactly).
export interface HistoryRow { at: number; nano: string; container_id: string; name: string; action: string; detail: string | null }
type Pending = [number, string, string, string, string | null];

export class History {
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private touched = new Set<string>();
  // The full name of a container an update set aside, by its ID: the set-aside name is cut to fit
  // Docker's 128 characters, so a long name cannot be read back from it.
  private aside = new Map<string, string>();
  // After a write fails for want of room, none is tried for a minute (and it is said once), so a
  // full volume does not log an error per event.
  private fullUntil = 0;
  constructor(private db: Database, private days: number, private now: () => number = Date.now,
    private later: (fn: () => void) => ReturnType<typeof setTimeout> | null = fn => setTimeout(fn, 1000)) {}

  get enabled(): boolean { return this.days > 0; }

  // One event from the stream (or a replay of the daemon's buffer). Written a second later, with
  // the others of that second in one transaction; duplicates are ignored, so the two can overlap.
  record(ev: DockerEvent): void {
    if (!this.enabled || (ev.Type ?? 'container') !== 'container') return;
    const full = String(ev.Action ?? ev.status ?? '');
    const action = full.startsWith('health_status') ? 'health_status' : full;
    if (!KEPT.has(action)) return;
    const id = String(ev.Actor?.ID || ev.id || '');
    const a = ev.Actor?.Attributes || {};
    // A container an update or edit set aside (<name>-old-<the first 8 of its own ID>) is recorded
    // under its name: its stop and removal are part of that container's story. Only then: a
    // container really called pg-old-20250101 keeps its own name.
    // Compose makes a replacement as <old id>_<name> and renames it once the old one is gone: its
    // creation is part of <name>'s story too.
    const own = String(a.name || id.slice(0, 12)).replace(/^\//, '');
    const m = /^(.+)-old-([0-9a-f]{8})$/.exec(own);
    const setAside = !!m && id.startsWith(m[2]);
    const oldName = String(a.oldName || '').replace(/^\//, '');
    if (setAside && action === 'rename' && oldName) this.aside.set(id, oldName);
    const name = setAside ? this.aside.get(id) ?? m![1] : /^[0-9a-f]{12}_(.+)$/.exec(own)?.[1] ?? own;
    if (action === 'destroy') this.aside.delete(id);
    if (this.aside.size > 1000) this.aside.clear();
    if (!id || !name) return;
    const nano = ev.timeNano ?? (ev.time ? ev.time * 1e9 : this.now() * 1e6);
    // Only what the page says: never the container's labels, which Docker puts in the attributes.
    const detail = action === 'die' ? a.exitCode ?? null
      : action === 'kill' ? a.signal ?? null
      : action === 'health_status' ? full.split(':')[1]?.trim() || null
      : action === 'rename' ? String(a.oldName || '').replace(/^\//, '') || null
      : action === 'create' ? a.image ?? null
      : null;
    this.queue.push([nano, id.slice(0, ID_CHARS), name.slice(0, 255), action, detail === null ? null : String(detail).slice(0, 255)]);
    // A docker rename: the old name's history says where the container went.
    if (action === 'rename' && !setAside && oldName && !/^[0-9a-f]{12}_/.test(oldName) && oldName !== name) {
      this.queue.push([nano, id.slice(0, ID_CHARS), oldName.slice(0, 255), 'rename_to', name.slice(0, 255)]);
    }
    if (this.queue.length >= 500) this.flush();
    else if (!this.timer) this.timer = this.later(() => { this.timer = null; this.flush(); });
  }

  // Writes what is waiting (also before every read, and at shutdown).
  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.queue.length) return;
    const rows = this.queue;
    this.queue = [];
    if (this.now() < this.fullUntil) return;
    try {
      const ins = this.db.query('INSERT OR IGNORE INTO container_events (nano, container_id, name, action, detail) VALUES (?, ?, ?, ?, ?)');
      this.db.transaction(() => { for (const r of rows) ins.run(...r); })();
      for (const r of rows) this.touched.add(r[2]);
    } catch (e) {
      if (!FULL_DISK(e)) throw e;
      if (!this.fullUntil) console.error('kontainers: the container history is not recorded while the data volume is full or read-only');
      this.fullUntil = this.now() + 60_000;
    }
  }

  // The newest entries for a container: under its name, or its own ID (the first ID_CHARS), newest
  // first; before: older than this time (nanoseconds, as text). One more than asked is looked up,
  // so the page knows whether there are older ones.
  forName(name: string, id: string, limit = 50, before?: string): { rows: HistoryRow[]; more: boolean } {
    this.flush();
    const all = this.db.query(`SELECT CAST(nano AS TEXT) AS nano, container_id, name, action, detail FROM container_events
      WHERE (name = ? OR (container_id = ? AND action != 'rename_to')) AND nano < CAST(? AS INTEGER) ORDER BY nano DESC LIMIT ?`)
      .all(name, id.slice(0, ID_CHARS), before ?? '9223372036854775807', limit + 1) as Omit<HistoryRow, 'at'>[];
    const rows = all.slice(0, limit).map(r => ({ ...r, at: Math.floor(Number(r.nano) / 1e6) }));
    return { rows, more: all.length > limit };
  }

  // The time of the newest event recorded, in seconds, to replay the daemon's buffer from at start.
  lastSeconds(): number | null {
    this.flush();
    const r = this.db.query('SELECT MAX(nano) AS n FROM container_events').get() as { n: number | null };
    return r.n ? r.n / 1e9 : null;
  }

  // Older than the kept days; beyond the newest PER_NAME of a name written to since the last time;
  // beyond the newest TOTAL in all.
  prune(): void {
    this.flush();
    this.db.query('DELETE FROM container_events WHERE nano < ?').run((this.now() - this.days * 86_400_000) * 1e6);
    const names = [...this.touched];
    this.touched.clear();
    for (const name of names) {
      const n = (this.db.query('SELECT COUNT(*) AS n FROM container_events WHERE name = ?').get(name) as { n: number }).n;
      if (n > PER_NAME) this.db.query('DELETE FROM container_events WHERE name = ? AND nano < (SELECT nano FROM container_events WHERE name = ? ORDER BY nano DESC LIMIT 1 OFFSET ?)').run(name, name, PER_NAME - 1);
    }
    this.db.query('DELETE FROM container_events WHERE nano < (SELECT nano FROM container_events ORDER BY nano DESC LIMIT 1 OFFSET ?)').run(TOTAL - 1);
  }
}

// Linux signal numbers, as docker kill reports them.
const SIGNALS: Record<string, string> = { 1: 'SIGHUP', 2: 'SIGINT', 3: 'SIGQUIT', 6: 'SIGABRT', 9: 'SIGKILL', 10: 'SIGUSR1', 12: 'SIGUSR2', 15: 'SIGTERM', 28: 'SIGWINCH' };

// What an entry says on the page.
export function describe(r: Pick<HistoryRow, 'action' | 'detail' | 'name'>): string {
  switch (r.action) {
    case 'create': return r.detail ? `created from ${r.detail}` : 'created';
    case 'start': return 'started';
    case 'restart': return 'restarted';
    case 'die': return r.detail === '0' ? 'exited (exit code 0)' : r.detail === '137' ? 'killed (exit code 137, SIGKILL)' : r.detail ? `stopped with exit code ${r.detail}` : 'stopped';
    case 'kill': {
      const sig = r.detail ? SIGNALS[r.detail] ?? (/^\d+$/.test(r.detail) ? `signal ${r.detail}` : r.detail.startsWith('SIG') ? r.detail : `SIG${r.detail}`) : null;
      return sig ? `sent ${sig}` : 'killed';
    }
    case 'stop': return 'stopped on request (docker stop, or a restart)';
    case 'oom': return 'ran out of memory';
    case 'pause': return 'paused';
    case 'unpause': return 'unpaused';
    // The rename an update or edit makes of the old container, filed under its name.
    case 'rename': return r.detail && r.detail === r.name ? 'set aside by an update or edit' : r.detail ? `renamed from ${r.detail}` : 'renamed';
    case 'rename_to': return `renamed to ${r.detail ?? 'another name'}`;
    case 'destroy': return 'removed';
    case 'health_status': return r.detail === 'unhealthy' ? 'turned unhealthy' : r.detail === 'healthy' ? 'turned healthy' : `health: ${r.detail ?? 'unknown'}`;
    case 'update': return 'its limits or restart policy were changed';
    default: return r.action;
  }
}
