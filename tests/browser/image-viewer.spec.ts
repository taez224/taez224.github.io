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
