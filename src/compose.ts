// A compose.yaml for a container made in kontainers, so that it can be moved into compose. Every
// string is double-quoted (JSON's escapes are valid in YAML's double-quoted scalars, so no value
// can end the line or start a mapping) with `$` doubled, because compose interpolates `$VAR`.

import type { CreateSpec } from './docker';

const q = (s: unknown) => JSON.stringify(String(s).replace(/\$/g, '$$$$'))
  // Characters some YAML readers take as a line break, or drop: escaped too.
  .replace(/[\u0085\u2028\u2029\ufeff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export interface ComposeNetwork {
  name: string; // a user network; absent: Docker's default bridge
  aliases?: string[];
}

export function composeFile(spec: CreateSpec & { name: string }, network?: ComposeNetwork): string {
  const L: string[] = ['services:', `  ${q(spec.name)}:`, `    image: ${q(spec.image)}`, `    container_name: ${q(spec.name)}`];
  if (spec.cmd) L.push('    command:', ...spec.cmd.map(a => `      - ${q(a)}`));
  if (spec.env?.length) L.push('    environment:', ...spec.env.map(e => `      - ${q(e)}`));
  if (spec.ports?.length) {
    L.push('    ports:');
    for (const p of spec.ports) {
      const ip = p.hostIp ? (p.hostIp.includes(':') ? `[${p.hostIp}]:` : `${p.hostIp}:`) : '';
      L.push(`      - ${q(`${ip}${p.host}:${p.container}${p.protocol === 'udp' ? '/udp' : ''}`)}`);
    }
  }
  // Named volumes are the ones the container has now (external), so their data stays.
  const named = [...new Set((spec.volumes || []).filter(m => !m.source.startsWith('/')).map(m => m.source))];
  if (spec.volumes?.length) L.push('    volumes:', ...spec.volumes.map(m => `      - ${q(`${m.source}:${m.target}${m.readOnly ? ':ro' : ''}`)}`));
  L.push(`    restart: ${q(spec.restart || 'no')}`);
  const labels = Object.entries(spec.labels || {});
  if (labels.length) L.push('    labels:', ...labels.map(([k, x]) => `      ${q(k)}: ${q(x)}`));
  if (spec.memory) L.push(`    mem_limit: ${spec.memory}`);
  if (spec.nanoCpus) L.push(`    cpus: ${spec.nanoCpus / 1e9}`);
  if (spec.pids) L.push(`    pids_limit: ${spec.pids}`);
  if (network) {
    L.push('    networks:', `      ${q(network.name)}:`);
    if (network.aliases?.length) L.push('        aliases:', ...network.aliases.map(a => `          - ${q(a)}`));
  } else {
    // Not compose's own project network: the container stays where it is.
    L.push('    network_mode: "bridge"');
  }
  if (network) L.push('networks:', `  ${q(network.name)}:`, '    external: true');
  if (named.length) L.push('volumes:', ...named.flatMap(n => [`  ${q(n)}:`, '    external: true']));
  return L.join('\n') + '\n';
}
