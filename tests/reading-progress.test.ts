import test from 'node:test';
import assert from 'node:assert/strict';
import { readingProgress } from '../src/scripts/reading-progress.ts';

// 값은 모두 화면 위 끝에서 잰 세로 위치다. 화면 높이 800, 헤더 아래 끝 56, 본문 첫 줄에서 마지막 문단까지 2,744.
// 그러면 본문이 헤더 아래에서 시작해 마지막 문단이 화면 아래 끝에 닿을 때까지 2,000을 스크롤한다.
const at = (scrolled: number) => readingProgress({ bodyTop: 56 - scrolled, lastBlockTop: 56 - scrolled + 2744, viewportHeight: 800, headerBottom: 56 });

test('progress is zero until the body starts under the header', () => {
  assert.equal(at(0), 0);
  assert.equal(at(-300), 0, '제목과 요약을 읽는 동안은 본문을 읽지 않았다');
});

test('progress grows with the body scrolled and reaches one when the last block enters the screen', () => {
  assert.equal(at(1000), 0.5);
  assert.equal(at(2000), 1);
  assert.equal(at(2600), 1, '참조 목록과 바닥글을 읽는 동안은 더 늘지 않는다');
});

test('a body whose last block is already on screen counts as read', () => {
  assert.equal(readingProgress({ bodyTop: 300, lastBlockTop: 500, viewportHeight: 800, headerBottom: 56 }), 1);
});
