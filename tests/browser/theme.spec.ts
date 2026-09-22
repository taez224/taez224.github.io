import { test, expect } from './fixtures.ts';
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
