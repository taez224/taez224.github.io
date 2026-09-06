import { nodeRadius } from './layout.mjs';
import { topicColor, cleanTitle } from '../lib/format.mjs';
import { createGraphGesture } from './gestures.mjs';

export const MIN_SCALE = 0.65;
export const MAX_SCALE = 3.2;
const key = (s, t) => JSON.stringify([s, t]);

export function classifyEdges(edges, selected) {
  const set = new Set(edges.map((e) => key(e.source, e.target)));
  const result = [];
  const seenPair = new Set();
  for (const edge of edges) {
    const mutual = set.has(key(edge.target, edge.source));
    if (!selected) {
      const pair = JSON.stringify([edge.source, edge.target].sort());
      if (mutual && seenPair.has(pair)) continue;
      seenPair.add(pair);
      result.push({ source: edge.source, target: edge.target, state: 'idle', mutual, offset: 0 });
      continue;
    }
    const state = edge.source === selected ? 'out' : edge.target === selected ? 'in' : 'dim';
    result.push({ source: edge.source, target: edge.target, state, mutual, offset: mutual ? 1 : 0 });
  }
  return result;
}

export function labelIds(nodes, edges, { selected = null, hovered = null } = {}) {
  const ids = new Set();
  if (selected) {
    ids.add(selected);
    for (const edge of edges) {
      const other = edge.source === selected ? edge.target : edge.target === selected ? edge.source : null;
      if (other && nodes.find((n) => n.id === other)?.type === 'hub') ids.add(other);
    }
  } else {
    for (const node of nodes) {
      const title = cleanTitle(node.displayTitle ?? node.title ?? '');
      if (node.type === 'hub' || ((node.degree ?? 0) >= 9 && [...title].length <= 14)) ids.add(node.id);
    }
  }
  if (hovered) ids.add(hovered);
  return ids;
}

export function fitTransform(positions, { width, height, pad = 40 } = {}) {
  const points = [...positions.values()];
  if (!points.length) return { x: 0, y: 0, scale: 1 };
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const inset = Math.min(pad, Math.max(0, (width - 1) / 2), Math.max(0, (height - 1) / 2));
  const raw = Math.min((width - 2 * inset) / spanX, (height - 2 * inset) / spanY);
  const scale = points.length === 1 ? 1 : Math.min(MAX_SCALE, raw);
  return { scale, x: (width - spanX * scale) / 2 - minX * scale, y: (height - spanY * scale) / 2 - minY * scale };
}

export function offsetLine(a, b, sign, distance = 2.5) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * distance * sign, ny = (dx / d) * distance * sign;
  return { x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny };
}

export { nodeRadius, topicColor };

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYOUT = { width: 1000, height: 640 };

export function createGraph(svg, { nodes, edges, positions, mode = 'map', labelAll = false, labelLines = null, fitBounds = null, onSelect = () => {}, onOpen = () => {}, onHover = () => {} }) {
  const el = (name, attrs = {}) => { const node = document.createElementNS(SVG_NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); return node; };
  const size = () => ({ width: svg.clientWidth || LAYOUT.width, height: svg.clientHeight || LAYOUT.height });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = { selected: null, hovered: null, topics: null, transform: { x: 0, y: 0, scale: 1 } };
  const minScale = () => Math.min(MIN_SCALE, fitTransform(positions, size()).scale);
  const gesture = createGraphGesture({ getMinScale: minScale, maxScale: MAX_SCALE });
  const events = new AbortController();
  const listen = (type, handler, options = {}) => svg.addEventListener(type, handler, { ...options, signal: events.signal });
  const nodeEls = new Map();
  svg.classList.add('graph', mode);
  svg.replaceChildren();
  const scene = el('g', { 'data-scene': '' });
  const edgeLayer = el('g', { 'data-edges': '' }), nodeLayer = el('g', { 'data-nodes': '' }), labelLayer = el('g', { 'data-labels': '' });
  scene.append(edgeLayer, nodeLayer, labelLayer);
  svg.append(scene);

  const applyTransform = () => {
    const { width, height } = size();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    scene.setAttribute('transform', `translate(${state.transform.x.toFixed(1)} ${state.transform.y.toFixed(1)}) scale(${state.transform.scale.toFixed(3)})`);
  };
  const drawEdges = () => {
    edgeLayer.replaceChildren();
    for (const edge of classifyEdges(edges, state.selected)) {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      if (!a || !b) continue;
      const line = edge.offset ? offsetLine(a, b, edge.offset) : { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      const topicDim = state.topics && (!state.topics.has(byId.get(edge.source)?.topic) || !state.topics.has(byId.get(edge.target)?.topic));
      edgeLayer.append(el('line', { class: `edge is-${edge.state}${topicDim ? ' is-topic-dim' : ''}`, x1: line.x1.toFixed(1), y1: line.y1.toFixed(1), x2: line.x2.toFixed(1), y2: line.y2.toFixed(1) }));
    }
  };
  const drawNodes = () => {
    nodeLayer.replaceChildren(); nodeEls.clear();
    for (const node of nodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      const r = nodeRadius(node.degree ?? 0);
      const g = el('g', { class: 'node', 'data-id': node.id, tabindex: '0', role: 'button', 'aria-pressed': 'false', 'aria-label': cleanTitle(node.displayTitle ?? node.title) });
      if (node.type === 'hub') g.append(el('circle', { class: 'hub-ring', cx: p.x, cy: p.y, r: (r + 6).toFixed(1) }));
      g.append(el('circle', { class: 'hit', cx: p.x, cy: p.y, r: Math.max(22, r), fill: 'transparent' }));
      g.append(el('circle', { class: 'dot', cx: p.x, cy: p.y, r: r.toFixed(1), fill: topicColor(node.topic) }));
      g.append(el('circle', { class: 'select-ring', cx: p.x, cy: p.y, r: (r + 8).toFixed(1) }));
      nodeLayer.append(g); nodeEls.set(node.id, g);
    }
  };
  // 모든 제목을 보일 때는 가장자리 노드의 제목을 안쪽으로 붙여 화면 밖으로 잘리지 않게 한다.
  const xs = [...positions.values()].map((p) => p.x);
  const xLo = Math.min(...xs), xThird = (Math.max(...xs) - xLo) / 3;
  const anchorFor = (x) => (!labelAll ? 'middle' : x < xLo + xThird ? 'start' : x > xLo + 2 * xThird ? 'end' : 'middle');
  const drawLabels = () => {
    labelLayer.replaceChildren();
    const ids = labelAll ? nodes.map((node) => node.id) : labelIds(nodes, edges, state);
    for (const id of ids) {
      const node = byId.get(id), p = positions.get(id);
      if (!node || !p) continue;
      const r = nodeRadius(node.degree ?? 0), anchor = anchorFor(p.x);
      const x = anchor === 'start' ? p.x - r : anchor === 'end' ? p.x + r : p.x;
      const lines = labelLines?.get(id) ?? [cleanTitle(node.displayTitle ?? node.title)];
      const multiLine = Boolean(labelLines?.has(id));
      const lineHeight = 18;
      const labelX = multiLine ? (anchor === 'start' ? p.x + r + 8 : anchor === 'end' ? p.x - r - 8 : p.x) : x;
      const labelY = multiLine
        ? (anchor === 'middle' ? p.y + r + 18 : p.y - ((lines.length - 1) * lineHeight) / 2 + 5)
        : p.y + r + 18;
      const topicDim = state.topics && !state.topics.has(node.topic);
      const text = el('text', { class: `label${id === state.selected ? ' is-selected' : ''}${id === state.hovered ? ' is-hovered' : ''}${topicDim ? ' is-topic-dim' : ''}`, x: labelX.toFixed(1), y: labelY.toFixed(1), 'text-anchor': anchor });
      if (multiLine) lines.forEach((line, index) => { const tspan = el('tspan', { x: labelX.toFixed(1), dy: index === 0 ? 0 : lineHeight }); tspan.textContent = line; text.append(tspan); });
      else text.textContent = lines[0];
      labelLayer.append(text);
    }
  };
  const refreshNodeStates = () => {
    const neighbors = new Set();
    if (state.selected) for (const e of edges) { if (e.source === state.selected) neighbors.add(e.target); if (e.target === state.selected) neighbors.add(e.source); }
    for (const [id, g] of nodeEls) {
      const node = byId.get(id);
      const topicOut = state.topics && !state.topics.has(node.topic);
      const dim = topicOut || (state.selected && id !== state.selected && !neighbors.has(id));
      g.classList.toggle('is-dim', Boolean(dim));
      g.classList.toggle('is-selected', id === state.selected);
      g.classList.toggle('is-neighbor', neighbors.has(id));
      g.setAttribute('aria-pressed', String(id === state.selected));
    }
  };
  const render = () => { drawEdges(); refreshNodeStates(); drawLabels(); };

  const point = (event) => { const rect = svg.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const pointer = (event) => ({ id: event.pointerId, ...point(event), touch: event.pointerType === 'touch', onNode: Boolean(event.target.closest('.node')) });
  listen('pointerdown', (event) => { if (gesture.down(pointer(event), state.transform)) { svg.setPointerCapture?.(event.pointerId); svg.classList.add('is-panning'); } });
  listen('pointermove', (event) => { const next = gesture.move(pointer(event)); if (next) { state.transform = next; applyTransform(); } });
  const endPointer = (event) => { gesture.end(event.pointerId); if (!gesture.active()) svg.classList.remove('is-panning'); };
  listen('pointerup', endPointer);
  listen('pointercancel', endPointer);
  listen('click', (event) => {
    if (gesture.shouldSuppressClick()) return;
    const g = event.target.closest('.node');
    if (g) onSelect(g.dataset.id); else if (mode === 'map') onSelect(null);
  });
  listen('dblclick', (event) => { const g = event.target.closest('.node'); if (g) onOpen(g.dataset.id); });
  listen('keydown', (event) => {
    const g = event.target.closest('.node');
    if (!g) return;
    if (event.key === 'Enter') { event.preventDefault(); onOpen(g.dataset.id); }
    if (event.key === ' ') { event.preventDefault(); onSelect(g.dataset.id); }
  });
  listen('pointerover', (event) => { const g = event.target.closest('.node'); const id = g ? g.dataset.id : null; if (id !== state.hovered) { state.hovered = id; drawLabels(); onHover(id); } });
  listen('pointerleave', () => { if (state.hovered) { state.hovered = null; drawLabels(); onHover(null); } });
  if (mode === 'map') listen('wheel', (event) => { event.preventDefault(); api.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, point(event)); }, { passive: false });
  listen('focusin', (event) => { const g = event.target.closest('.node'); if (g) { state.hovered = g.dataset.id; drawLabels(); } });
  listen('focusout', () => { state.hovered = null; drawLabels(); });

  const api = {
    select(id) { state.selected = id && byId.has(id) ? id : null; render(); },
    hover(id) { state.hovered = id; drawLabels(); },
    setTopics(set) { state.topics = set; drawEdges(); refreshNodeStates(); drawLabels(); },
    fit() { state.transform = fitBounds ? { ...fitBounds } : fitTransform(positions, size()); applyTransform(); },
    zoom(factor, center) {
      const { width, height } = size();
      const c = center ?? { x: width / 2, y: height / 2 };
      const t = state.transform;
      const scale = Math.max(minScale(), Math.min(MAX_SCALE, t.scale * factor));
      const ratio = scale / t.scale;
      state.transform = { scale, x: c.x - (c.x - t.x) * ratio, y: c.y - (c.y - t.y) * ratio };
      applyTransform();
    },
    selected: () => state.selected,
    destroy() {
      events.abort();
      for (const id of gesture.ids()) { if (svg.hasPointerCapture?.(id)) svg.releasePointerCapture(id); gesture.end(id); }
      svg.replaceChildren(); svg.classList.remove('graph', mode, 'is-panning');
    }
  };
  drawNodes(); render(); api.fit();
  return api;
}
