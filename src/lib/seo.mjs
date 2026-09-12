import { KINDS } from './kinds.ts';
import { inlineJson, withBase } from './format.mjs';
import { newestFirst } from './dates.ts';
import { kindPrefix, noteUrl, siteHome } from './slug.ts';
// 검색 엔진과 답변 엔진이 읽는 구조화 데이터. 페이지가 이미 가진 제목·요약·날짜·URL만 쓰고 새 정보를 만들지 않는다.
const AUTHOR_NAME = 'TaeZ';
const ARTICLE_TYPES = { blog: 'BlogPosting', development: 'TechArticle' };

/** @param {{ ogType?: string, kind?: string | null, pageType?: string | null, title: string, description: string, url: string, image?: string | null, published?: string | null, updated?: string | null, siteTitle: string, siteUrl: string, sameAs?: string[] }} options */
export function structuredData({ ogType = 'website', kind = null, pageType = null, title, description, url, image = null, published = null, updated = null, siteTitle, siteUrl, sameAs = [] }) {
  const author = { '@type': 'Person', name: AUTHOR_NAME, ...(sameAs.length ? { sameAs } : {}) };
  const website = { '@type': 'WebSite', name: siteTitle, url: siteUrl };
  if (url === siteUrl) return { '@context': 'https://schema.org', ...website, description, inLanguage: 'ko', author };
  if (ogType === 'article') {
    return {
      '@context': 'https://schema.org',
      '@type': ARTICLE_TYPES[kind] ?? 'Article',
      headline: title,
      description,
      url,
      ...(image ? { image } : {}),
      ...(published ? { datePublished: published } : {}),
      ...(updated ? { dateModified: updated } : {}),
      inLanguage: 'ko',
      author,
      isPartOf: website
    };
  }
  return { '@context': 'https://schema.org', '@type': pageType ?? 'WebPage', name: title, description, url, inLanguage: 'ko', isPartOf: website };
}

// 노트 상세 페이지(NotePage·ExternalArticle)가 Shell에 넘기는 값. note.url에는 basePath가 붙어 있고 Shell은 basePath 없는 경로를
// 받아 withBase로 붙이므로, 경로는 종류와 슬러그로 다시 만든다. 공유 이미지는 og/[...slug].png가 같은 종류·슬러그로 그린다.
export function articleMeta(note) {
  return { path: noteUrl('', note.kind, note.slug), kind: note.kind, published: note.date || null, ogType: 'article', ogImage: withBase(`/og/${kindPrefix(note.kind)}/${note.slug}.png`) };
}

// <script> 안에 넣는 JSON. 문자열 속 "</script>"가 태그를 닫지 못하게 "<"만 이스케이프한다.
export function jsonLdScript(data) {
  return inlineJson(data);
}

// llms.txt: 사이트 요약과 공개 노트 목록을 마크다운 한 장으로. 사이트맵의 사람이 읽는 판이다.
const LLMS_ORDER = ['blog', 'development', 'slipbox'];
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function llmsText(notes, { site, basePath = '', title, description }) {
  const home = siteHome(site, basePath).href;
  const lines = [`# ${oneLine(title)}`, '', `> ${oneLine(description)}`, '', `사이트: ${home}`];
  for (const kind of LLMS_ORDER) {
    const label = KINDS[kind].label;
    const items = notes
      .filter((note) => note.kind === kind && note.url)
      .sort(newestFirst((note) => note.date, (note) => oneLine(note.title)));
    if (!items.length) continue;
    lines.push('', `## ${label}`, '');
    for (const note of items) {
      const summary = oneLine(note.summary);
      lines.push(`- [${oneLine(note.title)}](${new URL(note.url, site).href})${summary ? `: ${summary}` : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
