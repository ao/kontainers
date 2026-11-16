// Watches the Docker daemon's container events and sends notifications for the ones a person
// should hear about: a container that stopped on its own (a crash, an error exit, out of memory)
// and a container whose healthcheck turned unhealthy. A stop someone asked for (docker stop,
// docker kill, kontainers' Stop, Restart or Update image) is preceded by a "kill" event, so a
// "die" within 30 s of one is not reported. Exit code 0 is a container that finished its work.

import type { Docker } from './docker';
import type { Notifier } from './notify';
import { endingSignal } from './update';

const KILL_WINDOW_MS = 30_000;
const EXIT_REPEAT_MS = 10 * 60_000;
const HEALTH_REPEAT_MS = 60 * 60_000;

export interface DockerEvent { Type?: string; Action?: string; status?: string; id?: string; Actor?: { ID?: string; Attributes?: Record<string, string> }; time?: number; timeNano?: number }

export class EventWatcher {
  private stopped = false;
  private ctrl: AbortController | null = null;
  private killedAt = new Map<string, number>();
  private oomAt = new Map<string, number>();
  private deaths = new Map<string, number[]>();
  // Health is kept per container ID: a container recreated under the same name starts afresh.
  private unhealthy = new Set<string>();
  // Containers whose "unhealthy" note went out: only they get a "healthy again" one, so a
  // healthcheck that flaps does not send one every cycle.
  private reported = new Set<string>();
  private since: number;
  connected = false;
  lastError: string | null = null;

  // quiet: containers being updated, whose new container may stop as part of a rollback; the
  // update reports that itself.
  constructor(private docker: Docker, private notifier: Notifier, private now: () => number = Date.now, private sleep = (ms: number) => Bun.sleep(ms), private quiet: (name: string) => boolean = () => false) {
    this.since = Math.floor(this.now() / 1000);
  }

  start(): void { void this.loop(); }

  // Someone stopped or killed this container (docker stop, restart, kill), as far as the events seen
  // say. For a container just made by an update, so any record counts.
  wasStopped(id: string): boolean { return this.killedAt.has(id); }
  stop(): void { this.stopped = true; this.ctrl?.abort(); }

  // Reconnects with a growing pause when the stream ends or fails (daemon restart, socket proxy
  // down), from the time of the last event seen, so nothing in between is missed or repeated.
  private async loop(): Promise<void> {
    let pause = 1000;
    while (!this.stopped) {
      try {
        this.ctrl = new AbortController();
        for await (const ev of this.docker.events(this.since, this.ctrl.signal)) {
          this.connected = true;
          this.lastError = null;
          pause = 1000;
          if (ev.time) this.since = Math.max(this.since, ev.time + 1);
          await this.handle(ev).catch(e => console.error(`kontainers: event handling failed: ${(e as Error).message}`));
        }
      } catch (e) {
        if (this.stopped) return;
        const msg = (e as Error).message;
        if (msg !== this.lastError) console.error(`kontainers: Docker event stream: ${msg}; retrying`);
        this.lastError = msg;
      }
      this.connected = false;
      if (this.stopped) return;
      await this.sleep(pause);
      // At most 5 s: a crash during a short outage is reported soon after the stream is back.
      pause = Math.min(pause * 2, 5000);
    }
  }

  async handle(ev: DockerEvent): Promise<void> {
    if ((ev.Type ?? 'container') !== 'container') return;
    const id = ev.Actor?.ID || ev.id || '';
    const attrs = ev.Actor?.Attributes || {};
    const name = attrs.name || id.slice(0, 12);
    const action = String(ev.Action ?? ev.status ?? '');
    const at = ev.timeNano ? Math.floor(ev.timeNano / 1e6) : ev.time ? ev.time * 1000 : this.now();

    // A kill with a signal that does not end a process (HUP for a reload) is not a stop.
    if (action === 'kill' && !endingSignal(attrs.signal)) return;
    if (action === 'kill' || action === 'stop') { this.killedAt.set(id, at); this.trim(at); return; }
    // An oom event can come from any process in the container; it explains a die only if close to it.
    if (action === 'oom') { this.oomAt.set(id, at); return; }
    if (action === 'start') { this.oomAt.delete(id); return; }
    if (action === 'destroy') { this.killedAt.delete(id); this.oomAt.delete(id); this.unhealthy.delete(id); this.reported.delete(id); return; }

    if (action === 'die') {
      const oomAt = this.oomAt.get(id);
      this.oomAt.delete(id);
      const oom = oomAt !== undefined && at - oomAt <= KILL_WINDOW_MS;
      if (this.quiet(name)) return;
      const killed = this.killedAt.get(id);
      const code = attrs.exitCode ?? '?';
      if (!oom && killed !== undefined && at - killed <= KILL_WINDOW_MS) return;
      if (!oom && code === '0') return;
      const times = (this.deaths.get(name) || []).filter(t => at - t < EXIT_REPEAT_MS);
      times.push(at);
      this.deaths.set(name, times);
      // Exit code 137 is SIGKILL. With no kill or stop before it, nobody asked: on cgroup v2 hosts
      // Docker often sends no oom event for a container killed for memory, so say what is likely.
      const why = oom ? 'ran out of memory and was stopped'
        : code === '137' ? 'was killed (exit code 137, SIGKILL) without a docker stop or kill; that usually means it ran out of memory'
        : `stopped with exit code ${code}`;
      const again = times.length > 1 ? ` It has stopped ${times.length} times in the last 10 minutes.` : '';
      // Not awaited: a slow receiver must not hold up the next events.
      this.post({ kind: 'exit', title: `${name} ${oom ? 'ran out of memory' : 'stopped'}`, message: `${name} (${attrs.image || 'unknown image'}) ${why}.${again}`, container: name },
        `exit:${name}`, EXIT_REPEAT_MS);
      return;
    }

    if (action.startsWith('health_status')) {
      // A container being replaced is judged by the update itself.
      if (this.quiet(name)) return;
      const status = action.split(':')[1]?.trim();
      if (status === 'unhealthy' && !this.unhealthy.has(id)) {
        this.unhealthy.add(id);
        this.post({ kind: 'health', title: `${name} is unhealthy`, message: `The healthcheck of ${name} (${attrs.image || 'unknown image'}) reports unhealthy.`, container: name },
          `health:${name}`, HEALTH_REPEAT_MS, () => this.reported.add(id));
      } else if (status === 'healthy' && this.unhealthy.delete(id) && this.reported.delete(id)) {
        this.post({ kind: 'health', title: `${name} is healthy again`, message: `The healthcheck of ${name} reports healthy again.`, container: name },
          `health-ok:${name}`, HEALTH_REPEAT_MS);
      }
    }
  }

  // going: called at once if the note goes out (it is not a repeat, and some target takes this kind).
  private post(note: Parameters<Notifier['send']>[0], key: string, within: number, going?: () => void): void {
    void this.notifier.send(note, key, within, going).catch(e => console.error(`kontainers: notification failed: ${(e as Error).message}`));
  }

  private trim(at: number): void {
    if (this.killedAt.size < 1000) return;
    for (const [k, t] of this.killedAt) if (at - t > KILL_WINDOW_MS) this.killedAt.delete(k);
  }
}

// Certificates: an HTTPS rule with no certificate 15 minutes after it was added, or one whose
// certificate is close to expiry. Caddy renews when a third of the lifetime is left (30 days of
// 90); a sixth left (15 days of 90, 1 of a 6-day certificate), at most 14 days, means renewal is
// failing. Each fact is reported once a day.
export async function checkCertificates(rules: { hostname: string; tls: boolean; enabled: boolean; created_at: number }[], cert: (host: string) => { notAfter: Date; notBefore?: Date } | null, notifier: Notifier, now = Date.now()): Promise<void> {
  for (const r of rules) {
    if (!r.tls || !r.enabled || r.hostname.startsWith('*')) continue;
    const c = cert(r.hostname);
    if (!c) {
      if (now - r.created_at < 15 * 60_000) continue;
      await notifier.send({ kind: 'cert', title: `No certificate for ${r.hostname}`, message: `The HTTPS rule for ${r.hostname} has no certificate yet. DNS for it must point at this host, and ports 80 and 443 must be reachable from the internet; the kontainers log has the details.` },
        `cert-missing:${r.hostname}`, 86400_000);
      continue;
    }
    const left = c.notAfter.getTime() - now;
    const life = c.notBefore ? c.notAfter.getTime() - c.notBefore.getTime() : 90 * 86400_000;
    const days = Math.floor(left / 86400_000);
    if (left < Math.min(14 * 86400_000, life / 6)) {
      await notifier.send({ kind: 'cert', title: `Certificate for ${r.hostname} ${left < 0 ? 'has expired' : days < 1 ? 'expires within a day' : `expires in ${days} day${days === 1 ? '' : 's'}`}`, message: `The certificate for ${r.hostname} ${left < 0 ? 'expired' : 'expires'} on ${c.notAfter.toISOString().slice(0, 16).replace('T', ' ')} UTC and has not been renewed; the kontainers log has Caddy's errors.` },
        `cert-expiring:${r.hostname}:${c.notAfter.toISOString().slice(0, 10)}`, 86400_000);
    }
  }
}
