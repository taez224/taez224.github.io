import { test, expect, gotoWithDefaultFontSize } from './fixtures.ts';
import { PALETTE, DARK_PALETTE } from '../../src/lib/palette.ts';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

// 형광 표시의 글자색을 비워 두면 브라우저 기본값인 검정이 되어, 어두운 화면의 형광 위에서 2.49:1로 읽기 어려웠다.
test('highlighted text keeps the ink color on the highlight in both themes', async ({ page }, info) => {
  const dark = info.project.use.colorScheme === 'dark';
  await page.goto('/notes/browser-neighbor/');
  const mark = page.locator('.body mark').first();
  await expect(mark).toHaveText('형광으로 칠한 말');
  await expect(mark).toHaveCSS('color', rgb(dark ? DARK_PALETTE.ink : PALETTE.ink));
});

test('adjacent footnotes have their own space and open the intended note', async ({ page, isMobile }) => {
  await page.goto('/notes/browser-start/');
  const first = page.getByRole('link', { name: '각주 1', exact: true });
  const second = page.getByRole('link', { name: '각주 2', exact: true });
  const a = await first.boundingBox(); const b = await second.boundingBox();
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x);
  // 번호는 글자에 붙어 있고, 누르는 영역은 위아래로만 넓다. 번호 바로 위·아래를 눌러도 그 번호이고, 오른쪽 옆은 다음 번호다.
  const hit = (x: number, y: number) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('a')?.getAttribute('aria-label') ?? '', [x, y]);
  expect(a!.width).toBeLessThan(20);
  expect(await hit(a!.x + a!.width / 2, a!.y - 4)).toBe('각주 1');
  expect(await hit(a!.x + a!.width / 2, a!.y + a!.height + 7)).toBe('각주 1');
  expect(await hit(b!.x + 2, b!.y + b!.height / 2)).toBe('각주 2');
  // 강제 클릭 없이 실제 hit testing을 거쳐 인접 번호의 중심을 누른다.
  if (isMobile) await first.tap(); else await first.click();
  await expect(page.locator('.footnote-panel')).toContainText('첫 각주 내용');
  if (isMobile) await second.tap(); else await second.click();
  await expect(page.locator('.footnote-panel')).toContainText('둘째 각주 내용');
  await page.getByRole('link', { name: '주변 링크', exact: true }).click();
  await expect(page).toHaveURL(/#fn-1$/);
  await expect(page.locator('.footnote-panel')).not.toBeVisible();
});

// 짧은 노트는 글 끝 각주 목록이 처음부터 화면에 보여 미리보기가 뜨지 않는다. 목록을 화면 밖으로 밀어 두고 검사한다.
const pushFootnotesOffscreen = (page: import('@playwright/test').Page) => page.addStyleTag({ content: '.body .footnotes { margin-top: 3000px; }' });

test('hovering a footnote number previews it until the pointer leaves both number and panel', async ({ page, isMobile }) => {
  test.skip(isMobile, '호버 미리보기는 마우스에서만 쓴다');
  await page.goto('/notes/browser-start/');
  await pushFootnotesOffscreen(page);
  const panel = page.locator('.footnote-panel');
  const first = page.getByRole('link', { name: '각주 1', exact: true });
  await first.hover();
  // 스쳐 지나가는 포인터에는 열리지 않도록 잠시 기다린 뒤에 연다.
  await expect(panel).toBeHidden();
  await expect(panel).toContainText('첫 각주 내용');
  // 번호에서 판으로 옮겨 가는 동안과 판 위에 있는 동안은 닫히지 않는다.
  await panel.hover();
  await page.waitForTimeout(500);
  await expect(panel).toBeVisible();
  // 이웃 번호로 옮기면 기다리지 않고 그 각주로 바뀐다.
  await page.getByRole('link', { name: '각주 2', exact: true }).hover();
  await expect(panel).toContainText('둘째 각주 내용', { timeout: 200 });
  await page.mouse.move(5, 5);
  await expect(panel).toBeHidden();
});

test('clicking a previewed footnote pins the panel until Escape', async ({ page, isMobile }) => {
  test.skip(isMobile, '호버 미리보기는 마우스에서만 쓴다');
  await page.goto('/notes/browser-start/');
  await pushFootnotesOffscreen(page);
  const panel = page.locator('.footnote-panel');
  const first = page.getByRole('link', { name: '각주 1', exact: true });
  await first.hover();
  await expect(panel).toContainText('첫 각주 내용');
  await first.click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

// 닫히는 판을 전환으로 남겨 두면 번호의 anchor-name이 먼저 빠져 그 사이 판이 화면 왼쪽 위로 튄다.
test('a closing footnote panel disappears at once instead of losing its anchor', async ({ page, isMobile }) => {
  await page.goto('/notes/browser-start/');
  const first = page.getByRole('link', { name: '각주 1', exact: true });
  if (isMobile) await first.tap(); else await first.click();
  await expect(page.locator('.footnote-panel')).toBeVisible();
  const display = await page.evaluate(() => new Promise<string>((resolve) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    requestAnimationFrame(() => resolve(getComputedStyle(document.getElementById('footnote-panel')!).display));
  }));
  expect(display).toBe('none');
});

test('moving to a number whose footnote is on screen closes the previous preview', async ({ page, isMobile }) => {
  test.skip(isMobile, '호버 미리보기는 마우스에서만 쓴다');
  await page.goto('/notes/browser-start/');
  // 첫 항목은 화면 안에 두고 둘째 항목만 화면 밖으로 민다.
  await page.addStyleTag({ content: '.body .footnotes li:first-child { margin-bottom: 3000px; }' });
  const panel = page.locator('.footnote-panel');
  await page.getByRole('link', { name: '각주 2', exact: true }).hover();
  await expect(panel).toContainText('둘째 각주 내용');
  await page.getByRole('link', { name: '각주 1', exact: true }).hover();
  await expect(panel).toBeHidden();
});

test('the preview stays closed when the footnote list is already on screen', async ({ page, isMobile }) => {
  test.skip(isMobile, '호버 미리보기는 마우스에서만 쓴다');
  await page.goto('/notes/browser-start/');
  await expect(page.locator('.body .footnotes')).toBeInViewport();
  await page.getByRole('link', { name: '각주 1', exact: true }).hover();
  await page.waitForTimeout(500);
  await expect(page.locator('.footnote-panel')).toBeHidden();
});

test('copy works inside the footnote panel each time it opens', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/notes/browser-start/');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('link', { name: '각주 3', exact: true }).click();
    const panel = page.locator('.footnote-panel');
    await expect(panel.getByRole('button', { name: 'JavaScript 코드 복사', exact: true })).toHaveCount(1);
    await panel.getByRole('button', { name: 'JavaScript 코드 복사', exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText('코드를 복사했습니다.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('console.log("hello");\n');
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
  }
});

test('keyboard footnote navigation returns to its reference without heading collisions', async ({ page }) => {
  await page.goto('/notes/browser-start/');
  await page.getByRole('link', { name: '각주 1', exact: true }).press('Enter');
  await expect(page).toHaveURL(/#fn:1$/);
  expect(await page.evaluate(() => document.getElementById(location.hash.slice(1))?.tagName)).toBe('LI');
  await page.getByRole('link', { name: '1번 각주를 단 곳으로', exact: true }).press('Enter');
  await expect(page).toHaveURL(/#fnref:1$/);
  await expect(page.getByRole('link', { name: '각주 1', exact: true })).toBeFocused();
});

// 강조할 때 누르는 원(14px)에 판을 깔았더니 이웃 제목을 4~5px 덮었다. 지도처럼 점 테두리만 바꾸고, 칠한 원은 제목에 닿지 않는다.
test('a linked neighbor in the small graph changes its dot outline without covering its title', async ({ page }) => {
  await page.goto('/notes/browser-start/');
  const node = page.locator('.local-graph a.node').first();
  const dotStroke = () => node.evaluate((a) => getComputedStyle(a.querySelectorAll('circle')[1]).stroke);
  const before = await dotStroke();
  await page.locator('.note-side .side-list a[href="/notes/browser-neighbor/"]').first().focus();
  await expect(node).toHaveClass(/is-linked/);
  expect(await dotStroke(), '점 테두리가 강조색으로 바뀐다').not.toBe(before);
  const covered = await node.evaluate((a) => {
    const t = a.querySelector('text')!.getBoundingClientRect();
    return [...a.querySelectorAll('circle')].filter((c) => !['none', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(c).fill)).some((c) => {
      const r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return Math.hypot(Math.max(t.left - x, 0, x - t.right), Math.max(t.top - y, 0, y - t.bottom)) < r.width / 2;
    });
  });
  expect(covered, '칠한 원이 제목을 덮지 않는다').toBe(false);
});

// 누르는 원(14px)이 투명한데도 점과 같은 종이색 테두리를 받아, 그 고리가 간선을 가로질러 점 앞에서 선이 끊겨 보였다.
// 간선 끝을 떼는 종이색 테두리는 보이는 점에만 둔다.
test('small graph edges reach each neighbor dot without a gap from the invisible hit circle', async ({ page }) => {
  await page.goto('/notes/browser-many/');
  const strokes = await page.locator('.local-graph a.node').evaluateAll((nodes) => nodes.map((a) => {
    const [hit, dot] = a.querySelectorAll('circle');
    return { hit: getComputedStyle(hit).stroke, dot: getComputedStyle(dot).stroke };
  }));
  expect(strokes.length).toBeGreaterThan(0);
  for (const { hit, dot } of strokes) {
    expect(hit, '누르는 원은 테두리를 그리지 않는다').toBe('none');
    expect(dot, '보이는 점은 종이색 테두리로 간선 끝을 뗀다').not.toBe('none');
  }
});

test('linked highlighting survives mixed focus and hover', async ({ page, isMobile }) => {
  await page.goto('/notes/browser-start/');
  const graph = page.locator('.local-graph a.node').first();
  const rows = page.locator('.note-side .side-list a[href="/notes/browser-neighbor/"]');
  await rows.first().focus();
  await expect(graph).toHaveClass(/is-linked/);
  if (!isMobile) {
    await graph.hover();
    await page.mouse.move(0, 0);
    await expect(graph).toHaveClass(/is-linked/);
    await rows.last().hover();
    await page.getByRole('button', { name: '검색', exact: true }).focus();
    await expect(graph).toHaveClass(/is-linked/);
    await page.mouse.move(0, 0);
  } else {
    await page.getByRole('button', { name: '검색', exact: true }).focus();
  }
  await expect(graph).not.toHaveClass(/is-linked/);
});

test('home switches both ways across the live graph breakpoint without duplicate engines', async ({ page, isMobile }) => {
  await page.goto('/');
  const snapshot = page.locator('.hero-snapshot');
  const engine = page.locator('.hero-graph > .graph');
  if (isMobile) await expect(snapshot).toBeVisible(); else await expect(engine).toBeVisible();
  for (const width of [720, 1000, 1001, 1440, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (isMobile || width <= 1000) {
      await expect(snapshot).toBeVisible();
      await expect(engine).not.toBeVisible();
    } else {
      await expect(engine).toBeVisible();
      await expect(engine).toHaveCount(1);
      await expect(snapshot).not.toBeVisible();
      await expect.poll(() => engine.evaluate((svg) => {
        const view = svg.getAttribute('viewBox')!.split(' ').map(Number);
        return Math.abs(view[2] - svg.clientWidth) + Math.abs(view[3] - svg.clientHeight);
      })).toBe(0);
    }
  }
});

test('the back link below an external article does not overlap its related notes', async ({ page }) => {
  await page.goto('/posts/browser-external/');
  const back = page.getByRole('link', { name: '글 목록', exact: true });
  await back.scrollIntoViewIfNeeded();
  const measured = await back.evaluate((link) => {
    const box = link.getBoundingClientRect();
    const previous = document.querySelector('.external-related li:last-child')!.getBoundingClientRect();
    const upperEdge = document.elementFromPoint(box.left + 10, box.top + 2)?.closest('a');
    return { gap: box.top - previous.bottom, hit: upperEdge?.getAttribute('href'), href: link.getAttribute('href') };
  });
  expect(measured.gap).toBeGreaterThanOrEqual(0);
  expect(measured.hit).toBe(measured.href);
});

test('local graph shows up to six neighbors with two-line titles that never overlap', async ({ page }) => {
  await page.goto('/notes/browser-many/');
  await expect(page.locator('.local-graph a.node')).toHaveCount(6);
  const note = page.locator('.local-graph > p.meta');
  await expect(note).toContainText('6개만');
  await expect(note).toHaveCSS('font-weight', '400');
  const boxes = await page.locator('.local-graph a.node text').evaluateAll((texts) => texts.map((text) => {
    const box = text.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, lines: text.querySelectorAll('tspan').length };
  }));
  const circles = await page.locator('.local-graph circle').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).map(({ left, right, top, bottom }) => ({ left, right, top, bottom })));
  const overlap = (a: typeof boxes[number] | typeof circles[number], b: typeof boxes[number] | typeof circles[number]) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const [index, box] of boxes.entries()) {
    expect(box.lines).toBeLessThanOrEqual(2);
    for (const other of boxes.slice(index + 1)) expect(overlap(box, other)).toBe(false);
    // 제목은 자기 노드의 누르는 원(투명) 안쪽으로 조금 들어올 수 있으므로 보이는 점만 검사한다.
    for (const circle of circles.filter((c) => c.right - c.left <= 20)) expect(overlap(box, circle)).toBe(false);
  }
});

// 이웃 제목이 pointer-events: none이라 지름 28px 점만 눌렸다(#41). 제목도 같은 링크로 누르고, 손가락 기기에서는 점을 44px로 넓힌다.
test('a neighbor in the small graph opens from its title and its dot reaches 44px on touch without overlapping another', async ({ page, isMobile }) => {
  await page.goto('/notes/browser-many/');
  const measured = await page.locator('.local-graph').evaluate((graph) => {
    const nodes = [...graph.querySelectorAll('a.node')];
    const titleHits = nodes.map((a) => {
      const box = a.querySelector('text')!.getBoundingClientRect();
      // 두 줄 제목의 줄 사이도 누를 수 있어야 하므로 글자 상자의 가운데를 누른다.
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('a.node');
      return hit === a;
    });
    const circle = (c: Element) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; };
    const dots = nodes.map((a) => circle(a.querySelector('circle.hit')!));
    const titles = nodes.map((a) => a.querySelector('rect.hit')!.getBoundingClientRect());
    const ring = circle(graph.querySelector('.is-current .ring')!);
    const touches = (c: { x: number; y: number; r: number }, b: DOMRect) => Math.hypot(Math.max(b.left - c.x, 0, c.x - b.right), Math.max(b.top - c.y, 0, c.y - b.bottom)) < c.r;
    const overlaps: string[] = [];
    dots.forEach((dot, i) => {
      if (Math.hypot(dot.x - ring.x, dot.y - ring.y) < dot.r + ring.r) overlaps.push(`${i}: 가운데 노드`);
      dots.forEach((other, j) => { if (j > i && Math.hypot(dot.x - other.x, dot.y - other.y) < dot.r + other.r) overlaps.push(`${i}·${j}: 점`); });
      titles.forEach((title, j) => { if (j !== i && touches(dot, title)) overlaps.push(`${i}의 점·${j}의 제목`); });
    });
    titles.forEach((a, i) => titles.forEach((b, j) => { if (j > i && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${i}·${j}: 제목`); }));
    return { titleHits, dotDiameter: Math.round(dots[0].r * 2), overlaps };
  });
  expect(measured.titleHits.length).toBe(6);
  expect(measured.titleHits, '제목을 누르면 그 노드의 링크가 잡힌다').toEqual(measured.titleHits.map(() => true));
  expect(measured.dotDiameter).toBe(isMobile ? 44 : 28);
  expect(measured.overlaps, '한 노드의 누르는 영역이 다른 노드에 닿지 않는다').toEqual([]);
});

// 작은 그래프 아래의 지도 링크는 24px이라 사이드바의 다른 링크와 달리 손가락 기기에서 넓혀지지 않았다.
test('the map link under the small graph reaches 44px on touch without touching a node', async ({ page, isMobile }) => {
  test.skip(!isMobile, '누르는 영역은 터치 기기에서만 넓힌다');
  await page.goto('/notes/browser-many/');
  const measured = await page.locator('.local-graph').evaluate((graph) => {
    const link = graph.querySelector('.local-graph-tools a')!.getBoundingClientRect();
    const gap = Math.min(...[...graph.querySelectorAll('a.node .hit')].map((hit) => link.top - hit.getBoundingClientRect().bottom));
    return { height: link.height, gap };
  });
  expect(measured.height).toBeGreaterThanOrEqual(44);
  expect(measured.gap, '지도 링크가 그래프 노드의 누르는 영역에 닿지 않는다').toBeGreaterThanOrEqual(0);
});

// 외부 발행 글 머리의 원문 링크가 터치에서 21px이었다. 노트 머리의 메타 줄은 넓혔는데 같은 역할의 이 줄은 빠졌다.
// 줄에 링크가 하나뿐이고 위는 페이지 여백이라, 아래 제목만 덮지 않으면 44px을 채울 수 있다.
test('the original link above an external article reaches 44px on touch without covering the title', async ({ page, isMobile }) => {
  test.skip(!isMobile, '누르는 영역은 터치 기기에서만 넓힌다');
  await page.goto('/posts/browser-external/');
  const measured = await page.evaluate(() => {
    const meta = document.querySelector('.external-meta')!;
    const link = meta.querySelector('a')!.getBoundingClientRect();
    const title = meta.nextElementSibling!.getBoundingClientRect();
    return { height: link.height, gap: title.top - link.bottom };
  });
  expect(measured.height).toBeGreaterThanOrEqual(44);
  expect(measured.gap, '넓힌 영역이 제목에 닿지 않는다').toBeGreaterThanOrEqual(0);
});

// 한 열 화면에서는 목차가 글 맨 위에 접혀 있어, 읽는 도중 다른 절로 가려면 맨 위까지 올라가 목차를 펴야 했다.
// 목차 버튼은 이 이동을 탭 두 번으로 줄인다. 채택 근거가 이 편의이므로 그 조작 자체를 검사한다.
test('from the middle of a note the contents button reaches another section in two taps', async ({ page, isMobile }) => {
  test.skip(!isMobile, '목차 버튼은 한 열로 접힌 화면에만 있다');
  await page.goto('/notes/browser-sections/');
  const button = page.locator('.toc-button'), sheet = page.locator('#toc-sheet');
  await expect(button, '접힌 목차가 화면에 있는 동안은 버튼이 겹쳐 뜨지 않는다').toBeHidden();
  await page.evaluate(() => document.getElementById([...document.querySelectorAll('.body h2')].find((h) => h.textContent === '셋째 절')!.id)!.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, 600));
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.width, '누르는 영역 44px').toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await button.tap();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('a[aria-current="location"]'), '열면 지금 읽는 절을 가리킨다').toHaveText('셋째 절');
  await sheet.getByRole('link', { name: '첫째 절', exact: true }).tap();
  await expect(sheet, '절을 고르면 닫힌다').toBeHidden();
  await expect(page.locator('.body h2', { hasText: '첫째 절' })).toBeInViewport();
});

// 막대는 본문만 기준으로 채운다. 마지막 문단이 화면에 들어오면 다 찬다. 참조 목록과 바닥글까지 지나야 차면 다 읽고도 덜 찬 채로 남는다.
test('the contents button bar fills as the body is read and is full when the last block is on screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, '목차 버튼은 한 열로 접힌 화면에만 있다');
  await page.goto('/notes/browser-sections/');
  const progress = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('.toc-button')!).getPropertyValue('--progress')));
  await page.evaluate(() => document.getElementById([...document.querySelectorAll('.body h2')].find((h) => h.textContent === '둘째 절')!.id)!.scrollIntoView({ block: 'start' }));
  await expect(page.locator('.toc-button')).toBeVisible();
  const early = await progress();
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(0.5);
  await page.evaluate(() => { const last = document.querySelector('.note-article .body')!.lastElementChild!; window.scrollTo({ top: window.scrollY + last.getBoundingClientRect().top - innerHeight + 40, behavior: 'instant' }); });
  await expect.poll(progress, { message: '마지막 문단이 화면에 들어오면 다 찬다' }).toBe(1);
});

// 목차 버튼은 화면 오른쪽 아래에 고정되어 있어 글 끝까지 내리면 바닥글 위에 놓인다. 320px에서는 바닥글의 마지막 링크가,
// 바닥글이 한 줄이 되는 721px부터는 오른쪽 끝의 링크가 버튼에 가려 누를 수 없었다. 바닥글이 버튼의 폭만큼 오른쪽을 비운다.
// 어느 링크가 그 자리에 오는지는 프로필 수와 글자 크기에 따라 달라지므로, 바닥글의 어떤 덩어리도 버튼이 선 세로 띠에 들어오지 않는지를 본다.
for (const [width, fontSize] of [[320, 16], [800, 16], [390, 32]] as const) {
  test(`the footer keeps clear of the contents button at the end of a note (${width}px, ${fontSize}px type)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await gotoWithDefaultFontSize(page, '/notes/browser-sections/', fontSize);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(page.locator('.toc-button')).toBeVisible();
    const measured = await page.evaluate(() => {
      const button = document.querySelector('.toc-button')!.getBoundingClientRect();
      const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
      const reach = Math.max(...[...document.querySelectorAll('.site-footer .wrap > *')].map((block) => block.getBoundingClientRect().right));
      return { reach, buttonLeft: button.left, buttonOnFooter: button.bottom > footer.top };
    });
    expect(measured.buttonOnFooter, '전제: 글 끝에서 버튼이 바닥글 위에 놓인다').toBe(true);
    expect(measured.reach, '바닥글 내용의 오른쪽 끝').toBeLessThanOrEqual(measured.buttonLeft);
  });
}

test('the contents button stays out of the two-column reader, where the sidebar already shows the contents', async ({ page, isMobile }) => {
  test.skip(isMobile, '데스크톱 폭만 본다');
  await page.goto('/notes/browser-sections/');
  await page.evaluate(() => window.scrollTo({ top: 2000, behavior: 'instant' }));
  await expect(page.locator('.rail a[aria-current="location"]')).toBeVisible();
  await expect(page.locator('.toc-button')).toBeHidden();
});

// 목차는 읽는 선을 지난 마지막 제목을 가리킨다. 선 근처의 좁은 띠만 지켜보면, 한 번의 스크롤로 띠를 건너뛴 제목은
// 띠에 들어온 적이 없어 알림이 오지 않았고 이전 절이 그대로 남았다. 맨 위로 가기가 가장 흔한 경우다.
test('the table of contents follows scrolls that jump past headings', async ({ page }) => {
  await page.goto('/notes/browser-sections/');
  const current = page.locator('.rail a[aria-current="location"]');
  // 그 절 제목을 화면 맨 위에서 offset만큼 아래(음수면 위)에 두도록 한 번에 이동한다.
  const place = (title: string, offset: number) => page.evaluate(([name, by]) => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-heading]')].find((a) => a.textContent === name)!;
    const heading = document.getElementById(link.dataset.heading!)!;
    window.scrollTo({ top: window.scrollY + heading.getBoundingClientRect().top - by, behavior: 'instant' });
  }, [title, offset] as const);
  await expect(current).toHaveText('첫째 절');
  await place('셋째 절', -600);
  await expect(current, '제목이 화면 위로 지나간 절 한가운데').toHaveText('셋째 절');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(current, '맨 위로').toHaveText('첫째 절');
  await place('둘째 절', -300);
  await expect(current, '둘째 절 제목을 건너뛰어 내려감').toHaveText('둘째 절');
  await place('둘째 절', 600);
  await expect(current, '둘째 절 제목이 읽는 선 아래로 내려가도록 올라감').toHaveText('첫째 절');
});

// 페이지 끝의 짧은 절은 끝까지 내려도 제목이 읽는 선에 닿지 못한다. 선 규칙만 따르면 목차에서 누른 항목 대신
// 앞 절이 강조되어 피드백이 틀린다. 누르거나 주소로 가리킨 절은 독자가 다시 스크롤할 때까지 그대로 가리킨다.
test('a table of contents entry chosen at the end stays marked until the reader scrolls again', async ({ page, isMobile }) => {
  test.skip(isMobile, '720px 이하에서는 현재 절을 표시하지 않는 접힌 목차를 쓴다');
  await page.goto('/notes/browser-sections/');
  const current = page.locator('.rail a[aria-current="location"]');
  await page.locator('.rail a', { hasText: '짧은 끝 절' }).click();
  await expect.poll(() => page.evaluate(() => Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight), '끝까지 내려감').toBe(true);
  const place = await page.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-heading]')].find((a) => a.textContent === '짧은 끝 절')!;
    return document.getElementById(link.dataset.heading!)!.getBoundingClientRect().top / innerHeight;
  });
  expect(place, '전제: 끝까지 내려도 제목이 읽는 선(30%) 아래에 있다').toBeGreaterThan(0.3);
  await expect(current, '누른 항목').toHaveText('짧은 끝 절');
  await page.mouse.wheel(0, -120);
  await expect(current, '다시 스크롤하면 선 규칙으로 돌아감').toHaveText('넷째 절');

  // 주소로 가리킨 경우도 같다. 스크롤 막대를 끌 때처럼 휠·키 입력 없이 스크롤해도 고른 절이 화면을 벗어나면 돌아간다.
  await page.reload();
  await expect(current, '주소로 가리킨 항목').toHaveText('짧은 끝 절');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(current, '입력 없이 맨 위로').toHaveText('첫째 절');
});

// 긴 목차는 목차만 따로 스크롤한다. 스크롤 상자는 자기 테두리 안쪽까지만 그리므로, 현재 절의 막대를 상자의 테두리 위에
// 겹쳐 그리면 막대가 잘려 굵은 제목만 남았다. 막대 자리를 눌렀을 때 그 줄이 잡히는지로 실제로 그려지는지 본다.
test('a long table of contents shows the bar beside the current section', async ({ page, isMobile }) => {
  test.skip(isMobile, '한 열 화면에서는 사이드바 목차를 쓰지 않는다');
  await page.goto('/posts/browser-long-toc/');
  const current = page.locator('.rail a[aria-current="location"]');
  const atBar = () => current.evaluate((link) => {
    const box = link.getBoundingClientRect();
    return document.elementFromPoint(box.left + 1, box.top + box.height / 2) === link;
  });
  await expect(current).toHaveText('1번 절');
  expect(await page.locator('.rail').evaluate((rail) => rail.scrollHeight > rail.clientHeight), '전제: 목차가 안에서 스크롤된다').toBe(true);
  expect(await atBar(), '첫 절').toBe(true);
  // 목차가 스크롤된 뒤의 줄도 같다.
  await page.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-heading]')].find((a) => a.textContent === '11번 절')!;
    window.scrollTo({ top: window.scrollY + document.getElementById(link.dataset.heading!)!.getBoundingClientRect().top + 300, behavior: 'instant' });
  });
  await expect(current).toHaveText('11번 절');
  await expect.poll(() => page.locator('.rail').evaluate((rail) => rail.scrollTop), '전제: 목차가 현재 절까지 내려갔다').toBeGreaterThan(0);
  await expect.poll(atBar, '스크롤된 목차의 절').toBe(true);
});

// 앵커 이동을 부드럽게 움직이면 애니메이션이 출발할 때 계산한 자리로 가서, 그사이 위쪽 도표가 그려져 길어진 만큼
// 제목이 밀려났다. 도표가 많은 글에서는 한 절 앞에 떨어졌다. 즉시 이동하면 브라우저의 스크롤 고정이 자리를 지킨다.
test('a heading reached by its address stays in place when content above grows afterwards', async ({ page }) => {
  await page.goto('/notes/browser-sections/');
  const top = await page.evaluate(async () => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-heading]')].find((a) => a.textContent === '셋째 절')!;
    const heading = document.getElementById(link.dataset.heading!)!;
    location.hash = link.hash;
    // 이동이 시작된 뒤에 도표 하나가 그려진 것처럼 본문 맨 앞에 높은 블록을 끼운다.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const late = document.createElement('div');
    late.style.height = '1000px';
    heading.closest('.body')!.prepend(late);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return heading.getBoundingClientRect().top;
  });
  expect(top, '제목이 머리글 아래 도착한 자리에 남는다').toBeLessThan(300);
  expect(top).toBeGreaterThan(0);
});

test('series hubs omit the repeated graph and leave space after the mobile contents', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/posts/browser-series/');
  await expect(page.locator('.series-block')).toBeVisible();
  await expect(page.locator('.local-graph')).toHaveCount(0);
  const gap = await page.evaluate(() => document.querySelector('.series-start')!.getBoundingClientRect().top - document.querySelector('.mobile-toc')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(16);
  await page.goto('/posts/browser-series-part/');
  await expect(page.locator('.local-graph')).toBeVisible();
});

test('table identifiers stay on one line while long values scroll inside the table', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/posts/browser-series-part/');
  const measured = await page.locator('.body table').first().evaluate(table => {
    const codes = [...table.querySelectorAll('code')];
    return {
      lines: codes.map(code => { const range = document.createRange(); range.selectNodeContents(code); return new Set([...range.getClientRects()].map(r => r.top)).size; }),
      scrolls: table.scrollWidth > table.clientWidth,
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  expect(measured.lines).toEqual([1, 1]);
  expect(measured.scrolls).toBe(true);
  expect(measured.overflow).toBe(0);
});

// 본문의 overflow-wrap: anywhere가 칸에 상속되면 단어 중간도 최소 폭 계산에 들어가, 첫 열이 최소 폭까지 줄며 "Organizati/onal"로 잘렸다.
test('a long word in the first table column widens the column instead of splitting', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/posts/browser-series-part/');
  const measured = await page.locator('.body table').nth(1).evaluate(table => {
    const text = table.querySelector('td')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 'Organizational'.length);
    return { lines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  expect(measured.lines).toBe(1);
  expect(measured.overflow).toBe(0);
});
