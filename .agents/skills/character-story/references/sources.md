# 참고한 제작 사례

2026-11-11에 공개 문서를 확인했다. 아래는 절차를 설계할 때 참고한 사례이며, 서비스 성능을 직접 비교한 결과가 아니다. 외부 스킬을 설치하거나 내용을 통째로 복제하지 않았다.

- [Scenario의 스토리보드 스킬](https://github.com/scenario-labs/skills/blob/main/skills/scenario-storyboards/SKILL.md)에서 생성 전 컷별 행동과 구도를 적고 인물 기준을 유지하는 방식을 참고했다. 컷마다 반드시 별도 호출하거나 모든 글자를 후처리하는 규칙은 채택하지 않았다.
- [Scenario의 일관성 스킬](https://github.com/scenario-labs/skills/blob/main/skills/scenario-consistency/SKILL.md)에서 고정 요소와 변경 요소를 나누고 승인된 기준 이미지에 계속 연결하는 방식을 참고했다. 특정 모델의 입력 슬롯, LoRA 학습, 시트 사용 제한을 다른 도구의 공통 규칙으로 옮기지 않았다.
- [toyme의 storyboard-skill](https://github.com/toyme/storyboard-skill/blob/main/SKILL.md)에서 이번 장면에 필요한 자료만 읽고 국소 수정 사항을 기록하는 방식을 참고했다. 기존 제작 폴더가 있으므로 별도의 설정 폴더 체계를 새로 만들지 않았다.
- [Toon Boom의 Thumbnails View](https://docs.toonboom.com/help/storyboard-pro-24/storyboard/reference/views/thumbnails-view.html)는 컷 전체를 순서대로 보고 재배열하는 작업을 지원한다. 이를 참고해 한 컷의 완성도뿐 아니라 작은 전체 배치에서 읽기 순서를 검토하도록 했다. Toon Boom 설치를 요구하지 않는다.
- [OpenAI imagegen의 프롬프트 지침](https://github.com/openai/skills/blob/main/skills/.system/imagegen/references/prompting.md)은 입력의 역할과 보존할 요소를 명시하는 참고 자료다. 실제 호출 방법은 설치된 도구와 스킬을 따른다.

Thinking Garden에 맞춘 콘티의 오독 검토, 썸네일·삽화·만화의 역할 구분, 마력핵을 필수로 넣지 않는 판단은 사용자의 기존 선택과 제작 경험에서 가져왔다. 외부 사례가 사용자의 설정을 덮어쓰지 않는다.
