import { test, expect, BOTH_THEMES, gotoWithDefaultFontSize } from './fixtures.ts';

test('comic navigation keeps only the current image focusable and restores focus after zoom', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.goto('/notes/browser-image/');
  const comic = page.getByRole('region', { name: '만화', exact: true });
  const viewport = comic.locator('.comic-pages');
  await expect(comic.locator('.comic-position')).toHaveText('1 / 3');
  const previous = comic.locator('.comic-previous');
  const next = comic.locator('.comic-next');
  await expect(previous).toBeVisible();
  await expect(previous).toBeDisabled();
  const previousBox = (await previous.boundingBox())!;
  const nextBox = (await next.boundingBox())!;
  await expect(comic.getByRole('button', { name: '둘째 장 크게 보기' })).toHaveCount(0);
  await comic.getByRole('button', { name: '다음 이미지' }).click();
  await expect(comic.locator('.comic-position')).toHaveText('2 / 3');
  const zoom = comic.getByRole('button', { name: '둘째 장 크게 보기' });
  await zoom.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await zoom.focus();
  await expect(zoom).toHaveCSS('outline-style', 'none');
  await expect(zoom.locator('img')).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '이미지 크게 보기' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(zoom).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(comic.locator('.comic-position')).toHaveText('3 / 3');
  await expect(viewport).toBeFocused();
  await expect(next).toBeDisabled();
  await expect(next).toBeVisible();
  await expect(next).toHaveCSS('opacity', '0.35');
  await expect(viewport).toHaveCSS('outline-style', 'none');
  await expect(comic.locator('.comic-controls')).toHaveCSS('outline-style', 'solid');
  expect((await previous.boundingBox())!.x).toBeCloseTo(previousBox.x, 1);
  expect((await next.boundingBox())!.x).toBeCloseTo(nextBox.x, 1);
  await page.keyboard.press('ArrowRight');
  await expect(comic.locator('.comic-position')).toHaveText('3 / 3');
  await page.keyboard.press('ArrowLeft');
  await expect(comic.locator('.comic-position')).toHaveText('2 / 3');
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => viewport.evaluate(e => Math.round(e.scrollLeft / e.clientWidth))).toBe(1);
  const image = comic.getByRole('img', { name: '둘째 장', exact: true });
  const box = (await image.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(1.5, 2);
  const parent = (await viewport.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(parent.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(parent.x + parent.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const nativeScrollEnd of [true, false]) {
test(`a touch swipe updates the comic ${nativeScrollEnd ? 'with' : 'without'} scrollend support`, async ({ page, context, isMobile }) => {
  test.skip(!isMobile, '실제 터치 입력은 모바일에서 확인한다.');
  if (!nativeScrollEnd) await page.addInitScript(() => {
    let prototype = Object.getPrototypeOf(document.createElement('div'));
    while (prototype) {
      delete prototype.onscrollend;
      prototype = Object.getPrototypeOf(prototype);
    }
    document.addEventListener('scrollend', event => event.stopImmediatePropagation(), true);
  });
  await page.goto('/notes/browser-image/');
  const viewport = page.locator('.comic-pages');
  await viewport.scrollIntoViewIfNeeded();
  const box = (await viewport.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const y = box.y + box.height / 2;
  const start = box.x + box.width * .8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start - box.width * .7 * step / 8, y }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.comic-position')).toHaveText('2 / 3');
  await expect(page.getByRole('dialog', { name: '이미지 크게 보기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '둘째 장 크게 보기' })).toBeVisible();
});

}

test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('all comic images stay readable in document order', async ({ page }) => {
    await page.goto('/notes/browser-image/');
    const images = page.locator('.comic img');
    await expect(images).toHaveCount(3);
    let previousBottom = 0;
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      const position = await image.evaluate(e => e.getBoundingClientRect().top + scrollY);
      expect(position).toBeGreaterThan(previousBottom);
      previousBottom = position;
    }
    await expect(page.locator('.comic button')).toHaveCount(0);
  });
});


test('enlarged text leaves the comic controls usable without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoWithDefaultFontSize(page, '/notes/browser-image/', 32);
  const comic = page.locator('.comic');
  await comic.getByRole('button', { name: '다음 이미지' }).click();
  await expect(comic.locator('.comic-position')).toHaveText('2 / 3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const previous = (await comic.getByRole('button', { name: '이전 이미지' }).boundingBox())!;
  const next = (await comic.getByRole('button', { name: '다음 이미지' }).boundingBox())!;
  expect(previous.x + previous.width).toBeLessThan(next.x);
  expect(next.width).toBeGreaterThanOrEqual(44);
  const viewport = (await comic.locator('.comic-pages').boundingBox())!;
  expect(previous.y).toBeGreaterThanOrEqual(viewport.y + viewport.height);
  expect(next.y).toBeGreaterThanOrEqual(viewport.y + viewport.height);
});

test('portrait comic pages retain the available width instead of fitting a square', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/notes/browser-image/');
  const comic = page.locator('.comic');
  await comic.getByRole('button', { name: '다음 이미지' }).click();
  await comic.getByRole('button', { name: '다음 이미지' }).click();
  const image = comic.getByRole('img', { name: '셋째 장', exact: true });
  const box = (await image.boundingBox())!;
  const viewport = (await comic.locator('.comic-pages').boundingBox())!;
  expect(box.width).toBeCloseTo(viewport.width, 0);
  expect(box.height / box.width).toBeCloseTo(1.5, 2);
  const next = (await comic.locator('.comic-controls').boundingBox())!;
  expect(next.y).toBeGreaterThanOrEqual(box.y + box.height);
});
