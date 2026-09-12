import type { PublicNote } from './content-model.ts';
import type { BlogSeries } from './blog.ts';

import { kindLabel } from './format.ts';
import { KINDS } from './kinds.ts';

// 리더의 상위 링크. 메타 줄의 종류 라벨과 본문 끝 링크가 같은 곳을 가리킨다.
// 글 → 글 목록, 개발 노트 → 개발 노트 목록, 노트 → 생각 지도(이 노트를 선택한 채로).
export function parentLink(note: Pick<PublicNote, 'kind' | 'category'>, mapKey = '') {
  const kind = KINDS[note.kind] ?? KINDS.slipbox;
  const path = note.kind === 'slipbox' && mapKey ? `/map/?node=${encodeURIComponent(mapKey)}` : kind.listPath;
  return { label: kindLabel(note), path, listLabel: kind.listLabel };
}

// 연재 글의 앞·뒤 편. seriesList는 assembleGarden의 blog.series(편은 series_order 순으로 정렬됨).
/** @param {Pick<import('./content-model.ts').PublicNote, 'type' | 'url' | 'path'>} note @param {import('./blog.ts').BlogSeries[]} seriesList */
export function seriesNeighbors(note: Pick<PublicNote, 'type' | 'url' | 'path'>, seriesList: readonly BlogSeries[]) {
  const series = seriesList.find((item) => {
    if (note.type === 'series' && item.noteUrl && note.url) return item.noteUrl === note.url;
    return item.posts.some((post) => post.path === note.path);
  });
  if (!series) return null;
  const posts = (series.posts ?? []).filter((post) => post.status === undefined || post.status === 'published');
  const isHub = note.type === 'series' && series.noteUrl === note.url;
  const index = posts.findIndex((post) => post.path === note.path);
  const position = isHub ? 0 : index + 1;
  return {
    title: series.title,
    url: series.noteUrl || '',
    prev: isHub || index < 0 ? null : posts[index - 1] ?? null,
    next: isHub ? posts[0] ?? null : posts[index + 1] ?? null,
    isHub,
    first: posts[0] ?? null,
    total: posts.length,
    position,
    posts
  };
}
