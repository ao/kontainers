import { describe, expect, test } from 'bun:test';
import * as views from '../../src/views';

const ctx = (readOnly: boolean): views.PageCtx => ({ user: 'reader', csrf: 'c', readOnly });
const container = { Id: 'a'.repeat(64), Names: ['/web'], Image: 'nginx:1', Ref: 'nginx:1', ImageID: 'sha256:1', State: 'running', Status: 'Up', Labels: { 'com.docker.compose.project': 'shop' }, Ports: [] };

describe('what a read-only account is offered', () => {
  test('it may send only its own password, two-factor and logout', () => {
    for (const p of ['/logout', '/settings/password', '/settings/2fa/start', '/settings/2fa/confirm', '/settings/2fa/disable']) expect(views.viewerMayPost(p)).toBe(true);
    for (const p of ['/containers', '/containers/web/stop', '/settings/users', '/settings/2fa/../users', '/settings/users/2/role', '/projects/shop/update', '/updates/check', '/settings/2fa/reset']) expect(views.viewerMayPost(p)).toBe(false);
  });
  test('the pages leave out the forms that change things', () => {
    const page = views.containersPage(ctx(true), [container]);
    expect(page).not.toContain('action="/containers/');
    expect(page).not.toContain('/projects/shop/');
    expect(page).not.toContain('href="/containers/new"');
    expect(page).not.toContain('action="/updates/check"');
    expect(page).toContain('action="/logout"');
    expect(page).toContain('read-only');
    const admin = views.containersPage(ctx(false), [container]);
    expect(admin).toContain('action="/containers/web/stop"');
    expect(admin).toContain('href="/containers/new"');
  });
  test('no Duplicate or Edit links, with or without a query', () => {
    expect(views.readOnlyView('<p>x <a class="button" href="/containers/new?from=web">Duplicate</a> <a class="button" href="/containers/web/edit?image=a%3A2">Use</a></p>')).toBe('<p>x</p>');
    const c = { Id: 'b'.repeat(64), Name: '/web', Config: { Image: 'nginx:1', Labels: { 'kontainers.managed': 'true' } }, HostConfig: {}, State: { Status: 'running' } };
    expect(views.readOnlyView(views.containerPage(ctx(true), c, null, null, null, true, true))).not.toContain('Duplicate');
    expect(views.containerPage(ctx(false), c, null, null, null, true, true)).toContain('href="/containers/new?from=web">Duplicate</a>');
    expect(views.containerPage(ctx(false), c, null, null, null, true, false)).not.toContain('Duplicate');
  });
  test('settings: its own account only, no users, backups or downloads', () => {
    const page = views.settingsPage(ctx(true), [{ id: 2, username: 'reader', role: 'viewer' }], 2, null, null, null, null, { mine: false, left: 0, users: new Set() }, null);
    expect(page).toContain('action="/settings/password"');
    expect(page).toContain('action="/settings/2fa/start"');
    expect(page).not.toContain('/api/backup');
    expect(page).not.toContain('action="/settings/users"');
    expect(page).toContain('This account is read-only');
  });
  test('administrators see the roles and can change them', () => {
    const page = views.settingsPage(ctx(false), [{ id: 1, username: 'admin', role: 'admin' }, { id: 2, username: 'reader', role: 'viewer' }], 1);
    expect(page).toContain('<td>read-only</td>');
    expect(page).toContain('action="/settings/users/2/role"');
    expect(page).toContain('Make administrator');
    expect(page).toContain('<option value="viewer">Read-only</option>');
  });
});
