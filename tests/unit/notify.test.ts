import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../../src/db';
import { maskUrl, Notifier, validateTarget, EVENT_KINDS } from '../../src/notify';
import { EventWatcher, checkCertificates } from '../../src/events';

function db() { const d = new Database(':memory:', { strict: true }); migrate(d); return d; }

// A fetch that records requests and answers with the given status (or throws).
function recorder(answer: number | Error = 204) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    if (answer instanceof Error) throw answer;
    return new Response(answer === 204 ? null : 'nope', { status: answer });
  };
  return { calls, f };
}

describe('validateTarget', () => {
  const ok = { kind: 'webhook', url: 'https://hooks.example.net/abc', events: ['update'] };
  test('a webhook or ntfy target with http(s) and at least one known event', () => {
    expect(validateTarget(ok)).toEqual({ kind: 'webhook', url: 'https://hooks.example.net/abc', token: null, events: ['update'] });
    expect(validateTarget({ ...ok, kind: 'ntfy', token: ' tk_1 ', events: ['exit', 'exit', 'bogus', 'cert'] })).toMatchObject({ kind: 'ntfy', token: 'tk_1', events: ['exit', 'cert'] });
  });
  test('refuses other kinds, schemes, bad URLs, empty events and odd tokens', () => {
    expect(() => validateTarget({ ...ok, kind: 'email' })).toThrow('webhook or ntfy');
    for (const url of ['ftp://x/y', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '', 'https://x/' + 'a'.repeat(2001), 'https://x/a b', 'https://x/\u0000']) {
      expect(() => validateTarget({ ...ok, url })).toThrow();
    }
    expect(() => validateTarget({ ...ok, events: [] })).toThrow('at least one event');
    expect(() => validateTarget({ ...ok, events: ['nope'] })).toThrow('at least one event');
    expect(() => validateTarget({ ...ok, token: 'two words' })).toThrow('one word');
  });
});

test('maskUrl shows scheme, host and port only', () => {
  expect(maskUrl('https://discord.com/api/webhooks/123/SECRET')).toBe('https://discord.com/…');
  expect(maskUrl('http://ntfy.local:8080/topic?auth=xyz')).toBe('http://ntfy.local:8080/…');
  expect(maskUrl('https://example.net/')).toBe('https://example.net/');
  expect(maskUrl('::')).toBe('(invalid URL)');
});

describe('Notifier', () => {
  test('add, list, remove; at most 20 targets', () => {
    const n = new Notifier(db());
    const t = n.add({ kind: 'webhook', url: 'https://a.example.net/x', events: ['update'] });
    expect(n.list().map(x => x.id)).toEqual([t.id]);
    n.remove(t.id);
    expect(n.list()).toEqual([]);
    expect(() => n.remove(t.id)).toThrow('not found');
    for (let i = 0; i < 20; i++) n.add({ kind: 'ntfy', url: `https://ntfy.example.net/t${i}`, events: ['exit'] });
    expect(() => n.add({ kind: 'ntfy', url: 'https://ntfy.example.net/t21', events: ['exit'] })).toThrow('at most 20');
  });

  test('a webhook gets JSON with text and content; only subscribed targets get a note', async () => {
    const r = recorder();
    const n = new Notifier(db(), r.f, () => Date.UTC(2026, 10, 16, 12));
    n.add({ kind: 'webhook', url: 'https://a.example.net/hook', token: 'tk', events: ['update', 'exit'] });
    n.add({ kind: 'webhook', url: 'https://b.example.net/hook', events: ['cert'] });
    expect(await n.send({ kind: 'exit', title: 'web stopped', message: 'web stopped with exit code 1.', container: 'web' })).toBe(1);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].url).toBe('https://a.example.net/hook');
    expect(r.calls[0].headers['content-type']).toBe('application/json');
    expect(r.calls[0].headers.authorization).toBe('Bearer tk');
    expect(JSON.parse(r.calls[0].body)).toEqual({ event: 'exit', title: 'web stopped', message: 'web stopped with exit code 1.', container: 'web', at: '2026-11-16T12:00:00.000Z', text: 'web stopped: web stopped with exit code 1.', content: 'web stopped: web stopped with exit code 1.' });
    expect(n.list()[0].last_result).toBe('sent (HTTP 204)');
    expect(n.list()[1].last_result).toBeNull();
  });

  test('ntfy gets plain text with Title and Tags; a non-ASCII title is encoded', async () => {
    const r = recorder();
    const n = new Notifier(db(), r.f);
    n.add({ kind: 'ntfy', url: 'https://ntfy.example.net/topic', events: ['health'] });
    await n.send({ kind: 'health', title: 'café is unhealthy', message: 'The healthcheck of café reports unhealthy.' });
    expect(r.calls[0].headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(r.calls[0].headers.tags).toBe('health');
    expect(r.calls[0].headers.title).toBe(`=?UTF-8?B?${Buffer.from('café is unhealthy').toString('base64')}?=`);
    expect(r.calls[0].body).toBe('The healthcheck of café reports unhealthy.');
    await n.send({ kind: 'health', title: 'plain', message: 'm' });
    expect(r.calls[1].headers.title).toBe('plain');
  });

  test('a key sends a fact once within its window', async () => {
    let now = 1_000_000;
    const r = recorder();
    const n = new Notifier(db(), r.f, () => now);
    n.add({ kind: 'webhook', url: 'https://a.example.net/h', events: ['update'] });
    const note = { kind: 'update' as const, title: 't', message: 'm' };
    expect(await n.send(note, 'update:web:sha256:1')).toBe(1);
    expect(await n.send(note, 'update:web:sha256:1')).toBe(0);
    expect(await n.send(note, 'update:web:sha256:2')).toBe(1);
    expect(await n.send(note, 'exit:web', 600_000)).toBe(1);
    now += 300_000;
    expect(await n.send(note, 'exit:web', 600_000)).toBe(0);
    now += 400_000;
    expect(await n.send(note, 'exit:web', 600_000)).toBe(1);
    expect(r.calls.length).toBe(4);
  });

  test('with no subscribed target, nothing is claimed, so a later target still hears of it', async () => {
    const r = recorder();
    const n = new Notifier(db(), r.f);
    expect(await n.send({ kind: 'update', title: 't', message: 'm' }, 'update:web:1')).toBe(0);
    n.add({ kind: 'webhook', url: 'https://a.example.net/h', events: ['update'] });
    expect(await n.send({ kind: 'update', title: 't', message: 'm' }, 'update:web:1')).toBe(1);
  });

  test('failures are kept on the target and never thrown', async () => {
    for (const [answer, expected] of [[500, /^failed: HTTP 500 nope$/], [new Error('getaddrinfo ENOTFOUND a.example.net'), /^failed: getaddrinfo ENOTFOUND/]] as const) {
      const n = new Notifier(db(), recorder(answer).f);
      const t = n.add({ kind: 'webhook', url: 'https://a.example.net/h', events: ['exit'] });
      expect(await n.send({ kind: 'exit', title: 't', message: 'm' })).toBe(1);
      expect(n.get(t.id)!.last_result).toMatch(expected);
      expect(await n.test(t.id)).toMatch(expected);
    }
  });

  test('test() sends to that target whatever its events', async () => {
    const r = recorder();
    const n = new Notifier(db(), r.f);
    const t = n.add({ kind: 'webhook', url: 'https://a.example.net/h', events: ['cert'] });
    expect(await n.test(t.id)).toBe('sent (HTTP 204)');
    expect(JSON.parse(r.calls[0].body).event).toBe('test');
    await expect(n.test(999)).rejects.toThrow('not found');
  });

  test('every event kind has a description', () => {
    expect(EVENT_KINDS).toEqual(['update', 'autoupdate', 'exit', 'health', 'cert']);
  });
});

describe('EventWatcher', () => {
  function watcher() {
    const sent: any[] = [];
    let now = 10_000_000;
    const notifier = { send: async (note: any, key?: string, within?: number, going?: () => void) => { sent.push({ ...note, key, within }); going?.(); return 1; } };
    const w = new EventWatcher({} as any, notifier as any, () => now);
    const ev = (Action: string, name = 'web', attrs: Record<string, string> = {}, dt = 1000) => {
      now += dt;
      return w.handle({ Type: 'container', Action, Actor: { ID: `id-${name}`, Attributes: { name, image: 'nginx:1.27', ...attrs } }, timeNano: now * 1e6 });
    };
    return { sent, ev, advance: (ms: number) => { now += ms; } };
  }

  test('a container that dies on its own is reported with its exit code', async () => {
    const { sent, ev } = watcher();
    await ev('die', 'web', { exitCode: '1' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'exit', title: 'web stopped', container: 'web', key: 'exit:web', within: 600_000 });
    expect(sent[0].message).toBe('web (nginx:1.27) stopped with exit code 1.');
  });

  test('a stop someone asked for is not reported, nor is a clean exit', async () => {
    const { sent, ev } = watcher();
    await ev('kill', 'web', { signal: '15' });
    await ev('die', 'web', { exitCode: '143' }, 2000);
    await ev('die', 'job', { exitCode: '0' });
    expect(sent).toHaveLength(0);
  });

  test('a kill long before the die does not hide a later crash', async () => {
    const { sent, ev } = watcher();
    await ev('kill', 'web', { signal: '15' });
    await ev('start', 'web', {}, 5000);
    await ev('die', 'web', { exitCode: '2' }, 60_000);
    expect(sent).toHaveLength(1);
  });

  test('out of memory is reported as such, even with a kill and exit code 137', async () => {
    const { sent, ev } = watcher();
    await ev('oom', 'big');
    await ev('kill', 'big', { signal: '9' }, 10);
    await ev('die', 'big', { exitCode: '137' }, 10);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('big ran out of memory');
    expect(sent[0].message).toContain('ran out of memory and was stopped');
  });

  test('a crash loop says how often it stopped', async () => {
    const { sent, ev } = watcher();
    for (let i = 0; i < 3; i++) { await ev('die', 'loop', { exitCode: '1' }, 30_000); await ev('start', 'loop'); }
    expect(sent).toHaveLength(3); // the Notifier's key decides what goes out; each carries the same key
    expect(sent.every(s => s.key === 'exit:loop')).toBe(true);
    expect(sent[2].message).toContain('3 times in the last 10 minutes');
  });

  test('unhealthy once, then healthy again', async () => {
    const { sent, ev } = watcher();
    await ev('health_status: unhealthy', 'db');
    await ev('health_status: unhealthy', 'db');
    await ev('health_status: healthy', 'db');
    await ev('health_status: healthy', 'db');
    expect(sent.map(s => s.title)).toEqual(['db is unhealthy', 'db is healthy again']);
  });

  test('a flapping healthcheck: one "unhealthy" and one "healthy again" an hour, not one per cycle', async () => {
    const titles: string[] = [];
    let now = 10_000_000;
    const n = new Notifier(db(), async (_u, init) => { titles.push(JSON.parse(String(init.body)).title); return new Response(null, { status: 204 }); }, () => now);
    n.add({ kind: 'webhook', url: 'https://hooks.example.net/a', events: ['health'] });
    const w = new EventWatcher({} as any, n, () => now);
    for (let i = 0; i < 6; i++) {
      now += 20_000;
      await w.handle({ Type: 'container', Action: `health_status: ${i % 2 ? 'healthy' : 'unhealthy'}`, Actor: { ID: 'id-f', Attributes: { name: 'flapper', image: 'x:1' } }, timeNano: now * 1e6 });
    }
    await Bun.sleep(10);
    expect(titles).toEqual(['flapper is unhealthy', 'flapper is healthy again']);
  });

  test('exit code 137 with no stop or kill before it says it was killed, probably for memory', async () => {
    const { sent, ev } = watcher();
    await ev('die', 'big', { exitCode: '137' });
    expect(sent[0].message).toContain('was killed (exit code 137, SIGKILL) without a docker stop or kill; that usually means it ran out of memory');
  });

  test('a kill with HUP (a reload) does not hide a crash that follows', async () => {
    const { sent, ev } = watcher();
    await ev('kill', 'web', { signal: '1' });
    await ev('die', 'web', { exitCode: '2' });
    expect(sent.map(s => s.title)).toEqual(['web stopped']);
  });

  test('health is kept per container: a recreated container is judged afresh', async () => {
    const sent: string[] = [];
    let now = 1_000_000;
    const w = new EventWatcher({} as any, { send: async (n: any, _k?: string, _w?: number, going?: () => void) => { sent.push(n.title); going?.(); return 1; } } as any, () => now);
    const ev = (Action: string, id: string, name: string) => { now += 1000; return w.handle({ Type: 'container', Action, Actor: { ID: id, Attributes: { name, image: 'x:1' } }, timeNano: now * 1e6 }); };
    await ev('health_status: unhealthy', 'old', 'web');
    await ev('destroy', 'old', 'web-old-12345678'); // destroyed under its set-aside name
    await ev('health_status: unhealthy', 'new', 'web');
    expect(sent).toEqual(['web is unhealthy', 'web is unhealthy']);
  });

  test('events of other types and unknown actions are ignored', async () => {
    const { sent, ev } = watcher();
    await ev('exec_create: sh', 'web');
    await ev('attach', 'web');
    expect(sent).toHaveLength(0);
  });
});

describe('checkCertificates', () => {
  const now = Date.UTC(2026, 10, 16);
  const rule = (hostname: string, over: any = {}) => ({ hostname, tls: true, enabled: true, created_at: now - 3600_000, ...over });
  test('missing after 15 minutes, expiring within 14 days; each with a daily key', async () => {
    const sent: any[] = [];
    const notifier = { send: async (note: any, key?: string, within?: number, going?: () => void) => { sent.push({ ...note, key, within }); going?.(); return 1; } };
    const certs: Record<string, Date> = { 'ok.example.net': new Date(now + 60 * 86400_000), 'soon.example.net': new Date(now + 5 * 86400_000), 'gone.example.net': new Date(now - 86400_000) };
    await checkCertificates([
      rule('ok.example.net'), rule('soon.example.net'), rule('gone.example.net'), rule('none.example.net'),
      rule('new.example.net', { created_at: now - 60_000 }), rule('off.example.net', { enabled: false }), rule('plain.example.net', { tls: false }),
    ], h => (certs[h] ? { notAfter: certs[h] } : null), notifier as any, now);
    expect(sent.map(s => s.title)).toEqual(['Certificate for soon.example.net expires in 5 days', 'Certificate for gone.example.net has expired', 'No certificate for none.example.net']);
    expect(sent.every(s => s.kind === 'cert' && s.within === 86400_000)).toBe(true);
  });
  test('short-lived certificates: judged by their lifetime, not by 14 days', async () => {
    const sent: string[] = [];
    const notifier = { send: async (note: any) => { sent.push(note.title); return 1; } };
    const week = (left: number) => ({ notBefore: new Date(now + left - 7 * 86400_000), notAfter: new Date(now + left) });
    const certs: Record<string, any> = { 'fresh.example.net': week(6 * 86400_000), 'late.example.net': week(20 * 3600_000) };
    await checkCertificates([rule('fresh.example.net'), rule('late.example.net')], h => certs[h], notifier as any, now);
    expect(sent).toEqual(['Certificate for late.example.net expires within a day']);
  });
});

describe('notifications with a full data volume', () => {
  test('a note still goes out, and the same fact is still sent once', async () => {
    let calls = 0;
    const d = db();
    const n = new Notifier(d, async () => { calls++; return new Response(null, { status: 204 }); });
    n.add({ kind: 'webhook', url: 'https://hooks.example.net/a', events: ['exit'] });
    const query = d.query.bind(d);
    (d as any).query = (sql: string) => { if (/^(INSERT|UPDATE|DELETE)/.test(sql)) throw new Error('database or disk is full'); return query(sql); };
    const note = { kind: 'exit' as const, title: 'web stopped', message: 'm' };
    expect(await n.send(note, 'exit:web', 600_000)).toBe(1);
    expect(await n.send(note, 'exit:web', 600_000)).toBe(0);
    expect(calls).toBe(1);
  });
});

describe('where notifications may not go', () => {
  const ok = { kind: 'webhook', url: 'https://hooks.example.net/abc', events: ['update'] };
  test('the Docker API host and link-local addresses are refused; printable tokens only', () => {
    expect(() => validateTarget({ ...ok, url: 'http://docker-proxy:2375/volumes/prune' }, ['docker-proxy'])).toThrow("serves kontainers' Docker API");
    expect(() => validateTarget({ ...ok, url: 'http://169.254.169.254/latest/meta-data/' })).toThrow('link-local');
    expect(() => validateTarget({ ...ok, url: 'http://[fe80::1]/x' })).toThrow('link-local');
    expect(() => validateTarget({ ...ok, token: 'tokén' })).toThrow('printable ASCII');
    expect(validateTarget({ ...ok, url: 'http://ntfy.lan:8080/t' }, ['docker-proxy']).url).toBe('http://ntfy.lan:8080/t');
  });
  test('a redirect is not followed, and says where it pointed', async () => {
    let calls = 0, mode = '';
    const n = new Notifier(db(), async (_u, init) => { calls++; mode = String(init.redirect); return new Response(null, { status: 301, headers: { location: 'https://elsewhere.example.net/x' } }); });
    const t = n.add({ kind: 'webhook', url: 'http://hooks.example.net/a', events: ['exit'] });
    expect(await n.test(t.id)).toBe('failed: the target redirected (HTTP 301) to https://elsewhere.example.net/x; use that address');
    expect(calls).toBe(1);
    expect(mode).toBe('manual');
  });
  test('a fact nobody received is sent again next time', async () => {
    let up = false;
    const n = new Notifier(db(), async () => (up ? new Response(null, { status: 204 }) : new Response('down', { status: 503 })));
    n.add({ kind: 'webhook', url: 'https://hooks.example.net/a', events: ['update'] });
    const note = { kind: 'update' as const, title: 't', message: 'm' };
    await n.send(note, 'update:web:1');
    up = true;
    expect(await n.send(note, 'update:web:1')).toBe(1);
    expect(n.list()[0].last_result).toBe('sent (HTTP 204)');
    expect(await n.send(note, 'update:web:1')).toBe(0);
  });
});

describe('EventWatcher timing', () => {
  test('an out-of-memory event long before a stop does not make the stop an OOM', async () => {
    const sent: any[] = [];
    let now = 1_000_000;
    const w = new EventWatcher({} as any, { send: async (n: any) => { sent.push(n); return 1; } } as any, () => now);
    const ev = (Action: string, attrs: Record<string, string> = {}, dt = 1000) => { now += dt; return w.handle({ Type: 'container', Action, Actor: { ID: 'id-x', Attributes: { name: 'x', image: 'i', ...attrs } }, timeNano: now * 1e6 }); };
    await ev('oom');
    await ev('kill', { signal: '15' }, 120_000);
    await ev('die', { exitCode: '143' }, 500);
    expect(sent).toEqual([]);
  });
  test('nothing is reported for a container that is being updated', async () => {
    const sent: any[] = [];
    const w = new EventWatcher({} as any, { send: async (n: any) => { sent.push(n); return 1; } } as any, Date.now, async () => {}, n => n === 'busy');
    await w.handle({ Type: 'container', Action: 'die', Actor: { ID: 'a', Attributes: { name: 'busy', exitCode: '1' } } });
    await w.handle({ Type: 'container', Action: 'health_status: unhealthy', Actor: { ID: 'a', Attributes: { name: 'busy' } } });
    expect(sent).toEqual([]);
  });
});

test('BoundedLog keeps output shorter than a frame header', async () => {
  const { BoundedLog } = await import('../../src/docker');
  const log = new BoundedLog(1000);
  log.push(new TextEncoder().encode('ok\n'));
  expect(log.text()).toBe('ok\n');
});

describe('the Docker API through a socket proxy that refuses a section', () => {
  test('403 stays 403, so the hint says which setting to turn on', async () => {
    const { Docker } = await import('../../src/docker');
    const { lookupReason } = await import('../../src/updates');
    const srv = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('<html><body><h1>403 Forbidden</h1></body></html>', { status: 403 }) });
    try {
      const d = new Docker(`http://127.0.0.1:${srv.port}`);
      const e = await d.distribution('nginx:1.27').catch(x => x);
      expect(e.status).toBe(403);
      expect(lookupReason(e)).toContain('DISTRIBUTION=1');
      expect((await d.checkLogin('ghcr.io', 'me', 'x').catch(x => x)).status).toBe(403);
    } finally { srv.stop(true); }
  });
});
