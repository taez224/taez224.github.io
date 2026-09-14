# Mermaid 검증 표본

공개할 수 없는 경계 사례만 여기 둔다. **자동 테스트는 이 파일을 읽지 않는다.** `npm test`가 도는 `tests/*.test.ts`는 렌더러 대역으로 동작만 검증하고, 실제 SVG의 배치와 글자 크기는 사람이 화면에서 확인한다.

정상 도표의 표본은 vault의 공개 노트 「Mermaid 12의 바뀐 기본값과 도표 비용」(`/dev/mermaid-12-defaults-and-cost/`)이 겸한다. 그 노트에 흐름도, 시퀀스, 상태도, 유스케이스, 에이전트 흐름이 하나씩 있어서 테마나 배치를 바꿀 때 다섯 종류를 한 화면에서 대조할 수 있다. 긴 한국어 라벨과 중첩 그룹은 「ONLYOFFICE 연동기 1편」의 도표가 담고 있다.

| 파일 | 확인하는 것 |
|---|---|
| `invalid-syntax.md` | 문법이 틀린 도표의 원문 복구, 같은 노트의 다른 도표가 그대로 그려지는지, 오류 메시지가 독자에게 보이지 않는지 |

문법이 틀린 도표는 공개 노트에 둘 수 없어서 이 표본만 임시 vault로 확인한다.

## 임시 vault 준비

표본은 vault 노트 형식이므로 임시 vault에 넣어 사이트를 빌드한다. `config.json`은 실제 것을 그대로 쓰므로, 거기에 적힌 `include` 폴더 다섯 개와 `entry`·`home.featured` 노트, `assets` 파일이 모두 있어야 조립이 멈추지 않는다. 자산은 내용을 읽지 않으므로 빈 자리 파일로 충분하다.

```bash
VAULT=$(mktemp -d)
mkdir -p "$VAULT/01_Slipbox" "$VAULT/20_Projects/blog/assets" "$VAULT/_attachments" \
  "$VAULT/30_Resources/Development/Concepts" \
  "$VAULT/30_Resources/Development/Troubleshooting" \
  "$VAULT/30_Resources/Development/Tools"

note() { printf -- '---\ncreated: 2026-09-14\nslug: %s\nsummary: %s\n---\n\n# %s\n\n표본이다.\n' "$2" "$3" "$4" > "$1"; }
note "$VAULT/01_Slipbox/생각의 정원.md" thinking-garden "표본 vault의 입구 노트이다." "생각의 정원"
note "$VAULT/01_Slipbox/세컨드 브레인은 퍼스트 브레인의 사고를 보조해야 한다.md" second-brain "표본 vault의 대표 노트이다." "세컨드 브레인"
printf -- '---\ncreated: 2026-09-14\nslug: ai-team\nstatus: published\nsummary: 표본 vault의 발행 글이다.\n---\n\n# AI로 빨라진 개인\n\n표본이다.\n' \
  > "$VAULT/20_Projects/blog/AI로 빨라진 개인, 소화하지 못하는 팀.md"
printf '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>' > "$VAULT/_attachments/sse-fanout-instance-mismatch.svg"
: > "$VAULT/20_Projects/blog/assets/ai-team-absorption.png"

cp tests/fixtures/mermaid/invalid-syntax.md "$VAULT/30_Resources/Development/Concepts/"
echo "$VAULT"
```

`entry`와 `home.featured`에 적힌 경로는 `config.json`을 따라간다. 그쪽이 바뀌면 위 명령의 파일 이름도 함께 고친다.

## 실행과 확인

빌드한 뒤 preview로 연다. `GARDEN_PROJECT_ROOT`는 `node_modules` 경로에도 쓰이므로 바꾸지 않는다.

```bash
GARDEN_VAULT_ROOT="$VAULT" npx astro build && npm run preview
```

표본은 `/dev/mermaid-fixture-invalid-syntax/`로 열린다. 틀린 도표 하나만 원래 코드 블록으로 남고 앞뒤의 정상 도표 두 개는 그려져야 하며, Mermaid의 오류 화면이 독자에게 보이면 안 된다.

정상 도표의 모양을 볼 때는 임시 vault 없이 실제 사이트의 두 노트를 연다. 320px·390px·1440px 폭에서 글자 대비와 크기, 선과 화살표의 구분, Tab으로 도표에 포커스가 가는지를 본다.

측정값을 남길 때는 브라우저와 버전, 폰트가 캐시에서 왔는지, 배치 엔진과 테마를 함께 적는다. 같은 도표도 이 조건에 따라 다른 값이 나온다.

작업이 끝나면 임시 vault를 지우고 실제 vault로 다시 빌드한다.

```bash
rm -rf "$VAULT" && npm run build
```
