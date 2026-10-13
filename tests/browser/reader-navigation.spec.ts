import { test, expect, gotoWithDefaultFontSize, BOTH_THEMES } from './fixtures.ts';

test('reader tabs preserve reading position, share connections, and keep their height', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notes/browser-sections/');
  await page.evaluate(() => window.scrollTo(0, 1800));
  const open = page.locator('.toc-button');
  await expect(open).toBeVisible();
  await open.click();
  const sheet = page.locator('#toc-sheet');
  const before = await sheet.boundingBox();
  expect((await sheet.locator('.reader-close').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const position = await page.evaluate(() => scrollY);
  const linksTab = sheet.locator('#reader-links-tab');
  await expect(linksTab).toBeVisible();
  await sheet.getByRole('tab', { name: '목차', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(linksTab).toBeFocused();
  await expect(linksTab).toHaveAttribute('aria-selected', 'true');
  expect((await sheet.boundingBox())!.height).toBe(before!.height);
  expect(await page.evaluate(() => scrollY)).toBe(position);
  await page.keyboard.press('ArrowLeft');
  await sheet.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(position);
});

test('a note without headings exposes its connections and closes on desktop resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notes/browser-neighbor/');
  await expect(page.locator('.mobile-toc')).toHaveCount(0);
  await page.getByRole('button', { name: '연결된 글', exact: true }).click();
  const panel = page.locator('#reader-links-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#reader-toc-tab')).toHaveCount(0);
  const sidebar = await page.locator('.note-side section .side-list a').evaluateAll(a => a.map(e => e.getAttribute('href')));
  const connections = await panel.locator('a').evaluateAll(a => a.map(e => e.getAttribute('href')));
  expect(connections).toEqual(sidebar);
  await expect(page.locator('.reader-map a')).toHaveAttribute('href', /node=/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => page.locator('#toc-sheet').evaluate(e => e.matches(':popover-open'))).toBe(false);
  await expect(page.locator('.toc-button')).toBeHidden();
});

test('reader navigation stays inside a narrow enlarged-text viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await gotoWithDefaultFontSize(page, '/notes/browser-neighbor/', 32);
  await page.locator('.toc-button').click();
  const box = (await page.locator('#toc-sheet').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  await expect(page.locator('.reader-close')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#toc-sheet')).toBeHidden();
});


test('a series connection is listed once instead of repeated as a reference', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/posts/browser-series-part/');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('.toc-button').click();
  await page.locator('#reader-links-tab').click();
  const links = page.locator('#reader-links-panel a[href="/posts/browser-series/"]');
  await expect(links).toHaveCount(1);
  await expect(links).toBeVisible();
});

test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('the sidebar connections remain available without the floating control', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/notes/browser-neighbor/');
    await expect(page.locator('.toc-button')).toBeHidden();
    await expect(page.locator('.note-side .side-list a').first()).toBeVisible();
  });
});
