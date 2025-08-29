import { test, expect } from '@playwright/test';

test.describe('Container Management', () => {
  test('Container List Screen', async ({ page }) => {
    await page.goto('/containers');
    
    await expect(page.locator('[data-testid="container-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-container-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="container-search"]')).toBeVisible();
  });

  test('Container API Integration', async ({ page }) => {
    // Test container listing
    const listResponse = await page.request.get('/api/containers');
    expect(listResponse.status()).toBe(200);
    
    // Test container creation
    const createResponse = await page.request.post('/api/containers', {
      data: {
        name: 'test-container',
        image: 'alpine:latest',
        command: ['echo', 'hello']
      }
    });
    
    expect(createResponse.status()).toBe(200);
    const container = await createResponse.json();
    expect(container.id).toBeTruthy();
    expect(container.name).toBe('test-container');
    
    // Clean up
    await page.request.delete(`/api/containers/${container.id}`);
  });

  test('Container Operations', async ({ page }) => {
    // Create a test container
    const createResponse = await page.request.post('/api/containers', {
      data: {
        name: 'ops-test-container',
        image: 'alpine:latest',
        command: ['sleep', '10']
      }
    });
    
    const container = await createResponse.json();
    
    try {
      // Start container
      const startResponse = await page.request.put(`/api/containers/${container.id}/start`);
      expect(startResponse.status()).toBe(200);
      
      // Stop container
      const stopResponse = await page.request.put(`/api/containers/${container.id}/stop`);
      expect(stopResponse.status()).toBe(200);
      
    } finally {
      // Clean up
      await page.request.delete(`/api/containers/${container.id}`);
    }
  });
});
