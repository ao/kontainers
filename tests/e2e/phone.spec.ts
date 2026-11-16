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

test('a container to look at', async ({ page }) => {
  await login(page);
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

test('clean up after', async ({ page }) => {
  await login(page);
  for (const n of ['a11y-web', LONG]) {
    await page.goto(`/containers/${n}`);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('status')).toContainText('Done');
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('status')).toContainText('Done');
  }
});
