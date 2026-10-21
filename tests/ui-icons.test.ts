import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_ICON_GRIDS, uiIcon } from '../src/lib/ui-icons.ts';
import type { UiIconName } from '../src/lib/ui-icons.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
// 규칙은 한 줄에 하나씩 적는 이 저장소의 방식을 따라 선택자로 찾는다.
const width = (css: string, selector: string) => {
  const rule = css.split('\n').find((line) => line.trimStart().startsWith(`${selector} {`));
  return Number(rule?.match(/(?:^|[;{\s])width:\s*(\d+)px/)?.[1]);
};

test('every control icon is a 2px square-ended line drawing on its own grid', () => {
  for (const name of Object.keys(UI_ICON_GRIDS) as UiIconName[]) {
    const grid = UI_ICON_GRIDS[name];
    const svg = uiIcon(name);
    assert.match(svg, new RegExp(`width="${grid}" height="${grid}" viewBox="0 0 ${grid} ${grid}"`), name);
    assert.match(svg, /stroke-width="2"/, name);
    assert.match(svg, /stroke-linecap="square"/, name);
    assert.match(svg, /stroke-linejoin="miter"/, name);
    assert.match(svg, /aria-hidden="true"/, name);
  }
});

test('control icons are shown at their grid size so a 2px stroke lands on whole pixels', () => {
  // 한 칸이 1px일 때만 정수 좌표에 둔 2px 획이 1배율 화면에서 칸 경계에 맞는다. 표시 크기를 바꾸면 도안의 격자도 함께 바꾼다.
  const site = read('src/styles/site.css');
  assert.equal(width(site, '.search-trigger svg'), UI_ICON_GRIDS.search);
  assert.equal(width(site, '.theme-toggle svg'), UI_ICON_GRIDS.sun);
  assert.equal(UI_ICON_GRIDS.moon, UI_ICON_GRIDS.sun);
  assert.equal(width(site, '.search-close svg'), UI_ICON_GRIDS.close);
  assert.equal(width(site, '.site-footer .rss-link svg'), UI_ICON_GRIDS.rss);
  assert.equal(width(read('src/styles/body.css'), '.body .code-copy-plate svg'), UI_ICON_GRIDS.copy);
  assert.equal(UI_ICON_GRIDS.copyDone, UI_ICON_GRIDS.copy);
  assert.equal(width(read('src/components/NotePage.astro'), '.toc-button svg'), UI_ICON_GRIDS.contents);
  const map = read('src/pages/map/index.astro');
  for (const name of ['zoomOut', 'zoomIn', 'fit'] as const) assert.equal(width(map, '.graph-controls svg'), UI_ICON_GRIDS[name], name);
});
