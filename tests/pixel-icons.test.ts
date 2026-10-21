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
  // max-width나 min-width를 width로 잘못 잡지 않도록 속성 이름 앞에 경계를 둔다.
  return Number(rule?.match(/(?:^|[;{\s])width:\s*(\d+)px/)?.[1]);
};

test('every icon grid is square and uses only set and empty cells', () => {
  for (const [name, grid] of Object.entries(ICON_GRIDS)) {
    for (const row of grid) {
      assert.equal(row.length, grid.length, `${name}: ${row}`);
      assert.match(row, /^[#.]+$/);
    }
  }
});

test('a status mark is filled on its own pixel grid', () => {
  const svg = pixelIcon('tended');
  assert.match(svg, /viewBox="0 0 14 14"/);
  assert.match(svg, /fill="currentColor"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(svg, /stroke/, '선으로 그리면 칸 경계가 흐려진다');
});

test('status marks are shown at their grid size so one cell stays one pixel', () => {
  assert.equal(width(read('src/pages/index.astro'), '.tended :global(svg)'), ICON_GRIDS.tended.length);
  assert.equal(ICON_GRIDS.tendedPour.length, ICON_GRIDS.tended.length);
  assert.equal(width(read('src/components/NotePage.astro'), '.maturity svg'), ICON_GRIDS.seedling.length);
});

test('a two-scene status mark draws both scenes in one svg', () => {
  const svg = pixelIcon('tended', 'tendedPour');
  assert.match(svg, /viewBox="0 0 14 14"/);
  assert.match(svg, /<path class="frame-1" d="[^"]+"><\/path><path class="frame-2" d="[^"]+"><\/path>/);
});

test('the pouring scene keeps the watering can and only adds drops', () => {
  // 몸통이 한 칸이라도 달라지면 장면을 바꿀 때 그릇이 흔들려 보인다. 첫 장면의 칸은 모두 남고, 더한 칸은 몸통 왼쪽(주둥이 아래)에만 있다.
  const added: string[] = [];
  ICON_GRIDS.tended.forEach((row, y) => [...row].forEach((cell, x) => {
    const next = ICON_GRIDS.tendedPour[y][x];
    if (cell === '#') assert.equal(next, '#', `${y}행 ${x}열이 지워졌다`);
    else if (next === '#') added.push(`${y},${x}`);
  }));
  assert.ok(added.length > 0, '물방울이 있다');
  for (const cell of added) assert.ok(Number(cell.split(',')[1]) < 4, `${cell}: 물방울은 주둥이 아래(0~3열)에 둔다`);
});
