import { kindLabel } from './format.mjs';

// 리더의 상위 링크. 메타 줄의 종류 라벨과 본문 끝 링크가 같은 곳을 가리킨다.
// 글 → 글 목록, 개발 노트 → 개발 노트 목록, 노트 → 노트 지도(이 노트를 선택한 채로).
export function parentLink(note, mapKey = '') {
  if (note.kind === 'blog') return { label: '글', path: '/posts/', listLabel: '글 목록' };
  if (note.kind === 'development') return { label: kindLabel(note), path: '/dev/', listLabel: '개발 노트 목록' };
  return { label: '노트', path: mapKey ? `/map/?node=${encodeURIComponent(mapKey)}` : '/map/', listLabel: '노트 지도' };
}

// 연재 글의 앞·뒤 편. seriesList는 assembleGarden의 blog.series(편은 series_order 순으로 정렬됨).
export function seriesNeighbors(note, seriesList) {
  const series = seriesList.find((item) => item.posts.some((post) => post.path === note.path));
  if (!series) return null;
  const index = series.posts.findIndex((post) => post.path === note.path);
  return { title: series.title, url: series.noteUrl || '', prev: series.posts[index - 1] ?? null, next: series.posts[index + 1] ?? null };
}
