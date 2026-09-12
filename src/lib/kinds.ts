// 노트 종류의 이름과 자리. 슬러그 접두사, 독자에게 보이는 라벨, 목록 페이지가 전부 여기서 나온다.
// 개발 노트의 메타 줄 라벨만 예외로 분류명(format.mjs의 developmentCategoryLabel)을 쓴다.
export const KINDS = {
  blog: { prefix: 'posts', label: '글', listPath: '/posts/', listLabel: '글 목록' },
  slipbox: { prefix: 'notes', label: '노트', listPath: '/map/', listLabel: '생각 지도' },
  development: { prefix: 'dev', label: '개발 노트', listPath: '/dev/', listLabel: '개발 노트 목록' }
} as const;

// vault 경로로 노트 종류를 정한다. 공개 규칙(config.json)이 들인 파일에만 쓰므로 슬립박스와 블로그가 아니면 개발 노트다.
export type NoteKind = keyof typeof KINDS;

export function kindFor(relativePath: string): NoteKind {
  if (relativePath.startsWith('01_Slipbox/')) return 'slipbox';
  if (relativePath.startsWith('20_Projects/blog/')) return 'blog';
  return 'development';
}

// 다른 노트를 묶어 안내하는 노트의 type. 연재 허브(series)와 허브(hub)다. vault 속성 스키마는 MOC를 따로 두지 않고
// hub로 쓴다. 만든 날이 새 생각이 생긴 날이 아니므로 새 글을 알리는 곳(홈 최근 기록, 피드)에는 넣지 않는다.
// 두 곳이 같은 목록을 써서 규칙이 어긋나지 않게 한다.
export const NAVIGATION_TYPES = new Set(['series', 'hub']);
