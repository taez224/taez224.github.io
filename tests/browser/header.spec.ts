import { test, expect, gotoBeforeModules, gotoWithDefaultFontSize } from './fixtures.ts';

// 계산된 배경색은 알파가 없으면 rgb(), 있으면 rgba()나 color(srgb ... / a) 형식으로 나온다.
const opacity = (color: string) => {
  const slashed = color.match(/\/\s*([\d.]+)\s*\)$/);
  if (slashed) return Number(slashed[1]);
  const rgba = color.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
  return rgba ? Number(rgba[1]) : 1;
};

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
    await expect(page.locator('.site-header')).not.toHaveCSS('position', 'sticky');
  }
});

// 두 줄로 나누는 것은 넘칠 때만이다. 글자 100%에서 한 줄에 필요한 폭은 346px이고 경계는 354px이므로, 흔한 좁은 휴대폰(360px)은 한 줄로 붙어 있어야 한다.
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

// 18px 기호가 44px 상자 안에서 이미 양옆으로 비어 있다. 상자 사이를 8px 더 띄웠더니 두 기호가 34px 떨어져
// 메뉴 글자 사이(28px)보다 멀었고, 헤더에서 가장 가까워야 할 둘이 가장 떨어져 보였다.
test('the search and theme buttons sit side by side without a gap', async ({ page }) => {
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/books/');
    const measured = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const glyph = (selector: string) => [...document.querySelectorAll(`${selector} svg`)].map((svg) => svg.getBoundingClientRect()).find((rect) => rect.width > 0)!;
      const range = document.createRange();
      const menus = [...document.querySelectorAll('.site-nav a span')].map((span) => { range.selectNodeContents(span); return range.getBoundingClientRect(); });
      return {
        boxes: box('.theme-toggle').left - box('.search-trigger').right,
        glyphs: glyph('.theme-toggle').left - glyph('.search-trigger').right,
        menus: menus[1].left - menus[0].right
      };
    });
    expect(measured.boxes, `${width}px에서 두 상자가 맞닿는다`).toBeCloseTo(0, 0);
    if (width === 1280) expect(measured.glyphs, '두 기호 사이가 메뉴 글자 사이보다 넓지 않다').toBeLessThanOrEqual(measured.menus);
  }
});

// 테마 버튼은 모듈 스크립트가 hidden을 풀 때 보인다. 그 전에 첫 화면이 그려져도 자리는 잡혀 있어야,
// 버튼이 나타날 때 메뉴와 검색 버튼이 밀리지 않는다. 모듈 스크립트를 걷어 느린 로딩의 첫 화면을 만든다.
test('the theme button holds its place before its script runs', async ({ page }) => {
  const layout = () => page.evaluate(() => ({
    nav: document.querySelector('.site-nav')!.getBoundingClientRect().left,
    search: document.querySelector('.search-trigger')!.getBoundingClientRect().left,
    theme: document.querySelector('.theme-toggle')!.getBoundingClientRect().width
  }));
  await page.goto('/books/');
  await expect(page.locator('[data-theme-toggle]')).toBeVisible();
  const ready = await layout();

  await gotoBeforeModules(page, '/books/');
  await expect(page.locator('html')).toHaveAttribute('data-js', '1');
  await expect(page.locator('[data-theme-toggle]'), '스크립트가 돌기 전에는 보이지 않는다').toBeHidden();
  expect(await layout(), '메뉴와 검색 버튼이 버튼이 나타난 뒤와 같은 자리에 있다').toEqual(ready);
});

// 검색과 테마 두 버튼까지 들어가지 않는 폭에서는 메뉴를 둘째 줄로 내리고 고정을 푼다. 눌러서 줄이는 대신 자리를 내주는 쪽이다.
test('a phone too narrow for both buttons gets a two-row header that does not stay on top', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/books/');
  await expect(page.locator('.site-header')).not.toHaveCSS('position', 'sticky');
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

  // 고정을 풀어도 판은 헤더를 기준으로 남아야 한다. 판의 기준이 body로 올라가면 판이 문서 전체 크기로 늘어나
  // 첫 화면의 띠를 덮는다. 데스크톱 폭에서는 헤더가 붙어 있어 드러나지 않았다.
  const plate = await page.evaluate(() => {
    const header = document.querySelector('.site-header')!;
    return { plate: parseFloat(getComputedStyle(header, '::before').height), header: header.getBoundingClientRect().height };
  });
  expect(plate.plate, '판은 헤더와 그 아래 24px까지만 덮는다').toBeCloseTo(plate.header + 24, 0);

  await page.evaluate(() => window.scrollTo(0, 400));
  const headerBottom = await page.evaluate(() => document.querySelector('.site-header')!.getBoundingClientRect().bottom);
  expect(headerBottom, '스크롤하면 헤더가 화면 위로 지나간다').toBeLessThanOrEqual(0);
});

// 헤더는 첫 화면에서 띠 위에 글자만 얹히고, 본문이 밑으로 들어오기 시작하면 종이색 판이 짙어진다.
// 판이 옅으면 본문 글자가 메뉴 뒤로 비친다.
test('the header plate turns on only after the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/notes/browser-sections/');
  const plate = () => page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.site-header')!, '::before');
    return { background: style.backgroundColor, blur: style.backdropFilter, presence: Number(getComputedStyle(document.querySelector('.site-header')!).getPropertyValue('--header-presence')) };
  });
  const top = await plate();
  expect(top.presence, '첫 화면에서는 판을 켜지 않는다').toBeLessThan(0.05);
  expect(opacity(top.background)).toBeLessThan(0.1);
  // 흐림은 색이 투명해도 걸린다. 맨 위에서 켜 두면 헤더 밑에 걸친 홈 지도의 영역 이름이 흐려졌다.
  expect(top.blur, '첫 화면에서는 흐림도 끈다').toBe('blur(0px)');

  // 본문은 스크롤 20px 안팎부터 메뉴 뒤로 들어온다. 그 전에 흐림이 다 켜져야 판의 색이 아직 옅어도 글자가 메뉴와 겹쳐 보이지 않는다.
  await page.evaluate(() => window.scrollTo(0, 20));
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.site-header')!.style.getPropertyValue('--header-blur') === '1');
  const early = await plate();
  expect(early.blur, '흐림이 먼저 다 켜진다').toBe('blur(16px)');
  expect(early.presence, '판의 색은 더 천천히 짙어진다').toBeLessThan(0.05);

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.site-header')!).getPropertyValue('--header-presence')) > 0.9);
  const scrolled = await plate();
  expect(opacity(scrolled.background), '스크롤하면 본문이 비치지 않을 만큼 짙어진다').toBeGreaterThanOrEqual(0.85);
  expect(scrolled.blur, '뒤 글자는 흐려 놓는다').toBe('blur(16px)');
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

// 판의 농도는 스크립트가 채운다. 스크립트가 없으면 채울 수 없으므로, 그때는 스크롤과 상관없이 종이색으로 가려야 본문이 메뉴 뒤로 비치지 않는다.
test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('the header stays opaque so the text below cannot show through', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/notes/browser-sections/');
    const background = await page.evaluate(() => getComputedStyle(document.querySelector('.site-header')!, '::before').backgroundColor);
    expect(opacity(background), '스크롤하지 않아도 불투명하다').toBe(1);
  });

  // 테마 버튼은 스크립트가 있어야 보인다. 숨은 버튼이 DOM에 남아 있어도, 오른쪽 끝은 검색 버튼이 테마 버튼과 같은 자리에서 맡는다.
  test('the search button takes the right edge when the theme button is hidden', async ({ page }) => {
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/books/');
      const edges = await page.evaluate(() => ({
        search: document.querySelector('.search-trigger')!.getBoundingClientRect().right,
        wrap: document.querySelector('.site-header .wrap')!.getBoundingClientRect().right,
        margin: parseFloat(getComputedStyle(document.querySelector('.search-trigger')!).marginRight)
      }));
      expect(edges.search - edges.wrap, `${width}px에서 검색 버튼 상자가 본문 끝선 밖으로 여백만큼 나간다`).toBeCloseTo(-edges.margin, 0);
      expect(edges.margin, `${width}px에서 검색 버튼이 제 음수 여백을 유지한다`).toBeLessThan(0);
    }
  });
});
