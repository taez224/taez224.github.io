import { nodeRadius } from './layout.mjs';
import { topicColor, cleanTitle } from '../lib/format.mjs';
import { createGraphGesture } from './gestures.mjs';
import { estimateTextWidth, labelIds, wrapLabel, placeLabels, nodeBox } from './label.mjs';
import { topicRegions, regionPath, placeRegionLabels, regionLabelBox } from './regions.mjs';

const MIN_SCALE = 0.65;
const MAX_SCALE = 3.2;
const key = (s, t) => JSON.stringify([s, t]);

export function classifyEdges(edges, selected) {
  const set = new Set(edges.map((e) => key(e.source, e.target)));
  const result = [];
  const seenPair = new Set();
  for (const edge of edges) {
    const mutual = set.has(key(edge.target, edge.source));
    const touches = Boolean(selected) && (edge.source === selected || edge.target === selected);
    // 기준 노드에 닿지 않는 상호 참조 쌍은 선 하나로 합친다. 벌려 그리는 건 방향을 보여 줄 때뿐이다.
    if (!touches) {
      const pair = JSON.stringify([edge.source, edge.target].sort());
      if (mutual && seenPair.has(pair)) continue;
      seenPair.add(pair);
      result.push({ source: edge.source, target: edge.target, state: selected ? 'dim' : 'idle', mutual, offset: 0 });
      continue;
    }
    const state = edge.source === selected ? 'out' : 'in';
    result.push({ source: edge.source, target: edge.target, state, mutual, offset: mutual ? 1 : 0 });
  }
  return result;
}

export function hoverLabelCandidates(nodes, edges, hovered) {
  const neighbors = new Set();
  for (const edge of edges) {
    if (edge.source === hovered) neighbors.add(edge.target);
    if (edge.target === hovered) neighbors.add(edge.source);
  }
  return nodes.filter((node) => node.id !== hovered && node.type !== 'hub' && neighbors.has(node.id))
    .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
}

export function fitTransform(positions, { width, height, pad = 40 } = {}) {
  const points = [...positions.values()];
  if (!points.length) return { x: 0, y: 0, scale: 1 };
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const inset = Math.min(pad, Math.max(0, (width - 1) / 2), Math.max(0, (height - 1) / 2));
  const raw = Math.min((width - 2 * inset) / spanX, (height - 2 * inset) / spanY);
  // 상자가 아직 크기를 못 받았으면(폭·높이 0) 배율이 0이 되고 그 뒤 나누기에서 NaN이 퍼진다. 그때는 배율을 두지 않는다.
  const scale = points.length === 1 || !(raw > 0) ? 1 : Math.min(MAX_SCALE, raw);
  return { scale, x: (width - spanX * scale) / 2 - minX * scale, y: (height - spanY * scale) / 2 - minY * scale };
}

export function offsetLine(a, b, sign, distance = 2.5) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * distance * sign, ny = (dx / d) * distance * sign;
  return { x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYOUT = { width: 1000, height: 640 };

// 범례 필터(주제 집합, 허브만)에 걸려 흐려질 노드인지. 선택된 노드는 호출 쪽에서 제외한다.
export function isFilteredOut(node, { topics = null, hubsOnly = false } = {}) {
  if (!node) return false;
  if (topics && !topics.has(node.topic)) return true;
  if (hubsOnly && node.type !== 'hub') return true;
  return false;
}

// 이 배율부터는 자리가 나는 만큼 제목을 더 보인다(허브 → 연결 많은 순, 겹치지 않는 것만).
const LABEL_REVEAL_SCALE = 1.2;
// 평소 배율에서도 연결 많은 순으로 이만큼은 자리가 나면 제목을 보인다. 허브만 남기면 가장 연결 많은 노트가 점으로만 보인다.
const RESTING_LABEL_LIMIT = 6;

// layoutSize: 좌표가 놓인 무대 크기. 홈 히어로처럼 좌표 공간(1000×640)과 상자 픽셀 크기가 다를 때 준다. 지도는 상자 크기로 배치하므로 생략한다.
export function createGraph(svg, { nodes, edges, positions, mode = 'map', nodeScale = 1, focusable = true, layoutSize = null, onSelect = () => {}, onOpen = () => {} }) {
  // nodeScale: 노드 원 크기 배율. 지도는 무대가 좁아 0.7, 홈 히어로는 0.9로 그려 밀도를 맞춘다.
  const radius = (node) => nodeRadius(node.degree ?? 0, nodeScale);
  const el = (name, attrs = {}) => { const node = document.createElementNS(SVG_NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); return node; };
  const size = () => ({ width: svg.clientWidth || LAYOUT.width, height: svg.clientHeight || LAYOUT.height });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = { selected: null, hovered: null, topics: null, hubsOnly: false, transform: { x: 0, y: 0, scale: 1 } };
  // 필터는 선택된 노드를 흐리지 않는다. 선택 + 필터는 "이 노드의 연결 중 이 주제"를 뜻한다.
  const outOfFilter = (id) => id !== state.selected && isFilteredOut(byId.get(id), state);
  const minScale = () => Math.min(MIN_SCALE, fitTransform(positions, size()).scale);
  const gesture = createGraphGesture({ getMinScale: minScale, maxScale: MAX_SCALE });
  const listen = (type, handler, options) => svg.addEventListener(type, handler, options);
  const nodeEls = new Map();
  svg.classList.add('graph', mode);
  svg.replaceChildren();
  const scene = el('g');
  const regionLayer = el('g', { 'data-regions': '' }), regionLabelLayer = el('g', { 'data-region-labels': '' });
  const edgeLayer = el('g'), nodeLayer = el('g'), labelLayer = el('g', { 'data-labels': '' });
  scene.append(regionLayer, regionLabelLayer, edgeLayer, nodeLayer, labelLayer);
  // 주제 영역은 배치가 정해지면 고정이다. 색면은 장면 좌표(확대하면 같이 커짐), 이름은 제목처럼 화면 크기 고정.
  const regionList = topicRegions(nodes, positions);
  // 영역 이름 자리는 배치 때 한 번 정한다. 노드 원을 피하고 무대 안에 둔다. 노드 제목은 planLabels가 영역 이름을 장애물로 보고 피한다.
  const regionLabelAt = placeRegionLabels(regionList, nodes.filter((node) => positions.has(node.id)).map((node) => ({ ...positions.get(node.id), r: radius(node) + 4 })), { fontSize: 15, measure: estimateTextWidth, bounds: layoutSize ?? size() });
  const regionLabelBoxes = (u) => regionList.map((region) => regionLabelBox(regionLabelAt.get(region.topic), region.topic, { fontSize: 15, measure: estimateTextWidth, scale: u }));
  const regionEls = new Map();
  const refreshRegionStates = () => {
    const filtering = mode === 'map' && Boolean(state.topics?.size);
    svg.classList.toggle('has-topic-filter', filtering);
    for (const [topic, elements] of regionEls) {
      const active = filtering && state.topics.has(topic);
      for (const element of elements) {
        element.classList.toggle('is-topic-active', active);
        element.classList.toggle('is-topic-dim', filtering && !active);
      }
    }
  };
  const drawRegions = () => {
    regionLayer.replaceChildren();
    regionLabelLayer.replaceChildren();
    regionEls.clear();
    for (const region of regionList) {
      const shape = el('path', { class: 'region', d: regionPath(region.hull), fill: topicColor(region.topic), stroke: topicColor(region.topic) });
      const at = regionLabelAt.get(region.topic);
      const label = el('text', { class: 'region-label', x: at.x.toFixed(1), y: at.y.toFixed(1), 'text-anchor': at.anchor, fill: topicColor(region.topic) });
      label.textContent = region.topic;
      regionLayer.append(shape); regionLabelLayer.append(label);
      regionEls.set(region.topic, [shape, label]);
    }
    refreshRegionStates();
  };
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
    // 선택이 없으면 호버가 예고편이다. 호버한 노드의 간선만 방향 있게 켜고 나머지는 흐리지 않는다.
    // 호버 예고편(간선 방향 + 나머지 흐림)은 지도에서만. 홈 히어로는 호버해도 제목만 보인다.
    const hoverRef = mode === 'map' ? state.hovered : null;
    const preview = !state.selected && hoverRef;
    for (const raw of classifyEdges(edges, state.selected ?? hoverRef)) {
      const edge = preview && raw.state === 'dim' ? { ...raw, state: 'faint' } : raw;
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
      const g = el('g', { class: `node${node.isEntry ? ' is-entry' : ''}`, 'data-id': node.id, tabindex: focusable ? '0' : '-1', role: 'button', 'aria-pressed': 'false', 'aria-label': cleanTitle(node.displayTitle ?? node.title) });
      if (node.isEntry) g.append(el('circle', { class: 'entry-halo', cx: p.x, cy: p.y, r: (r + 11).toFixed(1) }));
      if (node.type === 'hub') g.append(el('circle', { class: 'hub-ring', cx: p.x, cy: p.y, r: (r + 7).toFixed(1) }));
      g.append(el('circle', { class: 'hit', cx: p.x, cy: p.y, r: Math.max(22, r), fill: 'transparent' }));
      g.append(el('circle', { class: 'dot', cx: p.x, cy: p.y, r: r.toFixed(1), fill: topicColor(node.topic) }));
      g.append(el('circle', { class: 'select-ring', cx: p.x, cy: p.y, r: (r + 8).toFixed(1) }));
      nodeLayer.append(g); nodeEls.set(node.id, g);
    }
  };
  // 제목 배치 계획. 우선순위(선택 → 호버 → 허브 → 연결 많은 순)로 placeLabels에 넘긴다. 기본 집합(선택·호버·허브)은 자리가 없어도 아래에 둔다.
  // 나머지는 1.2배 이상 확대했거나 선택 상태일 때, 자리가 날 때만 보인다. 흐려진 노드는 제외.
  const planLabels = (u) => {
    // 선택 전 호버는 허브를 남기고 해당 노드의 이웃 제목을 미리 보여준다.
    const preview = mode === 'map' && !state.selected && state.hovered && !outOfFilter(state.hovered)
      ? state.hovered : null;
    const base = preview
      ? [...new Set([preview, ...nodes.filter((node) => node.type === 'hub' && !outOfFilter(node.id)).map((node) => node.id)])]
      : [...labelIds(nodes, edges, { selected: state.selected, hovered: null })];
    const scale = state.transform.scale || 1;
    const neighbors = new Set();
    if (state.selected) for (const e of edges) { if (e.source === state.selected) neighbors.add(e.target); if (e.target === state.selected) neighbors.add(e.source); }
    const dimmed = (id) => outOfFilter(id) || Boolean(state.selected && id !== state.selected && !neighbors.has(id));
    // 흐려지지 않은 노드 원과 영역 이름은 장애물이다. 제목이 그 위에 얹히지 않게.
    const obstacles = nodes.filter((node) => !dimmed(node.id) && positions.has(node.id)).map((node) => nodeBox(positions.get(node.id), radius(node) + 2 * u));
    obstacles.push(...regionLabelBoxes(u));
    // 화면 밖으로 나가는 자리는 쓰지 않는다(장면 좌표로 환산한 무대 범위).
    const { width: vw, height: vh } = size();
    const view = { left: -state.transform.x * u, top: -state.transform.y * u, right: (vw - state.transform.x) * u, bottom: (vh - state.transform.y) * u };
    const inside = (b) => b.left >= view.left && b.right <= view.right && b.top >= view.top && b.bottom <= view.bottom;
    const priority = (id) => (id === (state.selected || preview) ? 0 : 1);
    const baseSet = new Set(base);
    const order = base.sort((a, b) => priority(a) - priority(b)).map((id) => byId.get(id)).filter(Boolean).map((node) => ({ node, mustPlace: true }));
    // 홈 히어로(hero 모드)는 허브·호버만 보인다. 자리 채우기는 지도에서만: 평소에는 연결 많은 순으로 몇 개, 확대하거나 선택하면 자리가 나는 만큼 전부.
    if (mode === 'map') {
      const candidates = preview ? hoverLabelCandidates(nodes, edges, preview) : nodes;
      const rest = candidates.filter((node) => !baseSet.has(node.id) && !dimmed(node.id)).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
      const reveal = preview || scale >= LABEL_REVEAL_SCALE || state.selected;
      order.push(...(reveal ? rest : rest.slice(0, RESTING_LABEL_LIMIT)).map((node) => ({ node, mustPlace: false })));
    }
    // 호버한 노드는 이미 자리가 있으면 그대로 두고, 숨어 있던 노드면 그때만 빈자리(없으면 아래)에 얹는다. 맨 위에 그려지므로 겹쳐도 읽힌다.
    if (state.hovered) { const node = byId.get(state.hovered); if (node) order.push({ node, mustPlace: true }); }
    return placeLabels(order, { positions, radius, u, obstacles, inside, labelGap: mode === 'map' && (state.selected || preview) ? 8 : 0 });
  };
  const drawLabels = () => {
    labelLayer.replaceChildren();
    // u = 화면 1px에 해당하는 장면 좌표. 글자 크기·줄 간격·노드와의 간격을 화면 기준으로 고정한다.
    const u = 1 / (state.transform.scale || 1);
    labelLayer.style.fontSize = `${(13 * u).toFixed(2)}px`;
    labelLayer.style.strokeWidth = `${(4.5 * u).toFixed(2)}px`;
    // 영역 이름은 재생성하지 않아 필터 전환 중에도 자리를 지키며 농도만 바뀐다.
    regionLabelLayer.style.fontSize = `${(15 * u).toFixed(2)}px`;
    regionLabelLayer.style.strokeWidth = `${(3.5 * u).toFixed(2)}px`;
    for (const [id, { lines, g }] of planLabels(u)) {
      const node = byId.get(id);
      const topicDim = outOfFilter(id);
      const text = el('text', { class: `label${node.isEntry ? ' is-entry' : ''}${id === state.selected ? ' is-selected' : ''}${id === state.hovered ? ' is-hovered' : ''}${topicDim ? ' is-topic-dim' : ''}`, 'data-for': id, x: g.x.toFixed(1), y: g.y.toFixed(1), 'text-anchor': g.anchor });
      lines.forEach((line, index) => { const tspan = el('tspan', { x: g.x.toFixed(1), dy: index === 0 ? 0 : (18 * u).toFixed(1) }); tspan.textContent = line; text.append(tspan); });
      labelLayer.append(text);
    }
    // 무관한 허브는 위치를 알려주는 제목만 남기고 노드와 같은 농도로 낮춘다.
    for (const text of labelLayer.querySelectorAll('[data-for]')) {
      const id = text.dataset.for;
      if (byId.get(id)?.type === 'hub') text.classList.toggle('is-faint', nodeEls.get(id)?.classList.contains('is-faint') ?? false);
    }
    // 호버·선택한 제목은 다른 제목의 테두리에 가리지 않게 맨 위로 올린다.
    for (const id of [state.selected, state.hovered]) { const text = id && labelLayer.querySelector(`[data-for="${CSS.escape(id)}"]`); if (text) labelLayer.append(text); }
  };
  const refreshNodeStates = () => {
    const neighbors = new Set();
    if (state.selected) for (const e of edges) { if (e.source === state.selected) neighbors.add(e.target); if (e.target === state.selected) neighbors.add(e.source); }
    // 선택이 없을 때 호버는 예고편: 호버한 노드와 이웃만 또렷하고 나머지는 살짝 흐려진다.
    const previewId = !state.selected && mode === 'map' ? state.hovered : null;
    const previewNear = new Set();
    if (previewId) { previewNear.add(previewId); for (const e of edges) { if (e.source === previewId) previewNear.add(e.target); if (e.target === previewId) previewNear.add(e.source); } }
    for (const [id, g] of nodeEls) {
      const node = byId.get(id);
      const topicOut = outOfFilter(id);
      const dim = topicOut || (state.selected && id !== state.selected && !neighbors.has(id));
      g.classList.toggle('is-faint', Boolean(previewId && !previewNear.has(id)));
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
  const hoverChanged = () => { if (!state.selected) { drawEdges(); refreshNodeStates(); } drawLabels(); };
  listen('pointerover', (event) => { const g = event.target.closest('.node'); const id = g ? g.dataset.id : null; if (id !== state.hovered) { state.hovered = id; hoverChanged(); } });
  listen('pointerleave', () => { if (state.hovered) { state.hovered = null; hoverChanged(); } });
  if (mode === 'map') listen('wheel', (event) => { event.preventDefault(); api.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, point(event)); }, { passive: false });
  listen('focusin', (event) => { const g = event.target.closest('.node'); if (g) { state.hovered = g.dataset.id; hoverChanged(); } });
  listen('focusout', () => { state.hovered = null; hoverChanged(); });

  const api = {
    select(id) { state.selected = id && byId.has(id) ? id : null; render(); },
    setFilter({ topics = state.topics, hubsOnly = state.hubsOnly } = {}) { state.topics = topics; state.hubsOnly = hubsOnly; refreshRegionStates(); drawEdges(); refreshNodeStates(); drawLabels(); },
    view: () => ({ ...state.transform }),
    moveTo(target) { animateTo(target); },
    fit(animate = false) { const target = fitTransform(positions, size()); if (animate) animateTo(target); else { stopAnimation(); state.transform = target; applyTransform(); } },
    zoom(factor, center) {
      const { width, height } = size();
      const c = center ?? { x: width / 2, y: height / 2 };
      const t = state.transform;
      const scale = Math.max(minScale(), Math.min(MAX_SCALE, t.scale * factor));
      const ratio = scale / t.scale;
      state.transform = { scale, x: c.x - (c.x - t.x) * ratio, y: c.y - (c.y - t.y) * ratio };
      applyTransform();
    },
    selected: () => state.selected
  };
  drawRegions(); drawNodes(); render(); api.fit();
  return api;
}
