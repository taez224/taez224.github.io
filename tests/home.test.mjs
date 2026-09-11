import test from 'node:test';
import assert from 'node:assert/strict';
import { recentByKind } from '../src/lib/home.mjs';

const note = (kind, title, date, extra = {}) => ({ kind, title, date, path: `${kind}/${title}.md`, type: 'permanent', ...extra });
const titles = (notes) => notes.map((item) => item.title);

test('recentByKind picks the newest note of each kind and orders the picks newest first', () => {
  const notes = [
    note('slipbox', '옛 생각', '2026-01-01'),
    note('slipbox', '새 생각', '2026-09-01'),
    note('development', '개발 노트', '2026-09-05'),
    note('blog', '글', '2026-08-01')
  ];
  assert.deepEqual(titles(recentByKind(notes, { kinds: ['slipbox', 'development', 'blog'] })), ['개발 노트', '새 생각', '글']);
});

test('recentByKind leaves out series hubs, series episodes and excluded notes', () => {
  const episode = note('blog', '연재 1편', '2026-09-09');
  const notes = [note('blog', '연재 허브', '2026-09-10', { type: 'series' }), episode, note('blog', '대표 글', '2026-09-08'), note('blog', '단독 글', '2026-09-01')];
  const picked = recentByKind(notes, { kinds: ['blog'], series: [{ posts: [{ path: episode.path }] }], exclude: ['blog/대표 글.md'] });
  assert.deepEqual(titles(picked), ['단독 글']);
});

test('recentByKind breaks a same-day tie by title and skips kinds that have no notes', () => {
  const notes = [note('slipbox', '하늘', '2026-09-01'), note('slipbox', '가을', '2026-09-01')];
  assert.deepEqual(titles(recentByKind(notes, { kinds: ['slipbox', 'development'] })), ['가을']);
});

test('recentByKind keeps the order of kinds for picks from the same day', () => {
  // 종류 순서(노트, 개발 노트, 글)는 홈이 정한 표시 순서다. 제목 순서에는 뜻이 없다.
  const notes = [note('slipbox', '하늘', '2026-09-01'), note('development', '가을', '2026-09-01')];
  assert.deepEqual(titles(recentByKind(notes, { kinds: ['slipbox', 'development'] })), ['하늘', '가을']);
});

test('recentByKind skips notes without a date, even when a kind has no other note', () => {
  const notes = [note('slipbox', '날짜 있음', '2026-01-01'), note('development', '날짜 없음', '')];
  assert.deepEqual(titles(recentByKind(notes, { kinds: ['slipbox', 'development'] })), ['날짜 있음']);
});
