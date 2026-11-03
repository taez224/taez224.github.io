import { newestFirst } from './dates.ts';
import { NAVIGATION_TYPES, type NoteKind } from './kinds.ts';

interface RecentNote {
  kind: NoteKind;
  path: string;
  title: string;
  date: string;
  updated: string;
  type: string;
}

interface RecentOptions {
  kinds: readonly NoteKind[];
  series?: readonly { posts: readonly { path: string }[] }[];
  exclude?: readonly (string | undefined)[];
}

const RECENT_LIMIT = 5;
export interface RecentRow<T> { note: T; when: string; tended: boolean }

// 종류별 할당 없이 실제로 쓰거나 다듬은 날짜순으로 고른다. updated는 dates.ts가 발행·작성일보다 늦을 때만 남긴다.
// 허브와 연재는 탐색용 목록·최근 연재에서, exclude로 받은 대표 글은 홈의 별도 영역에서 보여 주므로 뺀다.
export function recentActivity<T extends RecentNote>(notes: readonly T[], { kinds, series = [], exclude = [] }: RecentOptions): RecentRow<T>[] {
  const seriesPaths = new Set(series.flatMap((item) => item.posts.map((post) => post.path)));
  const excluded = new Set(exclude);
  return notes
    .filter((note) => note.date && kinds.includes(note.kind) && !NAVIGATION_TYPES.has(note.type) && !seriesPaths.has(note.path) && !excluded.has(note.path))
    .map((note) => ({ note, when: note.updated || note.date, tended: Boolean(note.updated) }))
    .sort(newestFirst((row) => row.when, (row) => row.note.title))
    .slice(0, RECENT_LIMIT);
}
