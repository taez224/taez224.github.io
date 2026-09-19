# Agent Instructions

AI 코딩 에이전트가 이 저장소에서 작업할 때 따르는 지침이다. Codex는 이 파일을 직접 읽고, Claude Code는 `CLAUDE.md`가 이 파일을 가져온 뒤 Claude 전용 절을 덧붙인다.

## 이 저장소가 하는 일

TaeZ's Thinking Garden(https://taez224.github.io/)을 만드는 Astro 7 정적 사이트다. **노트 원본은 이 저장소에 없다.** 별도 저장소 `taez224/obsidian`(Obsidian vault)을 읽어서 공개할 수 있는 부분만 사이트에 싣는다.

- 로컬: vault는 옆 폴더 `../obsidian`에 클론돼 있다. 다른 위치면 `GARDEN_VAULT_ROOT`로 지정한다. dev와 build 모두 vault가 있어야 실행된다.
- CI(`.github/workflows/deploy.yml`): vault를 `vault/`에 한 번 더 checkout하고 `GARDEN_VAULT_ROOT`로 넘긴다. main push, 매일 04:00 KST, 수동 실행(`gh workflow run deploy.yml`) 때 실행된다. PR에서는 같은 검사를 실행하되 배포하지 않는다. **vault만 바뀌면 다음 예약 빌드까지 사이트에 반영되지 않는다.**
- 노트 작성 규칙(frontmatter 속성, 허용 값)의 정본은 vault의 `99_Templates/_property-schema.md`다. 사이트의 표시 규칙은 `AUTHORING.md`에 있으므로 콘텐츠 렌더링을 바꾸기 전에 먼저 읽는다.
- 방문자용 소개 원고는 `src/content/about.md`다. `src/pages/about.astro`가 일반 Markdown으로 렌더링하며, vault 노트 컬렉션에는 넣지 않는다.

## 명령

Node 26.8.2(`.nvmrc`, `package.json`의 `engines`)와 커밋된 `package-lock.json`을 쓴다. CI도 같은 버전을 쓴다.

```bash
nvm use                      # .nvmrc에 고정한 Node 버전 선택
npm ci                       # 잠근 의존성 설치
npm run check                # TS 소스·설정·빌드 도구·타입 계약 검사
npm run check:astro          # Astro 컴포넌트·페이지 전체 타입 검사
npm test                     # node --test tests/*.test.ts
node --test --test-name-pattern="slug" tests/garden.test.ts   # 파일 하나에서 이름으로 골라 실행
npm run dev                  # astro dev. vault 파일을 감시해 다시 조립한다
npm run build                # astro build && node scripts/check-dist.ts
npm run preview              # dist를 서빙한다. 먼저 build가 있어야 한다
npm run design:lint          # DESIGN.md 형식과 선언한 색 조합의 대비 검사
npm run snapshot:markdown -- write|verify   # 공개 본문 전체의 조립 결과를 저장했다가 바이트 단위로 비교
npm run fonts:vendor         # 글꼴 버전을 올릴 때만. public/fonts와 src/styles/fonts.css를 다시 만든다
```

- `npm run build`는 `scripts/check-dist.ts`까지 통과해야 성공이다. 이 검사는 메타데이터, OG PNG, 공개 범위, 페이지와 데이터의 연결, 그래프 초기화에 필요한 산출물, 사이트 안 링크를 확인한다. 문구·글꼴·아이콘·배치·콘텐츠 개수는 고정하지 않는다.
- `snapshot:markdown`은 Markdown 렌더러, 본문 정리, 목차, 검색 텍스트, 링크 해석을 고치거나 markdown-it·sanitize-html을 올릴 때 쓰는 회귀 검사다. 고치기 전에 `write`, 고친 뒤에 `verify`를 실행한다. 실제 vault를 읽기 전용으로 읽고, 산출물이 다르면 종료 코드 1, config.json이나 스냅샷 형식이 다르면 종료 코드 2로 끝난다. 원문이 바뀐 노트가 있으면 전체 동일로 판정하지 않는다. 자동 테스트가 아니므로 Markdown 문법은 임시 입력을 쓰는 단위 테스트로 검증한다.
- 글꼴(Pretendard, Gowun Batang)은 자체 호스팅한다. `scripts/vendor-fonts.ts`가 고정 버전 npm 패키지에서 woff2 조각을 받아 `public/fonts/`에 커밋해 두므로 빌드와 dev에 네트워크가 필요 없다. 글꼴 버전은 스크립트의 패키지 버전으로 올리고, 생성된 `fonts.css`는 직접 고치지 않는다.
- `sharp`는 Astro가 선택 의존성으로만 가져오지만 썸네일 최적화와 OG 카드가 쓰므로 직접 의존성으로 선언한다.
- `overrides`의 `lodash-es`는 Mermaid 12가 쓰는 chevrotain이 취약한 4.17.23을 고정하기 때문에 둔 것이다. chevrotain 계열 세 패키지가 4.18 이상을 선언하면 override를 빼고 `npm audit --omit=dev`와 도표 렌더링을 다시 확인한다.
- 환경 변수: `GARDEN_VAULT_ROOT`(vault 경로), `GARDEN_PROJECT_ROOT`(기본 cwd), `GARDEN_OG_CACHE_DIR`, `GARDEN_DIST_DIR`(check-dist 대상).

## 아키텍처

`src/lib/garden.ts`의 `assembleGarden()`이 vault를 한 번 조립하고, 나머지는 모두 그 결과를 읽는다. 페이지(`src/pages/**`)는 `getCollection('notes'|'books')`로 읽고, 엔드포인트(`data/*.json.ts`, `og/*.png.ts`, `rss.xml.ts`, `llms.txt.ts`)는 `getGarden()`으로 읽는다. `get-garden.ts`가 결과를 메모이즈하고, dev에서는 2초가 지나면 다시 조립한다.

- 조립 코드의 규칙(모듈 책임과 의존 방향, 빌드를 멈추는 조건, OG 카드 캐시)은 `src/lib/AGENTS.md`에 있다. `src/lib/`을 고치기 전에 읽는다.
- 조립이 읽는 입력을 새로 더하면 `src/loaders/vault.ts`의 `watchPathsFor`에도 더한다. 빠뜨리면 dev에서 그 파일을 고쳐도 다시 조립되지 않는다.
- 홈과 지도는 페이지에 인라인한 JSON(`data-hero-data`, `data-map-data`)으로 그래프를 그리므로 fetch하지 않는다. fetch는 검색이 `search.json`을 열 때만 한다. `data/site.json`은 페이지가 쓰지 않지만 공개 데이터 엔드포인트이자 check-dist의 기준 자료라 남긴다.
- 그래프는 프레임워크 없는 SVG 엔진 `src/graph/engine.ts`가 그린다. `src/graph`의 나머지 모듈은 DOM을 쓰지 않는 순수 함수이고 모듈마다 단위 테스트가 있다.
- 홈은 빌드 때 그린 SVG 스냅샷(`src/graph/snapshot.ts`)을 먼저 보여 주고, 넓은 화면에서는 엔진이 올라오면 스냅샷을 가린다. 두 쪽이 같은 제목 배치 규칙(`label.ts`의 `placeLabels`)과 맞춤을 써야 교체가 눈에 띄지 않으므로, 배치 규칙을 바꾸면 두 쪽이 함께 바뀌는지 확인한다.
- 휴대폰 폭(720px 이하)에서는 엔진을 숨기고 스냅샷을 보인다. 창을 줄이거나 기기를 돌려도 스냅샷이 돌아와야 하므로, 스냅샷은 DOM에서 지우지 않고 CSS로만 가린다. 이 폭 경계는 `src/scripts/hero-graph.ts`의 `LIVE_HERO_QUERY`와 `src/pages/index.astro`의 미디어 쿼리 두 곳에 있고, `tests/hero-graph.test.ts`가 둘이 같은지 검사한다.
- 지도는 무대 크기가 화면마다 달라 스냅샷을 둘 수 없다. 대신 `src/integrations/module-preload.ts`가 지도 스크립트를 `<head>`로 옮기고 `blocking="render"`를 달아, 그래프가 올라간 뒤에 첫 화면을 그린다.

### 공개 범위 규칙 (바꿀 때 주의)

- `config.json`의 `include`/`exclude`가 폴더 단위 규칙이고, `src/lib/publication.ts`의 `privateRoots`는 config와 무관하게 항상 비공개다. Development 폴더는 `_`나 `.`로 시작하는 경로 조각이 있으면 뺀다. `include`에 적은 폴더가 vault에 없으면 빌드가 멈추므로, vault에서 공개 폴더의 이름을 바꾸면 `config.json`도 함께 고친다.
- 블로그(`20_Projects/blog`)는 `status: published`이거나 `type: series`인 글만 들어온다. 발행된 편이 없는 연재 허브는 조립 단계에서 뺀다.
- `externalPublications` 규칙에 걸리는 글은 `contentMode: 'external'`이 되어 본문·목차·검색 텍스트 없이 소개 페이지만 만든다. 이때 `source`가 그 호스트의 유효한 https URL이 아니면 빌드가 실패한다.
- 비공개 노트는 존재 여부만 기록하고 제목·요약·본문을 절대 출력하지 않는다. HTML, 검색 데이터, 그래프 데이터 어디에도 비공개 메타데이터와 외부 발행 글의 본문을 내보내지 않는다.

## TypeScript 검사

- 애플리케이션(`src/`), 빌드 도구, 테스트를 모두 TypeScript로 쓴다. `tsconfig.json`은 Astro strict 설정이고 `allowJs`는 끈다. `npm run check`(`tsconfig.check.json`)와 `npm run check:astro`가 CI에서 모두 통과해야 한다.
- TypeScript는 `astro check`가 지원하는 6.x를 쓴다. TypeScript 7은 검사 도구에 필요한 programmatic API를 아직 제공하지 않는다.
- 상대 import에는 실제 `.ts` 확장자를 적고, 타입은 `import type`으로 가져온다.
- 테스트는 Node 26의 타입 스트리핑으로 빌드 단계 없이 실행한다. 그래서 `erasableSyntaxOnly`로 enum과 매개변수 프로퍼티처럼 실행 코드 변환이 필요한 문법을 막는다.
- Mermaid는 npm 의존성으로 관리하고, 도표가 있는 페이지에서만 동적 import로 불러온다.

## 코드 스타일

주변 코드를 따른다. 포매터와 린터는 없다.

- 2칸 들여쓰기, ES 모듈, 단따옴표 문자열, 세미콜론.
- Astro 컴포넌트는 PascalCase, 헬퍼 파일은 kebab-case, 함수와 변수는 camelCase.
- 공용 로직은 `src/lib/`, 브라우저 동작은 `src/scripts/`, 그래프 순수 함수는 `src/graph/`에 둔다.
- 주석과 문서는 한국어로 쓴다. 코드 주석은 "왜"를 적는다.

## 디자인

화면 작업 전에 `DESIGN.md`의 Overview와 관련 절을 읽는다. 이 문서는 Google Labs의 DESIGN.md 형식으로 현재 디자인의 값과 의도를 기록한다.

- 디자인은 기존 컴포넌트에서 출발해 고치고, 달라지는 값과 동작을 구현과 `DESIGN.md`에 함께 반영한다. 어느 값이 어느 파일에서 오고 어떤 테스트가 문서와 구현의 일치를 검사하는지는 `DESIGN.md`의 「문서와 구현의 대응」 표에 있다. 문서와 구현이 어긋나면 의도한 변경인지 확인하고, 문서가 낡았으면 현재 구현에 맞춘다.
- 사이트 색의 단일 출처는 `src/lib/palette.ts`의 `PALETTE`(밝은 화면)와 `DARK_PALETTE`(어두운 화면)다. CSS는 `var(--이름)`으로 읽고, CSS 변수를 읽지 못하는 OG 카드·Mermaid 설정·`theme-color` 메타만 이 상수를 가져다 쓴다. 다른 파일에 색 값을 복제하면 `tests/palette.test.ts`가 실패한다.
- `npm run design:lint`(`@google/design.md@0.4.0`)는 문서 형식과 선언한 색 조합의 대비만 검사한다. 오류가 0이어도 실제 화면은 따로 확인한다.

## 한국어 문체

한국어 출력은 관할을 두 축으로 나눈다. 두 축이 서로 독립적이므로 동시에 지킨다.

- **문장 내부**는 `fluent-korean` 지침이 정한다. 조사와 어미를 생략하지 않고, 의미를 담은 문장 성분을 빼지 않으며, 명사구나 연결어미로 문장을 끝내지 않는다. 종결 조항은 헤더와 목록에 강제하지 않으므로 헤딩은 각 산출물의 규칙대로 명사구로 쓸 수 있다. 일반적인 어휘를 써야 할 자리에 비유적 어휘를 쓰지 않고, 엠대시 대신 콜론이나 접속사를 쓴다. 전문은 `.claude/output-styles/fluent-korean.md`에 있고, 원문 출처는 snflkd/fluent-korean(MIT)이다. 이 줄은 조항을 줄여 옮긴 것이라 원문보다 좁게 읽히면 안 되고, 어긋나면 전문을 따른다.
- **문서 전체**는 이 파일과 각 산출물의 기존 규칙이 정한다. 분량, 구조, 종결체, 형식이 여기 속한다. 이 저장소의 문서는 "~한다" 평서형으로 쓴다. 분량을 줄이라는 요구는 문장 수를 줄이라는 뜻이지, 문장에서 조사와 어미를 덜어내라는 뜻이 아니다.

문서 전체에는 다음을 지킨다.

- 문장은 짧게, 대상은 구체적으로 쓴다. 범위·경계·책임·주체 같은 추상명사가 쌓이면 실제 대상(파일, 함수, 빌드 단계, 독자)으로 바꾼다.
- 한 절에서 하려는 말은 하나다. 같은 뜻을 원칙·목록·조건으로 되풀이하지 않고, 앞 문단을 되짚거나 다음 문단을 예고하는 문장은 뺀다.
- 헤딩은 절에 무엇이 있는지 말하는 짧은 명사구로 쓴다. "~한다"로 끝나는 구호형과 "~하기" 문장형은 쓰지 않는다.
- 비유와 꾸민 표현 대신 직설로 쓴다. 문자 그대로의 표현이 있으면 그것을 쓴다.
- 지어낸 장면과 "확인할 질문" 표로 내용을 채우지 않는다. 실제 사례가 없으면 일반 원리만 쓴다.
- 링크는 관계나 출처를 말하는 본문 문장의 어구에 건다. 문장 끝에 인용만 덧붙이지 않는다.
- em dash(U+2014)와 en dash(U+2013)를 쓰지 않는다. 링크 뒤 설명은 하이픈, 소제목 뒤는 콜론이나 문장 분리.

코드, 코드 주석, 변수명, 로그 문자열, 커밋 메시지, 인용문에는 적용하지 않는다. 각자의 기존 관례를 그대로 따른다. 커밋 제목을 명사형으로 끝내는 규칙이 유지되는 것도 이 때문이다.

vault(`../obsidian`)에 쓰는 노트와 글은 그 저장소의 규칙과 스킬이 정본이다.

Codex는 이 절만 읽고, Claude Code는 여기에 더해 위의 output-style 전문까지 읽는다. 두 도구에 같은 조항을 두 벌 싣지 않으려고 조항 전문과 관할 배분을 나눠 두었다.

## 테스트

- `node:test`와 `node:assert/strict`를 쓰고 파일 이름은 `*.test.ts`다. 테스트 이름은 관찰 가능한 동작을 서술한다.
- **테스트는 임시 vault로 실행한다.** `tests/garden.test.ts`의 `makeVault()`처럼 `os.tmpdir()`에 최소 파일을 만들어 검증하고, 실제 `../obsidian`은 테스트에서 읽지 않는다.
- 동작을 바꾸면 회귀 테스트를 더한다. Markdown 렌더링, 링크 해석, 공개 판정을 바꿀 때는 빠짐없이 더한다.
- 코드를 넘기기 전에 `npm run check`, `npm run check:astro`, `npm test`, `npm run build`를 모두 실행한다. `DESIGN.md`를 고쳤으면 `npm run design:lint`도 실행한다.
- 화면을 바꿨으면 데스크톱과 모바일 폭, 밝은 화면과 어두운 화면을 모두 확인한다. 확인할 폭과 상태는 `DESIGN.md`의 「검사」 절에 있다.

## 작업 규칙

- `AGENTS.md`, `DESIGN.md`, `AUTHORING.md`를 점검하거나 최신화할 때는 `doc-audit` 스킬의 절차를 따른다. 문장을 다듬기 전에 서술을 코드와 대조한다.
- 새 표시 문법이나 조건을 추가하면 `AUTHORING.md`와 관련 테스트를 고친다. 공개 범위나 배포 산출물의 필수 조건이 바뀔 때만 `check-dist.ts`를 고친다. frontmatter 속성을 바꾸면 vault의 속성 스키마도 고친다.
- 생성물인 `dist/`와 `.astro/`는 편집하지 않는다.
- `docs/`는 설계 문서, 계획서, 비교 기록을 두는 로컬 전용 폴더다(`.git/info/exclude`). `git add` 하지 않는다. 2026-09-06 리디자인 문서들은 사이트가 vault 안에 있던 시절(`basePath: /obsidian`) 기준이라 경로가 낡았다.
- 독자에게 `published`·`slipbox`·`blog`·`프로젝트/*`·`status` 같은 내부 메타데이터 값을 보이지 않는다. 문구와 배치 변경은 화면에서 검토한다.

## 커밋 규칙

Conventional Commits를 따르되 제목은 한국어 명사형으로 짧게 끝낸다. "~한다"가 아니라 "~로 변경", "~ 추가", "~ 제거".

```
type(scope): 명사형 제목
```

- `type`: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `ci`.
- `scope`는 선택이고 바뀐 영역 이름을 쓴다(`map`, `graph`, `reader`, `og`, `rss`, `search`, `build` 등). 닫힌 목록이 아니므로 새 영역이 생기면 그 이름을 그대로 쓰고 이 줄은 고치지 않는다. 이 저장소 전체가 garden이므로 `garden` scope는 쓰지 않는다.
- 예: `feat(map): 범례 필터를 주제·허브 토글로 변경`, `fix(og): 썸네일 없는 글의 카드 그래프 폴백`, `docs: 에이전트 지침을 AGENTS.md로 통합`.
- 커밋과 push는 사용자가 요청할 때만 한다. 커밋은 한 가지 변경에 집중한다. `main`에서의 push가 곧 배포다.

## PR 작성

- PR 본문은 `.github/pull_request_template.md`를 따른다. CLI로 작성할 때도 템플릿을 읽고, 최종 diff를 기준으로 채운다.
- 작은 변경은 각 절에 한두 문장으로 작성하고, 해당하지 않는 선택 항목은 삭제한다. 검증 결과는 실제 실행 근거로 쓰며, 사람의 직접 검토 체크박스는 에이전트가 대신 체크하지 않는다.

## 위임

코드 수정은 주 에이전트가 직접 한다. 하위 에이전트에게는 조사와 검증만 나눈다. 도구별 수단은 다르지만 규칙은 같다.

- 수단: Codex는 `luna_worker`, Claude Code는 Agent 도구(하위 에이전트).
- 위임하는 일: 코드 경로 추적, 기존 테스트 커버리지 확인, 문서·스펙 대조, 테스트·빌드 실행 결과 확인처럼 소스를 바꾸지 않는 조사·검증. 서로 파일 범위가 겹치지 않는 독립 작업이 2개 이상일 때만 병렬로 실행한다.
- 위임하지 않는 일: 설계, 구현, 리팩터링, 테스트 작성, 공개 범위(`config.json`, `publication.ts`) 판단. 구현 작업을 통째로 넘기지 않는다.
- 각 위임에는 읽을 파일 범위, 기대 결과, 검증 방법을 명시한다. 소스와 vault(`../obsidian`)는 읽기 전용이다.
- 하위 에이전트의 결과는 근거이지 승인이 아니다. 주 에이전트가 최종 diff를 검토하고 `npm test`와 `npm run build`를 직접 실행해 확인한다.

## 에이전트 설정 파일 배치

- `AGENTS.md`가 정본이다. `CLAUDE.md`는 `@AGENTS.md`로 이 파일을 가져온 뒤 Claude Code 전용 지침만 덧붙인다. 공통 지침은 여기에만 쓴다.
- 한 폴더에만 해당하는 지침은 그 폴더의 `AGENTS.md`에 쓰고, 같은 폴더에 `@AGENTS.md` 한 줄만 담은 `CLAUDE.md`를 둔다. Claude Code는 그 폴더의 파일을 읽을 때 이 `CLAUDE.md`를 불러온다. Codex는 시작할 때 저장소 루트부터 실행 위치까지의 `AGENTS.md`만 읽으므로, 루트 `AGENTS.md`에 하위 지침을 가리키는 줄을 남긴다. 현재 하위 지침은 `src/lib/AGENTS.md` 하나다.
- Claude와 Codex가 함께 쓰는 스킬의 정본은 `.agents/skills/<skill-name>/`에 둔다. Codex는 이 경로를 직접 읽는다. 지금 있는 스킬은 지침 문서를 점검하는 `doc-audit` 하나다.
- Claude Code는 `.claude/skills/`만 읽으므로 `.claude/skills/<skill-name>`에 정본을 가리키는 **상대 심볼릭 링크**만 둔다. `.codex/skills/`에는 링크를 만들지 않는다.
- `SKILL.md`는 두 도구가 읽을 수 있는 공통 지침으로 유지하고, 도구 전용 런타임은 `.claude/workflows/` 또는 `.codex/`에 분리한다.
- `.mcp.json`의 `qmd`는 vault 노트를 검색하는 MCP 서버다. 색인은 `~/.cache/qmd`에 전역으로 있어 이 저장소에서도 vault를 찾는다. 색인이 오래됐으면 `qmd update`로 다시 만든다.
