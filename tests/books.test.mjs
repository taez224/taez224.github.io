import test from 'node:test';
import assert from 'node:assert/strict';
import { statusFilters, coverUrl } from '../src/lib/books.mjs';

const shelf = (...statuses) => statuses.map((status, index) => ({ title: `책 ${index}`, status }));

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
