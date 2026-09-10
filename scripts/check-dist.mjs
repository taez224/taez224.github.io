import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngDimensions } from '../src/lib/png.mjs';
import { kindPrefix } from '../src/lib/slug.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'config.json'), 'utf8'));
const dist = path.resolve(process.env.GARDEN_DIST_DIR ?? path.join(projectRoot, 'dist'));
const failures = [];
const read = (file) => fs.readFile(path.join(dist, file), 'utf8');
const exists = async (file) => fs.access(path.join(dist, file)).then(() => true, () => false);
function check(condition, message) { if (!condition) failures.push(message); }
// 여러 검사가 같은 파일을 보므로 한 번만 읽는다.
const site = JSON.parse(await read('data/site.json'));
const search = JSON.parse(await read('data/search.json'));
const home = await read('index.html');

// 캐시와 배포 산출물에 같은 PNG 검사를 적용한다.
async function checkCard(file) {
  const buffer = await fs.readFile(path.join(dist, file)).catch(() => null);
  if (!buffer) { failures.push(`og 이미지 없음: ${file}`); return; }
  const size = pngDimensions(buffer);
  check(size?.width === 1200 && size?.height === 630, `og 이미지 손상(1200×630 PNG 아님): ${file}`);
}

async function checkShell(file) {
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
    check(/<article[^>]*class="[^"]*wiki-about[^"]*"[^>]*>[\s\S]*<h1[^>]*>이 위키에 대해<\/h1>[\s\S]*<div[^>]*class="[^"]*body intro-body[^"]*"[^>]*>\s*\S/.test(about), 'about/index.html: 소개 본문이 비어 있거나 공통 본문 스타일이 없다');
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
    check(/"@type":"(BlogPosting|TechArticle|Article)"/.test(html), `${file}: 글 구조화 데이터 없음`);
    if (note.contentMode === 'external') {
      check(html.includes('class="external-article"'), `${file}: 외부 발행 글 소개 페이지 없음`);
      check(!/class="(?:body|note-side|mobile-toc|article-card|rail)\b/.test(html), `${file}: 외부 발행 글에 본문 또는 독서 UI 잔존`);
      check(html.includes('read-original') && html.includes('전문 읽기'), `${file}: 원문 읽기 링크 없음`);
      const record = search.find((entry) => entry.url === note.url);
      check(record && record.text === '' && record.headings.length === 0, `${file}: 검색 데이터에 본문 또는 목차 잔존`);
      check(record?.summary === note.summary, `${file}: 검색 요약이 공개 요약과 다름`);
      check(note.headings.length === 0, `${file}: 지도 데이터에 본문 목차 잔존`);
    }
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
  check(home.includes('id="series-heading"') && home.includes('최근 연재'), '홈: 최근 연재 영역 없음');
});
checks.push(async () => {
  check(!JSON.stringify(site).includes('bodyHtml'), 'site.json에 본문이 들어 있다');
  check(site.nodes.length > 0 && site.edges.length > 0, 'site.json 그래프가 비어 있다');
  check(search.length >= site.notes.length, 'search.json 레코드 수 부족');
  check(search.every((r) => typeof r.text === 'string'), 'search.json 검색 텍스트 형식 오류');
});
checks.push(async () => {
  // 노트마다 공유 카드 이미지가 있어야 한다.
  for (const note of site.notes) await checkCard(`og/${kindPrefix(note.kind)}/${note.slug}.png`);
  await checkCard('og/site.png');
});
checks.push(async () => {
  for (const file of ['rss.xml', 'feeds/posts.xml', 'feeds/notes.xml', 'feeds/dev.xml', 'favicon.svg', 'apple-touch-icon.png', 'robots.txt', 'map/index.html', '404.html']) check(await exists(file), `${file} 없음`);
  const postsFeed = await read('feeds/posts.xml').catch(() => '');
  check(/<link>https?:\/\/[^<]+\/posts\/[^<]+<\/link>/.test(postsFeed), 'feeds/posts.xml: 전문 공개 글이 가든 주소로 연결되지 않음');
  for (const page of ['index.html', 'posts/index.html', 'dev/index.html', 'map/index.html']) {
    const html = page === 'index.html' ? home : await read(page);
    for (const feed of ['rss.xml', 'feeds/posts.xml', 'feeds/notes.xml', 'feeds/dev.xml']) check(html.includes(`/${feed}"`), `${page}: ${feed} 피드 링크 없음`);
  }
  const unified = await read('rss.xml');
  for (const label of ['글', '노트', '개발 노트']) check(unified.includes(`<category>${label}</category>`), `rss.xml: ${label} 항목 없음`);
  check(home.includes('생각의 정원으로'), 'index: 생각의 정원 버튼 없음');
  check(!home.includes('Velog'), 'index: Velog 링크 잔존');
  check(!/노트 \d+개 · 연결 \d+개/.test(home.replace(/alt="[^"]*"/g, '')), 'index: 히어로 집계 잔존');
  // 최근 기록 절 안의 항목만 센다. 다른 곳에 목록이 생겨도 이 검사는 흔들리지 않는다.
  const recentSection = home.match(/<section[^>]*class="[^"]*\brecent\b[^"]*"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? '';
  const recentRows = (recentSection.match(/<li[\s>]/g) || []).length;
  check(recentRows === 3, `index: 최근 기록은 종류별 한 편(3개)이어야 하는데 ${recentRows}개`);
  for (const label of ['>노트</a>', '>개발 노트</a>', '>글</a>']) check(home.includes(label), `index: 최근 기록에 ${label.slice(1, -4)} 링크 없음`);
});
checks.push(async () => {
  const map = await read('map/index.html');
  check(map.includes('data-map') && map.includes('data-panel'), 'map: 그래프·패널 요소 없음');
  check(!map.includes('marker-end'), 'map: 화살표 마커 잔존');
  check(/노트 \d+ · 연결 \d+/.test(map), 'map: 집계 라벨 형식');
  check(map.includes('>허브</div>') && map.includes('data-sheet-grip') && map.includes('hub-mark'), 'map: 빈 패널 허브 목록, 시트 손잡이 또는 허브 링 없음');
  check(home.includes('data-graph') && home.includes('class="hero-snapshot"'), 'index: 히어로 그래프 마운트 지점 또는 스냅샷 링크 없음');
  const heroJson = home.match(/<script type="application\/json" data-hero-data>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const hero = heroJson ? JSON.parse(heroJson) : null;
  check(hero && hero.nodes.length === site.nodes.length && hero.positions.length === hero.nodes.length, 'index: 인라인 히어로 데이터가 없거나 지도 노드 수와 다름');
  check(hero && !/"(bodyText|summary|tags|path)"/.test(heroJson), 'index: 히어로 데이터에 그리기와 무관한 필드가 들어 있음');
  check(!home.includes('data-site='), 'index: 히어로가 여전히 site.json을 가리킴');
  const mapJson = map.match(/<script type="application\/json" data-map-data>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const mapData = mapJson ? JSON.parse(mapJson) : null;
  check(mapData && mapData.nodes.length === site.nodes.length && mapData.nodes.every((node) => node.mapKey && node.path), 'map: 인라인 그래프 데이터가 없거나 노드 수·필드가 다름');
  check(mapData && mapData.notes.length === site.notes.length && mapData.noteEdges.length === site.noteEdges.length, 'map: 인라인 패널 노트·참조 관계가 site.json과 다름');
  check(!map.includes('data-site=') && !/"(bodyText|headings)"/.test(mapJson), 'map: 여전히 site.json을 가리키거나 패널에 불필요한 필드가 실림');
  for (const [name, html] of [['index.html', home], ['map/index.html', map]]) check(html.includes('rel="modulepreload"'), `${name}: 그래프 엔진 청크 modulepreload 없음`);
  check(/<script type="module" blocking="render" src="[^"]+"><\/script><\/head>/.test(map), 'map: 페이지 스크립트가 head에서 렌더링을 막지 않음');
  check(home.includes('family=Gowun+Batang'), 'index: Gowun Batang 폰트 링크 없음');
  check(!/🗺|🌱/.test(home), 'index: 허브 이모지 잔존');
  check(home.includes('class="snap is-desktop"') && home.includes('class="snap is-mobile"') && home.includes('data-regions'), 'index: 데스크톱·모바일 스냅샷 또는 주제 영역 없음');
});
for (const run of checks) await run();
if (failures.length) {
  console.error(`check-dist: ${failures.length}개 실패\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('check-dist: ok');
