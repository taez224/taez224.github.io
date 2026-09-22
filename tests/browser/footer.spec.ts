import { test, expect } from './fixtures.ts';

// 프로필은 아이콘 링크라 글자 대신 접근 가능한 이름으로 읽는다.
const footerLinks = (page: import('@playwright/test').Page) => page.locator('.site-footer a').evaluateAll((links) =>
  links.map((link) => [link.getAttribute('aria-label') ?? link.textContent!.trim(), link.getAttribute('href')]));

// 바닥글은 지도를 뺀 모든 페이지에서 같다. 다른 곳의 프로필, 사이트 소개, RSS 순서다.
test('every page but the map ends with the same footer links', async ({ page }) => {
  await page.goto('/books/');
  const books = await footerLinks(page);
  expect(books).toEqual([['GitHub', 'https://example.com/profile'], ['이 위키에 대해', '/about/'], ['RSS', '/rss.xml']]);
  await page.goto('/notes/browser-sections/');
  expect(await footerLinks(page)).toEqual(books);
  // 로고만 있는 링크는 마우스로 올렸을 때도 이름이 보여야 한다. 헤더 검색 버튼과 같은 방식이다.
  expect(await page.locator('.site-footer .contacts a').evaluateAll((links) => links.map((link) => link.getAttribute('title')))).toEqual(['GitHub']);
  // 화면 높이에 맞춰 그리는 지도는 바닥글이 붙으면 페이지 스크롤이 생긴다.
  await page.goto('/map/');
  await expect(page.locator('.site-footer')).toHaveCount(0);
});

// 누르는 영역은 폭이 아니라 입력 방식을 따른다. 휴대폰 폭만 보면 태블릿 같은 넓은 터치 화면에서 프로필 아이콘이 40px에 머문다.
test('footer links reach 44px on touch without covering each other', async ({ page, isMobile }) => {
  test.skip(!isMobile, '누르는 영역은 손가락으로 쓰는 기기에서만 넓힌다');
  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/books/');
    const boxes = await page.locator('.site-footer a').evaluateAll((links) => links.map((link) => {
      const box = link.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    }));
    for (const box of boxes) expect(box.bottom - box.top, `${width}px 터치 화면에서 44px이다`).toBeGreaterThanOrEqual(44);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, `${width}px에서 옆 링크의 누르는 영역과 겹치지 않는다`).toBe(false);
      }
    }
  }
});

// 소개 페이지 본문 끝에도 아이콘 줄을 두었더니 바로 아래 바닥글과 같은 줄이 연달아 두 번 보였다.
test('the about page shows the profile icons once, in the footer', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.locator('.contacts')).toHaveCount(1);
  await expect(page.locator('.site-footer .contacts')).toHaveCount(1);
});
