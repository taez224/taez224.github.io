import { test, expect } from './fixtures.ts';

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
  for (const width of [720, 721, 1000, 1440, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (isMobile || width <= 720) {
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
