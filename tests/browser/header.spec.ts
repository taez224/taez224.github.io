import { test, expect, gotoWithDefaultFontSize } from './fixtures.ts';

// 머리글은 한 줄로 설계했고 글자 100%에서는 307px이면 들어간다. 기본 글자를 두 배로 키우면 489px이 필요해
// 390px에서 넘쳤다. 워드마크가 한 글자 폭으로 짓눌려 세로로 쌓이고, 공유·검색은 화면 밖으로 밀려 페이지 전체가 가로로 흔들렸다.
test('the header fits the screen when the reader doubles the default text size', async ({ page }) => {
  // 320px에서는 메뉴가 둘째 줄에서도 넘쳐 메뉴끼리 줄을 한 번 더 바꾼다.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoWithDefaultFontSize(page, '/books/', 32);
    const measured = await page.evaluate(() => {
      const right = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().right;
      const wordmark = document.querySelector('.wordmark')!;
      const range = document.createRange();
      range.selectNodeContents(wordmark);
      return {
        width: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        search: right('.search-trigger'),
        lastMenu: right('.site-nav a:last-child'),
        wordmarkLines: Math.round(range.getBoundingClientRect().height / parseFloat(getComputedStyle(wordmark).fontSize))
      };
    });
    expect(measured.overflow, `${width}px에서 페이지가 가로로 넘치지 않는다`).toBe(0);
    expect(measured.search, `${width}px에서 검색 버튼이 화면 안에 있다`).toBeLessThanOrEqual(measured.width);
    expect(measured.lastMenu, `${width}px에서 마지막 메뉴가 화면 안에 있다`).toBeLessThanOrEqual(measured.width);
    expect(measured.wordmarkLines, `${width}px에서 TaeZ가 한 줄로 남는다`).toBe(1);
    // 두 줄이 된 머리글이 화면 위에 계속 붙어 있으면 제목으로 건너뛴 자리가 그 아래에 가린다.
    await expect(page.locator('.site-header')).toHaveCSS('position', 'static');
  }
});

// 두 줄로 나누는 것은 넘칠 때만이다. 글자 100%에서는 320px 휴대폰에서도 한 줄로 화면 위에 붙어 있어야 한다.
test('the header keeps one sticky row at the default text size on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/books/');
  await expect(page.locator('.site-header')).toHaveCSS('position', 'sticky');
  const row = await page.evaluate(() => ({
    height: document.querySelector('.site-header .wrap')!.getBoundingClientRect().height,
    token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s-header-height'))
  }));
  expect(row.height).toBe(row.token);
});
