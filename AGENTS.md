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

`npm run build`는 dist를 검사하는 `scripts/check-dist.mjs`까지 통과해야 성공이다. 이 스크립트가 사이트 출력의 계약서다: 메타 태그·구조화 데이터·OG PNG 크기·외부 발행 글에 본문이 새지 않는지·독자 UI에 내부 메타데이터가 안 보이는지·홈/지도의 필수 요소를 검사한다. 표시 규칙을 바꾸면 여기도 같이 바꾼다.

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
- **클라이언트 JS**(`src/scripts/map.js`, `hero.js`, `search.js`)는 빌드된 `data/site.json`·`search.json`을 fetch한다. 그래프는 프레임워크 없는 SVG 엔진 `src/graph/engine.mjs`가 그리고, 순수 함수(`layout`, `select`, `focus`, `regions`, `gestures`)는 DOM 없이 테스트한다.
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
- 블로그 글의 "연결된 노트" 절에서 이전·다음 글 줄을 뺀다. 리더가 연재 내비를 따로 그린다.
- `> [!article]` 콜아웃에 링크 하나만 있으면 대상 글의 제목·요약·썸네일로 카드를 만든다(`article-card.mjs`).
- 태그: `HIDDEN_TAGS`(slipbox, blog, inbox, clippings)와 `프로젝트/*`는 어디에도 안 보인다. 주제(topic)는 첫 공개 태그의 첫 조각이고 `GRAPH_COLORS`가 색을 준다(`format.mjs`).

### URL과 슬러그

`/posts/<slug>/`(blog), `/notes/<slug>/`(slipbox), `/dev/<slug>/`(development). 슬러그는 frontmatter `slug`가 있으면 그것, 없으면 제목에서 만든다(한글 유지, 소문자, 기호는 `-`). 같은 kind에서 충돌하면 빌드가 실패하고 `slug`를 달라고 한다(`src/lib/slug.mjs`). **기존 URL과 fragment는 보존한다.** 슬러그 생성 규칙이나 헤딩 id 규칙을 바꾸면 이미 공유된 주소가 깨진다.

## 코드 스타일

주변 코드를 따른다. 포매터와 린터는 없다.

- 2칸 들여쓰기, ES 모듈, 단따옴표 문자열, 세미콜론.
- Astro 컴포넌트는 PascalCase, 헬퍼 파일은 kebab-case, 함수와 변수는 camelCase.
- 공용 로직은 `src/lib/`, 브라우저 동작은 `src/scripts/`, 그래프 순수 함수는 `src/graph/`에 둔다.
- 주석과 문서는 한국어로 쓴다. 코드 주석은 "왜"를 적는다.

## 테스트

- `node:test`와 `node:assert/strict`를 쓰고 파일 이름은 `*.test.mjs`다. 테스트 이름은 관찰 가능한 동작을 서술한다.
- **테스트는 임시 vault로 돈다.** `tests/garden.test.mjs`의 `makeVault()`처럼 `os.tmpdir()`에 최소 파일을 만들어 검증한다. 실제 `../obsidian`을 테스트에서 읽지 않는다.
- 동작을 바꾸면 회귀 테스트를 더한다. 특히 Markdown 렌더링, 링크 해석, 공개 판정은 빠짐없이.
- 코드를 넘기기 전에 `npm test`와 `npm run build`를 모두 돌린다. UI 변경은 데스크톱과 모바일 폭을 확인한다.

## 작업 규칙

- 새 표시 문법이나 조건을 추가하면 `AUTHORING.md`, 관련 테스트, `check-dist.mjs`를 함께 고친다. frontmatter 속성을 바꾸면 vault의 속성 스키마도 고친다.
- 생성물인 `dist/`와 `.astro/`는 편집하지 않는다.
- `docs/`(리디자인 스펙·계획서)는 `.git/info/exclude`로 로컬 전용이다. `git add` 하지 않는다. 사이트가 vault 안에 있던 시절(`basePath: /obsidian`) 기준이라 경로가 낡았다.
- 독자에게 `published`·`slipbox`·`blog`·`프로젝트/*`·`status` 값을 보이지 않는다. 서수 라벨(01/02), "노트 읽기 →" 같은 문구는 check-dist가 잡는다.

## 커밋 규칙

Conventional Commits를 따르되 제목은 한국어 명사형으로 짧게 끝낸다. "~한다"가 아니라 "~로 변경", "~ 추가", "~ 제거".

```
type(scope): 명사형 제목
```

- `type`: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `ci`.
- `scope`는 선택이고 영역 이름을 쓴다: `map`, `hero`, `reader`, `og`, `search`, `rss`, `build`, `ci`, `config`. 이 저장소 전체가 garden이므로 `garden` scope는 쓰지 않는다.
- 예: `feat(map): 범례 필터를 주제·허브 토글로 변경`, `fix(og): 썸네일 없는 글의 카드 그래프 폴백`, `docs: 에이전트 지침을 AGENTS.md로 통합`.
- 작업 단위가 끝나면 에이전트가 바로 커밋한다. 커밋은 한 가지 변경에 집중한다. push는 사용자가 하며 push가 곧 배포다.

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
- 도구 설정 파일은 생기면 추적한다(`.claude/settings.json`, `.claude/launch.json`, `.codex/config.toml`). 지금 있는 것은 `.claude/launch.json`뿐이다. `.claude/settings.local.json`과 `.claude/worktrees/`는 무시한다.
