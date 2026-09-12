import { createGraph, type GraphFilter } from '../../src/graph/engine.ts';
import { createGraphGesture } from '../../src/graph/gestures.ts';
import { createMarkdownRenderer } from '../../src/lib/markdown.ts';
import type { GraphNode, GraphEdge, Point } from '../../src/lib/content-model.ts';

declare const svg: SVGSVGElement;
declare const nodes: GraphNode[];
declare const edges: GraphEdge[];
declare const positions: Map<string, Point>;
const graph = createGraph(svg, { nodes, edges, positions });
graph.select(null);
graph.setFilter({ topics: new Set(['AI']) } satisfies GraphFilter);
graph.moveTo({ x: 10, y: 20, scale: 1 });
// @ts-expect-error 화면 이동에는 배율도 필요하다.
graph.moveTo({ x: 10, y: 20 });
// @ts-expect-error 노드 ID는 문자열이다.
graph.select(42);

const gesture = createGraphGesture();
gesture.down({ id: 1, x: 10, y: 20, touch: true }, graph.view());
// @ts-expect-error 포인터 식별자 없이 제스처를 갱신할 수 없다.
gesture.move({ x: 10, y: 20 });

createMarkdownRenderer({ resolveNote: () => ({ visibility: 'private' }) });
// @ts-expect-error 비공개 대상은 제목과 URL을 제공하지 않는다.
createMarkdownRenderer({ resolveNote: () => ({ visibility: 'private', title: '비공개', url: '/private/' }) });
