import test from 'node:test';
import assert from 'node:assert/strict';
import { publicBody, summaryFor } from '../src/lib/note-body.ts';

test('a short automatic summary keeps the whole excerpt including its final word', () => {
  assert.equal(summaryFor({ meta: {}, publicContent: '마지막 어절 보존.' }), '마지막 어절 보존.');
});

test('a long automatic summary stops at the last whole word within 220 characters and adds an ellipsis', () => {
  // 여섯 글자 단위라 220번째 글자가 어절 한가운데에 걸린다. 잘린 어절은 남기지 않는다.
  const words = Array.from({ length: 50 }, () => '가나다라마');
  const summary = summaryFor({ meta: {}, publicContent: words.join(' ') });
  assert.equal(summary, `${words.slice(0, 36).join(' ')}…`);
});

test('a long automatic summary ends at the last whole sentence within 220 characters without an ellipsis', () => {
  // 한 문장이 50자라 네 문장(200자)까지 들어가고 다섯째 문장이 220자를 넘는다.
  const sentence = `${'가'.repeat(48)}다.`;
  const summary = summaryFor({ meta: {}, publicContent: Array.from({ length: 6 }, () => sentence).join(' ') });
  assert.equal(summary, Array.from({ length: 4 }, () => sentence).join(' '));
});

test('a short hub summary keeps the intro sentence and drops the unpunctuated link list after it', () => {
  // 본문 전체가 220자 안이어도 마지막 문장 뒤에 이어지는 마침표 없는 목록은 요약에 넣지 않는다.
  const body = ['내 성향과 습관을 돌아보며 알게 된 것.', '', '## 나의 작업 방식', '', '- [[첫째 노트]]', '- [[둘째 노트]]'].join('\n');
  assert.equal(summaryFor({ meta: {}, publicContent: body }), '내 성향과 습관을 돌아보며 알게 된 것.');
});

test('a short summary without any sentence end keeps the whole text', () => {
  assert.equal(summaryFor({ meta: {}, publicContent: '- [[첫째 노트]]\n- [[둘째 노트]]' }), '첫째 노트 둘째 노트');
});

test('question and exclamation marks end a sentence for the automatic summary', () => {
  const summary = summaryFor({ meta: {}, publicContent: `왜 그럴까? 그렇구나! ${'이어지는 어절'.repeat(40)}` });
  assert.equal(summary, '왜 그럴까? 그렇구나!');
});

test('a decimal point is not a sentence end for the automatic summary', () => {
  // 220자 안의 마침표는 1.5의 소수점뿐이다. 문장 끝이 없으므로 어절 경계에서 자르고 말줄임표를 붙인다.
  const words = Array.from({ length: 50 }, () => '가나다라마');
  const summary = summaryFor({ meta: {}, publicContent: `버전 1.5 ${words.join(' ')}` });
  assert.ok(summary.endsWith('…'), summary);
  assert.ok(summary.startsWith('버전 1.5 가나다라마'), summary);
});

test('a period at the 221st character is not taken as a sentence end inside the excerpt', () => {
  // 발췌 끝의 마침표 뒤에 오는 글자는 발췌 밖에 있어 문장 끝인지 알 수 없다. 앞 문장에서 자른다.
  const lead = '앞 문장이다.';
  const filler = '나'.repeat(220 - lead.length - 1);
  const summary = summaryFor({ meta: {}, publicContent: `${lead} ${filler}.5 뒤따르는 글` });
  assert.equal(summary, lead);
});

test('a series hub section excerpt also ends at a whole sentence', () => {
  const sentence = `${'가'.repeat(48)}다.`;
  const body = ['## 연재 목적', '', Array.from({ length: 6 }, () => sentence).join(' ')].join('\n');
  assert.equal(summaryFor({ meta: { type: 'series' }, publicContent: body }, { kind: 'blog' }), Array.from({ length: 4 }, () => sentence).join(' '));
});

test('the separator that opens an author-only section leaves with it', () => {
  const body = ['시작점 목록.', '', '---', '', '## 운영 메모', '저자 메모.'].join('\n');
  assert.equal(publicBody(body).trim(), '시작점 목록.');
  for (const mark of ['***', '___', '- - -']) assert.equal(publicBody(body.replace('---', mark)).trim(), '시작점 목록.', mark);
});

test('a separator between public sections stays when an author-only section follows later', () => {
  const body = ['앞 절.', '', '---', '', '## 공개 절', '본문.', '', '## 운영 메모', '저자 메모.'].join('\n');
  assert.equal(publicBody(body).trim(), ['앞 절.', '', '---', '', '## 공개 절', '본문.'].join('\n'));
});

test('a dash line right under text is a heading underline and is not treated as a separator', () => {
  // 바로 윗줄이 글이면 `---`는 setext 제목의 밑줄이다. 빼면 제목이 문단으로 바뀐다.
  const body = ['제목이 되는 줄', '---', '', '## 운영 메모', '저자 메모.'].join('\n');
  assert.equal(publicBody(body).trim(), ['제목이 되는 줄', '---'].join('\n'));
});
