import { newestFirst } from './dates.ts';
import { NAVIGATION_TYPES, type NoteKind } from './kinds.ts';

// 홈의 최근 기록. 종류마다 최신 한 편이라 한 종류를 하루에 몰아 올려도 다른 종류가 목록에서 밀리지 않는다.
// 허브(MOC)와 연재 허브는 피드처럼 넣지 않는다. 연재의 각 편도 빼는데, 새 편이 나올 때마다 홈의 최근 연재와 같은 연재를 두 번 가리키게 되기 때문이다.
// exclude에는 홈에 이미 따로 보이는 노트(대표 글)의 경로를 넘긴다.
interface RecentNote {
  kind: NoteKind;
  path: string;
  title: string;
  date: string;
  type: string;
}

interface RecentOptions {
  kinds: readonly NoteKind[];
  series?: readonly { posts: readonly { path: string }[] }[];
  exclude?: readonly (string | undefined)[];
}

function candidatesFor<T extends RecentNote>(notes: readonly T[], { series = [], exclude = [] }: RecentOptions): T[] {
  const seriesPaths = new Set(series.flatMap((item) => item.posts.map((post) => post.path)));
  const excluded = new Set(exclude);
  return notes
    .filter((note) => note.date && !NAVIGATION_TYPES.has(note.type) && !seriesPaths.has(note.path) && !excluded.has(note.path))
    .sort(newestFirst());
}

export function recentByKind<T extends RecentNote>(notes: readonly T[], options: RecentOptions): T[] {
  const { kinds } = options;
  const candidates = candidatesFor(notes, options);
  // 고른 편끼리는 최신순이고, 같은 날이면 kinds에 적은 순서를 따른다. 그 순서가 홈이 정한 종류의 표시 순서다.
  return kinds
    .map((kind) => candidates.find((note) => note.kind === kind))
    .filter((note): note is T => note !== undefined)
    .sort((left, right) => right.date.localeCompare(left.date) || kinds.indexOf(left.kind) - kinds.indexOf(right.kind));
}

// 최근 기록에 다듬은 노트를 함께 싣는다. 노트는 한 번 쓰고 끝나지 않고 계속 고치므로, 새로 쓴 것만 보이면 정원에서 달라진 것의 절반이 빠진다.
// 날짜는 쓴 날과 다듬은 날 가운데 늦은 날 하나만 적고, 그 날짜가 다듬은 날이면 tended로 알린다. updated는 표시 날짜보다 늦을 때만 값이 있다(dates.ts).
// 종류마다 고른 최신 편에 더해, 예전 노트 가운데 최근에 다듬은 것을 TENDED_LIMIT편까지 넣는다. 한도가 없으면 자주 다듬는 시기에 새 글이 목록에서 밀린다.
// 같은 날이면 종류마다 고른 편이 먼저 온다.
const TENDED_LIMIT = 2;

export interface RecentRow<T> { note: T; when: string; tended: boolean }

export function recentActivity<T extends RecentNote & { updated: string }>(notes: readonly T[], options: RecentOptions): RecentRow<T>[] {
  const picked = recentByKind(notes, options);
  const pickedPaths = new Set(picked.map((note) => note.path));
  const tended = candidatesFor(notes, options)
    .filter((note) => note.updated && options.kinds.includes(note.kind) && !pickedPaths.has(note.path))
    .sort((left, right) => right.updated.localeCompare(left.updated))
    .slice(0, TENDED_LIMIT);
  return [...picked, ...tended]
    .map((note) => ({ note, when: note.updated || note.date, tended: Boolean(note.updated) }))
    .sort((left, right) => right.when.localeCompare(left.when));
}
