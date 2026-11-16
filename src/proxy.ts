// Proxy rules (hostname + path -> container:port) and the Caddy that serves them.
// Caddy runs as a child process; its admin API listens only on a unix socket in the data directory.
// The config is generated from validated, structured fields; there is no free-form proxy config.

import type { Database } from 'bun:sqlite';
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname as osHostname, networkInterfaces } from 'node:os';
import { X509Certificate } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Config } from './config';
import type { Docker } from './docker';
import { DockerError } from './docker';
import * as v from './validate';

// How often targets are re-checked. KONTAINERS_PROXY_RECONCILE_MS exists for the tests only.
const RECONCILE_MS = Number(process.env.KONTAINERS_PROXY_RECONCILE_MS) || 10000;

export interface Rule {
  id: number;
  hostname: string;
  path: string;
  target_container: string;
  target_port: number;
  tls: boolean;
  enabled: boolean;
  created_at: number;
}

export interface RuleInput {
  hostname: unknown;
  path?: unknown;
  targetContainer: unknown;
  targetPort: unknown;
  tls?: unknown;
}

const toRule = (r: any): Rule => ({ ...r, tls: !!r.tls, enabled: !!r.enabled });

export class RuleStore {
  constructor(private db: Database) {}

  list(): Rule[] {
    return (this.db.query('SELECT * FROM proxy_rules ORDER BY hostname, length(path) DESC').all() as any[]).map(toRule);
  }

  get(id: number): Rule | null {
    const r = this.db.query('SELECT * FROM proxy_rules WHERE id = ?').get(id);
    return r ? toRule(r) : null;
  }

  validate(input: RuleInput) {
    const r = {
      hostname: v.hostname(input.hostname),
      path: v.pathPrefix(input.path),
      target: v.name(typeof input.targetContainer === 'string' ? input.targetContainer.replace(/^\//, '') : input.targetContainer, 'target container'),
      port: v.port(input.targetPort, 'target port'),
      tls: input.tls === undefined ? true : input.tls === true || input.tls === 'on' || input.tls === 'true' || input.tls === '1',
    };
    // Let's Encrypt issues wildcard certificates only over the DNS-01 challenge, which needs DNS
    // provider credentials kontainers does not handle; an HTTPS wildcard rule would never get one.
    if (r.tls && r.hostname.startsWith('*.')) {
      throw new v.ValidationError(`a wildcard hostname cannot get an automatic certificate (that needs a DNS challenge, which kontainers does not do); add one rule per name, or turn HTTPS off for ${r.hostname}`);
    }
    // Caddy keeps a lock file named issue_cert_<hostname>.lock while it gets a certificate, and
    // file names stop at 255 bytes: a longer name never got one, and the page blamed DNS.
    if (r.tls && r.hostname.length > 230) {
      throw new v.ValidationError(`a hostname over 230 characters cannot get an automatic certificate (${r.hostname.length} given); use a shorter name, or turn HTTPS off`);
    }
    return r;
  }

  // One hostname is served over HTTPS or over plain HTTP, not both: with a mix, each rule answered
  // only on its own scheme, and the HTTPS one's redirect from HTTP was taken by the plain one.
  private sameScheme(hostname: string, tls: boolean, exceptId: number | null): void {
    const other = this.db.query('SELECT tls, path FROM proxy_rules WHERE hostname = ? AND tls != ? AND id IS NOT ?').get(hostname, tls ? 1 : 0, exceptId) as { tls: number; path: string } | null;
    if (other) throw new v.ValidationError(`${hostname} already has a rule over ${other.tls ? 'HTTPS' : 'plain HTTP'} (path ${other.path}); every rule for one hostname must use the same, so turn HTTPS ${other.tls ? 'on' : 'off'} here too`);
  }

  create(input: RuleInput, now = Date.now()): Rule {
    const r = this.validate(input);
    this.sameScheme(r.hostname, r.tls, null);
    try {
      return toRule(this.db.query(
        'INSERT INTO proxy_rules (hostname, path, target_container, target_port, tls, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?) RETURNING *'
      ).get(r.hostname, r.path, r.target, r.port, r.tls ? 1 : 0, now));
    } catch (e) {
      if (String(e).includes('UNIQUE')) { const err = new v.ValidationError('a rule for this hostname and path already exists'); err.status = 409; throw err; }
      throw e;
    }
  }

  update(id: number, input: RuleInput): Rule {
    const r = this.validate(input);
    this.sameScheme(r.hostname, r.tls, id);
    let row: unknown;
    try {
      row = this.db.query(
        'UPDATE proxy_rules SET hostname = ?, path = ?, target_container = ?, target_port = ?, tls = ? WHERE id = ? RETURNING *'
      ).get(r.hostname, r.path, r.target, r.port, r.tls ? 1 : 0, id);
    } catch (e) {
      if (String(e).includes('UNIQUE')) { const err = new v.ValidationError('another rule already has this hostname and path'); err.status = 409; throw err; }
      throw e;
    }
    if (!row) throw Object.assign(new v.ValidationError('rule not found'), { status: 404 });
    return toRule(row);
  }

  setEnabled(id: number, enabled: boolean): Rule {
    const row = this.db.query('UPDATE proxy_rules SET enabled = ? WHERE id = ? RETURNING *').get(enabled ? 1 : 0, id);
    if (!row) throw Object.assign(new v.ValidationError('rule not found'), { status: 404 });
    return toRule(row);
  }

  remove(id: number): void {
    const res = this.db.query('DELETE FROM proxy_rules WHERE id = ?').run(id);
    if (res.changes === 0) throw Object.assign(new v.ValidationError('rule not found'), { status: 404 });
  }
}

function matchPaths(prefix: string): string[] {
  if (prefix === '/') return ['/*'];
  const p = prefix.replace(/\/$/, '');
  return [p, p + '/*'];
}

// Pure function: rules -> Caddy JSON config. Tested directly.
export function buildCaddyConfig(rules: Rule[], cfg: Config, adminSocket: string): Record<string, unknown> {
  const active = rules.filter(r => r.enabled);
  const route = (r: Rule) => ({
    match: [{ host: [r.hostname], path: matchPaths(r.path) }],
    handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: `${r.target_container}:${r.target_port}` }] }],
    terminal: true,
  });
  const byPathLength = (a: Rule, b: Rule) => b.path.length - a.path.length;
  const notFound = { handle: [{ handler: 'static_response', status_code: 404, body: 'no proxy rule for this host\n' }] };

  const tlsRules = active.filter(r => r.tls).sort(byPathLength);
  const plainRules = active.filter(r => !r.tls).sort(byPathLength);
  const tlsHosts = [...new Set(tlsRules.map(r => r.hostname))];

  const servers: Record<string, unknown> = {
    http: { listen: [`:${cfg.proxy.httpPort}`], routes: [...plainRules.map(route), notFound] },
  };
  if (tlsRules.length) servers.https = { listen: [`:${cfg.proxy.httpsPort}`], routes: [...tlsRules.map(route), notFound] };

  const apps: Record<string, unknown> = {
    http: { http_port: cfg.proxy.httpPort, https_port: cfg.proxy.httpsPort, servers },
  };
  if (tlsHosts.length) {
    const issuer: Record<string, unknown> = { module: 'acme' };
    if (cfg.proxy.acmeCa) issuer.ca = cfg.proxy.acmeCa;
    if (cfg.proxy.acmeEmail) issuer.email = cfg.proxy.acmeEmail;
    if (cfg.proxy.acmeCaRoot) issuer.trusted_roots_pem_files = [cfg.proxy.acmeCaRoot];
    const automation: Record<string, unknown> = { policies: [{ subjects: tlsHosts, issuers: [issuer] }] };
    if (cfg.proxy.acmeRenewCheck) automation.renew_interval = `${cfg.proxy.acmeRenewCheck}s`;
    apps.tls = { automation };
  }
  return {
    admin: { listen: `unix/${adminSocket}`, config: { persist: false } },
    storage: { module: 'file_system', root: join(cfg.dataDir, 'caddy') },
    logging: { logs: { default: { level: 'WARN' } } },
    apps,
  };
}

const ipv4 = (ip: string): number | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.some(x => x > 255) ? null : o[0] * 2 ** 24 + o[1] * 2 ** 16 + o[2] * 2 ** 8 + o[3];
};

export interface Subnet { subnet: string; gateway?: string }

// True when ip is inside one of the IPv4 subnets ("172.18.0.0/16") and is not that subnet's gateway.
// The gateway is the host side of the bridge: connections from the host, such as the published UI
// port, arrive from it.
export function inSubnetNotGateway(ip: string, nets: Subnet[]): boolean {
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const a = ipv4(addr);
  if (a === null) return false;
  for (const n of nets) {
    const [base, bits] = String(n.subnet).split('/');
    const b = ipv4(base), len = Number(bits);
    if (b === null || !Number.isInteger(len) || len < 0 || len > 32) continue;
    const size = 2 ** (32 - len);
    if (Math.floor(a / size) === Math.floor(b / size) && addr !== n.gateway) return true;
  }
  return false;
}

export type TargetGuard = (container: string) => Promise<{ reason: string; self: boolean } | null>;

export class ProxyManager {
  // Set by the server: refuses containers that must never be put on the proxy network.
  guard: TargetGuard | null = null;
  // The proxy network's IPv4 subnets, from the last inspect.
  private subnets: Subnet[] = [];
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private stopping = false;
  private restarts = 0;
  private hasTls = false; // the running Caddy was started with a TLS app (see replaceProcess)
  readonly adminSocket: string;
  private configFile: string;
  lastError: string | null = null;
  networkError: string | null = null;

  constructor(private cfg: Config, private store: RuleStore, private docker: Docker) {
    const dir = join(cfg.dataDir, 'run');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.adminSocket = join(dir, 'caddy-admin.sock');
    this.configFile = join(dir, 'caddy.json');
  }

  get running(): boolean { return this.proc !== null && this.proc.exitCode === null; }

  // True for a connection from another container on the proxy network.
  fromTargetNetwork(socketIp: string): boolean {
    return this.cfg.proxy.enabled && inSubnetNotGateway(socketIp, this.subnets);
  }

  private noteSubnets(net: any): void {
    this.subnets = (net?.IPAM?.Config || []).filter((c: any) => c?.Subnet).map((c: any) => ({ subnet: c.Subnet, gateway: c.Gateway }));
  }

  // Target container name -> Docker state ("running", "exited", ..., or "missing"), from the last reconcile.
  targetState = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  // Targets the guard refused at the last check. Their rules stay saved but are not served:
  // Caddy runs inside kontainers, so it can reach the Docker API container over kontainers' own
  // networks even when that container is not on the proxy network.
  private refused = new Map<string, { reason: string; self: boolean }>();
  private servable(): Rule[] { return this.store.list().filter(r => !this.refused.has(r.target_container)); }

  // Asks the guard about every rule's target. Returns true when the refused set changed.
  private async checkTargets(): Promise<boolean> {
    if (!this.guard) return false;
    const next = new Map<string, { reason: string; self: boolean }>();
    for (const name of new Set(this.store.list().map(r => r.target_container))) {
      const no = await this.guard(name).catch(() => this.refused.get(name) ?? null);
      if (no) next.set(name, no);
    }
    const changed = next.size !== this.refused.size || [...next.keys()].some(k => !this.refused.has(k));
    for (const [name, no] of next) if (!this.refused.has(name)) console.log(`kontainers: not serving rules for ${name}: ${no.reason}`);
    this.refused = next;
    return changed;
  }

  refusalFor(container: string): string | null { return this.refused.get(container)?.reason ?? null; }

  async start(): Promise<void> {
    if (!this.cfg.proxy.enabled) return;
    await this.ensureNetwork();
    await this.checkTargets().catch(() => false);
    this.spawn();
    const tick = () => void this.reconcile().catch(e => console.error(`kontainers: proxy check failed: ${(e as Error).message}`));
    tick();
    this.timer = setInterval(tick, RECONCILE_MS);
  }

  // docker compose up recreates a container under the same name with a new ID, which is not on the
  // proxy network, so its route would fail. Every RECONCILE_MS, reconnect running targets that are
  // missing from the network, and record each target's state for the Proxy page.
  async reconcile(): Promise<void> {
    if (!this.cfg.proxy.enabled) return;
    const rules = this.store.list().filter(r => r.enabled);
    let net: any = null;
    try {
      net = await this.docker.inspectNetwork(this.cfg.proxy.network);
    } catch (e) {
      // The network is made at start. If the Docker API was not reachable then, or someone removed
      // the network, make it now, and put kontainers back on it.
      if (e instanceof DockerError && e.status === 404) {
        await this.ensureNetwork().catch(() => {});
        net = await this.docker.inspectNetwork(this.cfg.proxy.network).catch(() => null);
      }
      if (!net) {
        this.networkError = `the proxy network ${this.cfg.proxy.network} is not available: ${(e as Error).message}`;
        throw e;
      }
    }
    this.networkError = null;
    const containers = await this.docker.listContainers();
    const byName = new Map<string, string>();
    for (const c of containers) for (const n of c.Names || []) byName.set(String(n).replace(/^\//, ''), c.State);
    this.noteSubnets(net);
    if (await this.checkTargets()) await this.apply().catch(e => console.error(`kontainers: proxy update failed: ${(e as Error).message}`));
    const onNet: [string, string][] = Object.entries(net?.Containers || {}).map(([id, x]: [string, any]) => [id, String(x.Name)]);
    const attached = new Set(onNet.map(([, n]) => n));
    const state = new Map<string, string>();
    const served = new Set<string>();
    for (const r of rules) {
      if (state.has(r.target_container)) continue; // several rules, one container: once
      const s = byName.get(r.target_container) ?? 'missing';
      state.set(r.target_container, s);
      if (this.refused.has(r.target_container)) continue;
      served.add(r.target_container);
      if (s === 'running' && !attached.has(r.target_container)) {
        try {
          await this.attach(r.target_container);
          console.log(`kontainers: reconnected ${r.target_container} to ${this.cfg.proxy.network}`);
        } catch (e) { console.error(`kontainers: cannot connect ${r.target_container} to ${this.cfg.proxy.network}: ${(e as Error).message}`); }
      }
    }
    // A container no enabled rule points at leaves the network: otherwise every target could still
    // reach it. This also takes off a container serving the Docker API that an old rule put there.
    // kontainers itself stays: Caddy reaches the targets from it.
    // Only on a network kontainers made: KONTAINERS_PROXY_NETWORK may name one the user shares with
    // other services, and those must stay connected.
    const ours = net?.Labels?.['kontainers.managed'] === 'true';
    for (const [id, name] of ours ? onNet : []) {
      const ip = String((net?.Containers?.[id] as any)?.IPv4Address || '').split('/')[0];
      if (served.has(name) || this.isOwn(id, name, ip)) continue;
      try {
        await this.docker.disconnect(this.cfg.proxy.network, id);
        const why = this.refused.get(name)?.reason;
        console.log(`kontainers: disconnected ${name} from ${this.cfg.proxy.network}: ${why ?? 'no enabled proxy rule points at it'}`);
      } catch (e) { console.error(`kontainers: cannot disconnect ${name} from ${this.cfg.proxy.network}: ${(e as Error).message}`); }
    }
    // Whether something answers on each served target port, as Caddy would connect to it. Only when
    // kontainers is on the proxy network itself: elsewhere the container names do not resolve.
    if (this.onNetwork) {
      const ports = new Map<string, string | null>();
      for (const r of rules) {
        const k = `${r.target_container}:${r.target_port}`;
        if (!served.has(r.target_container) || state.get(r.target_container) !== 'running' || ports.has(k)) continue;
        ports.set(k, await this.probe(r.target_container, r.target_port));
      }
      this.portState = ports;
    }
    this.targetState = state;
  }

  // "container:port" -> null when something answered, or what went wrong, from the last reconcile.
  portState = new Map<string, string | null>();
  private onNetwork = false;
  // Opens a TCP connection and closes it again; null when it opened within 2 s.
  probe: (host: string, port: number) => Promise<string | null> = (host, port) => new Promise(resolve => {
    const s = createConnection({ host, port, timeout: 2000 });
    const done = (why: string | null) => { s.destroy(); resolve(why); };
    s.once('connect', () => done(null));
    s.once('timeout', () => done('no answer within 2 s'));
    s.once('error', (e: NodeJS.ErrnoException) => done(e.code === 'ECONNREFUSED' ? 'connection refused' : e.code || e.message));
  });
  // kontainers' own container: its hostname is its short ID, unless KONTAINERS_SELF_CONTAINER names it.
  selfContainer: string | null = null;
  // Its address on the network is one of this process's own, whatever its hostname or name.
  private isOwn(id: string, name: string, ip = ''): boolean {
    const h = osHostname();
    const mine = Object.values(networkInterfaces()).flat().some(a => !!ip && a?.address === ip);
    return mine || (/^[a-f0-9]{12}$/.test(h) && id.startsWith(h)) || (!!this.selfContainer && (this.selfContainer === name || id.startsWith(this.selfContainer)));
  }

  // The certificate Caddy holds for a hostname, if any. Caddy stores <issuer>/<host>/<host>.crt.
  certificate(host: string): { notAfter: Date; notBefore: Date } | null {
    const root = join(this.cfg.dataDir, 'caddy', 'certificates');
    const name = host.replace(/^\*/, 'wildcard_');
    try {
      for (const issuer of readdirSync(root)) {
        const f = join(root, issuer, name, `${name}.crt`);
        if (existsSync(f)) { const x = new X509Certificate(readFileSync(f, 'utf8')); return { notAfter: new Date(x.validTo), notBefore: new Date(x.validFrom) }; }
      }
    } catch { /* no certificates yet */ }
    return null;
  }

  private caddyEnv(): Record<string, string> {
    const home = join(this.cfg.dataDir, 'caddy');
    return { ...process.env, HOME: home, XDG_DATA_HOME: home, XDG_CONFIG_HOME: home } as Record<string, string>;
  }

  private spawn(): void {
    const conf = buildCaddyConfig(this.servable(), this.cfg, this.adminSocket);
    writeFileSync(this.configFile, JSON.stringify(conf), { mode: 0o600 });
    this.hasTls = 'tls' in (conf.apps as Record<string, unknown>);
    const proc = Bun.spawn([this.cfg.proxy.caddyBin, 'run', '--config', this.configFile], {
      stdout: 'inherit', stderr: 'inherit',
      env: this.caddyEnv(),
      onExit: (_p, code) => {
        if (this.proc !== proc) return; // replaced on purpose by replaceProcess()
        this.proc = null;
        if (this.stopping) return;
        this.lastError = `proxy exited with code ${code}`;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(this.restarts++, 5));
        console.error(`kontainers: caddy exited (${code}); restarting in ${delay} ms`);
        setTimeout(() => { if (!this.stopping && this.proc === null) this.spawn(); }, delay);
      },
    });
    this.proc = proc;
    // A crash is reported until the restarted process has stayed up for a few seconds.
    setTimeout(() => {
      if (this.proc === proc && proc.exitCode === null && this.lastError?.startsWith('proxy exited')) { this.lastError = null; this.restarts = 0; }
    }, 5000);
  }

  // Caddy did not renew certificates for a TLS policy that was added to a process started without
  // one (tests/renewal reproduces this). Such a process is replaced instead of reloaded. The new
  // configuration is checked with `caddy validate` first, so a bad one is refused and the old process keeps running.
  private async replaceProcess(): Promise<void> {
    const check = Bun.spawn([this.cfg.proxy.caddyBin, 'validate', '--config', this.configFile], {
      stdout: 'pipe', stderr: 'pipe', env: this.caddyEnv(),
    });
    const [out, err, code] = await Promise.all([new Response(check.stdout).text(), new Response(check.stderr).text(), check.exited]);
    if (code !== 0) {
      this.lastError = (err || out).slice(0, 2000);
      throw Object.assign(new Error(`proxy rejected the configuration: ${this.lastError}`), { status: 502 });
    }
    const old = this.proc;
    this.proc = null;
    if (old) { old.kill('SIGTERM'); await old.exited; }
    this.spawn();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.proc) { this.proc.kill('SIGTERM'); await this.proc.exited; }
  }

  // Push the current rules to the running Caddy. Throws if Caddy rejects the config.
  async apply(): Promise<void> {
    if (!this.cfg.proxy.enabled) return;
    const conf = buildCaddyConfig(this.servable(), this.cfg, this.adminSocket);
    writeFileSync(this.configFile, JSON.stringify(conf), { mode: 0o600 });
    if (!existsSync(this.adminSocket)) return; // picked up from the file when Caddy (re)starts
    if (this.proc && !this.hasTls && 'tls' in (conf.apps as Record<string, unknown>)) {
      await this.replaceProcess();
      this.lastError = null;
      this.restarts = 0;
      return;
    }
    const res = await fetch('http://caddy/load', {
      method: 'POST', unix: this.adminSocket, headers: { 'content-type': 'application/json' }, body: JSON.stringify(conf),
      signal: AbortSignal.timeout(30000),
    } as RequestInit);
    if (!res.ok) {
      this.lastError = (await res.text()).slice(0, 2000);
      throw Object.assign(new Error(`proxy rejected the configuration: ${this.lastError}`), { status: 502 });
    }
    this.lastError = null;
    this.restarts = 0;
  }

  // Make sure the target container shares the proxy network so Caddy can reach it by name.
  async attach(container: string): Promise<void> {
    if (!this.cfg.proxy.enabled) return;
    try {
      await this.docker.connect(this.cfg.proxy.network, container);
    } catch (e) {
      if (e instanceof DockerError && /already exists|already attached|endpoint with name/i.test(e.message)) return;
      throw e;
    }
  }

  private async ensureNetwork(): Promise<void> {
    try {
      this.noteSubnets(await this.docker.inspectNetwork(this.cfg.proxy.network));
    } catch (e) {
      if (!(e instanceof DockerError) || e.status !== 404) { console.error(`kontainers: cannot inspect proxy network: ${(e as Error).message}`); return; }
      await this.docker.createNetwork(this.cfg.proxy.network);
      this.noteSubnets(await this.docker.inspectNetwork(this.cfg.proxy.network).catch(() => null));
    }
    // When kontainers itself runs in a container, its hostname is its container ID: join the network.
    try { await this.attach(osHostname()); this.onNetwork = true; } catch { /* not running in a container, or no permission */ }
  }
}
