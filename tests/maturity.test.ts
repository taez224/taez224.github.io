import test from 'node:test';
import assert from 'node:assert/strict';
import { MATURITY_STAGES, maturityOf } from '../src/lib/maturity.ts';
import { ICON_GRIDS } from '../src/lib/pixel-icons.ts';

test('a slipbox note shows its maturity under the reader-facing garden name', () => {
  assert.deepEqual(['seedling', 'growing', 'evergreen'].map((status) => maturityOf({ kind: 'slipbox', type: 'permanent', status })?.label), ['새싹', '묘목', '나무']);
});

test('hubs, blog posts, development notes and unknown values show no maturity', () => {
  // 허브는 주장 노트가 아니라 성숙도를 쓰지 않는다. 블로그의 published 같은 값은 발행 상태다.
  assert.equal(maturityOf({ kind: 'slipbox', type: 'hub', status: 'evergreen' }), null);
  assert.equal(maturityOf({ kind: 'blog', type: '', status: 'published' }), null);
  assert.equal(maturityOf({ kind: 'development', type: '', status: 'seedling' }), null);
  assert.equal(maturityOf({ kind: 'slipbox', type: 'permanent', status: 'budding' }), null);
  assert.equal(maturityOf({ kind: 'slipbox', type: 'permanent', status: '' }), null);
});

test('every maturity stage draws a 14-cell icon so it sits on the meta line at one pixel per cell', () => {
  for (const stage of MATURITY_STAGES) {
    for (const name of [stage.icon, stage.open].filter((icon) => icon !== undefined)) {
      assert.equal(ICON_GRIDS[name].length, 14, `${stage.label}: ${name}`);
    }
  }
});
