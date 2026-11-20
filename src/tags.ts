// Newer version tags: for a container on nginx:1.27, whether the registry has nginx:1.28 (or 2.0).
// Update checks only see a newer image under the same tag; a version number in the tag moves
// only when someone changes it. kontainers says so, and never changes a tag on its own.
//
// The tags are listed with the registry's own API (GET /v2/<repo>/tags/list), straight from
// kontainers, with the login saved on the Settings page for that registry (as the registry asks:
// a bearer token from the realm it names, or basic auth). A tag counts when it has the same shape
// as the current one: the same prefix ("v" or none), the same number of version parts, and the same
// suffix ("-alpine"); pre-releases and other variants never count.

import { linkLocal } from './notify';

const VERSION = /^(v?)(\d+(?:\.\d+){0,3})((?:[-_+].*)?)$/;

// padded: a part written with a leading zero (01.20), a shape of its own.
export interface Version { prefix: string; nums: number[]; suffix: string; padded?: boolean }
export function versionOf(tag: string): Version | null {
  const m = VERSION.exec(tag);
  if (!m) return null;
  const parts = m[2].split('.');
  const nums = parts.map(Number);
  if (nums.some(n => !Number.isSafeInteger(n))) return null;
  return { prefix: m[1], nums, suffix: m[3], ...(parts.some(p => p.length > 1 && p.startsWith('0')) ? { padded: true } : {}) };
}

const cmp = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };

// The newest tag of the same shape above `current` within its major version, and the newest of a
// higher major version (each null when there is none).
export function newerTags(current: string, tags: string[]): { minor: string | null; major: string | null } {
  const cur = versionOf(current);
  if (!cur) return { minor: null, major: null };
  let minor: Version & { tag: string } | null = null, major: Version & { tag: string } | null = null;
  for (const t of tags) {
    const v = versionOf(t);
    if (!v || v.prefix !== cur.prefix || v.suffix !== cur.suffix || v.nums.length !== cur.nums.length || !!v.padded !== !!cur.padded || cmp(v.nums, cur.nums) <= 0) continue;
    // A date or build number (alpine's 20250108 snapshots beside 3) is not a newer version of a
    // small one.
    if (cur.nums[0] < 100000 && v.nums[0] >= 100000) continue;
    // A single number (postgres:17, node:22) is its own major version.
    if (cur.nums.length > 1 && v.nums[0] === cur.nums[0]) { if (!minor || cmp(v.nums, minor.nums) > 0) minor = { ...v, tag: t }; }
    else if (!major || cmp(v.nums, major.nums) > 0) major = { ...v, tag: t };
  }
  return { minor: minor?.tag ?? null, major: major?.tag ?? null };
}

// "ghcr.io/me/app:1.2" -> registry, repository and tag; Docker Hub names get "library/".
export function parseRef(ref: string): { registry: string; repo: string; tag: string } | null {
  if (ref.includes('@')) return null;
  const colon = ref.lastIndexOf(':'), slash = ref.lastIndexOf('/');
  const name = colon > slash ? ref.slice(0, colon) : ref;
  const tag = colon > slash ? ref.slice(colon + 1) : 'latest';
  const first = name.split('/')[0];
  const hosted = name.includes('/') && (first.includes('.') || first.includes(':') || first === 'localhost');
  if (!hosted || ['docker.io', 'index.docker.io', 'registry-1.docker.io'].includes(first)) {
    const repo = hosted ? name.slice(first.length + 1) : name;
    return { registry: 'docker.io', repo: repo.includes('/') ? repo : `library/${repo}`, tag };
  }
  return { registry: first, repo: name.slice(first.length + 1), tag };
}

// An IPv6 literal without its brackets ("[::ffff:a9fe:a9fe]" is a link-local address too).
const bare = (host: string) => host.replace(/^\[|\]$/g, '');

function isLoopback(host: string): boolean { return /^(localhost|127\.\d+\.\d+\.\d+|::1)$/.test(host.replace(/^\[|\]$/g, '')); }

// The registry's API address: Docker Hub's, plain HTTP for a registry on the loopback address (as a
// local registry:2 usually is, which Docker allows without TLS), HTTPS for the rest. In a container
// (compose.yaml), kontainers' loopback is its own, not the host's: a registry on the host's
// 127.0.0.1 is not reached, and the page says so.
export function registryBase(registry: string): string {
  if (registry === 'docker.io') return 'https://registry-1.docker.io';
  const host = registry.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return isLoopback(host) ? `http://${registry}` : `https://${registry}`;
}

// WWW-Authenticate: Bearer realm="...",service="...",scope="..."
export function parseChallenge(h: string | null): { scheme: string; params: Record<string, string> } | null {
  if (!h) return null;
  const m = /^\s*(\w+)\s*(.*)$/.exec(h);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const p of m[2].matchAll(/(\w+)="([^"]*)"/g)) params[p[1].toLowerCase()] = p[2];
  return { scheme: m[1].toLowerCase(), params };
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface Creds { username: string; password: string }
// Why an address must not be asked (a link-local address, the Docker API), or null: notify.ts's
// check, by address after resolving the name.
export type Refusal = (url: string) => Promise<string | null>;

const PAGE_BYTES = 4 << 20, TOKEN_BYTES = 64 << 10, MAX_TAGS = 50_000, REPO_DEADLINE_MS = 90_000;

// A response body, read up to `max` bytes (a registry that sends more is refused, not buffered).
async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > max) throw new Error(`the registry's answer is too large (${declared} bytes)`);
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel().catch(() => {}); throw new Error('the registry\'s answer is too large'); }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// Every tag of a repository (up to 50 pages of 1000, 50 000 tags, 90 s). No redirects are
// followed, so a login is never sent on to another address; the token service the registry names
// must be HTTPS (plain HTTP only on this host's loopback, for a registry there), and neither it
// nor the registry may be an address `refusal` refuses.
export async function listTags(fetchImpl: Fetch, registry: string, repo: string, creds: Creds | null, refusal: Refusal = async () => null): Promise<string[]> {
  const base = registryBase(registry);
  const deadline = Date.now() + REPO_DEADLINE_MS;
  const signal = () => AbortSignal.timeout(Math.max(1000, Math.min(15000, deadline - Date.now())));
  const why = linkLocal(bare(new URL(base).hostname)) ? 'the address is link-local (a cloud metadata service)' : await refusal(base);
  if (why) throw new Error(`kontainers does not ask ${registry}: ${why}`);
  const basic = creds ? `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}` : null;
  let auth: string | null = null;
  let challenge: { scheme: string; params: Record<string, string> } | null = null;
  const get = (url: string) => fetchImpl(url, { headers: { accept: 'application/json', 'accept-encoding': 'identity', ...(auth ? { authorization: auth } : {}) }, redirect: 'manual', signal: signal() });
  const needs = () => new Error(creds ? 'the registry refused the login saved for it' : 'the registry needs a login (add one on the Settings page)');
  // A token (again, when one ran out between pages) as the registry's challenge says.
  const authorize = async () => {
    if (challenge?.scheme === 'bearer' && challenge.params.realm) {
      let realm: URL;
      try { realm = new URL(challenge.params.realm); } catch { throw new Error('the registry named a token service that is not an address'); }
      const plainOk = realm.protocol === 'http:' && base.startsWith('http://') && (isLoopback(realm.hostname) || realm.host === new URL(base).host);
      if (!(realm.protocol === 'https:' || plainOk)) throw new Error(`the registry named a token service kontainers does not use (${realm.protocol}//${realm.host})`);
      const no = linkLocal(bare(realm.hostname)) ? 'the address is link-local (a cloud metadata service)' : await refusal(realm.href);
      if (no) throw new Error(`the registry named a token service kontainers does not ask (${realm.host}): ${no}`);
      if (challenge.params.service) realm.searchParams.set('service', challenge.params.service);
      realm.searchParams.set('scope', challenge.params.scope || `repository:${repo}:pull`);
      const t = await fetchImpl(realm.href, { headers: { 'accept-encoding': 'identity', ...(basic ? { authorization: basic } : {}) }, redirect: 'manual', signal: signal() });
      if (t.status >= 300 && t.status < 400) throw new Error('the registry\'s token service sent kontainers elsewhere (a redirect), which it does not follow');
      if (!t.ok) throw new Error(`the registry's token service answered HTTP ${t.status}`);
      let body: { token?: string; access_token?: string };
      try { body = JSON.parse(await readCapped(t, TOKEN_BYTES)); } catch (e) { throw new Error(`the registry's token service gave no token (${(e as Error).message})`); }
      const tok = body.token || body.access_token;
      if (typeof tok !== 'string' || !tok) throw new Error('the registry gave no token');
      auth = `Bearer ${tok}`;
    } else if (challenge?.scheme === 'basic' && basic) auth = basic;
    else throw needs();
  };
  let url = `${base}/v2/${repo}/tags/list?n=1000`;
  const tags: string[] = [];
  for (let page = 0; page < 50 && url; page++) {
    let res = await get(url);
    if (res.status === 401) {
      const fresh = parseChallenge(res.headers.get('www-authenticate'));
      // Once, on the first page; again later only when a token ran out.
      if (auth && !(fresh?.scheme === 'bearer' && challenge?.scheme === 'bearer')) throw needs();
      challenge = fresh;
      await authorize();
      res = await get(url);
    }
    if (res.status >= 300 && res.status < 400) throw new Error('the registry sent kontainers elsewhere (a redirect), which it does not follow');
    if (res.status === 401 || res.status === 403) throw needs();
    if (res.status === 404) throw new Error('the registry has no such repository');
    if (!res.ok) throw new Error(`the registry answered HTTP ${res.status}`);
    let body: { tags?: unknown };
    try { body = JSON.parse(await readCapped(res, PAGE_BYTES)); } catch (e) { throw new Error(`the registry's list of tags could not be read (${(e as Error).message})`); }
    for (const t of Array.isArray(body.tags) ? body.tags : []) if (typeof t === 'string' && t.length <= 128) tags.push(t);
    if (tags.length > MAX_TAGS) break;
    // Link: </v2/<repo>/tags/list?last=x&n=1000>; rel="next". Only further pages of the same registry.
    const next = /<([^>]+)>\s*;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1];
    url = next && new URL(next, base).origin === new URL(base).origin ? new URL(next, base).toString() : '';
    if (Date.now() > deadline) break;
  }
  return tags;
}

export interface TagState { checkedAt: number; minor: string | null; major: string | null; error?: string }

// The newer version tags of every reference containers use, after each update check.
export class TagChecker {
  private state = new Map<string, TagState>();
  constructor(private fetchImpl: Fetch = (u, i) => fetch(u, i), private creds: (ref: string) => Creds | null = () => null, private now: () => number = Date.now, private refusal: Refusal = async () => null) {}

  get(ref: string): TagState | null { return this.state.get(ref) ?? null; }

  // One run at a time; one asked for meanwhile runs after it, with the refs it was given.
  private running: Promise<void> | null = null;
  private queued: string[] | null = null;
  checkAll(refs: string[]): Promise<void> {
    if (this.running) { this.queued = refs; return this.running; }
    this.running = this.run(refs).finally(() => {
      this.running = null;
      const q = this.queued;
      this.queued = null;
      if (q) void this.checkAll(q);
    });
    return this.running;
  }

  // refs: what containers use; only those with a version tag are looked up, once per repository.
  private async run(refs: string[]): Promise<void> {
    const byRepo = new Map<string, { registry: string; repo: string; refs: string[] }>();
    for (const ref of new Set(refs)) {
      const p = parseRef(ref);
      if (!p || !versionOf(p.tag)) { this.state.delete(ref); continue; }
      const k = `${p.registry}/${p.repo}`;
      const g = byRepo.get(k) ?? { registry: p.registry, repo: p.repo, refs: [] };
      g.refs.push(ref);
      byRepo.set(k, g);
    }
    for (const ref of [...this.state.keys()]) if (!refs.includes(ref)) this.state.delete(ref);
    const groups = [...byRepo.values()];
    await Promise.all(Array.from({ length: Math.min(4, groups.length) }, async () => {
      for (let g = groups.shift(); g; g = groups.shift()) {
        let tags: string[] = [], error: string | undefined;
        try { tags = await listTags(this.fetchImpl, g.registry, g.repo, this.creds(g.refs[0]), this.refusal); } catch (e) { error = (e as Error).message; }
        if (error) console.error(`kontainers: could not list the tags of ${g.registry}/${g.repo}: ${error}`);
        for (const ref of g.refs) {
          // A failed lookup keeps what the last one that worked found, and says why.
          const last = this.state.get(ref);
          const n = error ? { minor: last?.minor ?? null, major: last?.major ?? null } : newerTags(parseRef(ref)!.tag, tags);
          this.state.set(ref, { checkedAt: this.now(), ...n, ...(error ? { error } : {}) });
        }
      }
    }));
  }
}
