import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTextWidth, graphTitleLines } from '../src/graph/label.mjs';

test('full titles wrap between words when possible', () => {
  assert.deepEqual(graphTitleLines('가능해야 한다', 10), ['가능해야 한다']);
  const title = '산출물이 팀의 자산이 되려면 판단 추적 복구가 가능해야 한다';
  const lines = graphTitleLines(title, 16);
  assert.equal(lines.join(' '), title);
  assert.ok(lines.every((line) => [...line].length <= 16));
});

test('estimateTextWidth weighs hangul, latin and punctuation differently and scales with font size', () => {
  assert.equal(estimateTextWidth('가a.'), 12.5 + 7.2 + 4.5);
  assert.equal(estimateTextWidth('가', 26), 25);
});
