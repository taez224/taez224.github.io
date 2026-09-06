import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'config.json'), 'utf8'));
const dist = path.join(projectRoot, 'dist');
const failures = [];
const read = (file) => fs.readFile(path.join(dist, file), 'utf8');
const exists = async (file) => fs.access(path.join(dist, file)).then(() => true, () => false);
function check(condition, message) { if (!condition) failures.push(message); }

export async function checkShell(file) {
  const html = await read(file);
  check(/<title>[^<]+<\/title>/.test(html), `${file}: <title> 없음`);
  check(html.includes('property="og:title"'), `${file}: og:title 없음`);
  check(html.includes('rel="canonical"'), `${file}: canonical 없음`);
  check(html.includes('class="site-header"'), `${file}: 헤더 없음`);
  return html;
}

const checks = [
  async () => { await checkShell('index.html'); },
  async () => { check(await exists('sitemap-index.xml'), 'sitemap-index.xml 없음'); }
];
// __MORE_CHECKS__ (뒤 Task가 이 자리에 검사를 추가한다)

for (const run of checks) await run();
if (failures.length) {
  console.error(`check-dist: ${failures.length}개 실패\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('check-dist: ok');
