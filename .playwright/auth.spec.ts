import { test, expect } from '@playwright/test';

test.describe('Authentication Screens', () => {
  test('Login Form', async ({ page }) => {
    await page.goto('/login');
    
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'password123');
  });

  test('Register Form', async ({ page }) => {
    await page.goto('/register');
    
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
  });

  test('Login API Integration', async ({ page }) => {
    const response = await page.request.post('/api/auth/login', {
      data: { email: 'admin@example.com', password: 'password123' }
    });
    
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.token).toBeTruthy();
    expect(data.user.email).toBe('admin@example.com');
  });
});
