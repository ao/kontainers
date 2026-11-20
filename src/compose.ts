// A compose.yaml for a container made in kontainers, so that it can be moved into compose. Every
// string is double-quoted (JSON's escapes are valid in YAML's double-quoted scalars, so no value
// can end the line or start a mapping) with `$` doubled in values, because compose interpolates
// `$VAR` there (not in keys).

import { createHash } from 'node:crypto';
import type { CreateSpec } from './docker';

// The compose project a file for container `name` makes: its name in compose's letters, and when
// that changed it (capitals, dots), a short hash of the name, so that k.a, k-a and K-A do not
// share one project (each would see the others as orphans, and --remove-orphans removes them).
export function projectName(name: string): string {
  const folded = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return folded === name ? folded : `${folded}-${createHash('sha256').update(name).digest('hex').slice(0, 6)}`;
}

// Characters a YAML reader takes as a line break, drops, or refuses (go-yaml, which compose uses,
// refuses C1 controls and the noncharacters), written as escapes.
const escapeOdd = (s: string) => s.replace(/[\u007f-\u009f\u2028\u2029\ufeff\ufffe\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const key = (s: unknown) => escapeOdd(JSON.stringify(String(s)));
const q = (s: unknown) => key(String(s).replace(/\$/g, '$$$$'));

// The networks the service is on: Docker's default bridge, none, or user networks (external).
export interface ComposeNet { name: string; aliases?: string[]; ipv4?: string; ipv6?: string; linkLocal?: string[]; gwPriority?: number; driverOpts?: Record<string, string> }
export type ComposeNetworks = { mode: 'bridge' | 'none' } | { networks: ComposeNet[] };

// anonymous: volumes the container mounts that Docker made for it (an image's VOLUME): they are
// external here too, with a comment, since nothing then keeps them from a prune between a remove
// and the next `up`.
export function composeFile(spec: CreateSpec & { name: string }, net: ComposeNetworks = { mode: 'bridge' }, anonymous: string[] = []): string {
  // The project's name, so that it does not come from the directory's (two directories called
  // "app" would share one project).
  const project = projectName(spec.name);
  const L: string[] = [`name: ${q(project)}`, 'services:', `  ${key(spec.name)}:`, `    image: ${q(spec.image)}`, `    container_name: ${q(spec.name)}`];
  if (spec.cmd) L.push('    command:', ...spec.cmd.map(a => `      - ${q(a)}`));
  if (spec.env?.length) L.push('    environment:', ...spec.env.map(e => `      - ${q(e)}`));
  if (spec.ports?.length) {
    L.push('    ports:');
    for (const p of spec.ports) {
      const ip = p.hostIp ? (p.hostIp.includes(':') ? `[${p.hostIp}]:` : `${p.hostIp}:`) : '';
      L.push(`      - ${q(`${ip}${p.host}:${p.container}${p.protocol === 'udp' ? '/udp' : ''}`)}`);
    }
  }
  const anon = new Set(anonymous);
  const named = [...new Set((spec.volumes || []).filter(m => !m.source.startsWith('/')).map(m => m.source))];
  if (spec.volumes?.length) {
    L.push('    volumes:');
    for (const m of spec.volumes) {
      if (anon.has(m.source)) L.push(`      # an anonymous volume Docker made for ${m.target}: copy it into a named volume to keep it safe from a prune`);
      L.push(`      - ${q(`${m.source}:${m.target}${m.readOnly ? ':ro' : ''}`)}`);
    }
  }
  L.push(`    restart: ${q(spec.restart || 'no')}`);
  const labels = Object.entries(spec.labels || {});
  if (labels.length) L.push('    labels:', ...labels.map(([k, x]) => `      ${key(k)}: ${q(x)}`));
  if (spec.memory) L.push(`    mem_limit: ${spec.memory}`);
  if (spec.nanoCpus) L.push(`    cpus: ${spec.nanoCpus / 1e9}`);
  if (spec.pids) L.push(`    pids_limit: ${spec.pids}`);
  if ('mode' in net) {
    // Not compose's own project network: the container stays where it is.
    L.push(`    network_mode: ${q(net.mode)}`);
  } else {
    L.push('    networks:');
    for (const n of net.networks) {
      const body: string[] = [];
      if (n.aliases?.length) body.push('        aliases:', ...n.aliases.map(a => `          - ${q(a)}`));
      if (n.ipv4) body.push(`        ipv4_address: ${q(n.ipv4)}`);
      if (n.ipv6) body.push(`        ipv6_address: ${q(n.ipv6)}`);
      if (n.linkLocal?.length) body.push('        link_local_ips:', ...n.linkLocal.map(a => `          - ${q(a)}`));
      if (n.gwPriority) body.push(`        gw_priority: ${n.gwPriority}`);
      const opts = Object.entries(n.driverOpts || {});
      if (opts.length) body.push('        driver_opts:', ...opts.map(([k, x]) => `          ${key(k)}: ${q(x)}`));
      L.push(body.length ? `      ${key(n.name)}:` : `      ${key(n.name)}: {}`, ...body);
    }
    L.push('networks:', ...net.networks.flatMap(n => [`  ${key(n.name)}:`, '    external: true']));
  }
  if (named.length) L.push('volumes:', ...named.flatMap(n => [`  ${key(n)}:`, '    external: true']));
  return L.join('\n') + '\n';
}
