---
version: alpha
name: TaeZ's Thinking Garden
description: 한국어 글을 읽고 지도와 참조 관계로 관련 노트를 탐색하는 개인 위키
colors:
  primary: '#252e29'
  paper: '#f7f7f2'
  paper-strong: '#fdfdfa'
  muted: '#626d64'
  faint: '#687267'
  line: '#d8ded4'
  accent-soft: '#e7e9e3'
  warning: '#a66a38'
  bug: '#9c6e6e'
  highlight: '#e7d99b'
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
  article-h2:
    fontFamily: Gowun Batang
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.02em
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
spacing:
  content-max: 1180px
  page-gutter: 24px
  page-gutter-mobile: 20px
  column-gap: 40px
  reader-column: 720px
  sidebar: 310px
  paragraph-gap: 22px
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
    rounded: '{rounded.control}'
    height: 44px
  button-primary-hover:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.paper-strong}'
  header-icon-button-hover:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.primary}'
  meta-line:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
    typography: '{typography.meta}'
  count:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.faint}'
    typography: '{typography.meta}'
  series-card:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.primary}'
    rounded: '{rounded.control}'
  series-card-hover:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.primary}'
  callout:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.primary}'
    rounded: '{rounded.none}'
  callout-warning-title:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.warning}'
  callout-bug-title:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.bug}'
  text-highlight:
    backgroundColor: '{colors.highlight}'
    textColor: '{colors.primary}'
  search-dialog:
    backgroundColor: '{colors.paper-strong}'
    textColor: '{colors.primary}'
    rounded: '{rounded.overlay}'
---

## Overview

Thinking Garden은 한국어 글을 읽고 관련 노트를 찾아가는 개인 위키다. 홈에서는 노트 지도로 주제와 연결을 살펴보고, 목록에서는 제목과 요약으로 글을 고르며, 리더에서는 본문을 읽다가 참조·역참조를 따라 이동한다. 따뜻한 밝은 배경, 먹색 글자, 명조 제목과 고딕 본문으로 긴 글을 편안하게 읽는 분위기를 만든다. 지도에는 주제별 색을 사용해 탐색을 돕는다.

이 문서는 현재 디자인의 값과 의도를 기록한다. YAML은 대표 토큰이고 본문은 용도·배치·상태를 설명한다. 디자인을 개선할 때는 바뀐 의도를 문서에 적고 구현도 함께 갱신한다. 공통 스타일은 [site.css](src/styles/site.css), 본문은 [body.css](src/styles/body.css), 주제색은 [GRAPH_COLORS](src/lib/format.ts), 개별 배치는 해당 Astro 컴포넌트와 대조한다.

## Colors

`primary`는 `--ink`와 `--accent`에 대응하며 글자와 주요 조작을 표시한다. `paper`는 페이지 배경, `paper-strong`은 코드·표 머리·콜아웃·대화상자 배경이다. `muted`와 `faint`는 보조 정보의 위계를, `line`은 내용의 구획을 나타낸다. `accent-soft`는 호버·선택 배경에 사용한다. 본문 링크는 먹색 글자에 밑줄을 더해 주변 문장과 구분한다.

주제색은 노드·영역·태그 점·지도 영역 이름·현재 목차 위치에 사용한다. 색과 함께 주제 이름, 허브 링, 연결 목록을 제공해 의미를 읽을 수 있게 한다. 아래 값은 `GRAPH_COLORS`와 대응한다.

| 주제 | 색 | 주제 | 색 |
|---|---|---|---|
| AI | `#80698f` | 개발 | `#5d7897` |
| 커리어 | `#9a7852` | 지식관리 | `#5c806c` |
| 글쓰기 | `#9c6e6e` | 철학 | `#9b8a45` |
| 조직 | `#4a8791` | 심리 | `#a4617f` |
| 기타 | `#817f72` |  |  |

`warning`과 `bug`는 본문 콜아웃의 제목·왼쪽 선에, `highlight`는 형광 표시에 사용한다. 버그와 글쓰기의 색상값은 같으며 의미는 각각의 용도로 구분한다. 그래프 간선의 색과 투명도는 [graph.css](src/styles/graph.css), Mermaid의 테마 색은 [mermaid.ts](src/scripts/mermaid.ts)에서 관리한다.

## Typography

Gowun Batang 700은 제목과 요약·인용을, Pretendard Variable은 본문·목록·조작 요소를 표현한다. 대체 서체는 `site.css`의 `--display`와 `--sans`를 따르며 코드는 시스템 고정폭 서체를 사용한다. 긴 한국어 문장은 `keep-all`로 단어를 묶고 긴 URL은 가용 폭에 맞춰 줄바꿈한다.

리더 제목은 `reader-title`, 720px 이하에서는 `reader-title-mobile`을 사용한다. 본문은 모바일에서도 `body`의 17px/1.85를 유지한다. 일반 UI의 모바일 기본 글자 크기는 16px다. 목록 제목은 기본 20px, 모바일 18px이며 메타데이터는 13px와 표 형식 숫자를 사용한다.

리더 제목과 홈 대표 글·연재 제목은 `text-wrap: balance`로 줄 길이를 고르게 배분한다. 제목 원문과 글자 크기는 유지하며 지원하지 않는 브라우저에서는 기본 줄바꿈을 사용한다.

역할에 따라 제목 크기를 구분한다. 본문 H2/H3/H4는 26/21/17px, 목록 페이지 제목은 28px, 홈 절 제목과 지도 패널 제목은 24px다. 홈의 왼쪽 절 제목인 대표 글·최근 기록·최근 연재는 모두 명조 24px를 사용한다. 대표 글의 실제 글 제목은 34px에서 모바일 24px로 바뀐다. 제목 아래 요약과 요약 콜아웃은 명조 18.5px/1.65다. 세부 굵기와 줄높이는 각 컴포넌트에 정의한다.

## Layout

공통 컨테이너는 최대 1180px이며 좌우 여백은 각각 24px다. 720px 이하에서는 각각 20px다. 리더는 최대 720px 본문과 310px 사이드바를 40px 간격으로 배치한다. 1000px 이하에서는 한 열로 바뀌고 참조·역참조가 본문 뒤로 이동한다. 접힘 목차는 제목 아래에서 열어 볼 수 있다.

모바일 목록은 열을 세로로 쌓고, 긴 표·코드는 블록 안에서 가로로 스크롤한다. 지도 주제 필터는 한 줄로 스크롤하며, 노트를 선택하면 720px 이하에서 하단 시트가 열린다. 상세 노트에서는 태그와 연결 목록으로 주제·관계를 확인한다. [NotePage](src/components/NotePage.astro)와 [지도 페이지](src/pages/map/index.astro)가 폭에 따른 배치를 정한다.

모바일 홈은 첫 글까지의 이동을 줄이기 위해 소개 위 여백을 20px로 두고 지도를 `clamp(200px, 50vw, 280px)` 높이로 표시한다. 소셜 링크는 소개 페이지에서 제공하며 데스크톱 홈에도 유지한다.

여백은 관계에 따라 구분한다. 사이드 목록 항목 사이는 8px, 본문 문단 사이는 22px, 큰 열 사이는 40px다. 헤더는 상단에 고정되며 데스크톱 72px, 모바일 56px 높이다. 노트 제목 아래 여백은 데스크톱 40px, 모바일 28px다.

홈의 대표 글·최근 기록·최근 연재는 왼쪽 120px 안내 열과 오른쪽 콘텐츠를 40px 간격으로 맞춘다. 대표 글은 왼쪽에 절 제목·날짜·발행처, 오른쪽에 글 제목·명시한 요약 전체·썸네일을 둔다. 최근 기록은 종류마다 한 편씩 유지하고 날짜·종류(노트·개발 노트·글)·제목·주제 순으로 표시하며 건수는 적지 않는다. 주제는 지도와 같은 색의 점과 이름으로 표시한다. 721~1000px에서는 안내 열을 100px로 줄이고 주제를 제목 아래에 둔다. 720px 이하에서는 절 제목을 위에 두고, 각 최근 기록의 제목 아래에 날짜·종류·주제를 배치한다.

최근 기록의 행 구분선은 항목 사이에만 두고, 마지막 행 아래에는 선을 두지 않는다. 다음 절과는 전체 너비의 구분선 하나로 나눈다.

최근 연재에 허브 썸네일이 있으면 대표 글과 같은 이미지 열·반응형 배치를 사용한다. 없으면 이미지 공간 없이 텍스트로 표시한다. 최근 연재의 글 제목은 목록 제목 크기를 유지해 대표 글보다 낮은 위계로 둔다. 왼쪽 절 제목 아래에는 공개된 편수와 진행 상태를 메타 서체로 표시하며 날짜는 넣지 않는다.

## Elevation & Depth

목록과 본문은 밝은 배경, 얇은 구분선, 여백으로 내용을 구분한다. 검색 대화상자의 그림자는 `0 18px 70px rgba(36,39,32,.18)`, 공유 실패 안내는 `0 3px 12px rgba(36,39,32,.10)`이다. 모바일 지도 시트는 밝은 배경과 상단 테두리, 뒤쪽 반투명 배경으로 본문과 구분한다.

그래프의 옅은 주제 영역은 노드의 묶음을 보여준다. 긴 목록과 가로 스크롤 필터의 끝에는 페이드를 두어 화면 밖에 내용이 더 있음을 알린다.

## Shapes

본문 표·코드·콜아웃은 직각, 버튼·연재 탐색 카드는 4px, 검색창·공유 안내·지도 확대 컨트롤의 바깥 상자는 6px 모서리를 사용한다. 주제 점과 지도 노드는 원형이고 허브·선택 상태는 링으로 표시한다. 세부 아이콘에는 역할에 맞는 곡률을 사용하며, 썸네일의 가장자리 처리는 이미지 유형별 스타일을 따른다.

## Components

- **버튼:** `.btn`은 높이 44px, 좌우 여백 20px, 글자 15px/600이다. 작은 변형은 높이 40px, 좌우 여백 18px, 글자 14px다. 호버에서는 배경이 `muted`로 바뀐다.
- **헤더 조작:** 검색·공유는 44px 조작 영역 안에 18px 선 아이콘을 둔다. 호버 시 밝은 배경과 먹색 아이콘으로 반응한다. 검색은 접근 가능한 이름을, 공유는 숨긴 텍스트 이름을 제공한다.
- **지도 조작:** 확대·축소·맞춤 버튼은 데스크톱 최소 36px, 모바일 최소 40px 크기다. 주제 필터의 선택 상태는 배경색과 `aria-pressed`로 나타낸다.
- **목록:** 왼쪽에 연도·분류·등급을 두고 오른쪽에 제목·메타·요약을 배치한다. 요약은 세 줄까지 표시한다. 메타 줄의 구분점은 다음 항목과 함께 줄바꿈되도록 붙인다.
- **연재 탐색:** 이전·다음 링크는 1px 테두리와 `14px 18px` 여백을 사용한다. 호버·키보드 포커스에서 먹색 테두리와 밝은 배경으로 강조한다.
- **콜아웃:** 기본 여백은 `12px 18px 16px`다. 제목과 아래 선, 왼쪽 막대가 종류를 구분한다. 요약·인용은 명조, 질문은 점선, 팁은 화살표, 경고·버그는 의미별 색을 사용한다. 접힌 콜아웃은 제목 줄만 표시한다.
- **검색:** 최대 650px 대화상자에서 입력·로딩·결과·빈 상태·실패 상태를 구분한다. 실패 시 재시도 버튼을 제공하고, 단축키 안내는 운영체제에 맞게 표시한다.
- **공유:** 복사 성공은 체크 아이콘과 스크린리더 안내로 전달한다. 실패는 버튼 아래에 대안을 담은 짧은 안내를 표시한다. [ShareLink](src/components/ShareLink.astro)가 안내의 위치·폭·표시 시간을 설명한다.
- **연결 탐색:** 선택한 노트의 참조는 실선, 역참조는 점선으로 나타낸다. 전체 연결은 목록에서도 읽을 수 있다. 노드 선택과 키보드 포커스는 링으로, 목차의 현재 위치는 주제색 선과 굵은 글자로 표시한다.

## Motion & Accessibility

호버와 선택은 색·선·링으로 즉시 알아볼 수 있게 한다. 키보드 포커스는 기본 2px 윤곽선과 4px 간격으로 표시하고, 연재 링크와 그래프는 각자의 테두리·링을 사용한다. 이동·접힘 효과는 `prefers-reduced-motion`에 맞춰 줄인다. 모바일에서는 조작 영역과 주변 간격을 함께 확인한다.

현재 콜아웃 경고·버그 제목의 대비는 각각 4.35:1, 4.23:1로 일반 텍스트의 4.5:1 기준보다 낮다. 이는 현재 구현의 미해결 항목이며, 해당 색 조합을 YAML에 포함해 lint에서 계속 확인한다.

## Maintenance & Validation

[공식 명세](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)의 alpha 형식과 절 순서를 따른다. [공식 설계 철학](https://github.com/google-labs-code/design.md/blob/main/PHILOSOPHY.md)에 맞춰 값과 적용 이유를 함께 기록한다. 컴포넌트의 다방향 여백은 본문에 CSS 표기 그대로 적는다. 새 디자인 결정은 관련 절과 구현을 함께 갱신하고 Git diff로 검토한다.

```bash
npx --yes --package=@google/design.md@0.4.0 designmd lint DESIGN.md
```

lint는 문서 구조·참조·명시한 색 조합을 검사한다. 구분선의 `orphaned-tokens` 경고는 실제 용도로 판단하고, 대비 경고는 해당 글자의 배경·크기와 함께 검토한다. 토큰 변경이 클 때는 같은 버전의 `designmd diff <이전 파일> DESIGN.md`를 함께 사용한다.

화면 변경은 홈·긴 노트·목록·지도·검색을 320px, 390px, 1440px와 주요 전환 폭인 720px·1000px 전후에서 확인한다. 긴 제목, 썸네일 유무, 검색·공유 실패, 키보드 탐색을 포함한다. 문서 검사와 실제 화면 검증의 결과는 구분해 기록한다. 프로젝트 명령은 [AGENTS.md](AGENTS.md), 콘텐츠 표시 규칙은 [AUTHORING.md](AUTHORING.md)에서 관리한다.
