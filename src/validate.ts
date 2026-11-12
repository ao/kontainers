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
  check(typeof v === 'string' && v.length <= 32768 && ENV.test(v), 'invalid environment variable, expected KEY=value');
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
  const s = (v as string).toLowerCase();
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
