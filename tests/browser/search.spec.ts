import { test, expect, gotoWithDefaultFontSize } from './fixtures.ts';

// 결과 줄은 왜 이 결과가 걸렸는지 말해야 한다. 두 줄에 들어가는 글자 수는 화면 폭과 글자 크기에 따라 달라,
// 찾은 말 앞에 문맥을 길게 두면 좁은 화면에서 두 줄 아래로 밀려 글자가 있어도 읽을 수 없다.
test('a search result shows the word it matched on narrow screens and enlarged text', async ({ page }) => {
  for (const width of [375, 320]) {
    for (const font of [16, 32]) {
      await page.setViewportSize({ width, height: 700 });
      await gotoWithDefaultFontSize(page, '/', font);
      await page.locator('[data-search-open]').first().click();
      await page.locator('#search-input').fill('적재적소');
      const line = page.locator('.search-item').first().locator('small');
      await expect(line.locator('mark')).toHaveCount(1);
      const fits = await line.evaluate((small) => {
        const box = small.getBoundingClientRect();
        const hit = small.querySelector('mark')!.getBoundingClientRect();
        return hit.top >= box.top - 1 && hit.bottom <= box.bottom + 1;
      });
      expect(fits, `${width}px, 기본 글자 ${font}px에서 찾은 말이 잘린 상자 안에 있다`).toBe(true);
    }
  }
});

// dialog는 배경까지 자기 영역이라 배경을 눌러도 저절로 닫히지 않는다. 도표 크게 보기와 같은 약속을 준다.
test('the search dialog closes on a backdrop click but survives a drag that ends there', async ({ page }) => {
  await page.goto('/');
  const dialog = page.locator('#search');
  await page.locator('[data-search-open]').first().click();
  await expect(dialog).toHaveJSProperty('open', true);
  const box = (await dialog.boundingBox())!;
  const inside = { x: box.x + 20, y: box.y + 20 };
  const backdrop = { x: box.x + 20, y: box.y + box.height + 60 };
  await page.mouse.click(inside.x, inside.y);
  await expect(dialog).toHaveJSProperty('open', true);
  // 글자를 끌어 고르다 배경에서 손을 뗀 경우다. 여기서 닫히면 고른 글자가 함께 사라진다.
  await page.mouse.move(inside.x, inside.y);
  await page.mouse.down();
  await page.mouse.move(backdrop.x, backdrop.y);
  await page.mouse.up();
  await expect(dialog).toHaveJSProperty('open', true);
  await page.mouse.click(backdrop.x, backdrop.y);
  await expect(dialog).toHaveJSProperty('open', false);
});

// 책 노트의 title은 띠지 원제라 백 자를 넘기도 해서 결과 한 줄이 대화상자를 가득 채웠다.
// 책장은 파일 이름을 보이므로 검색도 같은 이름을 보인다. 원제로 찾는 길은 별칭으로 남긴다.
test('a book result shows the shelf name and still answers to its published title', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-search-open]').first().click();
  // 띠지문구는 원제에만 있고 파일 이름에는 없다.
  await page.locator('#search-input').fill('띠지문구');
  const item = page.locator('.search-item').first();
  await expect(item.locator('.search-kind')).toHaveText('책');
  await expect(item.locator('a')).toHaveText('짧은 책이름');
});

// 책 결과는 책장 안의 앵커라 책장에서 누르면 페이지를 다시 열지 않는다. 검색창이 그대로 남아 도착한 책을 가렸다.
test('a book result chosen on the shelf closes the search', async ({ page }) => {
  await page.goto('/books/');
  await page.locator('[data-search-open]').first().click();
  await page.locator('#search-input').fill('평점 없는');
  await page.locator('.search-item a', { hasText: '평점 없는 책' }).click();
  await expect(page).toHaveURL(/#book-/);
  await expect(page.locator('#search')).toHaveJSProperty('open', false);
});
