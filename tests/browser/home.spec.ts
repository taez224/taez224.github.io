import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
  // 테스트 내용은 로컬 임시 vault뿐이다. 분석 도구 등 외부 요청은 필요 없다.
  await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

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
test('the kind link in a recent row covers its own text only', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('.recent li').filter({ has: page.locator('.recent-kind') }).first();
  await row.scrollIntoViewIfNeeded();
  const measured = await row.evaluate((item) => {
    const kind = item.querySelector('.recent-kind')!;
    const range = item.ownerDocument.createRange();
    range.selectNodeContents(kind);
    const box = kind.getBoundingClientRect();
    const title = item.querySelector('.recent-title')!;
    const at = (x: number, y: number) => item.ownerDocument.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null;
    const text = range.getBoundingClientRect();
    return {
      width: box.width,
      textWidth: text.width,
      titleHref: title.getAttribute('href'),
      // 글자 오른쪽의 빈 자리다. 분류 링크가 열을 채우면 이 자리도 그 링크가 가져간다.
      besideTheText: at(text.right + 8, box.top + box.height / 2)
    };
  });
  expect(measured.width).toBeLessThan(measured.textWidth + 8);
  expect(measured.besideTheText).toBe(measured.titleHref);
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
  await page.goto('/');
  await expect(page.locator('.hero-about .contacts a')).toHaveCount(1);
  for (const size of [24, 32]) {
    await page.addStyleTag({ content: `html { font-size: ${size}px }` });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => {
      const hero = document.querySelector('.hero')!.getBoundingClientRect();
      const boxes = [...document.querySelectorAll('.hero-about, .hero-about a')].map((el) => el.getBoundingClientRect());
      return Math.max(...boxes.map((box) => box.bottom - hero.bottom));
    });
    expect(overflow).toBeLessThanOrEqual(0);
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
