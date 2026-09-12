import test from 'node:test';
import assert from 'node:assert/strict';
import { structuredData, llmsText, articleMeta } from '../src/lib/seo.ts';

const siteUrl = 'https://example.com/obsidian/';
const base = { siteTitle: '정원', siteUrl, description: '소개', sameAs: ['https://github.com/taez224'] };

test('the home page is a WebSite with the author and profile links', () => {
  const data = structuredData({ ...base, title: '정원', url: siteUrl });
  assert.equal(data['@type'], 'WebSite');
  assert.equal(data.url, siteUrl);
  assert.deepEqual(data.author, { '@type': 'Person', name: 'TaeZ', sameAs: ['https://github.com/taez224'] });
});

test('blog and development notes get article types with their published date', () => {
  const blog = structuredData({ ...base, ogType: 'article', kind: 'blog', title: '글', url: `${siteUrl}posts/a/`, image: `${siteUrl}og/a.png`, published: '2026-09-01' });
  assert.equal(blog['@type'], 'BlogPosting');
  assert.equal(blog.headline, '글');
  assert.equal(blog.datePublished, '2026-09-01');
  assert.equal(blog.image, `${siteUrl}og/a.png`);
  assert.ok(blog.isPartOf, '글은 사이트에 속한다');
  assert.equal(blog.isPartOf.url, siteUrl);
  assert.equal(structuredData({ ...base, ogType: 'article', kind: 'development', title: '개발', url: `${siteUrl}dev/b/` })['@type'], 'TechArticle');
  const slipbox = structuredData({ ...base, ogType: 'article', kind: 'slipbox', title: '노트', url: `${siteUrl}notes/c/` });
  assert.equal(slipbox['@type'], 'Article');
  assert.equal('datePublished' in slipbox, false, '날짜가 없으면 필드를 만들지 않는다');
});

test('articles carry dateModified only when the page has a modification date', () => {
  const article = { ...base, ogType: 'article', kind: 'slipbox', title: '노트', url: `${siteUrl}notes/c/`, published: '2026-09-01' };
  assert.equal(structuredData({ ...article, updated: '2026-09-05' }).dateModified, '2026-09-05');
  assert.equal('dateModified' in structuredData(article), false, '수정일이 없으면 필드를 만들지 않는다');
});

test('note pages describe themselves by kind and slug, not by the base-prefixed note url', () => {
  const note = { kind: 'development' as const, slug: 'vault-with-ai', url: '/obsidian/dev/vault-with-ai/', date: '2026-09-01' };
  assert.deepEqual(articleMeta(note), { path: '/dev/vault-with-ai/', kind: 'development', published: '2026-09-01', ogType: 'article', ogImage: '/og/dev/vault-with-ai.png' });
  assert.equal(articleMeta({ ...note, date: '' }).published, null, '날짜가 없으면 발행일 메타를 만들지 않는다');
});

test('list pages are WebPages inside the site', () => {
  const data = structuredData({ ...base, title: '책장', url: `${siteUrl}books/` });
  assert.equal(data['@type'], 'WebPage');
  assert.ok(data.isPartOf, '목록 페이지도 사이트에 속한다');
  assert.equal(data.isPartOf['@type'], 'WebSite');
});

test('about pages can use the specific AboutPage type', () => {
  const data = structuredData({ ...base, pageType: 'AboutPage', title: '이 위키에 대해', url: `${siteUrl}about/` });
  assert.equal(data['@type'], 'AboutPage');
  assert.ok(data.isPartOf, '소개 페이지도 사이트에 속한다');
  assert.equal(data.isPartOf['@type'], 'WebSite');
});

test('llms.txt lists public notes by kind, newest first, with absolute urls', () => {
  const notes = [
    { kind: 'slipbox' as const, title: '생각', url: '/obsidian/notes/생각/', summary: '한 줄\n요약', date: '2026-08-01' },
    { kind: 'blog' as const, title: '옛 글', url: '/obsidian/posts/old/', summary: '', date: '2026-01-01' },
    { kind: 'blog' as const, title: '새 글', url: '/obsidian/posts/new/', summary: '요약', date: '2026-09-01' },
    { kind: 'book' as const, title: '책', url: '/obsidian/books/#b', summary: '', date: '2026-09-02' }
  ];
  const text = llmsText(notes, { site: 'https://example.com', basePath: '/obsidian', title: '정원', description: '소개' });
  const lines = text.split('\n');
  assert.equal(lines[0], '# 정원');
  assert.equal(lines[2], '> 소개');
  assert.ok(text.includes('사이트: https://example.com/obsidian/'));
  assert.ok(text.indexOf('## 글') < text.indexOf('## 노트'), '글이 노트보다 먼저 온다');
  assert.ok(text.indexOf('[새 글]') < text.indexOf('[옛 글]'), '최신 글이 먼저 온다');
  assert.ok(text.includes('- [새 글](https://example.com/obsidian/posts/new/): 요약'));
  assert.ok(text.includes('- [옛 글](https://example.com/obsidian/posts/old/)\n'), '요약이 없으면 콜론을 붙이지 않는다');
  assert.ok(text.includes(': 한 줄 요약'), '여러 줄 요약은 한 줄로 만든다');
  assert.ok(!text.includes('책'), '책은 목록에 넣지 않는다');
});
