import { kindLabel, formatDate, displayTag, topicColor, cleanTitle } from './format.mjs';

// topicFold: 노드가 적어 기타로 접힌 주제 → '기타'. 점 색이 지도와 같아진다.
export function panelModel(node, notesByPath, noteEdges, topicFold = {}) {
  const ref = (path) => { const n = notesByPath.get(path); return n ? { path, title: cleanTitle(n.displayTitle || n.title), url: n.url } : null; };
  const outgoing = noteEdges.filter((e) => e.source === node.path).map((e) => ref(e.target)).filter(Boolean);
  const incoming = noteEdges.filter((e) => e.target === node.path).map((e) => ref(e.source)).filter(Boolean);
  const topics = (node.publicTags ?? []).map((tag) => { const head = tag.split('/')[0]; return { name: displayTag(tag), color: topicColor(topicFold[head] ?? head) }; });
  return {
    kind: kindLabel(node), date: formatDate(node.date), isHub: node.type === 'hub',
    title: cleanTitle(node.displayTitle || node.title), url: node.url, topics,
    summary: node.summaryIsExplicit ? node.summary : '',
    outgoing, incoming
  };
}
