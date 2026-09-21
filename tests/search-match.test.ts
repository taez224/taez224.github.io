import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightParts, matchRecord, normalizeQuery, resultCountLabel, SEARCH_PAGE } from '../src/lib/search-match.ts';

const record = { kind: 'development', label: '문제 해결', url: '/x/', title: 'ZIP 엔트리 크기', aliases: ['스트리밍 압축'], summary: '스트림 ZIP', tags: ['Java'], headings: ['원인'], text: '앞부분 문장. ZipInputStream은 엔트리 크기를 미리 알 수 없다. 뒷부분 문장이 길게 이어진다.' };

test('matchRecord finds body-only words and returns a snippet around the first hit', () => {
  const hit = matchRecord(record, normalizeQuery('zipinputstream'));
  assert.ok(hit);
  assert.equal(hit.score, 1);
  assert.match(hit.snippet, /ZipInputStream은 엔트리 크기/);
  assert.ok(hit.snippet.length <= 40 + 'zipinputstream'.length + 40 + 2);
});

test('matchRecord requires every term and scores title matches higher', () => {
  assert.equal(matchRecord(record, normalizeQuery('zip 없는단어')), null);
  const hit = matchRecord(record, normalizeQuery('zip java'));
  assert.ok(hit, '제목과 태그가 모두 걸리는 질의는 결과가 있다');
  assert.equal(hit.score, 11);
  assert.equal(hit.snippet, '스트림 ZIP', '요약이 짧으면 잘라 낼 것이 없어 요약 그대로다');
});

test('matchRecord scores aliases above summary and body matches', () => {
  const aliasHit = matchRecord(record, normalizeQuery('스트리밍 압축'));
  const summaryHit = matchRecord(record, normalizeQuery('스트림'));
  assert.ok(aliasHit && summaryHit, '별칭과 요약 질의는 모두 결과가 있다');
  assert.equal(aliasHit.score, 20);
  assert.equal(summaryHit.score, 4);
});

test('matchRecord adds a phrase bonus only when all terms share one field', () => {
  const splitRecord = { ...record, title: 'AI 도구', aliases: ['PKM 운영'] };
  const phraseHit = matchRecord(record, normalizeQuery('스트리밍 압축'));
  const splitHit = matchRecord(splitRecord, normalizeQuery('AI PKM'));
  assert.ok(phraseHit && splitHit, '두 질의는 모두 결과가 있다');
  assert.equal(splitHit.score, 14);
  assert.ok(phraseHit.score > splitHit.score);
});

test('resultCountLabel tells readers when results are cut and how many matched', () => {
  // 78개 가운데 30개만 보이는 화면이 결과가 30개뿐인 화면과 같아 보이면 나머지를 없는 것으로 읽는다.
  assert.equal(resultCountLabel(78, SEARCH_PAGE), '검색 결과 78개 중 30개 표시');
  assert.equal(resultCountLabel(78, 60), '검색 결과 78개 중 60개 표시');
  assert.equal(resultCountLabel(8, 8), '검색 결과 8개');
  assert.equal(resultCountLabel(78, 78), '검색 결과 78개');
});

// 결과 줄은 왜 이 결과가 걸렸는지 말해야 한다. 요약을 앞에서부터 자르면 찾은 말이 잘려 나가고,
// 375px에서 한 줄에 들어가는 것은 서른 자 남짓이라 요약 가운데 걸린 말은 보이지 않았다.
test('matchRecord cuts a long summary around the word instead of showing its start', () => {
  const long = { ...record, summary: `${'앞'.repeat(120)}적재적소${'뒤'.repeat(120)}`, text: '본문에는 없다.' };
  const hit = matchRecord(long, normalizeQuery('적재적소'));
  assert.ok(hit);
  assert.ok(hit.snippet.includes('적재적소'), '찾은 말이 잘린 줄 안에 있다');
  assert.ok(hit.snippet.length < long.summary.length, '요약 전체를 그대로 두지 않는다');
  assert.ok(hit.snippet.startsWith('…') && hit.snippet.endsWith('…'), '앞뒤를 잘랐다고 알린다');
});

// 본문에서 걸린 말은 본문에서 잘라 온다. 요약에도 있으면 독자가 쓴 요약을 먼저 보인다.
test('matchRecord prefers the summary over the body when both hold the word', () => {
  const both = { ...record, summary: '요약에도 엔트리라는 말이 있다.', text: '본문에도 엔트리가 있다.' };
  const hit = matchRecord(both, normalizeQuery('엔트리'));
  assert.ok(hit);
  assert.match(hit.snippet, /요약에도 엔트리/);
});

// 찾은 말에 표시를 남겨야 눈이 먼저 그 자리를 잡는다. 조각을 그대로 HTML로 쓰지 않도록 문자열이 아니라 조각 목록을 돌려준다.
test('highlightParts splits the line into matched and unmatched pieces', () => {
  assert.deepEqual(highlightParts('스트림 ZIP 압축', ['zip']), [
    { text: '스트림 ', hit: false },
    { text: 'ZIP', hit: true },
    { text: ' 압축', hit: false }
  ]);
  assert.deepEqual(highlightParts('없다', ['zip']), [{ text: '없다', hit: false }]);
  assert.deepEqual(highlightParts('abab', ['ab']), [{ text: 'abab', hit: true }], '이어 붙은 자리는 한 조각으로 묶는다');
});

// 두 줄에 들어가는 글자 수는 화면 폭과 글자 크기에 따라 다르다. 320px에서 글자를 키우면 한 줄이 열 자 남짓이라
// 찾은 말 앞에 긴 문맥을 두면 두 줄 아래로 밀려 숨는다. 앞 문맥은 앞 단어 하나까지만 두고 단어 가운데에서 시작하지 않는다.
test('matchRecord keeps the lead before the word short and starts it at a word', () => {
  const summary = '생각을 정리하는 방법은 여러 가지가 있지만 결국 중요한 것은 스스로 판단하는 힘을 기르는 일이다.';
  const hit = matchRecord({ ...record, summary, text: '' }, normalizeQuery('판단'));
  assert.ok(hit);
  const lead = hit.snippet.indexOf('판단');
  assert.ok(lead >= 0 && lead <= 9, `찾은 말 앞 문맥이 짧다: ${lead}자`);
  assert.ok(hit.snippet.startsWith('…'), '앞을 잘랐다고 알린다');
  assert.ok(summary.includes(` ${hit.snippet.slice(1, 6)}`), '공백 바로 뒤, 단어 첫머리에서 시작한다');
});
