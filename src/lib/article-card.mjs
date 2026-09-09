import { firstSentence } from './format.mjs';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function articleCardHtml({ note, caption = '', image = null }) {
  const summary = String(caption ?? '').trim() || firstSentence(note.summary);
  const imageAttributes = image ? Object.entries(image).filter(([, value]) => value != null).map(([key, value]) => `${key}="${escape(value)}"`).join(' ') : '';
  return `<aside class="article-card">
<a class="article-card-link${image ? ' has-thumbnail' : ''}" href="${escape(note.url)}">
${image ? `<img ${imageAttributes} alt="" loading="lazy" decoding="async">` : ''}
<span class="article-card-copy">${note.contentMode === 'external' && note.publication ? `<span class="article-card-publication">${escape(note.publication)}</span>` : ''}<span class="article-card-title">${escape(note.displayTitle || note.title)}</span>${summary ? `<span class="article-card-summary">${escape(summary)}</span>` : ''}</span>
</a></aside>`;
}

export function replaceArticleCards(html, cards) {
  return html.replace(/<aside class="article-card-slot" data-article-card="(\d+)">[\s\S]*?<\/aside>/g, (fallback, index) => cards[Number(index)] ?? fallback);
}
