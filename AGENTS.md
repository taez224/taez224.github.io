# Agent Instructions

AI 코딩 에이전트가 이 저장소에서 작업할 때의 지침이다. Codex는 이 파일을 직접 읽고, Claude Code는 `CLAUDE.md`가 이 파일을 가져온 뒤 Claude 전용 절을 덧붙인다.

## 이 저장소가 하는 일

TaeZ's Thinking Garden(https://taez224.github.io/)을 짓는 Astro 7 정적 사이트다. **노트 원본은 이 저장소에 없다.** 별도 저장소 `taez224/obsidian`(Obsidian vault)을 읽어서 공개 가능한 부분만 사이트로 낸다.

- 로컬: vault는 옆 폴더 `../obsidian`에 클론돼 있다. 다른 위치면 `GARDEN_VAULT_ROOT`로 지정한다. dev와 build 모두 vault가 있어야 돈다.
- CI(`.github/workflows/deploy.yml`): vault를 `vault/`에 두 번째 checkout하고 `GARDEN_VAULT_ROOT`로 넘긴다. main push, 매일 04:00 KST, 수동 실행(`gh workflow run deploy.yml`)으로 돈다. **vault만 바뀌면 다음 예약 빌드까지 사이트에 반영되지 않는다.**
- 노트 작성 규칙(frontmatter 속성, 허용 값)의 정본은 vault의 `99_Templates/_property-schema.md`다. 사이트 쪽 표시 규칙은 `AUTHORING.md`에 있다. 콘텐츠 렌더링을 바꾸기 전에 먼저 읽는다.

## 명령

Node 22와 커밋된 `package-lock.json`을 쓴다. CI와 같다.

```bash
npm ci                       # 잠근 의존성 설치
npm test                     # node --test tests/*.test.mjs
node --test tests/garden.test.mjs                                  # 파일 하나
node --test --test-name-pattern="slug" tests/garden.test.mjs       # 이름으로 골라 실행
npm run dev                  # astro dev. vault 파일을 감시해 다시 조립한다
npm run build                # astro build && node scripts/check-dist.mjs
npm run preview              # dist를 서빙한다. 먼저 build가 있어야 한다
```

`npm run build`는 dist를 검사하는 `scripts/check-dist.mjs`까지 통과해야 성공이다. 메타데이터·OG PNG·공개 범위·페이지와 데이터 연결·그래프 초기화에 필요한 산출물을 검사한다. 문구·폰트·아이콘·배치·콘텐츠 개수는 고정하지 않는다. Markdown 문법은 임시 입력을 쓰는 단위 테스트로 검증한다.

환경 변수: `GARDEN_VAULT_ROOT`(vault 경로), `GARDEN_PROJECT_ROOT`(기본 cwd), `GARDEN_OG_CACHE_DIR`, `GARDEN_DIST_DIR`(check-dist 대상).

## 아키텍처

핵심은 "vault를 한 번 조립하고, 모두가 그 결과를 읽는다"이다.

```
config.json ──▶ publication.mjs (공개 판정)
                     │
                     ▼
   assembleGarden()  src/lib/garden.mjs      vault 전체를 읽어 notes/books/nodes/edges/stats/assetCopies를 만든다
                     │  (get-garden.mjs가 메모이즈. dev에서는 2초 지나면 다시 읽는다)
        ┌────────────┼──────────────────┬──────────────────┐
        ▼            ▼                  ▼                  ▼
 Content Layer   정적 엔드포인트      OG 카드            vault-assets 통합
 loaders/vault   data/site.json      og/*.png           config.assets에 적힌 파일만
 → getCollection data/search.json    (resvg, 캐시)       dist/assets/vault/로 복사
 → 페이지        rss, feeds, llms.txt
        └────────────┴──────────────────┴──────────────────┘
                     ▼
              scripts/check-dist.mjs
```

- **페이지**(`src/pages/**`)는 `getCollection('notes'|'books')`로 읽고, **엔드포인트**(`data/*.json.ts`, `og/*.png.ts`, `rss.xml.js`, `llms.txt.ts`)는 `getGarden()`을 직접 부른다. 둘 다 같은 조립 결과다.
- **클라이언트 JS**: 홈(`hero.js`)과 지도(`map.js`)는 페이지에 인라인된 노드·간선(`data-hero-data`, `data-map-data`, `graph-data.mjs`)으로 스크립트 실행 즉시 그래프를 올린다. 홈은 빌드 때 계산한 좌표까지 싣고, 지도는 무대 크기에 맞춰 배치한다. 지도 패널이 쓰는 노트 정보·참조 관계도 같은 JSON에 실어 fetch가 없다. 검색만 `search.json`을 열 때 fetch한다. `data/site.json`은 공개 데이터 엔드포인트이자 check-dist의 기준 자료로 남는다. `integrations/module-preload.mjs`가 빌드 산출물의 정적 import를 따라가 엔진 청크에 `modulepreload`를 달고, 지도 페이지 스크립트는 `<head>`로 옮겨 `blocking="render"`를 달아 그래프가 올라간 뒤에 첫 화면을 그린다(지도는 무대 크기가 화면마다 달라 스냅샷을 둘 수 없다). 그 전에 보이는 데스크톱 스냅샷(`snapshot.mjs`의 `desktop` 프리셋)은 엔진과 같은 배치 규칙(`label.mjs`의 `placeLabels`)과 같은 맞춤으로 그려서 교체가 눈에 띄지 않는다. 제목 배치 규칙을 바꾸면 두 쪽이 같이 바뀐다. 그래프는 프레임워크 없는 SVG 엔진 `src/graph/engine.mjs`가 그린다. `src/graph`의 나머지 모듈은 DOM을 만지지 않는 순수 함수이고 각각 단위 테스트가 있다.
- **dev 감시**: `loaders/vault.mjs`가 include 루트·Books·`config.json`·검토된 자산을 watcher에 등록하고, `refresh-coordinator.mjs`가 디바운스와 직렬화를 맡아 notes·books 스토어를 한 번의 재조립으로 채운다.
- **OG 카드**: `src/lib/og.mjs`. 최종 SVG 문자열 + 폰트 정체 + resvg 버전의 해시가 캐시 키라 수동 버전 상수가 없다. 캐시는 `node_modules/.cache/garden-og-images`와 `garden-og-fonts`이고 CI가 복원한다.

### 공개 범위 규칙 (바꿀 때 주의)

- `config.json`의 `include`/`exclude`가 폴더 단위 규칙이고, `src/lib/publication.mjs`의 `privateRoots`는 config와 무관하게 항상 비공개다. Development 폴더는 `_`나 `.`로 시작하는 경로 조각이 있으면 뺀다.
- 블로그(`20_Projects/blog`)는 `status: published`이거나 `type: series`만 들어온다. 발행된 편이 없는 연재 허브는 조립 단계에서 뺀다.
- `externalPublications`에 걸리는 글은 `contentMode: 'external'`이 돼 본문·목차·검색 텍스트 없이 소개 페이지만 낸다. 규칙에 걸리면 `source`가 그 호스트의 유효한 https URL이어야 하고 아니면 빌드가 실패한다.
- 링크·카드로 비공개 노트가 새지 않도록 설계돼 있다. 비공개 대상은 존재 여부만 기록하고 제목·요약·본문을 절대 출력하지 않는다. HTML, 검색 데이터, 그래프 데이터 어디로도 비공개 메타데이터와 외부 발행 글 본문을 내보내지 않는다.

### 공개 본문 변환

vault 원문은 건드리지 않고 사이트로 나가는 사본만 바꾼다(`garden.mjs`의 `publicBody`).

- 첫 H1, Obsidian 주석(`%% %%`), `AUTHOR_ONLY_SECTIONS`(현재 `운영 메모`) 절을 뺀다.
- 정리한 공개 본문으로 자동 요약·검색 텍스트·목차·본문 링크를 계산한다. 명시한 `summary`를 우선하며, 외부 발행 글에는 본문 발췌 요약을 만들지 않는다.
- 연재 목차와 이전·다음 탐색은 `series`와 `series_order`로 만든다. 본문 목록은 자동으로 제거하지 않는다.
- 참조·역참조는 본문 링크와 `related` 목록의 위키링크를 합쳐 만든다. 공개 대상만 연결하고 중복은 제거한다. 전체 지도에는 기존 그래프 후보 규칙을 적용한다.
- 본문 링크는 렌더러의 Markdown 규칙으로 해석한다. 코드·주석·이스케이프된 예시와 운영 메모의 링크는 연결로 세지 않는다.
- `> [!article]` 콜아웃에 링크 하나만 있으면 대상 글의 제목·요약·썸네일로 카드를 만든다(`article-card.mjs`).
- 태그: `HIDDEN_TAGS`(slipbox, blog, inbox, clippings)와 `프로젝트/*`는 어디에도 안 보인다. 주제(topic)는 첫 공개 태그의 첫 조각이고 `GRAPH_COLORS`가 색을 준다(`format.mjs`).

### URL과 슬러그

`/posts/<slug>/`(blog), `/notes/<slug>/`(slipbox), `/dev/<slug>/`(development). 슬러그는 frontmatter `slug`가 있으면 그것, 없으면 제목에서 만든다(한글 유지, 소문자, 기호는 `-`). 같은 kind에서 충돌하면 빌드가 실패하고 `slug`를 달라고 한다(`src/lib/slug.mjs`). 
**기존 URL과 fragment는 슬러그 생성 규칙이나 헤딩 id 규칙이 정해지기 전까지 당분간 유동적으로 관리하며 과거 호환도 신경쓰지 않는다.**

## 코드 스타일

주변 코드를 따른다. 포매터와 린터는 없다.

- 2칸 들여쓰기, ES 모듈, 단따옴표 문자열, 세미콜론.
- Astro 컴포넌트는 PascalCase, 헬퍼 파일은 kebab-case, 함수와 변수는 camelCase.
- 공용 로직은 `src/lib/`, 브라우저 동작은 `src/scripts/`, 그래프 순수 함수는 `src/graph/`에 둔다.
- 주석과 문서는 한국어로 쓴다. 코드 주석은 "왜"를 적는다.

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

- `node:test`와 `node:assert/strict`를 쓰고 파일 이름은 `*.test.mjs`다. 테스트 이름은 관찰 가능한 동작을 서술한다.
- **테스트는 임시 vault로 돈다.** `tests/garden.test.mjs`의 `makeVault()`처럼 `os.tmpdir()`에 최소 파일을 만들어 검증한다. 실제 `../obsidian`을 테스트에서 읽지 않는다.
- 동작을 바꾸면 회귀 테스트를 더한다. 특히 Markdown 렌더링, 링크 해석, 공개 판정은 빠짐없이.
- 코드를 넘기기 전에 `npm test`와 `npm run build`를 모두 돌린다. UI 변경은 데스크톱과 모바일 폭을 확인한다.

## 작업 규칙

- 새 표시 문법이나 조건을 추가하면 `AUTHORING.md`와 관련 테스트를 고친다. 공개 범위나 배포 산출물의 필수 조건이 바뀔 때만 `check-dist.mjs`를 고친다. frontmatter 속성을 바꾸면 vault의 속성 스키마도 고친다.
- 생성물인 `dist/`와 `.astro/`는 편집하지 않는다.
- `docs/`(리디자인 스펙·계획서)는 `.git/info/exclude`로 로컬 전용이다. `git add` 하지 않는다. 사이트가 vault 안에 있던 시절(`basePath: /obsidian`) 기준이라 경로가 낡았다.
- 독자에게 `published`·`slipbox`·`blog`·`프로젝트/*`·`status` 같은 내부 메타데이터 값을 보이지 않는다. 문구와 배치 변경은 화면에서 검토한다.

## 커밋 규칙

Conventional Commits를 따르되 제목은 한국어 명사형으로 짧게 끝낸다. "~한다"가 아니라 "~로 변경", "~ 추가", "~ 제거".

```
type(scope): 명사형 제목
```

- `type`: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `ci`.
- `scope`는 선택이고 바뀐 영역 이름을 쓴다(`map`, `graph`, `reader`, `og`, `rss`, `search`, `build` 등). 닫힌 목록이 아니므로 새 영역이 생기면 그 이름을 그대로 쓰고 이 줄은 고치지 않는다. 이 저장소 전체가 garden이므로 `garden` scope는 쓰지 않는다.
- 예: `feat(map): 범례 필터를 주제·허브 토글로 변경`, `fix(og): 썸네일 없는 글의 카드 그래프 폴백`, `docs: 에이전트 지침을 AGENTS.md로 통합`.
- 커밋과 push는 사용자가 요청할 때만 한다. 커밋은 한 가지 변경에 집중한다. `main` 에서의 push가 곧 배포다.

## 위임

코드 수정은 주 에이전트가 직접 한다. 하위 에이전트에게는 조사와 검증만 나눈다. 도구별 수단은 다르지만 규칙은 같다.

- 수단: Codex는 `luna_worker`, Claude Code는 Agent 도구(하위 에이전트).
- 위임하는 일: 코드 경로 추적, 기존 테스트 커버리지 확인, 문서·스펙 대조, 테스트·빌드 실행 결과 확인처럼 소스를 바꾸지 않는 조사·검증. 서로 파일 범위가 겹치지 않는 독립 작업이 2개 이상일 때만 병렬로 돌린다.
- 위임하지 않는 일: 설계, 구현, 리팩터링, 테스트 작성, 공개 범위(`config.json`, `publication.mjs`) 판단. 구현 작업을 통째로 넘기지 않는다.
- 각 위임에는 읽을 파일 범위, 기대 결과, 검증 방법을 명시한다. 소스와 vault(`../obsidian`)는 읽기 전용이다.
- 하위 에이전트의 결과는 근거이지 승인이 아니다. 주 에이전트가 최종 diff를 검토하고 `npm test`와 `npm run build`를 직접 돌려 확인한다.

## 에이전트 설정 파일 배치

- `AGENTS.md`가 정본이다. `CLAUDE.md`는 `@AGENTS.md`로 이 파일을 가져온 뒤 Claude Code 전용 지침만 덧붙인다. 공통 지침은 여기에만 쓴다.
- Claude와 Codex가 함께 쓰는 스킬의 정본은 `.agents/skills/<skill-name>/`에 둔다. Codex는 이 경로를 직접 읽는다. 이 저장소에는 아직 스킬이 없다.
- Claude Code는 `.claude/skills/`만 읽으므로 `.claude/skills/<skill-name>`에 정본을 가리키는 **상대 심볼릭 링크**만 둔다. `.codex/skills/`에는 링크를 만들지 않는다.
- `SKILL.md`는 두 도구가 읽을 수 있는 공통 지침으로 유지하고, 도구 전용 런타임은 `.claude/workflows/` 또는 `.codex/`에 분리한다.
- `.mcp.json`의 `qmd`는 vault 노트를 검색하는 MCP 서버다. 색인은 `~/.cache/qmd`에 전역으로 있어 이 저장소에서도 vault를 찾는다. 색인이 오래됐으면 `qmd update`로 다시 만든다.
