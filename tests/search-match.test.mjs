import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRecord, normalizeQuery } from '../src/lib/search-match.mjs';

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
  assert.equal(hit.score, 11);
  assert.equal(hit.snippet, '');
});

test('matchRecord scores aliases above summary and body matches', () => {
  const aliasHit = matchRecord(record, normalizeQuery('스트리밍 압축'));
  assert.equal(aliasHit.score, 20);
  assert.equal(matchRecord(record, normalizeQuery('스트림')).score, 4);
});

test('matchRecord adds a phrase bonus only when all terms share one field', () => {
  const splitRecord = { ...record, title: 'AI 도구', aliases: ['PKM 운영'] };
  const phraseHit = matchRecord(record, normalizeQuery('스트리밍 압축'));
  const splitHit = matchRecord(splitRecord, normalizeQuery('AI PKM'));
  assert.equal(splitHit.score, 14);
  assert.ok(phraseHit.score > splitHit.score);
});
