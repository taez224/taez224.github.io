import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'config.json'), 'utf8'));
const dist = path.resolve(process.env.GARDEN_DIST_DIR ?? path.join(projectRoot, 'dist'));
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
  check(html.includes('type="application/rss+xml"'), `${file}: RSS 구독 정보 없음`);
  if (config.analytics?.umami?.websiteId) check(html.includes(`data-website-id="${config.analytics.umami.websiteId}"`), `${file}: 방문 통계 스크립트 없음`);
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
checks.push(async () => {
  for (const file of ['posts/index.html', 'dev/index.html', 'books/index.html']) {
    const html = await checkShell(file);
    check(!/\b0[1-9]\s*<\/span>/.test(html), `${file}: 서수 라벨 잔존`);
    check(!html.includes('노트 읽기 →'), `${file}: "노트 읽기 →" 잔존`);
  }
  const posts = await read('posts/index.html');
  check(posts.includes('묶어서 읽기'), 'posts: 읽기 경로 섹션 없음');
});
checks.push(async () => {
  const site = JSON.parse(await read('data/site.json'));
  check(!JSON.stringify(site).includes('bodyHtml'), 'site.json에 본문이 들어 있다');
  check(site.nodes.length > 0 && site.edges.length > 0, 'site.json 그래프가 비어 있다');
  const search = JSON.parse(await read('data/search.json'));
  check(search.length >= site.notes.length, 'search.json 레코드 수 부족');
  check(search.every((r) => typeof r.text === 'string'), 'search.json 검색 텍스트 형식 오류');
});
checks.push(async () => {
  // 노트마다 공유 카드 이미지가 있어야 한다.
  const site = JSON.parse(await read('data/site.json'));
  const prefixes = { blog: 'posts', slipbox: 'notes', development: 'dev' };
  for (const note of site.notes) check(await exists(`og/${prefixes[note.kind]}/${note.slug}.png`), `og 이미지 없음: ${note.slug}`);
});
checks.push(async () => {
  for (const file of ['rss.xml', 'feeds/posts.xml', 'feeds/notes.xml', 'favicon.svg', 'og.png', 'apple-touch-icon.png', 'robots.txt', 'assets/graph-snapshot.svg', 'map/index.html', '404.html']) check(await exists(file), `${file} 없음`);
  const home = await read('index.html');
  check(home.includes('노트 지도 열기'), 'index: 지도 버튼 없음');
  check(!home.includes('Velog'), 'index: Velog 링크 잔존');
  check(!/노트 \d+개 · 연결 \d+개/.test(home.replace(/alt="[^"]*"/g, '')), 'index: 히어로 집계 잔존');
  check((home.match(/<li>/g) || []).length === 8 || (home.match(/<li /g) || []).length === 8, 'index: 최근 기록이 8개가 아니다');
});
checks.push(async () => {
  const map = await read('map/index.html');
  check(map.includes('data-map') && map.includes('data-panel'), 'map: 그래프·패널 요소 없음');
  check(!map.includes('marker-end'), 'map: 화살표 마커 잔존');
  check(/노트 \d+ · 연결 \d+/.test(map), 'map: 집계 라벨 형식');
  const home = await read('index.html');
  check(home.includes('data-graph') && home.includes('data-map-url'), 'index: 히어로 그래프 마운트 지점 없음');
  check(home.includes('graph-snapshot.svg'), 'index: 모바일용 스냅샷 없음');
});
// __MORE_CHECKS__ (뒤 Task가 이 자리에 검사를 추가한다)

for (const run of checks) await run();
if (failures.length) {
  console.error(`check-dist: ${failures.length}개 실패\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('check-dist: ok');
