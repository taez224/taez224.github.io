import test from 'node:test';
import assert from 'node:assert/strict';
import { recentActivity, recentByKind } from '../src/lib/home.ts';
import type { NoteKind } from '../src/lib/kinds.ts';

const note = (kind: NoteKind, title: string, date: string, extra: Record<string, string> = {}) => ({ kind, title, date, path: `${kind}/${title}.md`, type: 'permanent', ...extra });
const titles = (notes: readonly { title: string }[]) => notes.map((item) => item.title);

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

test('recentByKind leaves out hub notes (the vault writes MOCs as hubs), like the feeds, so a new hub does not push out the newest note', () => {
  const notes = [note('slipbox', '새 허브', '2026-09-10', { type: 'hub' }), note('slipbox', '새 생각', '2026-09-08')];
  assert.deepEqual(titles(recentByKind(notes, { kinds: ['slipbox'] })), ['새 생각']);
});

// 홈의 최근 기록은 새로 쓴 노트와 다듬은 노트를 한 목록에 싣는다. updated는 dates.ts가 표시 날짜보다 늦을 때만 남긴다.
const tendedNote = (kind: NoteKind, title: string, date: string, updated = '', extra: Record<string, string> = {}) => ({ ...note(kind, title, date, extra), updated });
const rows = (items: readonly { note: { title: string }; when: string; tended: boolean }[]) => items.map((item) => `${item.note.title} ${item.when}${item.tended ? ' 다듬음' : ''}`);

test('recentActivity dates each row by the later of the written and the tended day, and marks the tended ones', () => {
  const notes = [tendedNote('slipbox', '새 생각', '2026-09-01', '2026-09-10'), tendedNote('development', '개발 노트', '2026-09-05')];
  assert.deepEqual(rows(recentActivity(notes, { kinds: ['slipbox', 'development'] })), ['새 생각 2026-09-10 다듬음', '개발 노트 2026-09-05']);
});

test('recentActivity adds at most two older notes that were tended recently, and never repeats a note', () => {
  const notes = [
    tendedNote('slipbox', '새 생각', '2026-09-20', '2026-09-22'),
    tendedNote('slipbox', '옛 생각 가', '2026-01-01', '2026-09-25'),
    tendedNote('slipbox', '옛 생각 나', '2026-01-02', '2026-09-24'),
    tendedNote('slipbox', '옛 생각 다', '2026-01-03', '2026-09-23'),
    tendedNote('slipbox', '손대지 않은 생각', '2026-09-19')
  ];
  assert.deepEqual(rows(recentActivity(notes, { kinds: ['slipbox'] })), ['옛 생각 가 2026-09-25 다듬음', '옛 생각 나 2026-09-24 다듬음', '새 생각 2026-09-22 다듬음']);
});

test('recentActivity keeps hubs, series episodes, excluded notes and other kinds out of the tended rows too', () => {
  const episode = tendedNote('blog', '연재 1편', '2026-01-01', '2026-09-28');
  const notes = [
    tendedNote('blog', '단독 글', '2026-09-01'),
    episode,
    tendedNote('blog', '연재 허브', '2026-01-01', '2026-09-29', { type: 'series' }),
    tendedNote('blog', '대표 글', '2026-01-01', '2026-09-27'),
    tendedNote('slipbox', '다른 종류', '2026-01-01', '2026-09-26')
  ];
  const picked = recentActivity(notes, { kinds: ['blog'], series: [{ posts: [{ path: episode.path }] }], exclude: ['blog/대표 글.md'] });
  assert.deepEqual(rows(picked), ['단독 글 2026-09-01']);
});

test('recentActivity puts the newest pick of a kind before a tended older note from the same day', () => {
  const notes = [tendedNote('slipbox', '옛 생각', '2026-01-01', '2026-09-30'), tendedNote('slipbox', '새 생각', '2026-09-30')];
  assert.deepEqual(rows(recentActivity(notes, { kinds: ['slipbox'] })), ['새 생각 2026-09-30', '옛 생각 2026-09-30 다듬음']);
});
