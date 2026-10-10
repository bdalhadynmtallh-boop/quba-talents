import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './frontend/tests',
  outputDir: './backend/test-results',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: process.env.BROWSER_ORIGIN ?? 'http://localhost:5186',
    browserName: 'chromium',
    channel: process.env.BROWSER_CHANNEL ?? 'msedge',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
});
