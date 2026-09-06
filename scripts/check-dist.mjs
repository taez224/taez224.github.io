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
checks.push(async () => {
  const site = JSON.parse(await read('data/site.json').catch(() => '{"notes":[]}'));
  const notes = site.notes ?? [];
  check(notes.length > 0, 'site.json에 노트가 없다 (Task 8 이후 필수)');
  for (const note of notes) {
    const pathname = decodeURIComponent(new URL(note.url, 'https://site.invalid').pathname);
    const base = String(config.basePath ?? '').replace(/\/$/, '');
    check(!base || pathname.startsWith(`${base}/`), `basePath 밖 URL: ${note.url}`);
    const file = `${pathname.slice(base.length).replace(/^\//, '')}index.html`;
    if (!(await exists(file))) { failures.push(`노트 페이지 없음: ${file}`); continue; }
    const html = await checkShell(file);
    const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    const meta = article.match(/<div[^>]*class="[^"]*note-meta[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    check(!/\b(published|slipbox|blog)\b|프로젝트\//.test(meta.replace(/<[^>]+>/g, ' ')), `${file}: UI 메타 영역에 내부 값 노출`);
  }
});
// __MORE_CHECKS__ (뒤 Task가 이 자리에 검사를 추가한다)

for (const run of checks) await run();
if (failures.length) {
  console.error(`check-dist: ${failures.length}개 실패\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('check-dist: ok');
