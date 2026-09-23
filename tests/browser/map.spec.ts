import { test, expect, pressedBarGaps } from './fixtures.ts';

// 흐려진 노드는 화면에서 22%로 남고 포커스 링도 함께 흐려진다. 탭 순서에 두면 보이지 않는 대상을 수십 번 지나가게 된다.
test('selecting a node takes the dimmed nodes out of the tab order', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  await expect(target).toHaveCount(1);
  if (isMobile) await target.tap(); else await target.click();
  await expect(page.locator('.graph .node.is-dim').first()).toBeVisible();
  const tabbable = await page.locator('.graph .node').evaluateAll((nodes) => ({
    dim: nodes.filter((node) => node.classList.contains('is-dim')).length,
    dimTabbable: nodes.filter((node) => node.classList.contains('is-dim') && node.getAttribute('tabindex') === '0').length,
    litTabbable: nodes.filter((node) => !node.classList.contains('is-dim') && node.getAttribute('tabindex') === '0').length
  }));
  expect(tabbable.dim).toBeGreaterThan(0);
  expect(tabbable.dimTabbable).toBe(0);
  expect(tabbable.litTabbable).toBeGreaterThan(0);
});

// 선택을 풀면 모든 노드가 다시 탭 순서로 돌아와야 한다. 한 번 뺀 뒤 되돌리지 않으면 지도가 키보드로 닫힌다.
test('clearing the selection puts every node back in the tab order', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  if (isMobile) await target.tap(); else await target.click();
  await expect(page.locator('.graph .node.is-dim').first()).toBeVisible();
  // 휴대폰 폭은 노드를 고르면 시트가 함께 열린다. 첫 Escape가 시트를 닫고 다음 Escape가 선택을 푼다.
  await page.keyboard.press('Escape');
  if (isMobile) await page.keyboard.press('Escape');
  await expect(page.locator('.graph .node.is-dim')).toHaveCount(0);
  const total = await page.locator('.graph .node').count();
  expect(await page.locator('.graph .node[tabindex="0"]').count()).toBe(total);
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

// 노드는 버튼으로 읽히는데 Space와 Enter가 다른 일을 한다. 버튼의 약속과 다르므로 화면에 설명이 있어야 한다.
test('the map explains its two keys and names its hubs', async ({ page }) => {
  await page.goto('/map/');
  const described = await page.locator('[data-map]').getAttribute('aria-describedby');
  expect(described).toBeTruthy();
  const hint = await page.locator(`#${described}`).textContent();
  expect(hint).toMatch(/Enter/);
  expect(hint).toMatch(/Space/);
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

// 휴대폰 폭 지도에서 허브 제목을 자리가 없어도 아래에 두었더니 제목끼리, 또는 영역 이름과 겹쳤다. 오른쪽 아래 확대 조작은
// 영역 이름을 가렸다. 첫 화면과 노드를 하나씩 고른 화면에서 보이는 글자끼리 겹치지 않고 조작 아래로 들어가지 않는지 잰다.
// 고른 제목 아래 깔린 영역 이름은 흐려지므로(is-under-label) 겹침에서 뺀다.
test('map labels stay apart and clear of the zoom controls on a phone', async ({ page }) => {
  const clashes = () => page.evaluate(() => {
    const boxes = [...document.querySelectorAll<SVGTextElement>('.map-stage svg text:not(.is-under-label)')]
      .filter((text) => text.textContent!.trim() && text.getBoundingClientRect().width > 0)
      .map((text) => ({ name: text.textContent!.trim(), box: text.getBoundingClientRect() }));
    const controls = document.querySelector('.graph-controls')!.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const found: string[] = [];
    boxes.forEach((a, i) => {
      if (hit(a.box, controls)) found.push(`${a.name} × 확대 조작`);
      for (const b of boxes.slice(i + 1)) if (hit(a.box, b.box)) found.push(`${a.name} × ${b.name}`);
    });
    return found;
  });
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
});

// 어두운 화면의 뒤 배경은 검정 반투명이다. 먹색이 밝아지므로 밝은 화면처럼 먹색을 섞으면 지도가 회색으로 뜬다.
// 전역 스타일 블록에서 :global()로 감싼 선택자는 브라우저가 버려서 이 규칙이 통째로 빠진 적이 있다.
test('the sheet backdrop darkens the map in the dark theme', async ({ page }) => {
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
test('the map reveals its key hint to the keyboard and keeps it from the mouse', async ({ page, isMobile }) => {
  test.skip(isMobile, '키로 오갈 수 있는 기기에서 볼 안내다');
  await page.goto('/map/');
  const hint = page.locator('.key-hint');
  const held = page.locator('.graph .node:focus-visible');
  await expect(hint).toHaveCSS('opacity', '0');
  // 마우스로 누른 노드도 포커스를 받지만 :focus-visible은 아니다.
  await page.locator('.graph .node').first().click({ force: true });
  await expect(page.locator('.graph .node:focus')).toHaveCount(1);
  await expect(hint).toHaveCSS('opacity', '0');
  // 고른 노드를 풀어야 흐려진 노드가 탭 순서로 돌아온다.
  await page.keyboard.press('Escape');
  await page.locator('.legend button').last().focus();
  for (let step = 0; step < 6 && (await held.count()) === 0; step += 1) await page.keyboard.press('Tab');
  await expect(held).toHaveCount(1);
  await expect(hint).toHaveCSS('opacity', '1');
  // 숨긴 설명은 그대로 남는다. 보이는 안내는 그 말을 눈으로도 볼 수 있게 할 뿐이다.
  await expect(page.locator('#map-keys')).toHaveCount(1);
});

// 키 안내와 확대 버튼이 모두 무대 아래쪽 12px에 놓여, 좁은 화면에서는 안내 끝을 버튼이 가렸다.
test('the key hint stays clear of the zoom controls on a phone', async ({ page }) => {
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
  await expect(fit).toHaveAttribute('title', '지도 전체 보기');
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
