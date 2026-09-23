import { test, expect, gotoBeforeModules } from './fixtures.ts';
import { PALETTE, DARK_PALETTE } from '../../src/lib/palette.ts';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;
const systemDark = (info: { project: { use: { colorScheme?: string | null } } }) => info.project.use.colorScheme === 'dark';

test('the first visit follows the system setting and the button remembers the reader choice', async ({ page }, info) => {
  const dark = systemDark(info);
  await page.goto('/books/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const root = page.locator('html');
  await expect(root, '선택이 없으면 시스템 설정을 따른다').toHaveAttribute('data-theme', dark ? 'dark' : 'light');

  await page.locator('[data-theme-toggle]').click();
  await expect(root).toHaveAttribute('data-theme', dark ? 'light' : 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(dark ? PALETTE.paper : DARK_PALETTE.paper));
  // 도표와 브라우저 UI 색은 CSS 변수를 읽지 못해 스크립트가 따로 맞춘다.
  const meta = await page.locator('meta[name="theme-color"]').first().getAttribute('content');
  expect(meta?.toLowerCase()).toBe(dark ? PALETTE.paper : DARK_PALETTE.paper);

  // 고른 화면은 다음 페이지에서도 유지되고, 읽는 도중 시스템 설정을 다시 보지 않는다.
  await page.goto('/posts/');
  await expect(root).toHaveAttribute('data-theme', dark ? 'light' : 'dark');
});

// 브라우저 UI 색 메타는 시스템 설정에 따라 하나가 뽑힌다. 시스템과 다른 화면을 고른 독자는 모듈 스크립트가 돌 때까지
// 휴대폰 상단 색이 본문과 달랐다. 모듈 스크립트를 걷어 첫 페인트 전의 부트 스크립트만 돈 상태를 본다.
test('the browser UI color follows the stored choice before the module script runs', async ({ page }, info) => {
  const dark = systemDark(info);
  await page.addInitScript((theme) => localStorage.setItem('theme', theme), dark ? 'light' : 'dark');
  await gotoBeforeModules(page, '/books/');
  const paper = dark ? PALETTE.paper : DARK_PALETTE.paper;
  const colors = await page.locator('meta[name="theme-color"]').evaluateAll((metas) => metas.map((meta) => meta.getAttribute('content')));
  expect(colors, '두 메타가 고른 화면의 종이색이다').toEqual([paper, paper]);
});

test('a blocked storage falls back to the system setting instead of failing', async ({ page }, info) => {
  const dark = systemDark(info);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
  });
  await page.goto('/books/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(dark ? DARK_PALETTE.paper : PALETTE.paper));
});

// 스크립트가 없으면 data-theme이 붙지 않는다. 이때만 CSS의 미디어 쿼리가 시스템 설정을 따른다.
test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('the page still follows the system setting', async ({ page }, info) => {
    const dark = systemDark(info);
    await page.goto('/books/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    await expect(page.locator('body')).toHaveCSS('background-color', rgb(dark ? DARK_PALETTE.paper : PALETTE.paper));
    await expect(page.locator('[data-theme-toggle]'), '스크립트 없이 동작하지 않는 버튼은 보이지 않는다').toBeHidden();
  });
});

// 도표 모듈은 본문보다 늦게 올라온다. 그 전에 들어온 전환을 놓치면 본문만 색이 바뀌고 도표는 옛 색으로 남는다.
test('a theme change that arrives before the diagram script still reaches the diagrams', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-light', '도표 렌더는 한 환경에서만 확인한다');
  const fills = () => [...document.querySelectorAll('.mermaid svg')].map((svg) => {
    const shape = svg.querySelector('rect, polygon, circle');
    return shape ? getComputedStyle(shape).fill : null;
  });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/notes/browser-diagram/');
  await expect(page.locator('.mermaid svg')).toHaveCount(1);
  const expected = await page.evaluate(fills);

  const raced = await page.context().newPage();
  // 문서를 읽자마자, 즉 도표 모듈이 올라오기 전에 전환이 들어온 상황을 만든다.
  await raced.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    addEventListener('DOMContentLoaded', () => {
      document.documentElement.dataset.theme = 'dark';
      document.dispatchEvent(new CustomEvent('themechange', { detail: 'dark' }));
    });
  });
  await raced.goto('/notes/browser-diagram/');
  await expect(raced.locator('.mermaid svg')).toHaveCount(1);
  await expect.poll(() => raced.evaluate(fills), { message: '도표가 고른 화면의 색으로 다시 그려진다' }).toEqual(expected);
  await raced.close();
});

// 전환은 버튼을 누를 때만이다. 지원하지 않는 브라우저와 움직임을 줄인 독자에게는 기다림 없이 바로 바뀌어야 한다.
const countTransitions = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    (window as unknown as { transitions: number }).transitions = 0;
    const start = document.startViewTransition?.bind(document);
    if (start) {
      document.startViewTransition = ((update: () => void) => {
        (window as unknown as { transitions: number }).transitions += 1;
        return start(update);
      }) as typeof document.startViewTransition;
    }
  });
};

test('pressing the button animates the switch once', async ({ page }) => {
  await countTransitions(page);
  await page.goto('/books/');
  test.skip(!(await page.evaluate(() => typeof document.startViewTransition === 'function')), '이 브라우저는 화면 전환을 지원하지 않는다');
  const before = await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark');
  expect(await page.evaluate(() => (window as unknown as { transitions: number }).transitions), '누를 때 한 번만 전환한다').toBe(1);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the switch happens without an animation', async ({ page }) => {
    await countTransitions(page);
    await page.goto('/books/');
    const before = await page.locator('html').getAttribute('data-theme');
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark');
    expect(await page.evaluate(() => (window as unknown as { transitions: number }).transitions), '전환 없이 바로 바꾼다').toBe(0);
  });
});

// 전환 콜백이 도는 사이에 한 번 더 누르면, 누른 시점에 계산한 값이 둘 다 같아 한 번만 바뀔 수 있다.
// 느린 기기에서 일어나는 순서를 확정적으로 만들려고 전환 콜백을 늦춘다.
test('two presses during one transition end where they started', async ({ page }) => {
  await page.addInitScript(() => {
    document.startViewTransition = ((update: () => void) => {
      setTimeout(update, 250);
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: () => {} };
    }) as typeof document.startViewTransition;
  });
  await page.goto('/books/');
  const root = page.locator('html');
  const before = await root.getAttribute('data-theme');
  const button = page.locator('[data-theme-toggle]');
  await button.click();
  await button.click();
  await page.waitForTimeout(800);
  await expect(root, '두 번 누르면 제자리로 돌아온다').toHaveAttribute('data-theme', before!);
});
