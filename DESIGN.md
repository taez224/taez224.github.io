---
version: alpha
name: TaeZ's Thinking Garden
description: 한국어 글을 읽고 지도와 참조 관계로 관련 노트를 탐색하는 개인 위키
colors:
  primary: '#252e29'
  paper: '#f7f7f2'
  paper-strong: '#fdfdfa'
  muted: '#626d64'
  line: '#d8ded4'
  accent-soft: '#ecede8'
  warning: '#985d2f'
  bug: '#8e5d5d'
  highlight: '#e7d99b'
  code-bg: '#ffffff'
  code-text: '#24292f'
  code-comment: '#6e7781'
  code-keyword: '#cf222e'
  code-function: '#8250df'
  code-string: '#0a7f64'
  code-number: '#0550ae'
  code-type: '#953800'
  code-meta: '#57606a'
  code-tag: '#116329'
  code-link: '#0969da'
  code-inserted: '#1a7f37'
typography:
  reader-title:
    fontFamily: Gowun Batang
    fontSize: 46px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.03em
  reader-title-mobile:
    fontFamily: Gowun Batang
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.03em
  page-title:
    fontFamily: Gowun Batang
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.02em
  section-title:
    fontFamily: Gowun Batang
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.02em
  featured-title:
    fontFamily: Gowun Batang
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  featured-title-tablet:
    fontFamily: Gowun Batang
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  featured-title-mobile:
    fontFamily: Gowun Batang
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.02em
  article-h2:
    fontFamily: Gowun Batang
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.02em
  lead:
    fontFamily: Gowun Batang
    fontSize: 18.5px
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: -0.01em
  control:
    fontFamily: Pretendard Variable
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.2
  control-small:
    fontFamily: Pretendard Variable
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.2
  list-title:
    fontFamily: Pretendard Variable
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: Pretendard Variable
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.85
  side:
    fontFamily: Pretendard Variable
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: Pretendard Variable
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6
  callout-title:
    fontFamily: Pretendard Variable
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0.04em
  callout-body:
    fontFamily: Pretendard Variable
    fontSize: 15.5px
    fontWeight: 400
    lineHeight: 1.75
  code:
    fontFamily: SFMono-Regular
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
spacing:
  content-max: 1180px
  page-gutter: 24px
  page-gutter-mobile: 20px
  column-gap: 40px
  reader-column: 720px
  sidebar: 310px
  paragraph-gap: 22px
  side-list-gap: 8px
  header-height: 72px
  header-height-mobile: 56px
  title-gap: 40px
  title-gap-mobile: 28px
rounded:
  none: 0px
  control: 4px
  overlay: 6px
components:
  article:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.primary}'
    typography: '{typography.body}'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.paper-strong}'
    typography: '{typography.control}'
    rounded: '{rounded.control}'
    padding: '0 20px'
    height: 44px
  button-primary-small:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.paper-strong}'
    typography: '{typography.control-small}'
    rounded: '{rounded.control}'
    padding: '0 18px'
    height: 40px
  button-primary-hover:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.paper-strong}'
  header-icon-button:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
  header-icon-button-hover:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.primary}'
  meta-line:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
    typography: '{typography.meta}'
  count:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
    typography: '{typography.meta}'
  series-link:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.primary}'
    rounded: '{rounded.control}'
    padding: '14px 18px'
  series-link-hover:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.primary}'
  selected-meta:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.muted}'
    typography: '{typography.meta}'
  callout:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.primary}'
    typography: '{typography.callout-body}'
    rounded: '{rounded.none}'
    padding: '12px 18px 16px'
  callout-title:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.muted}'
    typography: '{typography.callout-title}'
  callout-rule:
    backgroundColor: '{colors.primary}'
    rounded: '{rounded.none}'
    height: 2px
  callout-warning-title:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.warning}'
    typography: '{typography.callout-title}'
  callout-bug-title:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.bug}'
    typography: '{typography.callout-title}'
  code-block:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-text}'
    typography: '{typography.code}'
    rounded: '{rounded.none}'
    padding: '14px 16px'
  code-comment:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-comment}'
  code-keyword:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-keyword}'
  code-function:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-function}'
  code-string:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-string}'
  code-number:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-number}'
  code-type:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-type}'
  code-meta:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-meta}'
  code-tag:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-tag}'
  code-link:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-link}'
  code-inserted:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.code-inserted}'
  text-highlight:
    backgroundColor: '{colors.highlight}'
    textColor: '{colors.primary}'
  search-dialog:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.primary}'
    rounded: '{rounded.overlay}'
  search-dialog-empty:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.muted}'
  map-panel:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.primary}'
    rounded: '{rounded.none}'
  divider:
    backgroundColor: '{colors.line}'
    rounded: '{rounded.none}'
    height: 1px
---

## Overview

Thinking Garden은 글과 개발 노트를 읽으며 관련 생각으로 이어지는 개인 위키다. 대상은 검색이나 링크로 들어와 한 편을 읽고 다른 노트로 이동하려는 독자다. 인쇄된 기록장과 개인 서재의 장부를 참고해, 첫인상을 만드는 장식보다 긴 글의 읽기 흐름과 노트 사이의 관계를 우선한다. 마케팅 랜딩 페이지나 데이터 대시보드처럼 한 화면에 정보를 채우는 방향은 사용하지 않는다. 홈에서는 노트 지도로 주제와 연결을 살펴보고, 목록에서는 제목과 요약으로 글을 고르며, 리더에서는 본문을 읽다가 참조·역참조를 따라 이동한다.

이 문서는 현재 디자인의 값과 의도를 기록한다. YAML은 대표 토큰이고 본문은 용도·배치·상태를 설명한다. 디자인을 개선할 때는 바뀐 의도를 문서에 적고 구현도 함께 갱신한다. 색 값은 [palette.ts](src/lib/palette.ts)가 단일 출처이고 YAML 색 토큰과 [site.css](src/styles/site.css)의 `:root`가 같은 값을 쓰며, 테스트가 셋의 일치를 검사한다. 본문은 [body.css](src/styles/body.css), 주제색은 [GRAPH_COLORS](src/lib/format.ts), 개별 배치는 해당 Astro 컴포넌트와 대조한다.

## Colors

`primary`는 `--ink`와 `--accent`에 대응하며 글자와 주요 조작을 표시한다. `paper`는 페이지 배경, `paper-strong`은 표 머리·콜아웃·도표·대화상자 배경이다. 코드 상자는 강조 테마의 흰 배경(`code-bg`)을 쓴다. `muted`는 보조 정보를, `line`은 내용의 구획을 나타낸다. 보조 글자색은 `muted` 한 단계만 둔다. 종이색 위에서 4.5:1을 지키는 가장 옅은 회색이 `muted`와 거의 같아서, 개수나 단축키처럼 더 낮은 위계는 색을 옅게 하지 않고 글자 크기로 나눈다. `accent-soft`는 호버·선택 배경에 사용한다. 그 위에 개수나 연재 방향 표시 같은 `muted` 글자가 올라가므로, `muted`가 4.5:1을 넘는 범위에서 가장 짙은 값으로 두고 `selected-meta` 컴포넌트로 lint가 이 조합을 검사하게 한다. `warning`, `bug`, `highlight`는 각각 `--warning`, `--bug`, `--highlight`로 연결해 본문 상태와 강조를 표현한다. 본문 링크는 먹색 글자에 밑줄을 더해 주변 문장과 구분한다.

주제색은 노드·영역·태그 점·지도 영역 이름·현재 목차 위치에 사용한다. 색과 함께 주제 이름, 허브 링, 연결 목록을 제공해 의미를 읽을 수 있게 한다. 노드 색은 `GRAPH_COLORS`, 지도 영역 이름의 글자색은 `GRAPH_LABEL_COLORS`와 대응한다.

주제마다 색상은 유지하고 명도를 나눠, 적색약·녹색약에서도 지도에 보이는 주제끼리 구분되게 한다. 노트가 많은 AI·지식관리·조직은 지도가 무거워지지 않게 중간 톤에 두고, 나머지 주제의 명도를 벌린다. 기타는 무채색이다. 노드는 종이색 위 3:1 이상이다. 영역 이름은 15px 굵은 글자라 4.5:1이 필요하므로, 노드 색이 이 기준에 못 미치는 주제는 같은 색상에서 명도만 낮춘 글자색을 쓴다. 두 기준은 테스트가 검사한다.

| 주제 | 노드 | 글자 | 주제 | 노드 | 글자 |
|---|---|---|---|---|---|
| AI | `#877096` | `#7e678d` | 개발 | `#405a78` | 노드와 같음 |
| 커리어 | `#8c6a45` | `#8a6944` | 지식관리 | `#5a7e6a` | `#547864` |
| 글쓰기 | `#7c5050` | 노드와 같음 | 철학 | `#94833e` | `#7f6e28` |
| 조직 | `#36737d` | 노드와 같음 | 심리 | `#793a58` | 노드와 같음 |
| 기타 | `#868684` | `#70706e` |  |  |  |

`warning`과 `bug`는 본문 콜아웃의 위 괘선·머리표·아이콘에, `highlight`는 형광 표시에 사용한다. 개발은 통합된 주제색을 사용하고, 버그와 글쓰기는 같은 색상 계열을 공유하지만 용도로 구분한다. 그래프 간선은 `--edge`(`#9aab9d`) 색을 낮은 불투명도로 그리며, 투명도는 [graph.css](src/styles/graph.css)에서 관리한다. 먹색의 반투명 변형(인라인 코드 배경, 링크 밑줄, 그림자, 시트 뒤 배경)은 `color-mix()`로 `--ink`에서 만들어 값을 따로 적지 않는다.

도표는 연두색 노드와 먹색 글자를 기본으로 하고, 낮은 채도의 색으로 묶음과 항목을 구분한다. 작성자가 의미를 부여한 색은 유지하며, 세부 팔레트는 [도표 설정](src/scripts/mermaid-config.ts)에서 관리한다.

코드 블록은 14px 고정폭 글자에 `@tanstack/highlight`의 GitHub Light 테마 색을 그대로 적용한다. 키워드는 빨강, 함수와 애너테이션은 보라, 문자열은 청록, 숫자·속성은 파랑, 타입은 주황 갈색으로 구분하고, 주석은 회색으로 낮춘다. 애너테이션을 테마의 메타 회색으로 두면 주석과 갈리지 않아 TS 데코레이터와 같은 함수 색을 쓴다. 코드는 문단보다 토큰 종류를 빨리 가려 읽어야 하므로 사이트 톤과의 일치보다 문법 구분과 글자 대비를 우선한다. 배경도 테마의 흰색을 쓴다. 가장 흐린 주석 색이 종이색 배경에서는 4.5:1에 조금 못 미치기 때문이다. 값은 [body.css](src/styles/body.css)에서 관리하고 YAML의 `code-*` 토큰과 대응한다. 토큰 색마다 흰 배경과 짝지은 컴포넌트를 두어 lint가 각 색의 대비를 검사한다.

## Typography

Gowun Batang은 제목과 요약·인용 콜아웃에, Pretendard Variable은 본문·목록·조작 요소에 사용한다. 제목은 700 굵기로 두고 요약·인용은 400으로 흘려 제목보다 한 단계 물러나게 한다. 그래서 Gowun Batang은 400과 700 두 파일을 불러온다. 한 굵기만 불러오면 브라우저가 다른 굵기 요청을 그 파일로 대신 그리므로, 명조에 새 굵기를 쓰려면 글꼴 요청에도 함께 추가한다. 대체 서체는 `site.css`의 `--display`와 `--sans`를 따른다. 코드는 `code` 토큰에 적은 SFMono-Regular를 대표로 삼아 `ui-monospace`, SFMono-Regular, Menlo 순서의 시스템 고정폭 서체를 사용한다. 긴 한국어 문장은 `keep-all`로 단어를 묶고 긴 URL은 가용 폭에 맞춰 줄바꿈한다.

리더와 페이지 제목은 화면의 역할에 따라 `reader-title`, `page-title`, `section-title`, `featured-title` 토큰을 사용한다. 본문·목록·보조 정보는 `body`, `list-title`, `side`, `meta` 토큰으로 위계를 나눈다. 일반 UI의 모바일 기본 글자 크기는 16px이며 본문은 `body` 토큰을 유지한다.

리더 제목과 홈 대표 글·연재 제목은 `text-wrap: balance`로 줄 길이를 고르게 배분한다. 제목 원문과 글자 크기는 유지하며 지원하지 않는 브라우저에서는 기본 줄바꿈을 사용한다.

본문의 제목, 목록의 제목, 홈의 절 제목과 대표 글 제목은 서로 다른 역할의 토큰으로 구분한다. 제목 아래 요약과 요약 콜아웃은 `lead` 토큰을 사용한다. 본문 H3·H4처럼 상위 토큰으로 묶지 않은 요소는 `body.css`의 해당 규칙을 따르며, 역할이 늘어나면 토큰을 추가한다.

## Layout

공통 컨테이너와 리더 열은 `content-max`, `page-gutter`, `reader-column`, `sidebar`, `column-gap` 토큰을 따른다. 1000px 이하에서는 한 열로 바뀌고 참조·역참조가 본문 뒤로 이동한다. 720px 이하에서는 좌우 여백과 접힘 목차·하단 시트 규칙을 모바일 값으로 바꾼다.

모바일 목록은 열을 세로로 쌓고, 긴 표·코드는 블록 안에서 가로로 스크롤한다. 지도 주제 필터는 한 줄로 스크롤하며, 노트를 선택하면 720px 이하에서 하단 시트가 열린다. 상세 노트에서는 태그와 연결 목록으로 주제·관계를 확인한다. [NotePage](src/components/NotePage.astro)와 [지도 페이지](src/pages/map/index.astro)가 폭에 따른 배치를 정한다.

모바일 홈은 첫 글까지의 이동을 줄이기 위해 소개 위 여백을 20px로 두고 지도를 `clamp(200px, 50vw, 280px)` 높이로 표시한다. 소셜 링크는 소개 페이지에서 제공하며 데스크톱 홈에도 유지한다.

여백은 관계에 따라 구분한다. 사이드 목록은 `side-list-gap`, 본문 문단은 `paragraph-gap`, 헤더는 `header-height`, 노트 제목 아래는 `title-gap`을 사용하며, 720px 이하에서는 `page-gutter-mobile`·`header-height-mobile`·`title-gap-mobile`로 바뀐다. `column-gap`은 리더 본문과 사이드바, 지도와 패널, 홈의 안내 열과 콘텐츠 사이에 쓴다. 목록 페이지의 장부 격자는 24px과 36px의 자체 간격을 쓰고 토큰으로 묶지 않는다. 목록과 본문 사이에는 충분한 여백을 두고, 서로 다른 정보 덩어리는 얇은 선으로 나눈다.

홈의 대표 글·최근 기록·최근 연재는 왼쪽 120px 안내 열과 오른쪽 콘텐츠를 40px 간격으로 맞춘다. 대표 글은 왼쪽에 절 제목·날짜·발행처, 오른쪽에 글 제목·명시한 요약 전체·썸네일을 둔다. 최근 기록은 종류마다 한 편씩 유지하고 날짜·종류(노트·개발 노트·글)·제목·주제 순으로 표시하며 건수는 적지 않는다. 주제는 지도와 같은 색의 점과 이름으로 표시한다. 721~1000px에서는 안내 열을 100px로 줄이고 주제를 제목 아래에 둔다. 720px 이하에서는 절 제목을 위에 두고, 각 최근 기록의 제목 아래에 날짜·종류·주제를 배치한다.

최근 기록의 행 구분선은 항목 사이에만 두고, 마지막 행 아래에는 선을 두지 않는다. 다음 절과는 전체 너비의 구분선 하나로 나눈다.

최근 연재에 허브 썸네일이 있으면 대표 글과 같은 이미지 열·반응형 배치를 사용한다. 없으면 이미지 공간 없이 텍스트로 표시한다. 최근 연재의 글 제목은 목록 제목 크기를 유지해 대표 글보다 낮은 위계로 둔다. 왼쪽 절 제목 아래에는 공개된 편수와 진행 상태를 메타 서체로 표시하며 날짜는 넣지 않는다.

## Elevation & Depth

목록과 본문은 밝은 배경, 얇은 구분선, 여백으로 내용을 구분한다. 검색 대화상자의 그림자는 `0 18px 70px` 먹색 18%, 공유 실패 안내는 `0 3px 12px` 먹색 10%다. 모바일 지도 시트는 밝은 배경과 상단 테두리, 뒤쪽 반투명 배경으로 본문과 구분한다.

그래프의 옅은 주제 영역은 노드의 묶음을 보여주고, 도표 노드의 옅은 그림자는 배경과 도형을 구분한다. 긴 목록과 가로 스크롤 필터의 끝에는 페이드를 두어 화면 밖에 내용이 더 있음을 알린다.

## Shapes

본문 표·코드·콜아웃은 직각, 버튼·연재 탐색 링크는 4px, 검색창·공유 안내·지도 확대 컨트롤의 바깥 상자는 6px 모서리를 사용한다. 주제 점과 지도 노드는 원형이고 허브·선택 상태는 링으로 표시한다. 세부 아이콘에는 역할에 맞는 곡률을 사용하며, 썸네일의 가장자리 처리는 이미지 유형별 스타일을 따른다.

## Components

- **버튼:** `.btn`은 높이 44px, 좌우 여백 20px, 글자 15px/600이다. 작은 변형은 높이 40px, 좌우 여백 18px, 글자 14px다. 호버에서는 배경이 `muted`로 바뀐다.
- **헤더 조작:** 검색·공유는 44px 조작 영역 안에 18px 선 아이콘을 둔다. 호버 시 밝은 배경과 먹색 아이콘으로 반응한다. 검색은 접근 가능한 이름을, 공유는 숨긴 텍스트 이름을 제공한다.
- **지도 조작:** 확대·축소·맞춤 버튼은 데스크톱 최소 36px, 모바일 최소 40px 크기다. 주제 필터의 선택 상태는 배경색과 `aria-pressed`로 나타낸다.
- **목록:** 장부 격자를 두 단계로 나눈다. 왼쪽 열에는 연도·분류·등급 라벨을 명조로 크게 두고(등급 40px, 연도 32px, 분류 18px), 오른쪽 블록의 각 행이 다시 제목·메타와 요약을 좌우로 나눈다. 요약은 세 줄까지 표시하며, 720px 이하에서는 두 단계가 모두 세로로 쌓인다. 메타 줄의 구분점은 다음 항목과 함께 줄바꿈되도록 붙인다.
- **개발 노트 목록:** 카테고리는 섹션 제목으로 표시하고, 각 행의 메타 줄에는 첫 공개 태그와 날짜를 표시한다. 어떤 태그가 앞에 오는지는 vault 속성 스키마의 태그 순서 규칙이 정하며, 사이트는 순서를 고쳐 쓰지 않는다. 첫 태그가 섹션 제목과 같은 말이면 빌드 로그가 알려 주므로 vault에서 태그를 손본다.
- **연재 탐색:** 이전·다음 링크는 1px 테두리와 `14px 18px` 여백을 사용한다. 호버·키보드 포커스에서 먹색 테두리와 밝은 배경으로 강조한다.
- **콜아웃:** 인쇄물의 박스 주석처럼 본문과 구분한다. 가는 선만으로는 본문의 일부처럼 읽혀서 세 단서를 겹친다. 페이지보다 한 단계 밝은 `paper-strong` 판, 위쪽 2px 먹색 괘선(`callout-rule`), 본문보다 작은 `callout-body` 활자(15.5px/1.75)다. 아래쪽은 `line` 선으로 닫고, 사방 테두리와 한쪽 막대는 두지 않는다. 여백은 `12px 18px 16px`다. 머리표는 `callout-title` 토큰(13px/600)이고, 앞에 종류별 14px 선 아이콘을 둔다. 아이콘은 머리표 색을 따르며 목록에 없는 종류는 Obsidian처럼 메모의 연필을 쓴다. 팁은 화살표, 질문은 물음표 원 아이콘이다. 요약·인용은 본문을 명조로 흘리고, 경고·위험·실패는 `warning`, 버그는 `bug`로 위 괘선과 머리표를 칠한다. 접을 수 있는 콜아웃은 머리표 줄에 펼침 표시를 두며, `-`는 머리표 줄만 보이게 접힌 채로, `+`는 펼친 채로 시작한다. 꺾쇠는 150ms 동안 ease-out 곡선(`cubic-bezier(.23, 1, .32, 1)`)으로 돈다. `hint`·`summary` 같은 별칭은 기본 종류의 모양을 따른다. 비교(`compare`)는 본문을 최소 `20rem` 칸의 격자로 두고 안쪽 콜아웃 하나를 한 칸으로 삼으며, 칸에서는 판·괘선·여백과 아이콘을 걷어내 머리표와 도표만 남긴다. `compare-stacked`는 칸을 한 줄에 하나씩 놓는다. 종류는 열린 집합이라 이름을 모르는 종류도 같은 구조로 출력하고 CSS가 뜻을 준다.
- **할 일 목록:** 글머리표 자리에 14px 체크박스를 두고, 1.5px `ink` 테두리와 2px 모서리로 그린다. 완료하면 `ink`로 채우고 밝은 체크 표시를 넣는다. 공개 사이트에서 누를 수 없으므로 `disabled`를 유지하고 포인터 커서·호버 효과를 두지 않는다. 체크박스와 항목 글을 label로 묶어 글이 체크박스의 이름이 되게 하고, 완료한 항목은 그 글에만 Obsidian처럼 `muted` 색과 취소선을 적용해 하위 항목으로 번지지 않게 한다.
- **코드 블록:** 강조는 빌드 때 끝내고 방문자에게 스크립트를 보내지 않는다. 다루지 않는 언어와 도표 원문은 색 없이 원문 그대로 둔다.
- **도표:** 본문과 같은 서체로 라벨을 읽기 쉽게 표시한다. 넓은 도표는 내부 스크롤과 확대 보기로 읽으며, 키보드로도 조작할 수 있게 한다.
- **검색:** 최대 650px 대화상자에서 입력·로딩·결과·빈 상태·실패 상태를 구분한다. 실패 시 재시도 버튼을 제공하고, 단축키 안내는 운영체제에 맞게 표시한다.
- **공유:** 복사 성공은 체크 아이콘과 스크린리더 안내로 전달한다. 실패는 버튼 아래에 대안을 담은 짧은 안내를 표시한다. [ShareLink](src/components/ShareLink.astro)가 안내의 위치·폭·표시 시간을 설명한다.
- **연결 탐색:** 선택한 노트의 참조는 실선, 역참조는 점선으로 나타낸다. 전체 연결은 목록에서도 읽을 수 있다. 노드 선택과 키보드 포커스는 링으로, 목차의 현재 위치는 주제색 선과 굵은 글자로 표시한다.
- **구분선:** 정보 덩어리 사이에는 `line` 색상의 1px 선을 사용한다. 목록의 항목 사이와 절 사이의 선을 구분해 마지막 항목 뒤에는 불필요한 선을 두지 않는다.

## Do's and Don'ts

- 아래는 현재 화면에서 확인한 패턴과 앞으로 변경할 때 유지할 기준이다. 모든 항목을 코드가 자동으로 강제하는 것은 아니므로 구현과 화면 검토를 함께 대조한다.
- **Do** 장식보다 제목·본문·참조 관계의 읽기 순서를 우선한다.
- **Do** 색·선·링을 함께 사용해 주제와 상태를 표현한다.
- **Don't** 의미 없는 장식 요소, 글로우, 장식용 그라디언트와 그림자를 추가하지 않는다. 그림자는 위 Elevation & Depth에서 정한 용도로 사용한다.
- **Don't** 주제색을 본문 문장이나 메타데이터 장식으로 확대하지 않는다.
- **Don't** 긴 제목·표·연결 목록을 고정 폭으로 두어 화면 밖으로 밀어내지 않는다. 제목은 줄바꿈하고, 표·코드는 내부에서 가로로 스크롤하며, 긴 연결 목록은 사이드바 안에서 읽게 한다.
- **Don't** 상태 변화나 사용자 조작을 설명하지 않는 장식용 움직임을 추가하지 않는다.

## Motion & Accessibility

호버와 선택은 색·선·링으로 즉시 알아볼 수 있게 한다. 키보드 포커스는 전역 2px 윤곽선과 4px 간격으로 표시하고, 연재 링크와 그래프는 각자의 테두리·링을 사용한다. 본문과 조작 요소의 상태 변화는 150ms, 모바일 지도 패널의 열림·닫힘은 200ms, 그래프의 선택 이동은 320ms 안에서 처리한다. 그래프의 드래그·확대는 장식용 자동 모션이 아니라 사용자의 입력에 따른 조작이다. `prefers-reduced-motion`에서는 전환과 부드러운 스크롤을 끄고, 모바일에서는 조작 영역과 주변 간격을 함께 확인한다.

콜아웃의 경고·버그 괘선과 머리표 색은 `--warning`, `--bug` 변수와 YAML 토큰을 함께 사용한다. 콜아웃 판을 `paper-strong`보다 짙게 칠하지 않는 이유는 대비다. 짙은 판 위에서는 `muted` 머리표와 보조 글자가 4.5:1을 넘기 어렵다. 공식 린터는 컴포넌트에 선언한 배경·글자 색의 대비만 검사하므로, 포커스 표시·아이콘·선의 비텍스트 대비와 키보드 동작은 실제 화면에서 별도로 확인한다.

## Maintenance & Validation

[공식 명세](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)의 alpha 형식과 절 순서를 따른다. [공식 설계 철학](https://github.com/google-labs-code/design.md/blob/main/PHILOSOPHY.md)에 맞춰 값과 적용 이유를 함께 기록한다. 컴포넌트의 다방향 여백은 본문에 CSS 표기 그대로 적는다. 새 디자인 결정은 관련 절과 구현을 함께 갱신하고 Git diff로 검토한다.

```bash
npm run design:lint
```

lint는 문서 구조·참조·명시한 색 조합을 검사한다. `line`은 `divider` 컴포넌트에서 사용하며, 대비 경고가 나오면 해당 글자의 배경·크기와 함께 검토한다. 이 검사는 문서와 구현 코드의 값이 같은지까지 보장하지 않으므로, 토큰을 바꿀 때는 구현과 문서를 함께 검토한다. 토큰 변경이 클 때는 같은 버전의 `designmd diff <이전 파일> DESIGN.md`를 함께 사용한다.

화면 변경은 홈·긴 노트·목록·지도·검색을 320px, 390px, 1440px와 주요 전환 폭인 720px·1000px 전후에서 확인한다. 긴 제목, 썸네일 유무, 검색·공유 실패, 키보드 탐색을 포함한다. 문서 검사와 실제 화면 검증의 결과는 구분해 기록한다. 프로젝트 명령은 [AGENTS.md](AGENTS.md), 콘텐츠 표시 규칙은 [AUTHORING.md](AUTHORING.md)에서 관리한다.
