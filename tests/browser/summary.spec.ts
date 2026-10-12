import { test, expect } from './fixtures.ts';

type Locator = import('@playwright/test').Locator;

// 글 목록, 연결 설명 없는 글 카드, 홈 최근 연재는 요약을 문장으로 자르지 않고 전체를 넣은 뒤 세 줄까지만 보인다.
// 둘째 문장이 들어 있는지, 보이는 높이가 세 줄인지, 넘친 글이 잘렸는지를 함께 본다. 줄 수는 폭과 글꼴이 정하므로 실제 배치에서 잰다.
async function expectFullSummaryInThreeLines(summary: Locator) {
  const measured = await summary.evaluate((el) => ({
    text: el.textContent ?? '',
    lines: el.clientHeight / parseFloat(getComputedStyle(el).lineHeight),
    clipped: el.scrollHeight > el.clientHeight + 1
  }));
  expect(measured.text).toContain('둘째 문장은');
  expect(measured.lines).toBeCloseTo(3, 1);
  expect(measured.clipped).toBe(true);
}

test('the post list shows the whole summary up to three lines', async ({ page }) => {
  await page.goto('/posts/');
  await expectFullSummaryInThreeLines(page.locator('.ledger-row', { has: page.locator('a[href="/posts/browser-summary-card/"]') }).locator('.summary'));
});

test('an article card without a connection reason shows the whole target summary up to three lines', async ({ page }) => {
  await page.goto('/posts/browser-long-toc/');
  await expectFullSummaryInThreeLines(page.locator('.article-card-link[href="/posts/browser-summary-card/"] .article-card-summary'));
});

test('the latest series on the home page shows the whole summary up to three lines', async ({ page }) => {
  await page.goto('/');
  await expectFullSummaryInThreeLines(page.locator('.series-copy p'));
});
