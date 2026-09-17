// 사이트 색의 단일 출처다. 키는 CSS 변수 이름과 같고, site.css의 :root와 DESIGN.md의 색 토큰이 같은 값을 쓴다.
// CSS는 var(--이름)으로 읽고, CSS 변수를 읽지 못하는 곳(resvg로 그리는 OG 카드, Mermaid 테마 변수, theme-color 메타)만 이 모듈을 가져다 쓴다.
// tests/palette.test.ts가 세 곳의 값이 같은지와 다른 파일에 값이 복제되지 않았는지를 검사한다.
export const PALETTE = {
  paper: '#f7f7f2',
  'paper-strong': '#fdfdfa',
  ink: '#252e29',
  // 보조 글자는 muted 한 단계뿐이다. 종이색 위에서 4.5:1을 지키는 가장 옅은 회색이 muted와 거의 같아서
  // 더 낮은 위계는 색을 옅게 하지 않고 글자 크기로 나눈다(옛 faint #687267은 muted와의 대비가 1.08이었다).
  muted: '#626d64',
  line: '#d8ded4',
  // 호버·선택 배경. 그 위에 muted 보조 글자(개수, 연재 방향 표시)가 올라가므로 muted가 4.5:1을 넘는 가장 짙은 값으로 둔다.
  'accent-soft': '#ecede8',
  warning: '#985d2f',
  bug: '#8e5d5d',
  highlight: '#e7d99b',
  // 지도 간선. 불투명도를 낮춰 그리므로 구분선(line)보다 짙은 값에서 출발한다.
  edge: '#9aab9d'
} as const;
