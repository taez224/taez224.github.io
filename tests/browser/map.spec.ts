import { test, expect, pressedBarGaps, textsOnRings, BOTH_THEMES } from './fixtures.ts';

type Page = import('@playwright/test').Page;
type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

// 지도 노드의 점 중심(화면 좌표)과 흐림 여부. 방향 판정은 배치 좌표로 하지만 화면 좌표와 방향이 같으므로 화면에서 잰다.
const nodeDots = (page: Page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll<SVGGElement>('.graph .node')].map((node) => {
  const box = node.querySelector('.dot')!.getBoundingClientRect();
  return [node.dataset.id!, { x: box.x + box.width / 2, y: box.y + box.height / 2, dim: node.classList.contains('is-dim') }];
})));
const focusedNodeId = (page: Page) => page.locator('.graph .node:focus').getAttribute('data-id');
// 범례의 마지막 버튼에서 Tab 한 번에 노드에 닿아야 한다. 무대 <svg>가 그 사이에 멈추면 보이지 않는 정지점이 하나 더 생긴다.
async function tabIntoMap(page: Page) {
  await page.locator('.legend button').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.graph .node:focus')).toHaveCount(1);
}
// 방향마다 진행 거리가 0보다 큰 쪽이 그 방향의 반평면이다.
const progress: Record<Arrow, (from: { x: number; y: number }, to: { x: number; y: number }) => number> = {
  ArrowRight: (from, to) => to.x - from.x,
  ArrowLeft: (from, to) => from.x - to.x,
  ArrowDown: (from, to) => to.y - from.y,
  ArrowUp: (from, to) => from.y - to.y
};

// 흐려진 노드는 화면에서 22%로 남고 포커스 링도 함께 흐려진다. Tab 정지점이나 화살표 후보에 두면 보이지 않는 대상에 포커스가 간다.
test('selecting a node leaves one tab stop and keeps the dimmed nodes out of the arrow targets', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  await expect(target).toHaveCount(1);
  if (isMobile) await target.tap(); else await target.click();
  await expect(page.locator('.graph .node.is-dim').first()).toBeVisible();
  const stops = await page.locator('.graph .node').evaluateAll((nodes) => ({
    dim: nodes.filter((node) => node.classList.contains('is-dim')).length,
    dimStops: nodes.filter((node) => node.classList.contains('is-dim') && node.getAttribute('tabindex') === '0').length,
    stops: nodes.filter((node) => node.getAttribute('tabindex') === '0').length
  }));
  expect(stops.dim).toBeGreaterThan(0);
  expect(stops.dimStops).toBe(0);
  expect(stops.stops).toBe(1);
  // 키보드가 없는 기기에서는 정지점만 본다. 화살표는 데스크톱에서 누른다.
  if (isMobile) return;
  await target.focus();
  let moved = 0;
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] as const) {
    const before = await focusedNodeId(page);
    await page.keyboard.press(key);
    const after = await focusedNodeId(page);
    if (after !== before) moved += 1;
    expect(await page.locator('.graph .node:focus').evaluate((node) => node.classList.contains('is-dim')), '화살표로 닿은 노드는 흐려지지 않았다').toBe(false);
  }
  expect(moved, '화살표가 이웃으로는 옮겨 간다').toBeGreaterThan(0);
});

// 선택을 풀면 흐려진 노드가 없어야 하고 Tab 정지점은 늘 하나다. 정지점이 둘이 되면 지도를 지나가는 Tab이 다시 늘어난다.
test('clearing the selection leaves no dimmed node and still one tab stop', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  if (isMobile) await target.tap(); else await target.click();
  await expect(page.locator('.graph .node.is-dim').first()).toBeVisible();
  // 휴대폰 폭은 노드를 고르면 시트가 함께 열린다. 첫 Escape가 시트를 닫고 다음 Escape가 선택을 푼다.
  await page.keyboard.press('Escape');
  if (isMobile) await page.keyboard.press('Escape');
  await expect(page.locator('.graph .node.is-dim')).toHaveCount(0);
  await expect(page.locator('.graph .node[tabindex="0"]')).toHaveCount(1);
});

// 지도는 노드의 Tab 정지점이 하나라 범례를 지나면 노드 하나, 다음은 확대 조작이다. 노드를 하나씩 지나가면 수십 번을 눌러야 한다.
test('tab enters the map at one node and leaves it for the zoom controls', async ({ page, isMobile }) => {
  test.skip(isMobile, '키로 오갈 수 있는 기기에서 볼 순서다');
  await page.goto('/map/');
  await expect(page.locator('.graph .node').first()).toBeAttached();
  await tabIntoMap(page);
  const entered = await focusedNodeId(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '축소', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.graph .node:focus')).toHaveCount(1);
  expect(await focusedNodeId(page), '돌아오면 들어갔던 노드다').toBe(entered);
});

// 화살표는 그 방향 반평면에서 가까운 노드로 포커스를 옮기고 페이지를 스크롤하지 않는다. 방향에 노드가 없으면 제자리에 둔다.
test('arrow keys move the focus toward that side without scrolling the page', async ({ page, isMobile }) => {
  test.skip(isMobile, '키로 오갈 수 있는 기기에서 누르는 키다');
  await page.goto('/map/');
  await expect(page.locator('.graph .node').first()).toBeAttached();
  await tabIntoMap(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  const keys: Arrow[] = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  let moved = 0;
  for (const key of keys) {
    const dots = await nodeDots(page);
    const from = (await focusedNodeId(page))!;
    const ahead = Object.entries(dots).filter(([id, dot]) => id !== from && !dot.dim && progress[key](dots[from], dot) > 0);
    await page.keyboard.press(key);
    const to = (await focusedNodeId(page))!;
    if (ahead.length === 0) {
      expect(to, `${key} 쪽에 노드가 없으면 제자리다`).toBe(from);
    } else {
      expect(to, `${key} 쪽에 노드가 있으면 옮겨 간다`).not.toBe(from);
      expect(progress[key](dots[from], dots[to]), `${key}로 닿은 노드는 그 방향에 있다`).toBeGreaterThan(0);
      moved += 1;
    }
    expect(await page.evaluate(() => window.scrollY), '페이지는 스크롤되지 않는다').toBe(scrollY);
  }
  expect(moved).toBeGreaterThan(2);
  // 한 방향으로 계속 가면 매번 그 방향으로 나아가므로 끝에서 멈춘다(반대편으로 돌아가지 않는다).
  const total = await page.locator('.graph .node').count();
  let last = await focusedNodeId(page);
  for (let step = 0; step <= total; step += 1) {
    await page.keyboard.press('ArrowLeft');
    const now = await focusedNodeId(page);
    if (now === last) break;
    last = now;
    expect(step, '왼쪽 끝에서 멈춘다').toBeLessThan(total);
  }
});

// 노드를 고르면 이웃이 아닌 노드가 흐려지므로, 화살표는 고른 노드와 이웃 사이만 오간다.
test('after selecting with Space, arrow keys only reach the selected node and its neighbors', async ({ page, isMobile }) => {
  test.skip(isMobile, '키로 오갈 수 있는 기기에서 누르는 키다');
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  await expect(target).toHaveCount(1);
  await target.focus();
  await page.keyboard.press(' ');
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.graph .node.is-dim').first()).toBeVisible();
  const keys: Arrow[] = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'];
  let moved = 0;
  let last = await focusedNodeId(page);
  for (const key of keys) {
    await page.keyboard.press(key);
    const now = await focusedNodeId(page);
    if (now !== last) moved += 1;
    last = now;
    const near = await page.locator('.graph .node:focus').evaluate((node) => node.classList.contains('is-selected') || node.classList.contains('is-neighbor'));
    expect(near, '화살표로 닿은 노드는 고른 노드이거나 그 이웃이다').toBe(true);
  }
  expect(moved).toBeGreaterThan(2);
});

// 최대로 확대하면 대부분의 노드가 지도 상자 밖이다. 화살표로 닿은 노드로 시점이 따라가야 포커스가 보이지 않는 곳에 가지 않는다.
test('arrow keys keep the focused node inside the map box at the maximum zoom', async ({ page, isMobile }) => {
  test.skip(isMobile, '키로 오갈 수 있는 기기에서 누르는 키다');
  // 움직임 줄이기에서는 시점을 바로 옮기므로 애니메이션을 기다리지 않아도 된다.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/map/');
  const zoom = page.getByRole('button', { name: '확대', exact: true });
  const scale = async () => Number(/scale\(([\d.]+)\)/.exec((await page.locator('[data-map] > g').getAttribute('transform'))!)![1]);
  for (let i = 0; i < 12; i += 1) await zoom.click();
  const zoomed = await scale();
  await zoom.click();
  await expect.poll(scale, '더 확대되지 않는 최대 배율이다').toBe(zoomed);
  const inside = async () => page.evaluate(() => {
    const box = document.querySelector('.graph-box')!.getBoundingClientRect();
    const dot = document.querySelector('.graph .node:focus .dot')!.getBoundingClientRect();
    const x = dot.x + dot.width / 2, y = dot.y + dot.height / 2;
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  });
  await tabIntoMap(page);
  expect(await inside(), '처음 닿은 노드가 지도 상자 안이다').toBe(true);
  const keys: Arrow[] = ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'];
  for (const key of keys) {
    await page.keyboard.press(key);
    expect(await inside(), `${key} 뒤에도 포커스한 노드가 지도 상자 안이다`).toBe(true);
  }
});

// 알트+화살표는 브라우저의 뒤로 가기·앞으로 가기다. 지도가 가로채면 키보드 사용자가 지도에서 돌아갈 수 없다.
test('alt and arrow keys are left to the browser', async ({ page, isMobile }) => {
  test.skip(isMobile, '키로 오갈 수 있는 기기에서 누르는 키다');
  await page.goto('/map/');
  await expect(page.locator('.graph .node').first()).toBeAttached();
  await tabIntoMap(page);
  const from = await focusedNodeId(page);
  // svg의 처리기가 끝난 뒤 문서까지 올라온 화살표 입력이 기본 동작을 막았는지 기록한다. Alt 키 자체의 입력은 거른다.
  await page.evaluate(() => {
    (window as unknown as { prevented: boolean[] }).prevented = [];
    document.addEventListener('keydown', (event) => { if (event.key.startsWith('Arrow')) (window as unknown as { prevented: boolean[] }).prevented.push(event.defaultPrevented); });
  });
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Alt+ArrowRight');
  expect(await focusedNodeId(page), '알트와 함께는 포커스를 옮기지 않는다').toBe(from);
  expect(await page.evaluate(() => (window as unknown as { prevented: boolean[] }).prevented)).toEqual([false, false]);
});

// 필터를 눌러 달라진 결과는 제목 옆 한 줄이 전한다. 이 줄이 생중계 영역이 아니면 화면을 보지 않는 사람은 무슨 일이 일어났는지 알 수 없다.
test('the count line announces what a filter did', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const count = page.locator('[data-map-count]');
  await expect(count).toHaveAttribute('role', 'status');
  const before = await count.textContent();
  const topic = page.locator('.legend button[data-topic]').first();
  if (isMobile) await topic.tap(); else await topic.click();
  await expect(count).not.toHaveText(before!);
});

// 노드 이름은 각 노드의 접근 가능한 이름이 이미 전한다. 그 위에 얹은 글자 층까지 읽히면 같은 제목이 두 번 나온다.
test('the decorative graph layers stay out of the accessibility tree', async ({ page }) => {
  await page.goto('/map/');
  const hidden = await page.locator('[data-map] > g > g').evaluateAll((layers) => layers
    .filter((layer) => layer.hasAttribute('data-labels') || layer.hasAttribute('data-regions') || layer.hasAttribute('data-region-labels'))
    .map((layer) => [layer.getAttributeNames().find((name) => name.startsWith('data-')), layer.getAttribute('aria-hidden')]));
  expect(hidden.length).toBe(3);
  for (const [name, value] of hidden) expect(value, `${name} 층`).toBe('true');
});

// 노드는 버튼으로 읽히는데 Space와 Enter가 다른 일을 하고, 노드 사이는 화살표로 옮긴다. 버튼의 약속과 다르므로 설명이 있어야 한다.
test('the map explains its keys and names its hubs', async ({ page }) => {
  await page.goto('/map/');
  const described = await page.locator('[data-map]').getAttribute('aria-describedby');
  expect(described).toBeTruthy();
  const hint = await page.locator(`#${described}`).textContent();
  expect(hint).toMatch(/Enter/);
  expect(hint).toMatch(/Space/);
  expect(hint).toMatch(/화살표/);
  // 허브는 링으로만 표시해서 화면을 보지 않으면 다른 노드와 구분되지 않는다.
  const hub = page.getByRole('button', { name: /시작 노트/ });
  await expect(hub).toHaveCount(1);
  expect(await hub.getAttribute('aria-label')).toMatch(/허브/);
});

// 집계는 필터가 남긴 범위를 말한다. 선택 때문에 숫자가 움직이면 무엇을 세는 줄인지 알 수 없다.
test('selecting a node outside the filter leaves the count alone', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const count = page.locator('[data-map-count]');
  const topic = page.locator('.legend button[data-topic]').last();
  if (isMobile) await topic.tap(); else await topic.click();
  const filtered = await count.textContent();
  const dimmed = page.locator('.graph .node.is-dim').first();
  await expect(dimmed).toBeVisible();
  await dimmed.click({ force: true });
  await expect(page.locator('.graph .node.is-selected')).toHaveCount(1);
  await expect(count).toHaveText(filtered!);
});

// 한 열로 바뀌는 폭에서 패널을 흐름에 두면 무대 아래로 내려간다. 900×600에서는 화면 밖으로 완전히 나가 노드를 골라도 바뀌는 것이 없었다.
// 이 폭부터 시트로 올리고, 고르기 전에는 시트가 화면 밖에 있으므로 시작점·허브 목록을 무대 아래에 따로 둔다.
test('one-column widths keep the start lists and hold the sheet out of the way', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/map/');
  await expect(page.locator('.map-start-hint')).toBeVisible();
  await expect(page.locator('.map-start .list-block').first()).toBeVisible();
  await expect(page.locator('.map-panel')).toHaveAttribute('inert', '');
});

// 휴대폰 폭에서 노드를 고르면 시트에 가리지 않게 지도를 위로 민다. 시트를 닫아도 밀린 채 두었더니 지도 아래쪽이 최대 215px 비었다.
// 시트 안의 링크로 다른 노드를 연달아 골라 여러 번 밀었어도, 닫으면 시트를 열기 전 자리로 돌아와야 한다.
test('closing the sheet on a phone moves the map back to where it was before the sheet opened', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map/');
  const offsetY = () => page.locator('[data-map] > g').evaluate((g) => Number(/translate\([-\d.]+ ([-\d.]+)\)/.exec(g.getAttribute('transform')!)![1]));
  const nodes = page.locator('.graph .node');
  await expect(nodes.first()).toBeAttached();
  const start = await offsetY();
  // 가장 아래에 있는 노드를 골라 시트가 덮게 한다.
  const lowest = await nodes.evaluateAll((gs) => gs.map((g, i) => [i, g.getBoundingClientRect().bottom]).sort((a, b) => b[1] - a[1])[0][0]);
  await nodes.nth(lowest).dispatchEvent('click');
  await expect.poll(offsetY, '시트가 덮지 않게 지도를 위로 민다').toBeLessThan(start - 10);
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-panel')).toHaveAttribute('inert', '');
  await expect.poll(offsetY, '시트를 닫으면 처음 자리로 돌아온다').toBeCloseTo(start, 0);
  await nodes.nth(lowest).dispatchEvent('click');
  await expect.poll(offsetY).toBeLessThan(start - 10);
  const link = page.locator('.map-panel a[data-node]').first();
  await expect(link, '시트에 다른 노드로 가는 링크가 있다').toBeAttached();
  await link.click();
  await page.keyboard.press('Escape');
  await expect.poll(offsetY, '시트 안에서 다른 노드를 골라도 닫으면 처음 자리로 돌아온다').toBeCloseTo(start, 0);
});

// 휴대폰 폭 지도에서 허브 제목을 자리가 없어도 아래에 두었더니 제목끼리, 또는 영역 이름과 겹쳤다. 오른쪽 아래 확대 조작은
// 영역 이름을 가렸다. 첫 화면과 노드를 하나씩 고른 화면에서 보이는 글자끼리 겹치지 않고 조작 아래로 들어가지 않는지 잰다.
// 고른 제목 아래 깔린 영역 이름은 흐려지므로(is-under-label) 겹침에서 뺀다.
// 제목을 점 아래에 두었더니 허브 고리와 입구 노드 후광, 선택 링이 제목에 걸렸으므로 고리 선도 함께 잰다.
test('map labels stay apart and clear of the zoom controls on a phone', async ({ page }) => {
  const clashes = async () => [...await page.evaluate(() => {
    const boxes = [...document.querySelectorAll<SVGTextElement>('.map-stage svg text:not(.is-under-label)')]
      .filter((text) => text.textContent!.trim() && text.getBoundingClientRect().width > 0 && getComputedStyle(text).visibility === 'visible')
      .map((text) => ({ name: text.textContent!.trim(), box: text.getBoundingClientRect() }));
    const controls = document.querySelector('.graph-controls')!.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const found: string[] = [];
    boxes.forEach((a, i) => {
      if (hit(a.box, controls)) found.push(`${a.name} × 확대 조작`);
      for (const b of boxes.slice(i + 1)) if (hit(a.box, b.box)) found.push(`${a.name} × ${b.name}`);
    });
    return found;
  }), ...await page.locator('[data-map]').evaluate(textsOnRings)];
  for (const [width, height] of [[320, 568], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/map/');
    const nodes = page.locator('.graph .node');
    await expect(nodes.first()).toBeAttached();
    expect(await clashes(), `${width}×${height} 첫 화면`).toEqual([]);
    for (let i = 0; i < await nodes.count(); i++) {
      await nodes.nth(i).dispatchEvent('click');
      expect(await clashes(), `${width}×${height}에서 ${i}번째 노드를 고른 화면`).toEqual([]);
    }
  }
  // 창 크기를 바꾸면 처음 배치한 좌표를 새 무대에 다시 맞춘다. 넓은 창에서 연 지도를 휴대폰 폭으로 줄이거나 휴대폰을 가로로 돌리면
  // 새로 연 것보다 무대가 빽빽해져, 전에는 영역 이름끼리 겹쳤다.
  for (const [[fromWidth, fromHeight], [toWidth, toHeight]] of [[[1440, 900], [320, 667]], [[1440, 900], [375, 667]], [[390, 844], [844, 390]]]) {
    await page.setViewportSize({ width: fromWidth, height: fromHeight });
    await page.goto('/map/');
    await expect(page.locator('.graph .node').first()).toBeAttached();
    await page.setViewportSize({ width: toWidth, height: toHeight });
    // resize 처리는 동기지만 이벤트가 오기까지 한 프레임 이상 걸린다. 옛 화면을 재고 통과하지 않도록 SVG의 viewBox가 새 무대 크기로 바뀐 것을 기다린 뒤 잰다.
    await expect.poll(() => page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-map]')!;
      return svg.getAttribute('viewBox') === `0 0 ${svg.clientWidth} ${svg.clientHeight}`;
    }), 'resize 뒤 지도가 새 무대 크기에 맞춰진다').toBe(true);
    expect(await clashes(), `${fromWidth}×${fromHeight}에서 ${toWidth}×${toHeight}로 바꾼 화면`).toEqual([]);
  }
  // 제목과 영역 이름은 지도를 끌 때 자리를 다시 정하지 않는다. 노드를 고르고 시트를 닫은 뒤 고른 제목이 확대 조작 위를 지나가게
  // 끌었더니, 전에는 제목이 조작 아래로 들어가 일부만 보였다. 끄는 도중과 끝난 뒤를 모두 잰다.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map/');
  await page.getByRole('button', { name: '이웃 많은 노트', exact: true }).dispatchEvent('click');
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-panel')).toHaveAttribute('inert', '');
  const picked = page.locator('.graph .label.is-selected');
  const [label, controls, stage] = await Promise.all([picked, page.locator('.graph-controls'), page.locator('[data-map]')].map((locator) => locator.boundingBox()));
  const center = (box: typeof label) => ({ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  const from = { x: stage!.x + 16, y: stage!.y + 16 };
  const to = { x: from.x + center(controls).x - center(label).x, y: from.y + center(controls).y - center(label).y };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / 8, from.y + ((to.y - from.y) * step) / 8);
    expect(await clashes(), `고른 제목을 끄는 ${step}/8 지점`).toEqual([]);
  }
  await page.mouse.up();
  expect(await clashes(), '끌기를 마친 화면').toEqual([]);
  await expect(picked, '조작 한가운데로 옮긴 제목은 숨는다').toHaveCSS('visibility', 'hidden');
});

// 원과 간선이 배율대로 커지면 3배 확대에서 원과 간선이 제목(화면 13px 고정)보다 먼저 보였다.
// 원은 맞춤 대비 확대 배율의 제곱근만큼만 커지고, 간선과 원 테두리의 두께는 화면 기준 그대로다. 전체 보기로 돌아오면 첫 화면의 크기로 돌아온다.
test('zooming the map grows node dots by the square root of the zoom and keeps line widths', async ({ page }) => {
  await page.goto('/map/');
  await expect(page.locator('.graph .node').first()).toBeAttached();
  const measure = () => page.evaluate(() => {
    const scene = document.querySelector('[data-map] > g')!.getAttribute('transform')!;
    return { r: document.querySelector('.graph .node .dot')!.getBoundingClientRect().width / 2, scale: Number(/scale\(([\d.]+)\)/.exec(scene)![1]) };
  });
  const fitted = await measure();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '확대', exact: true }).click();
  const zoomed = await measure();
  expect(zoomed.scale / fitted.scale).toBeGreaterThan(2.5);
  expect(zoomed.r / fitted.r).toBeCloseTo(Math.sqrt(zoomed.scale / fitted.scale), 1);
  await expect(page.locator('.graph .edge').first()).toHaveCSS('vector-effect', 'non-scaling-stroke');
  await expect(page.locator('.graph .node .hub-ring').first()).toHaveCSS('vector-effect', 'non-scaling-stroke');
  await page.getByRole('button', { name: '지도 전체 보기' }).click();
  await expect.poll(async () => (await measure()).r).toBeCloseTo(fitted.r, 1);
});

// 어두운 화면의 뒤 배경은 검정 반투명이다. 먹색이 밝아지므로 밝은 화면처럼 먹색을 섞으면 지도가 회색으로 뜬다.
// 전역 스타일 블록에서 :global()로 감싼 선택자는 브라우저가 버려서 이 규칙이 통째로 빠진 적이 있다.
test('the sheet backdrop darkens the map in the dark theme', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/map/');
  await page.locator('.graph .node').first().click({ force: true });
  const backdrop = page.locator('.sheet-backdrop');
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.45)');
});

// 시트는 화면 아래에 붙고 내용이 위에서부터 쌓인다. 화면이 짧아지면 맨 아래 참조 목록부터 잘려야지
// 제목이나 노트 읽기가 잘리면 안 된다. 흐름 안 패널은 반대로 제목부터 사라졌다.
test('the sheet keeps its close button, title and read link whole on a short landscape screen', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await page.goto('/map/');
  await page.locator('.graph .node').first().click({ force: true });
  const panel = page.locator('.map-panel');
  await expect(panel).toHaveAttribute('role', 'dialog');
  // 시트는 제 높이만큼 아래에 있다가 200ms 동안 올라온다. 올라오는 도중에 재면 아직 화면 아래에 걸쳐 있다.
  await expect(panel).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const measured = await page.evaluate(() => {
    const at = (selector: string) => { const box = document.querySelector(selector)!.getBoundingClientRect(); return { top: box.top, bottom: box.bottom }; };
    return { height: window.innerHeight, parts: { close: at('.panel-close'), title: at('.panel-head h2'), read: at('.panel-head .btn') } };
  });
  for (const [name, box] of Object.entries(measured.parts)) {
    expect(box.top, `${name} 위쪽`).toBeGreaterThanOrEqual(0);
    expect(box.bottom, `${name} 아래쪽`).toBeLessThanOrEqual(measured.height);
  }
});

// 홈과 지도가 같은 엔진을 쓴다. 홈에서 호버 처리를 끌 때 조건을 잘못 걸면 지도의 예고편까지 함께 꺼진다.
test('hovering a map node still previews its edges and dims the rest', async ({ page, isMobile }) => {
  test.skip(isMobile, '호버 예고편은 마우스가 있는 기기에서만 쓴다');
  await page.goto('/map/');
  const graph = page.locator('.graph');
  await expect(graph.locator('.node.is-faint')).toHaveCount(0);
  await graph.locator('.node').first().hover();
  await expect(graph.locator('.node.is-faint').first()).toBeAttached();
  await expect(graph.locator('line.edge.is-faint').first()).toBeAttached();
});

// 지도 노드는 눌린 채로 남는 토글이다. 홈에서 누름 상태를 뺄 때 지도까지 빠지면 선택을 말할 수단이 없어진다.
test('selecting a map node marks it as pressed', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  await expect(target).toHaveAttribute('aria-pressed', 'false');
  if (isMobile) await target.tap(); else await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.graph .node[aria-pressed="true"]')).toHaveCount(1);
});

// 무대에 숨긴 설명(#map-keys)은 낭독기에만 닿는다. 눈으로 보는 키보드 사용자는 Space와 Enter가 다른 일을 한다는 것을 알 수 없다.
// 늘 띄우면 마우스로 오는 대다수에게 쓰지 않는 글이 한 줄 남으므로, 키보드가 지도에 닿았을 때만 드러낸다.
test('the map reveals its key hint to the keyboard and keeps it from the mouse', { tag: BOTH_THEMES }, async ({ page, isMobile }) => {
  test.skip(isMobile, '키로 오갈 수 있는 기기에서 볼 안내다');
  await page.goto('/map/');
  const hint = page.locator('.key-hint');
  const held = page.locator('.graph .node:focus-visible');
  await expect(hint).toHaveCSS('opacity', '0');
  // 마우스로 누른 노드도 포커스를 받지만 :focus-visible은 아니다.
  await page.locator('.graph .node').first().click({ force: true });
  await expect(page.locator('.graph .node:focus')).toHaveCount(1);
  await expect(hint).toHaveCSS('opacity', '0');
  // 고른 노드를 풀어 지도 전체를 Tab 순서로 돌려놓는다. 정지점이 하나라 범례 다음 Tab이 곧 노드다.
  await page.keyboard.press('Escape');
  await page.locator('.legend button').last().focus();
  for (let step = 0; step < 6 && (await held.count()) === 0; step += 1) await page.keyboard.press('Tab');
  await expect(held).toHaveCount(1);
  await expect(hint).toHaveCSS('opacity', '1');
  // 안내 줄에는 화살표로 옮길 수 있다는 말이 있다. 문구 전체는 비교하지 않는다.
  await expect(hint).toContainText('화살표');
  // 숨긴 설명은 그대로 남는다. 보이는 안내는 그 말을 눈으로도 볼 수 있게 할 뿐이다.
  await expect(page.locator('#map-keys')).toHaveCount(1);
});

// 키 안내와 확대 버튼이 모두 무대 아래쪽 12px에 놓여, 좁은 화면에서는 안내 끝을 버튼이 가렸다.
test('the key hint stays clear of the zoom controls on a phone', { tag: BOTH_THEMES }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/map/');
  const held = page.locator('.graph .node:focus-visible');
  await page.locator('.legend button').last().focus();
  for (let step = 0; step < 6 && (await held.count()) === 0; step += 1) await page.keyboard.press('Tab');
  await expect(page.locator('.key-hint')).toHaveCSS('opacity', '1');
  const apart = await page.evaluate(() => {
    const a = document.querySelector('.key-hint')!.getBoundingClientRect();
    const b = document.querySelector('.graph-controls')!.getBoundingClientRect();
    return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  });
  expect(apart, '키 안내와 확대 버튼이 겹치지 않는다').toBe(true);
});

// 책장 거르개와 같은 막대다. 한쪽만 고치면 같은 장치가 두 모양이 된다.
test('the pressed legend bar sits right under its text on touch', async ({ page, isMobile }) => {
  test.skip(!isMobile, '버튼이 글자보다 높아지는 것은 터치 기기에서다');
  await page.goto('/map/');
  const topic = page.locator('.legend button[data-topic]').first();
  await topic.tap();
  await expect(topic).toHaveAttribute('aria-pressed', 'true');
  const bar = await topic.evaluate(pressedBarGaps);
  expect(bar.height, '터치에서 버튼을 44px로 키웠다').toBeGreaterThanOrEqual(44);
  expect(Math.abs(bar.stretched - bar.natural), '막대가 버튼 높이와 상관없이 글자 아래 같은 자리에 있다').toBeLessThanOrEqual(0.5);
});

// 필터는 복수 선택이므로 범례가 가로로 밀려도 한 번에 돌아갈 수 있어야 한다.
test('clearing filters restores counts without losing the selected node or keyboard focus', async ({ page }) => {
  await page.goto('/map/');
  const reset = page.getByRole('button', { name: '필터 해제', exact: true });
  await expect(reset).toBeHidden();
  const count = page.locator('[data-map-count]');
  const total = await count.textContent();
  await page.locator('.graph .node').first().click({ force: true });
  const selected = await page.locator('.graph .node.is-selected').getAttribute('data-id');
  if (await page.locator('.map-panel').getAttribute('aria-modal') === 'true') await page.keyboard.press('Escape');
  const topics = page.locator('[data-topic]');
  await topics.first().click();
  await page.locator('[data-hub-filter]').click();
  await expect(reset).toBeVisible();
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(reset).toBeHidden();
  await expect(page.locator('[data-topic][aria-pressed="true"], [data-hub-filter][aria-pressed="true"]')).toHaveCount(0);
  await expect(count).toHaveText(total!);
  await expect(page.locator('.graph .node.is-selected')).toHaveAttribute('data-id', selected!);
  await expect(topics.first()).toBeFocused();
});

// 해제 버튼의 출현이 범례를 줄바꿈시키거나 지도 전체를 밀지 않아야 한다.
test('toggling filters keeps the toolbar and graph in place', async ({ page, isMobile }) => {
  for (const width of [1017, 721, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/map/');
    const measure = () => page.evaluate(() => ({
      toolbar: document.querySelector('.map-toolbar')!.getBoundingClientRect().height,
      graph: document.querySelector('.graph-box')!.getBoundingClientRect().top,
      legend: document.querySelector('.legend')!.getBoundingClientRect().width
    }));
    const before = await measure();
    if (width === 1017) {
      if (isMobile) expect(before.toolbar).toBeGreaterThanOrEqual(44);
      else expect(before.toolbar).toBeLessThan(36);
    }
    await page.locator('[data-topic]').first().click();
    await expect(page.locator('[data-filter-reset]')).toBeVisible();
    expect(await measure()).toEqual(before);
    await page.locator('[data-filter-reset]').click();
    await expect(page.locator('[data-filter-reset]')).toBeHidden();
    await expect(page.locator('[data-filter-reset]')).toBeDisabled();
    expect(await measure()).toEqual(before);
  }
});

// 전체 보기는 전체 화면 전환이 아니라 확대·이동한 지도를 원래 맞춤으로 되돌린다.
test('the icon control fits the map after zooming and keeps separate button targets', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const fit = page.getByRole('button', { name: '지도 전체 보기', exact: true });
  const zoom = page.getByRole('button', { name: '확대', exact: true });
  // 아이콘 버튼은 접근 가능한 이름과 같은 툴팁을 둔다.
  await expect(fit).toHaveAttribute('title', (await fit.getAttribute('aria-label'))!);
  await expect(fit.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  const transform = () => page.locator('[data-map] > g').getAttribute('transform');
  const initial = await transform();
  await zoom.click();
  await expect.poll(transform).not.toBe(initial);
  await fit.click();
  await expect.poll(transform).toBe(initial);
  const boxes = await page.locator('.graph-controls button').evaluateAll(bs => bs.map(b => {
    const r = b.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, height: r.height };
  }));
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i].width).toBeGreaterThanOrEqual(isMobile ? 44 : 36);
    expect(boxes[i].height).toBeGreaterThanOrEqual(isMobile ? 44 : 36);
    if (i > 0) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].right);
  }
});
