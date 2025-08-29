import { test, expect } from '@playwright/test';

test.describe('Dashboard Screen', () => {
  test('Dashboard Overview', async ({ page }) => {
    await page.goto('/dashboard');
    
    await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="stats-overview"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-containers"]')).toBeVisible();
    await expect(page.locator('[data-testid="running-containers"]')).toBeVisible();
  });

  test('Navigation Menu', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for navigation elements to be ready
    await expect(page.locator('[data-testid="nav-containers"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-proxy"]')).toBeVisible();
    
    // Test navigation with proper waiting
    const navLink = page.locator('[data-testid="nav-containers"]');
    await navLink.waitFor({ state: 'visible' });
    await navLink.click({ timeout: 10000 });
    
    // Wait for navigation to complete
    await page.waitForURL('/containers', { timeout: 10000 });
    await expect(page).toHaveURL('/containers');
  });

  test('Dashboard API Integration', async ({ page }) => {
    const response = await page.request.get('/api/dashboard');
    
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.containers).toBeTruthy();
    expect(data.proxyRules).toBeTruthy();
    expect(data.systemLoad).toBeGreaterThanOrEqual(0);
  });
});
