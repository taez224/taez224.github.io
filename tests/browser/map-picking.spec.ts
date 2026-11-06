import { test, expect, gotoWithDefaultFontSize } from './fixtures.ts';

// @playwright/test를 바로 가져오지 않으므로(browser-setup.test.ts) 픽스처 함수의 매개변수에서 Page 타입을 얻는다.
type Page = Parameters<typeof gotoWithDefaultFontSize>[0];

type Pick = { expected: string; x: number; y: number };
type Case = 'covered-center' | 'filtered-dot' | 'overlap-only';

// 임시 vault는 실제 지도보다 노드가 적다. 무대를 줄여 같은 누름 영역 겹침을 만든다.
const openCrowdedMap = async (page: Page) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route(url => url.pathname === '/map/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('<head>', '<head><style>.graph-box { width: 180px !important; height: 220px !important; min-height: 0 !important; }</style>') });
  });
  await page.goto('/map/');
};

// 화면 좌표로 원(.dot)과 누름 영역(.hit)을 재고, 무대를 촘촘히 훑어 경우에 맞는 점과 그 점에서 골라야 할 노드를 찾는다.
// 선택이 없을 때 is-dim은 필터에서 빠진 노드만 뜻한다.
const findPick = (page: Page, kind: Case) => page.locator('.graph').evaluate((svg, kind): Pick | null => {
  const circles = [...svg.querySelectorAll<SVGGElement>('.node')].map(node => {
    const dot = node.querySelector('.dot')!.getBoundingClientRect(), hit = node.querySelector('.hit')!.getBoundingClientRect();
    return { id: node.dataset.id!, x: dot.x + dot.width / 2, y: dot.y + dot.height / 2, dot: dot.width / 2, hit: hit.width / 2, filtered: node.classList.contains('is-dim') };
  });
  const box = svg.getBoundingClientRect();
  const onNode = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('.node')?.closest('svg') === svg;
  if (kind === 'covered-center') {
    for (const c of circles) {
      const top = document.elementFromPoint(c.x, c.y)?.closest<SVGGElement>('.node');
      if (top && top.dataset.id !== c.id) return { expected: c.id, x: c.x, y: c.y };
    }
    return null;
  }
  for (let y = box.top + 1; y < box.bottom; y += 1.5) {
    for (let x = box.left + 1; x < box.right; x += 1.5) {
      // 원의 경계와 누름 영역의 경계에서는 반올림으로 판정이 갈릴 수 있어 1px 안쪽만 쓴다.
      const near = circles.map(c => ({ ...c, d: Math.hypot(c.x - x, c.y - y) })).filter(c => c.d < c.hit - 1).sort((a, b) => a.d - b.d);
      if (!near.some(c => c.filtered) || !near.some(c => !c.filtered) || !onNode(x, y)) continue;
      const inDot = near.filter(c => c.d < c.dot - 1), onEdge = near.some(c => Math.abs(c.d - c.dot) <= 1);
      if (onEdge) continue;
      if (kind === 'filtered-dot' && inDot.length === 1 && inDot[0].filtered) return { expected: inDot[0].id, x, y };
      if (kind === 'overlap-only' && inDot.length === 0 && near[0].filtered) return { expected: near.find(c => !c.filtered)!.id, x, y };
    }
  }
  return null;
}, kind);

// 주제와 허브 필터를 하나씩 켜 보며 그 경우가 생기는 필터를 찾는다. 찾지 못하면 필터를 끄고 다음으로 넘어간다.
const findWithFilter = async (page: Page, isMobile: boolean, kind: Case) => {
  const topics = page.locator('.legend button[data-topic], .legend [data-hub-filter]');
  for (let i = 0; i < await topics.count(); i++) {
    const press = () => isMobile ? topics.nth(i).tap() : topics.nth(i).click();
    await press();
    await expect(topics.nth(i)).toHaveAttribute('aria-pressed', 'true');
    const pick = await findPick(page, kind);
    if (pick) return pick;
    await press();
  }
  return null;
};

const pressAt = async (page: Page, isMobile: boolean, { x, y }: Pick) => {
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

test('pressing a circle center covered by another hit area selects that circle', async ({ page, isMobile }) => {
  await openCrowdedMap(page);
  const target = await findPick(page, 'covered-center');
  expect(target, '다른 노드의 투명 영역에 가려진 원 중심이 있다').not.toBeNull();
  await pressAt(page, isMobile, target!);
  await expect(page.locator('.graph .node[aria-pressed="true"]')).toHaveAttribute('data-id', target!.expected);
});

test('pressing the circle of a filtered-out node selects it over an overlapping node in the filter', async ({ page, isMobile }) => {
  await openCrowdedMap(page);
  const target = await findWithFilter(page, isMobile, 'filtered-dot');
  expect(target, '필터 안 노드의 누름 영역과 겹친 흐린 노드의 원이 있다').not.toBeNull();
  await pressAt(page, isMobile, target!);
  await expect(page.locator('.graph .node[aria-pressed="true"]')).toHaveAttribute('data-id', target!.expected);
});

test('where only hit areas overlap a node in the filter wins over a nearer filtered-out node', async ({ page, isMobile }) => {
  await openCrowdedMap(page);
  const target = await findWithFilter(page, isMobile, 'overlap-only');
  expect(target, '흐린 노드의 중심이 더 가깝고 원 밖인 겹친 자리가 있다').not.toBeNull();
  await pressAt(page, isMobile, target!);
  await expect(page.locator('.graph .node[aria-pressed="true"]')).toHaveAttribute('data-id', target!.expected);
});
