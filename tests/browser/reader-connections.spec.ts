import { test, expect, gotoWithDefaultFontSize, BOTH_THEMES } from './fixtures.ts';

test('related titles occur once, remain readable and never overlap across widths and text sizes', async ({ page }) => {
  for (const [width, font] of [[1440, 16], [900, 16], [390, 16], [320, 16], [1440, 32]]) {
    await page.setViewportSize({ width, height: 1000 });
    await gotoWithDefaultFontSize(page, '/notes/browser-many/', font);
    const region = page.locator('.reader-end-connections');
    await expect(region.locator('a.network-note')).toHaveCount(7);
    await expect(page.locator('.note-side .reader-network')).toHaveCount(0);
    await expect(region.locator('button')).toHaveCount(0);
    const urls = await region.locator('a.network-note').evaluateAll(es => es.map(e => e.getAttribute('href')));
    expect(new Set(urls).size).toBe(7);
    await expect.poll(() => region.locator('a.network-note').evaluateAll(es => {
      const boxes = es.map(e => e.getBoundingClientRect());
      return boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
    })).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    for (const link of await region.locator('a.network-note').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('hover and focus identify a connected note without moving its title', { tag: BOTH_THEMES }, async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/notes/browser-many/');
  const link = page.locator('a.network-note').first();
  await link.scrollIntoViewIfNeeded();
  const before = await link.boundingBox();
  if (!isMobile) {
    await link.hover();
    await expect(link.locator('i')).toHaveCSS('outline-width', '1px');
    await expect(link).toHaveCSS('text-decoration-line', 'none');
    expect(await link.boundingBox()).toEqual(before);
  }
  await link.focus();
  await expect(page.locator('.network-edge.active-edge').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(link).toBeFocused();
  const href = await link.getAttribute('href');
  await link.press('Enter');
  await expect(page).toHaveURL(new RegExp(href!));
});

test('related content follows original footnotes and hub and section links navigate separately', async ({ page }) => {
  await page.goto('/notes/browser-start/');
  expect(await page.evaluate(() => Boolean(document.querySelector('.footnotes')!.compareDocumentPosition(document.querySelector('.reader-end-connections')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.goto('/notes/browser-neighbor/');
  const row = page.locator('.reader-hub-row').filter({ hasText: '절별 허브' });
  await expect(row.locator('a')).toHaveCount(2);
  await expect(row.locator('.reader-hub-name')).toHaveAttribute('href', '/notes/browser-section-hub/');
  const section = row.locator('.reader-hub-section');
  const href = await section.getAttribute('href');
  await section.click();
  expect(decodeURIComponent(page.url())).toContain(decodeURIComponent(href!));
  await expect(page.locator('h2').filter({ hasText: '검증과 안전장치' }).first()).toBeInViewport();
});

test('the reader draws each undirected relation only once', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/notes/browser-many/');
  const pairs = await page.locator('.network-edge').evaluateAll(es => es.map(e => JSON.stringify([(e as SVGElement).dataset.source, (e as SVGElement).dataset.target].sort())));
  expect(pairs.length).toBeGreaterThan(0);
  expect(new Set(pairs).size).toBe(pairs.length);
});

test('hub sections return to ordinary relations on member selection and preserve the return destination', async ({ page }) => {
  await page.goto('/map/?node=notes%2Fbrowser-section-hub');
  const choices = page.locator('[data-hub-section]');
  await expect(choices).toHaveCount(2);
  await expect(choices.first()).toHaveText('검증과 안전장치');
  await choices.nth(1).click();
  await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.hub-section-items a')).toHaveCount(1);
  await choices.first().focus();
  await choices.first().press('Enter');
  await expect(choices.first()).toBeFocused();
  await page.locator('.hub-section-items a').first().press('Enter');
  await expect(page.locator('.section-hub-return')).toBeVisible();
  await expect(page.locator('.hub-section-browser')).toHaveCount(0);
  await expect(page.locator('.panel-lists')).toBeVisible();
  await expect(page.locator('.section-hub-return')).toBeFocused();
  await expect(page.locator('.section-hub-return')).toContainText('검증과 안전장치');
  await expect(page.locator('svg[data-map]')).not.toHaveClass(/has-section-selection/);
  await expect(page.locator('.edge.is-topic-dim')).toHaveCount(0);
  expect(await page.locator('.edge.is-in, .edge.is-out').count()).toBeGreaterThan(0);
  await page.locator('.section-hub-return').press('Enter');
  await expect(choices.first()).toBeFocused();
  await expect(page.locator('svg[data-map]')).toHaveClass(/has-section-selection/);
});

test('title backgrounds follow text lines and edges stay attached after titles change sides', { tag: BOTH_THEMES }, async ({ page }) => {
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/notes/browser-many/');
    const graph = page.locator('.reader-network');
    await expect(graph).not.toHaveClass(/compact-network/);
    await expect(graph.locator('.network-title').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(graph.locator('.network-title > span').first()).toHaveCSS('box-decoration-break', 'clone');
    await expect.poll(() => graph.evaluate(wrap => {
      const rect = wrap.getBoundingClientRect();
      const dots = new Map([...wrap.querySelectorAll<HTMLElement>('[data-node]')].map(n => {
        const r = n.querySelector('i')!.getBoundingClientRect();
        return [n.dataset.node, { x: r.x + r.width / 2 - rect.x, y: r.y + r.height / 2 - rect.y }];
      }));
      return Math.max(...[...wrap.querySelectorAll<SVGLineElement>('.network-edge')].flatMap(line => {
        const a = dots.get(line.dataset.source)!, b = dots.get(line.dataset.target)!;
        return [Math.abs(a.x - Number(line.getAttribute('x1'))), Math.abs(a.y - Number(line.getAttribute('y1'))),
          Math.abs(b.x - Number(line.getAttribute('x2'))), Math.abs(b.y - Number(line.getAttribute('y2')))];
      }));
    })).toBeLessThan(1);
  }
});

test('authored recommendations are not repeated and sparse links stay compact', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/notes/browser-curated-reader/');
    const body = page.locator('.note-article .body');
    await expect(body.locator('a[href="/notes/browser-reader-target-two/"]')).toHaveCount(1);
    await expect(body).toContainText('추천한 이유를 보존한다.');
    await expect(body.locator('.reader-related-heading')).toHaveText('더 읽기');
    await expect(body.locator('.reader-map-link')).toHaveCount(1);
    await expect(page.locator('.note-footer a[href^="/map/"]')).toHaveCount(0);
    const network = body.locator('.reader-network');
    await expect(network.locator('a.network-note')).toHaveCount(1);
    await expect(network).toHaveClass(/compact-network/);
    expect((await network.boundingBox())!.height).toBeLessThan(160);
    await expect(network.locator('.current-note')).toBeHidden();
  }
});

test('empty and hub-only notes have no empty connection heading and hubs do not repeat their contents', async ({ page }) => {
  await page.goto('/notes/browser-empty-reader/');
  await expect(page.locator('.reader-end-connections')).toHaveCount(0);
  await expect(page.locator('.note-footer a[href^="/map/"]')).toBeVisible();
  await page.goto('/notes/browser-hub-only-reader/');
  await expect(page.locator('.reader-related-heading')).toHaveCount(0);
  await expect(page.locator('.reader-hub-name')).toHaveText('절별 허브');
  await expect(page.locator('.note-footer a[href^="/map/"]')).toBeVisible();
  await page.goto('/notes/browser-section-hub/');
  await expect(page.locator('.reader-network')).toHaveCount(0);
  await expect(page.locator('.note-article .body a[href="/notes/browser-neighbor/"]')).toHaveCount(1);
  await expect(page.locator('.note-footer a[href^="/map/"]')).toBeVisible();
});

test('series contents remain available beside the article and below it on narrow screens', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/posts/browser-series-part/');
    const series = page.locator('.note-side .series-block');
    await expect(series).toBeVisible();
    await expect(series.locator('[aria-current="page"]')).toHaveCount(1);
    const articleBox = (await page.locator('.note-article').boundingBox())!;
    const seriesBox = (await series.boundingBox())!;
    if (width === 1440) expect(seriesBox.x + seriesBox.width).toBeLessThanOrEqual(articleBox.x);
    else expect(seriesBox.y).toBeGreaterThanOrEqual(articleBox.y + articleBox.height);
  }
});

test('dense long titles retain disjoint tap areas after collision resolution', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/notes/browser-dense-reader/');
  const graph = page.locator('.reader-network');
  await expect(graph).not.toHaveClass(/compact-network/);
  await expect.poll(() => graph.locator('.network-note').evaluateAll(es => {
    const boxes = es.map(e => e.getBoundingClientRect());
    return boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
  })).toBe(false);
});
