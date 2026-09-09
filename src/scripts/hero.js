import { createGraph } from '../graph/engine.mjs';

// 데이터와 좌표는 페이지에 인라인돼 있다(index.astro의 data-hero-data). fetch와 배치 계산이 없어 첫 화면 전에 그래프가 올라간다.
const box = document.querySelector('.hero-graph[data-graph]');
if (box && window.matchMedia('(min-width: 721px)').matches) {
  let interactiveGraph;
  try {
    const { nodes, edges, positions } = JSON.parse(box.querySelector('[data-hero-data]').textContent);
    interactiveGraph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    interactiveGraph.setAttribute('role', 'group');
    interactiveGraph.setAttribute('aria-label', `생각 지도. 노드 ${nodes.length}개와 연결 ${edges.length}개. 노드를 누르면 그 노트를 엽니다.`);
    // 호버로 제목을 보고 누르는 것이라 지도를 거치지 않고 노트를 바로 연다. 지도 입구는 버튼과 헤더 탭이 맡는다.
    const open = (id) => { const node = nodes.find((n) => n.id === id); if (node) window.location.href = node.url; };
    const snapshot = box.querySelector('.hero-snapshot');
    box.append(interactiveGraph);
    // 홈에서는 노드를 탭 순서에서 뺀다(36개를 지나야 대표 글에 닿는다). 키보드 탐색은 지도 페이지가 맡는다.
    createGraph(interactiveGraph, { nodes, edges, positions: new Map(positions), mode: 'hero', focusable: false, nodeScale: 0.9, layoutSize: { width: 1000, height: 640 }, onSelect: (id) => { if (id) open(id); }, onOpen: open });
    snapshot?.remove();
  } catch (error) {
    interactiveGraph?.remove();
    console.error(error);
  }
}
