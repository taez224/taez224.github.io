import { test, expect, gotoWithDefaultFontSize, BOTH_THEMES } from './fixtures.ts';

type Page = import('@playwright/test').Page;

// 화면에 보이는 제보 링크가 놓인 자리를 문서 순서대로 읽는다. 닫힌 목차 판과 CSS로 숨긴 자리는 빠진다.
const PLACES = '.rail-feedback, .toc-head, .note-footer, .article-end, .site-footer, .page-head, .map-start-end';
const shownPlaces = (page: Page) => page.locator('.feedback-link').evaluateAll((links, places) =>
  links.filter((link) => link.checkVisibility()).map((link) => link.closest(places)!.className.split(' ')[0]), PLACES);
const query = async (page: Page, selector: string) => Object.fromEntries(new URL((await page.locator(selector).getAttribute('href'))!).searchParams);
const boxOf = (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
  const box = element.getBoundingClientRect();
  return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
});
// 본문의 끝이 화면에 오게 내린다. 마지막 절을 읽는 자리다.
const scrollToBodyEnd = (page: Page) => page.evaluate(() => {
  const body = document.querySelector('.note-article .body')!;
  window.scrollTo({ top: body.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.4, behavior: 'instant' });
});

// 링크는 독자가 보던 페이지의 주소를 폼에 채운다. 주소를 알 수 없는 페이지는 주소 칸을 비운다. 제목은 독자가 적도록 채우지 않는다.
test('each feedback link fills the form with the page it sits on', async ({ page }) => {
  await page.goto('/notes/browser-sections/');
  expect(await query(page, '.note-footer .feedback-link')).toEqual({ template: 'feedback.yml', page: 'https://taez224.github.io/notes/browser-sections/' });
  const hrefs = await page.locator('.feedback-link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(new Set(hrefs).size, '한 페이지의 세 자리는 같은 주소를 연다').toBe(1);
  expect(hrefs).toHaveLength(3);
  await page.goto('/map/');
  expect((await query(page, '.page-head .feedback-link')).page).toBe('https://taez224.github.io/map/');
  await page.goto('/');
  expect(await query(page, '.site-footer .feedback-link')).toEqual({ template: 'feedback.yml', page: 'https://taez224.github.io/' });
  await page.goto('/404.html');
  expect(await query(page, '.site-footer .feedback-link'), '찾던 주소는 빌드 때 알 수 없다').toEqual({ template: 'feedback.yml' });
});

// 글 페이지는 읽는 도중의 자리 하나와 글 끝 줄 하나를 보인다. 읽는 도중의 자리는 두 열에서 목차 아래, 한 열에서 목차 판의 제목 줄이다.
// 창을 줄이거나 넓혀도 둘이 함께 보이거나 함께 사라지지 않아야 한다.
test('crossing the one-column width swaps the reading-time link without losing or doubling it', async ({ page, isMobile }) => {
  test.skip(isMobile, '창 폭을 바꾸는 검사라 데스크톱에서만 본다');
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/notes/browser-sections/');
  expect(await shownPlaces(page)).toEqual(['rail-feedback', 'note-footer']);

  await page.setViewportSize({ width: 900, height: 800 });
  await scrollToBodyEnd(page);
  await expect(page.locator('.toc-button')).toBeVisible();
  expect(await shownPlaces(page), '판을 열기 전에는 글 끝 줄만 있다').toEqual(['note-footer']);
  await page.locator('.toc-button').click();
  await expect(page.locator('#toc-sheet')).toBeVisible();
  expect(await shownPlaces(page)).toEqual(['note-footer', 'toc-head']);

  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('#toc-sheet')).toBeHidden();
  expect(await shownPlaces(page), '판을 연 채로 넓혀도 판의 링크가 남지 않는다').toEqual(['rail-feedback', 'note-footer']);
});

// 지도는 화면 높이에 맞춰 그려서 넓은 화면에는 아래에 줄을 더할 자리가 없다. 한 열에서는 제목 줄에 링크까지 두면 제목과 집계가 접힌다.
test('the map shows its feedback link beside the title when wide and after the start lists in one column', async ({ page, isMobile }) => {
  test.skip(isMobile, '창 폭을 바꾸는 검사라 데스크톱에서만 본다');
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/map/');
  expect(await shownPlaces(page)).toEqual(['page-head']);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), '제목 줄의 링크가 페이지 스크롤을 만들지 않는다').toBeLessThanOrEqual(0);
  const head = await page.evaluate(() => [...document.querySelector('.page-head')!.children].map((child) => child.getBoundingClientRect().height));
  await page.setViewportSize({ width: 900, height: 800 });
  expect(await shownPlaces(page)).toEqual(['map-start-end']);
  await page.setViewportSize({ width: 1100, height: 800 });
  expect(await shownPlaces(page)).toEqual(['page-head']);
  expect(await page.evaluate(() => [...document.querySelector('.page-head')!.children].map((child) => child.getBoundingClientRect().height)), '제목 줄이 접히지 않는다').toEqual(head);
});

test('a phone keeps the map title on one line and ends the page with the feedback link', async ({ page, isMobile }) => {
  test.skip(!isMobile, '휴대폰 폭만 본다');
  await page.goto('/map/');
  const title = await page.locator('.page-head h1').evaluate((heading) => ({ height: heading.getBoundingClientRect().height, line: parseFloat(getComputedStyle(heading).lineHeight) }));
  expect(title.height, '제목이 한 줄이다').toBeLessThan(title.line * 1.5);
  expect(await shownPlaces(page)).toEqual(['map-start-end']);
  const link = await boxOf(page, '.map-start-end .feedback-link');
  const list = await boxOf(page, '.map-start .list-block:last-of-type');
  expect(link.bottom - link.top, '누르는 영역 44px').toBeGreaterThanOrEqual(44);
  expect(link.top, '위 목록을 덮지 않는다').toBeGreaterThanOrEqual(list.bottom);
});

// 판 전체를 스크롤하면, 목차가 판보다 긴 글의 후반에서 열었을 때 현재 절까지 내려가면서 제목과 제보 링크가 위로 가려진다.
// 제목 줄은 남기고 목록만 스크롤한다. 낮은 화면에서 판이 목차보다 짧아진다.
test('the contents sheet keeps its title row and feedback link while the list scrolls to the current section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 300 });
  await page.goto('/notes/browser-sections/');
  await scrollToBodyEnd(page);
  const button = page.locator('.toc-button'), sheet = page.locator('#toc-sheet');
  await expect(button).toBeVisible();
  await button.click();
  await expect(sheet).toBeVisible();
  const current = sheet.locator('a[aria-current="location"]');
  await expect(current).toHaveCount(1);
  const measured = await page.evaluate(() => {
    const at = (selector: string) => { const box = document.querySelector(selector)!.getBoundingClientRect(); return { top: box.top, bottom: box.bottom }; };
    const list = document.querySelector<HTMLElement>('.toc-scroll')!;
    return { sheet: at('#toc-sheet'), title: at('.toc-head .meta'), link: at('.toc-head .feedback-link'), list: at('.toc-scroll'), current: at('#toc-sheet a[aria-current="location"]'),
      overflow: list.scrollHeight - list.clientHeight, listScroll: list.scrollTop, sheetScroll: document.getElementById('toc-sheet')!.scrollTop };
  });
  expect(measured.overflow, '이 높이에서는 목차가 판보다 길다').toBeGreaterThan(0);
  expect(measured.listScroll, '목록이 현재 절까지 내려갔다').toBeGreaterThan(0);
  expect(measured.sheetScroll, '판 자체는 내려가지 않는다').toBe(0);
  for (const [name, box] of [['제목', measured.title], ['제보 링크', measured.link]] as const) {
    expect(box.top, `${name}이 판 안에 남는다`).toBeGreaterThanOrEqual(measured.sheet.top);
    expect(box.bottom, `${name}이 목록 위에 있다`).toBeLessThanOrEqual(measured.list.top);
  }
  expect(measured.current.top, '현재 절이 목록 안에 보인다').toBeGreaterThanOrEqual(measured.list.top - 1);
  expect(measured.current.bottom).toBeLessThanOrEqual(measured.list.bottom + 1);
  // 현재 절의 막대는 레일의 왼쪽 선 위에 겹쳐 그린다. 스크롤 상자가 레일이면 이 막대가 잘린다.
  expect(await current.evaluate((link) => { const box = link.getBoundingClientRect(); return document.elementFromPoint(box.left + 1, box.top + box.height / 2) === link; }), '현재 절의 막대가 잘리지 않는다').toBe(true);
});

// 목차가 없는 짧은 글은 읽는 도중의 자리가 없고 글 끝 줄만 있다. 목록 링크가 없는 생각 노트는 그 줄에 제보 링크만 왼쪽에 둔다.
test('the end row puts the feedback link at the right of the list link, or alone at the left', async ({ page }) => {
  await page.goto('/notes/browser-neighbor/');
  expect(await shownPlaces(page)).toEqual(['note-footer']);
  await expect(page.locator('.note-footer a')).toHaveCount(1);
  const alone = await boxOf(page, '.note-footer .feedback-link'), row = await boxOf(page, '.note-footer');
  expect(alone.left, '혼자일 때는 줄의 왼쪽에서 시작한다').toBeCloseTo(row.left, 0);

  for (const [path, end] of [['/posts/browser-series-part/', '.note-footer'], ['/posts/browser-external/', '.article-end']]) {
    await page.goto(path);
    expect(await shownPlaces(page), `${path}는 글 끝 줄에만 둔다`).toEqual([end.slice(1)]);
    const back = await boxOf(page, `${end} a:first-child`), link = await boxOf(page, `${end} .feedback-link`), line = await boxOf(page, end);
    expect(back.left, `${path}: 목록 링크는 왼쪽`).toBeCloseTo(line.left, 0);
    expect(link.right, `${path}: 제보 링크는 오른쪽 끝`).toBeCloseTo(line.right, 0);
    expect(link.left, `${path}: 두 링크가 겹치지 않는다`).toBeGreaterThan(back.right);
  }
});

// 글자를 키우거나 폭이 좁으면 두 링크가 한 줄에 들어가지 않는다. 내려간 제보 링크도 오른쪽 끝에 있어야 한 줄일 때와 자리가 같다.
// 320px에서는 두 줄의 링크가 가로로 겹친다. 터치에서 넓힌 영역이 세로로도 겹치면 목록 링크의 아래쪽을 눌러도 제보 폼이 열린다.
test('a wrapped end row keeps the feedback link at the right end with the two tap areas apart', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [path, end] of [['/posts/browser-series-part/', '.note-footer'], ['/posts/browser-external/', '.article-end']]) {
      await gotoWithDefaultFontSize(page, path, 32);
      const back = await boxOf(page, `${end} a:first-child`), link = await boxOf(page, `${end} .feedback-link`), line = await boxOf(page, end);
      const where = `${width}px ${path}`;
      expect(link.top, `${where}: 이 크기에서는 둘째 줄로 내려간다`).toBeGreaterThan((back.top + back.bottom) / 2);
      expect(link.right, `${where}: 내려간 링크도 오른쪽 끝이다`).toBeCloseTo(line.right, 0);
      expect(link.left < back.right && back.left < link.right && link.top < back.bottom && back.top < link.bottom, `${where}: 두 링크의 누르는 영역이 겹치지 않는다`).toBe(false);
    }
  }
});

// 링크가 글 줄 안에 놓이는 자리(목차 아래, 지도의 끝 줄)에서는 포커스 윤곽선이 글자와 화살표의 상자를 따라 그려진다.
// 화살표 상자가 줄 높이만큼 크면 글자 상자 위아래로 나가, 윤곽선이 화살표에서 한 단 튀어나온다.
test('the arrow stays within the text box so the focus outline is one rectangle', { tag: BOTH_THEMES }, async ({ page, isMobile }) => {
  test.skip(isMobile, '터치에서는 링크가 상자로 바뀌어 윤곽선이 그 상자를 따른다');
  for (const [width, path, selector] of [[1100, '/notes/browser-sections/', '.rail-feedback .feedback-link'], [900, '/map/', '.map-start-end .feedback-link']] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(path);
    const link = page.locator(selector);
    await expect(link, `${selector}: 글 줄 안의 링크다`).toHaveCSS('display', 'inline');
    const label = await boxOf(page, `${selector} .feedback-label`), arrow = await boxOf(page, `${selector} .feedback-arrow`);
    expect(arrow.top, `${selector}: 화살표가 글자 상자 위로 나가지 않는다`).toBeGreaterThanOrEqual(label.top - 0.5);
    expect(arrow.bottom, `${selector}: 화살표가 글자 상자 아래로 나가지 않는다`).toBeLessThanOrEqual(label.bottom + 0.5);
  }
});

// 누르는 영역은 44px이고 이웃을 덮지 않는다. 목차 판의 제목 줄은 위로 판의 안쪽 여백, 아래로 목록까지의 간격만큼만 넓힌다.
test('feedback links are large enough to tap without covering their neighbours', async ({ page, isMobile }) => {
  test.skip(!isMobile, '누르는 영역은 손가락으로 쓰는 기기에서만 넓힌다');
  await page.goto('/posts/browser-series-part/');
  const end = await page.locator('.note-footer a').evaluateAll((links) => links.map((link) => { const box = link.getBoundingClientRect(); return { height: box.height, left: box.left, right: box.right }; }));
  expect(end).toHaveLength(2);
  for (const box of end) expect(box.height, '글 끝 줄의 링크는 44px이다').toBeGreaterThanOrEqual(44);
  expect(end[1].left).toBeGreaterThan(end[0].right);

  await page.goto('/notes/browser-sections/');
  await scrollToBodyEnd(page);
  await page.locator('.toc-button').tap();
  await expect(page.locator('#toc-sheet')).toBeVisible();
  const link = await boxOf(page, '.toc-head .feedback-link'), first = await boxOf(page, '#toc-sheet .toc-rail a:first-child'), sheet = await boxOf(page, '#toc-sheet');
  expect(link.bottom - link.top, '목차 판의 링크는 44px이다').toBeGreaterThanOrEqual(44);
  expect(link.top, '판 밖으로 나가지 않는다').toBeGreaterThanOrEqual(sheet.top);
  expect(link.bottom, '첫 목차 줄을 덮지 않는다').toBeLessThanOrEqual(first.top);

  // 넓은 터치 화면(가로로 든 태블릿)은 두 열이라 목차 아래의 링크를 쓴다.
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/notes/browser-sections/');
  const rail = await boxOf(page, '.rail-feedback .feedback-link'), last = await boxOf(page, '.rail a:last-child'), next = await boxOf(page, '.rail-feedback + *');
  expect(rail.bottom - rail.top, '목차 아래의 링크는 44px이다').toBeGreaterThanOrEqual(44);
  expect(rail.top, '마지막 목차 줄을 덮지 않는다').toBeGreaterThanOrEqual(last.bottom);
  expect(rail.bottom, '다음 블록을 덮지 않는다').toBeLessThanOrEqual(next.top);
});
