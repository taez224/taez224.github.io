import { test, expect, BOTH_THEMES } from './fixtures.ts';

import { comics } from '../../src/content/comics.ts';

const work = comics.find(comic => comic.slug === 'soft-mana-core')!;
const workPath = `/comics/${work.slug}/`;
test('an unlisted comic opens directly and stays out of discovery', async ({ page, request }) => {
  await page.goto(workPath);
  await expect(page.getByRole('heading', { name: '말랑한 마력핵' })).toHaveCount(1);
  // 초점을 받는 트랙은 스크린 리더가 이름과 조작 안내를 읽을 수 있게 그룹으로 둔다.
  await expect(page.getByRole('group', { name: '만화 장면, 좌우 방향키로 넘기기' })).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('.comic-slide:not(.comic-end) > img')).toHaveCount(8);
  await expect(page.getByRole('status')).toHaveText('1 / 8');
  for (const url of ['/', '/data/search.json', '/rss.xml', '/sitemap-0.xml']) {
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toContain('/comics/');
  }
  await expect(page.locator('.site-nav a[href*="/comics/"]')).toHaveCount(0);
  // 그림을 크게 보는 수단이 리더뿐이면 안 되므로 브라우저의 핀치 확대를 막지 않는다.
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toMatch(/user-scalable=no|maximum-scale=1/);
});

test('the comic reader keeps navigation outside the artwork and supports theme and home navigation', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.goto(workPath);
  await expect(page.locator('.zoom-hint')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '공개 기록' })).toBeVisible();
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme === 'dark' ? 'light' : 'dark');
  await expect(page.getByRole('link', { name: 'TaeZ 홈' })).toHaveAttribute('href', '/');
  await expect(page.locator('.site-footer')).toBeVisible();
  await page.getByRole('link', { name: 'TaeZ 홈' }).click();
  await expect(page).toHaveURL('/');
});

test('the unlisted catalogue links to the work and the reader returns to the catalogue', async ({ page }) => {
  await page.goto('/comics/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const links = page.getByRole('list', { name: '만화 목록' }).getByRole('link');
  for (const [i, item] of comics.toReversed().entries()) await expect(links.nth(i)).toHaveAccessibleName(item.title);
  await page.getByRole('link', { name: /말랑한 마력핵/ }).click();
  await expect(page).toHaveURL(workPath);
  const location = page.getByRole('navigation', { name: '만화 위 탐색' });
  await expect(location.getByRole('link', { name: '만화', exact: true })).toHaveAttribute('href', '/comics/');
  await expect(location.getByRole('heading', { name: '말랑한 마력핵', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '목록으로', exact: true })).toHaveCount(1);
  await page.getByRole('navigation', { name: '만화 아래 탐색' }).getByRole('link', { name: '목록으로' }).click();
  await expect(page).toHaveURL('/comics/');
  await expect(page.getByRole('heading', { name: '만화', exact: true })).toBeVisible();
});

test('comic thumbnails show the full selected image with unchanged colors in both themes', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.goto('/comics/');
  for (const item of comics) {
    const link = page.getByRole('link', { name: item.title, exact: true });
    const image = link.locator('img');
    await expect(image).toHaveAttribute('src', item.pages[0].src);
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([1080, 1350]);
    await expect(image).toHaveCSS('filter', 'none');
    const cover = (await image.boundingBox())!;
    const card = (await link.boundingBox())!;
    expect(cover.width / cover.height).toBeCloseTo(4 / 5, 2);
    expect(card.height - cover.height).toBeLessThanOrEqual(2.1);
  }
});

test('catalogue links form a cover-only feed', async ({ page, isMobile }) => {
  await page.goto('/comics/');
  const list = page.getByRole('list', { name: '만화 목록' });
  await expect(list.locator('h2')).toHaveCount(0);
  const columns = isMobile ? 2 : 3;
  const cards = await list.locator('a').evaluateAll(elements => elements.map(e => e.getBoundingClientRect().toJSON()));
  for (const [i, card] of cards.entries()) {
    expect(card.width).toBeCloseTo(cards[0].width, 1);
    expect(card.left).toBeCloseTo(cards[i % columns].left, 1);
    expect(card.top).toBeCloseTo(cards[i - i % columns].top, 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the comic fits the phone edge to edge and only blends its paper in the light theme', { tag: BOTH_THEMES }, async ({ page, systemDark }) => {
  await page.goto(workPath);
  const image = page.locator('.comic-slide > img').first();
  const box = (await image.boundingBox())!;
  const viewport = page.viewportSize()!;
  if (viewport.width <= 720) {
    expect(box.x).toBe(0);
    expect(box.width).toBe(viewport.width);
  } else {
    expect(box.width).toBe(540);
  }
  const stage = page.locator('.comic-stage');
  const background = await stage.evaluate(element => getComputedStyle(element).backgroundImage);
  if (systemDark) expect(background).toBe('none');
  else expect(background).toContain('linear-gradient');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', systemDark ? 'light' : 'dark');
  if (systemDark) await expect(stage).toHaveCSS('background-image', /linear-gradient/);
  else await expect(stage).toHaveCSS('background-image', 'none');
  await expect(image).toHaveCSS('filter', 'none');
  await expect(page.locator('.comic-related')).toHaveCount(0);
  await expect(page.locator('.comic-reader time')).toHaveCount(0);
});

test('the ID photo comic opens on its cover and turns through twelve pages to the end slide', async ({ page }) => {
  await page.goto('/comics/id-photo/');
  const book = page.getByRole('region', { name: '만화' });
  const next = book.getByRole('button', { name: '다음 이미지' });
  const previous = book.getByRole('button', { name: '이전 이미지' });
  await expect(previous).toBeDisabled();
  for (let index = 1; index <= 12; index++) {
    if (index > 1) await next.click();
    await expect(book.getByRole('status')).toHaveText(`${index} / 12`);
    const image = book.locator('.comic-slide:not([inert]) > img');
    await expect(image).toBeInViewport({ ratio: 0.9 });
    await expect(image).toHaveAttribute('src', index === 1 ? '/comics/id-photo/cover.webp' : `/comics/id-photo/page-${index - 1}.webp`);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await next.click();
  await expect(book.getByRole('status')).toHaveText('끝');
  await expect(page).toHaveURL(/#end$/);
  await expect(next).toBeDisabled();
  // 사원증 사진은 마지막 작품이라 끝 장에는 목록으로 가는 링크 하나만 둔다.
  const end = book.getByRole('group', { name: '끝' });
  await expect(end.getByRole('link')).toHaveCount(1);
  await expect(end.getByRole('link', { name: '만화 목록' })).toHaveAttribute('href', '/comics/');
  await book.getByRole('group', { name: '끝' }).press('ArrowLeft');
  await expect(book.getByRole('status')).toHaveText('12 / 12');
});

test('the end slide leads to the next work by its first page', async ({ page }) => {
  await page.goto(`${workPath}#end`);
  const book = page.getByRole('region', { name: '만화' });
  await expect(book.getByRole('status')).toHaveText('끝');
  const nextWork = book.getByRole('link', { name: /사원증 사진/ });
  await expect(nextWork.locator('img')).toHaveAttribute('src', '/comics/id-photo/cover.webp');
  await book.getByRole('button', { name: '처음부터' }).click();
  await expect(book.getByRole('status')).toHaveText('1 / 8');
  await book.getByRole('button', { name: '이전 이미지' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(book.getByRole('status')).toHaveText('1 / 8');
  await page.goto(`${workPath}#end`);
  await book.getByRole('link', { name: /사원증 사진/ }).click();
  await expect(page).toHaveURL('/comics/id-photo/');
});

test('turning pages updates the fragment and a shared fragment opens that page', async ({ page }) => {
  await page.goto('/comics/id-photo/#page-4');
  const book = page.getByRole('region', { name: '만화' });
  await expect(book.getByRole('status')).toHaveText('4 / 12');
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const before = await page.evaluate(() => history.length);
  for (let i = 0; i < 3; i++) await book.getByRole('button', { name: '다음 이미지' }).click();
  await expect(page).toHaveURL(/#page-7$/);
  // 장마다 기록을 쌓으면 뒤로 가기가 작품을 떠나지 못한다.
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('controls stay on one line under the artwork', async ({ page, isMobile }) => {
  await page.goto(workPath);
  const book = page.getByRole('region', { name: '만화' });
  await expect(book.locator('.comic-book-controls')).toHaveCount(1);
  const image = (await book.locator('.comic-slide:not([inert]) > img').boundingBox())!;
  const parts = [book.getByRole('button', { name: '이전 이미지' }), book.getByRole('status'), book.getByRole('button', { name: '다음 이미지' })];
  const open = book.getByRole('button', { name: '크게 보기', exact: true });
  if (isMobile) await expect(open).toBeHidden();
  else parts.push(open);
  const centers = [];
  for (const part of parts) {
    const box = (await part.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(image.y + image.height);
    centers.push(box.y + box.height / 2);
  }
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(4);
});

test('the big view opens on the current page and closes back to it', async ({ page, isMobile }) => {
  test.skip(isMobile, '본문의 크게 보기 버튼은 데스크톱에서 제공한다.');
  await page.goto(workPath);
  const book = page.getByRole('region', { name: '만화' });
  const next = book.getByRole('button', { name: '다음 이미지' });
  await next.click();
  await next.click();
  await book.getByRole('button', { name: '크게 보기', exact: true }).click();
  const dialog = page.locator('dialog.comic-big[open]');
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole('status')).toHaveText('3 / 8');
  await expect(dialog.getByRole('button', { name: '크게 보기', exact: true })).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('status')).toHaveText('4 / 8');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(book.getByRole('status')).toHaveText('4 / 8');
  await expect(book.locator('.comic-slide:not([inert]) > img')).toBeInViewport({ ratio: 0.9 });
});

test('the inline artwork respects the device and the reader supports outer taps', async ({ page, isMobile }) => {
  await page.goto(workPath);
  const book = page.getByRole('region', { name: '만화' });
  const art = book.locator('.comic-slide:not([inert]) > img');
  if (isMobile) {
    await art.tap();
    await expect(page.locator('dialog.comic-big')).not.toBeVisible();
    await expect(book.getByRole('status')).toHaveText('1 / 8');
    // 휴대폰 본문에서는 그림의 좌우 3분의 1을 탭해 넘긴다. 가운데는 위에서 본 대로 그대로 둔다.
    const box = (await art.boundingBox())!;
    await art.tap({ position: { x: box.width * 0.85, y: box.height / 2 } });
    await expect(book.getByRole('status')).toHaveText('2 / 8');
    await expect(page.locator('dialog.comic-big')).not.toBeVisible();
    await art.tap({ position: { x: box.width * 0.15, y: box.height / 2 } });
    await expect(book.getByRole('status')).toHaveText('1 / 8');
    await page.goto(workPath + 'reader/');
  } else {
    await art.click();
  }
  const dialog = page.locator('dialog.comic-big[open]');
  await expect(dialog.getByRole('status')).toHaveText('1 / 8');
  const viewport = page.viewportSize()!;
  const image = (await dialog.locator('.comic-slide:not([inert]) > img').boundingBox())!;
  const y = image.y + image.height / 2;
  await page.mouse.click(viewport.width * 0.85, y);
  await expect(dialog.getByRole('status')).toHaveText('2 / 8');
  await page.mouse.click(viewport.width * 0.5, y);
  await expect(dialog.getByRole('status')).toHaveText('2 / 8');
  await page.mouse.click(viewport.width * 0.15, y);
  await expect(dialog.getByRole('status')).toHaveText('1 / 8');
});

test('edge taps rest while the page is pinch-zoomed and resume after zooming out', async ({ page, isMobile }) => {
  test.skip(!isMobile, '본문 탭 넘기기는 휴대폰 본문에만 있다.');
  // 핀치 확대를 자동화로 재현할 수 없어 배율 값만 바꾼다. 리더는 이 값으로 확대 중인지 판단한다.
  const zoom = (scale: number) => page.evaluate(value => Object.defineProperty(visualViewport!, 'scale', { configurable: true, get: () => value }), scale);
  await page.goto(workPath);
  const book = page.getByRole('region', { name: '만화' });
  const art = book.locator('.comic-slide:not([inert]) > img');
  const box = (await art.boundingBox())!;
  const right = { position: { x: box.width * 0.85, y: box.height / 2 } };
  await zoom(2);
  await art.tap(right);
  await expect(book.getByRole('status')).toHaveText('1 / 8');
  await zoom(1);
  await art.tap(right);
  await expect(book.getByRole('status')).toHaveText('2 / 8');
  await page.goto(workPath + 'reader/');
  const dialog = page.locator('dialog.comic-big[open]');
  await expect(dialog.getByRole('status')).toHaveText('1 / 8');
  const viewport = page.viewportSize()!;
  await zoom(2);
  await page.touchscreen.tap(viewport.width * 0.85, viewport.height / 2);
  await expect(dialog.getByRole('status')).toHaveText('1 / 8');
  await zoom(1);
  await page.touchscreen.tap(viewport.width * 0.85, viewport.height / 2);
  await expect(dialog.getByRole('status')).toHaveText('2 / 8');
});

test('big view controls sit directly under the artwork', async ({ page }) => {
  await page.goto(workPath + 'reader/');
  for (let i = 1; i < 3; i++) await page.keyboard.press('ArrowRight');
  const dialog = page.locator('dialog.comic-big[open]');
  const image = dialog.locator('.comic-slide:not([inert]) > img');
  await expect(image).toBeInViewport({ ratio: 1 });
  const imageBox = (await image.boundingBox())!;
  const controls = (await dialog.locator('.comic-book-controls').boundingBox())!;
  expect(controls.y - (imageBox.y + imageBox.height)).toBeGreaterThanOrEqual(0);
  expect(controls.y - (imageBox.y + imageBox.height)).toBeLessThanOrEqual(24);
});

test('big view keeps the slide across a resize', async ({ page }) => {
  await page.goto(workPath + 'reader/');
  for (let i = 1; i < 4; i++) await page.keyboard.press('ArrowRight');
  const dialog = page.locator('dialog.comic-big[open]');
  await expect(dialog.getByRole('status')).toHaveText('4 / 8');
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await expect(dialog.getByRole('status')).toHaveText('4 / 8');
  await expect(dialog.locator('.comic-slide:not([inert]) > img')).toBeInViewport({ ratio: 0.9 });
  await expect(dialog.locator('.comic-slide:not([inert]) > img')).toHaveAttribute('src', /page-4-blog\.webp$/);
});

test('links on the end slide navigate inside the big view', async ({ page }) => {
  await page.goto(workPath + 'reader/');
  const next = page.getByRole('button', { name: '다음 이미지' });
  for (let i = 0; i < work.pages.length; i++) await next.click();
  const dialog = page.locator('dialog.comic-big[open]');
  await expect(dialog.getByRole('status')).toHaveText('끝');
  await dialog.getByRole('link', { name: /사원증 사진/ }).click();
  await expect(page).toHaveURL('/comics/id-photo/');
});

test('closing the big view returns focus to its trigger', async ({ page, isMobile }) => {
  test.skip(isMobile, '본문의 크게 보기 버튼은 데스크톱에서 제공한다.');
  await page.goto(workPath);
  const open = page.getByRole('button', { name: '크게 보기', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.comic-big[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.comic-big[open]')).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('the reader route starts the big view on the cover and closes to the work page', async ({ page }) => {
  await page.goto('/comics/id-photo/reader/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/comics\/id-photo\/$/);
  const dialog = page.locator('dialog.comic-big[open]');
  await expect(dialog.getByRole('status')).toHaveText('1 / 12');
  await expect(dialog.locator('.comic-slide:not([inert]) > img')).toHaveAttribute('src', '/comics/id-photo/cover.webp');
  await dialog.getByRole('button', { name: '다음 이미지' }).click();
  await dialog.getByRole('button', { name: '다음 이미지' }).click();
  await expect(dialog.getByRole('status')).toHaveText('3 / 12');
  // 전용 주소는 늘 표지부터 열리므로 읽는 동안 조각을 붙이지 않는다. 붙이면 새로고침이나 공유한 주소가 다른 장을 연다.
  await expect(page).toHaveURL('/comics/id-photo/reader/');
  await dialog.getByRole('button', { name: '크게 보기 닫기' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL('/comics/id-photo/#page-3');
  await expect(page.getByRole('region', { name: '만화' }).getByRole('status')).toHaveText('3 / 12');
});

test('reader route ignores the shared page fragment', async ({ page }) => {
  await page.goto('/comics/id-photo/reader/#page-5');
  await expect(page.locator('dialog.comic-big[open]').getByRole('status')).toHaveText('1 / 12');
});

test('the blurred margin around the big view artwork also turns pages', async ({ page }) => {
  await page.goto(workPath + 'reader/');
  for (let i = 1; i < 3; i++) await page.keyboard.press('ArrowRight');
  const dialog = page.locator('dialog.comic-big[open]');
  await expect(dialog.getByRole('status')).toHaveText('3 / 8');
  const viewport = page.viewportSize()!;
  const image = (await dialog.locator('.comic-slide:not([inert]) > img').boundingBox())!;
  const header = (await dialog.locator('.comic-big-top').boundingBox())!;
  const above = (header.y + header.height + image.y) / 2;
  expect(image.y - (header.y + header.height)).toBeGreaterThan(8);
  await page.mouse.click(viewport.width * 0.85, above);
  await expect(dialog.getByRole('status')).toHaveText('4 / 8');
  await page.mouse.click(viewport.width * 0.15, above);
  await expect(dialog.getByRole('status')).toHaveText('3 / 8');
  // 머리줄 안을 눌러도 넘기지 않는다.
  await page.mouse.click(viewport.width * 0.85, header.y + header.height / 2);
  await expect(dialog.getByRole('status')).toHaveText('3 / 8');
  await expect(dialog).toHaveCount(1);
});

test('the ID photo spread and badge turn both ways with horizontal wheel input', async ({ page }) => {
  await page.goto('/comics/id-photo/#page-7');
  const track = page.locator('[data-comic-track]');
  const status = page.getByRole('status');
  await track.hover();
  await page.mouse.wheel(Math.round((await track.boundingBox())!.width), 0);
  await expect(status).toHaveText('8 / 12');
  await page.waitForTimeout(200);
  await expect(track).not.toHaveClass(/is-animating/);
  await page.mouse.wheel(120, 0);
  await expect(status).toHaveText('9 / 12');
  await expect(track.locator('.is-painting #reflection')).toHaveCount(1);
  const boxes = await track.locator('.is-painting').evaluate(slide => {
    const art = slide.querySelector('img')!.getBoundingClientRect();
    const layer = slide.querySelector('svg')!.getBoundingClientRect();
    return { x: layer.x - art.x, y: layer.y - art.y };
  });
  expect(Math.abs(boxes.x)).toBeLessThan(1);
  expect(Math.abs(boxes.y)).toBeLessThan(1);
  await expect(track).not.toHaveClass(/is-animating/);
  await page.mouse.wheel(-120, 0);
  await expect(status).toHaveText('8 / 12');
  await expect(track).not.toHaveClass(/is-animating/);
  await expect(track.locator('.comic-slide:not([inert]) > img')).toHaveAttribute('src', '/comics/id-photo/page-7.webp');
  await page.getByRole('button', { name: '다음 이미지' }).click();
  await expect(track).not.toHaveClass(/is-animating/);
  await page.getByRole('button', { name: '이전 이미지' }).click();
  await expect(track.locator('.is-painting #reflection')).toHaveCount(1);
  await expect(status).toHaveText('8 / 12');
});

test('motion artwork is requested only when approaching the spread', async ({ page }) => {
  const requested = new Set<string>();
  page.on('request', request => {
    if (request.url().includes('/id-photo/motion/')) requested.add(request.url());
  });
  await page.goto('/comics/id-photo/');
  await expect(page.getByRole('status')).toHaveText('1 / 12');
  expect(requested.size).toBe(0);
  await expect(page.locator('.comic-art-layer image[href]')).toHaveCount(0);
  // 6/12 바로 앞인 5/12까지는 받지 않고, 6/12에 도착해야 받기 시작한다.
  await page.goto('/comics/id-photo/#page-5');
  await expect(page.getByRole('status')).toHaveText('5 / 12');
  expect(requested.size).toBe(0);
  await page.getByRole('button', { name: '다음 이미지' }).click();
  await expect(page.getByRole('status')).toHaveText('6 / 12');
  await expect.poll(() => requested.size).toBe(5);
});

test('the spread and badge still turn as still pictures when the motion artwork never arrives', async ({ page }) => {
  await page.route('**/id-photo/motion/**', route => route.abort());
  await page.goto('/comics/id-photo/#page-7');
  const track = page.locator('[data-comic-track]');
  const status = page.getByRole('status');
  for (const [button, position] of [['다음 이미지', 8], ['다음 이미지', 9], ['이전 이미지', 8]] as const) {
    await page.getByRole('button', { name: button }).click();
    await expect(status).toHaveText(`${position} / 12`);
    await expect(track.locator('.is-painting')).toHaveCount(0);
    await expect(track).not.toHaveClass(/is-animating/);
  }
});

test('reduced motion preserves the static spread, portrait and return order', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/comics/id-photo/#page-7');
  for (const [button, position] of [['다음 이미지', 8], ['다음 이미지', 9], ['이전 이미지', 8]] as const) {
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByRole('status')).toHaveText(position + ' / 12');
    await expect(page.locator('.comic-slide:not([inert]) > img')).toBeInViewport();
    await expect(page.locator('.is-painting, .is-animating, .comic-art-layer image[href]')).toHaveCount(0);
  }
});

test('arrow keys turn the work on arrival and leave the search field alone', async ({ page }) => {
  await page.goto(workPath);
  const status = page.locator('.comic-position');
  await expect(status).toHaveText('1 / 8');
  await expect(page.locator('body')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(status).toHaveText('2 / 8');
  await expect(page).toHaveURL(workPath + '#page-2');
  await page.locator('[data-search-open]').click();
  const input = page.locator('#search input');
  await input.fill('abc');
  await input.press('End');
  await input.press('ArrowLeft');
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(2);
  await expect(status).toHaveText('2 / 8');
  await page.keyboard.press('Escape');
  await page.locator('[data-comic-track]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(status).toHaveText('1 / 8');
  // 제목을 눌러 초점이 main으로 옮겨 가도 방향키로 넘긴다.
  await page.getByRole('heading', { name: '말랑한 마력핵' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(status).toHaveText('2 / 8');
});

test('skipping to the main content keeps the page being read', async ({ page, isMobile }) => {
  test.skip(isMobile, '건너뛰기 링크는 키보드 사용자를 위한 것이다.');
  await page.goto(`${workPath}#page-5`);
  const status = page.locator('.comic-position');
  await expect(status).toHaveText('5 / 8');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('5 / 8');
  await page.keyboard.press('ArrowRight');
  await expect(status).toHaveText('6 / 8');
});

test('a cover picked from the list moves into the first page only on that entry', async ({ page }) => {
  // 전환이 실제로 일어났는지는 화면으로 단언하기 어렵다. 새 문서가 받은 전환의 ready가 이행되면 실행, 거부되면 건너뜀이다.
  await page.addInitScript(() => {
    addEventListener('pagereveal', event => {
      const transition = (event as Event & { viewTransition: ViewTransition | null }).viewTransition;
      Reflect.set(window, '__coverTransition', transition ? transition.ready.then(() => 'ran', () => 'skipped') : 'none');
    });
  });
  const outcome = () => page.evaluate(() => Reflect.get(window, '__coverTransition') as Promise<string> | string);
  await page.goto('/comics/');
  await page.getByRole('link', { name: '말랑한 마력핵' }).click();
  await expect(page).toHaveURL(workPath);
  expect(await outcome()).toBe('ran');
  await expect(page.locator('.comic-position')).toHaveText('1 / 8');
  // 읽던 장에서 목록으로 돌아갈 때는 화면 밖의 첫 장이 날아들지 않는다.
  await page.keyboard.press('ArrowRight');
  await page.getByRole('link', { name: '목록으로' }).click();
  await expect(page).toHaveURL('/comics/');
  expect(await outcome()).not.toBe('ran');
  // 뒤로 가기로 작품에 돌아온 경우도 목록에서 고른 것이 아니므로 바로 바꾼다.
  await page.goBack();
  await expect(page).toHaveURL(`${workPath}#page-2`);
  expect(await outcome()).not.toBe('ran');
  // 끝 장의 다음 만화로 넘어갈 때도 목록에서 고른 것이 아니므로 바로 바꾼다.
  await page.goto(`${workPath}#end`);
  await page.getByRole('link', { name: /사원증 사진/ }).click();
  await expect(page).toHaveURL('/comics/id-photo/');
  expect(await outcome()).not.toBe('ran');
});

test('reduced motion opens a work from the list without the cover transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    addEventListener('pagereveal', event => {
      Reflect.set(window, '__coverTransition', (event as Event & { viewTransition: ViewTransition | null }).viewTransition ? 'offered' : 'none');
    });
  });
  await page.goto('/comics/');
  await page.getByRole('link', { name: '말랑한 마력핵' }).click();
  await expect(page).toHaveURL(workPath);
  expect(await page.evaluate(() => Reflect.get(window, '__coverTransition'))).toBe('none');
});
