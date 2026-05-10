import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './tests',
  // Chrome with TE extension takes ~15-20s to initialise; 120s gives the test
  // body 90s of headroom after startup.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // Serial execution — one Chrome instance with the TE extension at a time
  workers: 1,
  fullyParallel: false,

  // Retry once on flake; scheduled synthetic tests should be reliable
  retries: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/results.xml' }],
  ],

  use: {
    // headless is managed by the te-browser fixture, not here
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  },

  outputDir: 'test-results',
});
