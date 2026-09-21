import { test as base, expect, type Page } from '@playwright/test';

// 모든 브라우저 검사가 쓰는 test다. 검사 내용은 로컬 임시 vault뿐이라 분석 도구 같은 외부 요청을 모두 막는다.
// 검사 파일마다 beforeEach로 적어 두었더니 여섯 곳에 같은 줄이 생겼다.
export const test = base.extend<{ localOnly: void }>({
  localOnly: [async ({ context, baseURL }, use) => {
    await context.route('**/*', (route) => (new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()));
    await use();
  }, { auto: true }]
});
export { expect };

// 브라우저 설정에서 기본 글자 크기를 바꾼 독자로 페이지를 연다. html에 글자 크기를 직접 넣으면 rem만 바뀌고
// 미디어 쿼리의 em은 브라우저 기본값을 따르므로 그대로 남아, 실제 설정과 다르게 움직인다.
// 설정이 먹지 않으면 검사가 아무것도 재지 않고 통과하므로 연 뒤에 뿌리 글자 크기를 확인한다.
export async function gotoWithDefaultFontSize(page: Page, url: string, px: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: Math.round((px * 13) / 16) } });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '브라우저 기본 글자 설정이 먹었다').toBe(`${px}px`);
}
