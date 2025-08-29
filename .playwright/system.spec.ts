import { test, expect } from '@playwright/test';

test.describe('System Management', () => {
  test('System Info API', async ({ page }) => {
    const response = await page.request.get('/api/system/info');
    
    expect(response.status()).toBe(200);
    const info = await response.json();
    expect(info.version).toBe('1.0.0');
    expect(info.uptime).toBeGreaterThanOrEqual(0);
    expect(info.platform).toBeTruthy();
  });

  test('System Metrics API', async ({ page }) => {
    const response = await page.request.get('/api/system/metrics');
    
    expect(response.status()).toBe(200);
    const metrics = await response.json();
    expect(metrics.cpu.usage).toBeGreaterThanOrEqual(0);
    expect(metrics.memory.used).toBeGreaterThanOrEqual(0);
    expect(metrics.memory.total).toBeGreaterThan(0);
  });
});
