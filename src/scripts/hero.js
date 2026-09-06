import { createGraph } from '../graph/engine.mjs';
import { layoutGraph } from '../graph/layout.mjs';

const box = document.querySelector('.hero-graph[data-graph]');
if (box && window.matchMedia('(min-width: 721px)').matches) {
  try {
    const response = await fetch(box.dataset.site);
    if (!response.ok) throw new Error(`Hero data: ${response.status}`);
    const site = await response.json();
    const positions = layoutGraph(site.nodes, site.edges, { width: 1000, height: 640 });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', `노트 지도. 노드 ${site.nodes.length}개와 연결 ${site.edges.length}개. 노드를 누르면 지도로 이동합니다.`);
    // 호버로 제목을 보고 누르는 것이라 지도를 거치지 않고 노트를 바로 연다. 지도 입구는 버튼과 헤더 탭이 맡는다.
    const open = (id) => { const node = site.nodes.find((n) => n.id === id); if (node) window.location.href = node.url; };
    const snapshot = box.firstElementChild;
    box.append(svg);
    createGraph(svg, { nodes: site.nodes, edges: site.edges, positions, mode: 'hero', onSelect: (id) => { if (id) open(id); }, onOpen: open });
    snapshot?.remove();
  } catch (error) {
    box.querySelector('svg')?.remove();
    console.error(error);
  }
}
