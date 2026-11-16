// Replacements in progress (Update image, Edit settings, automatic updates), written down before the
// old container is stopped and crossed out when the replacement is finished or undone. After a
// restart in the middle of one, recoverInterrupted (update.ts) reads it to know what was running.
// A failed write (a full data volume) is logged and the replacement goes on without it.

import type { Database } from 'bun:sqlite';
import type { Journal } from './update';
import { writeFailed } from './storage';

export class ReplaceJournal implements Journal {
  constructor(private db: Database, private now: () => number = Date.now) {}

  begin(name: string, oldId: string, wasRunning: boolean): void {
    try {
      this.db.query('INSERT INTO replacing (name, old_id, was_running, at) VALUES (?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET old_id = excluded.old_id, was_running = excluded.was_running, at = excluded.at')
        .run(name, oldId, wasRunning ? 1 : 0, this.now());
    } catch (e) { writeFailed(e, `could not note the replacement of ${name}`); }
  }

  end(name: string): void {
    try { this.db.query('DELETE FROM replacing WHERE name = ?').run(name); } catch (e) { writeFailed(e, `could not note the end of the replacement of ${name}`); }
  }

  all(): { name: string; old_id: string; was_running: number }[] {
    return this.db.query('SELECT name, old_id, was_running FROM replacing').all() as { name: string; old_id: string; was_running: number }[];
  }
}
