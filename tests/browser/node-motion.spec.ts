import { test, expect } from './fixtures.ts';

const points = (page: import('@playwright/test').Page) => page.locator('.graph .node').evaluateAll(nodes => Object.fromEntries(nodes.map(node => {
  const dot = node.querySelector('circle.dot')!;
  return [(node as SVGGElement).dataset.id!, { x: Number(dot.getAttribute('cx')), y: Number(dot.getAttribute('cy')) }];
})));

test('dragging a node moves its neighbors without panning or selecting and then settles', async ({ page }) => {
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const id = (await target.getAttribute('data-id'))!;
  const neighbors = await page.locator('[data-map-data]').evaluate((element, chosen) => {
    const { edges } = JSON.parse(element.textContent!);
    return edges.flatMap((edge: { source: string; target: string }) => edge.source === chosen ? [edge.target] : edge.target === chosen ? [edge.source] : []) as string[];
  }, id);
  const before = await points(page);
  const view = await page.locator('.graph > g').first().getAttribute('transform');
  const box = (await target.locator('.dot').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 25, { steps: 12 });
  await expect(page.locator('[data-map]')).toHaveAttribute('data-node-motion', 'dragging');
  await expect.poll(async () => {
    const after = await points(page);
    return neighbors.some(key => after[key] && Math.hypot(after[key].x - before[key].x, after[key].y - before[key].y) > 2);
  }).toBe(true);
  expect(await page.locator('.graph > g').first().getAttribute('transform')).toBe(view);
  expect(Math.hypot((await points(page))[id].x - before[id].x, (await points(page))[id].y - before[id].y)).toBeGreaterThan(30);
  const edge = (await page.locator('.graph .edge').first().elementHandle())!;
  const offset = () => page.locator('[data-map]').evaluate((svg, chosen) => {
    const node = [...svg.querySelectorAll<SVGGElement>('.node')].find(node => node.dataset.id === chosen)!;
    const label = [...svg.querySelectorAll<SVGTextElement>('[data-labels] text')].find(label => label.dataset.for === chosen)!;
    const dot = node.querySelector<SVGCircleElement>('.dot')!;
    return { x: Number(label.getAttribute('x')) - dot.cx.baseVal.value, y: Number(label.getAttribute('y')) - dot.cy.baseVal.value, anchor: label.getAttribute('text-anchor'), text: label.textContent };
  }, id);
  const beforeOffset = await offset();
  const regionOffsets = () => page.locator('[data-map]').evaluate(svg => {
    const { nodes } = JSON.parse(document.querySelector('[data-map-data]')!.textContent!);
    const topics = new Map<string, string>(nodes.map((node: { id: string; topic: string }) => [node.id, node.topic]));
    const totals = new Map<string, { x: number; y: number; count: number }>();
    for (const node of svg.querySelectorAll<SVGGElement>('.node')) {
      const topic = topics.get(node.dataset.id!)!, dot = node.querySelector<SVGCircleElement>('.dot')!;
      const total = totals.get(topic) ?? { x: 0, y: 0, count: 0 };
      total.x += dot.cx.baseVal.value; total.y += dot.cy.baseVal.value; total.count++;
      totals.set(topic, total);
    }
    return Object.fromEntries([...svg.querySelectorAll<SVGTextElement>('.region-label')].map(label => {
      const topic = label.textContent!, total = totals.get(topic)!;
      return [topic, { x: Number(label.getAttribute('x')) - total.x / total.count, y: Number(label.getAttribute('y')) - total.y / total.count, anchor: label.getAttribute('text-anchor') }];
    }));
  });
  const beforeRegions = await regionOffsets();
  await page.mouse.move(x + 90, y + 45, { steps: 8 });
  const afterOffset = await offset();
  expect(afterOffset.x).toBeCloseTo(beforeOffset.x, 5);
  expect(afterOffset.y).toBeCloseTo(beforeOffset.y, 5);
  expect(afterOffset.anchor).toBe(beforeOffset.anchor);
  expect(afterOffset.text).toBe(beforeOffset.text);
  expect(await edge.evaluate(line => line.isConnected)).toBe(true);
  const afterRegions = await regionOffsets();
  expect(Object.keys(afterRegions)).toEqual(Object.keys(beforeRegions));
  for (const topic of Object.keys(beforeRegions)) {
    expect(afterRegions[topic].x).toBeCloseTo(beforeRegions[topic].x, 3);
    expect(afterRegions[topic].y).toBeCloseTo(beforeRegions[topic].y, 3);
    expect(afterRegions[topic].anchor).toBe(beforeRegions[topic].anchor);
  }
  await page.mouse.up();
  await expect(page.locator('.graph .node.is-selected')).toHaveCount(0);
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  const settled = await points(page);
  await page.waitForTimeout(150);
  expect(await points(page)).toEqual(settled);
  await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
});

test('whole map restores the first layout, stops motion and preserves filters and selection', async ({ page, isMobile }) => {
  await page.goto('/map/');
  const original = await points(page);
  const scene = page.locator('.graph > g').first();
  const originalView = await scene.getAttribute('transform');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const box = (await target.locator('.dot').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 25, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('button', { name: '처음 배치로 돌아가 전체 보기', exact: true }).click();
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion');
  expect(await points(page)).toEqual(original);
  await expect(scene).toHaveAttribute('transform', originalView!);
  await page.waitForTimeout(200);
  expect(await points(page)).toEqual(original);
  await target.click();
  if (isMobile) await page.keyboard.press('Escape');
  await page.locator('[data-topic]').first().click();
  const selectedUrl = page.url();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.getByRole('button', { name: '처음 배치로 돌아가 전체 보기', exact: true }).click();
  await expect(scene).toHaveAttribute('transform', originalView!);
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-topic]').first()).toHaveAttribute('aria-pressed', 'true');
  expect(page.url()).toBe(selectedUrl);
  expect(await points(page)).toEqual(original);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`restoring titles with ${reducedMotion} motion`, () => {
    test.use({ reducedMotion });
    test('whole map restores resting titles after dragging and panning', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/map/');
      const scene = page.locator('[data-map] > g').first();
      const originalView = await scene.getAttribute('transform');
      const labels = () => page.locator('[data-labels] text').evaluateAll(labels => labels.map(label => [label.getAttribute('data-for'), label.getAttribute('x'), label.getAttribute('y')]));
      const originalLabels = await labels();
      const dot = page.getByRole('button', { name: '이웃 많은 노트', exact: true }).locator('.dot');
      const box = (await dot.boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 50, y + 20, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
      const stage = (await page.locator('[data-map]').boundingBox())!;
      await page.mouse.move(stage.x + 4, stage.y + 60);
      await page.mouse.down();
      await page.mouse.move(stage.x + 164, stage.y + 140, { steps: 10 });
      await page.mouse.up();
      await page.mouse.move(0, 0);
      expect(await scene.getAttribute('transform')).not.toBe(originalView);
      await page.getByRole('button', { name: '처음 배치로 돌아가 전체 보기', exact: true }).click();
      await expect(scene).toHaveAttribute('transform', originalView!);
      await expect.poll(labels).toEqual(originalLabels);
    });
  });
}

test('interrupting whole-map movement lays out titles at the stopped view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/map/');
  const scene = page.locator('[data-map] > g').first();
  const originalView = await scene.getAttribute('transform');
  const stage = (await page.locator('[data-map]').boundingBox())!;
  await page.mouse.move(stage.x + 4, stage.y + 60);
  await page.mouse.down();
  await page.mouse.move(stage.x + 164, stage.y + 140, { steps: 10 });
  await page.mouse.up();
  const panned = await scene.getAttribute('transform');
  await page.getByRole('button', { name: '처음 배치로 돌아가 전체 보기', exact: true }).click();
  await expect(scene).not.toHaveAttribute('transform', panned!);
  await page.mouse.move(stage.x + 4, stage.y + 60);
  await page.mouse.down();
  const stopped = await scene.getAttribute('transform');
  expect(stopped).not.toBe(originalView);
  const labels = () => page.locator('[data-labels] text').evaluateAll(labels => labels.map(label => [label.getAttribute('data-for'), label.getAttribute('x'), label.getAttribute('y')]));
  const atStop = await labels();
  await page.mouse.up();
  await expect(scene).toHaveAttribute('transform', stopped!);
  // 손을 떼며 일어나는 빈 곳 선택은 같은 시점에서 제목을 다시 그린다. 그때까지 옛 배치가 남아 있으면 안 된다.
  expect(await labels()).toEqual(atStop);
});

test('keyboard node preview survives the end of drag settling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/map/');
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const box = (await target.locator('.dot').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 25, { steps: 10 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await page.getByRole('button', { name: '축소', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-map]')).toHaveAttribute('data-node-motion', 'settling');
  const focused = page.locator('.graph .node:focus-visible');
  await expect(focused).toHaveCount(1);
  const id = await focused.getAttribute('data-id');
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  await expect(focused).toHaveAttribute('data-id', id!);
  await expect(page.locator('.graph .label.is-hovered')).toHaveAttribute('data-for', id!);
});

for (const change of ['scroll', 'resize'] as const) {
  test(`a held node follows the pointer after a page ${change}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto('/map/');
    const dot = page.getByRole('button', { name: '이웃 많은 노트', exact: true }).locator('.dot');
    const box = (await dot.boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 20, { steps: 6 });
    await expect(page.locator('[data-map]')).toHaveAttribute('data-node-motion', 'dragging');
    if (change === 'scroll') {
      const scroll = await page.evaluate(() => { window.scrollBy(0, 50); return scrollY; });
      expect(scroll).toBeGreaterThanOrEqual(40);
    } else {
      await page.setViewportSize({ width: 1280, height: 700 });
    }
    await page.mouse.move(x + 60, y + 30, { steps: 3 });
    await expect.poll(async () => {
      const at = (await dot.boundingBox())!;
      return Math.hypot(at.x + at.width / 2 - x - 60, at.y + at.height / 2 - y - 30);
    }, { timeout: 1500 }).toBeLessThan(2);
    await page.mouse.up();
  });
}

test('touch drags from node centers pan the map at phone and tablet sizes', async ({ page, isMobile }) => {
  test.skip(!isMobile, '터치 입력이 있는 화면에서 확인한다');
  const cdp = await page.context().newCDPSession(page);
  for (const [width, height] of [[320, 844], [390, 844], [820, 1180], [1180, 820]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/map/');
    const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
    const box = (await target.locator('.dot').boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const original = await points(page);
    const scene = page.locator('.graph > g').first();
    const view = await scene.getAttribute('transform');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 25, y: y + 20, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await scene.getAttribute('transform')).not.toBe(view);
    expect(await points(page)).toEqual(original);
    await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion');
    await expect(page.locator('.graph .node.is-selected')).toHaveCount(0);
  }
  await cdp.detach();
});

test('a cancelled touch pan leaves the next node tap available', async ({ page, isMobile }) => {
  test.skip(!isMobile, '터치 입력이 있는 화면에서 확인한다');
  await page.goto('/map/');
  const cdp = await page.context().newCDPSession(page);
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const box = (await target.locator('.dot').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const original = await points(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 45, y: y + 20, id: 1 }] });
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion');
  expect(await points(page)).toEqual(original);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  await expect(page.locator('.graph .node.is-selected')).toHaveCount(0);
  await expect(page.locator('[data-map]')).not.toHaveClass(/is-panning/);
  await target.tap();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog', { name: '노트 정보', exact: true })).toBeVisible();
  await cdp.detach();
});

test('two-finger zoom increases the scale and leaves the next node tap available', async ({ page, isMobile }) => {
  test.skip(!isMobile, '터치 입력이 있는 화면에서 확인한다');
  await page.goto('/map/');
  const cdp = await page.context().newCDPSession(page);
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const at = (await target.locator('.dot').boundingBox())!;
  const center = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
  const scene = page.locator('.graph > g').first();
  const scale = () => scene.evaluate(element => (element as SVGGElement).transform.baseVal.consolidate()!.matrix.a);
  const before = await scale();
  // 좌표를 한 번에 옮긴 확대 직후 Linux Chromium이 다음 즉시 탭의 click을 만들지 않는 경우가 있다.
  // 브라우저가 손가락 이동부터 떼기까지 생성하게 해 실제 제스처의 순서를 지킨다.
  await cdp.send('Input.synthesizePinchGesture', { ...center, scaleFactor: 1.5, gestureSourceType: 'touch' });
  await expect.poll(scale).toBeGreaterThan(before);
  await expect(page.locator('[data-map]')).not.toHaveClass(/is-panning/);
  await expect(page.locator('.graph .node.is-selected')).toHaveCount(0);
  const tapAt = (await target.locator('.dot').boundingBox())!;
  await cdp.send('Input.synthesizeTapGesture', { x: tapAt.x + tapAt.width / 2, y: tapAt.y + tapAt.height / 2, gestureSourceType: 'touch', duration: 100 });
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog', { name: '노트 정보', exact: true })).toBeVisible();
  await cdp.detach();
});

test('pen input can drag a node even in a touch-capable browser', async ({ page }) => {
  await page.goto('/map/');
  const cdp = await page.context().newCDPSession(page);
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const id = (await target.getAttribute('data-id'))!, original = await points(page);
  const box = (await target.locator('.dot').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'pen' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, pointerType: 'pen' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 50, y: y + 20, buttons: 1, pointerType: 'pen' });
  await expect(page.locator('[data-map]')).toHaveAttribute('data-node-motion', 'dragging');
  await expect.poll(async () => Math.hypot((await points(page))[id].x - original[id].x, (await points(page))[id].y - original[id].y)).toBeGreaterThan(20);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 50, y: y + 20, button: 'left', buttons: 0, pointerType: 'pen' });
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  await expect(page.locator('.graph .node.is-selected')).toHaveCount(0);
  await cdp.detach();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('releasing a node settles immediately without a trailing animation', async ({ page }) => {
    await page.goto('/map/');
    const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
    const box = (await target.locator('.dot').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion');
    const settled = await points(page);
    await page.waitForTimeout(100);
    expect(await points(page)).toEqual(settled);
  });
});

test('releasing a pending press outside the map cannot leave a stale node drag', async ({ page }) => {
  await page.goto('/map/');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const target = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const box = (await target.locator('.dot').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const original = await points(page);
  for (const type of ['pointerup', 'pointercancel']) {
    await target.dispatchEvent('pointerdown', { pointerId: 91, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y });
    await page.evaluate(eventType => window.dispatchEvent(new PointerEvent(eventType, { pointerId: 91, pointerType: 'mouse' })), type);
    await page.locator('[data-map]').dispatchEvent('pointermove', { pointerId: 91, pointerType: 'mouse', buttons: 0, clientX: x + 30, clientY: y });
    await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion');
    expect(await points(page)).toEqual(original);
  }
  expect(errors).toEqual([]);
  await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
});

test('dropping one node onto another leaves their visible circles separate', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/map/');
  const first = page.getByRole('button', { name: '이웃 많은 노트', exact: true });
  const second = page.getByRole('button', { name: '다른 주제 노트', exact: true });
  const center = async (node: typeof first) => { const box = (await node.locator('.dot').boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const at = await center(second);
  await page.mouse.move(at.x, at.y); await page.mouse.down();
  await page.mouse.move(at.x + 12, at.y + 12, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  const from = await center(first), to = await center(second);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  const a = (await first.locator('.dot').boundingBox())!, b = (await second.locator('.dot').boundingBox())!;
  expect(Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2)).toBeGreaterThanOrEqual((a.width + b.width) / 2 - .5);
});

test('hover resumes after release when the pointer still rests on a node', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/map/');
  const id = await page.locator('[data-map-data]').evaluate(element => {
    const { nodes, edges } = JSON.parse(element.textContent!);
    return nodes.find((node: { id: string }) => !edges.some((edge: { source: string; target: string }) => edge.source === node.id || edge.target === node.id)).id as string;
  });
  const target = page.locator(`.graph .node[data-id=${JSON.stringify(id)}]`);
  const box = (await target.locator('.dot').boundingBox())!;
  const clear = await page.locator('[data-map]').evaluate(svg => {
    const frame = svg.getBoundingClientRect();
    const dots = [...svg.querySelectorAll('.dot')].map(dot => dot.getBoundingClientRect());
    for (let y = frame.y + 60; y < frame.bottom - 60; y += 40) for (let x = frame.x + 60; x < frame.right - 60; x += 40) {
      if (dots.every(dot => Math.hypot(x - dot.x - dot.width / 2, y - dot.y - dot.height / 2) > 55)) return { x, y };
    }
    throw new Error('no clear drop location');
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(clear.x, clear.y, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  await expect(page.locator('.graph .label.is-hovered')).toHaveAttribute('data-for', id);
});

// 영역 이름은 맞춤 배율에서 자리를 정해야 확대·축소해도 새로 겹치지 않는다. 확대한 채 끌어 놓아도 같은 기준을 써야 한다.
test('region names placed after a zoomed drag match the placement the whole-map fit would choose', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/map/');
  // 영역 맨 위 노드를 아래로 끌어, 이름이 무대 위쪽 끝으로 밀려 들어가지 않고 영역 위에 놓이게 한다.
  const topNode = await page.locator('[data-map]').evaluate(svg => {
    const { nodes } = JSON.parse(document.querySelector('[data-map-data]')!.textContent!);
    const topic = svg.querySelector('.region-label')!.textContent;
    const ids = new Set(nodes.filter((node: { topic: string }) => node.topic === topic).map((node: { id: string }) => node.id));
    const dots = [...svg.querySelectorAll<SVGGElement>('.node')].filter(node => ids.has(node.dataset.id!));
    return dots.sort((a, b) => a.querySelector<SVGCircleElement>('.dot')!.cy.baseVal.value - b.querySelector<SVGCircleElement>('.dot')!.cy.baseVal.value)[0].dataset.id!;
  });
  const target = page.locator(`.graph .node[data-id=${JSON.stringify(topNode)}] .dot`);
  const start = (await target.boundingBox())!;
  const x = start.x + start.width / 2, y = start.y + start.height / 2;
  const scene = page.locator('.graph > g').first();
  await page.mouse.move(x, y);
  for (let i = 0; i < 6; i++) {
    const before = await scene.getAttribute('transform');
    await page.mouse.wheel(0, -100);
    await expect(scene).not.toHaveAttribute('transform', before!);
  }
  const zoomed = (await target.boundingBox())!;
  const zx = zoomed.x + zoomed.width / 2, zy = zoomed.y + zoomed.height / 2;
  await page.mouse.move(zx, zy); await page.mouse.down();
  await page.mouse.move(zx, zy + 260, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('[data-map]')).not.toHaveAttribute('data-node-motion', { timeout: 1500 });
  const regionNames = () => page.locator('.graph .region-label').evaluateAll(labels => labels.map(label => [label.textContent, label.getAttribute('x'), label.getAttribute('y'), label.getAttribute('text-anchor')]));
  const afterDrag = await regionNames();
  // 무대 폭이 바뀌면 지도는 맞춤 배율로 영역 이름을 다시 정한다. 원래 폭으로 돌아오면 같은 배치에서 맞춤 기준의 자리가 나온다.
  await page.setViewportSize({ width: 980, height: 900 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(regionNames).toEqual(afterDrag);
});
