import test from 'node:test';
import assert from 'node:assert/strict';
import { articleCardHtml, replaceArticleCards } from '../src/lib/article-card.mjs';

const note = { title: '연결한 글', url: '/obsidian/posts/linked/', summary: '첫 문장입니다. 두 번째 문장입니다.' };

test('article card renders linked metadata and responsive thumbnail without extra links', () => {
  const html = articleCardHtml({ note, caption: '지난 글', image: { src: '/cover.webp', srcset: '/small.webp 160w, /large.webp 320w', sizes: '160px', width: 320, height: 180 } });
  assert.match(html, /href="\/obsidian\/posts\/linked\/"/);
  assert.match(html, /srcset="\/small.webp 160w, \/large.webp 320w"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /article-card-summary">지난 글<\/span>/);
  assert.doesNotMatch(html, /첫 문장입니다|article-card-caption/);
  assert.doesNotMatch(html, /두 번째 문장/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
});

test('cards without a connection reason fall back to the first summary sentence', () => {
  for (const caption of ['', '   ']) {
    const html = articleCardHtml({ note, caption });
    assert.match(html, /article-card-summary">첫 문장입니다\.<\/span>/);
    assert.doesNotMatch(html, /두 번째 문장|article-card-caption/);
  }
});

test('no-thumbnail cards omit the image and metadata is escaped as text', () => {
  const html = articleCardHtml({ note: { ...note, title: '<img src=x onerror=alert(1)>', summary: '<b>본문</b>' }, caption: '<script>caption</script>' });
  assert.doesNotMatch(html, /<img|<script|<b>|has-thumbnail/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script/);
});

test('article card keeps a fragment in its destination', () => {
  const html = articleCardHtml({ note: { ...note, url: `${note.url}#source-proof` } });
  assert.match(html, /href="\/obsidian\/posts\/linked\/#source-proof"/);
});

test('replacement preserves surrounding HTML and fallback content for unavailable cards', () => {
  const html = '<aside class="callout"><p>앞</p><aside class="article-card-slot" data-article-card="0"><a href="/fallback">fallback</a></aside><p>뒤</p></aside>';
  const rendered = replaceArticleCards(html, ['<aside class="article-card">완성</aside>']);
  assert.equal(rendered, '<aside class="callout"><p>앞</p><aside class="article-card">완성</aside><p>뒤</p></aside>');
  assert.equal(replaceArticleCards(html, [null]), html);
});

test('external publication cards identify the publisher while keeping the garden intro URL', () => {
  const html = articleCardHtml({ note: { ...note, contentMode: 'external', publication: 'Nextree 기술 블로그' } });
  assert.match(html, /class="article-card-publication">Nextree 기술 블로그/);
  assert.match(html, /href="\/obsidian\/posts\/linked\/"/);
});
