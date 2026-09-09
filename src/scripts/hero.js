import { createGraph } from '../graph/engine.mjs';
import { layoutGraph, ATLAS_LAYOUT } from '../graph/layout.mjs';

const box = document.querySelector('.hero-graph[data-graph]');
if (box && window.matchMedia('(min-width: 721px)').matches) {
  let interactiveGraph;
  try {
    const response = await fetch(box.dataset.site);
    if (!response.ok) throw new Error(`Hero data: ${response.status}`);
    const site = await response.json();
    const positions = layoutGraph(site.nodes, site.edges, { width: 1000, height: 640, ...ATLAS_LAYOUT });
    interactiveGraph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    interactiveGraph.setAttribute('role', 'group');
    interactiveGraph.setAttribute('aria-label', `생각 지도. 노드 ${site.nodes.length}개와 연결 ${site.edges.length}개. 노드를 누르면 그 노트를 엽니다.`);
    // 호버로 제목을 보고 누르는 것이라 지도를 거치지 않고 노트를 바로 연다. 지도 입구는 버튼과 헤더 탭이 맡는다.
    const open = (id) => { const node = site.nodes.find((n) => n.id === id); if (node) window.location.href = node.url; };
    const snapshot = box.firstElementChild;
    box.append(interactiveGraph);
    // 홈에서는 노드를 탭 순서에서 뺀다(36개를 지나야 대표 글에 닿는다). 키보드 탐색은 지도 페이지가 맡는다.
    createGraph(interactiveGraph, { nodes: site.nodes, edges: site.edges, positions, mode: 'hero', focusable: false, nodeScale: 0.9, onSelect: (id) => { if (id) open(id); }, onOpen: open });
    snapshot?.remove();
  } catch (error) {
    interactiveGraph?.remove();
    console.error(error);
  }
}
