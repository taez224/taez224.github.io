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
    const open = (id) => { const node = site.nodes.find((n) => n.id === id); if (node) window.location.href = `${box.dataset.mapUrl}?node=${encodeURIComponent(node.mapKey)}`; };
    const snapshot = box.firstElementChild;
    box.append(svg);
    createGraph(svg, { nodes: site.nodes, edges: site.edges, positions, mode: 'hero', onSelect: (id) => { if (id) open(id); }, onOpen: open });
    snapshot?.remove();
  } catch (error) {
    box.querySelector('svg')?.remove();
    console.error(error);
  }
}
