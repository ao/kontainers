// Drives kontainers like a person and saves the screenshots used in the README and on the website.
// Run by `scripts/test.sh screenshots` against a throwaway dind holding a realistic host: a compose
// stack, a container created in kontainers, and proxy rules with certificates from Pebble.
//   PHASE=setup  first-run setup, a container, two HTTPS rules; waits for both certificates
//   PHASE=shots  logs in and takes the screenshots (after the test ACME server is gone)
//   env: URL (kontainers UI), TOKEN (setup token, setup phase), OUT (directory for the PNGs)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const { URL: BASE, TOKEN, OUT = '/out', PHASE } = process.env;
const PW = 'correct horse battery';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const shot = async (name, opts = {}) => {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log('saved', name);
};

if (PHASE === 'setup') {
  await page.goto(BASE + '/');
  await page.getByLabel('Setup token').fill(TOKEN);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel(/^Password/).fill(PW);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/containers$/);

  // A container created in kontainers, so its page offers Update image.
  await page.goto(BASE + '/containers/new');
  await page.getByLabel('Image', { exact: true }).fill('nginx:1.27-alpine');
  await page.getByLabel('Name', { exact: true }).fill('blog');
  await page.getByLabel(/^Ports/).fill('8081:80');
  await page.getByLabel(/^Environment/).fill('TZ=Europe/London');
  await page.getByLabel('Restart policy').selectOption('unless-stopped');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('status').waitFor();

  for (const [hostname, target] of [['shop.example.com', 'shop-web-1'], ['blog.example.com', 'blog']]) {
    await page.goto(BASE + '/proxy');
    await page.getByLabel('Hostname').fill(hostname);
    await page.getByLabel('Target container').fill(target);
    await page.getByLabel('Target port').fill('80');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await page.getByRole('status').waitFor();
  }
  for (let i = 0; ; i++) {
    await page.goto(BASE + '/proxy');
    if ((await page.getByText(/certificate valid until/).count()) >= 2) break;
    if (i > 90) throw new Error('certificates were not issued');
    await page.waitForTimeout(2000);
  }
  console.log('certificates issued');
} else {
  await page.goto(BASE + '/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/containers$/);
  await shot('containers');
  await page.goto(BASE + '/proxy');
  await shot('proxy', { fullPage: true });
  await page.goto(BASE + '/containers');
  await page.locator('tr[data-name="blog"]').getByRole('link', { name: 'blog' }).click();
  await page.locator('#stats [data-k="mem"]').filter({ hasText: /\d/ }).waitFor();
  await page.locator('#logs').filter({ hasText: /\S{10,}/ }).waitFor();
  await shot('container');
  await page.goto(BASE + '/containers/new');
  await shot('new-container');
  await page.goto(BASE + '/images');
  await shot('images');
  // Dark mode, for the README's second image.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(BASE + '/containers');
  await shot('containers-dark');
}
await browser.close();
