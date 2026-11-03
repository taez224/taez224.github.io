import test from 'node:test';
import assert from 'node:assert/strict';
import { MATURITY_STAGES, maturityOf, maturityButtonHtml, maturityNoteHtml } from '../src/lib/maturity.ts';
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

test('the note page and the map panel draw one maturity button and one set of meanings', () => {
  const [seedling, growing] = MATURITY_STAGES;
  const button = maturityButtonHtml(seedling);
  assert.match(button, /popovertarget="maturity-note"/);
  assert.match(button, /aria-label="노트 성숙도: 새싹"/);
  assert.match(button, /class="frame-2"/, '새싹은 설명을 열면 바뀌는 장면을 함께 싣는다');
  assert.doesNotMatch(maturityButtonHtml(growing), /frame-2/);
  const note = maturityNoteHtml(growing);
  assert.match(note, /^<div id="maturity-note" class="maturity-note" popover>/);
  assert.equal(note.match(/<li/g)?.length, MATURITY_STAGES.length);
  assert.equal(note.match(/aria-current="true"/g)?.length, 1);
  assert.match(note, /aria-current="true"><svg[^>]*>.*?<\/svg><b>묘목<\/b>/);
  for (const stage of MATURITY_STAGES) assert.ok(note.includes(stage.meaning), stage.label);
});
