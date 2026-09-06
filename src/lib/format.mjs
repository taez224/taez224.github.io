export const GRAPH_COLORS = { AI: '#80698f', 소프트웨어공학: '#5d7897', 커리어: '#9a7852', 지식관리: '#5c806c', 글쓰기: '#9c6e6e', 철학: '#9b8a45', 개발: '#5f8184', 기타: '#817f72' };
const HIDDEN_TAGS = new Set(['slipbox', 'blog', 'inbox', 'clippings']);

export function topicColor(topic) { return GRAPH_COLORS[topic] ?? GRAPH_COLORS.기타; }
export function publicTags(tags = []) { return tags.filter((tag) => !HIDDEN_TAGS.has(tag) && !tag.startsWith('프로젝트/')); }
export function displayTag(tag) { return tag.startsWith('개발/') ? tag.slice(3) : tag; }
export function cleanTitle(title) { return String(title ?? '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]\s*/gu, '').trim(); }
export function formatDate(iso) { return String(iso ?? '').slice(0, 10).replaceAll('-', '.'); }
export function developmentCategoryLabel(category) { return ({ Concepts: '개념·설계', Troubleshooting: '문제 해결', Tools: '도구·워크플로' })[category] || '개발 노트'; }
export function kindLabel(note) {
  if (note.kind === 'development') return developmentCategoryLabel(note.category);
  return note.kind === 'blog' ? '글' : '노트';
}
export function withBase(path) {
  const base = String(import.meta.env?.BASE_URL ?? '').replace(/\/$/, '');
  return `${base}${path}`;
}
