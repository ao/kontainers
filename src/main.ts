// Entry point.
//   bun src/main.ts                 run the server
//   bun src/main.ts backup FILE     write a consistent snapshot of the database to FILE

import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { bindProblem, loadConfig } from './config';
import { openDb, snapshot } from './db';
import { Auth } from './auth';
import { Docker } from './docker';
import { ProxyManager, RuleStore } from './proxy';
import { createHandler } from './server';
import { UpdateChecker } from './updates';
import { Notifier } from './notify';
import { AutoUpdates } from './autoupdate';
import { EventWatcher, checkCertificates } from './events';

const cfg = loadConfig();
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'backup') {
  if (!arg) { console.error('usage: kontainers backup FILE'); process.exit(2); }
  if (existsSync(arg)) { console.error(`kontainers: ${arg} already exists`); process.exit(1); }
  snapshot(openDb(cfg.dataDir), arg);
  console.log(`kontainers: wrote ${arg}`);
  process.exit(0);
} else if (cmd !== undefined && cmd !== 'serve') {
  console.error(`kontainers: unknown command "${cmd}"; commands: serve, backup FILE`);
  process.exit(2);
}

const problem = bindProblem(cfg);
if (problem) { console.error(`kontainers: ${problem}`); process.exit(1); }

const db = openDb(cfg.dataDir);
const auth = new Auth(db);
const docker = new Docker(cfg.dockerHost, { allowBindMounts: cfg.allowBindMounts });
const rules = new RuleStore(db);
const proxy = new ProxyManager(cfg, rules, docker);
// In a container the hostname is the container ID, unless --hostname changed it.
const selfContainer = process.env.KONTAINERS_SELF_CONTAINER || (cfg.inContainer ? hostname() : undefined);
const updates = new UpdateChecker(docker, cfg.updateCheckHours * 3600 * 1000);
const notifier = new Notifier(db);
const systemAudit = (action: string, target: string, result?: string) =>
  db.query('INSERT INTO audit_log (at, username, action, target, ip, result) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), null, action, target, null, result ?? null);
const autoUpdates = new AutoUpdates(db, docker, updates, notifier, { settleMs: cfg.autoUpdateSettle * 1000, healthTimeoutMs: cfg.autoUpdateHealthTimeout * 1000 }, systemAudit);
updates.onChecked = () => autoUpdates.afterCheck();
const events = new EventWatcher(docker, notifier, Date.now, ms => Bun.sleep(ms), name => autoUpdates.busy.has(name));
const handler = createHandler({ cfg, db, auth, docker, rules, proxy, selfContainer, updates, notifier, autoUpdates, events });
updates.start();
events.start();
// Certificate trouble, hourly (first check after 5 minutes), when the proxy runs.
const certCheck = () => void checkCertificates(rules.list(), h => proxy.certificate(h), notifier).catch(e => console.error(`kontainers: certificate check failed: ${(e as Error).message}`));
const certTimers = cfg.proxy.enabled ? [setTimeout(certCheck, 5 * 60_000), setInterval(certCheck, 3600_000)] : [];
// The activity log keeps a year.
const pruneAudit = () => db.query('DELETE FROM audit_log WHERE at < ?').run(Date.now() - 365 * 86400_000);
pruneAudit();
const auditTimer = setInterval(pruneAudit, 86400_000);

const server = Bun.serve({
  hostname: cfg.host,
  port: cfg.port,
  maxRequestBodySize: 1024 * 1024,
  // Bun's default of 10 s drops the connection while a Docker call is still waiting (an unreachable
  // daemon, a 20 s image pull); the longest, 255 s, lets those finish with a page instead.
  idleTimeout: 255,
  fetch(req, srv) {
    return handler(req, srv.requestIP(req)?.address ?? '');
  },
});

console.log(`kontainers: listening on http://${cfg.host.includes(':') ? `[${cfg.host}]` : cfg.host}:${server.port}`);
if (cfg.inContainer) console.log('kontainers: running in a container; publish the port on 127.0.0.1 only (-p 127.0.0.1:8080:8080) unless TLS is in front');
const setupToken = auth.issueSetupToken();
if (setupToken) console.log(`kontainers: no accounts yet. Open /setup and enter this one-time setup token: ${setupToken}`);
if (!(await docker.ping())) console.error(`kontainers: Docker is not reachable at ${cfg.dockerHost}; pages will show errors until it is`);

try {
  await proxy.start();
} catch (e) {
  console.error(`kontainers: proxy did not start: ${(e as Error).message}`);
}

let closing = false;
async function shutdown(sig: string) {
  if (closing) return;
  closing = true;
  console.log(`kontainers: ${sig}, shutting down`);
  server.stop();
  updates.stop();
  events.stop();
  for (const t of certTimers) clearTimeout(t as any);
  clearInterval(auditTimer);
  await proxy.stop();
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
