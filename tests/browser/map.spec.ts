import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
  // 테스트 내용은 로컬 임시 vault뿐이다. 분석 도구 등 외부 요청은 필요 없다.
  await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

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
