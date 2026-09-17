// 사이트 색의 단일 출처다. 키는 CSS 변수 이름과 같고, site.css의 :root와 DESIGN.md의 색 토큰이 같은 값을 쓴다.
// CSS는 var(--이름)으로 읽고, CSS 변수를 읽지 못하는 곳(resvg로 그리는 OG 카드, Mermaid 테마 변수, theme-color 메타)만 이 모듈을 가져다 쓴다.
// tests/palette.test.ts가 세 곳의 값이 같은지와 다른 파일에 값이 복제되지 않았는지를 검사한다.
export const PALETTE = {
  paper: '#f7f7f2',
  'paper-strong': '#fdfdfa',
  ink: '#252e29',
  muted: '#626d64',
  faint: '#687267',
  line: '#d8ded4',
  'accent-soft': '#e7e9e3',
  warning: '#985d2f',
  bug: '#8e5d5d',
  highlight: '#e7d99b',
  // 지도 간선. 불투명도를 낮춰 그리므로 구분선(line)보다 짙은 값에서 출발한다.
  edge: '#9aab9d'
} as const;
