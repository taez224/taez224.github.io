// 노트 종류의 이름과 자리. 슬러그 접두사, 독자에게 보이는 라벨, 목록 페이지가 전부 여기서 나온다.
// 개발 노트의 메타 줄 라벨만 예외로 분류명(format.mjs의 developmentCategoryLabel)을 쓴다.
export const KINDS = {
  blog: { prefix: 'posts', label: '글', listPath: '/posts/', listLabel: '글 목록' },
  slipbox: { prefix: 'notes', label: '노트', listPath: '/map/', listLabel: '생각 지도' },
  development: { prefix: 'dev', label: '개발 노트', listPath: '/dev/', listLabel: '개발 노트 목록' }
};
