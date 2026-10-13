import { test, expect, BOTH_THEMES } from './fixtures.ts';

test('images open by keyboard, resize and restore focus', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.goto('/notes/browser-image/');
  const open = page.getByRole('button', { name: '읽기 화면 예시 크게 보기' });
  await expect(open).toBeVisible();
  const before = await open.boundingBox();
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '이미지 크게 보기' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  const image = dialog.locator('img');
  expect((await image.boundingBox())!.width).toBeLessThan(1800);
  await dialog.getByRole('button', { name: '원래 크기' }).click();
  await expect(image).toHaveCSS('width', '1800px');
  expect(await dialog.locator('.diagram-viewer-stage').evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: '전체 보기' }).click();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(async () => (await image.boundingBox())!.width).toBeLessThan(320);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(open).toBeFocused();
  await expect(page.locator('a[href="https://example.com/linked-image"] img')).toBeVisible();
  await expect(page.locator('a .image-zoom')).toHaveCount(0);
  expect(before!.width).toBeLessThanOrEqual(400);
});

test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('the original image and caption remain readable without a viewer', async ({ page }) => {
    await page.goto('/notes/browser-image/');
    await expect(page.getByRole('img', { name: '읽기 화면 예시', exact: true })).toBeVisible();
    await expect(page.locator('figcaption')).toHaveText('그림 설명은 본문에 남는다.');
    await expect(page.locator('.image-zoom')).toHaveCount(0);
  });
});

test('a later image waits until approached and its original ratio reserves space before loading', async ({ page }) => {
  let requested = false;
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/delayed.png', async (route) => {
    requested = true;
    await released;
    await route.continue();
  });
  try {
    await page.goto('/notes/browser-image-loading/');
    await page.evaluate(() => document.fonts.ready);
    const first = page.locator('.body img').first();
    const later = page.getByRole('img', { name: '뒤쪽 그림', exact: true });
    await expect(first).toHaveAttribute('loading', 'eager');
    await expect(first).toHaveAttribute('width', '400');
    await expect(first).toHaveAttribute('height', '222');
    await expect(later).toHaveAttribute('loading', 'lazy');
    await expect(later).toHaveAttribute('width', '1200');
    await expect(later).toHaveAttribute('height', '800');
    expect(requested).toBe(false);
    await later.scrollIntoViewIfNeeded();
    await expect.poll(() => requested).toBe(true);
    const measure = () => page.evaluate(() => {
      const image = document.querySelector<HTMLImageElement>('img[alt="뒤쪽 그림"]')!;
      const rect = image.getBoundingClientRect();
      return { width: rect.width, height: rect.height, next: document.querySelector('#그림-다음')!.getBoundingClientRect().top, loaded: image.naturalWidth > 0 };
    });
    const before = await measure();
    expect(before.loaded).toBe(false);
    expect(before.height).toBeGreaterThan(0);
    expect(before.width / before.height).toBeCloseTo(1.5, 2);
    release();
    await expect.poll(async () => (await measure()).loaded).toBe(true);
    const after = await measure();
    expect(after.height).toBeCloseTo(before.height, 1);
    expect(after.next).toBeCloseTo(before.next, 1);
    await later.locator('..').click();
    const dialog = page.getByRole('dialog', { name: '이미지 크게 보기' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '원래 크기' }).click();
    await expect(dialog.locator('img')).toHaveCSS('width', '1200px');
  } finally {
    release();
  }
});

test('one click during loading opens the image after it arrives without duplicate dialogs', { tag: BOTH_THEMES }, async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/delayed.png', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/notes/browser-image-loading/');
    const open = page.getByRole('button', { name: '뒤쪽 그림 크게 보기', exact: true });
    await open.click();
    await expect(open).toHaveAttribute('aria-busy', 'true');
    const status = open.locator('..').locator('.image-load-state');
    await expect(status.getByRole('status')).toHaveText('이미지를 불러오는 중…');
    await open.click();
    release();
    const dialog = page.getByRole('dialog', { name: '이미지 크게 보기' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCount(1);
    await expect(status.getByRole('status')).toBeEmpty();
    await expect(open).not.toHaveAttribute('aria-busy');
  } finally { release(); }
});

test('failed image loading offers a local retry and a successful retry opens the viewer', { tag: BOTH_THEMES }, async ({ page }) => {
  let attempts = 0;
  await page.route('**/delayed.png', route => ++attempts === 1 ? route.abort() : route.continue());
  await page.goto('/notes/browser-image-loading/');
  const open = page.getByRole('button', { name: '뒤쪽 그림 크게 보기', exact: true });
  await open.click();
  const status = open.locator('..').locator('.image-load-state');
  await expect(status.getByRole('status')).toHaveText('이미지를 불러오지 못했습니다.');
  await expect(page.getByRole('dialog', { name: '이미지 크게 보기' })).toHaveCount(0);
  const retry = status.getByRole('button', { name: '뒤쪽 그림 다시 시도', exact: true });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await retry.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '이미지 크게 보기' });
  await expect(dialog).toBeVisible();
  await expect(status.getByRole('status')).toBeEmpty();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(open).toBeFocused();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

for (const closeSearch of [false, true]) {
  test(`a pending image stays closed after search is opened${closeSearch ? ' and closed' : ''}`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/delayed.png', async route => { await gate; await route.continue(); });
    try {
      await page.goto('/notes/browser-image-loading/');
      const open = page.getByRole('button', { name: '뒤쪽 그림 크게 보기', exact: true });
      await open.click();
      await expect(open).toHaveAttribute('aria-busy', 'true');
      await page.getByRole('button', { name: '검색', exact: true }).click();
      const search = page.locator('#search');
      await expect(search).toBeVisible();
      if (closeSearch) {
        await search.getByRole('button', { name: '검색 닫기', exact: true }).click();
        await expect(search).not.toBeVisible();
      }
      release();
      await expect(open).not.toHaveAttribute('aria-busy');
      await expect(page.locator('.image-viewer')).toHaveCount(0);
      if (!closeSearch) await expect(search.getByRole('searchbox')).toBeFocused();
      else {
        // 자동 확대만 취소하며, 완료된 이미지를 다시 누르는 동작은 유지한다.
        await open.click();
        await expect(page.getByRole('dialog', { name: '이미지 크게 보기' })).toBeVisible();
      }
    } finally { release(); }
  });
}

test('an older image request stays closed after another image is viewed and closed', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/delayed.png', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/notes/browser-image-loading/');
    const slow = page.getByRole('button', { name: '뒤쪽 그림 크게 보기', exact: true });
    await slow.click();
    await expect(slow).toHaveAttribute('aria-busy', 'true');
    const first = page.getByRole('button', { name: '첫 그림 크게 보기', exact: true });
    await first.click();
    const dialog = page.getByRole('dialog', { name: '이미지 크게 보기' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    release();
    await expect(slow).not.toHaveAttribute('aria-busy');
    await expect(page.locator('.image-viewer')).toHaveCount(0);
    await expect(first).toBeFocused();
  } finally { release(); }
});

test('selecting a cancelled image again during loading reuses the load and opens one viewer', async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/delayed.png', async route => { requests++; await gate; await route.continue(); });
  try {
    await page.goto('/notes/browser-image-loading/');
    const open = page.getByRole('button', { name: '뒤쪽 그림 크게 보기', exact: true });
    await open.click();
    await expect(open).toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    const search = page.locator('#search');
    await expect(search).toBeVisible();
    await search.getByRole('button', { name: '검색 닫기', exact: true }).click();
    await expect(search).not.toBeVisible();
    await open.click();
    await open.click();
    await expect(open).toHaveAttribute('aria-busy', 'true');
    release();
    const dialog = page.getByRole('dialog', { name: '이미지 크게 보기' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCount(1);
    await expect(open).not.toHaveAttribute('aria-busy');
    expect(requests).toBe(1);
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(open).toBeFocused();
  } finally { release(); }
});
