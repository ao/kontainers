// Proxy rules (hostname + path -> container:port) and the Caddy that serves them.
// Caddy runs as a child process; its admin API listens only on a unix socket in the data directory.
// The config is generated from validated, structured fields; there is no free-form proxy config.

import type { Database } from 'bun:sqlite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { hostname as osHostname } from 'node:os';
import type { Config } from './config';
import type { Docker } from './docker';
import { DockerError } from './docker';
import * as v from './validate';

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
    return {
      hostname: v.hostname(input.hostname),
      path: v.pathPrefix(input.path),
      target: v.name(typeof input.targetContainer === 'string' ? input.targetContainer.replace(/^\//, '') : input.targetContainer, 'target container'),
      port: v.port(input.targetPort, 'target port'),
      tls: input.tls === undefined ? true : input.tls === true || input.tls === 'on' || input.tls === 'true' || input.tls === '1',
    };
  }

  create(input: RuleInput, now = Date.now()): Rule {
    const r = this.validate(input);
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
    const row = this.db.query(
      'UPDATE proxy_rules SET hostname = ?, path = ?, target_container = ?, target_port = ?, tls = ? WHERE id = ? RETURNING *'
    ).get(r.hostname, r.path, r.target, r.port, r.tls ? 1 : 0, id);
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

export class ProxyManager {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private stopping = false;
  private restarts = 0;
  private hasTls = false; // the running Caddy was started with a TLS app (see replaceProcess)
  readonly adminSocket: string;
  private configFile: string;
  lastError: string | null = null;

  constructor(private cfg: Config, private store: RuleStore, private docker: Docker) {
    const dir = join(cfg.dataDir, 'run');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.adminSocket = join(dir, 'caddy-admin.sock');
    this.configFile = join(dir, 'caddy.json');
  }

  get running(): boolean { return this.proc !== null && this.proc.exitCode === null; }

  async start(): Promise<void> {
    if (!this.cfg.proxy.enabled) return;
    await this.ensureNetwork();
    this.spawn();
  }

  private caddyEnv(): Record<string, string> {
    const home = join(this.cfg.dataDir, 'caddy');
    return { ...process.env, HOME: home, XDG_DATA_HOME: home, XDG_CONFIG_HOME: home } as Record<string, string>;
  }

  private spawn(): void {
    const conf = buildCaddyConfig(this.store.list(), this.cfg, this.adminSocket);
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
    if (this.proc) { this.proc.kill('SIGTERM'); await this.proc.exited; }
  }

  // Push the current rules to the running Caddy. Throws if Caddy rejects the config.
  async apply(): Promise<void> {
    if (!this.cfg.proxy.enabled) return;
    const conf = buildCaddyConfig(this.store.list(), this.cfg, this.adminSocket);
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
      await this.docker.inspectNetwork(this.cfg.proxy.network);
    } catch (e) {
      if (!(e instanceof DockerError) || e.status !== 404) { console.error(`kontainers: cannot inspect proxy network: ${(e as Error).message}`); return; }
      await this.docker.createNetwork(this.cfg.proxy.network);
    }
    // When kontainers itself runs in a container, its hostname is its container ID: join the network.
    try { await this.attach(osHostname()); } catch { /* not running in a container, or no permission */ }
  }
}
