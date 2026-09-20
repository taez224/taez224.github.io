@AGENTS.md

## Claude Code 전용

- 브라우저 확인은 `.claude/launch.json`의 `garden-preview`를 쓴다. 이 설정은 `npm run preview`로 dist를 서빙하므로 먼저 `npm run build`를 실행한다. vault 편집을 바로 보려면 `npm run dev`를 따로 실행한다.
- 하위 에이전트는 조사에 읽기 전용 에이전트(Explore)를 쓰고, 테스트·빌드 실행 같은 검증이 필요할 때만 general-purpose 에이전트를 쓴다.
- 노트 내용에 대한 질문은 `../obsidian`을 읽어 답한다.
