import { test, expect, gotoWithDefaultFontSize, gotoBeforeModules, textsOnRings, BOTH_THEMES } from './fixtures.ts';

test('home keeps the same top tint and footer surface as the other pages', { tag: BOTH_THEMES }, async ({ page }) => {
  const surfaces = async (url: string) => {
    await page.goto(url);
    return page.evaluate(() => {
      const tint = getComputedStyle(document.body, '::before');
      return {
        tintDisplay: tint.display,
        tintImage: tint.backgroundImage,
        footer: getComputedStyle(document.querySelector('.site-footer')!).backgroundColor,
        footerBorder: getComputedStyle(document.querySelector('.site-footer .wrap')!).borderTopWidth
      };
    });
  };
  const reference = await surfaces('/books/');
  expect(reference.tintDisplay).not.toBe('none');
  expect(reference.tintImage).toContain('linear-gradient');
  expect(await surfaces('/')).toEqual(reference);
});

// 위아래로 넓힌 누르는 영역이 아래 그림까지 내려오면, 그림을 눌렀는데 소개 페이지가 열린다.
test('the hero links stay out of the map image below them', async ({ page, isMobile }) => {
  test.skip(!isMobile, '누르는 영역은 터치 기기에서만 넓힌다');
  await page.goto('/');
  const hits = await page.evaluate(() => {
    const snapshot = document.querySelector('.hero-snapshot');
    if (!snapshot) return null;
    const box = snapshot.getBoundingClientRect();
    // 그림의 맨 윗변을 가로로 훑는다. 그림 자체의 지도 링크 외에 소개 링크가 덮이면 안 된다.
    return Array.from({ length: 19 }, (_, i) => {
      const element = document.elementFromPoint(box.left + (box.width * (i + 1)) / 20, box.top + 2);
      return element?.closest('a')?.getAttribute('href') ?? null;
    });
  });
  expect(hits).not.toBeNull();
  expect(hits!.every((href) => href === '/map/')).toBe(true);
});

test('the static home map opens the full map on a touch device', async ({ page, isMobile }) => {
  test.skip(!isMobile, '마우스 화면에서는 노드를 눌러 노트로 간다');
  for (const width of [390, 834]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.locator('.hero-snapshot').tap();
    await expect(page).toHaveURL(/\/map\/$/);
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

// 소개와 지도를 겹치지 않는 흐름으로 두고, 낮은 휴대폰에서도 지도의 영역 이름을 읽을 공간을 남긴다.
test('the home intro and map keep separate space side by side or stacked on narrow screens', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1121, 800], [1120, 800], [1100, 900], [1001, 800], [1000, 800], [721, 800], [720, 800], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const intro = rect('.hero-about'), graph = rect('.hero-graph'), hero = rect('.hero');
      return { introLeft: intro.left, introBottom: intro.bottom, introRight: intro.right, graphLeft: graph.left, graphTop: graph.top,
        graphWidth: graph.width, heroWidth: hero.width, graphHeight: graph.height,
        overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    // 왼쪽으로 밀려난 요소는 scrollWidth에 잡히지 않으므로 소개의 시작 위치를 직접 확인한다.
    expect(boxes.introLeft, `${width}px: 소개의 왼쪽이 잘리지 않는다`).toBeGreaterThanOrEqual(0);
    if (width > 1120) {
      expect(boxes.graphLeft, `${width}px: 소개 오른쪽에 지도를 둔다`).toBeGreaterThan(boxes.introRight);
      expect(boxes.graphTop).toBeLessThan(boxes.introBottom);
    } else {
      expect(boxes.graphTop, `${width}px: 소개 링크와 그림이 겹치지 않는다`).toBeGreaterThanOrEqual(boxes.introBottom);
      expect(boxes.graphWidth).toBeCloseTo(boxes.heroWidth, 0);
    }
    expect(boxes.graphHeight, `${width}px: 지도를 최소 높이보다 줄이지 않는다`).toBeGreaterThanOrEqual(width <= 720 ? 149.5 : 374.5);
    expect(boxes.overflow, `${width}px: 가로 넘침이 없다`).toBe(false);
    if (width > 720) await expect(page.locator('.hero-about .contacts')).toBeVisible();
    else await expect(page.locator('.hero-about .contacts')).toBeHidden();
  }
});

// 구역명만 재면 그 아래 실제 글 제목이 화면 밖으로 밀려도 통과한다. 기본 글자 크기에서는 제목 첫 줄 전체를 확보한다.
test('a phone leaves the first line of the featured article on the first screen', async ({ page }) => {
  const measure = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(() => {
      const title = document.querySelector('.featured-copy h3')!;
      return { firstLineBottom: title.getBoundingClientRect().top + parseFloat(getComputedStyle(title).lineHeight),
        map: document.querySelector('.hero-graph')!.getBoundingClientRect().height };
    });
  };
  for (const [width, height] of [[360, 740], [375, 667], [375, 812], [390, 844], [430, 932]]) {
    expect((await measure(width, height)).firstLineBottom, `${width}×${height}: 대표 글 첫 줄`).toBeLessThanOrEqual(height);
  }
  const [below, above] = [await measure(375, 760), await measure(375, 761)];
  expect(Math.abs(above.map - below.map), '화면 높이 경계에서도 연속해서 변한다').toBeLessThanOrEqual(2);
  expect((await measure(320, 568)).map, '아주 작은 화면에서는 지도의 최소 크기를 지킨다').toBeGreaterThanOrEqual(149.5);
});

test('the short phone map keeps its region names inside the picture', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  const outside = await page.locator('.hero-snapshot svg.is-mobile').evaluate((svg) => {
    const frame = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('.snap-regions-compact text')].filter((text) => {
      const b = text.getBoundingClientRect();
      return b.top < frame.top || b.bottom > frame.bottom || b.left < frame.left || b.right > frame.right;
    }).map((text) => text.textContent);
  });
  expect(outside).toEqual([]);
});

test('the mobile intro stays readable when the reader doubles the text size', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoWithDefaultFontSize(page, '/', 32);
    const result = await page.evaluate(() => {
      const intro = document.querySelector('.hero-about')!.getBoundingClientRect();
      const graph = document.querySelector('.hero-graph')!.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > window.innerWidth, gap: graph.top - intro.bottom };
    });
    expect(result.overflow).toBe(false);
    expect(result.gap).toBeGreaterThanOrEqual(0);
  }
});

// 가장자리를 옅게 하는 마스크를 상자 전체에 걸었더니, 가장자리 가까이 놓인 영역 이름이 배경에 묻혔다(1280px에서 1.68:1).
// 마스크는 도형 층에만 씌우므로 어느 그림의 글자도 마스크를 씌운 요소 안에 있으면 안 되고, 상자에는 CSS 마스크가 없어야 한다.
test('the wide home map fades its edges without fading any text', { tag: BOTH_THEMES }, async ({ page, isMobile }) => {
  test.skip(isMobile, '가장자리를 네 방향으로 옅게 하는 그림은 넓은 화면에서만 쓴다');
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoBeforeModules(page, '/');
  const inspect = (svg: SVGSVGElement) => ({
    masked: svg.querySelectorAll('[mask] text').length,
    texts: svg.querySelectorAll('text').length,
    boxMask: getComputedStyle(svg.closest('.hero-graph')!).maskImage
  });
  const snapshot = await page.locator('.hero-graph svg.is-desktop').evaluate(inspect);
  expect(snapshot.texts, '정적 그림에 글자가 있다').toBeGreaterThan(0);
  expect(snapshot.boxMask).toBe('none');
  await page.unroute('**/*');
  await page.goto('/');
  const live = page.locator('svg.graph.hero');
  await expect(live).toBeVisible();
  await expect(live.locator('[data-region-labels] text').first()).toBeAttached();
  expect((await live.evaluate(inspect)).masked, '살아 있는 지도').toBe(0);
});

// 홈 노드는 누르면 그 노트로 이동할 뿐 눌린 채로 남지 않는다.
// 그런데도 aria-pressed를 달면 낭독기에 눌리지 않는 토글 버튼 수십 개로 읽힌다.
// 다듬은 노트의 물뿌리개는 행에 마우스를 올리거나 키보드로 들어오면 물방울이 흩어진 둘째 장면으로 바뀐다.
// 움직임 줄이기를 켠 독자에게는 그림이 바뀌는 것도 움직임이라 바뀌지 않아야 한다.
test('the tended mark pours on hover and keyboard focus but holds still with reduced motion', async ({ page, isMobile }) => {
  test.skip(isMobile, '호버는 마우스가 있는 기기에서 본다');
  await page.goto('/');
  const row = page.locator('.recent li', { has: page.locator('.tended') }).first();
  const scenes = () => row.locator('.tended svg path').evaluateAll((paths) => paths.map((path) => getComputedStyle(path).display));
  await expect.poll(scenes, '평소에는 첫 장면').toEqual(['inline', 'none']);
  await row.hover();
  await expect.poll(scenes, '행에 올리면 둘째 장면').toEqual(['none', 'inline']);
  await page.mouse.move(0, 0);
  await expect.poll(scenes, '떠나면 첫 장면').toEqual(['inline', 'none']);
  await row.locator('.recent-title').focus();
  await expect.poll(scenes, '키보드로 들어와도 둘째 장면').toEqual(['none', 'inline']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await row.hover();
  await expect.poll(scenes, '움직임 줄이기에서는 첫 장면에 둔다').toEqual(['inline', 'none']);
});

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

test('home nodes show their inline titles and open the note at intermediate mouse widths', async ({ page, isMobile }) => {
  test.skip(isMobile, '터치 기기는 스크롤을 위해 정적 그림을 쓴다');
  for (const width of [721, 918, 1000, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const graph = page.locator('.hero-graph > .graph');
    const title = graph.locator('[data-labels] text.is-hovered');
    await expect(graph).toBeVisible();
    const node = graph.locator('.node').first();
    await node.hover();
    await expect(title).toBeVisible();
    await expect(title).toHaveAttribute('data-for', (await node.getAttribute('data-id'))!);
    expect((await title.textContent())!.replace(/\s/g, '')).toBe((await node.getAttribute('aria-label'))!.replace(/\. 허브$/, '').replace(/\s/g, ''));
    await page.mouse.move(0, 0);
    await expect(title).toHaveCount(0);
    await graph.click({ position: { x: 2, y: 2 } });
    await expect(page).toHaveURL(/\/$/);
    await node.hover();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(graph).toBeHidden();
    await expect(page.locator('.hero-snapshot')).toBeVisible();
    // 숨긴 동안 포인터가 떠났다면, 다시 넓혀도 전에 가리킨 제목이 남아 있으면 안 된다.
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width, height: 900 });
    await expect(title).toHaveCount(0);
    const id = await node.getAttribute('data-id');
    const href = await page.locator('[data-hero-data]').evaluate((el, selected) => JSON.parse(el.textContent!).nodes.find((n: { id: string; url: string }) => n.id === selected).url, id);
    await node.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  }
});

test('home region names stay clear of resting node titles at intermediate mouse widths', async ({ page, isMobile }) => {
  test.skip(isMobile, '터치 기기는 정적 그림을 쓴다');
  for (const width of [721, 918, 1000, 1121, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const graph = page.locator('.hero-graph > .graph');
    await expect(graph).toBeVisible();
    const overlaps = await graph.evaluate((svg) => {
      const regions = [...svg.querySelectorAll('[data-region-labels] text')];
      const titles = [...svg.querySelectorAll('[data-labels] text')];
      return regions.flatMap((region) => titles.flatMap((title) => {
        const a = region.getBoundingClientRect(), b = title.getBoundingClientRect();
        return a.width && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
          ? [`${region.textContent} × ${title.textContent}`] : [];
      }));
    });
    expect(overlaps, `${width}px: 영역 이름과 노드 제목`).toEqual([]);
  }
});

test('home dates align within each list and move below titles when the list is narrow', async ({ page }) => {
  for (const width of [320, 390, 720, 918, 1120, 1121, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const lists = await page.locator('.recent').evaluateAll((items) => items.map((list) => {
      const font = parseFloat(getComputedStyle(list).fontSize);
      return { inline: list.clientWidth >= 26 * font, rows: [...list.querySelectorAll('li')].map((item) => {
        const title = item.querySelector('.recent-main')!.getBoundingClientRect();
        const meta = item.querySelector('.recent-meta')!.getBoundingClientRect();
        return { beside: meta.left > title.right, below: meta.top >= title.bottom, right: meta.right, overflow: item.scrollWidth > item.clientWidth };
      }) };
    }));
    for (const list of lists) {
      for (const row of list.rows) {
        expect(row.overflow).toBe(false);
        expect(list.inline ? row.beside : row.below).toBe(true);
      }
      if (list.inline && list.rows.length > 1) expect(Math.max(...list.rows.map((r) => r.right)) - Math.min(...list.rows.map((r) => r.right))).toBeLessThan(1);
    }
  }
});

test('recent metadata stays readable with double size browser text', async ({ page }) => {
  for (const width of [320, 720, 1121, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoWithDefaultFontSize(page, '/', 32);
    const rows = await page.locator('.recent li').evaluateAll((items) => items.map((item) => {
      const title = item.querySelector('.recent-main')!.getBoundingClientRect();
      const meta = item.querySelector('.recent-meta')!.getBoundingClientRect();
      const fields = [...item.querySelectorAll('.recent-meta > *')].map((field) => field.getBoundingClientRect());
      return { below: meta.top > title.bottom, fits: fields.every((field) => field.left >= meta.left && field.right <= meta.right + 1), overflow: item.scrollWidth > item.clientWidth };
    }));
    for (const row of rows) expect(row).toEqual({ below: true, fits: true, overflow: false });
  }
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


test('home books use four columns on wide screens and two on phones without clipping', async ({ page }) => {
  for (const width of [320, 390, 720, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const shelf = page.locator('.home-shelf');
    const layout = await shelf.evaluate((el) => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      overflow: el.scrollWidth > el.clientWidth,
      links: [...el.querySelectorAll('a')].map((link) => ({ href: link.getAttribute('href'), label: link.getAttribute('aria-label') }))
    }));
    expect(layout.columns).toBe(width <= 720 ? 2 : 4);
    expect(layout.overflow).toBe(false);
    expect(layout.links.length).toBeGreaterThan(0);
    for (const link of layout.links) {
      expect(link.href).toMatch(/^\/books\/#book-/);
      expect(link.label).toBeTruthy();
    }
    const order = await page.locator('.home-grid > section').evaluateAll((sections) => sections.map((el) => ({ name: el.className, top: el.getBoundingClientRect().top })));
    if (width <= 720) expect([...order].sort((a, b) => a.top - b.top).map((item) => item.name)).toEqual(['home-articles', 'home-thoughts', 'home-development', 'home-books']);
  }
});


// 살아 있는 지도에서는 헤더 메뉴가 전체 지도로 가는 길이다. 정적 그림을 쓰는 화면에서는 그림 전체가 지도 링크다.
test('the introduction links to the about page and only the static map links to the full map', async ({ page }) => {
  for (const width of [390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.about-actions a')).toHaveText('이 위키에 대해');
    await expect(page.locator('.about-actions a')).toHaveAttribute('href', '/about/');
    const live = await page.evaluate(() => matchMedia('(min-width: 721px) and (hover: hover) and (pointer: fine)').matches);
    const snapshot = page.locator('.hero a[href="/map/"]');
    await expect(snapshot).toHaveCount(1);
    if (live) await expect(snapshot).toBeHidden(); else await expect(snapshot).toBeVisible();
  }
});
