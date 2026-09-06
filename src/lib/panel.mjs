import { kindLabel, formatDate, displayTag, topicColor, cleanTitle } from './format.mjs';

export function panelModel(node, notesByPath, noteEdges) {
  const ref = (path) => { const n = notesByPath.get(path); return n ? { title: cleanTitle(n.displayTitle || n.title), url: n.url } : null; };
  const outgoing = noteEdges.filter((e) => e.source === node.path).map((e) => ref(e.target)).filter(Boolean);
  const incoming = noteEdges.filter((e) => e.target === node.path).map((e) => ref(e.source)).filter(Boolean);
  const topics = (node.publicTags ?? []).map((tag) => ({ name: displayTag(tag), color: topicColor(tag.split('/')[0]) }));
  return {
    kind: kindLabel(node), date: formatDate(node.date), isHub: node.type === 'hub',
    title: cleanTitle(node.displayTitle || node.title), url: node.url, topics,
    summary: node.summaryIsExplicit ? node.summary : '',
    outgoing, incoming
  };
}
