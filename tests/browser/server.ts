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
  include: [{ path: '01_Slipbox', mode: 'all', graph: true }, { path: '20_Projects/blog', statuses: ['published'], graph: false }], exclude: [], assets: [],
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
