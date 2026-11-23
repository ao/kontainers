import { describe, expect, test } from 'bun:test';
import { activityPage, actionsMatching } from '../../src/views';

const ctx = { user: 'admin', csrf: 't' };
const row = (over: any) => ({ id: 1, at: Date.UTC(2026, 10, 16, 12, 30, 5), username: 'admin', action: 'container-stop', target: 'web', ip: '127.0.0.1', result: null, ...over });

describe('activityPage', () => {
  test('describes actions, marks failures, names kontainers and anonymous attempts', () => {
    const page = activityPage(ctx, [
      row({}),
      row({ id: 2, action: 'container-remove', result: 'failed: container is running: stop the container before removing' }),
      row({ id: 3, username: null, ip: null, action: 'auto-update', target: 'db' }),
      row({ id: 4, username: null, action: 'login-failed', target: 'root', ip: '203.0.113.9' }),
      row({ id: 5, action: 'something-new', target: '<b>x</b>' }),
    ], '', null);
    expect(page).toContain('<td>2026-11-16 12:30:05</td>');
    expect(page).toContain('stopped <span class="ref">web</span>');
    expect(page).toContain('<tr class="failed">');
    expect(page).toContain('<small class="error">failed: container is running');
    expect(page).toContain('<span class="muted">kontainers</span></td>\n<td>updated automatically <span class="ref">db</span>');
    expect(page).toContain('<span class="muted">not logged in</span></td>\n<td>failed to log in <span class="ref">root</span>');
    expect(page).toContain('something-new <span class="ref">&lt;b&gt;x&lt;/b&gt;</span>');
    expect(page).not.toContain('Older');
  });
  test('paging and an empty search', () => {
    expect(activityPage(ctx, [row({})], 'we b', 42)).toContain('href="/activity?before=42&amp;q=we%20b"');
    expect(activityPage(ctx, [], 'zzz', null)).toContain('Nothing matches.');
    expect(activityPage(ctx, [], '', null)).toContain('Nothing yet.');
  });
});

test('actionsMatching finds actions by their description', () => {
  expect(actionsMatching('stopped').sort()).toEqual(['bulk-stop', 'container-stop', 'project-stop']);
  expect(actionsMatching('automatic')).toEqual(expect.arrayContaining(['autoupdate-on', 'autoupdate-off', 'auto-update']));
  expect(actionsMatching('')).toEqual([]);
});
