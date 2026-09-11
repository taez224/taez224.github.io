import { newestFirst } from './dates.mjs';
import { NAVIGATION_TYPES } from './kinds.mjs';

// 홈의 최근 기록. 종류마다 최신 한 편이라 한 종류를 하루에 몰아 올려도 다른 종류가 목록에서 밀리지 않는다.
// 허브(MOC)와 연재 허브는 피드처럼 넣지 않는다. 연재의 각 편도 빼는데, 새 편이 나올 때마다 홈의 최근 연재와 같은 연재를 두 번 가리키게 되기 때문이다.
// exclude에는 홈에 이미 따로 보이는 노트(대표 글)의 경로를 넘긴다.
export function recentByKind(notes, { kinds, series = [], exclude = [] }) {
  const seriesPaths = new Set(series.flatMap((item) => item.posts.map((post) => post.path)));
  const excluded = new Set(exclude);
  const candidates = notes
    .filter((note) => note.date && !NAVIGATION_TYPES.has(note.type) && !seriesPaths.has(note.path) && !excluded.has(note.path))
    .sort(newestFirst());
  // 고른 편끼리는 최신순이고, 같은 날이면 kinds에 적은 순서를 따른다. 그 순서가 홈이 정한 종류의 표시 순서다.
  return kinds
    .map((kind) => candidates.find((note) => note.kind === kind))
    .filter(Boolean)
    .sort((left, right) => right.date.localeCompare(left.date) || kinds.indexOf(left.kind) - kinds.indexOf(right.kind));
}
