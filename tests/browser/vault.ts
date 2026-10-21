import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// 이 달의 발행 글은 아래 연재 편 하나뿐이다. 연재 집계 검사와 같은 날짜를 쓴다.
export const BROWSER_SERIES_PUBLISHED = '2026-09-01';

// 브라우저 검사가 빌드하는 임시 vault의 입력이다. 검사가 여는 노트(slug)와 그 노트에 있어야 할 내용을 여기서 고친다.
// 임시 폴더, 빌드, 서버는 server.ts가 맡는다.

export const BROWSER_CONFIG = {
  basePath: '', entry: '01_Slipbox/start.md',
  include: [{ path: '01_Slipbox', mode: 'all', graph: true }, { path: '20_Projects/blog', statuses: ['published'], types: ['series'], graph: false }, { path: '30_Resources/Development/Concepts', mode: 'all', graph: false }], exclude: [], assets: [],
  externalPublications: [{ name: '테스트 발행처', hosts: ['example.com'], publications: ['테스트 발행처'] }],
  home: { about: '어느 소프트웨어 엔지니어의 개인 위키입니다. AI 시대에 개발자로 살아가며 배운 개념과 기술, 그 과정에서 든 생각, 발행한 글과 읽은 책을 모아둡니다.', featured: ['20_Projects/blog/external.md'],
    contacts: [{ name: 'GitHub', url: 'https://example.com/profile', icon: 'github.svg' }] }
};

// 이웃이 일곱인 노트. 로컬 그래프가 여섯만 그리고 두 줄 제목이 실제 글꼴에서도 겹치지 않는지 본다.
const manyTitles = ['AI 시대의 판단력은 맥락을 실행 기준으로 바꾸는 능력이다', 'Taste는 지금 필요한 것에 무게를 두는 감각이다',
  '노트는 작성할 때 다시 찾을 상황까지 고려해야 한다', 'AI Agent 시대의 Human Agency', '생성은 AI에게, 검증은 나에게',
  '에이전트 지침은 승인 경계와 능력 보완 절차를 구분해야 한다', 'AI와의 스파링으로 내 생각을 끌어내고 다듬는다'];

// vault 안의 경로와 파일 내용이다.
// 둘째 문장이 길어 어느 폭에서도 세 줄을 넘는 요약. 목록·카드·홈 연재가 첫 문장으로 자르지 않고 줄 수로 자르는지 본다.
export const LONG_SUMMARY = `첫 문장은 질문으로 시작하는가? ${'둘째 문장은 글이 다루는 범위를 구체적으로 설명하면서 길게 이어진다. '.repeat(6).trim()}`;
export const BROWSER_NOTES: Record<string, string> = {
  '01_Slipbox/image-loading.md': `---
title: 이미지 로딩 검사
slug: browser-image-loading
created: 2026-09-01
---
# 이미지 로딩 검사

![첫 그림|400](reader.png)

${'그림 사이에서 읽는 본문이다.\n\n'.repeat(150)}

![뒤쪽 그림](delayed.png)

## 그림 다음

이미지가 로드돼도 이 절의 위치가 유지된다.
`,
  '30_Resources/Development/Concepts/소개 단락.md': `---
title: 소개 단락
slug: browser-lead
created: 2026-09-01
summary: 제목 아래 소개 단락은 읽기 화면에서 본문의 시작과 구분된다.
tags:
  - 개발/설계
---
# 소개 단락

첫 본문 문단이다.

## 첫 절

첫 절의 설명이다.

## 둘째 절

둘째 절의 설명이다.
`,
  '20_Projects/blog/external.md': `---
title: 외부 발행 글
slug: browser-external
created: 2026-08-01
status: published
source: https://example.com/article
publication: 테스트 발행처
summary: 외부에서 읽는 글의 공개 요약이다.
---
# 외부 발행 글

[[start]]와 [[neighbor]]를 참고한다.
`,
  // 허브는 성숙도를 쓰지 않는다. status를 일부러 적어 두어 허브에는 성숙도 버튼이 생기지 않는지 본다.
  '01_Slipbox/image-reader.md': `---
title: 이미지 확대 검사
slug: browser-image
created: 2026-09-01
---
# 이미지 확대 검사

![읽기 화면 예시|400](reader.png)

*그림 설명은 본문에 남는다.*

\`\`\`js
const longValue = '${'word'.repeat(100)}';
\`\`\`

| 이름 | 긴 설명 | 상태 |
| --- | --- | --- |
| 표본 | 가로로 스크롤해 읽는 표 | 완료 |

[![연결된 이미지](reader.png)](https://example.com/linked-image)
`,
  '01_Slipbox/start.md': `---
title: 시작 노트
created: 2026-09-01
slug: browser-start
type: hub
status: evergreen
tags:
  - AI
---
# 시작 노트

## fn-1

인접한 각주[^a][^b]와 [주변 링크](#fn-1), 코드 각주[^code]가 있다.

[[neighbor]]

[^a]: 첫 각주 내용
[^b]: 둘째 각주 내용
[^code]: 코드 예제

    \`\`\`js
    console.log("hello");
    \`\`\`
`,
  '01_Slipbox/neighbor.md': `---
title: 이웃 노트
created: 2026-09-01
slug: browser-neighbor
tags:
  - AI
---
# 이웃 노트

[[start]]

==형광으로 칠한 말==이 있다.

문장 속 \`inlineCode()\`를 구분한다. [설명 링크](https://example.com/reference)를 읽는다.

- [참고 목록](https://example.com/reference)

| 항목 | 설명 |
| --- | --- |
| 코드 | 구문 강조 |

> [!note] 버전 안내
> 일반 콜아웃의 본문이다.

> [!warning] 주의
> 경고 콜아웃의 본문이다.

> [!note]- 접힌 안내
> 숨겨 둔 보충 설명이다.

> [!warning]- 주의할 내용
> 펼쳐서 읽는 경고다.

> [!bug]- 버그 확인
> 펼쳐서 읽는 버그 안내다.

`,
  // 지도 범례에 주제가 둘 있어야 필터가 실제로 노드를 걸러 낸다. 노드가 셋 미만인 주제는 기타로 접힌다.
  // 다듬은 날짜(updated)가 있어 홈 최근 기록에 물뿌리개가 붙는 행이 된다.
  '01_Slipbox/다른 주제.md': `---
title: 다른 주제 노트
created: 2026-09-02
updated: 2026-09-10
slug: browser-other-topic
tags:
  - 지식관리
---
# 다른 주제 노트

[[start]]
`,
  // 요약 가운데에서 걸린 말은 앞에서부터 자르면 375px 화면 밖에 남는다. 그 자리를 재려고 긴 요약을 둔다.
  // 성숙도(status)가 새싹이라 메타 줄에 성숙도 버튼이 생긴다. 새싹은 설명을 열면 장면이 바뀌는 단계다.
  '01_Slipbox/long-summary.md': `---
title: 요약이 긴 노트
created: 2026-09-03
status: seedling
slug: browser-long-summary
summary: ${'앞말이 길게 이어진다. '.repeat(6)}여기부터 적재적소라는 말이 나온다. ${'뒷말도 길게 이어진다. '.repeat(6)}
tags:
  - 지식관리
---
# 요약이 긴 노트

[[start]]
`,
  // 책 노트의 title은 띠지에 적힌 원제라 파일 이름보다 훨씬 길다. 검색 결과 줄이 어느 쪽을 보이는지 본다.
  '30_Resources/References/Books/짧은 책이름.md': `---
title: 짧은 책이름：부제가 길게 이어지고 띠지문구까지 들어간 원제
created: 2026-09-04
my_rate: 4.5
status: 완독
book_note: 한 줄 평이다.
---
# 짧은 책이름
`,
  // 평점이 없는 책은 미분류 묶음에 들어간다. 세 글자 라벨이 한 글자용 칸을 넘는지 볼 자리다.
  '30_Resources/References/Books/평점 없는 책.md': `---
title: 평점 없는 책
created: 2026-09-05
status: 읽는 중
---
# 평점 없는 책
`,
  // 도표가 든 노트. 도표는 CSS 변수를 읽지 못해 색을 설정으로 받으므로, 화면 모드를 바꾸면 다시 그려야 한다.
  '01_Slipbox/diagram.md': `---
title: 도표가 있는 노트
created: 2026-09-07
slug: browser-diagram
tags:
  - AI
---
# 도표가 있는 노트

\`\`\`mermaid
flowchart LR
  A[노트] --> B[사이트]
\`\`\`
`,
  // 절마다 화면 두 배 넘게 긴 노트. 스크롤 한 번으로 제목을 건너뛰어도 목차가 지금 읽는 절을 가리키는지 본다.
  // 마지막 절은 한 문단뿐이라 끝까지 내려도 제목이 읽는 선에 닿지 못한다.
  '01_Slipbox/sections.md': `---
title: 절이 긴 노트
created: 2026-09-06
slug: browser-sections
tags:
  - AI
---
# 절이 긴 노트

${['첫째 절', '둘째 절', '셋째 절', '넷째 절'].map((heading) => `## ${heading}\n\n${`${heading}의 본문 문단이다.\n\n`.repeat(40)}`).join('')}## 짧은 끝 절

한 문단뿐인 마지막 절이다. [[start]]
`,
  '01_Slipbox/many.md': `---
title: 이웃 많은 노트
created: 2026-09-01
slug: browser-many
tags:
  - AI
---
# 이웃 많은 노트

${manyTitles.map((title) => `[[${title}]]`).join('\n')}
`,
  ...Object.fromEntries(manyTitles.map((title, index) => [`01_Slipbox/${title}.md`, `---
title: ${JSON.stringify(title)}
created: 2026-09-01
slug: browser-many-${index}
tags:
  - AI
---
# ${title}
`])),
  // 연재 허브와 개별 편의 연결 표시, 목차 뒤 시작 카드 간격을 함께 확인한다. 편에 발행일이 있어야 홈 최근 연재에 오른다.
  '20_Projects/blog/visual-series.md': `---
title: 화면 검사 연재
type: series
created: 2026-09-01
slug: browser-series
summary: ${LONG_SUMMARY}
---
# 화면 검사 연재

## 소개

연재 소개다.

## 순서

[[visual-part]]
`,
  '20_Projects/blog/visual-part.md': `---
title: 화면 검사 첫 편
status: published
created: 2026-09-01
published: ${BROWSER_SERIES_PUBLISHED}
slug: browser-series-part
series: 화면 검사 연재
series_order: 1
---
# 화면 검사 첫 편

[[visual-series]]

| 문법 | 설명 |
| --- | --- |
| \`sequenceDiagram\` | 참여자 사이의 시간순 호출과 응답 |
| \`${'veryLongIdentifier'.repeat(10)}\` | 길어도 페이지 밖으로 밀지 않는다 |

| 단계 | 역할 |
| --- | --- |
| Organizational OS | 조직 운영 구조 설계 |
`,
  // 절이 열둘인 글. 목차가 11줄 이상이면 사이드바의 목차만 따로 스크롤한다. 지도에 노드를 더하지 않게 블로그 글로 둔다.
  '20_Projects/blog/long-toc.md': `---
title: 절이 많은 글
status: published
created: 2026-09-07
slug: browser-long-toc
---
# 절이 많은 글

${Array.from({ length: 12 }, (_, index) => `## ${index + 1}번 절\n\n${`${index + 1}번 절의 본문 문단이다.\n\n`.repeat(30)}`).join('')}
> [!article]
> [[summary-card]]
`,
  // 요약이 두 문장이고 세 줄을 넘는 글. 글 목록과 연결 설명 없는 글 카드에서 요약 전체를 세 줄까지 보이는지 본다.
  // 글 목록은 발행일이 있는 글만 싣는다. 홈 최근 기록의 순서를 흔들지 않게 날짜를 가장 이르게 둔다.
  '20_Projects/blog/summary-card.md': `---
title: 요약이 긴 글
status: published
created: 2025-01-01
published: 2025-01-01
slug: browser-summary-card
summary: ${LONG_SUMMARY}
---
# 요약이 긴 글

요약이 긴 글의 본문이다.
`
};

// projectRoot에 config.json을, vault에 노트를 쓴다.
export async function writeBrowserVault(projectRoot: string, vault: string): Promise<void> {
  await fs.mkdir(path.join(vault, '01_Slipbox'), { recursive: true });
  await sharp({ create: { width: 1800, height: 1000, channels: 3, background: 'white' } }).png().toFile(path.join(vault, '01_Slipbox/reader.png'));
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'white' } }).png().toFile(path.join(vault, '01_Slipbox/delayed.png'));
  await fs.writeFile(path.join(projectRoot, 'config.json'), JSON.stringify(BROWSER_CONFIG));
  for (const [file, content] of Object.entries(BROWSER_NOTES)) {
    await fs.mkdir(path.dirname(path.join(vault, file)), { recursive: true });
    await fs.writeFile(path.join(vault, file), content);
  }
}
