// Runtime configuration, read once from the environment.

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  dockerHost: string; // unix:///path or tcp://host:port
  publicUrl: string | null; // e.g. https://kontainers.example.com; enables Secure cookies and origin checks
  trustedProxies: string[]; // socket addresses whose X-Forwarded-For is believed
  proxy: {
    enabled: boolean;
    network: string; // Docker network shared by the proxy and target containers
    acmeEmail: string | null;
    acmeCa: string | null; // ACME directory URL; Caddy's default (Let's Encrypt) when null
    acmeCaRoot: string | null; // PEM file trusted for the ACME directory (tests with Pebble)
    caddyBin: string;
    httpPort: number;
    httpsPort: number;
  };
  allowBindMounts: boolean;
  // Set in the official image: the port publish (-p 127.0.0.1:8080:8080) is the network boundary there.
  inContainer: boolean;
  allowInsecure: boolean;
}

export function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

// Returns a reason to refuse starting, or null. A non-loopback listener over plain HTTP
// sends passwords and session cookies in clear text, so it needs an explicit opt-in.
export function bindProblem(cfg: Config): string | null {
  if (isLoopback(cfg.host) || cfg.inContainer || cfg.allowInsecure) return null;
  if (cfg.publicUrl?.startsWith('https:')) return null; // TLS is terminated in front of kontainers
  return `refusing to listen on ${cfg.host}:${cfg.port} over plain HTTP. Bind 127.0.0.1, put kontainers behind HTTPS ` +
    `and set KONTAINERS_PUBLIC_URL=https://..., or set KONTAINERS_ALLOW_INSECURE=1 if you accept the risk.`;
}

function bool(v: string | undefined, dflt = false): boolean {
  if (v === undefined || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(name: string, v: string | undefined, dflt: number): number {
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name} must be a port number, got "${v}"`);
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const listen = env.KONTAINERS_LISTEN || '127.0.0.1:8080';
  const i = listen.lastIndexOf(':');
  if (i < 1) throw new Error(`KONTAINERS_LISTEN must be host:port, got "${listen}"`);
  const host = listen.slice(0, i).replace(/^\[|\]$/g, '');
  const port = int('KONTAINERS_LISTEN', listen.slice(i + 1), 8080);

  let publicUrl: string | null = null;
  if (env.KONTAINERS_PUBLIC_URL) {
    const u = new URL(env.KONTAINERS_PUBLIC_URL);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('KONTAINERS_PUBLIC_URL must be http(s)');
    publicUrl = u.origin;
  }

  return {
    host,
    port,
    dataDir: env.KONTAINERS_DATA || './data',
    dockerHost: env.DOCKER_HOST || 'unix:///var/run/docker.sock',
    publicUrl,
    trustedProxies: (env.KONTAINERS_TRUSTED_PROXIES || '').split(',').map(s => s.trim()).filter(Boolean),
    proxy: {
      enabled: bool(env.KONTAINERS_PROXY),
      network: env.KONTAINERS_PROXY_NETWORK || 'kontainers-proxy',
      acmeEmail: env.KONTAINERS_ACME_EMAIL || null,
      acmeCa: env.KONTAINERS_ACME_CA || null,
      acmeCaRoot: env.KONTAINERS_ACME_CA_ROOT || null,
      caddyBin: env.KONTAINERS_CADDY_BIN || 'caddy',
      httpPort: int('KONTAINERS_HTTP_PORT', env.KONTAINERS_HTTP_PORT, 80),
      httpsPort: int('KONTAINERS_HTTPS_PORT', env.KONTAINERS_HTTPS_PORT, 443),
    },
    allowBindMounts: bool(env.KONTAINERS_ALLOW_BIND_MOUNTS),
    inContainer: bool(env.KONTAINERS_IN_CONTAINER),
    allowInsecure: bool(env.KONTAINERS_ALLOW_INSECURE),
  };
}
