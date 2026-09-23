import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_GRIDS, pixelIcon } from '../src/lib/pixel-icons.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
// 규칙은 한 줄에 하나씩 적는 이 저장소의 방식을 따라 선택자로 찾는다.
const width = (css: string, selector: string) => {
  const rule = css.split('\n').find((line) => line.trimStart().startsWith(`${selector} {`));
  return Number(rule?.match(/width:\s*(\d+)px/)?.[1]);
};

test('every icon grid is square and uses only set and empty cells', () => {
  for (const [name, grid] of Object.entries(ICON_GRIDS)) {
    for (const row of grid) {
      assert.equal(row.length, grid.length, `${name}: ${row}`);
      assert.match(row, /^[#.]+$/);
    }
  }
});

test('an icon is a filled shape whose coordinates are its own grid', () => {
  const svg = pixelIcon('search');
  assert.match(svg, /viewBox="0 0 18 18"/);
  assert.match(svg, /fill="currentColor"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(svg, /stroke/, '선으로 그리면 칸 경계가 흐려진다');
  assert.match(pixelIcon('copy'), /viewBox="0 0 16 16"/);
});

test('the buttons draw the grids instead of keeping their own line icons', () => {
  for (const path of ['src/components/Header.astro', 'src/scripts/code-copy.ts']) {
    assert.doesNotMatch(read(path), /stroke-width/, path);
    assert.match(read(path), /pixelIcon/, path);
  }
});

test('each icon is shown at the size of its own grid so one cell stays one pixel', () => {
  assert.equal(width(read('src/pages/map/index.astro'), '.graph-controls svg'), ICON_GRIDS.fit.length);
  assert.equal(width(read('src/styles/site.css'), '.search-close svg'), ICON_GRIDS.close.length);
  assert.equal(width(read('src/styles/site.css'), '.search-trigger svg'), ICON_GRIDS.search.length);
  assert.equal(width(read('src/styles/body.css'), '.body .code-copy-plate svg'), ICON_GRIDS.copy.length);
  assert.equal(ICON_GRIDS.copyDone.length, ICON_GRIDS.copy.length);
});

test('the search button paints its icon instead of stroking it', () => {
  const rule = read('src/styles/site.css').split('\n').find((line) => line.trimStart().startsWith('.search-trigger svg {')) ?? '';
  assert.doesNotMatch(rule, /stroke|fill:\s*none/, '선 설정이 남으면 면으로 그린 도안이 보이지 않는다');
  assert.match(rule, /fill:\s*currentColor/);
});
