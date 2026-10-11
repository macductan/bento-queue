import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './global-setup.ts',
  timeout: 60 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list']
  ],
  use: {
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
    baseURL: process.env.BASE_URL || 'http://localhost:34115',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cd .. && wails dev -tags webkit2_41',
    url: 'http://localhost:34115',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
