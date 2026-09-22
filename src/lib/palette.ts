// 사이트 색의 단일 출처다. 키는 CSS 변수 이름과 같고, site.css의 :root와 DESIGN.md의 색 토큰이 같은 값을 쓴다.
// CSS는 var(--이름)으로 읽고, CSS 변수를 읽지 못하는 곳(resvg로 그리는 OG 카드, Mermaid 테마 변수, theme-color 메타)만 이 모듈을 가져다 쓴다.
// tests/palette.test.ts가 세 곳의 값이 같은지와 다른 파일에 값이 복제되지 않았는지를 검사한다.
export const PALETTE = {
  paper: '#f7f6f0',
  'paper-strong': '#fdfcf8',
  ink: '#252e29',
  // 보조 글자는 muted 한 단계뿐이다. 종이색 위에서 4.5:1을 지키는 가장 옅은 회색이 muted와 거의 같아서
  // 더 낮은 위계는 색을 옅게 하지 않고 글자 크기로 나눈다(옛 faint #687267은 muted와의 대비가 1.08이었다).
  muted: '#626d64',
  line: '#d8ddd3',
  // 호버 배경. 그 위에 muted 보조 글자(개수, 연재 방향 표시)가 올라가므로 muted가 4.5:1을 넘는 값으로 둔다(4.61:1).
  // 종이색과 대비가 낮아 선택 표시로는 쓰지 않는다. 선택은 먹색 글자와 막대로 알린다.
  'accent-soft': '#eceee6',
  warning: '#985d2f',
  bug: '#8e5d5d',
  highlight: '#e7d99b',
  // 지도 간선. 불투명도를 낮춰 그리므로 구분선(line)보다 짙은 값에서 출발한다.
  edge: '#9aab9d'
} as const;

// 어두운 화면의 같은 역할 값이다. 독자가 고른 화면(html의 data-theme)이 먼저이고 고른 적이 없으면 시스템 설정을 따른다.
// site.css의 두 블록(미디어 쿼리와 data-theme)과 DESIGN.md의 -dark 토큰이 같은 값을 쓴다.
// 라이트를 뒤집지 않고 먹색과 같은 녹회색 색조로 따로 짰다. 바탕보다 올라온 판(paper-strong, accent-soft)일수록 밝아서 그림자 없이 층이 보인다.
// 글자는 흰색 대신 옅은 먹색이라 본문 대비가 13:1 안팎이고, muted는 가장 밝은 판(accent-soft) 위에서 5.19:1이다.
export const DARK_PALETTE = {
  paper: '#171e1a',
  'paper-strong': '#1e2822',
  ink: '#e1e8e3',
  muted: '#9ca99f',
  line: '#36433b',
  'accent-soft': '#28362d',
  // 경고·버그 제목은 올라온 판 위에 놓인다. 판이 밝아진 만큼 함께 밝혀 4.5:1을 지킨다(각각 4.77:1, 4.79:1).
  warning: '#bd8455',
  bug: '#b68483',
  highlight: '#574d24',
  edge: '#616c64'
} as const satisfies Record<keyof typeof PALETTE, string>;

// 탭과 북마크의 표식에만 쓰는 주홍이다. 종이색 위의 먹색 한 가지로는 탭 줄에서 다른 아이콘과 구분되지 않아 표식에만 색을 하나 둔다.
// 페이지 안에서는 쓰지 않으므로 팔레트에 넣지 않는다. 넣으면 site.css의 :root에 쓰지 않는 변수를 선언해야 하고 design:lint가 그 토큰에 경고한다.
// 표식은 종이색 바탕 위에 찍으므로 밝은 탭 줄과 어두운 탭 줄에서 같은 그림이고, 화면 설정에 따라 색을 바꾸지 않는다.
// public/favicon.svg와 public/apple-touch-icon.png가 이 두 값을 쓰고 tests/mark.test.ts가 세 곳을 대조한다.
export const MARK = { red: '#b8432f', paper: PALETTE.paper } as const;
