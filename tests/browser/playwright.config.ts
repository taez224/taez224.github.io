import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', fullyParallel: true,
  workers: 2, retries: process.env.CI ? 1 : 0,
  reporter: 'list', outputDir: '../../test-results',
  use: { baseURL: 'http://127.0.0.1:4398', browserName: 'chromium', trace: 'retain-on-failure' },
  // 어두운 화면 CSS는 칠하는 방식만 바꾸므로 배치와 입력 동작은 밝은 화면에서 한 번 본다.
  // 어두운 화면에서는 테마에 따라 결과가 갈리거나 칠한 모양을 단언하는 검사(@both-themes)만 돈다.
  projects: ['light', 'dark'].flatMap((colorScheme) => {
    const only = colorScheme === 'dark' ? { grep: /@both-themes/ } : {};
    return [
      { name: `desktop-${colorScheme}`, ...only, use: { viewport: { width: 1440, height: 1000 }, colorScheme: colorScheme as 'light' | 'dark' } },
      { name: `mobile-${colorScheme}`, ...only, use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: colorScheme as 'light' | 'dark' } }
    ];
  }),
  webServer: { command: 'node tests/browser/server.ts', cwd: '../..', url: 'http://127.0.0.1:4398',
    reuseExistingServer: false, timeout: 120_000 }
});
