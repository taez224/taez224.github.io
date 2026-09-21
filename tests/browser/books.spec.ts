import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
  // 테스트 내용은 로컬 임시 vault뿐이다. 분석 도구 등 외부 요청은 필요 없다.
  await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

// 등급은 한 글자라 62px 칸에 들어가지만 미분류는 세 글자다. 글자를 키우면 칸을 넘어 책 격자 위에 겹쳐 그려졌다.
// 요소 상자는 62px 그대로여서 상자만 재면 보이지 않는다. 글자가 실제로 차지한 자리를 잰다.
test('the unrated shelf label stays out of the book grid when the reader enlarges the text', async ({ page, isMobile }) => {
  test.skip(isMobile, '등급 칸과 책 격자는 721px부터 나란히 놓인다');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/books/');
  const label = page.locator('.ledger-head h2.unrated');
  await expect(label).toHaveCount(1);
  for (const size of [24, 32]) {
    await page.addStyleTag({ content: `html { font-size: ${size}px }` });
    await page.evaluate(() => document.fonts.ready);
    const gap = await label.evaluate((heading) => {
      const range = heading.ownerDocument.createRange();
      range.selectNodeContents(heading);
      const grid = heading.closest('.ledger-group')!.querySelector('.grid')!;
      return grid.getBoundingClientRect().left - range.getBoundingClientRect().right;
    });
    expect(gap, `글자 ${size}px에서 격자까지 남는 자리`).toBeGreaterThanOrEqual(0);
  }
});
