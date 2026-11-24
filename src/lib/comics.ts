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

// 끝 장은 목록의 다음 표지로 이어지고, 맨 끝에서는 첫 표지로 돌아간다.
export function nextCatalogueWork(works: readonly ComicWork[], index: number): ComicWork | null {
  if (works.length < 2) return null;
  return works[index + 1] ?? works[0]!;
}
