import { test, expect, gotoWithDefaultFontSize } from './fixtures.ts';

test('the full map summary scrolls with its panel and keeps the read link reachable', async ({ page }) => {
  for (const [width, height, font] of [[1440, 540, 16], [390, 844, 16], [844, 390, 16], [390, 844, 32]]) {
    await page.setViewportSize({ width, height });
    await gotoWithDefaultFontSize(page, '/map/?node=notes/browser-long-summary', font);
    const panel = page.locator('.map-panel');
    const summary = panel.locator('.panel-summary');
    const read = panel.getByRole('link', { name: '노트 읽기', exact: true });
    await expect(summary).toBeVisible();
    if (width <= 1000) await expect(panel).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const metrics = await summary.evaluate(element => {
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, line: parseFloat(style.lineHeight), clamp: style.webkitLineClamp, clipped: element.scrollHeight - element.clientHeight };
    });
    expect(metrics.height).toBeGreaterThan(metrics.line * 2);
    expect(metrics.clamp).toBe('none');
    expect(metrics.clipped).toBeLessThanOrEqual(1);
    expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await read.scrollIntoViewIfNeeded();
    await read.focus();
    const bounds = await panel.evaluate(element => {
      const panel = element.getBoundingClientRect(), link = element.querySelector('.panel-head .btn')!.getBoundingClientRect();
      return { panelTop: panel.top, panelBottom: panel.bottom, linkTop: link.top, linkBottom: link.bottom, viewport: innerHeight };
    });
    expect(bounds.linkTop).toBeGreaterThanOrEqual(Math.max(0, bounds.panelTop));
    expect(bounds.linkBottom).toBeLessThanOrEqual(Math.min(bounds.viewport, bounds.panelBottom));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    // 읽던 스크롤 위치 때문에 다음 노트의 제목과 설명을 놓치지 않아야 한다.
    await panel.locator('a[data-node]').first().click();
    await expect(panel.locator('.panel-head h2')).toHaveText('시작 노트');
    expect(await panel.evaluate(element => element.scrollTop)).toBe(0);
  }
});
