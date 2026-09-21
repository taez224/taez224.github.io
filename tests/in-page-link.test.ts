import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 검색창은 새 탭 누름을 빼고 같은 경로와 쿼리를 비교했지만, 책장은 수정키를 보지 않고 경로만 비교했다.
// 새 탭으로 연 책 때문에 원래 책장의 필터가 바뀌었다. 같은 누름을 두 곳이 다르게 판정하지 않게 한 도우미를 쓴다.
test('every handler of in-page link clicks uses the shared judgment', () => {
  for (const path of ['src/scripts/search.ts', 'src/scripts/books.ts', 'src/scripts/toc.ts']) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /inPageLink\(/, `${path}가 공용 판정을 쓴다`);
    assert.doesNotMatch(source, /shiftKey|pathname === location/, `${path}에 누름 판정이 따로 남아 있지 않다`);
    assert.doesNotMatch(source, /decodeURIComponent/, `${path}가 해시를 직접 풀지 않는다`);
  }
});
