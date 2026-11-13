import { defineConfig, devices } from '@playwright/test';

// Run through scripts/test.sh e2e, which starts the image and sets KONTAINERS_TEST_URL.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.KONTAINERS_TEST_URL || 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
