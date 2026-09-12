import type { GraphNode, GraphEdge, Point, PanelNote, PanelData, TopicFold } from './content-model.ts';

// 페이지에 인라인하는 그래프 데이터. site.json(130KB 남짓)을 받아 시작하는 대신 노드·간선만 페이지에 두어
// 스크립트가 실행되는 즉시 그래프를 올린다. 엔진이 그리는 데 필요한 필드만 남기고, extra로 페이지가 더 쓰는 필드를 더한다.
// positions를 주면 빌드 때 계산한 좌표를 함께 싣고 좌표 없는 노드는 뺀다(홈 히어로). 없으면 페이지가 무대 크기에 맞춰 배치한다(지도).
const BASE_FIELDS = ['id', 'url', 'type', 'topic', 'degree', 'isEntry'] as const;
type BaseField = typeof BASE_FIELDS[number];
type InlineNode<T extends GraphNode, K extends keyof T> = Pick<T, BaseField | K> & { title: string };
export interface InlineGraphData<T extends GraphNode, K extends keyof T = never> {
  nodes: InlineNode<T, K>[];
  edges: GraphEdge[];
  positions?: [string, Point][];
}

export function inlineGraph<T extends GraphNode, K extends keyof T = never>(nodes: readonly T[], edges: readonly GraphEdge[], { positions = null, extra = [] }: { positions?: ReadonlyMap<string, Point> | null; extra?: readonly K[] } = {}): InlineGraphData<T, K> {
  const kept = positions ? nodes.filter((node) => positions.has(node.id)) : nodes;
  const fields = [...BASE_FIELDS, ...extra];
  const pick = (node: T) => Object.fromEntries([['title', node.displayTitle ?? node.title], ...fields.map((field) => [field, node[field]])]) as InlineNode<T, K>;
  const data: InlineGraphData<T, K> = { nodes: kept.map(pick), edges: edges.map(({ source, target }) => ({ source, target })) };
  if (positions) data.positions = kept.map((node) => [node.id, positions.get(node.id)!]);
  return data;
}

type PanelSource = Omit<PanelNote, 'category' | 'publicTags' | 'summaryIsExplicit'> & { displayTitle?: string; category?: PanelNote['category']; publicTags?: string[]; summaryIsExplicit?: boolean };

// 지도 패널이 쓰는 노트 정보. 제목·종류·날짜·주제·명시한 요약과 참조 관계만 싣는다. 본문 발췌 요약은 패널에 쓰지 않으니 뺀다.
// 간선은 노트 배열의 위치 색인 쌍으로 실어 경로 문자열을 되풀이하지 않는다.
export function inlinePanelNotes(notes: readonly PanelSource[], noteEdges: readonly GraphEdge[], topicFold: TopicFold = {}): PanelData {
  const index = new Map(notes.map((note, i) => [note.path, i]));
  return {
    notes: notes.map(({ path, title, displayTitle, url, kind, category, date, publicTags, summary, summaryIsExplicit }) =>
      ({ path, title: displayTitle ?? title, url, kind, category: category ?? null, date, publicTags: publicTags ?? [], summary: summaryIsExplicit ? summary : '', summaryIsExplicit: Boolean(summaryIsExplicit) })),
    noteEdges: noteEdges.filter((e) => index.has(e.source) && index.has(e.target)).map((e) => [index.get(e.source)!, index.get(e.target)!]),
    topicFold
  };
}
