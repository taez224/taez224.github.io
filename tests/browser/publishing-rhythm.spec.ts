import { test, expect, BOTH_THEMES, gotoWithDefaultFontSize } from './fixtures.ts';
import { PALETTE, DARK_PALETTE } from '../../src/lib/palette.ts';
import { BROWSER_SERIES_PUBLISHED } from './vault.ts';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

test('the publishing rhythm follows the post count, inspects months above the line and clears the reading', { tag: BOTH_THEMES }, async ({ page, isMobile, systemDark }) => {
  await page.goto('/posts/');
  const root = page.locator('[data-publishing-rhythm]');
  const chart = root.locator('[data-rhythm-chart]');
  const reading = root.locator('[data-rhythm-reading]');
  await expect(root).toBeVisible();
  const points = root.locator('[data-month]');
  const monthCount = await points.count();
  expect(monthCount).toBeGreaterThan(12);
  const months = (await points.first().getAttribute('data-month'))!.replace('-', '.');
  const lastMonth = (await points.last().getAttribute('data-month'))!.replace('-', '.');
  const total = (await points.evaluateAll(circles => circles.map(circle => Number(circle.getAttribute('data-count'))))).reduce((sum, count) => sum + count, 0);
  // 이름과 선만 보이고, 전체 기간은 그래프의 접근 가능한 설명에 남긴다.
  await expect(page.locator('.page-head .meta')).toContainText(`편 · 연재`);
  await expect(root.locator('.rhythm-label')).toHaveText('발행 흐름');
  await expect(root).toHaveText('발행 흐름');
  expect((await root.ariaSnapshot()).match(/발행 흐름/g)).toHaveLength(1);
  await expect(chart).toHaveAttribute('aria-label', `${months}부터 ${lastMonth}까지 월별 발행 흐름. 모두 ${total}편. 방향키로 월을 살펴봅니다.`);
  await expect(reading).toBeHidden();
  // 연재의 편은 발행일이 있는 달에 세고, 소개 페이지는 세지 않는다. 검사용 vault의 날짜는 고정이라 실행한 날과 상관없다.
  await expect(root.locator(`[data-month="${BROWSER_SERIES_PUBLISHED.slice(0, 7)}"]`)).toHaveAttribute('data-count', '1');
  await expect(chart.locator('polyline')).toHaveCSS('stroke', rgb((systemDark ? DARK_PALETTE : PALETTE).ink));
  await chart.focus();
  await page.keyboard.press('Home');
  await expect(reading).toHaveText(`${months} · ${await points.first().getAttribute('data-count')}편`);
  // 살펴보는 달의 편수는 선 위에 뜬다.
  const [readingBox, chartBox] = [(await reading.boundingBox())!, (await chart.boundingBox())!];
  expect(readingBox.y + readingBox.height).toBeLessThanOrEqual(chartBox.y + 1);
  await page.keyboard.press('End');
  await expect(points.last()).toHaveAttribute('data-active', '');
  await page.keyboard.press('ArrowLeft');
  await expect(points.nth(monthCount - 2)).toHaveAttribute('data-active', '');
  await page.keyboard.press('Escape');
  await expect(reading).toBeHidden();
  await page.getByRole('heading', { name: '블로그', exact: true }).click();
  const box = (await chart.boundingBox())!;
  // 선이 작아 몇 픽셀 안쪽만 짚어도 이웃 달이 골라진다. 마지막 달은 오른쪽 끝을 짚는다.
  if (isMobile) await page.touchscreen.tap(box.x + box.width - .5, box.y + box.height / 2);
  else await page.mouse.move(box.x + box.width - .5, box.y + box.height / 2);
  await expect(points.last()).toHaveAttribute('data-active', '');
  await expect(reading).toHaveText(`${lastMonth} · ${await points.last().getAttribute('data-count')}편`);
  if (isMobile) await page.getByRole('heading', { name: '블로그', exact: true }).tap();
  else await page.mouse.move(box.x, box.y + box.height + 15);
  await expect(reading).toBeHidden();
});

test('pointer inspection hides the keyboard ring and keyboard inspection restores it', { tag: BOTH_THEMES }, async ({ page, isMobile }) => {
  await page.goto('/posts/');
  const chart = page.locator('[data-rhythm-chart]');
  if (isMobile) await chart.tap(); else await chart.click();
  await expect(page.locator('[data-rhythm-reading]')).toBeVisible();
  await expect(chart).toHaveCSS('outline-style', 'none');
  await chart.press('ArrowLeft');
  await expect(chart).toHaveCSS('outline-style', 'solid');
  await chart.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(chart).toBeFocused();
  await expect(chart).toHaveCSS('outline-style', 'solid');
});

test('the blog header and rhythm fit narrow and enlarged-text screens', async ({ page }) => {
  for (const fontSize of [16, 32]) {
    for (const width of [320, 390, 480, 481, 720, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoWithDefaultFontSize(page, '/posts/', fontSize);
      const root = page.locator('[data-publishing-rhythm]');
      const chart = root.locator('[data-rhythm-chart]');
      await expect(root).toBeVisible();
      const box = (await root.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      // 이름과 선이 따로 줄바꿈되지 않게 한다.
      const centers = await root.locator('.rhythm-label, .rhythm-plot').evaluateAll(parts => parts.map(part => {
        const box = part.getBoundingClientRect();
        return box.y + box.height / 2;
      }));
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
      const before = await page.locator('.page-head').boundingBox();
      await chart.focus();
      await page.keyboard.press('Home');
      expect((await page.locator('.page-head').boundingBox())!.height).toBeCloseTo(before!.height, 1);
      // 편수 뒤에 들어가지 않아 다음 줄로 내려가면 가운데 점이 줄 끝에 남지 않는다.
      if (width <= 480) await expect(page.locator('.rhythm-sep')).toBeHidden();
    }
  }
});

// 흐름은 편수 줄 안에 들어가므로 블로그 머리가 그래프 때문에 다른 목록 머리보다 높아지지 않는다.
test('the blog header keeps the same height as other list headers on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/');
  const listHead = (await page.locator('.page-head').boundingBox())!.height;
  await page.goto('/posts/');
  await expect(page.locator('[data-publishing-rhythm]')).toBeVisible();
  expect((await page.locator('.page-head').boundingBox())!.height).toBeCloseTo(listHead, 0);
});

test('the rhythm label shares the count text baseline at normal and enlarged font sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const fontSize of [16, 32]) {
    await gotoWithDefaultFontSize(page, '/posts/', fontSize);
    const bounds = await page.locator('.page-head > .meta').evaluate(meta => {
      const count = document.createRange();
      count.selectNodeContents(meta.firstChild!);
      const label = document.createRange();
      label.selectNodeContents(meta.querySelector('.rhythm-label')!);
      return { count: count.getBoundingClientRect().toJSON(), label: label.getBoundingClientRect().toJSON() };
    });
    expect(Math.abs(bounds.count.top - bounds.label.top)).toBeLessThan(.5);
    expect(Math.abs(bounds.count.bottom - bounds.label.bottom)).toBeLessThan(.5);
  }
});

test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('the named rhythm stays visible and its period stays described without scripts', async ({ page }) => {
    await page.goto('/posts/');
    const root = page.locator('[data-publishing-rhythm]');
    await expect(root).toBeVisible();
    await expect(root).toHaveText('발행 흐름');
    await expect(root.locator('[data-rhythm-chart]')).toHaveAttribute('aria-label', /부터 .+까지 월별 발행 흐름/);
    await expect(root.locator('[data-rhythm-chart]')).not.toHaveAttribute('tabindex');
  });
});
