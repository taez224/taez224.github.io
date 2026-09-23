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

// 모듈 스크립트가 돌기 전의 첫 화면으로 페이지를 연다. 느린 연결에서는 모듈을 받는 동안 첫 페인트가 먼저 일어난다.
// 스크립트 요청을 막는 방식은 작은 스크립트가 HTML 안에 들어가면 그대로 돌아 재현되지 않으므로, 문서에서 type="module" 스크립트를 걷어 낸다.
// 첫 페인트 전에 도는 인라인 부트 스크립트는 일반 스크립트라 남는다.
export async function gotoBeforeModules(page: Page, url: string): Promise<void> {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const body = (await response.text()).replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '');
    await route.fulfill({ response, body });
  });
  await page.goto(url);
  expect(await page.locator('script[type="module"]').count(), '모듈 스크립트를 모두 걷어 냈다').toBe(0);
}

// 선택 막대(::after)의 위쪽과 버튼 글자의 아래쪽 사이 간격을, 터치용으로 키운 높이와 글자 높이 그대로에서 한 번씩 잰다.
// 둘이 같으면 막대가 버튼 바닥이 아니라 글자를 따라간다. 가상 요소는 좌표를 직접 읽을 수 없어 계산된 bottom과 높이로 구한다.
export function pressedBarGaps(button: HTMLElement): { height: number; stretched: number; natural: number } {
  const gap = () => {
    const bar = getComputedStyle(button, '::after');
    const barTop = button.getBoundingClientRect().bottom - parseFloat(bar.bottom) - parseFloat(bar.height);
    const range = button.ownerDocument.createRange();
    range.selectNodeContents(button);
    return barTop - range.getBoundingClientRect().bottom;
  };
  const height = button.getBoundingClientRect().height;
  const stretched = gap();
  const saved = button.style.minHeight;
  button.style.minHeight = '0';
  const natural = gap();
  button.style.minHeight = saved;
  return { height, stretched, natural };
}
