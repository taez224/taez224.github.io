import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryFor } from '../src/lib/note-body.ts';

test('a short automatic summary keeps the whole excerpt including its final word', () => {
  assert.equal(summaryFor({ meta: {}, publicContent: '마지막 어절 보존.' }), '마지막 어절 보존.');
});

test('a long automatic summary stops at the last whole word within 220 characters and adds an ellipsis', () => {
  // 여섯 글자 단위라 220번째 글자가 어절 한가운데에 걸린다. 잘린 어절은 남기지 않는다.
  const words = Array.from({ length: 50 }, () => '가나다라마');
  const summary = summaryFor({ meta: {}, publicContent: words.join(' ') });
  assert.equal(summary, `${words.slice(0, 36).join(' ')}…`);
});
