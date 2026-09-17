# src/lib 지침

vault를 사이트 데이터로 조립하는 코드에 적용하는 규칙이다. 저장소 전체 지침은 루트 `AGENTS.md`에 있다.

## 조립 모듈

- `garden.ts`는 공개 후보를 고르고 노트 레코드와 공개 색인을 만든 뒤 각 단계를 잇는다. 노트 링크 해석과 렌더링은 공개 색인이 필요하므로 `garden.ts`에 둔다.
- 단계별 모듈(`vault-files.ts`, `note-body.ts`, `text.ts`, `links.ts`, `books.ts`, `blog.ts`, `development.ts`, `public-assets.ts`)은 `garden.ts`를 import하지 않고 레코드 목록만 받는다. 이 방향을 지켜야 순환 의존이 생기지 않는다.
- Obsidian 문법(콜아웃, 위키링크, 형광, 블록 id, 그림 설명, 한글 강조)은 모두 `markdown.ts`의 `createMarkdownIt` 안에 markdown-it 규칙으로 둔다. 목차는 렌더러가 제목 id를 매길 때 `headings` 출력 인자로 함께 모으므로, 앵커와 목차를 따로 계산하지 않는다.
- 검색 텍스트와 요약 발췌는 `text.ts`의 `analyzeText`가 한 번의 파싱으로 함께 만든다.
- 본문과 썸네일이 쓸 수 있는 vault 자산은 `config.json`의 `assets`에 적은 파일과, 공개 폴더·Books 폴더 안에서 Markdown이 아닌 파일이다. `public-assets.ts`의 `createAssetResolver`가 실제로 쓰인 자산만 모으고, `src/integrations/vault-assets.ts`가 `dist/assets/vault/`로 복사한다.
- `content-model.ts`는 노트 컬렉션 필드의 Zod 스키마와 공개 노트·책·그래프·패널 타입을 정의한다. 조립 노트의 썸네일 경로와 Astro 컬렉션의 이미지 메타데이터는 서로 다른 값이므로 섞지 않는다.

## 공개 본문 변환

vault 원문은 바꾸지 않고 사이트에 싣는 사본만 바꾼다(`note-body.ts`의 `publicBody`).

- 첫 H1, Obsidian 주석(`%% %%`), `AUTHOR_ONLY_SECTIONS`(현재 `운영 메모`) 절을 뺀다. 그 절 바로 앞의 구분선(`---`, `***`, `___`)은 빈 줄 뒤에 있을 때만 함께 뺀다. 윗줄이 글이면 `---`는 그 줄을 제목으로 만드는 밑줄이므로 남긴다.
- 자동 요약, 검색 텍스트, 본문 링크는 정리한 공개 본문으로 계산한다. 명시한 `summary`를 우선하고, 외부 발행 글에는 본문 발췌 요약을 만들지 않는다.
- 본문 링크는 렌더러와 같은 Markdown 규칙으로 해석한다. 코드, 주석, 이스케이프한 예시, 운영 메모 안의 링크는 연결로 세지 않는다.
- 참조·역참조는 본문 링크와 `related` 목록의 위키링크를 합쳐 만든다. 공개 대상만 연결하고 중복은 제거한다. 전체 지도에는 기존 그래프 후보 규칙을 적용한다.
- 연재 목차와 이전·다음 탐색은 `series`와 `series_order`로 만든다. 본문에 적은 연재 목록은 자동으로 제거하지 않는다.
- `> [!article]` 콜아웃에 링크 하나만 있으면 대상 글의 제목·요약·썸네일로 카드를 만든다(`article-card.ts`).
- `format.ts`의 `HIDDEN_TAGS`(slipbox, blog, inbox, clippings)와 `프로젝트/*` 태그는 화면 어디에도 보이지 않는다. 주제(topic)는 첫 공개 태그의 첫 조각이다.

## URL과 슬러그

- 경로는 blog가 `/posts/<slug>/`, slipbox가 `/notes/<slug>/`, development가 `/dev/<slug>/`다.
- 슬러그는 frontmatter `slug`를 우선하고, 없으면 제목에서 만든다(한글 유지, 소문자, 기호는 `-`). 같은 kind에서 슬러그가 충돌하면 `slug.ts`가 빌드를 멈추므로, 둘 중 한 노트에 frontmatter `slug`를 적는다.
- **슬러그 생성 규칙과 헤딩 id 규칙이 정해지기 전까지 기존 URL과 fragment는 바뀔 수 있고, 과거 URL 호환은 고려하지 않는다.**

## OG 카드

- `og.ts`의 캐시 키는 최종 SVG 문자열, 글꼴, resvg 버전의 해시라서 수동 버전 상수가 없다. 캐시는 `node_modules/.cache/garden-og-images`와 `garden-og-fonts`에 있고 CI가 복원한다.
- `og-fonts.ts`는 글꼴을 고정 출처에서 받고, 다운로드한 파일과 캐시를 SHA-256으로 검증한다.
