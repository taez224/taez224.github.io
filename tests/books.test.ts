import test from 'node:test';
import assert from 'node:assert/strict';
import { bookDisplayTitle, statusFilters, coverUrl } from '../src/lib/books.ts';
import { readFileSync } from 'node:fs';

const shelf = (...statuses: string[]) => statuses.map((status, index) => ({ title: `책 ${index}`, status }));

test('statusFilters puts 전체 first and then reads in shelf order', () => {
  const filters = statusFilters(shelf('중단', '읽는 중', '완독'));
  assert.deepEqual(filters.map((f) => f.label), ['전체', '완독', '읽는 중', '중단']);
});

test('statusFilters leaves out books that are only planned', () => {
  const filters = statusFilters(shelf('완독', '예정', '예정'));
  assert.deepEqual(filters.map((f) => f.label), ['전체', '완독'], '아직 안 읽은 책은 거르개에 두지 않는다');
});

test('statusFilters counts the books in each status and all of them in 전체', () => {
  const filters = statusFilters(shelf('완독', '완독', '읽는 중'));
  assert.deepEqual(filters, [
    { value: 'all', label: '전체', count: 3 },
    { value: '완독', label: '완독', count: 2 },
    { value: '읽는 중', label: '읽는 중', count: 1 }
  ]);
});

test('statusFilters keeps a status it does not know at the end instead of dropping it', () => {
  const filters = statusFilters(shelf('완독', '재독', ''));
  assert.deepEqual(filters.map((f) => f.label), ['전체', '완독', '재독']);
  assert.equal(filters[0].count, 3, '상태가 없는 책도 전체에는 든다');
});

test('coverUrl asks yes24 for the size the shelf actually shows', () => {
  // 표지는 88x128 상자에 들어간다. L(274x400)이면 2배 해상도까지 덮고 XL(823x1200)보다 81% 가볍다.
  assert.equal(coverUrl('https://image.yes24.com/goods/135457089/XL'), 'https://image.yes24.com/goods/135457089/L');
  assert.equal(coverUrl('http://image.yes24.com/goods/1/XL'), 'http://image.yes24.com/goods/1/L');
});

test('coverUrl leaves alone what it does not recognise', () => {
  assert.equal(coverUrl('https://image.yes24.com/goods/135457089/L'), 'https://image.yes24.com/goods/135457089/L');
  assert.equal(coverUrl('https://example.com/cover/XL'), 'https://example.com/cover/XL');
  assert.equal(coverUrl(''), '');
  assert.equal(coverUrl(undefined), '');
});

// 책 노트의 title은 띠지에 적힌 원제라 백 자를 넘기도 한다. 책장은 파일 이름을 보이는데
// 검색만 원제를 보여 결과 한 줄이 대화상자를 가득 채웠다. 두 곳이 같은 이름을 쓴다.
test('bookDisplayTitle prefers the file name over the published title', () => {
  assert.equal(bookDisplayTitle({ fileTitle: '인사이드 리액트', title: '다시 깊게 익히는 인사이드 리액트：AI 시대에도' }), '인사이드 리액트');
  assert.equal(bookDisplayTitle({ fileTitle: '', title: '제목만 있는 책' }), '제목만 있는 책');
});

test('the shelf and the search index read the book name through the same helper', () => {
  // 같은 식을 두 곳에 적어 두었더니 한쪽만 바뀌어 어긋났다. 읽는 자리를 하나로 묶는다.
  for (const path of ['src/components/BookCard.astro', 'src/pages/data/search.json.ts']) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /bookDisplayTitle\(/, `${path}가 공용 함수로 이름을 읽는다`);
  }
});
