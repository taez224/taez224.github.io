// XML 1.0 Char production; retain valid supplementary characters (including emoji).
import { SITE_DESCRIPTION, SITE_TITLE } from './site-meta.mjs';
import { KINDS, NAVIGATION_TYPES } from './kinds.mjs';

// 최신 날짜가 먼저, 같은 날이면 guid(=link) 순서다. guid는 피드가 항목을 알아보는 값이라, 제목처럼 고칠 수 있는 표시 값으로
// 정렬하면 제목만 고쳐도 순서와 종류별 몫의 경계 항목이 바뀐다. 날짜와 주소는 기계 값이라 로케일과 무관한 코드 포인트로 비교한다.
const byCodePoint = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const newestItemFirst = (left, right) => byCodePoint(right.date, left.date) || byCodePoint(left.url, right.url);

const escapeXml = value => String(value ?? '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);

const FEED_KINDS = ['blog', 'slipbox', 'development'];

// notes에는 조립 결과(garden.notes)만 넘긴다. 피드가 vault를 따로 읽지 않으므로 공개 범위와 날짜는 조립 단계를 따른다.
// quota: 종류별 몫({ kind: n }). 주면 종류마다 최근 n편을 뽑은 뒤 합쳐 날짜순으로 놓는다. 종류별 피드는 몫 없이 limit만 쓴다.
export function feedItems(notes, { site, basePath = '', limit = 30, kinds = FEED_KINDS, quota = null }) {
  const home = new URL(`${basePath.replace(/\/$/, '')}/`, site);
  const items = notes.flatMap(note => {
    if (!kinds.includes(note.kind) || !FEED_KINDS.includes(note.kind) || NAVIGATION_TYPES.has(note.type)) return [];
    const blog = note.kind === 'blog';
    if (blog && note.status !== 'published') return [];
    // 글은 발행일이 있어야 피드에 들어간다. 날짜가 실제로 있는 날인지, 빌드한 날보다 늦지 않은지는 조립 단계(dates.mjs)가 보장한다.
    const day = blog ? note.published : note.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return [];
    const date = new Date(`${day}T00:00:00+09:00`);
    // 전문을 가든에서 읽는 글과 노트는 가든 주소(canonical)로, 외부 발행처에서만 읽는 글은 원문 주소로 보낸다.
    const external = blog && note.contentMode === 'external';
    let url;
    try { url = external ? new URL(note.publishedUrl) : new URL(note.url, site); } catch { return []; }
    if (url.protocol !== 'https:' || url.username || url.password) return [];
    if (!external && (url.origin !== home.origin || !url.pathname.startsWith(home.pathname))) return [];
    return [{ title: note.displayTitle || note.title, kind: note.kind, label: KINDS[note.kind].label,
      url: url.href, date: day, pubDate: date.toUTCString(), summary: note.summary || '' }];
  }).sort(newestItemFirst)
    .filter((item,i,all) => all.findIndex(other => other.url === item.url) === i);
  if (!quota) return items.slice(0, limit);
  const taken = {};
  return items.filter(item => (taken[item.kind] = (taken[item.kind] ?? 0) + 1) <= (quota[item.kind] ?? 0)).slice(0, limit);
}

export function renderFeed(notes, options) {
  const home = new URL(`${(options.basePath || '').replace(/\/$/, '')}/`, options.site).href;
  const items = feedItems(notes, options);
  const title = options.title || SITE_TITLE;
  const description = options.description || SITE_DESCRIPTION;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${escapeXml(title)}</title>
<link>${escapeXml(home)}</link>
<description>${escapeXml(description)}</description>
<language>ko</language>
<atom:link href="${escapeXml(new URL(options.feedPath || 'rss.xml', home).href)}" rel="self" type="application/rss+xml" />
${items.map(item => `<item><title>${escapeXml(item.title)}</title>
<link>${escapeXml(item.url)}</link><guid isPermaLink="true">${escapeXml(item.url)}</guid>
<pubDate>${item.pubDate}</pubDate><category>${item.label}</category>
<description>${escapeXml(item.summary)}</description></item>`).join('\n')}
</channel></rss>\n`;
}
