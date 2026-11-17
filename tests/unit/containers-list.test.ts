import { describe, expect, test } from 'bun:test';
import { containersPage, matchesFilter, needsAttention, parseFilter, DEFAULT_FILTER } from '../../src/views';

const ctx = { user: 'admin', csrf: 'tok' };
let n = 0;
const c = (name: string, state: string, status = '', project?: string, image = 'busybox:1.36') => ({
  Id: String(++n).padStart(64, '0'), Names: ['/' + name], Image: image, State: state, Status: status, Ports: [],
  Labels: project ? { 'com.docker.compose.project': project } : {},
});
// Row names in page order, and which of them are hidden.
const rows = (page: string) => [...page.matchAll(/<tr data-name="([^"]+)"[^>]*?( hidden)?>/g)].map(m => (m[2] ? `(${m[1]})` : m[1]));
const groups = (page: string) => [...page.matchAll(/<tr class="group" data-group="([^"]*)"( hidden)?>/g)].map(m => (m[2] ? `(${m[1]})` : m[1]));

describe('needsAttention', () => {
  test('crash loops, dead, unhealthy and error exits need attention', () => {
    expect(needsAttention(c('a', 'restarting', 'Restarting (1) 3 seconds ago'))).toBe(true);
    expect(needsAttention(c('a', 'dead', 'Dead'))).toBe(true);
    expect(needsAttention(c('a', 'running', 'Up 2 minutes (unhealthy)'))).toBe(true);
    expect(needsAttention(c('a', 'exited', 'Exited (1) 2 minutes ago'))).toBe(true);
    expect(needsAttention(c('a', 'exited', 'Exited (255) 1 hour ago'))).toBe(true);
  });
  test('normal stops and healthy containers do not', () => {
    for (const code of ['0', '130', '137', '143']) expect(needsAttention(c('a', 'exited', `Exited (${code}) 5 minutes ago`))).toBe(false);
    expect(needsAttention(c('a', 'running', 'Up 2 minutes (healthy)'))).toBe(false);
    expect(needsAttention(c('a', 'running', 'Up 2 minutes (health: starting)'))).toBe(false);
    expect(needsAttention(c('a', 'created', 'Created'))).toBe(false);
    expect(needsAttention(c('a', 'paused', 'Up 1 hour (Paused)'))).toBe(false);
    expect(needsAttention(c('a', 'exited', ''))).toBe(false);
  });
});

describe('parseFilter', () => {
  test('defaults, known values, and anything else falls back', () => {
    expect(parseFilter(new URLSearchParams(''))).toEqual(DEFAULT_FILTER);
    expect(parseFilter(new URLSearchParams('q=%20web%20&state=attention&group=none'))).toEqual({ q: 'web', state: 'attention', group: false });
    expect(parseFilter(new URLSearchParams('state=bogus&group=project')).state).toBe('all');
    expect(parseFilter(new URLSearchParams('q=' + 'x'.repeat(500))).q.length).toBe(100);
  });
});

describe('matchesFilter', () => {
  const web = c('shop-web-1', 'running', 'Up', 'shop', 'nginx:1.27');
  test('search matches name, image and project without case', () => {
    for (const q of ['WEB', 'nginx', 'Shop', '1.27']) expect(matchesFilter(web, { ...DEFAULT_FILTER, q })).toBe(true);
    expect(matchesFilter(web, { ...DEFAULT_FILTER, q: 'redis' })).toBe(false);
  });
  test('state filters', () => {
    const f = (state: any) => ({ ...DEFAULT_FILTER, state });
    expect(matchesFilter(web, f('running'))).toBe(true);
    expect(matchesFilter(web, f('stopped'))).toBe(false);
    expect(matchesFilter(c('x', 'restarting'), f('stopped'))).toBe(false);
    expect(matchesFilter(c('x', 'created'), f('stopped'))).toBe(true);
    expect(matchesFilter(c('x', 'exited', 'Exited (2) now'), f('attention'))).toBe(true);
  });
});

describe('containersPage list', () => {
  const list = [
    c('zeta', 'running', 'Up'),
    c('shop-web-1', 'running', 'Up', 'shop'),
    c('blog-app', 'exited', 'Exited (1) 1 minute ago', 'blog'),
    c('shop-db-1', 'exited', 'Exited (0) 1 minute ago', 'shop'),
    c('alpha', 'created', 'Created'),
  ];
  test('grouped by compose project, projects first and by name, then the rest', () => {
    const page = containersPage(ctx, list);
    expect(groups(page)).toEqual(['blog', 'shop', '']);
    expect(rows(page)).toEqual(['blog-app', 'shop-db-1', 'shop-web-1', 'alpha', 'zeta']);
    expect(page).toContain('compose project shop <small>1 of 2 running</small>');
    expect(page).toContain('not in a compose project <small>1 of 2 running</small>');
  });
  test('without grouping: sorted by name, project shown on the row', () => {
    const page = containersPage(ctx, list, null, null, { ...DEFAULT_FILTER, group: false });
    expect(groups(page)).toEqual([]);
    expect(rows(page)).toEqual(['alpha', 'blog-app', 'shop-db-1', 'shop-web-1', 'zeta']);
    expect(page).toContain('<small>compose project shop</small>');
  });
  test('filtered rows and empty groups are hidden, not left out', () => {
    const page = containersPage(ctx, list, null, null, { ...DEFAULT_FILTER, q: 'shop' });
    expect(rows(page)).toEqual(['(blog-app)', 'shop-db-1', 'shop-web-1', '(alpha)', '(zeta)']);
    expect(groups(page)).toEqual(['(blog)', 'shop', '()']);
    expect(page).toMatch(/<p class="muted" id="nomatch" hidden>/);
  });
  test('the attention count links to the filter; no match says so', () => {
    const page = containersPage(ctx, list);
    expect(page).toContain('<a href="/containers?state=attention">1 needs attention</a>');
    const none = containersPage(ctx, list, null, null, { ...DEFAULT_FILTER, q: 'nope' });
    expect(none).toMatch(/<p class="muted" id="nomatch">No container matches/);
    expect(none).toContain('Show all 5');
  });
  test('the search value is escaped and kept in the box', () => {
    const page = containersPage(ctx, list, null, null, { ...DEFAULT_FILTER, q: '"><script>x' });
    expect(page).toContain('value="&quot;&gt;&lt;script&gt;x"');
    expect(page).not.toContain('<script>x');
  });
  test('an empty host shows no filters and the create hint', () => {
    const page = containersPage(ctx, []);
    expect(page).not.toContain('class="filters"');
    expect(page).toContain('No containers yet');
    expect(page).toMatch(/id="nomatch" hidden/);
  });
  test('300 containers render quickly', () => {
    const many = Array.from({ length: 300 }, (_, i) => c(`app-${i}`, i % 7 ? 'running' : 'exited', i % 7 ? 'Up' : 'Exited (1) now', `p${i % 12}`));
    const t0 = performance.now();
    const page = containersPage(ctx, many);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(rows(page).length).toBe(300);
    expect(groups(page).length).toBe(12);
  });
});
