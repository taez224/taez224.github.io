import { createReadStream, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { build } from 'astro';
import { writeBrowserVault } from './vault.ts';

// 실제 페이지·컴포넌트를 빌드하되 개인 vault와 평소 dist·캐시에는 접근하지 않는다. 임시 vault에 넣는 노트는 vault.ts에 있다.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-browser-'));
// 빌드 도구가 예외로 프로세스를 종료해도 테스트 입력과 산출물은 남기지 않는다.
process.once('exit', () => rmSync(temporary, { recursive: true, force: true }));
const vault = path.join(temporary, 'vault');
const output = path.join(temporary, 'dist');
await writeBrowserVault(temporary, vault);
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
