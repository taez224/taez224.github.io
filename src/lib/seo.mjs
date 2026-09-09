// 검색 엔진과 답변 엔진이 읽는 구조화 데이터. 페이지가 이미 가진 제목·요약·날짜·URL만 쓰고 새 정보를 만들지 않는다.
const AUTHOR_NAME = 'TaeZ';
const ARTICLE_TYPES = { blog: 'BlogPosting', development: 'TechArticle' };

export function structuredData({ ogType = 'website', kind = null, title, description, url, image = null, published = null, siteTitle, siteUrl, sameAs = [] }) {
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
      inLanguage: 'ko',
      author,
      isPartOf: website
    };
  }
  return { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url, inLanguage: 'ko', isPartOf: website };
}

// <script> 안에 넣는 JSON. 문자열 속 "</script>"가 태그를 닫지 못하게 "<"만 이스케이프한다.
export function jsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// llms.txt: 사이트 요약과 공개 노트 목록을 마크다운 한 장으로. 사이트맵의 사람이 읽는 판이다.
const KIND_LABELS = [['blog', '글'], ['development', '개발 노트'], ['slipbox', '노트']];
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function llmsText(notes, { site, basePath = '', title, description }) {
  const home = new URL(`${String(basePath).replace(/\/$/, '')}/`, site).href;
  const lines = [`# ${oneLine(title)}`, '', `> ${oneLine(description)}`, '', `사이트: ${home}`];
  for (const [kind, label] of KIND_LABELS) {
    const items = notes
      .filter((note) => note.kind === kind && note.url)
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || oneLine(a.title).localeCompare(oneLine(b.title), 'ko'));
    if (!items.length) continue;
    lines.push('', `## ${label}`, '');
    for (const note of items) {
      const summary = oneLine(note.summary);
      lines.push(`- [${oneLine(note.title)}](${new URL(note.url, site).href})${summary ? `: ${summary}` : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
