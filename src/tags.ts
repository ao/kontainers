// Newer version tags: for a container on nginx:1.27, whether the registry has nginx:1.28 (or 2.0).
// Update checks only see a newer image under the same tag; a version number in the tag moves
// only when someone changes it. kontainers says so, and never changes a tag on its own.
//
// The tags are listed with the registry's own API (GET /v2/<repo>/tags/list), straight from
// kontainers, with the login saved on the Settings page for that registry (as the registry asks:
// a bearer token from the realm it names, or basic auth). A tag counts when it has the same shape
// as the current one: the same prefix ("v" or none), the same number of version parts, and the same
// suffix ("-alpine"); pre-releases and other variants never count.

const VERSION = /^(v?)(\d+(?:\.\d+){0,3})((?:[-_+].*)?)$/;

export interface Version { prefix: string; nums: number[]; suffix: string }
export function versionOf(tag: string): Version | null {
  const m = VERSION.exec(tag);
  if (!m) return null;
  const nums = m[2].split('.').map(Number);
  if (nums.some(n => !Number.isSafeInteger(n))) return null;
  return { prefix: m[1], nums, suffix: m[3] };
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
    if (!v || v.prefix !== cur.prefix || v.suffix !== cur.suffix || v.nums.length !== cur.nums.length || cmp(v.nums, cur.nums) <= 0) continue;
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

// The registry's API address: Docker Hub's, plain HTTP for a registry on this host (as a local
// registry:2 usually is, which Docker allows without TLS), HTTPS for the rest.
export function registryBase(registry: string): string {
  if (registry === 'docker.io') return 'https://registry-1.docker.io';
  const host = registry.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return /^(localhost|127\.\d+\.\d+\.\d+|::1)$/.test(host) || host.endsWith('.localhost') ? `http://${registry}` : `https://${registry}`;
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

// Every tag of a repository (up to 20 pages of 1000).
export async function listTags(fetchImpl: Fetch, registry: string, repo: string, creds: Creds | null): Promise<string[]> {
  const base = registryBase(registry);
  const basic = creds ? `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}` : null;
  let auth: string | null = null;
  // No redirects: a login is never sent on to another address that way.
  const get = (url: string) => fetchImpl(url, { headers: { accept: 'application/json', ...(auth ? { authorization: auth } : {}) }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  let url = `${base}/v2/${repo}/tags/list?n=1000`;
  const tags: string[] = [];
  for (let page = 0; page < 20 && url; page++) {
    let res = await get(url);
    if (res.status === 401 && !auth) {
      const ch = parseChallenge(res.headers.get('www-authenticate'));
      if (ch?.scheme === 'bearer' && ch.params.realm) {
        // The token service the registry names: HTTPS (or plain HTTP only for a registry on this
        // host), never a link-local address (a cloud's metadata service).
        let realm: URL;
        try { realm = new URL(ch.params.realm); } catch { throw new Error('the registry named a token service that is not an address'); }
        if (!(realm.protocol === 'https:' || (realm.protocol === 'http:' && base.startsWith('http://'))) || /^(169\.254\.|\[?fe80:)/i.test(realm.hostname)) throw new Error(`the registry named a token service kontainers does not use (${realm.protocol}//${realm.host})`);
        const q = new URLSearchParams();
        if (ch.params.service) q.set('service', ch.params.service);
        q.set('scope', ch.params.scope || `repository:${repo}:pull`);
        const t = await fetchImpl(`${ch.params.realm}?${q}`, { headers: basic ? { authorization: basic } : {}, signal: AbortSignal.timeout(15000) });
        if (!t.ok) throw new Error(`the registry's token service answered HTTP ${t.status}`);
        const body = (await t.json()) as { token?: string; access_token?: string };
        const tok = body.token || body.access_token;
        if (!tok) throw new Error('the registry gave no token');
        auth = `Bearer ${tok}`;
      } else if (ch?.scheme === 'basic' && basic) auth = basic;
      else throw new Error(creds ? 'the registry refused the login saved for it' : 'the registry needs a login (add one on the Settings page)');
      res = await get(url);
    }
    if (res.status === 401 || res.status === 403) throw new Error(creds ? 'the registry refused the login saved for it' : 'the registry needs a login (add one on the Settings page)');
    if (res.status === 404) throw new Error('the registry has no such repository');
    if (!res.ok) throw new Error(`the registry answered HTTP ${res.status}`);
    const body = (await res.json()) as { tags?: string[] | null };
    for (const t of body.tags || []) if (typeof t === 'string') tags.push(t);
    // Link: </v2/<repo>/tags/list?last=x&n=1000>; rel="next"
    const next = /<([^>]+)>\s*;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1];
    // Only further pages of the same registry.
    url = next && new URL(next, base).origin === new URL(base).origin ? new URL(next, base).toString() : '';
  }
  return tags;
}

export interface TagState { checkedAt: number; minor: string | null; major: string | null; error?: string }

// The newer version tags of every reference containers use, after each update check.
export class TagChecker {
  private state = new Map<string, TagState>();
  constructor(private fetchImpl: Fetch = (u, i) => fetch(u, i), private creds: (ref: string) => Creds | null = () => null, private now: () => number = Date.now) {}

  get(ref: string): TagState | null { return this.state.get(ref) ?? null; }

  // refs: what containers use; only those with a version tag are looked up, once per repository.
  async checkAll(refs: string[]): Promise<void> {
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
        try { tags = await listTags(this.fetchImpl, g.registry, g.repo, this.creds(g.refs[0])); } catch (e) { error = (e as Error).message; }
        for (const ref of g.refs) {
          const n = error ? { minor: null, major: null } : newerTags(parseRef(ref)!.tag, tags);
          this.state.set(ref, { checkedAt: this.now(), ...n, ...(error ? { error } : {}) });
        }
      }
    }));
  }
}
