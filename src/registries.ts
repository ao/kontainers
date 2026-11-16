// Registry logins: credentials for private registries, handed to the Docker daemon with each pull
// and update check (the X-Registry-Auth header). Logins made with `docker login` on the host live
// in the Docker CLI's config file, which the daemon's API does not use, so they are entered here.
//
// Passwords are stored encrypted (AES-256-GCM) with a key kept in <data>/registry.key, a file the
// backup does not include: a backup holds the ciphertext only, and after restoring one on another
// host the passwords are entered again.

import type { Database } from 'bun:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
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

  validate(input: { registry?: unknown; username?: unknown; password?: unknown }): { registry: string; username: string; password: string } {
    const registry = validateRegistry(input.registry);
    const username = String(input.username ?? '').trim();
    const password = String(input.password ?? '');
    if (!username || username.length > 255 || /[\u0000-\u001f]/.test(username)) throw new v.ValidationError('the username must be 1 to 255 characters, without control characters');
    if (!password || password.length > 4096 || /[\u0000-\u001f]/.test(password)) throw new v.ValidationError('the password or token must be 1 to 4096 characters, without control characters');
    return { registry, username, password };
  }

  // Adds a login, or replaces the one for that registry.
  add(input: { registry?: unknown; username?: unknown; password?: unknown }): RegistryLogin {
    const { registry, username, password } = this.validate(input);
    if (!this.has(registry) && (this.db.query('SELECT COUNT(*) AS n FROM registry_logins').get() as { n: number }).n >= 50) throw new v.ValidationError('at most 50 registry logins');
    const secret = this.seal(password, registry);
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
    try { password = this.open(Buffer.from(row.secret), registry); } catch {
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

  // The key as it is on disk, or null when there is none. An empty file is what a write that
  // failed (a full volume) leaves behind; it counts as none.
  private existingKey(): Buffer | null {
    if (this.key) return this.key;
    if (!existsSync(this.keyFile)) return null;
    const k = readFileSync(this.keyFile);
    if (k.length === 0) return null;
    if (k.length !== 32) throw Object.assign(new v.ValidationError(`${this.keyFile} in the data volume is not a 32-byte key, so no login can be saved; move it away to start again (saved registry passwords then have to be entered again)`), { status: 500 });
    return (this.key = k);
  }

  // Throws (with the reason) if the key file exists but cannot be used.
  ready(): void { this.existingKey(); }

  // Made on first use: written to a temporary file, flushed to disk, then linked into place, so the
  // key file is never half written and an existing key is never replaced.
  private secretKey(): Buffer {
    const have = this.existingKey();
    if (have) return have;
    if (existsSync(this.keyFile)) unlinkSync(this.keyFile); // empty: see existingKey
    const k = randomBytes(32);
    const tmp = `${this.keyFile}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      const fd = openSync(tmp, 'wx', 0o600);
      try { writeSync(fd, k); fsyncSync(fd); } finally { closeSync(fd); }
      try { linkSync(tmp, this.keyFile); } catch (e) {
        // Another request made it first: use that one.
        if ((e as { code?: string }).code === 'EEXIST') { this.key = null; const other = this.existingKey(); if (other) return other; }
        throw e;
      }
    } finally {
      try { unlinkSync(tmp); } catch { /* not there */ }
    }
    try { const d = openSync(dirname(this.keyFile), 'r'); try { fsyncSync(d); } finally { closeSync(d); } } catch { /* not every filesystem allows it */ }
    return (this.key = k);
  }

  // version (1) | iv (12 bytes) | tag (16 bytes) | ciphertext. The registry is authenticated data,
  // so a secret moved to another row does not open for that registry.
  private seal(text: string, registry: string): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.secretKey(), iv, { authTagLength: 16 });
    c.setAAD(Buffer.from(registry));
    const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), body]);
  }

  private open(b: Buffer, registry: string): string {
    const key = this.existingKey();
    if (!key) throw new Error('no key');
    if (b.length < 29 || b[0] !== 1) throw new Error('not a sealed secret');
    const d = createDecipheriv('aes-256-gcm', key, b.subarray(1, 13), { authTagLength: 16 });
    d.setAAD(Buffer.from(registry));
    d.setAuthTag(b.subarray(13, 29));
    return Buffer.concat([d.update(b.subarray(29)), d.final()]).toString('utf8');
  }
}

// What to add to a pull or lookup error that looks like a missing or wrong login. login: none
// saved, one saved and sent, or one saved that cannot be read (registry.key missing).
export function loginHint(message: string, registry: string, login: 'none' | 'sent' | 'unreadable'): string {
  if (!/unauthorized|authentication required|no basic auth credentials|(?<!permission )\bdenied\b|may require 'docker login'|incorrect username or password/i.test(message)) return '';
  if (login === 'sent') return `; the registry refused the login saved for ${registry}: check it on the Settings page`;
  if (login === 'unreadable') return `; the login saved for ${registry} cannot be read (registry.key in the data volume is missing or different): save it again on the Settings page`;
  return `; if the image is private, add a login for ${registry} on the Settings page`;
}
