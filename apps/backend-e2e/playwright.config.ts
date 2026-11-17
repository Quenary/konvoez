import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  outputDir: '/tmp/playwright-output',
  timeout: 30_000,
  reporter: 'line',
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://app',
  },
});
