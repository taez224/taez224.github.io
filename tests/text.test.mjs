import test from 'node:test';
import assert from 'node:assert/strict';
import { plainText } from '../src/lib/text.mjs';

test('plainText strips markdown syntax but keeps heading and link text', () => {
  const body = `# 제목\n\n> [!bug] 증상\n> 배포가 **멈춘다**.\n\n## 원인\n\n[[다른 노트|별칭]]과 [[세 번째 노트]]를 보라. [문서](https://x.y)\n\n\`\`\`java\nSEARCHABLE_CODE\n\`\`\`\n\n- 항목 \`inline\`\n\n| a | b |\n|---|---|\n| 1 | 2 |`;
  const text = plainText(body);
  assert.match(text, /제목 증상 배포가 멈춘다\. 원인 별칭과 세 번째 노트를 보라\. 문서 SEARCHABLE_CODE 항목 inline a b 1 2/);
  assert.doesNotMatch(text, /\[\[|\*\*|```|\|---/);
});

test('plainText keeps fenced code content searchable while dropping the fence markers', () => {
  const body = '설명 문단\n\n```js\nconst cache_key = 1;\n```\n';
  const text = plainText(body);
  assert.match(text, /cache_key/);
  assert.doesNotMatch(text, /```/);
});

test('plainText keeps indented code content searchable', () => {
  const body = '일반 문단\n\n    function toLabelValue() {}\n';
  const text = plainText(body);
  assert.match(text, /toLabelValue/);
});

test('plainText keeps content from tilde-fenced code blocks and drops the fence markers', () => {
  const body = '~~~python\nSEARCHABLE_TILDE\n~~~';
  const text = plainText(body);
  assert.match(text, /SEARCHABLE_TILDE/);
  assert.doesNotMatch(text, /~~~/);
});

test('plainText removes HTML comments entirely, including their content', () => {
  const body = '보이는 텍스트 <!-- 숨겨진 코멘트 COMMENT_SENTINEL --> 계속.';
  const text = plainText(body);
  assert.doesNotMatch(text, /COMMENT_SENTINEL/);
  assert.match(text, /보이는 텍스트/);
  assert.match(text, /계속\./);
});

test('plainText discards script block content, not just the tags', () => {
  const body = '텍스트 시작\n\n<script>const SCRIPT_SENTINEL = 1;</script>\n\n텍스트 끝';
  const text = plainText(body);
  assert.doesNotMatch(text, /SCRIPT_SENTINEL/);
  assert.doesNotMatch(text, /<script>|<\/script>/);
  assert.match(text, /텍스트 시작/);
  assert.match(text, /텍스트 끝/);
});

test('plainText keeps single spacing around emphasis markers inside a sentence', () => {
  const body = '이것은 **중요한** 문장이고 *강조*도 있다.';
  const text = plainText(body);
  assert.equal(text, '이것은 중요한 문장이고 강조도 있다.');
  assert.doesNotMatch(text, /\*/);
});
