import { nodeRadius } from './layout.mjs';
import { topicColor, cleanTitle } from '../lib/format.mjs';
import { createGraphGesture } from './gestures.mjs';
import { graphTitleLines } from './focus.mjs';

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

// 범례 필터(주제 집합, 허브만)에 걸려 흐려질 노드인지. 선택된 노드는 호출 쪽에서 제외한다.
export function isFilteredOut(node, { topics = null, hubsOnly = false } = {}) {
  if (!node) return false;
  if (topics && !topics.has(node.topic)) return true;
  if (hubsOnly && node.type !== 'hub') return true;
  return false;
}

// 13px 기준 글자 폭 어림. 한글 12.5, 영숫자 7.2, 그 외 4.5.
export function estimateTextWidth(line, fontSize = 13) {
  return [...line].reduce((sum, ch) => sum + (/[\u3131-\uD79D]/.test(ch) ? 12.5 : /[A-Za-z0-9]/.test(ch) ? 7.2 : 4.5), 0) * (fontSize / 13);
}
// 이 배율부터는 자리가 나는 만큼 제목을 더 보인다(허브 → 연결 많은 순, 겹치지 않는 것만).
export const LABEL_REVEAL_SCALE = 1.2;

// 20자를 넘는 제목은 두 줄로 접는다. 줄 길이를 절반 근처로 잡아 두 줄이 비슷하게 나뉘게 한다.
export function wrapLabel(title, maxChars = 20) {
  const chars = [...title];
  if (chars.length <= maxChars) return [title];
  let limit = Math.ceil(chars.length / 2) + 2;
  let lines = graphTitleLines(title, limit);
  while (lines.length > 2 && limit < chars.length) { limit += 3; lines = graphTitleLines(title, limit); }
  return lines;
}

export function createGraph(svg, { nodes, edges, positions, mode = 'map', labelAll = false, labelLines = null, labelAnchor = 'auto', fitBounds = null, nodeScale = 1, onSelect = () => {}, onOpen = () => {}, onHover = () => {} }) {
  // nodeScale: 노드 원 크기 배율. 지도는 무대가 좁아 0.85로 그려 홈과 밀도를 맞춘다.
  const radius = (node) => nodeRadius(node.degree ?? 0, nodeScale);
  const el = (name, attrs = {}) => { const node = document.createElementNS(SVG_NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); return node; };
  const size = () => ({ width: svg.clientWidth || LAYOUT.width, height: svg.clientHeight || LAYOUT.height });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = { selected: null, hovered: null, topics: null, hubsOnly: false, transform: { x: 0, y: 0, scale: 1 } };
  // 필터는 선택된 노드를 흐리지 않는다. 선택 + 필터는 "이 노드의 연결 중 이 주제"를 뜻한다.
  const outOfFilter = (id) => id !== state.selected && isFilteredOut(byId.get(id), state);
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

  // 선택한 노드로 부드럽게 이동·확대. 드래그가 시작되면 애니메이션을 끊는다.
  let animation = null;
  const stopAnimation = () => { if (animation) cancelAnimationFrame(animation); animation = null; };
  const animateTo = (target, duration = 320) => {
    stopAnimation();
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { state.transform = target; applyTransform(); return; }
    const from = { ...state.transform }, start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration), e = 1 - (1 - k) ** 3;
      state.transform = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, scale: from.scale + (target.scale - from.scale) * e };
      applyTransform();
      animation = k < 1 ? requestAnimationFrame(step) : null;
    };
    animation = requestAnimationFrame(step);
  };
  // 제목은 확대해도 화면에서 같은 크기를 유지한다. 배율이 바뀌면 제목만 다시 그린다.
  let labelScale = 1;
  const applyTransform = () => {
    const { width, height } = size();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    scene.setAttribute('transform', `translate(${state.transform.x.toFixed(1)} ${state.transform.y.toFixed(1)}) scale(${state.transform.scale.toFixed(3)})`);
    if (Math.abs(state.transform.scale - labelScale) > 0.005) { labelScale = state.transform.scale; drawLabels(); }
  };
  const drawEdges = () => {
    edgeLayer.replaceChildren();
    for (const edge of classifyEdges(edges, state.selected)) {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      if (!a || !b) continue;
      const line = edge.offset ? offsetLine(a, b, edge.offset) : { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      const topicDim = outOfFilter(edge.source) || outOfFilter(edge.target);
      edgeLayer.append(el('line', { class: `edge is-${edge.state}${topicDim ? ' is-topic-dim' : ''}`, x1: line.x1.toFixed(1), y1: line.y1.toFixed(1), x2: line.x2.toFixed(1), y2: line.y2.toFixed(1) }));
    }
  };
  const drawNodes = () => {
    nodeLayer.replaceChildren(); nodeEls.clear();
    for (const node of nodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      const r = radius(node);
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
  const anchorFor = (x) => (!labelAll || labelAnchor === 'middle' ? 'middle' : x < xLo + xThird ? 'start' : x > xLo + 2 * xThird ? 'end' : 'middle');
  // 제목 배치 계획. 우선순위(선택 → 호버 → 허브 → 연결 많은 순)대로 아래·위·오른쪽·왼쪽 네 자리를 시도해
  // 이미 놓인 제목이나 노드 원과 겹치지 않는 첫 자리를 준다. 기본 집합(선택·호버·허브)은 자리가 없어도 아래에 둔다.
  // 나머지는 1.2배 이상 확대했거나 선택 상태일 때, 자리가 날 때만 보인다. 흐려진 노드는 제외.
  const PLACEMENTS = ['below', 'above', 'right', 'left'];
  const labelGeometry = (node, p, lines, placement, u) => {
    const r = radius(node), lh = 18 * u, gap = 8 * u;
    const w = Math.max(...lines.map((line) => estimateTextWidth(line))) * u, h = lines.length * lh;
    const mid = p.y - ((lines.length - 1) * lh) / 2 + 5 * u;
    if (placement === 'above') return { x: p.x, y: p.y - r - gap - (lines.length - 1) * lh, anchor: 'middle', box: { left: p.x - w / 2, right: p.x + w / 2, top: p.y - r - gap - h + 4 * u, bottom: p.y - r - gap + 4 * u } };
    if (placement === 'right') return { x: p.x + r + gap, y: mid, anchor: 'start', box: { left: p.x + r + gap, right: p.x + r + gap + w, top: p.y - h / 2, bottom: p.y + h / 2 } };
    if (placement === 'left') return { x: p.x - r - gap, y: mid, anchor: 'end', box: { left: p.x - r - gap - w, right: p.x - r - gap, top: p.y - h / 2, bottom: p.y + h / 2 } };
    return { x: p.x, y: p.y + r + 18 * u, anchor: 'middle', box: { left: p.x - w / 2, right: p.x + w / 2, top: p.y + r + 5 * u, bottom: p.y + r + 5 * u + h } };
  };
  const planLabels = (u) => {
    // 호버는 계획에서 뺀다. 호버할 때마다 우선순위가 바뀌어 남의 제목까지 움직이면 안 된다.
    const base = [...labelIds(nodes, edges, { selected: state.selected, hovered: null })];
    const scale = state.transform.scale || 1;
    const neighbors = new Set();
    if (state.selected) for (const e of edges) { if (e.source === state.selected) neighbors.add(e.target); if (e.target === state.selected) neighbors.add(e.source); }
    const dimmed = (id) => outOfFilter(id) || Boolean(state.selected && id !== state.selected && !neighbors.has(id));
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    // 흐려지지 않은 노드 원도 장애물이다. 제목이 다른 노드 위에 얹히지 않게.
    const obstacles = nodes.filter((node) => !dimmed(node.id) && positions.has(node.id)).map((node) => { const p = positions.get(node.id), r = radius(node) + 2 * u; return { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r }; });
    const placed = [], plan = new Map();
    const tryPlace = (node, mustPlace) => {
      const p = positions.get(node.id); if (!p) return;
      const lines = wrapLabel(cleanTitle(node.displayTitle ?? node.title));
      for (const placement of PLACEMENTS) {
        const g = labelGeometry(node, p, lines, placement, u);
        if (placed.some((b) => overlaps(b, g.box)) || obstacles.some((b) => overlaps(b, g.box))) continue;
        placed.push(g.box); plan.set(node.id, placement); return;
      }
      if (mustPlace) { placed.push(labelGeometry(node, p, lines, 'below', u).box); plan.set(node.id, 'below'); }
    };
    const priority = (id) => (id === state.selected ? 0 : 1);
    for (const id of base.sort((a, b) => priority(a) - priority(b))) { const node = byId.get(id); if (node) tryPlace(node, true); }
    if (scale >= LABEL_REVEAL_SCALE || state.selected) {
      const rest = nodes.filter((node) => !plan.has(node.id) && !dimmed(node.id)).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
      for (const node of rest) tryPlace(node, false);
    }
    // 호버한 노드는 이미 자리가 있으면 그대로 두고, 숨어 있던 노드면 그때만 빈자리(없으면 아래)에 얹는다. 맨 위에 그려지므로 겹쳐도 읽힌다.
    if (state.hovered && !plan.has(state.hovered)) { const node = byId.get(state.hovered); if (node) tryPlace(node, true); }
    return plan;
  };
  const drawLabels = () => {
    labelLayer.replaceChildren();
    // u = 화면 1px에 해당하는 장면 좌표. 글자 크기·줄 간격·노드와의 간격을 화면 기준으로 고정한다.
    const u = 1 / (state.transform.scale || 1);
    labelLayer.style.fontSize = `${(13 * u).toFixed(2)}px`;
    labelLayer.style.strokeWidth = `${(4.5 * u).toFixed(2)}px`;
    if (!labelAll) {
      for (const [id, placement] of planLabels(u)) {
        const node = byId.get(id), p = positions.get(id);
        const lines = wrapLabel(cleanTitle(node.displayTitle ?? node.title));
        const g = labelGeometry(node, p, lines, placement, u);
        const topicDim = outOfFilter(id);
        const text = el('text', { class: `label${id === state.selected ? ' is-selected' : ''}${id === state.hovered ? ' is-hovered' : ''}${topicDim ? ' is-topic-dim' : ''}`, 'data-for': id, x: g.x.toFixed(1), y: g.y.toFixed(1), 'text-anchor': g.anchor });
        lines.forEach((line, index) => { const tspan = el('tspan', { x: g.x.toFixed(1), dy: index === 0 ? 0 : (18 * u).toFixed(1) }); tspan.textContent = line; text.append(tspan); });
        labelLayer.append(text);
      }
    }
    const ids = labelAll ? nodes.map((node) => node.id) : [];
    for (const id of ids) {
      const node = byId.get(id), p = positions.get(id);
      if (!node || !p) continue;
      const r = radius(node), anchor = anchorFor(p.x);
      const x = anchor === 'start' ? p.x - r : anchor === 'end' ? p.x + r : p.x;
      const lines = labelLines?.get(id) ?? wrapLabel(cleanTitle(node.displayTitle ?? node.title));
      const multiLine = lines.length > 1 || Boolean(labelLines?.has(id));
      const lineHeight = 18 * u;
      const labelX = multiLine ? (anchor === 'start' ? p.x + r + 8 * u : anchor === 'end' ? p.x - r - 8 * u : p.x) : x;
      const labelY = multiLine
        ? (anchor === 'middle' ? p.y + r + 18 * u : p.y - ((lines.length - 1) * lineHeight) / 2 + 5 * u)
        : p.y + r + 18 * u;
      const topicDim = outOfFilter(id);
      const text = el('text', { class: `label${id === state.selected ? ' is-selected' : ''}${id === state.hovered ? ' is-hovered' : ''}${topicDim ? ' is-topic-dim' : ''}`, 'data-for': id, x: labelX.toFixed(1), y: labelY.toFixed(1), 'text-anchor': anchor });
      if (multiLine) lines.forEach((line, index) => { const tspan = el('tspan', { x: labelX.toFixed(1), dy: index === 0 ? 0 : lineHeight.toFixed(1) }); tspan.textContent = line; text.append(tspan); });
      else text.textContent = lines[0];
      labelLayer.append(text);
    }
    // 호버·선택한 제목은 다른 제목의 테두리에 가리지 않게 맨 위로 올린다.
    for (const id of [state.selected, state.hovered]) { const text = id && labelLayer.querySelector(`[data-for="${CSS.escape(id)}"]`); if (text) labelLayer.append(text); }
  };
  const refreshNodeStates = () => {
    const neighbors = new Set();
    if (state.selected) for (const e of edges) { if (e.source === state.selected) neighbors.add(e.target); if (e.target === state.selected) neighbors.add(e.source); }
    for (const [id, g] of nodeEls) {
      const node = byId.get(id);
      const topicOut = outOfFilter(id);
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
  listen('pointerdown', (event) => { stopAnimation(); if (gesture.down(pointer(event), state.transform)) { svg.setPointerCapture?.(event.pointerId); svg.classList.add('is-panning'); } });
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
    setFilter({ topics = state.topics, hubsOnly = state.hubsOnly } = {}) { state.topics = topics; state.hubsOnly = hubsOnly; drawEdges(); refreshNodeStates(); drawLabels(); },
    setTopics(set) { api.setFilter({ topics: set }); },
    has: (id) => byId.has(id),
    view: () => ({ ...state.transform }),
    moveTo(target) { animateTo(target); },
    fit(animate = false) { const target = fitBounds ? { ...fitBounds } : fitTransform(positions, size()); if (animate) animateTo(target); else { stopAnimation(); state.transform = target; applyTransform(); } },
    // 노드를 무대 가운데로 옮기고, 맞춤 배율의 zoom배까지 키운다(이미 더 크면 유지).
    focusOn(id, { zoom = 1.35 } = {}) {
      const p = positions.get(id); if (!p) return;
      const { width, height } = size();
      const fitScale = fitBounds ? fitBounds.scale : fitTransform(positions, size()).scale;
      const scale = Math.min(MAX_SCALE, Math.max(state.transform.scale, fitScale * zoom));
      animateTo({ scale, x: width / 2 - p.x * scale, y: height / 2 - p.y * scale });
    },
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
      stopAnimation();
      events.abort();
      for (const id of gesture.ids()) { if (svg.hasPointerCapture?.(id)) svg.releasePointerCapture(id); gesture.end(id); }
      svg.replaceChildren(); svg.classList.remove('graph', mode, 'is-panning');
    }
  };
  drawNodes(); render(); api.fit();
  return api;
}
