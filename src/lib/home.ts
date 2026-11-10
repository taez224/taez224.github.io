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

// 홈 책장에 올릴 완독 도서의 최저 평점. 별점을 함께 보이므로 권하지 않는 책은 올리지 않는다.
const SHELF_MIN_RATE = 4;

// 대표 추천을 먼저 두고, 평점이 높은 책 가운데 최근에 읽은 순으로 채운다. 평점순으로만 고르면 늘 같은 책이 남는다.
// 읽는 중인 책은 마지막 두 자리까지만 쓴다.
export function homeBooks<T extends ShelfBook>(books: readonly T[], favoriteSlug = ''): T[] {
  const selected: T[] = [];
  const add = (book: T | undefined) => {
    if (book && !selected.some((item) => item.slug === book.slug)) selected.push(book);
  };
  const completed = books.filter((book) => book.status === '완독');
  const recent = newestFirst<T>((book) => book.finishDate || book.created, (book) => book.title);
  add(books.find((book) => book.slug === favoriteSlug));
  const reading = books.filter((book) => book.status === '읽는 중' && !selected.includes(book))
    .sort(newestFirst((book) => book.startDate || book.created, (book) => book.title)).slice(0, 2);
  for (const book of completed.filter((item) => item.rate >= SHELF_MIN_RATE).sort(recent)) {
    if (selected.length >= 4 - reading.length) break;
    add(book);
  }
  reading.forEach(add);
  return selected;
}
