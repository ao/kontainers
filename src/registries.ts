// Registry logins: credentials for private registries, handed to the Docker daemon with each pull
// and update check (the X-Registry-Auth header). Logins made with `docker login` on the host live
// in the Docker CLI's config file, which the daemon's API does not use, so they are entered here.
//
// Passwords are stored encrypted (AES-256-GCM) with a key kept in <data>/registry.key, a file the
// backup does not include: a backup holds the ciphertext only, and after restoring one on another
// host the passwords are entered again.

import type { Database } from 'bun:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as v from './validate';
import { writeFailed } from './storage';

export const DOCKER_HUB = 'docker.io';
const HUB_ALIASES = new Set(['docker.io', 'index.docker.io', 'registry-1.docker.io', 'registry.hub.docker.com', 'hub.docker.com']);
const HUB_ADDRESS = 'https://index.docker.io/v1/';

export function normalizeRegistry(input: string): string {
  const h = String(input ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return HUB_ALIASES.has(h) ? DOCKER_HUB : h;
}

// The registry an image is pulled from: the reference's first part when it is a host (it has a dot
// or a port, or is localhost), otherwise Docker Hub.
export function registryOf(ref: string): string {
  const i = ref.indexOf('/');
  if (i < 0) return DOCKER_HUB;
  const first = ref.slice(0, i);
  return first.includes('.') || first.includes(':') || first === 'localhost' ? normalizeRegistry(first) : DOCKER_HUB;
}

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST = new RegExp(`^(?:${LABEL}(?:\\.${LABEL})*|\\[[0-9a-f:.]+\\])(?::(\\d{1,5}))?$`);

export function validateRegistry(input: unknown): string {
  const h = normalizeRegistry(String(input ?? ''));
  const m = HOST.exec(h);
  if (!m || h.length > 253 || (m[1] && (+m[1] < 1 || +m[1] > 65535))) {
    throw new v.ValidationError('the registry must be a host name with an optional port, such as ghcr.io or registry.example.com:5000');
  }
  return h;
}

export interface RegistryLogin {
  id: number; registry: string; username: string; created_at: number;
  last_used_at: number | null; last_result: string | null;
}

export class Registries {
  private key: Buffer | null = null;

  constructor(private db: Database, private keyFile: string, private now: () => number = Date.now) {}

  list(): RegistryLogin[] {
    return this.db.query('SELECT id, registry, username, created_at, last_used_at, last_result FROM registry_logins ORDER BY registry').all() as RegistryLogin[];
  }

  has(registry: string): boolean { return !!this.db.query('SELECT 1 FROM registry_logins WHERE registry = ?').get(registry); }

  // Adds a login, or replaces the one for that registry.
  add(input: { registry?: unknown; username?: unknown; password?: unknown }): RegistryLogin {
    const registry = validateRegistry(input.registry);
    const username = String(input.username ?? '').trim();
    const password = String(input.password ?? '');
    if (!username || username.length > 255 || /[\u0000-\u001f]/.test(username)) throw new v.ValidationError('the username must be 1 to 255 characters, without control characters');
    if (!password || password.length > 4096 || /[\u0000-\u001f]/.test(password)) throw new v.ValidationError('the password or token must be 1 to 4096 characters, without control characters');
    if (!this.has(registry) && (this.db.query('SELECT COUNT(*) AS n FROM registry_logins').get() as { n: number }).n >= 50) throw new v.ValidationError('at most 50 registry logins');
    const secret = this.seal(password);
    return this.db.query(`INSERT INTO registry_logins (registry, username, secret, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (registry) DO UPDATE SET username = excluded.username, secret = excluded.secret, created_at = excluded.created_at, last_used_at = NULL, last_result = NULL
      RETURNING id, registry, username, created_at, last_used_at, last_result`).get(registry, username, secret, this.now()) as RegistryLogin;
  }

  remove(id: number): string {
    const r = this.db.query('DELETE FROM registry_logins WHERE id = ? RETURNING registry').get(id) as { registry: string } | null;
    if (!r) throw Object.assign(new v.ValidationError('registry login not found'), { status: 404 });
    return r.registry;
  }

  // The X-Registry-Auth header value for pulling or looking up `ref`, or null without a login.
  header(ref: string): string | null {
    const registry = registryOf(ref);
    const row = this.db.query('SELECT username, secret FROM registry_logins WHERE registry = ?').get(registry) as { username: string; secret: Uint8Array } | null;
    if (!row) return null;
    let password: string;
    try { password = this.open(Buffer.from(row.secret)); } catch {
      this.noteResult(registry, `failed: the password cannot be read (registry.key in the data volume is missing or is not the one it was saved with, as after restoring a backup); enter it again`);
      return null;
    }
    const json = JSON.stringify({ username: row.username, password, serveraddress: registry === DOCKER_HUB ? HUB_ADDRESS : registry });
    // URL-safe base64 with padding, which every daemon version decodes.
    return Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }

  noteResult(registry: string, result: string): void {
    try { this.db.query('UPDATE registry_logins SET last_used_at = ?, last_result = ? WHERE registry = ?').run(this.now(), result.slice(0, 300), registry); } catch (e) { writeFailed(e, 'could not save the result of a registry login'); }
  }

  private secretKey(): Buffer {
    if (this.key) return this.key;
    if (existsSync(this.keyFile)) {
      const k = readFileSync(this.keyFile);
      if (k.length !== 32) throw new Error(`${this.keyFile} is not a 32-byte key`);
      return (this.key = k);
    }
    const k = randomBytes(32);
    writeFileSync(this.keyFile, k, { mode: 0o600, flag: 'wx' });
    return (this.key = k);
  }

  // iv (12 bytes) | tag (16 bytes) | ciphertext
  private seal(text: string): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.secretKey(), iv);
    const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  }

  private open(b: Buffer): string {
    if (!existsSync(this.keyFile) && !this.key) throw new Error('no key');
    const d = createDecipheriv('aes-256-gcm', this.secretKey(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  }
}

// What to add to a pull or lookup error that looks like a missing or wrong login.
export function loginHint(message: string, registry: string, hadLogin: boolean): string {
  if (!/unauthorized|denied|authentication required|no basic auth credentials|requested access to the resource is denied|may require 'docker login'/i.test(message)) return '';
  return hadLogin
    ? `; the registry refused the login saved for ${registry}: check it on the Settings page`
    : `; if the image is private, add a login for ${registry} on the Settings page`;
}
