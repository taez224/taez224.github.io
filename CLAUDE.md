@AGENTS.md

## Claude Code 전용

- 브라우저 확인은 `.claude/launch.json`의 `garden-preview`를 쓴다. 이건 `npm run preview`라 dist를 서빙하므로 먼저 `npm run build`를 돌린다. vault 편집을 바로 보려면 `npm run dev`를 따로 띄운다.
- 위임은 Agent 도구로 한다. 조사에는 읽기 전용 에이전트(Explore)를 쓰고, 테스트·빌드 실행 같은 검증이 필요할 때만 general-purpose 에이전트를 쓴다. 소스 수정은 주 세션이 직접 한다.
- 노트 내용에 대한 질문은 `../obsidian`을 읽어 답한다. 그 저장소의 규칙은 그쪽 `AGENTS.md`가 정본이다.
