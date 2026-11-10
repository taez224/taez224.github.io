import test from 'node:test';
import assert from 'node:assert/strict';
import { recentActivity, homeBooks } from '../src/lib/home.ts';
import type { NoteKind } from '../src/lib/kinds.ts';

const note = (kind: NoteKind, title: string, date: string, updated = '', extra: Record<string, string> = {}) => ({ kind, title, date, updated, path: `${kind}/${title}.md`, type: 'permanent', ...extra });
const kinds: NoteKind[] = ['slipbox', 'development', 'blog'];
const titles = (items: readonly { note: { title: string } }[]) => items.map(({ note }) => note.title);
const rows = (items: readonly { note: { title: string }; when: string; tended: boolean }[]) => items.map(({ note, when, tended }) => `${note.title} ${when}${tended ? ' 다듬음' : ''}`);

test('recentActivity picks the latest five even when they all have the same kind', () => {
  const notes = [
    note('development', '개발 1', '2026-09-01'),
    note('slipbox', '옛 생각', '2026-08-30'),
    note('development', '개발 6', '2026-09-06'),
    note('blog', '옛 글', '2026-08-29'),
    note('development', '개발 3', '2026-09-03'),
    note('development', '개발 5', '2026-09-05'),
    note('development', '개발 2', '2026-09-02'),
    note('development', '개발 4', '2026-09-04')
  ];
  assert.deepEqual(titles(recentActivity(notes, { kinds })), ['개발 6', '개발 5', '개발 4', '개발 3', '개발 2']);
});

// updated는 dates.ts가 발행·작성일보다 늦을 때만 남긴 값이다.
test('recentActivity ranks by the displayed date without capping tended notes or duplicating rows', () => {
  const notes = [
    note('blog', '새 글', '2026-09-28'),
    note('slipbox', '옛 생각 가', '2026-01-01', '2026-09-30'),
    note('slipbox', '옛 생각 나', '2026-01-02', '2026-09-29'),
    note('development', '옛 개발 가', '2026-02-01', '2026-09-27'),
    note('development', '옛 개발 나', '2026-02-02', '2026-09-26'),
    note('slipbox', '새 생각', '2026-09-25')
  ];
  assert.deepEqual(rows(recentActivity(notes, { kinds })), [
    '옛 생각 가 2026-09-30 다듬음', '옛 생각 나 2026-09-29 다듬음', '새 글 2026-09-28',
    '옛 개발 가 2026-09-27 다듬음', '옛 개발 나 2026-09-26 다듬음'
  ]);
});

test('recentActivity excludes hubs, series episodes, featured notes and disallowed kinds before limiting', () => {
  const episode = note('blog', '연재 1편', '2026-09-28');
  const notes = [
    note('blog', '단독 글', '2026-09-01'), episode,
    note('blog', '연재 허브', '2026-09-29', '', { type: 'series' }),
    note('slipbox', '허브', '2026-01-01', '2026-09-30', { type: 'hub' }),
    note('blog', '대표 글', '2026-01-01', '2026-09-27'),
    note('development', '다른 종류', '2026-01-01', '2026-09-26')
  ];
  assert.deepEqual(rows(recentActivity(notes, {
    kinds: ['slipbox', 'blog'], series: [{ posts: [{ path: episode.path }] }], exclude: ['blog/대표 글.md']
  })), ['단독 글 2026-09-01']);
});

test('recentActivity breaks equal activity dates by Korean title, independent of input and kind order', () => {
  const notes = [note('slipbox', '하늘', '2026-09-01'), note('development', '가을', '2026-01-01', '2026-09-01')];
  assert.deepEqual(titles(recentActivity(notes, { kinds })), ['가을', '하늘']);
  assert.deepEqual(titles(recentActivity([...notes].reverse(), { kinds: [...kinds].reverse() })), ['가을', '하늘']);
});

test('recentActivity skips undated notes and returns fewer than five when that is all that is eligible', () => {
  const notes = [note('slipbox', '날짜 있음', '2026-01-01'), note('development', '날짜 없음', '', '2026-09-01')];
  assert.deepEqual(rows(recentActivity(notes, { kinds })), ['날짜 있음 2026-01-01']);
  assert.deepEqual(recentActivity([], { kinds }), []);
});


test('recentActivity limits each requested section independently', () => {
  const notes = Array.from({ length: 6 }, (_, i) => note('slipbox', String(i), `2026-09-0${i + 1}`));
  assert.equal(recentActivity(notes, { kinds: ['slipbox'], limit: 4 }).length, 4);
});

const book = (slug: string, rate: number, status = '완독', date = '2026-01-01') => ({ slug, title: slug, rate, status, finishDate: date, startDate: date, created: date });
const shelf = (books: ReturnType<typeof book>[]) => homeBooks(books, 'favorite').map((item) => item.slug);
const completed = [book('favorite', 3), book('best', 5), book('recent', 4, '완독', '2026-09-01'), book('older', 2)];

test('home books preserve the personal favorite and end with up to two currently reading books', () => {
  assert.deepEqual(shelf(completed), ['favorite', 'best', 'recent', 'older']);
  assert.deepEqual(shelf([...completed, book('reading', 0, '읽는 중')]), ['favorite', 'best', 'recent', 'reading']);
  const reading = [book('read-a', 0, '읽는 중', '2026-08-01'), book('read-b', 4, '읽는 중', '2026-09-01'), book('read-c', 0, '읽는 중')];
  assert.deepEqual(shelf([...completed, ...reading]), ['favorite', 'best', 'read-b', 'read-a']);
});

test('home books do not duplicate the favorite and use recent finish dates to break rating ties', () => {
  const books = [book('favorite', 5), book('older', 4), book('newer', 4, '완독', '2026-09-01')];
  assert.deepEqual(shelf(books), ['favorite', 'newer', 'older']);
  assert.deepEqual(shelf([...books].reverse()), shelf(books));
  assert.deepEqual(books.map((b) => b.slug), ['favorite', 'older', 'newer']);
});

test('home books tolerate a missing favorite and do not fill empty slots with planned or abandoned books', () => {
  assert.deepEqual(shelf([book('planned', 0, '예정'), book('stopped', 3, '중단'), book('read', 0, '읽는 중')]), ['read']);
  assert.deepEqual(shelf([]), []);
  assert.deepEqual(shelf([book('unrated', 0), book('rated', 4)]), ['rated', 'unrated']);
});

test('a favorite that is being read appears only at the first position', () => {
  assert.deepEqual(shelf([book('favorite', 3, '읽는 중'), ...completed.slice(1), book('reading', 0, '읽는 중')]), ['favorite', 'best', 'recent', 'reading']);
});
