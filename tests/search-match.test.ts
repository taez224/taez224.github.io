import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRecord, normalizeQuery, resultCountLabel, SEARCH_PAGE } from '../src/lib/search-match.ts';

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
  assert.equal(hit.snippet, '');
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
