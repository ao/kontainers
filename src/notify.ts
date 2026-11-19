// Notifications: kontainers posts a short message to each configured target when something happens
// that someone should know about. Two kinds of target:
//   webhook  a JSON POST: { event, title, message, container, at, text, content }. `text` and
//            `content` repeat the message for receivers that read one of those fields.
//   ntfy     a plain-text POST to an ntfy topic URL, with Title and Tags headers.
// Targets and the record of what was sent live in SQLite. Sending never throws: a failure is kept
// on the target and shown on the Settings page.

import type { Database } from 'bun:sqlite';
import * as v from './validate';
import { writeFailed } from './storage';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

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

// blocked: hosts a notification must never be sent to, such as the Docker API kontainers uses
// (a POST there would be a Docker API call).
export function validateTarget(input: { kind?: unknown; url?: unknown; token?: unknown; events?: unknown[] }, blocked: string[] = []): { kind: TargetKind; url: string; token: string | null; events: EventKind[] } {
  const kind = input.kind === 'ntfy' ? 'ntfy' : input.kind === 'webhook' ? 'webhook' : null;
  if (!kind) throw new v.ValidationError('choose webhook or ntfy');
  const url = String(input.url ?? '').trim();
  let u: URL;
  try { u = new URL(url); } catch { throw new v.ValidationError('the URL is not valid'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new v.ValidationError('the URL must start with https:// or http://');
  if (url.length > MAX_URL) throw new v.ValidationError(`the URL is longer than ${MAX_URL} characters`);
  if (/[\s\u0000-\u001f]/.test(url)) throw new v.ValidationError('the URL contains spaces or control characters');
  const host = hostOf(u);
  if (blocked.some(b => { const x = splitHostPort(b); return x.host === host && (x.port === null || x.port === portOf(u)); })) throw new v.ValidationError(`${host} serves kontainers' Docker API; notifications cannot be sent there`);
  if (isIP(host) && linkLocal(host)) throw new v.ValidationError('link-local addresses (169.254.0.0/16, fe80::/10) cannot be notification targets');
  const token = String(input.token ?? '').trim();
  if (token.length > 500 || !/^[\x21-\x7e]*$/.test(token)) throw new v.ValidationError('the token must be one word of at most 500 printable ASCII characters');
  const events = [...new Set((input.events || []).map(String))].filter((e): e is EventKind => (EVENT_KINDS as string[]).includes(e));
  if (!events.length) throw new v.ValidationError('choose at least one event');
  return { kind, url, token: token || null, events };
}

// A host name as compared: lower case, without brackets or a trailing dot.
export function hostOf(u: URL | string): string {
  const h = typeof u === 'string' ? u : u.hostname;
  return h.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

export const portOf = (u: URL) => Number(u.port || (u.protocol === 'https:' ? 443 : 80));

// "host:port", "[v6]:port" or "host" (port null: any port).
export function splitHostPort(b: string): { host: string; port: number | null } {
  const m = /^(\[[^\]]+\]|[^:]+|[0-9a-f:]+)(?::(\d+))?$/i.exec(b.includes('[') || (b.match(/:/g) || []).length <= 1 ? b : `[${b}]`);
  return m ? { host: hostOf(m[1]), port: m[2] ? Number(m[2]) : null } : { host: hostOf(b), port: null };
}

// Loopback in any spelling (127.0.0.0/8, ::1, and 0.0.0.0 or ::, which reach this machine on Linux)
// compares as one address.
const sameAddr = (a: string, b: string) => {
  const lo = (x: string) => /^127\./.test(x) || x === '::1' || x === '0.0.0.0' || x === '::';
  return a === b || (lo(a) && lo(b));
};

// An IPv4 address written inside IPv6 (::ffff:a.b.c.d, or as the URL parser writes it,
// ::ffff:a9fe:a9fe) as plain IPv4.
export function plainIp(a: string): string {
  const m = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(a);
  if (!m) return a.toLowerCase();
  if (m[1]) return m[1];
  const hi = parseInt(m[2], 16), lo = parseInt(m[3], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

// Link-local addresses are cloud metadata services (169.254.169.254, fd00:ec2::254), never a
// notification receiver.
export function linkLocal(a: string): boolean {
  const p = plainIp(a);
  return /^169\.254\./.test(p) || /^fe[89ab][0-9a-f]:/i.test(p) || p === 'fd00:ec2::254';
}

// The addresses a host name stands for, for comparing what a URL reaches.
async function addressesOf(host: string, lookupImpl: typeof lookup): Promise<string[]> {
  if (isIP(host)) return [plainIp(host)];
  // A name that does not resolve within 3 s is let through to fetch, which then fails on it.
  const found = await Promise.race([lookupImpl(host, { all: true }).catch(() => []), Bun.sleep(3000).then(() => [])]) as { address: string }[];
  return found.map(a => plainIp(a.address));
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
    private blocked: string[] = [],
    private lookupImpl: typeof lookup = lookup,
  ) {}

  // Checked when a target is added and again before every delivery, by address and port: a name
  // with a trailing dot, the socket proxy's container name or its IP address reach the Docker API
  // as well as its compose name does. The name is resolved here and again by fetch, so a name whose
  // answer changes between the two (DNS rebinding) is not caught; every account is root on the host
  // anyway, so this guards against mistakes, not against the people who use kontainers.
  async refusal(url: string): Promise<string | null> {
    const u = new URL(url);
    const host = hostOf(u);
    const addrs = await addressesOf(host, this.lookupImpl);
    if (addrs.some(linkLocal)) return 'the address is link-local (a cloud metadata service)';
    for (const b of this.blocked) {
      const x = splitHostPort(b);
      if (x.port !== null && x.port !== portOf(u)) continue;
      const theirs = await addressesOf(x.host, this.lookupImpl);
      if (x.host === host || addrs.some(a => theirs.some(t => sameAddr(a, t)))) return `it reaches ${b}, which serves kontainers' Docker API`;
    }
    return null;
  }

  list(): Target[] { return this.db.query('SELECT * FROM notify_targets ORDER BY id').all().map(row); }
  get(id: number): Target | null { const r = this.db.query('SELECT * FROM notify_targets WHERE id = ?').get(id); return r ? row(r) : null; }

  add(input: Parameters<typeof validateTarget>[0]): Target {
    const t = validateTarget(input, this.blocked);
    if ((this.db.query('SELECT COUNT(*) AS n FROM notify_targets').get() as { n: number }).n >= 20) throw new v.ValidationError('at most 20 notification targets');
    const r = this.db.query('INSERT INTO notify_targets (kind, url, token, events, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .get(t.kind, t.url, t.token, t.events.join(','), this.now());
    return row(r);
  }

  remove(id: number): void {
    if (!this.db.query('DELETE FROM notify_targets WHERE id = ?').run(id).changes) throw Object.assign(new v.ValidationError('notification target not found'), { status: 404 });
  }

  // Claims that could not be written (a full data volume): kept here until kontainers restarts, so
  // a fact is still reported once, and a note still goes out.
  private unsaved = new Map<string, number>();

  // True if a note with this key went out within `withinMs`; otherwise records it as sent now.
  // Keys name a fact ("update:web:sha256:...") so the same fact is reported once.
  claim(key: string, withinMs: number): boolean {
    const now = this.now();
    const mem = this.unsaved.get(key);
    if (mem !== undefined && now - mem < withinMs) return false;
    const prev = this.db.query('SELECT at FROM notify_sent WHERE key = ?').get(key) as { at: number } | null;
    if (prev && now - prev.at < withinMs) return false;
    try {
      this.db.query('INSERT INTO notify_sent (key, at) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET at = excluded.at').run(key, now);
      // Keep the table small: facts older than 60 days are forgotten.
      this.db.query('DELETE FROM notify_sent WHERE at < ?').run(now - 60 * 86400_000);
      this.unsaved.delete(key);
    } catch (e) {
      writeFailed(e, 'could not record a notification as sent');
      if (this.unsaved.size >= 10000) this.unsaved.clear();
      this.unsaved.set(key, now);
    }
    return true;
  }

  private unclaim(key: string): void {
    this.unsaved.delete(key);
    try { this.db.query('DELETE FROM notify_sent WHERE key = ?').run(key); } catch (e) { writeFailed(e, 'could not forget a notification nobody received'); }
  }

  // Sends to every target subscribed to the note's kind. With a key, sends only if that fact was
  // not reported within `withinMs`. Returns how many targets it was sent to. `going` is called
  // before anything is awaited once the note is going out, so a caller knows it at once.
  async send(note: Note, key?: string, withinMs = Infinity, going?: () => void): Promise<number> {
    const targets = this.list().filter(t => note.kind === 'test' || t.events.includes(note.kind));
    if (!targets.length) return 0;
    if (key && !this.claim(key, withinMs)) return 0;
    going?.();
    const results = await Promise.all(targets.map(t => this.deliver(t, note)));
    // Nobody got it: forget the claim, so the fact is sent when it comes up again.
    if (key && results.every(r => r.startsWith('failed'))) this.unclaim(key);
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
      const no = await this.refusal(t.url);
      if (no) throw new Error(`not sent: ${no}`);
      // Redirects are not followed: the body and the token would go to an address nobody chose.
      const res = await this.fetchImpl(t.url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
      // The address and the answer can hold the target's secret (a topic, a token in the path):
      // results are shown on Settings and Activity and logged, so only masked, and no body.
      result = res.status >= 300 && res.status < 400
        ? `failed: the target redirected (HTTP ${res.status}) to ${maskUrl(String(res.headers.get('location') || '?')).slice(0, 200)} (path not shown); use the address it redirects to`
        : res.ok ? `sent (HTTP ${res.status})` : `failed: HTTP ${res.status}`;
    } catch (e) {
      // Some errors quote the address (Bun's "Malformed_HTTP_Response fetching "http://..."").
      result = `failed: ${((e as Error).message || String(e)).replace(/https?:\/\/[^\s"'<>]+/g, u => maskUrl(u)).slice(0, 200)}`;
    }
    try { this.db.query('UPDATE notify_targets SET last_at = ?, last_result = ? WHERE id = ?').run(at, result, t.id); } catch (e) { writeFailed(e, 'could not save the result of a notification'); }
    if (result.startsWith('failed')) console.error(`kontainers: notification to ${maskUrl(t.url)} ${result}`);
    return result;
  }
}
