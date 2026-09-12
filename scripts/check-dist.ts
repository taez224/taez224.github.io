import type { PublicNote, GraphEdge, GraphNode, Point, PanelData } from '../src/lib/content-model.ts';
import type { SearchRecord } from '../src/lib/search-match.ts';
type SiteData = { notes: Pick<PublicNote, 'path' | 'url' | 'summary' | 'contentMode' | 'headings' | 'kind' | 'slug'>[]; nodes: { id: string }[]; edges: GraphEdge[]; noteEdges: GraphEdge[] };

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngDimensions } from '../src/lib/png.ts';
import { kindPrefix } from '../src/lib/slug.ts';
import { FEED_LINKS } from '../src/lib/feeds.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'config.json'), 'utf8'));
const dist = path.resolve(process.env.GARDEN_DIST_DIR ?? path.join(projectRoot, 'dist'));
const failures: string[] = [];
const read = (file: string) => fs.readFile(path.join(dist, file), 'utf8');
const exists = async (file: string) => fs.access(path.join(dist, file)).then(() => true, () => false);
function check(condition: unknown, message: string): void { if (!condition) failures.push(message); }
// 여러 검사가 같은 파일을 보므로 한 번만 읽는다.
const site = JSON.parse(await read('data/site.json')) as SiteData;
const search = JSON.parse(await read('data/search.json')) as (SearchRecord & { text: string; headings: string[] })[];
const home = await read('index.html');

// 캐시와 배포 산출물에 같은 PNG 검사를 적용한다.
async function checkCard(file: string): Promise<void> {
  const buffer = await fs.readFile(path.join(dist, file)).catch(() => null);
  if (!buffer) { failures.push(`og 이미지 없음: ${file}`); return; }
  const size = pngDimensions(buffer);
  check(size?.width === 1200 && size?.height === 630, `og 이미지 손상(1200×630 PNG 아님): ${file}`);
}

async function checkShell(file: string): Promise<string> {
  const html = await read(file);
  check(/<title>[^<]+<\/title>/.test(html), `${file}: <title> 없음`);
  check(html.includes('property="og:title"'), `${file}: og:title 없음`);
  check(html.includes('rel="canonical"'), `${file}: canonical 없음`);
  check(html.includes('class="site-header"'), `${file}: 헤더 없음`);
  check(html.includes('type="application/rss+xml"'), `${file}: RSS 구독 정보 없음`);
  check(html.includes('name="author"'), `${file}: author 메타 없음`);
  check(html.includes('application/ld+json'), `${file}: 구조화 데이터 없음`);
  if (config.analytics?.umami?.websiteId) check(html.includes(`data-website-id="${config.analytics.umami.websiteId}"`), `${file}: 방문 통계 스크립트 없음`);
  return html;
}

const checks = [
  async () => {
    const home = await checkShell('index.html');
    check(home.includes('"@type":"WebSite"'), 'index.html: WebSite 구조화 데이터 없음');
    for (const [key, name] of [['googleSiteVerification', 'google-site-verification'], ['naverSiteVerification', 'naver-site-verification']]) {
      if (config[key]) check(home.includes(`name="${name}" content="${config[key]}"`), `index.html: ${name} 태그 없음`);
    }
  },
  async () => {
    const llms = await read('llms.txt').catch(() => '');
    check(/^# .+\n/.test(llms) && llms.includes('\n## ') && llms.includes('](https://'), 'llms.txt 없음 또는 목록 형식이 아님');
  },
  async () => {
    const about = await checkShell('about/index.html');
    check(/<article\b[^>]*>[\s\S]*?<h1\b[^>]*>\s*\S[\s\S]*?<\/h1>[\s\S]*?<p\b[^>]*>\s*\S/.test(about), 'about/index.html: 소개 제목 또는 본문이 비어 있다');
    check(about.includes('"@type":"AboutPage"'), 'about/index.html: AboutPage 구조화 데이터 없음');
  },
  async () => { check(await exists('sitemap-index.xml'), 'sitemap-index.xml 없음'); }
];
checks.push(async () => {
  const notes = site.notes ?? [];
  check(notes.length > 0, 'site.json에 노트가 없다');
  for (const note of notes) {
    const pathname = decodeURIComponent(new URL(note.url, 'https://site.invalid').pathname);
    const base = String(config.basePath ?? '').replace(/\/$/, '');
    check(!base || pathname.startsWith(`${base}/`), `basePath 밖 URL: ${note.url}`);
    const file = `${pathname.slice(base.length).replace(/^\//, '')}index.html`;
    if (!(await exists(file))) { failures.push(`노트 페이지 없음: ${file}`); continue; }
    const html = await checkShell(file);
    const record = search.find((entry) => entry.url === note.url);
    check(record?.summary === note.summary, `${file}: 검색 요약이 공개 요약과 다름`);
    check(/"@type":"(BlogPosting|TechArticle|Article)"/.test(html), `${file}: 글 구조화 데이터 없음`);
    if (note.contentMode === 'external') {
      check(html.includes('class="external-article"'), `${file}: 외부 발행 글 소개 페이지 없음`);
      check(!/class="(?:body|note-side|mobile-toc|article-card|rail)\b/.test(html), `${file}: 외부 발행 글에 본문 또는 독서 UI 잔존`);
      check(html.includes('read-original'), `${file}: 원문 읽기 링크 없음`);
      check(record && record.text === '' && record.headings.length === 0, `${file}: 검색 데이터에 본문 또는 목차 잔존`);
      check(note.headings.length === 0, `${file}: 지도 데이터에 본문 목차 잔존`);
    }
    const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    const meta = article.match(/<div[^>]*class="[^"]*note-meta[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    check(!/\b(published|slipbox|blog)\b|프로젝트\//.test(meta.replace(/<[^>]+>/g, ' ')), `${file}: UI 메타 영역에 내부 값 노출`);
  }
});
checks.push(async () => {
  for (const file of ['posts/index.html', 'dev/index.html', 'books/index.html']) await checkShell(file);
});
checks.push(async () => {
  check(!/"(?:bodyHtml|publicContent|linkTargets)":/.test(JSON.stringify(site)), 'site.json에 본문 또는 처리 중인 링크 정보가 들어 있다');
  check(site.nodes.length > 0 && site.edges.length > 0, 'site.json 그래프가 비어 있다');
  // 본문과 related에서 모은 연결은 공개 대상만 포함하고, 같은 방향의 연결은 한 번만 낸다.
  for (const [name, edges, ids] of [
    ['참조', site.noteEdges, new Set(site.notes.map((note) => note.path))],
    ['그래프', site.edges, new Set(site.nodes.map((node) => node.id))]
  ] as [string, GraphEdge[], Set<string>][]) {
    const seen = new Set();
    for (const edge of edges) {
      const key = JSON.stringify([edge.source, edge.target]);
      check(ids.has(edge.source) && ids.has(edge.target), `${name}: 공개 대상 밖의 연결`);
      check(!seen.has(key), `${name}: 중복 연결`);
      seen.add(key);
    }
  }
  check(search.length >= site.notes.length, 'search.json 레코드 수 부족');
  check(search.every((r) => typeof r.text === 'string'), 'search.json 검색 텍스트 형식 오류');
});
checks.push(async () => {
  // 노트마다 공유 카드 이미지가 있어야 한다.
  for (const note of site.notes) await checkCard(`og/${kindPrefix(note.kind)}/${note.slug}.png`);
  await checkCard('og/site.png');
});
checks.push(async () => {
  const feeds = FEED_LINKS.map((feed) => feed.path.replace(/^\//, ''));
  for (const file of [...feeds, 'favicon.svg', 'apple-touch-icon.png', 'robots.txt', 'map/index.html', '404.html']) check(await exists(file), `${file} 없음`);
  for (const page of ['index.html', 'posts/index.html', 'dev/index.html', 'map/index.html']) {
    const html = page === 'index.html' ? home : await read(page);
    for (const feed of feeds) check(html.includes(`/${feed}"`), `${page}: ${feed} 피드 링크 없음`);
  }
});
checks.push(async () => {
  // 사이트 안 링크는 실제 페이지나 파일을 가리켜야 한다. 소개 원고(about.md)처럼 위키링크 해석을 거치지 않는 링크와
  // slug·basePath가 바뀐 뒤 남은 옛 주소는 이 검사에서만 드러난다. 다른 사이트 주소와 같은 페이지 안의 조각은 보지 않는다.
  const base = String(config.basePath ?? '').replace(/\/$/, '');
  const origin = 'https://site.invalid';
  const found = new Map<string, boolean>();
  const reachable = async (pathname: string): Promise<boolean> => {
    if (base && pathname !== `${base}/` && !pathname.startsWith(`${base}/`)) return false;
    const file = pathname.slice(base.length).replace(/^\//, '');
    if (!found.has(file)) found.set(file, file === '' || file.endsWith('/') ? await exists(`${file}index.html`) : (await exists(file)) || (await exists(`${file}/index.html`)));
    return found.get(file)!;
  };
  const pages = (await fs.readdir(dist, { recursive: true })).filter((file) => file.endsWith('.html')).map((file) => file.split(path.sep).join('/'));
  for (const page of pages) {
    const pageUrl = new URL(`${base}/${page.replace(/(^|\/)index\.html$/, '$1')}`, origin);
    for (const [, raw] of (await read(page)).matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
      if (raw.startsWith('#')) continue;
      const url = new URL(raw.replaceAll('&amp;', '&'), pageUrl);
      if (url.origin !== origin) continue;
      if (!(await reachable(decodeURIComponent(url.pathname)))) failures.push(`${page}: 없는 페이지로 가는 링크 ${raw}`);
    }
  }
});
checks.push(async () => {
  const map = await read('map/index.html');
  check(map.includes('data-map') && map.includes('data-panel'), 'map: 그래프·패널 요소 없음');
  check(home.includes('data-graph'), 'index: 히어로 그래프 마운트 지점 없음');
  const heroJson = home.match(/<script type="application\/json" data-hero-data>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const hero = heroJson ? JSON.parse(heroJson) as { nodes: GraphNode[]; positions: [string, Point][] } : null;
  check(hero && hero.nodes.length === site.nodes.length && hero.positions.length === hero.nodes.length, 'index: 인라인 히어로 데이터가 없거나 지도 노드 수와 다름');
  check(hero && !/"(bodyText|summary|tags|path)"/.test(heroJson), 'index: 히어로 데이터에 그리기와 무관한 필드가 들어 있음');
  const mapJson = map.match(/<script type="application\/json" data-map-data>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const mapData = mapJson ? JSON.parse(mapJson) as PanelData & { nodes: { mapKey: string; path: string }[] } : null;
  check(mapData && mapData.nodes.length === site.nodes.length && mapData.nodes.every((node) => node.mapKey && node.path), 'map: 인라인 그래프 데이터가 없거나 노드 수·필드가 다름');
  check(mapData && mapData.notes.length === site.notes.length && mapData.noteEdges.length === site.noteEdges.length, 'map: 인라인 패널 노트·참조 관계가 site.json과 다름');
  check(!/"(bodyText|headings)"/.test(mapJson), 'map: 패널에 불필요한 본문·목차가 실림');
  for (const [name, html] of [['index.html', home], ['map/index.html', map]]) check(html.includes('rel="modulepreload"'), `${name}: 그래프 엔진 청크 modulepreload 없음`);
  const head = map.match(/<head\b[^>]*>[\s\S]*?<\/head>/)?.[0] ?? '';
  check(/<script\b(?=[^>]*\btype="module")(?=[^>]*\bblocking="render")(?=[^>]*\bsrc=")[^>]*>/.test(head), 'map: 페이지 스크립트가 head에서 렌더링을 막지 않음');
});
for (const run of checks) await run();
if (failures.length) {
  console.error(`check-dist: ${failures.length}개 실패\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('check-dist: ok');
