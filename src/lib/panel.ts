import type { PanelNote, GraphEdge, TopicFold } from './content-model.ts';
type PanelSource = Pick<PanelNote, 'path' | 'title' | 'url'> & Partial<Omit<PanelNote, 'path' | 'title' | 'url'>> & { displayTitle?: string; type?: string };

import { kindLabel, formatDate, displayTag, topicColor, cleanTitle } from './format.ts';

// topicFold: 노드가 적어 기타로 접힌 주제 → '기타'. 점 색이 지도와 같아진다.
export function panelModel(node: PanelSource, notesByPath: ReadonlyMap<string, PanelSource>, noteEdges: readonly GraphEdge[], topicFold: TopicFold = {}) {
  const ref = (path: string) => { const n = notesByPath.get(path); return n ? { path, title: cleanTitle(n.displayTitle || n.title), url: n.url } : null; };
  const outgoing = noteEdges.filter((e) => e.source === node.path).map((e) => ref(e.target)).filter((item) => item !== null);
  const incoming = noteEdges.filter((e) => e.target === node.path).map((e) => ref(e.source)).filter((item) => item !== null);
  const topics = (node.publicTags ?? []).map((tag) => { const head = tag.split('/')[0]; return { name: displayTag(tag), color: topicColor(topicFold[head] ?? head) }; });
  return {
    kind: kindLabel(node), date: formatDate(node.date), isHub: node.type === 'hub',
    title: cleanTitle(node.displayTitle || node.title), url: node.url, topics,
    summary: node.summaryIsExplicit ? node.summary : '',
    outgoing, incoming
  };
}
