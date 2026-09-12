import type { PublicNote } from './content-model.ts';
import type { BlogPost, BlogSeries } from './blog.ts';

// 이어 읽기 링크가 읽는 값. 편은 경로로 찾고, 화면에는 제목과 주소를 보여 준다.
type NavPost = Pick<BlogPost, 'path' | 'title' | 'url'> & Partial<Pick<BlogPost, 'status'>>;
type NavSeries = Pick<BlogSeries, 'title' | 'noteUrl'> & { posts: readonly NavPost[] };

import { kindLabel } from './format.ts';
import { KINDS } from './kinds.ts';

// 리더의 상위 링크. 메타 줄의 종류 라벨과 본문 끝 링크가 같은 곳을 가리킨다.
// 글 → 글 목록, 개발 노트 → 개발 노트 목록, 노트 → 생각 지도(이 노트를 선택한 채로).
export function parentLink(note: Pick<PublicNote, 'kind'> & Partial<Pick<PublicNote, 'category'>>, mapKey = '') {
  const kind = KINDS[note.kind] ?? KINDS.slipbox;
  const path = note.kind === 'slipbox' && mapKey ? `/map/?node=${encodeURIComponent(mapKey)}` : kind.listPath;
  return { label: kindLabel(note), path, listLabel: kind.listLabel };
}

// 연재 글의 앞·뒤 편. seriesList는 assembleGarden의 blog.series(편은 series_order 순으로 정렬됨).
export function seriesNeighbors(note: Partial<Pick<PublicNote, 'path' | 'type' | 'url'>>, seriesList: readonly NavSeries[]) {
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
