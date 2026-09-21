# src/lib 지침

vault를 사이트 데이터로 조립하는 코드에 적용하는 규칙이다. 저장소 전체 지침은 루트 `AGENTS.md`에 있고, 노트가 사이트에 표시되는 규칙의 정본은 `AUTHORING.md`다. 이 문서는 어느 모듈이 무엇을 맡는지와 코드에서 지켜야 할 조건만 적는다.

## 모듈 책임

- `garden.ts`는 공개 후보를 고르고 노트 레코드와 공개 색인을 만든 뒤 각 단계의 결과를 모은다. 노트 링크 해석과 렌더링은 공개 색인이 필요하므로 여기 둔다.
- 단계별 모듈(`vault-files.ts`, `note-body.ts`, `text.ts`, `links.ts`, `books.ts`, `blog.ts`, `development.ts`, `public-assets.ts`)은 `garden.ts`를 import하지 않는다. 이 방향을 지켜야 순환 의존이 생기지 않는다. 받는 값은 모듈마다 다르다. `note-body.ts`·`text.ts`·`links.ts`는 본문 문자열을, `vault-files.ts`·`books.ts`·`public-assets.ts`는 vault 경로와 `config`를, `blog.ts`·`development.ts`는 레코드 목록을 받는다.
- Obsidian 문법(콜아웃, 위키링크, 형광, 블록 id, 그림 설명, 한글 강조, 할 일 목록)은 모두 `markdown.ts`의 `createMarkdownIt` 안에 markdown-it 규칙으로 둔다. 각주만 `markdown-it-footnote` 플러그인을 쓰고 출력 마크업을 여기서 정한다. 플러그인은 `structureParser`에도 넣어야 검색 텍스트와 요약에 `[^1]`과 정의 줄이 글자로 섞이지 않는다. 코드 강조는 `highlight.ts`가 `highlight` 옵션으로 붙고, 라이브러리에 없는 Java만 `highlight-java.ts`에 직접 정의한다.
- 목차는 렌더러가 제목 id를 매길 때 `headings` 출력 인자로 함께 모으므로 따로 계산하지 않는다. 예외는 제목 경로 링크(`[[노트#상위#하위]]`)다. 대상 노트의 앵커를 고르려고 `garden.ts`가 `headingOutline`으로 그 노트의 제목 구조를 한 번 더 계산한다.
- 검색 텍스트와 요약 발췌는 `text.ts`의 `analyzeText`가 한 번의 파싱으로 함께 만든다.
- 공개 자산은 공개 폴더와 Books 폴더 안에서 Markdown이 아니고 `exclude`에 걸리지 않은 파일, 그리고 `config.json`의 `assets`에 적은 파일이다. 본문과 썸네일이 실제로 가리킬 수 있는 것은 그중 이미지 확장자뿐이다(`public-assets.ts`). 본문이 쓴 자산만 `assetCopies`에 모여 `src/integrations/vault-assets.ts`가 `dist/assets/vault/`로 복사한다. 썸네일은 `copy: false`로 해석해 이 목록에 넣지 않고 Astro의 이미지 파이프라인이 처리한다.
- 글 카드의 HTML은 `article-card.ts`가 만들지만, 카드가 되는 조건은 `markdown.ts`에 있다. 접기 표시가 없고 콜아웃 본문이 위키링크 한 줄이며 대상이 공개일 때만 카드가 된다. 콜아웃 제목을 적으면 그 문구가 요약 자리에 들어가고, 썸네일은 `ArticleBody.astro`가 컬렉션에서 읽어 넘긴다.
- `content-model.ts`는 노트 컬렉션 필드의 Zod 스키마와 공개 노트·책·그래프·패널 타입을 정의한다. 조립 노트의 썸네일은 경로 문자열이고 Astro 컬렉션 쪽은 `ImageMetadata`이므로 같은 필드로 다루지 않는다.
- 주제(topic)는 첫 공개 태그의 첫 조각이지만 최종 값은 다를 수 있다. 지도 노드가 `minTopicNodes`(기본 3, `config.json`으로 바꾼다) 미만인 주제는 `기타`로 접고 원래 값을 `topicTag`에 남긴다(`garden.ts`). 범례가 길어지고 팔레트가 바닥나는 것을 막는 규칙이라 노트와 노드가 같은 기준을 쓴다.

## 조립이 빌드를 멈추는 조건

공개 범위와 외부 발행 글의 조건은 루트 `AGENTS.md`에 있다. `src/lib`에서 더 검사하는 것은 다음과 같다.

- 공개 대상인 Concepts·Troubleshooting 노트에 `summary`가 없을 때(`garden.ts`).
- 썸네일을 공개 자산으로 해석하지 못하거나, `thumbnail_style`이 `plain`·`soft`가 아닐 때(`garden.ts`).
- frontmatter `slug`에 글자·숫자·하이픈 밖의 문자가 있거나, 같은 kind에서 슬러그가 겹칠 때(`slug.ts`).
- 공개 노트에 `created`가 없거나, `created`·`published`·`updated`에 유효하지 않은 날짜 또는 미래 날짜를 적었을 때(`dates.ts`). 날짜 작성 규칙은 루트 `AUTHORING.md`의 날짜 절을 따른다.

## 공개 본문과 링크

무엇을 빼고 무엇을 남기는지는 `AUTHORING.md`에 있다. 여기서는 어느 파일이 그 일을 하는지만 적는다.

- 공개 본문 사본과 자동 요약: `note-body.ts`의 `publicBody`. vault 원문은 바꾸지 않는다.
- 참조·역참조: `links.ts`가 본문과 `related`에서 대상을 뽑고, `garden.ts`가 공개 색인으로 해석해 공개 대상만 남긴다.
- 연재 목차와 이전·다음 탐색: `blog.ts`와 `note-nav.ts`.
- URL 경로와 슬러그 생성: `kinds.ts`와 `slug.ts`.

## OG 카드

- 캐시 키는 최종 SVG 문자열, 글꼴, resvg 버전, 렌더 옵션의 해시라서 수동 버전 상수가 없다. 캐시는 `node_modules/.cache/garden-og-images`와 `garden-og-fonts`에 있고 CI가 복원한다. 빌드마다 한 번 14일 넘게 쓰지 않은 항목을 지우며, 적중한 파일은 시각이 갱신되어 남는다.
- `og-fonts.ts`는 글꼴을 고정 출처에서 받고 다운로드한 파일과 캐시를 SHA-256으로 검증한다. 받지 못하면 로컬에서는 시스템 글꼴로 대신 그리고, CI에서는 빌드를 멈춘다.
