@AGENTS.md

## Claude Code 전용

- 브라우저 확인은 `.claude/launch.json`의 `garden-preview`를 쓴다. 이건 `npm run preview`라 dist를 서빙하므로 먼저 `npm run build`를 돌린다. vault 편집을 바로 보려면 `npm run dev`를 따로 띄운다.
- Agent 도구로 조사를 병렬로 나눌 때는 각 에이전트에 허용 파일 범위, 읽기·쓰기 권한, 기대 결과를 명시한다. 결과는 근거이지 승인이 아니다. 설계, 의미 판단, 최종 diff 검토는 주 세션이 한다.
- 노트 내용에 대한 질문은 `../obsidian`을 읽어 답한다. 그 저장소의 규칙은 그쪽 `AGENTS.md`가 정본이다.
