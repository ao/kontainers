// When automatic updates may run. Two settings, on the Settings page:
//   window  hours of the day (UTC), "02:00-05:00", or any time; it may cross midnight
//           ("22:00-04:00"), and may be limited to some days of the week (the day it starts on);
//   delay   hours a newer image waits after a check first saw it, so a release that is pulled
//           or fixed in its first hours is not installed (0: at once).
// Kept in the settings table; first-seen times of images in image_seen.

import type { Database } from 'bun:sqlite';
import * as v from './validate';
import { writeFailed } from './storage';

export interface Schedule { start: number | null; end: number | null; days: number[]; delayHours: number }
export const ANY_TIME: Schedule = { start: null, end: null, days: [], delayHours: 0 };
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "HH:MM" to minutes after midnight.
export function parseTime(s: unknown, what: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s ?? '').trim());
  if (!m) throw new v.ValidationError(`${what} must be a time such as 02:00`);
  return Number(m[1]) * 60 + Number(m[2]);
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function validateSchedule(input: { start?: unknown; end?: unknown; days?: unknown[]; delayHours?: unknown }): Schedule {
  const startS = String(input.start ?? '').trim(), endS = String(input.end ?? '').trim();
  let start: number | null = null, end: number | null = null;
  if (startS || endS) {
    start = parseTime(startS, 'the start of the window');
    end = parseTime(endS, 'the end of the window');
    if (start === end) throw new v.ValidationError('the window starts and ends at the same time; leave both empty for any time');
    // An update can take a few minutes, and the check for due updates runs every minute.
    if ((end - start + 1440) % 1440 < 15) throw new v.ValidationError('the window must be at least 15 minutes long');
  }
  const days = [...new Set((input.days || []).map(d => Number(d)))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const delayHours = Number(String(input.delayHours ?? '0').trim() || '0');
  if (!Number.isInteger(delayHours) || delayHours < 0 || delayHours > 720) throw new v.ValidationError('the delay must be a whole number of hours from 0 to 720');
  return { start, end, days: days.length === 7 ? [] : days, delayHours };
}

// True if automatic updates may run at `at` (ms). Days count for the day the window starts on, so
// a Friday 22:00-04:00 window includes early Saturday.
export function inWindow(s: Schedule, at: number): boolean {
  const d = new Date(at);
  const min = d.getUTCHours() * 60 + d.getUTCMinutes();
  const day = d.getUTCDay();
  if (s.start === null || s.end === null) return !s.days.length || s.days.includes(day);
  if (s.start < s.end) return min >= s.start && min < s.end && (!s.days.length || s.days.includes(day));
  // Across midnight: before midnight it is the start day; after, the day before.
  if (min >= s.start) return !s.days.length || s.days.includes(day);
  if (min < s.end) return !s.days.length || s.days.includes((day + 6) % 7);
  return false;
}

// The next time (ms) at or after `at` that is in the window; `at` itself when it is. A window
// opens at its start time (or at midnight, without one) on one of the next eight days.
export function nextWindow(s: Schedule, at: number): number {
  if (inWindow(s, at)) return at;
  const day0 = Math.floor(at / 86400_000) * 86400_000;
  const opens = (s.start ?? 0) * 60_000;
  for (let i = 0; i <= 8; i++) {
    const t = day0 + i * 86400_000 + opens;
    if (t >= at && inWindow(s, t)) return t;
  }
  return at; // no time at all fits (cannot happen with a valid schedule)
}

export function describeSchedule(s: Schedule): string {
  const days = s.days.length ? ` on ${s.days.map(d => DAY_NAMES[d]).join(', ')}` : '';
  const when = s.start === null || s.end === null ? (days ? `at any time${days}` : 'at any time') : `between ${hhmm(s.start)} and ${hhmm(s.end)} UTC${days}`;
  return s.delayHours ? `${when}, once a newer image has been seen for ${s.delayHours} hour${s.delayHours === 1 ? '' : 's'}` : when;
}

export const formTime = (min: number | null) => (min === null ? '' : hhmm(min));

export class ScheduleStore {
  // A schedule given by the environment (KONTAINERS_AUTOUPDATE_WINDOW and _DELAY_HOURS) applies
  // until one is saved on the Settings page.
  constructor(private db: Database, private fallback: Schedule = ANY_TIME, private now: () => number = Date.now, private cleanupFallback = false) {}

  // Whether the image a container ran before is removed after an update that worked (Settings;
  // KONTAINERS_AUTOUPDATE_CLEANUP until it is saved there).
  cleanup(): boolean {
    try {
      const r = this.db.query("SELECT value FROM settings WHERE key = 'update.cleanup'").get() as { value: string } | null;
      return r ? r.value === '1' : this.cleanupFallback;
    } catch { return this.cleanupFallback; }
  }
  setCleanup(on: boolean): void {
    this.db.query("INSERT INTO settings (key, value) VALUES ('update.cleanup', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(on ? '1' : '0');
  }

  // The last schedule read: a database error keeps it rather than falling back to "any time".
  private last: Schedule | null = null;
  get(): Schedule {
    try {
      const r = this.db.query("SELECT value FROM settings WHERE key = 'autoupdate.schedule'").get() as { value: string } | null;
      if (!r) return (this.last = this.fallback);
      const s = JSON.parse(r.value);
      return (this.last = { start: s.start ?? null, end: s.end ?? null, days: s.days ?? [], delayHours: s.delayHours ?? 0 });
    } catch (e) {
      console.error(`kontainers: could not read the automatic-update schedule: ${(e as Error).message}`);
      return this.last ?? this.fallback;
    }
  }

  // Whether a schedule was saved on the Settings page (then the environment's no longer applies).
  saved(): boolean { try { return !!this.db.query("SELECT 1 FROM settings WHERE key = 'autoupdate.schedule'").get(); } catch { return false; } }

  set(s: Schedule): void {
    this.db.query("INSERT INTO settings (key, value) VALUES ('autoupdate.schedule', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(JSON.stringify(s));
  }

  // When a check first saw this image (a registry digest or a local image ID) for this reference;
  // noted now if it is new. Kept 60 days.
  firstSeen(ref: string, image: string): number {
    const r = this.db.query('SELECT first_seen FROM image_seen WHERE ref = ? AND image = ?').get(ref, image) as { first_seen: number } | null;
    if (r) return r.first_seen;
    const now = this.now();
    try {
      this.db.query('INSERT INTO image_seen (ref, image, first_seen) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(ref, image, now);
      this.db.query('DELETE FROM image_seen WHERE first_seen < ?').run(now - 60 * 86400_000);
    } catch (e) { writeFailed(e, 'could not note when an image was first seen'); }
    return now;
  }
}

// Reads KONTAINERS_AUTOUPDATE_WINDOW ("02:00-05:00", optionally followed by days: "02:00-05:00
// Mon,Tue") and KONTAINERS_AUTOUPDATE_DELAY_HOURS.
export function scheduleFromEnv(window: string | undefined, delay: string | undefined): Schedule {
  const w = String(window ?? '').trim();
  const m = /^(\S+?)-(\S+)(?:\s+(.+))?$/.exec(w);
  if (w && !m) throw new Error('KONTAINERS_AUTOUPDATE_WINDOW must look like 02:00-05:00, optionally followed by days (Mon,Tue or Mon-Fri)');
  // Days by their three-letter or full English names, or ranges of them (Mon-Fri, Fri-Mon).
  const dayOf = (t: string) => {
    const i = DAY_NAMES.findIndex(n => n.toLowerCase() === t.toLowerCase() || FULL_DAYS[DAY_NAMES.indexOf(n)] === t.toLowerCase());
    if (i < 0) throw new Error(`KONTAINERS_AUTOUPDATE_WINDOW: "${t}" is not a day; days are Sun, Mon, Tue, Wed, Thu, Fri, Sat`);
    return i;
  };
  const days: number[] = [];
  for (const tok of m?.[3] ? m[3].split(/[,\s]+/).filter(Boolean) : []) {
    const r = /^([A-Za-z]+)-([A-Za-z]+)$/.exec(tok);
    if (!r) { days.push(dayOf(tok)); continue; }
    for (let d = dayOf(r[1]), n = 0; n < 7; d = (d + 1) % 7, n++) { days.push(d); if (d === dayOf(r[2])) break; }
  }
  try {
    return validateSchedule({ start: m?.[1] ?? '', end: m?.[2] ?? '', days, delayHours: delay ?? '0' });
  } catch (e) {
    throw new Error(`KONTAINERS_AUTOUPDATE_WINDOW / KONTAINERS_AUTOUPDATE_DELAY_HOURS: ${(e as Error).message}`);
  }
}
