// Input validation for everything that reaches Docker or the proxy config.
// Values are checked against an allowlist shape; nothing is escaped and passed through.

export class ValidationError extends Error {
  status = 400;
}

function check(ok: boolean, msg: string): void {
  if (!ok) throw new ValidationError(msg);
}

// Container IDs (hex, 12-64) or names. Docker names: [a-zA-Z0-9][a-zA-Z0-9_.-]+
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const ID = /^[a-f0-9]{12,64}$/;

export function ref(v: unknown, what = 'id'): string {
  check(typeof v === 'string' && (ID.test(v) || NAME.test(v)), `invalid ${what}`);
  return v as string;
}

export function name(v: unknown, what = 'name'): string {
  check(!(typeof v === 'string' && v.length > 128), `invalid ${what}: at most 128 characters (${String(v).length} given)`);
  check(typeof v === 'string' && NAME.test(v), `invalid ${what}: letters, digits, _ . - only, must not start with a symbol`);
  return v as string;
}

// Image reference: [registry[:port]/]path[:tag][@sha256:digest]. Must not start with '-'.
const IMAGE = /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]{1,5})?\/)?[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;

export function image(v: unknown): string {
  check(typeof v === 'string' && v.length <= 512 && IMAGE.test(v), 'invalid image reference');
  return v as string;
}

// Image IDs for removal may also be sha256:<hex>
export function imageRef(v: unknown): string {
  if (typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v)) return v;
  if (typeof v === 'string' && ID.test(v)) return v;
  return image(v);
}

export function port(v: unknown, what = 'port'): number {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  check(typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535, `invalid ${what}`);
  return n as number;
}

const ENV = /^[A-Za-z_][A-Za-z0-9_]*=[^\0\n]*$/;
export function envVar(v: unknown): string {
  check(!(typeof v === 'string' && v.length > 32768), `environment variable too long: at most 32768 characters (${String(v).length} given)`);
  check(typeof v === 'string' && ENV.test(v), 'invalid environment variable, expected KEY=value');
  return v as string;
}

export function hostIp(v: unknown): string {
  if (v === undefined || v === null || v === '') return '127.0.0.1';
  check(typeof v === 'string' && (v === '0.0.0.0' || v === '::' || /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[0-9a-fA-F:]+$/.test(v)), 'invalid host IP');
  return v as string;
}

// DNS hostname for a proxy rule. Lowercase letters, digits, hyphens, dots; optional leading "*.".
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
export function hostname(v: unknown): string {
  check(typeof v === 'string', 'invalid hostname');
  let s = (v as string).replace(/^ +| +$/g, '').toLowerCase(); // spaces only: a newline stays an error
  // An internationalised name is stored in its ASCII (punycode) form, as DNS and certificates use it.
  if (/[^\x00-\x7f]/.test(s)) {
    const wild = s.startsWith('*.');
    try { s = (wild ? '*.' : '') + new URL(`http://${wild ? s.slice(2) : s}`).hostname; } catch { check(false, 'invalid hostname'); }
  }
  check(s.length <= 253, 'hostname too long');
  const labels = s.startsWith('*.') ? s.slice(2).split('.') : s.split('.');
  check(labels.length >= 1 && labels.every(l => LABEL.test(l)), 'invalid hostname');
  return s;
}

// Path prefix for a proxy rule: starts with '/', URL path characters only.
export function pathPrefix(v: unknown): string {
  if (v === undefined || v === null || v === '') return '/';
  check(typeof v === 'string' && /^\/[A-Za-z0-9._~\/-]{0,255}$/.test(v as string) && !(v as string).includes('..'), 'invalid path prefix');
  return v as string;
}

export function username(v: unknown): string {
  check(typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(v), 'invalid username: 1-64 of letters, digits, _ . -');
  return v as string;
}

export function password(v: unknown): string {
  check(typeof v === 'string' && v.length >= 12 && v.length <= 1024, 'password must be 12-1024 characters');
  return v as string;
}

export function intInRange(v: unknown, min: number, max: number, dflt: number): number {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  check(Number.isInteger(n) && n >= min && n <= max, `value must be an integer from ${min} to ${max}`);
  return n;
}

// Resource limits for Create and Edit settings. Empty means none.
// A memory size: bytes, or a number with k, m, g or t (1024 each), as docker run -m takes it.
// Docker's minimum is 6 MiB.
export function memoryLimit(v: unknown): number | undefined {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*([kmgt]?)(?:i?b)?$/.exec(s);
  if (!m) throw new ValidationError('the memory limit must be a size such as 512m or 2g');
  const bytes = Math.round(Number(m[1]) * 1024 ** ({ '': 0, k: 1, m: 2, g: 3, t: 4 } as Record<string, number>)[m[2]]);
  if (bytes < 6 * 1024 * 1024) throw new ValidationError('the memory limit must be at least 6m (Docker does not allow less)');
  if (bytes > 2 ** 50) throw new ValidationError('the memory limit is too large');
  return bytes;
}

// CPUs, as docker run --cpus: 0.01 to 1024, in steps of 0.01. Returned in Docker's NanoCpus.
export function cpuLimit(v: unknown): number | undefined {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return undefined;
  if (!/^\d+(\.\d{1,9})?$/.test(s) || Number(s) < 0.01 || Number(s) > 1024) throw new ValidationError('CPUs must be a number such as 0.5 or 2, from 0.01 to 1024');
  return Math.round(Number(s) * 1e9);
}

// The most processes (and threads) the container may run, as docker run --pids-limit.
export function pidsLimit(v: unknown): number | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  if (!/^\d+$/.test(s) || Number(s) < 1 || Number(s) > 2 ** 31 - 1) throw new ValidationError('the process limit must be a whole number from 1');
  return Number(s);
}

// How a memory limit reads in a form or on a page: 512m, 1.5g (the largest unit it is a whole
// hundredth of), else bytes.
export function formatMemory(bytes: number): string {
  for (const [u, n] of [['t', 4], ['g', 3], ['m', 2], ['k', 1]] as [string, number][]) {
    const x = bytes / 1024 ** n;
    // Exactly (an exact hundredth of the unit), so an untouched Edit saves the same value.
    if (x >= 1 && Math.round(Math.round(x * 100) / 100 * 1024 ** n) === bytes) return `${Math.round(x * 100) / 100}${u}`;
  }
  return String(bytes);
}
