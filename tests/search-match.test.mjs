import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRecord, normalizeQuery } from '../src/lib/search-match.mjs';

const record = { kind: 'development', label: '문제 해결', url: '/x/', title: 'ZIP 엔트리 크기', summary: '스트림 ZIP', tags: ['Java'], headings: ['원인'], text: '앞부분 문장. ZipInputStream은 엔트리 크기를 미리 알 수 없다. 뒷부분 문장이 길게 이어진다.' };

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
  assert.equal(hit.score, 5);
  assert.equal(hit.snippet, '');
});
