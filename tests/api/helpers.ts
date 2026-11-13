// Starts the real server (bun src/main.ts) as a child process and drives it over HTTP like a browser.

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const PW = 'correct horse battery';
export const DOCKER = process.env.KONTAINERS_TEST_DOCKER_HOST || '';

export interface Running {
  base: string;
  port: number;
  dataDir: string;
  setupToken: string | null;
  output: () => string;
  stop: () => Promise<void>;
}

let nextPort = 20000 + Math.floor(Math.random() * 20000);

export async function startServer(env: Record<string, string> = {}, dataDir = mkdtempSync(join(tmpdir(), 'kontainers-api-'))): Promise<Running> {
  const port = nextPort++;
  let out = '';
  const proc = Bun.spawn(['bun', 'src/main.ts'], {
    env: { PATH: process.env.PATH!, HOME: process.env.HOME || '/tmp', KONTAINERS_LISTEN: `127.0.0.1:${port}`, KONTAINERS_DATA: dataDir, DOCKER_HOST: DOCKER || 'tcp://127.0.0.1:1', ...env },
    stdout: 'pipe', stderr: 'pipe',
  });
  const pump = async (s: ReadableStream<Uint8Array>) => { for await (const c of s) out += new TextDecoder().decode(c); };
  void pump(proc.stdout as ReadableStream<Uint8Array>);
  void pump(proc.stderr as ReadableStream<Uint8Array>);

  const deadline = Date.now() + 15000;
  while (!/listening on/.test(out)) {
    if (proc.exitCode !== null) throw new Error(`server exited (${proc.exitCode}):\n${out}`);
    if (Date.now() > deadline) { proc.kill(); throw new Error(`server did not start:\n${out}`); }
    await Bun.sleep(50);
  }
  await Bun.sleep(50); // let the setup-token line arrive
  const m = /setup token: (\S+)/.exec(out);
  return {
    base: `http://127.0.0.1:${port}`,
    port, dataDir,
    setupToken: m ? m[1] : null,
    output: () => out,
    stop: async () => { proc.kill('SIGTERM'); await proc.exited; },
  };
}

// Runs main.ts to completion (for exit-code tests).
export async function runMain(args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(['bun', 'src/main.ts', ...args], { env: { PATH: process.env.PATH!, HOME: '/tmp', ...env }, stdout: 'pipe', stderr: 'pipe' });
  const [o, e] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, out: o + e };
}

// A browser-ish client: keeps cookies, sends same-origin headers, extracts CSRF tokens from pages.
export class Client {
  cookies = new Map<string, string>();
  csrf = '';
  constructor(public base: string) {}

  headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { origin: this.base, 'sec-fetch-site': 'same-origin', ...extra };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    return h;
  }

  private keep(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (/max-age=0/i.test(c) || v === '') this.cookies.delete(k); else this.cookies.set(k, v);
    }
  }

  async get(path: string, extra: Record<string, string> = {}): Promise<Response> {
    const res = await fetch(this.base + path, { headers: this.headers(extra), redirect: 'manual' });
    this.keep(res);
    return res;
  }

  async page(path: string): Promise<string> {
    const res = await this.get(path);
    const body = await res.text();
    const m = /name="_csrf" value="([^"]+)"/.exec(body);
    if (m) this.csrf = m[1];
    return body;
  }

  async post(path: string, form: Record<string, string>, opts: { csrf?: boolean; headers?: Record<string, string> } = {}): Promise<Response> {
    const body = new URLSearchParams({ ...(opts.csrf === false ? {} : { _csrf: this.csrf }), ...form });
    const res = await fetch(this.base + path, {
      method: 'POST', redirect: 'manual', body,
      headers: this.headers({ 'content-type': 'application/x-www-form-urlencoded', ...(opts.headers || {}) }),
    });
    this.keep(res);
    return res;
  }

  // POST, follow the redirect, return the page and its flash/error text.
  async submit(path: string, form: Record<string, string>): Promise<{ status: number; body: string; flash: string; error: string }> {
    const res = await this.post(path, form);
    if (res.status !== 303) return { status: res.status, body: await res.text(), flash: '', error: '' };
    const body = await this.page(res.headers.get('location')!);
    const flash = /<p class="flash"[^>]*>([^<]*)<\/p>/.exec(body)?.[1] ?? '';
    const error = /<p class="error"[^>]*>([^<]*)<\/p>/.exec(body)?.[1] ?? '';
    return { status: 303, body, flash, error };
  }
}

// Server with its first account set up and a logged-in client.
export async function readyServer(env: Record<string, string> = {}): Promise<{ srv: Running; c: Client }> {
  const srv = await startServer(env);
  const c = new Client(srv.base);
  const res = await c.post('/setup', { token: srv.setupToken!, username: 'admin', password: PW }, { csrf: false });
  if (res.status !== 303) throw new Error(`setup failed: ${res.status} ${await res.text()}`);
  await c.page('/settings');
  return { srv, c };
}
