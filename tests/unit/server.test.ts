import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../../src/config';
import { clientIp, containerSpec, dockerApiHost, splitArgs, hostAllowed, normalizeIp, parseCookies, parsePort, parseVolume, sameOrigin } from '../../src/server';
import { BoundedLog, demux } from '../../src/docker';
import { esc, html, raw, formatPorts, isSelf, containersPage, containerPage, editContainerPage, imagesPage, proxyPage, loginPage, quoteArgs, setupPage } from '../../src/views';
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
    for (const h of ['evil.example:8080', 'rebind.attacker.test', '', 'a b', 'cafe', 'dead:8080', 'deadbeef', 'face:b00c']) expect(hostAllowed(h, local)).toBe(false);
    expect(hostAllowed('[fd00::1]:8080', local)).toBe(true);
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
  const buttons = (htmlText: string) => [...htmlText.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(m => m[1]).filter(b => b !== 'Log out' && b !== 'Apply');

  test('container actions follow the state; Remove only when stopped', () => {
    expect(buttons(containersPage(ctx, [row('running')]))).toEqual(['Stop', 'Restart']);
    expect(buttons(containersPage(ctx, [row('paused')]))).toEqual(['Unpause']);
    expect(buttons(containersPage(ctx, [row('restarting')]))).toEqual(['Stop']);
    for (const s of ['exited', 'created', 'dead']) expect(buttons(containersPage(ctx, [row(s)]))).toEqual(['Start', 'Remove']);
  });

  test("kontainers' own container and the one serving its Docker API get no actions; other siblings do", () => {
    const me = { id: 'f'.repeat(64), project: 'kontainers', apiId: 'e'.repeat(64) };
    const own = { ...row('running'), Id: me.id, Labels: { 'com.docker.compose.project': 'kontainers' } };
    const sib = { ...row('running'), Id: 'e'.repeat(64), Names: ['/kontainers-docker-proxy-1'], Labels: { 'com.docker.compose.project': 'kontainers' } };
    const other = { ...row('running'), Id: 'd'.repeat(64), Names: ['/other'], Labels: { 'com.docker.compose.project': 'shop' } };
    expect(isSelf(own, me)).toBe(true);
    expect(isSelf(sib, me)).toBe(true);
    expect(isSelf(other, me)).toBe(false);
    expect(isSelf(own, null)).toBe(false);
    const app = { ...row('running'), Id: 'c'.repeat(64), Names: ['/kontainers-app-1'], Labels: { 'com.docker.compose.project': 'kontainers' } };
    expect(isSelf(app, me)).toBe(false); // same compose project, but neither kontainers nor its API
    const page = containersPage(ctx, [own, sib, other, app], me);
    expect(buttons(page)).toEqual(['Stop', 'Restart', 'Stop', 'Restart']); // "app" and "other"
    expect(page).toContain('this is kontainers');
    expect(page).toContain('kontainers&#39; Docker API: manage it on the host');
    const detail = containerPage(ctx, { Id: me.id, Name: '/kontainers', State: { Status: 'running' }, Config: { Labels: { 'kontainers.managed': 'true' } }, HostConfig: {} }, me);
    expect(buttons(detail)).toEqual([]);
  });

  test('detail page actions return to the detail page, except remove', () => {
    const page = containerPage(ctx, { Id: 'b'.repeat(64), Name: '/web', State: { Status: 'exited', StartedAt: '0001-01-01T00:00:00Z', ExitCode: 42 }, Config: {}, HostConfig: {} });
    expect(page).toContain('<dd>never</dd>');
    expect(page).toContain('<dt>Exit code</dt><dd>42</dd>');
    expect(page).toMatch(/action="\/containers\/web\/start"[^>]*>.*name="back" value="detail"/s); // by name: it survives a recreation
    expect(page).not.toMatch(/\/remove"[^>]*>(?:(?!<\/form>).)*name="back"/s);
  });

  test('ports published on all interfaces are listed once', () => {
    expect(formatPorts([
      { IP: '0.0.0.0', PublicPort: 9001, PrivatePort: 81, Type: 'udp' }, { IP: '::', PublicPort: 9001, PrivatePort: 81, Type: 'udp' },
      { IP: '127.0.0.1', PublicPort: 8080, PrivatePort: 80, Type: 'tcp' }, { IP: '::1', PublicPort: 9100, PrivatePort: 80, Type: 'tcp' },
      { PrivatePort: 5432, Type: 'tcp' },
    ])).toBe('127.0.0.1:8080->80/tcp, *:9001->81/udp, [::1]:9100->80/tcp'); // by host port
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

describe('dockerApiHost', () => {
  test('the host name of a tcp or http DOCKER_HOST', () => {
    expect(dockerApiHost('tcp://docker-proxy:2375')).toBe('docker-proxy');
    expect(dockerApiHost('http://10.0.0.5:2375/')).toBe('10.0.0.5');
    expect(dockerApiHost('tcp://[fd00::5]:2375')).toBe('fd00::5');
    expect(dockerApiHost('unix:///var/run/docker.sock')).toBeNull();
  });
});

describe('container page', () => {
  test('environment values are hidden, including every line of a multi-line value', () => {
    const c = { Id: 'c'.repeat(64), Name: '/app', State: { Status: 'exited' }, Config: { Image: 'app:1', Env: ['KEY=-----BEGIN KEY-----\nsecret-line-two\nsecret-line-three', 'MODE=prod'], Labels: {} }, HostConfig: {} };
    const page = containerPage({ user: 'admin', csrf: 't' }, c);
    expect(page).toContain('KEY=…');
    expect(page).toContain('MODE=…');
    expect(page).not.toContain('secret-line');
  });
});

describe('quoteArgs', () => {
  test('splitArgs reads back what quoteArgs writes', () => {
    const cases = [['sleep', '600'], ['sh', '-c', "echo it's up; sleep 600"], ['a b', '', '"q"', '$HOME', 'back\\slash', 'new\nline', 'tab\there'], ['--flag=x/y:z@1%2+3,4']];
    for (const args of cases) expect(splitArgs(quoteArgs(args))).toEqual(args);
    expect(quoteArgs(['sleep', '600'])).toBe('sleep 600');
    expect(quoteArgs(["it's"])).toBe(`'it'\\''s'`);
  });
});

describe('editContainerPage', () => {
  test('fills the form from the settings and escapes them', () => {
    const page = editContainerPage({ user: 'admin', csrf: 't' }, { Id: 'e'.repeat(64), Name: '/web' }, {
      image: 'nginx:1.27', cmd: ['sh', '-c', 'echo <b>'], env: ['A=1', 'X=</textarea><script>'],
      ports: [{ host: 8080, container: 80, hostIp: '127.0.0.1' }, { host: 53, container: 53, hostIp: '::1', protocol: 'udp' }, { host: 9000, container: 9000, hostIp: '0.0.0.0' }],
      volumes: [{ source: 'data', target: '/data' }, { source: 'conf', target: '/etc/app', readOnly: true }], restart: 'always',
    }, false);
    expect(page).toContain('value="sh -c &#39;echo &lt;b&gt;&#39;"');
    expect(page).toContain('127.0.0.1:8080:80\n[::1]:53:53/udp\n0.0.0.0:9000:9000</textarea>');
    expect(page).toContain('A=1\nX=&lt;/textarea&gt;&lt;script&gt;</textarea>');
    expect(page).toContain('data:/data\nconf:/etc/app:ro</textarea>');
    expect(page).toContain('<option selected>always</option>');
    expect(page).toContain('except ones the container already has');
    expect(page).not.toContain('<script>');
  });
});

describe('BoundedLog', () => {
  const frame = (stream: number, text: string) => {
    const p = new TextEncoder().encode(text);
    const h = new Uint8Array(8); h[0] = stream; new DataView(h.buffer).setUint32(4, p.length);
    const out = new Uint8Array(8 + p.length); out.set(h); out.set(p, 8); return out;
  };
  const feed = (log: BoundedLog, data: Uint8Array, step: number) => { for (let i = 0; i < data.length; i += step) log.push(data.subarray(i, i + step)); };
  test('framed output is read the same however the chunks fall', () => {
    const all = new Uint8Array([...frame(1, 'hello\n'), ...frame(2, 'oops\n'), ...frame(1, 'ünïcode\n')]);
    for (const step of [1, 3, 7, 8, 9, 1000]) {
      const log = new BoundedLog(1 << 20);
      feed(log, all, step);
      expect(log.text()).toBe('hello\noops\nünïcode\n');
    }
    expect(demux(all)).toBe('hello\noops\nünïcode\n');
  });
  test('TTY output (no frames) is kept as it is', () => {
    const log = new BoundedLog(1 << 20);
    feed(log, new TextEncoder().encode('\u001b[32mgreen\u001b[0m\r\nline\n'), 4);
    expect(log.text()).toBe('\u001b[32mgreen\u001b[0m\r\nline\n');
  });
  test('only the newest bytes are kept, from a whole line, and the cut is said', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${String(i).padStart(4, '0')}\n`).join('');
    const log = new BoundedLog(1000);
    feed(log, frame(1, lines), 64);
    const t = log.text();
    expect(t).toMatch(/^\[earlier output not shown: [\d.]+ MB more than kontainers shows at once\]\nline \d{4}\n/);
    expect(t.endsWith('line 0999\n')).toBe(true);
    expect(t.length).toBeLessThan(1100);
    expect(log.dropped).toBe(9000);
  });
  test('one huge line is cut to the limit', () => {
    const log = new BoundedLog(4096);
    feed(log, frame(1, 'x'.repeat(100000) + '\n'), 8192);
    expect(log.text().length).toBeLessThan(4200);
  });
});

describe('container page facts', () => {
  test('command, ports, restarts and why it is unhealthy', () => {
    const page = containerPage({ user: 'a', csrf: 't' }, {
      Id: 'd'.repeat(64), Name: '/db', RestartCount: 3, State: { Status: 'running', StartedAt: '2026-11-16T10:00:00Z', Health: { Status: 'unhealthy', FailingStreak: 4, Log: [{ ExitCode: 1, Output: 'pg_isready: no response\n' }] } },
      Config: { Image: 'postgres:17', Entrypoint: ['docker-entrypoint.sh'], Cmd: ['postgres', '-c', 'max_connections=200'], Labels: {} },
      HostConfig: { RestartPolicy: { Name: 'always' } },
      NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5433' }], '9187/tcp': null } },
    });
    expect(page).toContain('<code>docker-entrypoint.sh postgres -c max_connections=200</code>');
    expect(page).toContain('<span class="ref">127.0.0.1:5433-&gt;5432/tcp</span>');
    expect(page).toContain('restarted 3 times');
    expect(page).toContain('unhealthy<small class="muted">failed 4 checks in a row, exit code 1: <code>pg_isready: no response</code></small>');
  });
  test('environment lines keep trailing spaces', () => {
    expect(containerSpec({ image: 'x', env: '  A=1  \r\n\r\nB= \n' }).env).toEqual(['A=1  ', 'B= ']);
  });
});
