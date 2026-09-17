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
