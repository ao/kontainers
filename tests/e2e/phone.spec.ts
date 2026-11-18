// Accessibility (axe-core, WCAG 2 A and AA) on every page, and a phone-sized screen: no page may be
// wider than the screen. Runs after main.spec.ts, which does the first-run setup.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PW = 'correct horse battery';
const LONG = 'long-' + 'n'.repeat(110);

test.describe.configure({ mode: 'serial' });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/containers$/);
}

const PAGES = ['/containers', '/containers/new', '/images', '/cleanup', '/networks', '/volumes', '/proxy', '/activity', '/settings'];

async function check(page: Page, path: string, label: string) {
  await page.goto(path);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const found = result.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
  expect(found, `${label} ${path}`).toEqual([]);
}

// Things that made pages wider than a phone on a busy host: an anonymous volume (a 64-character
// name), a long network and image name, a notification target with a long URL.
const API = 'http://docker-proxy:2375/v1.41';
const NET = 'a-network-with-a-rather-long-name-for-a-phone';
const TAG = 'registry.example.com/some-team/a-very-long-image-name';

test('a container to look at', async ({ page, request }) => {
  expect((await request.post(`${API}/networks/create`, { data: { Name: NET } })).status()).toBe(201);
  expect((await request.post(`${API}/images/busybox:1.36/tag?repo=${encodeURIComponent(TAG)}&tag=2026.11.16-build.1234`)).status()).toBe(201);
  expect((await request.post(`${API}/containers/create?name=a11y-anon`, { data: { Image: 'busybox:1.36', Cmd: ['true'], Volumes: { '/data': {} }, HostConfig: { NetworkMode: NET } } })).status()).toBe(201);
  await login(page);
  await page.goto('/settings');
  await page.getByLabel('URL').fill('https://hooks.example.net/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX');
  await page.getByRole('button', { name: 'Add target' }).click();
  await expect(page.getByRole('status')).toContainText('Added the webhook target');
  await page.goto('/containers/new');
  await page.getByLabel('Image', { exact: true }).fill('busybox:1.36');
  await page.getByLabel('Pull the image first').uncheck();
  await page.getByLabel('Name', { exact: true }).fill('a11y-web');
  await page.getByLabel('Command').fill('sh -c "echo ready; sleep 600"');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('status')).toContainText('Created a11y-web');
  // A long name must wrap, not push the table off the screen.
  await page.goto('/containers/new');
  await page.getByLabel('Image', { exact: true }).fill('busybox:1.36');
  await page.getByLabel('Pull the image first').uncheck();
  await page.getByLabel('Name', { exact: true }).fill(LONG);
  await page.getByLabel('Command').fill('sleep 600');
  await page.getByLabel(/^Ports/).fill(Array.from({ length: 12 }, (_, i) => `${20000 + i}:${80 + i}`).join('\n'));
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('status')).toContainText('Created long-');
});

test('no accessibility violations on a desktop screen', async ({ page }) => {
  await login(page);
  for (const p of [...PAGES, '/containers/a11y-web', '/containers/a11y-web/edit']) {
    await check(page, p, 'desktop');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `page wider than the screen on ${p}`).toBeLessThanOrEqual(1);
  }
  for (const p of ['/login', '/setup']) { await page.context().clearCookies(); await check(page, p, 'desktop'); }
});

test('on a phone: no violations, and nothing wider than the screen', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page);
  for (const p of [...PAGES, '/containers/a11y-web', '/containers/a11y-web/edit']) {
    await check(page, p, 'phone');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `page wider than the screen on ${p}`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/phone${p.replace(/\//g, '-')}.png`, fullPage: true });
  }
  await ctx.close();
});

test('the image column keeps a short reference on one line on a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await login(page);
  const lines = await page.locator('#containers td:nth-child(2) span.ref', { hasText: 'busybox:1.36' }).first().evaluate(e => e.getClientRects().length);
  expect(lines).toBe(1);
});

test('clean up after', async ({ page, request }) => {
  await request.delete(`${API}/containers/a11y-anon?force=1&v=1`);
  await request.delete(`${API}/networks/${NET}`);
  await request.delete(`${API}/images/${encodeURIComponent(TAG)}:2026.11.16-build.1234`);
  await login(page);
  await page.goto('/settings');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Remove' }).last().click();
  await expect(page.getByRole('status')).toContainText('Removed the notification target');
  for (const n of ['a11y-web', LONG]) {
    await page.goto(`/containers/${n}`);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('status')).toContainText('Done');
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('status')).toContainText('Done');
  }
});

test('two-factor login: set-up, recovery codes and the second step, without accessibility violations', async ({ page }) => {
  const { hotp, step, unbase32 } = await import('../../src/totp');
  await login(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Set up two-factor login' }).click();
  const a11y = async (label: string) => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map(v => v.id), label).toEqual([]);
  };
  await a11y('set-up page');
  const key = (await page.locator('dd code').first().textContent())!.replace(/\s/g, '');
  const secret = unbase32(key);
  await page.getByLabel('The code the app shows now').fill(hotp(secret, step(Date.now())));
  await page.getByRole('button', { name: 'Turn on two-factor login' }).click();
  await expect(page.getByRole('heading', { name: 'Two-factor login is on' })).toBeVisible();
  await a11y('recovery codes page');
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByLabel('Code from your authenticator app, or a recovery code')).toBeVisible();
  await a11y('second step');
  // A fresh step's code: the set-up used this one.
  await page.waitForTimeout(31_000);
  await page.getByLabel('Code from your authenticator app, or a recovery code').fill(hotp(secret, step(Date.now())));
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/containers$/);
  // Off again, for anything that runs after.
  await page.goto('/settings');
  await page.getByLabel('Your password, to turn it off').fill(PW);
  await page.getByRole('button', { name: 'Turn off two-factor login' }).click();
  await expect(page.getByRole('status')).toContainText('Two-factor login is off for your account');
});
