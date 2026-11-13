// Main flows in a real browser against the built image and a dind daemon.
import { expect, test, type Page } from '@playwright/test';

const TOKEN = process.env.KONTAINERS_TEST_SETUP_TOKEN || '';
const PW = 'correct horse battery';

test.describe.configure({ mode: 'serial' });

async function login(page: Page, user = 'admin', pw = PW) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('first run sends you to setup, which needs the token', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'First-run setup' })).toBeVisible();

  await page.getByLabel('Setup token').fill('wrong-token');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel(/^Password/).fill(PW);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('wrong setup token');

  await page.getByLabel('Setup token').fill(TOKEN);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel(/^Password/).fill(PW);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/containers$/);
  await expect(page.getByRole('heading', { name: 'Containers' })).toBeVisible();
});

test('setup is closed afterwards', async ({ page }) => {
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password shows an error, the right one logs in, log out ends it', async ({ page }) => {
  await login(page, 'admin', 'not the password');
  await expect(page.getByRole('alert')).toContainText('Wrong username or password');
  await login(page);
  await expect(page).toHaveURL(/\/containers$/);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/containers');
  await expect(page).toHaveURL(/\/login$/);
});

test('pull an image, create a container, read its logs, stop and remove it', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Images' }).click();
  await page.getByLabel('Image to pull').fill('busybox:1.36');
  await page.getByRole('button', { name: 'Pull' }).click();
  await expect(page.getByRole('status')).toContainText('Pulled busybox:1.36');
  await expect(page.getByRole('cell', { name: 'busybox:1.36' })).toBeVisible();

  await page.getByRole('link', { name: 'Containers' }).click();
  await page.getByRole('link', { name: 'New container' }).click();
  await page.getByLabel('Image', { exact: true }).fill('busybox:1.36');
  await page.getByLabel('Pull the image first').uncheck();
  await page.getByLabel('Name', { exact: true }).fill('e2e-web');
  await page.getByLabel('Command').fill('sh -c "echo hello-e2e; sleep 600"');
  await page.getByLabel(/^Environment/).fill('MODE=test');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('status')).toContainText('Created e2e-web');

  const row = page.locator('tr[data-name="e2e-web"]');
  await expect(row).toContainText('running');
  await row.getByRole('link', { name: 'e2e-web' }).click();
  await expect(page.getByRole('heading', { name: 'e2e-web' })).toBeVisible();
  await expect(page.locator('#logs')).toContainText('hello-e2e');
  await expect(page.getByText('MODE=…')).toBeVisible();

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('status')).toContainText('Done');
  await expect(page.locator('tr[data-name="e2e-web"]')).toContainText('exited');

  // Cancelling the confirm prompt keeps the container.
  page.once('dialog', d => d.dismiss());
  await page.locator('tr[data-name="e2e-web"]').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('tr[data-name="e2e-web"]')).toBeVisible();

  page.once('dialog', d => d.accept());
  await page.locator('tr[data-name="e2e-web"]').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('status')).toContainText('Done');
  await expect(page.locator('tr[data-name="e2e-web"]')).toHaveCount(0);
});

test('bad input is reported, not run', async ({ page }) => {
  await login(page);
  await page.goto('/containers/new');
  await page.getByLabel('Image', { exact: true }).fill('--privileged');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid image');
  await page.goto('/containers/new');
  await page.getByLabel('Image', { exact: true }).fill('busybox:1.36');
  await page.getByLabel('Pull the image first').uncheck();
  await page.getByLabel(/^Volumes/).fill('/:/host');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('alert')).toContainText('bind mounts are disabled');
});

test('networks and volumes', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Networks' }).click();
  await page.getByLabel('Network name').fill('e2e-net');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('cell', { name: 'e2e-net', exact: true })).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByRole('row', { name: /e2e-net/ }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('cell', { name: 'e2e-net', exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Volumes' }).click();
  await page.getByLabel('Volume name').fill('e2e-vol');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('cell', { name: 'e2e-vol', exact: true })).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByRole('row', { name: /e2e-vol/ }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('cell', { name: 'e2e-vol', exact: true })).toHaveCount(0);
});

test('add a second user, who can log in; the proxy page explains how to turn it on', async ({ page, browser }) => {
  await login(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  const add = page.locator('form[action="/settings/users"]');
  await add.getByLabel('Username').fill('ops');
  await add.getByLabel('Password').fill(PW);
  await add.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByRole('status')).toContainText('Added ops');

  const other = await browser.newPage();
  await login(other, 'ops');
  await expect(other).toHaveURL(/\/containers$/);
  await other.close();

  await page.getByRole('link', { name: 'Proxy' }).click();
  await expect(page.getByText('KONTAINERS_PROXY=1')).toBeVisible();
});

test('no console errors and no inline script violations', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await login(page);
  for (const p of ['/containers', '/images', '/networks', '/volumes', '/proxy', '/settings']) await page.goto(p);
  expect(errors).toEqual([]);
});
