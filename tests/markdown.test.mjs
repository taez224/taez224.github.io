import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownRenderer } from '../src/lib/markdown.mjs';

const render = createMarkdownRenderer({ resolveNote: () => null, resolveAsset: () => null });

test('block ids at paragraph ends and on their own line are stripped', () => {
  const html = render('x.md', '플랫폼 팀의 첫 번째 미션은 몰입 시간을 되찾는 것이다. ^flow-time-mission\n\n다음 문단.\n^para-2\n\n`a ^ b`는 코드라 남는다.');
  assert.doesNotMatch(html, /flow-time-mission|para-2/);
  assert.match(html, /되찾는 것이다\.<\/p>/);
  assert.match(html, /a \^ b/);
});

test('comments are removed and highlights become mark', () => {
  const html = render('x.md', '보임 %%숨김%% ==강조==');
  assert.doesNotMatch(html, /숨김/);
  assert.match(html, /<mark>강조<\/mark>/);
});
