// Copies of the database in <data>/backups, private to kontainers' user (0600, in a 0700 directory):
//   kontainers-YYYY-MM-DD.db       one a day (UTC), the newest KONTAINERS_BACKUP_KEEP kept (7; 0: none)
//   before-schema-N-YYYYMMDD-HHMMSS.db
//                                  taken before a migration to schema N, the newest 3 kept, so an
//                                  older kontainers can be started again on the copy
// They are in the same volume as the database: they help after a bad upgrade or a mistake, not
// after losing the volume. Copy them elsewhere for that.

import type { Database } from 'bun:sqlite';
import { readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { backupDir, snapshot } from './db';
import * as v from './validate';

const DAILY = /^kontainers-(\d{4}-\d{2}-\d{2})\.db$/;
const BEFORE = /^before-schema-(\d+)-(\d{8}-\d{6})\.db$/;

export interface BackupFile { name: string; size: number; at: number; kind: 'daily' | 'before-migration' }

export class Backups {
  constructor(private db: Database, private dataDir: string, readonly keep: number, private now: () => number = Date.now) {}

  // Newest first, by the time in the name (a copied file's own time can be anything).
  list(): BackupFile[] {
    let names: string[];
    try { names = readdirSync(join(this.dataDir, 'backups')); } catch { return []; }
    const out: (BackupFile & { key: string })[] = [];
    for (const name of names) {
      const d = DAILY.exec(name), m = BEFORE.exec(name);
      if (!d && !m) continue;
      const key = d ? `${d[1].replace(/-/g, '')}-000000` : m![2];
      try { const st = statSync(join(this.dataDir, 'backups', name)); out.push({ name, size: st.size, at: st.mtimeMs, kind: d ? 'daily' : 'before-migration', key }); } catch { /* removed meanwhile */ }
    }
    return out.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)).map(({ key: _k, ...f }) => f);
  }

  // The path of a backup by name, for a download; a ValidationError for anything else.
  path(name: string): string {
    if (typeof name !== 'string' || !(DAILY.test(name) || BEFORE.test(name))) throw Object.assign(new v.ValidationError('no such backup'), { status: 404 });
    const p = join(this.dataDir, 'backups', name);
    try { statSync(p); } catch { throw Object.assign(new v.ValidationError('no such backup'), { status: 404 }); }
    return p;
  }

  // Today's copy, if there is none yet; then the old ones beyond `keep` are removed. Returns the
  // name written, or null (none due, or daily copies are off).
  daily(): string | null {
    if (this.keep <= 0) return null;
    const name = `kontainers-${new Date(this.now()).toISOString().slice(0, 10)}.db`;
    const dir = backupDir(this.dataDir);
    let wrote: string | null = null;
    if (!this.list().some(b => b.name === name)) {
      const tmp = join(dir, `.${name}.part`);
      try { unlinkSync(tmp); } catch { /* none */ }
      snapshot(this.db, tmp);
      // Renamed into place only when complete, so a half-written copy never looks like a backup.
      renameSync(tmp, join(dir, name));
      wrote = name;
    }
    this.prune();
    return wrote;
  }

  prune(): void {
    const all = this.list();
    const drop = [...all.filter(b => b.kind === 'daily').slice(Math.max(this.keep, 0)), ...all.filter(b => b.kind === 'before-migration').slice(3)];
    for (const b of drop) { try { unlinkSync(join(this.dataDir, 'backups', b.name)); } catch { /* gone */ } }
  }
}
