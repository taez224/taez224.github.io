import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MARK } from '../src/lib/palette.ts';
import { FAVICON_GRID, SEAL_GRID, markPath } from '../src/lib/mark.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const favicon = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
// 터치 아이콘은 180px이고 16칸 도안을 10배로 찍는다. 180은 16의 배수가 아니라서 여백을 10px씩 두고 가운데 160px만 도안이 쓴다.
const SCALE = 10, MARGIN = 10, TOUCH_SIZE = 180;

test('markPath joins the set cells of each row into one rectangle', () => {
  assert.equal(markPath(['.##.', '#..#']), 'M1 0h2v1h-2zM0 1h1v1h-1zM3 1h1v1h-1z');
  assert.equal(markPath(['####']), 'M0 0h4v1h-4z');
  assert.equal(markPath(['....']), '');
});

test('both grids are square and use only set and empty cells', () => {
  for (const grid of [SEAL_GRID, FAVICON_GRID]) {
    for (const row of grid) {
      assert.equal(row.length, grid.length, row);
      assert.match(row, /^[#.]+$/);
    }
  }
});

test('the favicon prints the favicon grid in the mark red on a paper square', () => {
  assert.match(favicon, new RegExp(`viewBox="0 0 ${FAVICON_GRID.length} ${FAVICON_GRID.length}"`), '격자와 좌표계가 같다');
  assert.ok(favicon.includes(`d="${markPath(FAVICON_GRID)}"`), '도안이 격자와 어긋나지 않는다');
  assert.ok(favicon.includes(MARK.red), '표식 색을 쓴다');
  assert.ok(favicon.includes(MARK.paper), '종이색 바탕 위에 찍는다');
  assert.match(favicon, /shape-rendering="crispEdges"/, '칸 경계를 흐리지 않는다');
  // 표식 색 말고 다른 색이 섞이면 팔레트 밖의 색이 하나 더 생긴다.
  assert.deepEqual([...new Set([...favicon.matchAll(/#[0-9a-f]{6}/g)].map((match) => match[0]))].sort(), [MARK.red, MARK.paper].sort());
});

test('the touch icon prints the same grid on paper at a whole-number scale', async () => {
  const { data, info } = await sharp(join(root, 'public/apple-touch-icon.png')).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, TOUCH_SIZE);
  assert.equal(info.height, TOUCH_SIZE);
  const pixel = (x: number, y: number) => {
    const start = (y * info.width + x) * info.channels;
    // iOS는 투명한 부분을 검정으로 합성하므로 바탕이 비어 있으면 모서리가 검게 나온다.
    if (info.channels === 4) assert.equal(data[start + 3], 255, `투명한 점 ${x},${y}`);
    return `#${[0, 1, 2].map((offset) => data[start + offset].toString(16).padStart(2, '0')).join('')}`;
  };
  assert.equal(pixel(0, 0), MARK.paper, '여백은 종이색이다');
  assert.equal(pixel(TOUCH_SIZE - 1, TOUCH_SIZE - 1), MARK.paper);
  FAVICON_GRID.forEach((row, gridY) => [...row].forEach((cell, gridX) => {
    const x = MARGIN + gridX * SCALE + SCALE / 2, y = MARGIN + gridY * SCALE + SCALE / 2;
    assert.equal(pixel(x, y), cell === '#' ? MARK.red : MARK.paper, `${gridX},${gridY} 칸`);
  }));
});
