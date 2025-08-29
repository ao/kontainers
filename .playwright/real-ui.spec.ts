import { test, expect } from '@playwright/test';

test.describe('Real UI Tests', () => {
  test('should load the actual application', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Kontainers Container Management');
    await expect(page.locator('nav')).toBeVisible();
  });

  test('should respond to health endpoint', async ({ page }) => {
    const response = await page.goto('/health');
    expect(response?.status()).toBe(200);
    
    const data = await response?.json();
    expect(data.status).toBe('healthy');
    expect(data.version).toBe('1.0.0');
  });

  test('should handle API endpoints', async ({ page }) => {
    // Test containers API
    const response = await page.request.get('/api/containers');
    expect(response.status()).toBe(200);
    
    const containers = await response.json();
    expect(Array.isArray(containers)).toBe(true);
  });

  test('should work with real browser interactions', async ({ page }) => {
    await page.goto('/');
    
    // Test real browser capabilities
    const userAgent = await page.evaluate(() => navigator.userAgent);
    expect(userAgent).toBeTruthy();
    
    // Test real DOM
    const title = await page.title();
    expect(title).toContain('Kontainers');
    
    // Test navigation with timeout handling
    await page.click('a[href="/login"]', { timeout: 5000 });
    await page.waitForURL('/login', { timeout: 5000 });
    
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('should handle form interactions', async ({ page }) => {
    await page.goto('/login');
    
    // Fill login form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    const email = await page.inputValue('input[type="email"]');
    expect(email).toBe('test@example.com');
  });
});
