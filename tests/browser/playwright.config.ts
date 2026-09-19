import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', fullyParallel: true,
  workers: 2, retries: process.env.CI ? 1 : 0,
  reporter: 'list', outputDir: '../../test-results',
  use: { baseURL: 'http://127.0.0.1:4398', browserName: 'chromium', trace: 'retain-on-failure' },
  projects: ['light', 'dark'].flatMap((colorScheme) => [
    { name: `desktop-${colorScheme}`, use: { viewport: { width: 1440, height: 1000 }, colorScheme: colorScheme as 'light' | 'dark' } },
    { name: `mobile-${colorScheme}`, use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: colorScheme as 'light' | 'dark' } }
  ]),
  webServer: { command: 'node tests/browser/server.ts', cwd: '../..', url: 'http://127.0.0.1:4398',
    reuseExistingServer: false, timeout: 120_000 }
});
