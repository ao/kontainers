// Helpers shared by the ACME tests (tests/proxy, tests/renewal): talking to Pebble's management
// API and to kontainers' HTTPS port, and reading the certificate the server presents.

import { connect } from 'node:tls';
import { request as httpsRequest } from 'node:https';

export const PEBBLE_MGMT = process.env.KONTAINERS_TEST_PEBBLE_MGMT || '';
export const HTTP = 5002, HTTPS = 5001;

// Pebble's API and management endpoints use a fixed test certificate signed by its "minica" CA.
export const MINICA = process.env.KONTAINERS_TEST_PEBBLE_CA ? await Bun.file(process.env.KONTAINERS_TEST_PEBBLE_CA).text() : '';

// The roots Pebble generated at startup sign the certificates it issues.
// Returned as one PEM per array entry: Bun reads only the first certificate of a concatenated string.
let roots: string[] = [];
export async function pebbleRoots(): Promise<string[]> {
  if (roots.length) return roots;
  const opt = { tls: { ca: MINICA } } as RequestInit;
  const pem = (await (await fetch(`${PEBBLE_MGMT}/roots/0`, opt)).text()) + '\n' + (await (await fetch(`${PEBBLE_MGMT}/intermediates/0`, opt)).text());
  roots = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  return roots;
}

// node:https rather than fetch: Bun 1.3.1's fetch rejects a chain that ends in a server-sent
// intermediate even when the root is in tls.ca; node:tls verifies the same chain correctly.
export async function https(host: string, path = '/'): Promise<{ status: number; text: () => Promise<string> }> {
  const ca = await pebbleRoots();
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ host, port: HTTPS, path, servername: host, ca, timeout: 5000 }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: async () => body }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

// The leaf certificate the server presents. The handshake fails (and so rejects) if the chain does
// not verify against Pebble's roots, including when the certificate has expired.
export interface PeerCert {
  serial: string;
  issuerCN: string;
  san: string;
  from: number; // notBefore, ms since epoch
  to: number;   // notAfter, ms since epoch
}

export function peerCert(host: string): Promise<PeerCert> {
  return new Promise(async (resolve, reject) => {
    const s = connect({ host, port: HTTPS, servername: host, ca: await pebbleRoots() }, () => {
      const c = s.getPeerCertificate();
      s.end();
      resolve({
        serial: c.serialNumber,
        issuerCN: c.issuer.CN,
        san: c.subjectaltname,
        from: Date.parse(c.valid_from),
        to: Date.parse(c.valid_to),
      });
    });
    s.on('error', reject);
  });
}

export async function until<T>(what: string, fn: () => Promise<T | null>, timeoutMs = 90000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    try { const v = await fn(); if (v !== null) return v; } catch (e) { last = e; }
    await Bun.sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}: ${last}`);
}
