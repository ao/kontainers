// Notifications: kontainers posts a short message to each configured target when something happens
// that someone should know about. Two kinds of target:
//   webhook  a JSON POST: { event, title, message, container, at, text, content }. `text` and
//            `content` repeat the message for receivers that read one of those fields.
//   ntfy     a plain-text POST to an ntfy topic URL, with Title and Tags headers.
// Targets and the record of what was sent live in SQLite. Sending never throws: a failure is kept
// on the target and shown on the Settings page.

import type { Database } from 'bun:sqlite';
import * as v from './validate';

export const EVENTS = {
  update: 'a container has a newer image',
  autoupdate: 'an automatic update ran or failed',
  exit: 'a container stopped on its own (crash, error exit, out of memory)',
  health: 'a container became unhealthy',
  cert: 'a certificate is missing or close to expiry',
} as const;
export type EventKind = keyof typeof EVENTS;
export const EVENT_KINDS = Object.keys(EVENTS) as EventKind[];

export type TargetKind = 'webhook' | 'ntfy';
export interface Target {
  id: number; kind: TargetKind; url: string; token: string | null; events: EventKind[];
  created_at: number; last_at: number | null; last_result: string | null;
}
export interface Note { kind: EventKind | 'test'; title: string; message: string; container?: string }

const MAX_URL = 2000;

export function validateTarget(input: { kind?: unknown; url?: unknown; token?: unknown; events?: unknown[] }): { kind: TargetKind; url: string; token: string | null; events: EventKind[] } {
  const kind = input.kind === 'ntfy' ? 'ntfy' : input.kind === 'webhook' ? 'webhook' : null;
  if (!kind) throw new v.ValidationError('choose webhook or ntfy');
  const url = String(input.url ?? '').trim();
  let u: URL;
  try { u = new URL(url); } catch { throw new v.ValidationError('the URL is not valid'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new v.ValidationError('the URL must start with https:// or http://');
  if (url.length > MAX_URL) throw new v.ValidationError(`the URL is longer than ${MAX_URL} characters`);
  if (/[\s\u0000-\u001f]/.test(url)) throw new v.ValidationError('the URL contains spaces or control characters');
  const token = String(input.token ?? '').trim();
  if (token.length > 500 || /[\s\u0000-\u001f]/.test(token)) throw new v.ValidationError('the token must be one word of at most 500 characters');
  const events = [...new Set((input.events || []).map(String))].filter((e): e is EventKind => (EVENT_KINDS as string[]).includes(e));
  if (!events.length) throw new v.ValidationError('choose at least one event');
  return { kind, url, token: token || null, events };
}

// What the Settings page shows of a URL: scheme, host and port. Paths and queries often carry a
// secret (a Discord webhook token, an ntfy topic), so they are not shown.
export function maskUrl(url: string): string {
  try { const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname.length > 1 || u.search ? '/…' : '/'}`; } catch { return '(invalid URL)'; }
}

const row = (r: any): Target => ({ ...r, events: String(r.events).split(',').filter(Boolean) as EventKind[] });

export class Notifier {
  constructor(
    private db: Database,
    private fetchImpl: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
    private now: () => number = Date.now,
  ) {}

  list(): Target[] { return this.db.query('SELECT * FROM notify_targets ORDER BY id').all().map(row); }
  get(id: number): Target | null { const r = this.db.query('SELECT * FROM notify_targets WHERE id = ?').get(id); return r ? row(r) : null; }

  add(input: Parameters<typeof validateTarget>[0]): Target {
    const t = validateTarget(input);
    if ((this.db.query('SELECT COUNT(*) AS n FROM notify_targets').get() as { n: number }).n >= 20) throw new v.ValidationError('at most 20 notification targets');
    const r = this.db.query('INSERT INTO notify_targets (kind, url, token, events, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .get(t.kind, t.url, t.token, t.events.join(','), this.now());
    return row(r);
  }

  remove(id: number): void {
    if (!this.db.query('DELETE FROM notify_targets WHERE id = ?').run(id).changes) throw Object.assign(new v.ValidationError('notification target not found'), { status: 404 });
  }

  // True if a note with this key went out within `withinMs`; otherwise records it as sent now.
  // Keys name a fact ("update:web:sha256:...") so the same fact is reported once.
  claim(key: string, withinMs: number): boolean {
    const prev = this.db.query('SELECT at FROM notify_sent WHERE key = ?').get(key) as { at: number } | null;
    if (prev && this.now() - prev.at < withinMs) return false;
    this.db.query('INSERT INTO notify_sent (key, at) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET at = excluded.at').run(key, this.now());
    // Keep the table small: facts older than 60 days are forgotten.
    this.db.query('DELETE FROM notify_sent WHERE at < ?').run(this.now() - 60 * 86400_000);
    return true;
  }

  // Sends to every target subscribed to the note's kind. With a key, sends only if that fact was
  // not reported within `withinMs`. Returns how many targets it was sent to.
  async send(note: Note, key?: string, withinMs = Infinity): Promise<number> {
    const targets = this.list().filter(t => note.kind === 'test' || t.events.includes(note.kind));
    if (!targets.length) return 0;
    if (key && !this.claim(key, withinMs)) return 0;
    await Promise.all(targets.map(t => this.deliver(t, note)));
    return targets.length;
  }

  // Sends a test note to one target and returns the result shown to the user.
  async test(id: number): Promise<string> {
    const t = this.get(id);
    if (!t) throw Object.assign(new v.ValidationError('notification target not found'), { status: 404 });
    return this.deliver(t, { kind: 'test', title: 'kontainers test notification', message: 'This target receives kontainers notifications.' });
  }

  private async deliver(t: Target, note: Note): Promise<string> {
    const at = this.now();
    let result: string;
    try {
      const headers: Record<string, string> = { 'user-agent': 'kontainers' };
      if (t.token) headers.authorization = `Bearer ${t.token}`;
      let body: string;
      if (t.kind === 'ntfy') {
        headers['content-type'] = 'text/plain; charset=utf-8';
        // Header values must be ASCII; ntfy reads RFC 2047 encoded words for anything else.
        headers.title = /^[\x20-\x7e]*$/.test(note.title) ? note.title : `=?UTF-8?B?${Buffer.from(note.title).toString('base64')}?=`;
        headers.tags = note.kind;
        body = note.message;
      } else {
        headers['content-type'] = 'application/json';
        const text = `${note.title}: ${note.message}`;
        body = JSON.stringify({ event: note.kind, title: note.title, message: note.message, container: note.container ?? null, at: new Date(at).toISOString(), text, content: text });
      }
      const res = await this.fetchImpl(t.url, { method: 'POST', headers, body, redirect: 'follow', signal: AbortSignal.timeout(10000) });
      result = res.ok ? `sent (HTTP ${res.status})` : `failed: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`.trim();
    } catch (e) {
      result = `failed: ${((e as Error).message || String(e)).slice(0, 200)}`;
    }
    this.db.query('UPDATE notify_targets SET last_at = ?, last_result = ? WHERE id = ?').run(at, result, t.id);
    if (result.startsWith('failed')) console.error(`kontainers: notification to ${maskUrl(t.url)} ${result}`);
    return result;
  }
}
