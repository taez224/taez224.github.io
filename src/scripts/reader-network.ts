import { layoutGraph } from '../graph/layout.ts';
import { orientReaderLabels } from '../graph/reader-labels.ts';

interface ReaderNode { id: string; topic: string }
interface ReaderData { center: string; nodes: ReaderNode[]; edges: { source: string; target: string }[] }

// 빌드 때 출력한 링크를 그대로 배치한다. 스크립트가 없으면 전체 제목 목록이 남는다.
function renderReaderNeighborhood(wrap: HTMLElement, data: ReaderData) {
  const svg = wrap.querySelector<SVGSVGElement>('svg')!;
  const elements = new Map([...wrap.querySelectorAll<HTMLElement>('[data-node]')].map(el => [el.dataset.node!, el]));
  const nodes = data.nodes.map(n => ({ ...n, current: n.id === data.center, element: elements.get(n.id)!, x: 0, y: 0, w: 0, h: 0 }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  // 글 끝에서는 연결의 존재만 표시한다. 참조 방향의 구별은 전체 지도에 남긴다.
  const edges = data.edges.map(e => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const direct = e.source === data.center || e.target === data.center;
    line.setAttribute('class', `network-edge${direct ? ' direct-edge' : ''}`);
    line.dataset.source = e.source; line.dataset.target = e.target;
    svg.append(line);
    return { ...e, line };
  });
  let previousWidth = 0;
  function draw() {
    const width = wrap.clientWidth;
    if (!width || width === previousWidth) return;
    previousWidth = width;
    const fontScale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    const list = width < 560 * fontScale;
    wrap.classList.toggle('compact-network', list);
    if (list) {
      wrap.style.height = '';
      for (const n of nodes) { n.element.style.width = ''; n.element.style.height = ''; n.element.style.left = ''; n.element.style.top = ''; delete n.element.dataset.labelPlacement; }
      return;
    }
    const height = Math.max(440, Math.ceil(nodes.length / 3) * 135) * fontScale;
    wrap.style.height = `${height}px`;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const positions = layoutGraph(data.nodes, data.edges, { width, height, pad: 90 });
    for (const n of nodes) {
      delete n.element.dataset.labelPlacement;
      n.element.style.height = '';
      n.element.style.width = `${n.current ? 64 * fontScale : Math.min(208 * fontScale, (width - 48) / 3)}px`;
      n.w = n.element.offsetWidth; n.h = n.element.offsetHeight;
      const p = positions.get(n.id)!; n.x = p.x; n.y = p.y;
    }
    // 실제 연결로 배치한 뒤, 줄바꿈한 제목 상자가 겹치는 만큼만 노드를 밀어낸다.
    for (let step = 0; step < 300; step++) {
      let overlaps = 0;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x || 1, dy = b.y - a.y || 1;
        const ox = (a.w + b.w) / 2 + 12 - Math.abs(dx), oy = (a.h + b.h) / 2 + 24 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        overlaps++;
        if (ox < oy) { const shift = Math.sign(dx) * (ox / 2 + .1); a.x -= shift; b.x += shift; }
        else { const shift = Math.sign(dy) * (oy / 2 + .1); a.y -= shift; b.y += shift; }
      }
      for (const n of nodes) {
        n.x = Math.max(n.w / 2 + 4, Math.min(width - n.w / 2 - 4, n.x));
        n.y = Math.max(n.h / 2 + 10, Math.min(height - n.h / 2 - 10, n.y));
      }
      if (!overlaps) break;
    }
    // 제한된 무대 안에서 밀어내기가 수렴하지 않으면 남은 상자만 아래로 옮긴다.
    // 글자뿐 아니라 링크의 누르는 영역도 겹치지 않아야 한다.
    const settled: typeof nodes = [];
    for (const n of [...nodes].sort((a, b) => a.y - b.y)) {
      for (const above of [...settled].sort((a, b) => a.y + a.h / 2 - b.y - b.h / 2)) {
        if (Math.abs(n.x - above.x) < (n.w + above.w) / 2 + 12 &&
            n.y - n.h / 2 < above.y + above.h / 2 + 24 && n.y + n.h / 2 > above.y - above.h / 2 - 24) {
          n.y = above.y + (above.h + n.h) / 2 + 24;
        }
      }
      settled.push(n);
    }
    const fittedHeight = Math.max(height, ...nodes.map(n => n.y + n.h / 2 + 10));
    wrap.style.height = `${fittedHeight}px`;
    svg.setAttribute('viewBox', `0 0 ${width} ${fittedHeight}`);
    for (const n of nodes) { n.element.style.left = `${n.x - n.w / 2}px`; n.element.style.top = `${n.y - n.h / 2}px`; }
    const frame = wrap.getBoundingClientRect();
    const measured = nodes.map(n => {
      n.element.style.height = `${n.h}px`;
      const variants = (['below', 'above', 'right', 'left'] as const).flatMap(placement => {
        n.element.dataset.labelPlacement = placement;
        const dot = n.element.querySelector('i')!.getBoundingClientRect();
        const title = n.element.querySelector('.network-title')!.getBoundingClientRect();
        // 가로 배치에서 줄 수가 늘어 예약한 높이를 넘으면 그 후보는 쓰지 않는다.
        if (title.height > n.h - 10) return [];
        return [{ placement, point: { x: dot.x + dot.width / 2 - frame.x, y: dot.y + dot.height / 2 - frame.y },
          box: { left: title.left - frame.x, right: title.right - frame.x, top: title.top - frame.y, bottom: title.bottom - frame.y } }];
      });
      return { id: n.id, variants };
    });
    const placements = orientReaderLabels(measured, data.edges);
    const pointsById = new Map(measured.map(n => {
      const placement = placements.get(n.id)!;
      byId.get(n.id)!.element.dataset.labelPlacement = placement;
      return [n.id, n.variants.find(v => v.placement === placement)!.point];
    }));
    for (const e of edges) {
      const a = pointsById.get(e.source)!, b = pointsById.get(e.target)!;
      const points = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      for (const [key, value] of Object.entries(points)) e.line.setAttribute(key, String(value));
    }
  }
  const show = (id: string | null) => {
    if (wrap.classList.contains('compact-network')) id = null;
    const related = new Set([id]);
    for (const e of edges) if (e.source === id || e.target === id) { related.add(e.source); related.add(e.target); }
    for (const e of edges) { e.line.classList.toggle('active-edge', id !== null && (e.source === id || e.target === id)); e.line.classList.toggle('muted-edge', id !== null && !(e.source === id || e.target === id)); }
    for (const n of nodes) n.element.classList.toggle('muted-note', id !== null && !related.has(n.id));
  };
  for (const n of nodes) {
    n.element.addEventListener('focus', () => show(n.id));
    n.element.addEventListener('blur', () => show(null));
    if (matchMedia('(hover: hover)').matches) {
      n.element.addEventListener('mouseenter', () => show(n.id));
      n.element.addEventListener('mouseleave', () => show(null));
    }
  }
  new ResizeObserver(draw).observe(wrap);
  document.fonts.ready.then(() => { previousWidth = 0; draw(); });
  draw();
}

for (const wrap of document.querySelectorAll<HTMLElement>('[data-reader-network]')) {
  const source = wrap.querySelector('[data-reader-network-data]');
  if (source) renderReaderNeighborhood(wrap, JSON.parse(source.textContent!) as ReaderData);
}
