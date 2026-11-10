import type { Book } from './content-model.ts';
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
  limit?: number;
  series?: readonly { posts: readonly { path: string }[] }[];
  exclude?: readonly (string | undefined)[];
}

const RECENT_LIMIT = 5;
export interface RecentRow<T> { note: T; when: string; tended: boolean }

// 요청한 종류 안에서 실제로 쓰거나 다듬은 날짜순으로 고른다. updated는 dates.ts가 발행·작성일보다 늦을 때만 남긴다.
// 허브와 연재는 탐색용 목록에서, exclude로 받은 대표 글은 홈의 별도 영역에서 보여 주므로 뺀다.
export function recentActivity<T extends RecentNote>(notes: readonly T[], { kinds, series = [], exclude = [], limit = RECENT_LIMIT }: RecentOptions): RecentRow<T>[] {
  const seriesPaths = new Set(series.flatMap((item) => item.posts.map((post) => post.path)));
  const excluded = new Set(exclude);
  return notes
    .filter((note) => note.date && kinds.includes(note.kind) && !NAVIGATION_TYPES.has(note.type) && !seriesPaths.has(note.path) && !excluded.has(note.path))
    .map((note) => ({ note, when: note.updated || note.date, tended: Boolean(note.updated) }))
    .sort(newestFirst((row) => row.when, (row) => row.note.title))
    .slice(0, limit);
}

type ShelfBook = Pick<Book, 'slug' | 'title' | 'status' | 'rate' | 'finishDate' | 'startDate' | 'created'>;

// 대표 추천과 높은 평가를 먼저 보여 주고, 읽는 중인 책은 마지막 두 자리까지만 쓴다.
export function homeBooks<T extends ShelfBook>(books: readonly T[], favoriteSlug = ''): T[] {
  const selected: T[] = [];
  const add = (book: T | undefined) => {
    if (book && !selected.some((item) => item.slug === book.slug)) selected.push(book);
  };
  const completed = books.filter((book) => book.status === '완독');
  const recent = newestFirst<T>((book) => book.finishDate || book.created, (book) => book.title);
  add(books.find((book) => book.slug === favoriteSlug));
  add([...completed].filter((book) => book.rate > 0 && !selected.includes(book))
    .sort((a, b) => b.rate - a.rate || recent(a, b))[0]);
  const reading = books.filter((book) => book.status === '읽는 중' && !selected.includes(book))
    .sort(newestFirst((book) => book.startDate || book.created, (book) => book.title)).slice(0, 2);
  for (const book of [...completed].sort(recent)) {
    if (selected.length >= 4 - reading.length) break;
    add(book);
  }
  reading.forEach(add);
  return selected;
}
