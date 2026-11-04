import type { PanelNote, GraphEdge, TopicFold } from './content-model.ts';
type PanelSource = Pick<PanelNote, 'path' | 'title' | 'url'> & Partial<Omit<PanelNote, 'path' | 'title' | 'url'>> & { displayTitle?: string; type?: string };

import { kindLabel, formatDate, displayTag, topicColor, cleanTitle } from './format.ts';

// topicFold: 노드가 적어 기타로 접힌 주제 → '기타'. 점 색이 지도와 같아진다.
export function panelModel(node: PanelSource, notesByPath: ReadonlyMap<string, PanelSource>, noteEdges: readonly GraphEdge[], topicFold: TopicFold = {}) {
  const ref = (path: string) => { const n = notesByPath.get(path); return n ? { path, title: cleanTitle(n.displayTitle || n.title), url: n.url } : null; };
  const out = new Set(noteEdges.filter((e) => e.source === node.path && e.target !== node.path).map((e) => e.target));
  const into = new Set(noteEdges.filter((e) => e.target === node.path && e.source !== node.path).map((e) => e.source));
  const references = (paths: string[]) => paths.map(ref).filter((item) => item !== null);
  // 양방향 연결 데이터는 유지하고, 독자가 고르는 목록에서만 같은 글을 한 번씩 보여 준다.
  const mutual = references([...out].filter((path) => into.has(path)));
  const outgoing = references([...out].filter((path) => !into.has(path)));
  const incoming = references([...into].filter((path) => !out.has(path)));
  const topics = (node.publicTags ?? []).map((tag) => { const head = tag.split('/')[0]; return { name: displayTag(tag), color: topicColor(topicFold[head] ?? head) }; });
  return {
    kind: kindLabel(node), date: formatDate(node.date), isHub: node.type === 'hub',
    title: cleanTitle(node.displayTitle || node.title), url: node.url, topics,
    summary: node.summaryIsExplicit ? node.summary : '',
    mutual, outgoing, incoming
  };
}
