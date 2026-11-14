import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../../src/config';
import { clientIp, containerSpec, splitArgs, hostAllowed, normalizeIp, parseCookies, parsePort, parseVolume, sameOrigin } from '../../src/server';
import { demux } from '../../src/docker';
import { esc, html, raw, formatPorts, isSelf, containersPage, containerPage, imagesPage, proxyPage, loginPage, setupPage } from '../../src/views';
import type { Rule } from '../../src/proxy';

const local = loadConfig({});
const pub = loadConfig({ KONTAINERS_PUBLIC_URL: 'https://k.example.com', KONTAINERS_LISTEN: '0.0.0.0:8080' });

describe('clientIp', () => {
  test('ignores X-Forwarded-For from untrusted peers', () => {
    expect(clientIp('10.0.0.9', '1.2.3.4', [])).toBe('10.0.0.9');
    expect(clientIp('10.0.0.9', '1.2.3.4', ['10.0.0.1'])).toBe('10.0.0.9');
  });
  test('takes the right-most untrusted hop from a trusted proxy', () => {
    expect(clientIp('10.0.0.1', '6.6.6.6, 1.2.3.4', ['10.0.0.1'])).toBe('1.2.3.4');
    expect(clientIp('10.0.0.1', '1.2.3.4, 10.0.0.2', ['10.0.0.1', '10.0.0.2'])).toBe('1.2.3.4');
  });
  test('normalizes IPv4-mapped IPv6', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(clientIp('::ffff:10.0.0.1', '1.2.3.4', ['10.0.0.1'])).toBe('1.2.3.4');
  });
});

describe('hostAllowed (DNS rebinding)', () => {
  test('loopback names and IP literals pass without a public URL', () => {
    for (const h of ['localhost:8080', '127.0.0.1:8080', '[::1]:8080', '192.168.1.5:8080', '127.0.0.1']) expect(hostAllowed(h, local)).toBe(true);
  });
  test('other DNS names are refused without a public URL', () => {
    for (const h of ['evil.example:8080', 'rebind.attacker.test', '', 'a b']) expect(hostAllowed(h, local)).toBe(false);
    expect(hostAllowed(null, local)).toBe(false);
  });
  test('with a public URL, its host and loopback pass', () => {
    expect(hostAllowed('k.example.com', pub)).toBe(true);
    expect(hostAllowed('localhost:8080', pub)).toBe(true);
    expect(hostAllowed('other.example.com', pub)).toBe(false);
  });
});

describe('sameOrigin (CSRF)', () => {
  const req = (h: Record<string, string>) => new Request('http://localhost:8080/x', { method: 'POST', headers: { host: 'localhost:8080', ...h } });
  test('accepts same-origin', () => {
    expect(sameOrigin(req({ origin: 'http://localhost:8080', 'sec-fetch-site': 'same-origin' }), local)).toBe(true);
  });
  test('refuses cross-site and other origins', () => {
    expect(sameOrigin(req({ origin: 'https://evil.example' }), local)).toBe(false);
    expect(sameOrigin(req({ origin: 'null' }), local)).toBe(false);
    expect(sameOrigin(req({ 'sec-fetch-site': 'cross-site' }), local)).toBe(false);
    expect(sameOrigin(req({ 'sec-fetch-site': 'same-site', origin: 'http://localhost:8080' }), local)).toBe(false);
  });
  test('no Origin at all (curl) passes this check; the token check still applies', () => {
    expect(sameOrigin(req({}), local)).toBe(true);
  });
  test('the public URL is an accepted origin', () => {
    const r = new Request('http://k.example.com/x', { method: 'POST', headers: { host: 'k.example.com', origin: 'https://k.example.com' } });
    expect(sameOrigin(r, pub)).toBe(true);
  });
});

describe('form parsing', () => {
  test('parseCookies keeps the first value', () => {
    expect(parseCookies('a=1; b=2; a=3')).toEqual({ a: '1', b: '2' });
    expect(parseCookies(null)).toEqual({});
  });
  test('parsePort', () => {
    expect(parsePort('8081:80')).toEqual({ hostIp: undefined, host: 8081, container: 80, protocol: 'tcp' });
    expect(parsePort('0.0.0.0:53:53/udp')).toEqual({ hostIp: '0.0.0.0', host: 53, container: 53, protocol: 'udp' });
    expect(parsePort('[::1]:8080:80')).toEqual({ hostIp: '::1', host: 8080, container: 80, protocol: 'tcp' });
    for (const bad of ['80', 'a:b', '1:2:3:4', '80:80/sctp', '80:80; rm']) expect(() => parsePort(bad)).toThrow();
  });
  test('parseVolume', () => {
    expect(parseVolume('data:/var/lib/x')).toEqual({ source: 'data', target: '/var/lib/x', readOnly: false });
    expect(parseVolume('/srv:/srv:ro')).toEqual({ source: '/srv', target: '/srv', readOnly: true });
    expect(() => parseVolume('nocolon')).toThrow();
  });
  test('splitArgs quotes like a shell but expands nothing', () => {
    expect(splitArgs('sh -c "echo hi; sleep 100"')).toEqual(['sh', '-c', 'echo hi; sleep 100']);
    expect(splitArgs(`echo 'a  b' "c \\"d\\"" e\\ f`)).toEqual(['echo', 'a  b', 'c "d"', 'e f']);
    expect(splitArgs('echo $HOME `id` "$(id)"')).toEqual(['echo', '$HOME', '`id`', '$(id)']);
    expect(splitArgs(`a "" ''`)).toEqual(['a', '', '']);
    expect(splitArgs('  nginx   -g  "daemon off;"  ')).toEqual(['nginx', '-g', 'daemon off;']);
    expect(splitArgs(`ab"c d"'e'`)).toEqual(['abc de']);
    for (const bad of [`echo 'x`, 'echo "x', 'echo x\\']) expect(() => splitArgs(bad)).toThrow();
  });
  test('containerSpec', () => {
    const s = containerSpec({ image: ' nginx ', name: '', cmd: 'sh -c  true', env: 'A=1\r\n\nB=2', ports: '8081:80', volumes: '', restart: 'always' });
    expect(s).toEqual({ image: 'nginx', name: undefined, cmd: ['sh', '-c', 'true'], env: ['A=1', 'B=2'], ports: [{ hostIp: undefined, host: 8081, container: 80, protocol: 'tcp' }], volumes: [], restart: 'always' });
  });
});

describe('pages', () => {
  const ctx = { user: 'admin', csrf: 'tok', proxyEnabled: true };
  const row = (State: string) => ({ Id: 'a'.repeat(64), Names: ['/web'], Image: 'nginx', State, Status: '', Ports: [] });
  const buttons = (htmlText: string) => [...htmlText.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(m => m[1]).filter(b => b !== 'Log out');

  test('container actions follow the state; Remove only when stopped', () => {
    expect(buttons(containersPage(ctx, [row('running')]))).toEqual(['Stop', 'Restart']);
    expect(buttons(containersPage(ctx, [row('paused')]))).toEqual(['Unpause']);
    expect(buttons(containersPage(ctx, [row('restarting')]))).toEqual(['Stop']);
    for (const s of ['exited', 'created', 'dead']) expect(buttons(containersPage(ctx, [row(s)]))).toEqual(['Start', 'Remove']);
  });

  test("kontainers' own container and its compose siblings get no actions", () => {
    const me = { id: 'f'.repeat(64), project: 'kontainers' };
    const own = { ...row('running'), Id: me.id, Labels: { 'com.docker.compose.project': 'kontainers' } };
    const sib = { ...row('running'), Id: 'e'.repeat(64), Names: ['/kontainers-docker-proxy-1'], Labels: { 'com.docker.compose.project': 'kontainers' } };
    const other = { ...row('running'), Id: 'd'.repeat(64), Names: ['/other'], Labels: { 'com.docker.compose.project': 'shop' } };
    expect(isSelf(own, me)).toBe(true);
    expect(isSelf(sib, me)).toBe(true);
    expect(isSelf(other, me)).toBe(false);
    expect(isSelf(other, { id: me.id, project: null })).toBe(false);
    expect(isSelf(own, null)).toBe(false);
    const page = containersPage(ctx, [own, sib, other], me);
    expect(buttons(page)).toEqual(['Stop', 'Restart']); // only "other"
    expect(page).toContain('this is kontainers');
    expect(page).toContain('part of kontainers');
    const detail = containerPage(ctx, { Id: me.id, Name: '/kontainers', State: { Status: 'running' }, Config: { Labels: { 'kontainers.managed': 'true' } }, HostConfig: {} }, me);
    expect(buttons(detail)).toEqual([]);
  });

  test('detail page actions return to the detail page, except remove', () => {
    const page = containerPage(ctx, { Id: 'b'.repeat(64), Name: '/web', State: { Status: 'exited', StartedAt: '0001-01-01T00:00:00Z', ExitCode: 42 }, Config: {}, HostConfig: {} });
    expect(page).toContain('<dd>never</dd>');
    expect(page).toContain('<dt>Exit code</dt><dd>42</dd>');
    expect(page).toMatch(/action="\/containers\/b+\/start"[^>]*>.*name="back" value="detail"/s);
    expect(page).not.toMatch(/\/remove"[^>]*>(?:(?!<\/form>).)*name="back"/s);
  });

  test('ports published on all interfaces are listed once', () => {
    expect(formatPorts([
      { IP: '0.0.0.0', PublicPort: 9001, PrivatePort: 81, Type: 'udp' }, { IP: '::', PublicPort: 9001, PrivatePort: 81, Type: 'udp' },
      { IP: '127.0.0.1', PublicPort: 8080, PrivatePort: 80, Type: 'tcp' }, { IP: '::1', PublicPort: 9100, PrivatePort: 80, Type: 'tcp' },
      { PrivatePort: 5432, Type: 'tcp' },
    ])).toBe('*:9001->81/udp, 127.0.0.1:8080->80/tcp, [::1]:9100->80/tcp');
  });

  test('each tag of a multi-tag image has its own Remove', () => {
    const page = imagesPage(ctx, [{ Id: 'sha256:' + 'c'.repeat(64), RepoTags: ['alpine:3.20', 'me/tool:1.0'], Size: 1e7, Created: 0 }]);
    expect([...page.matchAll(/name="ref" value="([^"]+)"/g)].map(m => m[1])).toEqual(['alpine:3.20', 'me/tool:1.0']);
    expect(page).toContain('Remove the tag me/tool:1.0?');
  });

  test('images page lists pulls still running and failed ones', () => {
    const page = imagesPage(ctx, [], [{ ref: 'postgres:17', state: 'pulling' }, { ref: 'x:1', state: 'failed', error: 'denied' }]);
    expect(page).toContain('postgres:17: pulling');
    expect(page).toContain('failed: denied');
  });

  test('proxy page reports targets and certificates', () => {
    const r = (o: Partial<Rule>): Rule => ({ id: 1, hostname: 'a.test', path: '/', target_container: 'web', target_port: 80, tls: true, enabled: true, created_at: 0, ...o });
    const page = proxyPage(ctx, [r({ id: 1 }), r({ id: 2, hostname: 'b.test', target_container: 'gone', tls: false }), r({ id: 3, hostname: 'c.test', target_container: 'db' })], { running: true, lastError: null },
      rule => rule.id === 1 ? { target: 'running', cert: { notAfter: new Date('2099-01-02') } }
        : rule.id === 2 ? { target: 'missing', cert: null } : { target: 'exited', cert: null });
    expect(page).toContain('certificate valid until 2099-01-02');
    expect(page).toContain('no container named gone');
    expect(page).toContain('target is exited');
    expect(page).toContain('no certificate yet');
    expect(page).toContain('sent to the container unchanged');
  });

  test('failed login and setup keep what was typed, never the password', () => {
    expect(loginPage({ username: 'adm"in', error: 'x' })).toContain('value="adm&quot;in"');
    const s = setupPage({ token: 'tok123', username: 'admin' });
    expect(s).toContain('value="tok123"');
    expect(s).toContain('value="admin"');
    expect(s).not.toMatch(/type="password"[^>]*value=/);
  });
});

describe('views', () => {
  test('esc covers the HTML metacharacters', () => {
    expect(esc(`<script>"'&`)).toBe('&lt;script&gt;&quot;&#39;&amp;');
  });
  test('html escapes interpolations, including arrays, unless marked raw', () => {
    expect(html`<p>${'<b>'}</p>`.__html).toBe('<p>&lt;b&gt;</p>');
    expect(html`<p>${['<i>', raw('<b>')]}</p>`.__html).toBe('<p>&lt;i&gt;<b></p>');
    expect(html`<p>${null}${undefined}</p>`.__html).toBe('<p></p>');
  });
});

describe('demux', () => {
  test('strips Docker stream headers', () => {
    const frame = (stream: number, s: string) => { const b = new TextEncoder().encode(s); const h = new Uint8Array(8); h[0] = stream; new DataView(h.buffer).setUint32(4, b.length); return [...h, ...b]; };
    expect(demux(new Uint8Array([...frame(1, 'out\n'), ...frame(2, 'err\n')]))).toBe('out\nerr\n');
  });
  test('passes TTY output through', () => {
    expect(demux(new TextEncoder().encode('plain text'))).toBe('plain text');
  });
  test('survives a truncated frame', () => {
    const b = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 10, 65, 66]);
    expect(demux(b)).toBe('AB');
  });
});
