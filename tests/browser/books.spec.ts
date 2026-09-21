import { test, expect, gotoWithDefaultFontSize, pressedBarGaps } from './fixtures.ts';

// 등급은 한 글자라 62px 칸에 들어가지만 미분류는 세 글자다. 글자를 키우면 칸을 넘어 책 격자 위에 겹쳐 그려졌다.
// 요소 상자는 62px 그대로여서 상자만 재면 보이지 않는다. 글자가 실제로 차지한 자리를 잰다.
test('the unrated shelf label stays out of the book grid when the reader enlarges the text', async ({ page, isMobile }) => {
  test.skip(isMobile, '등급 칸과 책 격자는 721px부터 나란히 놓인다');
  await page.setViewportSize({ width: 1440, height: 900 });
  const label = page.locator('.ledger-head h2.unrated');
  for (const size of [24, 32]) {
    await gotoWithDefaultFontSize(page, '/books/', size);
    await expect(label).toHaveCount(1);
    const gap = await label.evaluate((heading) => {
      const range = heading.ownerDocument.createRange();
      range.selectNodeContents(heading);
      const grid = heading.closest('.ledger-group')!.querySelector('.grid')!;
      return grid.getBoundingClientRect().left - range.getBoundingClientRect().right;
    });
    expect(gap, `글자 ${size}px에서 격자까지 남는 자리`).toBeGreaterThanOrEqual(0);
  }
});

// 페이지 끝에 홀로 있는 출처 링크가 터치에서 14px이었다. 아래는 페이지 여백뿐이라 넓힐 자리가 있다.
test('the source link at the end of the shelf reaches 44px on touch', async ({ page, isMobile }) => {
  test.skip(!isMobile, '누르는 영역은 터치 기기에서만 넓힌다');
  await page.goto('/books/');
  expect(await page.locator('.book-source a').evaluate((link) => link.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});

// 누르는 영역을 44px로 키우면 선택 막대가 버튼 바닥에 붙어 글자와 13px 떨어졌다. 헤더의 막대는 구분선에 얹히지만
// 이 막대는 얹힐 선이 없어 허공에 떠 보인다. 마우스에서처럼 글자 바로 아래에 둔다.
test('the pressed filter bar sits right under its text on touch', async ({ page, isMobile }) => {
  test.skip(!isMobile, '버튼이 글자보다 높아지는 것은 터치 기기에서다');
  await page.goto('/books/');
  const bar = await page.locator('.status-filter button[aria-pressed="true"]').evaluate(pressedBarGaps);
  expect(bar.height, '터치에서 버튼을 44px로 키웠다').toBeGreaterThanOrEqual(44);
  expect(Math.abs(bar.stretched - bar.natural), '막대가 버튼 높이와 상관없이 글자 아래 같은 자리에 있다').toBeLessThanOrEqual(0.5);
});
