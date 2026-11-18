// Entry point.
//   bun src/main.ts                 run the server
//   bun src/main.ts backup FILE     write a consistent snapshot of the database to FILE

import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { bindProblem, loadConfig } from './config';
import { openDb, snapshot } from './db';
import { Auth } from './auth';
import { Docker } from './docker';
import { recoverInterrupted, watchRunning, type Recovered } from './update';
import { ReplaceJournal } from './journal';
import { ScheduleStore } from './schedule';
import { TwoFactor } from './totp';
import { diskFull, setDegraded } from './storage';
import { ProxyManager, RuleStore } from './proxy';
import { createHandler, dockerApiAddress } from './server';
import { UpdateChecker } from './updates';
import { Notifier } from './notify';
import { Registries, registryOf } from './registries';
import { AutoUpdates } from './autoupdate';
import { EventWatcher, checkCertificates } from './events';

const cfg = loadConfig();
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'backup') {
  if (!arg) { console.error('usage: kontainers backup FILE'); process.exit(2); }
  if (existsSync(arg)) { console.error(`kontainers: ${arg} already exists`); process.exit(1); }
  try {
    snapshot(openDb(cfg.dataDir), arg);
  } catch (e) {
    const m = (e as Error).message;
    console.error(`kontainers: could not write the backup: ${m}${/locked|busy/i.test(m) ? '. The running kontainers holds the database to itself (it started with the data volume full); free space and restart it, or copy /data while it is stopped' : ''}`);
    process.exit(1);
  }
  console.log(`kontainers: wrote ${arg}`);
  process.exit(0);
} else if (cmd === 'reset-2fa') {
  // For an account locked out of two-factor login: run on the host, where only root can.
  if (!arg) { console.error('usage: kontainers reset-2fa USERNAME'); process.exit(2); }
  try {
    const d = openDb(cfg.dataDir);
    const u = d.query('SELECT id, username FROM users WHERE username = ?').get(arg) as { id: number; username: string } | null;
    if (!u) { console.error(`kontainers: no user ${arg}`); process.exit(1); }
    new TwoFactor(d).disable(u.id);
    d.query('INSERT INTO audit_log (at, username, action, target, ip, result) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), null, '2fa-reset', u.username, null, 'note: from the command line');
    console.log(`kontainers: two-factor login is off for ${u.username}`);
    process.exit(0);
  } catch (e) {
    console.error(`kontainers: could not reset two-factor login: ${(e as Error).message}`);
    process.exit(1);
  }
} else if (cmd !== undefined && cmd !== 'serve') {
  console.error(`kontainers: unknown command "${cmd}"; commands: serve, backup FILE, reset-2fa USERNAME`);
  process.exit(2);
}

const problem = bindProblem(cfg);
if (problem) { console.error(`kontainers: ${problem}`); process.exit(1); }

let db: ReturnType<typeof openDb>;
try {
  db = openDb(cfg.dataDir);
} catch (e) {
  console.error(`kontainers: cannot open its database in ${cfg.dataDir}: ${(e as Error).message}${diskFull(e) || /disk I\/O|SHM/i.test((e as Error).message) ? '. The data volume is probably full or read-only: free space on it and start kontainers again' : ''}`);
  process.exit(1);
}
if (db.degraded) {
  console.error(`kontainers: could not use the database's shared-memory file (${db.degraded}): the data volume is full, or the file is not writable. Opened the database in exclusive mode, so \`kontainers backup\` cannot run until kontainers restarts with that fixed`);
  setDegraded('kontainers could not use its database\'s shared-memory file at start (the data volume was full, or the file in it is not writable), so it runs with the database locked to itself: the backup command does not work until it restarts. Free space on the data volume (/data in the image) and restart kontainers.');
}
const auth = new Auth(db);
let docker: Docker;
try { docker = new Docker(cfg.dockerHost, { allowBindMounts: cfg.allowBindMounts }); } catch (e) {
  console.error(`kontainers: DOCKER_HOST "${cfg.dockerHost}" is not a Docker address (unix:///path, tcp://host:port or http://host:port): ${(e as Error).message}`);
  process.exit(1);
}
const registries = new Registries(db, join(cfg.dataDir, 'registry.key'));
docker.auth = { header: ref => registries.header(ref), registry: registryOf, saved: r => registries.has(r), noteResult: (r, res, over) => registries.noteResult(r, res, over) };
const journal = new ReplaceJournal(db);
const rules = new RuleStore(db);
const proxy = new ProxyManager(cfg, rules, docker);
// In a container the hostname is the container ID, unless --hostname changed it.
const selfContainer = process.env.KONTAINERS_SELF_CONTAINER || (cfg.inContainer ? hostname() : undefined);
proxy.selfContainer = selfContainer ?? null;
const updates = new UpdateChecker(docker, cfg.updateCheckHours * 3600 * 1000);
const notifier = new Notifier(db, undefined, undefined, [dockerApiAddress(cfg.dockerHost)].filter((h): h is string => !!h));
const systemAudit = (action: string, target: string, result?: string) =>
  db.query('INSERT INTO audit_log (at, username, action, target, ip, result) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), null, action, target, null, result ?? null);
// Aborted at shutdown, so a replacement being watched is undone instead of left half done.
const stopping = new AbortController();
const schedule = new ScheduleStore(db, cfg.autoUpdateSchedule);
const autoUpdates: AutoUpdates = new AutoUpdates(db, docker, updates, notifier, { settleMs: cfg.autoUpdateSettle * 1000, healthTimeoutMs: cfg.autoUpdateHealthTimeout * 1000, signal: stopping.signal, journal, wasStopped: (id: string): boolean => events.wasStopped(id), schedule }, systemAudit);
autoUpdates.start();
updates.onChecked = () => autoUpdates.afterCheck();
const events: EventWatcher = new EventWatcher(docker, notifier, Date.now, ms => Bun.sleep(ms), name => autoUpdates.busy.has(name));
const handler = createHandler({ cfg, db, auth, docker, rules, proxy, selfContainer, updates, notifier, autoUpdates, events, stopping: stopping.signal, registries, journal, schedule, twoFactor: new TwoFactor(db) });
updates.start();
events.replaceWindowMs = (cfg.autoUpdateSettle + cfg.autoUpdateHealthTimeout + 60) * 1000;
events.start();
// Certificate trouble, hourly (first check after 5 minutes), when the proxy runs.
const certCheck = () => void checkCertificates(rules.list(), h => proxy.certificate(h), notifier).catch(e => console.error(`kontainers: certificate check failed: ${(e as Error).message}`));
const certTimers = cfg.proxy.enabled ? [setTimeout(certCheck, 5 * 60_000), setInterval(certCheck, 3600_000)] : [];
// The activity log keeps a year.
const pruneAudit = () => { try { db.query('DELETE FROM audit_log WHERE at < ?').run(Date.now() - 365 * 86400_000); } catch (e) { console.error(`kontainers: could not prune the activity log: ${(e as Error).message}`); } };
pruneAudit();
const auditTimer = setInterval(pruneAudit, 86400_000);

const server = Bun.serve({
  hostname: cfg.host,
  port: cfg.port,
  // Forms are limited to 1 MB in the handler, which says so (on a page, for a logged-in user) and
  // refuses bodies over that before reading them; only above 16 MB does the server itself refuse,
  // with an empty 413.
  maxRequestBodySize: 16 * 1024 * 1024,
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
const TIDY_ATTEMPTS = 10;
const tidied = new Set<string>();
// When Docker is not there yet (a daemon restarting with kontainers), the tidy-up starts 30 s later
// and keeps trying.
// Not awaited: it can watch a replacement for a while, and the proxy and the signal handlers below
// must not wait for that.
if (await docker.ping()) void tidyUp(1);
else {
  console.error(`kontainers: Docker is not reachable at ${cfg.dockerHost}; pages will show errors until it is`);
  setTimeout(() => void tidyUp(1), 30_000).unref?.();
}

// Finishes replacements a restart interrupted (update.ts recoverInterrupted). What Docker is still
// busy with, or a Docker API that does not answer yet, is tried again every 30 s, ten times; the
// last attempt says what is left to check by hand. Each outcome is logged, recorded once on the
// Activity page and sent as an automatic-update notification.
async function tidyUp(attempt: number): Promise<void> {
  if (stopping.signal.aborted) return;
  const kept = (name: string, id: string) => { if (autoUpdates.get(name)) autoUpdates.recreated(name, id); };
  let again = false;
  try {
    events.noteSetAside(await docker.listContainers());
    const watch = (id: string) => watchRunning(docker, id, { settleMs: cfg.autoUpdateSettle * 1000, healthTimeoutMs: cfg.autoUpdateHealthTimeout * 1000, signal: stopping.signal, wasStopped: cid => events.wasStopped(cid) });
    const held = (name: string, image: string) => { if (!autoUpdates.get(name)) return false; autoUpdates.hold(name, image); return true; };
    const windowMs = (cfg.autoUpdateSettle + cfg.autoUpdateHealthTimeout + 120) * 1000;
    // Each outcome is reported as it is reached, not when the slowest watch ends.
    const report = (r: Recovered) => {
      if (r.retry) { again = true; if (attempt === 1) console.log(`kontainers: ${r.text}`); return; }
      // Counts in the text (restarts) change between attempts; the same outcome is said once.
      const key = `${r.name}\n${r.text.replace(/\d+/g, '#')}`;
      if (tidied.has(key)) return;
      tidied.add(key);
      console.log(`kontainers: ${r.text}`);
      try { systemAudit('recover', r.name, `${r.trouble ? 'failed' : 'note'}: ${r.text}`.slice(0, 500)); } catch { /* the log line is enough */ }
      void notifier.send({ kind: 'autoupdate', title: `Interrupted update of ${r.name}`, message: `${r.text}.`, container: r.name }, `recover:${r.name}:${Bun.hash(r.text.replace(/\d+/g, '#')).toString(36)}`, 3600_000).catch(() => {});
    };
    await recoverInterrupted(docker, kept, journal, n => autoUpdates.busy.take(n), attempt >= TIDY_ATTEMPTS, { watch, held, windowMs, report, signal: stopping.signal });
    autoUpdates.adopt(await docker.listContainers());
  } catch (e) {
    if (attempt === 1 || attempt >= TIDY_ATTEMPTS) console.error(`kontainers: could not look for interrupted updates${attempt >= TIDY_ATTEMPTS ? ' (gave up)' : ''}: ${(e as Error).message}`);
    again = true;
  }
  if (again && attempt < TIDY_ATTEMPTS && !stopping.signal.aborted) setTimeout(() => void tidyUp(attempt + 1), 30_000).unref?.();
}

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
  // Replacements in progress put the old container back. Stopping the old container can itself take
  // its 10 s stop timeout, so this waits up to 25 s; compose.yaml gives kontainers 30 s to stop. If
  // Docker kills it sooner (docker run's default is 10 s), the journal lets the next start finish.
  stopping.abort();
  autoUpdates.stop();
  for (let i = 0; i < 250 && autoUpdates.busy.size; i++) await Bun.sleep(100);
  if (autoUpdates.busy.size) console.error('kontainers: an update was still running at shutdown; it is tidied up at the next start');
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
