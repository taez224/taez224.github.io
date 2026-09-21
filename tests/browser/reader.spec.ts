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
