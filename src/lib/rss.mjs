// XML 1.0 Char production; retain valid supplementary characters (including emoji).
import { SITE_DESCRIPTION, SITE_TITLE } from './site-meta.mjs';

const escapeXml = value => String(value ?? '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);

// Reuse only the garden's published selection, never scan the vault separately.
export function feedEntries(garden) {
  const posts = [...garden.blog.series.flatMap(s => s.posts), ...garden.blog.publications.flatMap(p => p.posts)];
  const byPath = new Map(posts.map(p => [p.path, p]));
  return garden.notes.map(note => ({ ...note, published: byPath.get(note.path)?.published ?? '' }));
}

export function feedItems(notes, { site, basePath = '', limit = 30, kinds = ['blog', 'slipbox'], now = new Date() }) {
  const home = new URL(`${basePath.replace(/\/$/, '')}/`, site);
  return notes.flatMap(note => {
    if (!kinds.includes(note.kind) || !['blog', 'slipbox'].includes(note.kind) || ['series', 'hub', 'moc'].includes(note.type)) return [];
    const blog = note.kind === 'blog';
    if (blog && note.status !== 'published') return [];
    const day = blog ? note.published : note.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return [];
    const date = new Date(`${day}T00:00:00+09:00`);
    if (!Number.isFinite(date.getTime()) || date > now) return [];
    if (new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10) !== day) return [];
    let url;
    try { url = blog ? new URL(note.publishedUrl) : new URL(note.url, site); } catch { return []; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return [];
    if (!blog && (url.origin !== home.origin || !url.pathname.startsWith(home.pathname))) return [];
    return [{ title: note.displayTitle || note.title, kind: note.kind, label: blog ? '글' : '노트',
      url: url.href, date: day, pubDate: date.toUTCString(), summary: note.summary || '' }];
  }).sort((a,b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url))
    .filter((item,i,all) => all.findIndex(other => other.url === item.url) === i).slice(0, limit);
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
