import { createReadStream, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { build } from 'astro';

// 실제 페이지·컴포넌트를 빌드하되 개인 vault와 평소 dist·캐시에는 접근하지 않는다.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-browser-'));
// 빌드 도구가 예외로 프로세스를 종료해도 테스트 입력과 산출물은 남기지 않는다.
process.once('exit', () => rmSync(temporary, { recursive: true, force: true }));
const vault = path.join(temporary, 'vault');
const output = path.join(temporary, 'dist');
await fs.mkdir(path.join(vault, '01_Slipbox'), { recursive: true });
await fs.mkdir(path.join(vault, '20_Projects/blog'), { recursive: true });
await fs.writeFile(path.join(temporary, 'config.json'), JSON.stringify({
  basePath: '', entry: '01_Slipbox/start.md',
  include: [{ path: '01_Slipbox', mode: 'all', graph: true }, { path: '20_Projects/blog', statuses: ['published'], types: ['series'], graph: false }], exclude: [], assets: [],
  externalPublications: [{ name: '테스트 발행처', hosts: ['example.com'], publications: ['테스트 발행처'] }],
  home: { about: '어느 소프트웨어 엔지니어의 개인 위키입니다. 개발자로 살아가며 배운 개념과 기술, 그 과정에서 든 생각, 발행한 글과 읽은 책을 모아둡니다.', featured: [],
    contacts: [{ name: 'GitHub', url: 'https://example.com/profile', icon: 'github.svg' }] }
}));
await fs.writeFile(path.join(vault, '20_Projects/blog/external.md'), `---
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
`);
await fs.writeFile(path.join(vault, '01_Slipbox/start.md'), `---
title: 시작 노트
created: 2026-09-01
slug: browser-start
type: hub
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
`);
await fs.writeFile(path.join(vault, '01_Slipbox/neighbor.md'), `---
title: 이웃 노트
created: 2026-09-01
slug: browser-neighbor
tags:
  - AI
---
# 이웃 노트

[[start]]
`);
// 지도 범례에 주제가 둘 있어야 필터가 실제로 노드를 걸러 낸다. 노드가 셋 미만인 주제는 기타로 접힌다.
await fs.writeFile(path.join(vault, '01_Slipbox/다른 주제.md'), `---
title: 다른 주제 노트
created: 2026-09-02
slug: browser-other-topic
tags:
  - 지식관리
---
# 다른 주제 노트

[[start]]
`);
// 요약 가운데에서 걸린 말은 앞에서부터 자르면 375px 화면 밖에 남는다. 그 자리를 재려고 긴 요약을 둔다.
await fs.writeFile(path.join(vault, '01_Slipbox/long-summary.md'), `---
title: 요약이 긴 노트
created: 2026-09-03
slug: browser-long-summary
summary: ${'앞말이 길게 이어진다. '.repeat(6)}여기부터 적재적소라는 말이 나온다. ${'뒷말도 길게 이어진다. '.repeat(6)}
tags:
  - 지식관리
---
# 요약이 긴 노트

[[start]]
`);
// 책 노트의 title은 띠지에 적힌 원제라 파일 이름보다 훨씬 길다. 검색 결과 줄이 어느 쪽을 보이는지 본다.
await fs.mkdir(path.join(vault, '30_Resources/References/Books'), { recursive: true });
await fs.writeFile(path.join(vault, '30_Resources/References/Books/짧은 책이름.md'), `---
title: 짧은 책이름：부제가 길게 이어지고 띠지문구까지 들어간 원제
created: 2026-09-04
my_rate: 4.5
status: 완독
book_note: 한 줄 평이다.
---
# 짧은 책이름
`);
// 평점이 없는 책은 미분류 묶음에 들어간다. 세 글자 라벨이 한 글자용 칸을 넘는지 볼 자리다.
await fs.writeFile(path.join(vault, '30_Resources/References/Books/평점 없는 책.md'), `---
title: 평점 없는 책
created: 2026-09-05
status: 읽는 중
---
# 평점 없는 책
`);
// 도표가 든 노트. 도표는 CSS 변수를 읽지 못해 색을 설정으로 받으므로, 화면 모드를 바꾸면 다시 그려야 한다.
await fs.writeFile(path.join(vault, '01_Slipbox/diagram.md'), `---
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
`);
// 절마다 화면 두 배 넘게 긴 노트. 스크롤 한 번으로 제목을 건너뛰어도 목차가 지금 읽는 절을 가리키는지 본다.
// 마지막 절은 한 문단뿐이라 끝까지 내려도 제목이 읽는 선에 닿지 못한다.
await fs.writeFile(path.join(vault, '01_Slipbox/sections.md'), `---
title: 절이 긴 노트
created: 2026-09-06
slug: browser-sections
tags:
  - AI
---
# 절이 긴 노트

${['첫째 절', '둘째 절', '셋째 절', '넷째 절'].map((heading) => `## ${heading}\n\n${`${heading}의 본문 문단이다.\n\n`.repeat(40)}`).join('')}## 짧은 끝 절

한 문단뿐인 마지막 절이다. [[start]]
`);
// 이웃이 일곱인 노트. 로컬 그래프가 여섯만 그리고 두 줄 제목이 실제 글꼴에서도 겹치지 않는지 본다.
const manyTitles = ['AI 시대의 판단력은 맥락을 실행 기준으로 바꾸는 능력이다', 'Taste는 지금 필요한 것에 무게를 두는 감각이다',
  '노트는 작성할 때 다시 찾을 상황까지 고려해야 한다', 'AI Agent 시대의 Human Agency', '생성은 AI에게, 검증은 나에게',
  '에이전트 지침은 승인 경계와 능력 보완 절차를 구분해야 한다', 'AI와의 스파링으로 내 생각을 끌어내고 다듬는다'];
await fs.writeFile(path.join(vault, '01_Slipbox/many.md'), `---
title: 이웃 많은 노트
created: 2026-09-01
slug: browser-many
tags:
  - AI
---
# 이웃 많은 노트

${manyTitles.map((title) => `[[${title}]]`).join('\n')}
`);
for (const [index, title] of manyTitles.entries()) {
  await fs.writeFile(path.join(vault, `01_Slipbox/${title}.md`), `---
title: ${JSON.stringify(title)}
created: 2026-09-01
slug: browser-many-${index}
tags:
  - AI
---
# ${title}
`);
}
// 연재 허브와 개별 편의 연결 표시, 목차 뒤 시작 카드 간격을 함께 확인한다.
await fs.writeFile(path.join(vault, '20_Projects/blog/visual-series.md'), `---
title: 화면 검사 연재
type: series
created: 2026-09-01
slug: browser-series
---
# 화면 검사 연재

## 소개

연재 소개다.

## 순서

[[visual-part]]
`);
await fs.writeFile(path.join(vault, '20_Projects/blog/visual-part.md'), `---
title: 화면 검사 첫 편
status: published
created: 2026-09-01
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
`);
process.env.GARDEN_PROJECT_ROOT = temporary;
process.env.GARDEN_VAULT_ROOT = vault;
process.env.GARDEN_OG_CACHE_DIR = path.join(temporary, 'og');
try {
  await build({ root: process.cwd(), outDir: output, cacheDir: path.join(temporary, 'astro'),
    vite: { cacheDir: path.join(temporary, 'vite') } });
} catch (error) {
  await fs.rm(temporary, { recursive: true, force: true });
  throw error;
}

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webp': 'image/webp'
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = path.resolve(output, `.${pathname}`, ...(pathname.endsWith('/') ? ['index.html'] : []));
    if (!file.startsWith(`${output}${path.sep}`) || !(await fs.stat(file)).isFile()) throw new Error('not found');
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(4398, '127.0.0.1');
const stop = async () => {
  server.close();
  server.closeAllConnections();
  await fs.rm(temporary, { recursive: true, force: true });
  process.exit(0);
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
