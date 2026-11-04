import { test, expect, gotoWithDefaultFontSize } from './fixtures.ts';

test('reciprocal links appear once and remain navigable in the map', async ({ page }) => {
  await page.goto('/map/?node=notes/browser-start');
  const panel = page.locator('[data-panel]');
  const mutual = panel.locator('.list-block').filter({ hasText: '서로 언급' });
  await expect(mutual.locator('.count')).toHaveText('1');
  await expect(mutual.getByRole('link', { name: '이웃 노트', exact: true })).toHaveCount(1);
  await expect(panel.getByRole('link', { name: '이웃 노트', exact: true })).toHaveCount(1);
  await expect(panel.locator('.list-block').filter({ hasText: '이 글에서 언급' })).toHaveCount(0);
  await expect(panel.locator('.list-block').filter({ hasText: '이 글을 언급' }).getByRole('link', { name: '요약이 긴 노트', exact: true })).toBeVisible();
  await mutual.getByRole('link', { name: '이웃 노트', exact: true }).click();
  await expect(panel.locator('h2')).toHaveText('이웃 노트');
  await expect(page).toHaveURL(/node=notes%2Fbrowser-neighbor/);
  await expect(panel.getByRole('link', { name: '시작 노트', exact: true })).toHaveCount(1);
});

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

// 고른 생각 노트의 성숙도는 노트 페이지와 같은 버튼으로 패널 메타 줄에 있다. 설명 판의 Escape는 판만 닫고,
// 시트와 선택은 다음 Escape까지 남는다. 다른 노드를 고르면 열려 있던 판이 남지 않고, 허브에는 성숙도가 없다.
test('the panel shows the selected note maturity and its Escape closes only the meanings', async ({ page, isMobile }) => {
  await page.goto('/map/?node=notes/browser-long-summary');
  const panel = page.locator('.map-panel');
  const title = panel.locator('.panel-head h2');
  const button = panel.locator('.panel-head .meta [data-maturity]');
  const meanings = page.locator('#maturity-note');
  const press = () => isMobile ? button.tap() : button.click();
  const metaHeight = () => panel.locator('.panel-head .meta').evaluate(element => element.getBoundingClientRect().height);
  await expect(button).toHaveText('새싹');
  await expect(meanings).toBeHidden();
  const withMaturity = await metaHeight();
  await press();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(meanings.locator('li[aria-current="true"]')).toContainText('새싹');
  const box = (await meanings.boundingBox())!, viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await button.focus();
  await page.keyboard.press('Escape');
  await expect(meanings).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
  await expect(title).toHaveText('요약이 긴 노트');
  if (isMobile) expect(await panel.evaluate(element => 'open' in element.dataset)).toBe(true);
  await press();
  await expect(meanings).toBeVisible();
  const hub = panel.locator('a[data-node]').first();
  if (isMobile) await hub.tap(); else await hub.click();
  await expect(title).toHaveText('시작 노트');
  await expect(page.locator('#maturity-note')).toHaveCount(0);
  await expect(panel.locator('[data-maturity]')).toHaveCount(0);
  expect(await metaHeight(), '성숙도 버튼이 있어도 메타 줄 높이가 같다').toBeCloseTo(withMaturity, 0);
  await page.keyboard.press('Escape');
  if (isMobile) expect(await panel.evaluate(element => 'open' in element.dataset)).toBe(false);
  else await expect(title).toHaveCount(0);
});

// 시트를 닫은 채 넓은 화면에서 설명 판을 열고 다시 좁히면 패널은 닫힌 시트로 돌아간다.
// 설명 판은 최상위 층에 떠 있어 패널을 화면 밖으로 밀어도 따라가지 않으므로 함께 닫혀야 한다.
test('narrowing the window back to a closed sheet also closes the maturity meanings', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/map/?node=notes/browser-long-summary');
  const panel = page.locator('.map-panel');
  const close = panel.locator('[data-panel-close]');
  if (isMobile) await close.tap(); else await close.click();
  await expect(panel).toHaveAttribute('inert', '');
  await page.setViewportSize({ width: 1440, height: 900 });
  const button = panel.locator('[data-maturity]');
  if (isMobile) await button.tap(); else await button.click();
  await expect(page.locator('#maturity-note')).toBeVisible();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(panel).toHaveAttribute('inert', '');
  await expect(page.locator('#maturity-note')).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});
