import { test, expect, BOTH_THEMES, gotoWithDefaultFontSize } from './fixtures.ts';
import { PALETTE, DARK_PALETTE } from '../../src/lib/palette.ts';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

test('the publishing rhythm shows the period total, inspects months and restores the summary', { tag: BOTH_THEMES }, async ({ page, isMobile, systemDark }) => {
  await page.goto('/posts/');
  const root = page.locator('[data-publishing-rhythm]');
  const chart = root.locator('[data-rhythm-chart]');
  const reading = root.locator('[data-rhythm-reading]');
  const summary = (await reading.textContent())!;
  await expect(root).toBeVisible();
  const points = root.locator('[data-month]');
  const monthCount = await points.count();
  expect(monthCount).toBeGreaterThan(12);
  const months = await points.first().getAttribute('data-month');
  const lastMonth = await points.last().getAttribute('data-month');
  await expect(chart).toHaveAttribute('aria-label', `${months!.replace('-', '.')}부터 ${lastMonth!.replace('-', '.')}까지 월별 발행 흐름. ${summary} 방향키로 월을 살펴봅니다.`);
  // 날짜가 바뀌어도 최근 발행 기록이 있는 연재 편을 임시 vault에 둔다. 소개 페이지는 세지 않는다.
  expect(Number(await points.last().getAttribute('data-count'))).toBeGreaterThanOrEqual(1);
  await expect(chart.locator('polyline')).toHaveCSS('stroke', rgb((systemDark ? DARK_PALETTE : PALETTE).ink));
  await chart.focus();
  await page.keyboard.press('Home');
  await expect(reading).toHaveText(`${(await points.first().getAttribute('data-month'))!.replace('-', '.')} · ${await points.first().getAttribute('data-count')}편`);
  await page.keyboard.press('End');
  await expect(points.last()).toHaveAttribute('data-active', '');
  await page.keyboard.press('ArrowLeft');
  await expect(points.nth(monthCount - 2)).toHaveAttribute('data-active', '');
  await page.keyboard.press('Escape');
  await expect(reading).toHaveText(summary);
  await page.getByRole('heading', { name: '블로그', exact: true }).click();
  const box = (await chart.boundingBox())!;
  if (isMobile) await page.touchscreen.tap(box.x + box.width - 5, box.y + box.height / 2);
  else await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2);
  await expect(points.last()).toHaveAttribute('data-active', '');
  await expect(reading).not.toHaveText(summary);
  if (isMobile) await page.getByRole('heading', { name: '블로그', exact: true }).tap();
  else await page.mouse.move(box.x, box.y + box.height + 15);
  await expect(reading).toHaveText(summary);
});

test('the blog header and rhythm fit narrow and enlarged-text screens', async ({ page }) => {
  for (const fontSize of [16, 32]) {
    for (const width of [320, 390, 720, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoWithDefaultFontSize(page, '/posts/', fontSize);
      const root = page.locator('[data-publishing-rhythm]');
      const chart = root.locator('[data-rhythm-chart]');
      await expect(root).toBeVisible();
      const box = (await root.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const before = await page.locator('.page-head').boundingBox();
      await chart.focus();
      await page.keyboard.press('Home');
      expect((await page.locator('.page-head').boundingBox())!.height).toBeCloseTo(before!.height, 1);
    }
  }
});

test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('the rhythm and total remain visible without an interactive tab stop', async ({ page }) => {
    await page.goto('/posts/');
    await expect(page.locator('[data-publishing-rhythm]')).toBeVisible();
    await expect(page.locator('[data-rhythm-reading]')).toContainText('전체 기간');
    await expect(page.locator('[data-rhythm-chart]')).not.toHaveAttribute('tabindex');
  });
});
