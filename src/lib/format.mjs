import { KINDS } from './kinds.ts';

// 개발은 옛 소프트웨어공학의 파란색을 물려받는다(2026-09-07 태그 통합). 청록 #5f8184는 지식관리 초록과 구분이 안 됐다. 소프트웨어공학은 남은 태그를 위한 별칭.
// 조직(청록)과 심리(자홍)는 색상환에서 가장 넓게 빈 두 자리를 채운다(2026-09-10). 조직은 옛 청록보다 채도를 두 배로 올려 지식관리와 떨어뜨렸다.
export const GRAPH_COLORS = { AI: '#80698f', 개발: '#5d7897', 커리어: '#9a7852', 지식관리: '#5c806c', 글쓰기: '#9c6e6e', 철학: '#9b8a45', 조직: '#4a8791', 심리: '#a4617f', 소프트웨어공학: '#5d7897', 기타: '#817f72' };
const HIDDEN_TAGS = new Set(['slipbox', 'blog', 'inbox', 'clippings']);

export function topicColor(topic) { return GRAPH_COLORS[topic] ?? GRAPH_COLORS.기타; }
export function publicTags(tags = []) { return tags.filter((tag) => !HIDDEN_TAGS.has(tag) && !tag.startsWith('프로젝트/')); }
// 노트의 주제는 첫 공개 태그의 앞 조각이다. 공개 태그가 없으면 기타다.
export function topicFor(tags) { const topic = publicTags(tags).find(Boolean); return topic ? topic.split('/')[0] : '기타'; }
export function displayTag(tag) { return tag.startsWith('개발/') ? tag.slice(3) : tag; }
export function cleanTitle(title) { return String(title ?? '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]\s*/gu, '').trim(); }
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
// 피드와 OG 카드 SVG는 XML이다. XML 1.0이 담지 못하는 제어 문자는 지우고, 이모지 같은 보충 평면 문자는 남긴다.
export function escapeXml(value) { return String(value ?? '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]); }
// <script type="application/json"> 안에 넣는 JSON. 제목의 '<'가 태그를 닫지 못하게 이스케이프한다.
export function inlineJson(data) { return JSON.stringify(data).replace(/</g, '\\u003c'); }
export function formatDate(iso) { return String(iso ?? '').slice(0, 10).replaceAll('-', '.'); }
// 목록에서는 작성한 요약의 첫 문장만 사용한다. 원문과 검색 데이터는 그대로 둔다.
export function firstSentence(text = '') { return text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text; }
export function developmentCategoryLabel(category) { return ({ Concepts: '개념·설계', Troubleshooting: '문제 해결', Tools: '도구·워크플로' })[category] || '개발 노트'; }
export function kindLabel(note) {
  if (note.kind === 'development') return developmentCategoryLabel(note.category);
  return KINDS[note.kind]?.label ?? KINDS.slipbox.label;
}
export function withBase(path) {
  const base = String(import.meta.env?.BASE_URL ?? '').replace(/\/$/, '');
  return `${base}${path}`;
}
