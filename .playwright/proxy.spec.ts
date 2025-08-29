import { test, expect } from '@playwright/test';

test.describe('Proxy Management', () => {
  test('Proxy Rules API', async ({ page }) => {
    // Test proxy rules listing
    const listResponse = await page.request.get('/api/proxy/rules');
    expect(listResponse.status()).toBe(200);
    
    // Test proxy rule creation
    const createResponse = await page.request.post('/api/proxy/rules', {
      data: {
        domain: 'app.example.com',
        target: 'http://localhost:3001',
        ssl: true
      }
    });
    
    expect(createResponse.status()).toBe(200);
    const rule = await createResponse.json();
    expect(rule.id).toBeTruthy();
    expect(rule.domain).toBe('app.example.com');
    expect(rule.ssl).toBe(true);
  });

  test('Traffic Monitoring API', async ({ page }) => {
    const response = await page.request.get('/api/proxy/traffic');
    
    expect(response.status()).toBe(200);
    const traffic = await response.json();
    expect(traffic.totalRequests).toBeGreaterThanOrEqual(0);
    expect(traffic.avgResponseTime).toBeGreaterThanOrEqual(0);
    expect(traffic.errorRate).toBeGreaterThanOrEqual(0);
  });
});
