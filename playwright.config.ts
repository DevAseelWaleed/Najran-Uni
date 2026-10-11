import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60000,
  use: {
    channel: process.env.TEST_BROWSER_CHANNEL || 'chromium',
    baseURL: 'http://localhost:5198',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
});
