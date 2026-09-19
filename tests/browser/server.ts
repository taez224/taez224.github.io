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
await fs.writeFile(path.join(temporary, 'config.json'), JSON.stringify({
  basePath: '', entry: '01_Slipbox/start.md',
  include: [{ path: '01_Slipbox', mode: 'all', graph: true }], exclude: [], assets: [],
  home: { about: '브라우저 회귀 검사', featured: [], contacts: [] }
}));
await fs.writeFile(path.join(vault, '01_Slipbox/start.md'), `---
title: 시작 노트
created: 2026-09-01
slug: browser-start
type: hub
tags: [AI]
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
tags: [AI]
---
# 이웃 노트

[[start]]
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
