export interface ComicPage {
  src: string;
  width: number;
  height: number;
  alt: string;
  artworkLayer?: 'gaze' | 'badge';
}

export interface ComicWork {
  slug: string;
  title: string;
  // 표지를 따로 두지 않으므로 빈 작품이 생기지 않게 한 장 이상을 타입으로 강제한다.
  pages: readonly [ComicPage, ...ComicPage[]];
  paper?: string;
  related?: readonly { title: string; path: string }[];
}

// 목록 표지, 끝 장의 다음 작품 그림, 리더의 첫 장이 같은 그림이어야 하므로 표지는 늘 첫 장이다.
export function comicCover(work: ComicWork): ComicPage {
  return work.pages[0];
}

// 등록 순서가 읽는 순서다. 목록의 최신순 표시와 이전·다음 방향을 뒤섞지 않는다.
export function comicNeighbors(works: readonly ComicWork[], slug: string) {
  const index = works.findIndex(work => work.slug === slug);
  if (index < 0) throw new Error(`Unknown comic: ${slug}`);
  return { previous: works[index - 1] ?? null, next: works[index + 1] ?? null };
}
