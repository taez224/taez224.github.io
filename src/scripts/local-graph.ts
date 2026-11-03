import { localGraphLayout, fitLocalGraph } from '../components/local-graph-layout.ts';
import { offsetLine } from '../graph/edge-geometry.ts';
// 그래프와 함께 보이는 연재 목록·허브 링크만 같은 노드와 함께 강조한다. 전환되는 연결 목록은 짝짓지 않는다.
// 그래프의 제목은 두 줄까지 줄여 보이고, 전체 제목은 목록 보기에서 읽는다.
// 터치 기기는 탭한 요소에 mouseenter만 오고 mouseleave가 오지 않아 강조가 남으므로, 호버할 수 있을 때만 마우스로 잇는다.
const graph = document.querySelector('.local-graph');
if (graph) {
  const svg = graph.querySelector<SVGSVGElement>('svg');
  if (svg) {
    // viewBox를 실제 폭에 맞춰 글자와 누르는 영역이 축소되지 않게 한다. 좁으면 이웃 수를 줄여 다시 배치한다.
    const anchors = [...svg.querySelectorAll<SVGAElement>('a.node')];
    const nodes = anchors.map(a => ({ path: a.getAttribute('href')!, url: a.getAttribute('href')!, displayTitle: a.getAttribute('aria-label')!, topic: '' }));
    const outgoing = nodes.filter((_, i) => anchors[i].dataset.direction !== 'in');
    const incoming = nodes.filter((_, i) => anchors[i].dataset.direction !== 'out');
    let previousWidth = 0;
    const position = (element: Element, values: Record<string, number>) => { for (const [name, value] of Object.entries(values)) element.setAttribute(name, String(value)); };
    const resize = () => {
      const width = svg.getBoundingClientRect().width;
      if (!width || width === previousWidth) return;
      previousWidth = width;
      const layout = fitLocalGraph(localGraphLayout({ path: '', displayTitle: '', url: '', topic: '' }, outgoing, incoming, { width, height: width < 280 ? 240 : 190 }));
      svg.setAttribute('viewBox', `0 0 ${width} ${layout.height}`);
      svg.style.height = `${layout.height}px`;
      svg.style.setProperty('--local-hit-radius', '22px');
      const current = svg.querySelector('.is-current')!;
      for (const circle of current.querySelectorAll('circle')) position(circle, { cx: layout.nodes[0].x, cy: layout.nodes[0].y });
      position(current.querySelector('text')!, { x: layout.centerLabel.x, y: layout.centerLabel.y });
      const plate = layout.centerLabel.box;
      position(current.querySelector('.label-plate')!, { x: plate.left, y: plate.top, width: plate.right - plate.left, height: plate.bottom - plate.top });
      for (const a of anchors) {
        const node = layout.nodes.find(n => n.url === a.getAttribute('href'));
        a.toggleAttribute('hidden', !node);
        if (!node?.label) continue;
        for (const circle of a.querySelectorAll('circle')) position(circle, { cx: node.x, cy: node.y });
        const { box, lines, x, y } = node.label;
        position(a.querySelector('rect')!, { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top });
        const label = a.querySelector('text')!;
        position(label, { x, y });
        label.replaceChildren(...lines.map((text, i) => {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          position(line, { x, dy: i ? 13 : 0 }); line.textContent = text; return line;
        }));
      }
      for (const line of svg.querySelectorAll<SVGLineElement>('line.edge')) {
        const index = layout.nodes.findIndex(n => n.url === line.dataset.neighbor);
        line.toggleAttribute('hidden', index < 1);
        if (index < 1) continue;
        const edge = layout.edges[index - 1];
        const points = edge.direction === 'both' ? offsetLine({ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }, line.classList.contains('is-out') ? 1 : -1) : edge;
        position(line, { x1: points.x1, y1: points.y1, x2: points.x2, y2: points.y2 });
      }
      const overflow = graph.querySelector<HTMLElement>('[data-graph-overflow]')!;
      const count = layout.nodes.length - 1;
      overflow.hidden = Number(graph.getAttribute('data-neighbor-count')) <= count;
      overflow.textContent = `가까운 연결 ${count}개만 그렸습니다. 전체 제목은 목록에서 확인할 수 있습니다.`;
    };
    resize();
    new ResizeObserver(resize).observe(svg);
  }
  const rows = [...document.querySelectorAll<HTMLAnchorElement>('.note-side .series-list a, .note-side a.series-hub')];
  const canHover = matchMedia('(hover: hover)').matches;
  for (const node of graph.querySelectorAll<SVGAElement>('a.node')) {
    const href = node.getAttribute('href');
    const pair: Element[] = [node, ...rows.filter((row) => row.getAttribute('href') === href)];
    const hovered = new Set<Element>();
    const focused = new Set<Element>();
    // 같은 노트의 다른 줄을 가리키거나 키보드 포커스가 남아 있으면 강조를 유지한다.
    const mark = () => { for (const element of pair) element.classList.toggle('is-linked', hovered.size > 0 || focused.size > 0); };
    for (const element of pair) {
      if (canHover) {
        element.addEventListener('mouseenter', () => { hovered.add(element); mark(); });
        element.addEventListener('mouseleave', () => { hovered.delete(element); mark(); });
      }
      element.addEventListener('focus', () => { focused.add(element); mark(); });
      element.addEventListener('blur', () => { focused.delete(element); mark(); });
    }
  }
}
