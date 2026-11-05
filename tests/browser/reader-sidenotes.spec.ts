import { test, expect, gotoWithDefaultFontSize, gotoBeforeModules, BOTH_THEMES } from './fixtures.ts';

test('wide sidenotes preserve original anchors, avoid collisions and return to the bottom on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/notes/browser-start/');
  await expect(page.locator('.note-view')).toHaveAttribute('data-sidenotes', '');
  const measure = () => page.evaluate(() => {
    const article = document.querySelector('.note-article')!.getBoundingClientRect();
    const notes = [...document.querySelectorAll<HTMLElement>('.footnotes li[id]')].map(n => n.getBoundingClientRect());
    return { articleWidth: article.width, beside: notes.every(n => n.left > article.right), separated: notes.every((n, i) => !i || n.top >= notes[i - 1].bottom), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  await expect.poll(measure).toEqual({ articleWidth: 720, beside: true, separated: true, overflow: false });
  await expect(page.locator('[id="fn:1"]')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[id="fn:1"]')).toHaveCSS('position', 'static');
  await expect(page.locator('.footnotes-title')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: '각주 1', exact: true }).press('Enter');
  await expect(page).toHaveURL(/#fn:1$/);
  await page.getByRole('link', { name: '1번 각주를 단 곳으로', exact: true }).press('Enter');
  await expect(page.getByRole('link', { name: '각주 1', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.note-view')).not.toHaveAttribute('data-sidenotes');
  await expect(page.locator('.footnotes-title')).toBeVisible();
  await expect(page.locator('[id="fn:1"]')).toHaveCSS('position', 'static');
});

test('late footnote growth stays clear of other notes and the footer', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/notes/browser-start/');
  await expect(page.locator('.note-view')).toHaveAttribute('data-sidenotes', '');
  await page.locator('[id="fn:1"] p').evaluate(p => p.prepend('늦게 불러온 긴 각주 내용입니다. '.repeat(300)));
  await expect.poll(() => page.evaluate(() => {
    const notes = [...document.querySelectorAll('.footnotes > ol > li')].map(n => n.getBoundingClientRect());
    const footer = document.querySelector('.note-footer')!.getBoundingClientRect();
    return notes.every((n, i) => (!i || n.top >= notes[i - 1].bottom) && n.bottom <= footer.top);
  })).toBe(true);
  await page.setViewportSize({ width: 1599, height: 1000 });
  await expect(page.locator('.note-view')).not.toHaveAttribute('data-sidenotes');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('all connection titles and the original footnotes remain readable', async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 1000 });
    await page.goto('/notes/browser-start/');
    await expect(page.locator('[data-connection-list]')).toBeVisible();
    await expect(page.locator('.connection-switch')).toBeHidden();
    await expect(page.locator('.footnotes-title')).toBeVisible();
    await expect(page.locator('[id="fn:1"]')).toHaveCSS('position', 'static');
    await expect(page.locator('.note-side').getByRole('link', { name: '생각 지도에서 보기' })).toBeVisible();
  });
});

test('large default text keeps footnotes in the normal reading flow', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await gotoWithDefaultFontSize(page, '/notes/browser-start/', 32);
  await expect(page.locator('.note-view')).not.toHaveAttribute('data-sidenotes');
});

test('connections switch between graph and complete unique titles without showing both at once', async ({ page }) => {
  await page.goto('/notes/browser-start/');
  const region = page.locator('[data-connections]');
  await expect(region.locator('[data-connection-graph]')).toBeVisible();
  await expect(region.locator('[data-connection-list]')).toBeHidden();
  await region.getByRole('button', { name: '목록', exact: true }).press('Enter');
  await expect(region.locator('[data-connection-graph]')).toBeHidden();
  await expect(region.locator('[data-connection-list]')).toBeVisible();
  await expect(region.getByRole('link', { name: '생각 지도에서 보기' })).toBeVisible();
  const urls = await region.locator('[data-connection-list] a').evaluateAll(es => es.map(e => e.getAttribute('href')));
  expect(urls.length).toBeGreaterThan(0);
  expect(new Set(urls).size).toBe(urls.length);
  await region.getByRole('button', { name: '그래프', exact: true }).press('Enter');
  await expect(region.locator('[data-connection-list]')).toBeHidden();
});

test('the sidebar starts on the left before modules and stays there without footnotes', async ({ page }) => {
  for (const width of [1121, 1280, 1440, 1600, 1800]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/notes/browser-start/', '/notes/browser-neighbor/']) {
      await gotoBeforeModules(page, path);
      const boxes = await page.evaluate(() => ({
        side: document.querySelector('.note-side')!.getBoundingClientRect().right,
        article: document.querySelector('.note-article')!.getBoundingClientRect().left,
        overflow: document.documentElement.scrollWidth > innerWidth
      }));
      expect(boxes.side).toBeLessThan(boxes.article);
      expect(boxes.overflow).toBe(false);
    }
  }
});

test('reading widths keep body alignment and graph text size across laptop and wide screens', async ({ page }) => {
  await page.goto('/notes/browser-many/');
  for (const width of [1280, 1440, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.locator('.local-graph svg').evaluate(svg => Math.abs((svg as SVGSVGElement).getScreenCTM()!.a - 1))).toBeLessThan(.01);
    const article = await page.locator('.note-article').boundingBox();
    expect(article!.width).toBe(720);
    expect(Math.abs(article!.x + article!.width / 2 - width / 2)).toBeLessThanOrEqual(4);
  }
});

// 헤더는 모든 페이지에서 같은 자리에 있어야 목록에서 글로 들어갈 때 워드마크가 옮겨 가지 않는다.
test('the header shares the reading frame before modules and stays put across pages', async ({ page }) => {
  const header = () => page.locator('.site-header .wrap').evaluate(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
  for (const width of [1280, 1440, 1600, 1800]) {
    await page.setViewportSize({ width, height: 1000 });
    await gotoBeforeModules(page, '/notes/browser-start/');
    const frame = await page.locator('.note-view').evaluate(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
    expect(await header()).toEqual(frame);
    for (const path of ['/', '/posts/', '/about/']) {
      await page.goto(path);
      expect(await header(), path).toEqual(frame);
    }
  }
});

test('a folded callout anchors its sidenote to the summary until expanded', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/posts/browser-folded-footnote/');
  const aligned = (selector: string) => page.evaluate(selector => {
    const note = document.querySelector('[id="fn:1"]')!.getBoundingClientRect();
    const anchor = document.querySelector(selector)!.getBoundingClientRect();
    return Math.abs(note.top - anchor.top) < 2;
  }, selector);
  await expect.poll(() => aligned('details.callout > summary')).toBe(true);
  await page.locator('details.callout > summary').click();
  await expect.poll(() => aligned('[id="fnref:1"]')).toBe(true);
  await page.locator('details.callout > summary').click();
  await expect.poll(() => aligned('details.callout > summary')).toBe(true);
});

test('long connection lists keep their own height limit and direction counts', async ({ page }) => {
  await page.goto('/notes/browser-many/');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  const list = page.locator('.connection-list');
  await expect(list).toHaveCSS('max-height', '236px');
  expect(await list.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  await expect(page.locator('.connection-group h3')).toHaveText(['이 글에서 언급한 글7']);
  await expect(list.locator('a')).toHaveCount(7);
});

test('connection groups list mutual links once and omit empty directions', async ({ page }) => {
  await page.goto('/notes/browser-start/');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  const groups = page.locator('.connection-group');
  await expect(groups.locator('h3')).toHaveText([/서로 언급한 글1/, /이 글을 언급한 글\d+/]);
  await expect(groups.first().getByRole('link', { name: '이웃 노트', exact: true })).toHaveCount(1);
  const links = await groups.locator('a').evaluateAll(items => items.map(a => a.getAttribute('href')));
  expect(new Set(links).size).toBe(links.length);
  const counts = await groups.locator('.count').allTextContents();
  expect(counts.reduce((sum, count) => sum + Number(count), 0)).toBe(links.length);
});

test('switching a sticky connection view preserves the reading position', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/notes/browser-start/');
  await page.locator('.note-article .body').evaluate(body => {
    const spacer = document.createElement('p');
    spacer.style.height = '3000px';
    body.prepend(spacer);
  });
  await page.evaluate(() => scrollTo(0, 900));
  const before = await page.evaluate(() => scrollY);
  await page.getByRole('button', { name: '목록', exact: true }).click();
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.getByRole('button', { name: '그래프', exact: true }).click();
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('sidenote links stay in the muted margin color while body links keep their color', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/notes/browser-start/');
  await expect(page.locator('.note-view')).toHaveAttribute('data-sidenotes', '');
  const colors = await page.evaluate(() => {
    const item = document.querySelector('.footnotes li:has(a[href="#fn-1"])')!;
    const color = (e: Element) => getComputedStyle(e).color;
    return { item: color(item), link: color(item.querySelector('a[href="#fn-1"]')!), body: color(document.querySelector('.body p a[href="#fn-1"]')!) };
  });
  expect(colors.link).toBe(colors.item);
  expect(colors.body).not.toBe(colors.item);
});

test('small default text keeps the tablet in a single reading column', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await gotoWithDefaultFontSize(page, '/notes/browser-start/', 10);
  await expect(page.locator('.note-view')).not.toHaveAttribute('data-sidenotes');
  await expect(page.locator('[id="fn:1"]')).toHaveCSS('position', 'static');
  const article = await page.locator('.note-article').boundingBox();
  expect(article!.width).toBe(720);
  await page.setViewportSize({ width: 1120, height: 900 });
  await expect(page.locator('.note-view')).not.toHaveAttribute('data-sidenotes');
  await page.setViewportSize({ width: 1121, height: 900 });
  await expect(page.locator('.note-view')).toHaveAttribute('data-sidenotes', '');
  const side = await page.locator('.note-side').boundingBox();
  const wideArticle = await page.locator('.note-article').boundingBox();
  expect(side!.x + side!.width).toBeLessThan(wideArticle!.x);
});

// 여백 각주는 이미 번호 옆에 보이는데, 번호를 누르면 링크대로 그 항목까지 스크롤해 읽던 줄이 위로 밀렸다.
// 누른 번호와 각주는 짝으로 표시하고, 각주가 화면 밖에 있을 때만 보일 만큼 옮긴다.
test('clicking a number beside its sidenote keeps the reading position and marks the pair', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/notes/browser-start/');
  await expect(page.locator('.note-view')).toHaveAttribute('data-sidenotes', '');
  const ref = page.getByRole('link', { name: '각주 1', exact: true });
  const note = page.locator('[id="fn:1"]');
  await ref.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const before = await page.evaluate(() => scrollY);
  await ref.click();
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await expect(page).not.toHaveURL(/#fn:1$/);
  await expect(note).toHaveClass(/is-current/);
  await expect(ref).toHaveClass(/is-current/);

  // 짝 표시는 번호와 각주 어느 쪽을 가리켜도 같다. 밀려 내려간 각주도 숫자로 짝을 찾지 않아도 된다.
  await page.mouse.move(0, 0);
  await note.hover();
  await expect(ref).toHaveClass(/is-paired/);
  await page.mouse.move(0, 0);
  await expect(ref).not.toHaveClass(/is-paired/);
  await ref.hover();
  await expect(note).toHaveClass(/is-paired/);

  // 번호가 화면 아래 끝에 걸려 각주가 다 보이지 않으면 보일 만큼만 옮긴다. 짧은 검사 글이라 화면 높이를 번호 아래 끝에 맞춘다.
  await page.evaluate(() => scrollTo(0, 0));
  const refBottom = await ref.evaluate((el) => el.getBoundingClientRect().bottom);
  await page.setViewportSize({ width: 1800, height: Math.ceil(refBottom) + 8 });
  expect(await note.evaluate((el) => el.getBoundingClientRect().bottom > innerHeight)).toBe(true);
  await ref.click();
  await expect.poll(() => note.evaluate((el) => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1; })).toBe(true);
  await expect(page).not.toHaveURL(/#fn:1$/);
});
