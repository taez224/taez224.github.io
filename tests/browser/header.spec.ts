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

// 두 줄로 나누는 것은 넘칠 때만이다. 글자 100%에서 한 줄에 필요한 폭은 354px이므로, 흔한 좁은 휴대폰(360px)은 한 줄로 붙어 있어야 한다.
test('the header keeps one sticky row at the default text size on a common narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/books/');
  await expect(page.locator('.site-header')).toHaveCSS('position', 'sticky');
  const row = await page.evaluate(() => ({
    height: document.querySelector('.site-header .wrap')!.getBoundingClientRect().height,
    token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s-header-height')),
    wordmarkLines: (() => {
      const wordmark = document.querySelector('.wordmark')!;
      const range = document.createRange();
      range.selectNodeContents(wordmark);
      return Math.round(range.getBoundingClientRect().height / parseFloat(getComputedStyle(wordmark).fontSize));
    })()
  }));
  expect(row.height).toBe(row.token);
  expect(row.wordmarkLines, 'TaeZ가 한 줄로 남는다').toBe(1);
});

// 검색과 테마 두 버튼까지 들어가지 않는 폭에서는 메뉴를 둘째 줄로 내리고 고정을 푼다. 눌러서 줄이는 대신 자리를 내주는 쪽이다.
test('a phone too narrow for both buttons gets a two-row header that does not stay on top', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/books/');
  await expect(page.locator('.site-header')).toHaveCSS('position', 'static');
  const measured = await page.evaluate(() => {
    const wordmark = document.querySelector('.wordmark')!;
    const range = document.createRange();
    range.selectNodeContents(wordmark);
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rows: document.querySelector('.site-header .wrap')!.getBoundingClientRect().height,
      token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s-header-height')),
      wordmarkLines: Math.round(range.getBoundingClientRect().height / parseFloat(getComputedStyle(wordmark).fontSize)),
      theme: document.querySelector('[data-theme-toggle]')!.getBoundingClientRect().right
    };
  });
  expect(measured.overflow, '페이지가 가로로 넘치지 않는다').toBe(0);
  expect(measured.rows, '메뉴가 둘째 줄로 내려간다').toBeGreaterThan(measured.token);
  expect(measured.wordmarkLines, 'TaeZ가 한 줄로 남는다').toBe(1);
  expect(measured.theme, '테마 버튼이 화면 안에 있다').toBeLessThanOrEqual(320);
});

// 헤더는 첫 화면에서 띠 위에 글자만 얹히고, 본문이 밑으로 들어오기 시작하면 종이색 판이 짙어진다.
// 판이 옅으면 본문 글자가 메뉴 뒤로 비친다.
test('the header plate turns on only after the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/notes/browser-sections/');
  const plate = () => page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.site-header')!, '::before');
    const alpha = Number(style.backgroundColor.match(/[\d.]+\)$/)?.[0].replace(')', '') ?? (style.backgroundColor === 'rgba(0, 0, 0, 0)' ? 0 : 1));
    return { alpha, blur: style.backdropFilter, presence: Number(getComputedStyle(document.querySelector('.site-header')!).getPropertyValue('--header-presence')) };
  });
  const top = await plate();
  expect(top.presence, '첫 화면에서는 판을 켜지 않는다').toBeLessThan(0.05);
  expect(top.alpha).toBeLessThan(0.1);

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.site-header')!).getPropertyValue('--header-presence')) > 0.9);
  const scrolled = await plate();
  expect(scrolled.alpha, '스크롤하면 본문이 비치지 않을 만큼 짙어진다').toBeGreaterThanOrEqual(0.85);
  expect(scrolled.blur, '뒤 글자는 흐려 놓는다').toContain('blur');
});

// 헤더 아래 판은 24px 더 이어지다 사라진다. 제목으로 건너뛴 자리가 그 아래에 들어와야 가려지지 않는다.
test('a heading reached from the contents clears the header and its fading plate', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/notes/browser-sections/');
  const entries = page.locator('.note-side a[href^="#"]');
  await entries.nth(2).click();
  const measured = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(`#${CSS.escape(decodeURIComponent(location.hash.slice(1)))}`)!;
    return { heading: heading.getBoundingClientRect().top, headerBottom: document.querySelector('.site-header')!.getBoundingClientRect().bottom };
  });
  expect(measured.heading, '제목이 헤더와 그 아래 판을 지나 보인다').toBeGreaterThanOrEqual(measured.headerBottom + 24);
});
