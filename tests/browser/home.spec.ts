import { test, expect, gotoWithDefaultFontSize, gotoBeforeModules, textsOnRings } from './fixtures.ts';

// 위아래로 넓힌 누르는 영역이 아래 그림까지 내려오면, 그림을 눌렀는데 소개 페이지가 열린다.
test('the hero links stay out of the map image below them', async ({ page, isMobile }) => {
  test.skip(!isMobile, '누르는 영역은 터치 기기에서만 넓힌다');
  await page.goto('/');
  const hits = await page.evaluate(() => {
    const snapshot = document.querySelector('.hero-snapshot');
    if (!snapshot) return null;
    const box = snapshot.getBoundingClientRect();
    // 그림의 맨 윗변을 가로로 훑는다. 어느 지점에서도 지도 말고 다른 곳으로 가면 안 된다.
    return Array.from({ length: 19 }, (_, i) => {
      const element = document.elementFromPoint(box.left + (box.width * (i + 1)) / 20, box.top + 2);
      return element?.closest('a')?.getAttribute('href') ?? null;
    });
  });
  expect(hits).not.toBeNull();
  expect(hits!.filter((href) => href !== '/map/')).toEqual([]);
});

// 행 전체가 제목 링크인데 그 위에 올린 분류 링크가 열을 가득 채우면, 빈 곳을 눌러도 노트가 열리지 않는다.
// 다만 "글"처럼 한 글자짜리는 11px이라 맞히기 어려워, WCAG 2.5.8의 최소 24px까지만 넓힌다.
test('the kind link in a recent row is at least 24px and no wider than it needs', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('.recent li').filter({ has: page.locator('.recent-kind') });
  await expect(rows.first()).toBeAttached();
  for (const row of await rows.all()) {
    await row.scrollIntoViewIfNeeded();
    const measured = await row.evaluate((item) => {
      const kind = item.querySelector('.recent-kind')!;
      const range = item.ownerDocument.createRange();
      range.selectNodeContents(kind);
      const box = kind.getBoundingClientRect();
      const at = (x: number, y: number) => item.ownerDocument.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null;
      return {
        label: kind.textContent,
        width: box.width,
        textWidth: range.getBoundingClientRect().width,
        titleHref: item.querySelector('.recent-title')!.getAttribute('href'),
        // 분류 링크 바로 오른쪽의 빈 자리다. 여기는 노트로 가야 한다.
        beside: at(box.right + 4, box.top + box.height / 2)
      };
    });
    expect(measured.width, `${measured.label}: 최소 24px`).toBeGreaterThanOrEqual(24);
    expect(measured.width, `${measured.label}: 글자와 최소 폭보다 넓지 않다`).toBeLessThanOrEqual(Math.max(measured.textWidth, 24) + 1);
    expect(measured.beside, `${measured.label}: 옆 빈 자리는 노트로 간다`).toBe(measured.titleHref);
  }
});

// 태블릿 세로 폭도 살아 있는 지도의 경계 안이었다. 그 SVG가 세로 스와이프를 가져가 페이지가 내려가지 않았다.
test.describe('손가락으로 쓰는 태블릿', () => {
  test.use({ viewport: { width: 834, height: 1000 }, hasTouch: true, isMobile: true });
  test('a touch tablet gets the static map instead of the one that takes the swipe', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero-snapshot')).toBeVisible();
    await expect(page.locator('.hero-graph > .graph')).toHaveCount(0);
  });
});

// 1000px을 넘는 폭에서 첫 화면은 높이가 고정된 상자이고 소개 블록이 절대 배치였다.
// 글자를 키우면 내용이 상자를 넘어가는데 넘친 부분은 잘려서 스크롤로도 되찾을 수 없었다.
test('the hero keeps its intro whole when the reader enlarges the text', async ({ page, isMobile }) => {
  test.skip(isMobile, '이 배치는 1000px을 넘는 폭에서만 쓴다');
  await page.setViewportSize({ width: 1440, height: 700 });
  for (const size of [24, 32]) {
    await gotoWithDefaultFontSize(page, '/', size);
    await expect(page.locator('.hero-about .contacts a')).toHaveCount(1);
    const overflow = await page.evaluate(() => {
      const hero = document.querySelector('.hero')!.getBoundingClientRect();
      const boxes = [...document.querySelectorAll('.hero-about, .hero-about a')].map((el) => el.getBoundingClientRect());
      return Math.max(...boxes.map((box) => box.bottom - hero.bottom));
    });
    expect(overflow, `기본 글자 ${size}px`).toBeLessThanOrEqual(0);
  }
});

// 첫 화면의 소개 블록은 1180px 본문 열이 화면 가운데 있다고 보고 자리를 잡는다.
// 화면이 그보다 좁으면 왼쪽으로 밀려나 제목과 소개문의 앞부분이 잘린다.
test('the hero intro stays inside the viewport on screens narrower than the content column', async ({ page, isMobile }) => {
  test.skip(isMobile, '이 배치는 1000px을 넘는 폭에서만 쓴다');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/');
  const left = await page.locator('.hero-about').evaluate((el) => el.getBoundingClientRect().left);
  expect(left).toBeGreaterThanOrEqual(0);
});

// 높이가 낮은 휴대폰에서 지도가 첫 화면을 다 차지해, 홈이 권하는 대표 글을 보려면 스크롤해야 했다. 화면 높이에 맞춰 지도를
// 이어서 줄이고, 키가 큰 휴대폰은 지도를 그대로 둔다. 높이 경계에서 한 번에 줄였더니 1px 차이로 지도가 120px 바뀌었다.
// 검사 vault에는 대표 글이 없어 지도 다음 절의 제목이 첫 화면에 드는지로 본다.
test('a short phone shrinks the home map smoothly so the next section starts on the first screen', async ({ page }) => {
  const measure = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    return page.evaluate(() => ({
      map: document.querySelector('.hero-graph')!.getBoundingClientRect().height,
      next: document.querySelector('.home-section .section-title')!.getBoundingClientRect().top
    }));
  };
  const short = await measure(375, 667);
  expect(short.next, '지도 다음 절의 제목이 첫 화면에 든다').toBeLessThan(667 - 40);
  const [below, above] = [await measure(375, 760), await measure(375, 761)];
  expect(Math.abs(above.map - below.map), '화면 높이 1px 차이로 지도 높이가 크게 바뀌지 않는다').toBeLessThanOrEqual(2);
  expect((await measure(320, 568)).map, '지도는 150px 아래로 줄이지 않는다').toBeCloseTo(150, 0);
  expect((await measure(390, 844)).map, '키가 큰 휴대폰은 지도를 그대로 둔다').toBeGreaterThan(280);
});

// 홈 노드는 누르면 그 노트로 이동할 뿐 눌린 채로 남지 않는다.
// 그런데도 aria-pressed를 달면 낭독기에 눌리지 않는 토글 버튼 수십 개로 읽힌다.
test('home map nodes do not claim a pressed state', async ({ page, isMobile }) => {
  test.skip(isMobile, '살아 있는 지도는 마우스가 있는 기기에만 올라온다');
  await page.goto('/');
  const graph = page.locator('.hero-graph > .graph');
  await expect(graph).toBeVisible();
  await expect(graph.locator('.node').first()).toBeAttached();
  await expect(graph.locator('.node[aria-pressed]')).toHaveCount(0);
});

// 호버 예고편은 지도에서만 쓴다. 홈은 호버해도 간선과 노드 상태가 그대로이므로,
// 다시 그리면 같은 결과를 만들려고 간선 전체를 버렸다가 새로 만든다.
test('hovering a node on the home map only moves the titles', async ({ page, isMobile }) => {
  test.skip(isMobile, '살아 있는 지도는 마우스가 있는 기기에만 올라온다');
  await page.goto('/');
  const graph = page.locator('.hero-graph > .graph');
  await expect(graph).toBeVisible();
  await graph.locator('line.edge').first().evaluate((line) => line.setAttribute('data-kept', ''));
  const node = graph.locator('.node').first();
  const id = await node.getAttribute('data-id');
  await node.hover();
  const hovered = await graph.locator('[data-labels] text.is-hovered').evaluateAll((texts) => texts.map((text) => text.getAttribute('data-for')));
  expect(hovered).toEqual([id]);
  // 간선을 다시 만들었다면 표시해 둔 선이 사라진다.
  await expect(graph.locator('line[data-kept]')).toHaveCount(1);
});

// 제목을 점 아래에 두었더니 허브 고리와 입구 노드 후광이 제목 윗부분에 걸렸다. 홈 지도는 정적 그림과 살아 있는 지도가
// 같은 자리에 제목을 두어야 하므로 둘 다 잰다. 터치 태블릿은 살아 있는 지도 없이 정적 그림만 본다.
test('home map titles sit clear of the node rings', async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 768, height: 1024 } : { width: 1440, height: 900 });
  await gotoBeforeModules(page, '/');
  const picture = page.locator('.hero-graph svg:visible').first();
  await expect(picture).toBeVisible();
  expect(await picture.evaluate(textsOnRings), '정적 그림').toEqual([]);
  if (isMobile) return;
  await page.unroute('**/*');
  await page.goto('/');
  const live = page.locator('svg.graph.hero');
  await expect(live).toBeVisible();
  expect(await live.evaluate(textsOnRings), '살아 있는 지도').toEqual([]);
});
