import type { GraphNode, GraphEdge, Point, Size, Box, Transform } from './types.ts';
export interface GraphFilter { topics?: ReadonlySet<string> | null; hubsOnly?: boolean }
// reserved: 무대 위에 얹힌 조작이 차지한 자리(svg 기준 화면 px). 영역 이름과 노드 제목이 그 아래로 들어가지 않는다.
interface GraphOptions { nodes: readonly GraphNode[]; edges: readonly GraphEdge[]; positions: ReadonlyMap<string, Point>; mode?: 'map' | 'hero'; nodeScale?: number; focusable?: boolean; layoutSize?: Size | null; reserved?: () => readonly Box[]; onSelect?: (id: string | null) => void; onOpen?: (id: string) => void }
interface GraphState { selected: string | null; hovered: string | null; topics: ReadonlySet<string> | null; hubsOnly: boolean; transform: Transform }

import { createNodeMotion } from './node-motion.ts';
import { nodeRadius } from './layout.ts';
import { topicColor, topicLabelColor, cleanTitle } from '../lib/format.ts';
import { createGraphGesture } from './gestures.ts';
import { boxesOverlap, estimateTextWidth, labelIds, mustPlaceLabel, placeLabels, nodeBox, RING_GAP, ringedRadius } from './label.ts';
import { topicRegions, regionPath, placeRegionLabels, regionLabelBox } from './regions.ts';
import { heroFadeDefs } from './hero-fade.ts';
import { nextInDirection } from './keyboard-nav.ts';
import type { Direction } from './keyboard-nav.ts';

const MIN_SCALE = 0.65;
const MAX_SCALE = 3.2;
// 키보드로 옮겨 간 노드가 무대 가장자리에 붙지 않도록 남기는 여백(화면 px). 노드 제목이 옆으로 놓여도 잘리지 않을 만큼이다.
const KEYBOARD_VIEW_MARGIN = 48;
// 확대·축소 조작 아래를 피할 때 조작의 가장자리(이미 둘레 8px가 포함된 값)에서 더 띄우는 간격이다.
const CONTROL_CLEARANCE = 12;
const ARROW_DIRECTIONS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
// 넓은 화면의 정적 그림(snapshot.ts)과 한 페이지에 있으므로 마스크 id를 나눈다.
const HERO_FADE_LIVE_ID = 'hero-fade-live';
const key = (s: string, t: string) => JSON.stringify([s, t]);

export function classifyEdges(edges: readonly GraphEdge[], selected: string | null) {
  const set = new Set(edges.map((e) => key(e.source, e.target)));
  const result: (GraphEdge & { state: string; mutual: boolean; offset: number })[] = [];
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

export function hoverLabelCandidates<T extends Pick<GraphNode, 'id' | 'type' | 'degree'>>(nodes: readonly T[], edges: readonly GraphEdge[], hovered: string) {
  const neighbors = new Set();
  for (const edge of edges) {
    if (edge.source === hovered) neighbors.add(edge.target);
    if (edge.target === hovered) neighbors.add(edge.source);
  }
  return nodes.filter((node) => node.id !== hovered && node.type !== 'hub' && neighbors.has(node.id))
    .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
}

export function fitTransform(positions: ReadonlyMap<string, Point>, { width, height, pad = 40 }: Size & { pad?: number }): Transform {
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

// 화면 px 상자를 장면 좌표로 옮긴다. 제목과 영역 이름은 장면 좌표로 자리를 잡으므로, 무대 위 조작의 자리도 같은 좌표로 비교한다.
export function screenBoxToScene(box: Box, t: Transform): Box {
  return { left: (box.left - t.x) / t.scale, right: (box.right - t.x) / t.scale, top: (box.top - t.y) / t.scale, bottom: (box.bottom - t.y) / t.scale };
}

// 맞춤보다 확대했을 때 노드 원의 장면 반지름에 곱할 값. 화면에서 원은 확대 배율의 제곱근만큼만 커진다.
// 원이 배율대로 커지면 3배 확대에서 원과 고리가 제목(화면 13px 고정)보다 먼저 보이고, 확대로 벌어진 자리를 원이 다시 차지한다.
// 크기를 아예 고정하면 원이 점처럼 작아 허브 고리가 눈에 띄지 않는다. 맞춤보다 축소할 때는 배율대로 줄인다.
export function zoomedNodeScale(scale: number, fitScale: number): number {
  const zoom = scale / fitScale;
  return zoom > 1 ? 1 / Math.sqrt(zoom) : 1;
}

export function offsetLine(a: Point, b: Point, sign: number, distance = 2.5) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * distance * sign, ny = (dx / d) * distance * sign;
  return { x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYOUT = { width: 1000, height: 640 };

// 범례 필터(주제 집합, 허브만)에 걸려 흐려질 노드인지. 선택된 노드는 호출 쪽에서 제외한다.
export function isFilteredOut(node: Pick<GraphNode, 'topic' | 'type'> | undefined, { topics = null, hubsOnly = false }: GraphFilter = {}) {
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
export function createGraph(svg: SVGSVGElement, { nodes, edges, positions: initialPositions, mode = 'map', nodeScale = 1, focusable = true, layoutSize = null, reserved = () => [], onSelect = () => {}, onOpen = () => {} }: GraphOptions) {
  // nodeScale: 노드 원 크기 배율. 지도는 무대가 좁아 0.7, 홈 히어로는 0.9로 그려 밀도를 맞춘다.
  // baseRadius는 맞춤 배율의 반지름이다. 지도를 맞춤보다 확대하면 원을 nodeZoom(zoomedNodeScale)만큼 줄여 그리고, 제목도 줄인 원을 기준으로 놓는다.
  const baseRadius = (node: GraphNode) => nodeRadius(node.degree ?? 0, nodeScale);
  const nodeMotion = mode === 'map' ? createNodeMotion(initialPositions, edges, new Map(nodes.map(node => [node.id, baseRadius(node)]))) : null;
  const positions = nodeMotion?.positions ?? initialPositions;
  let nodeZoom = 1, fitScale = 1;
  const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) => { const node = document.createElementNS(SVG_NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); return node; };
  const size = () => ({ width: svg.clientWidth || LAYOUT.width, height: svg.clientHeight || LAYOUT.height });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state: GraphState = { selected: null, hovered: null, topics: null, hubsOnly: false, transform: { x: 0, y: 0, scale: 1 } };
  // 필터는 선택된 노드를 흐리지 않는다. 선택 + 필터는 "이 노드의 연결 중 이 주제"를 뜻한다.
  const outOfFilter = (id: string) => id !== state.selected && isFilteredOut(byId.get(id), state);
  // 노드 모양(refreshNodeStates), 제목 후보(planLabels), 화살표 후보(moveByArrow)가 같은 흐림 규칙을 쓰도록 한곳에 둔다.
  // 선택이 있으면 고른 노드와 이웃만 또렷하고, 없으면 필터에 걸린 노드만 흐려진다.
  const selectedNeighbors = () => {
    const neighbors = new Set<string>();
    if (state.selected) for (const e of edges) { if (e.source === state.selected) neighbors.add(e.target); if (e.target === state.selected) neighbors.add(e.source); }
    return neighbors;
  };
  const isDimmed = (id: string, neighbors: ReadonlySet<string> = selectedNeighbors()) => outOfFilter(id) || Boolean(state.selected && id !== state.selected && !neighbors.has(id));
  const minScale = () => Math.min(MIN_SCALE, fitTransform(positions, size()).scale);
  const gesture = createGraphGesture({ getMinScale: minScale, maxScale: MAX_SCALE });
  const listen = <K extends keyof SVGElementEventMap>(type: K, handler: (event: SVGElementEventMap[K]) => void, options?: AddEventListenerOptions) => svg.addEventListener(type, handler, options);
  const nodeEls = new Map<string, SVGGElement>();
  svg.classList.add('graph', mode);
  svg.replaceChildren();
  const scene = el('g');
  // 색면과 글자 층은 노드 위에 겹쳐 그리는 그림이다. 이름은 노드마다 aria-label로 이미 있으므로 층은 접근성 트리에서 뺀다.
  const regionLayer = el('g', { 'data-regions': '', 'aria-hidden': 'true' }), regionLabelLayer = el('g', { 'data-region-labels': '', 'aria-hidden': 'true' });
  const edgeLayer = el('g'), nodeLayer = el('g'), labelLayer = el('g', { 'data-labels': '', 'aria-hidden': 'true' });
  // 홈 지도는 가장자리를 옅게 하되 글자는 흐리지 않는다(hero-fade.ts). 마스크는 변환 밖에서 씌워야 상자 크기로 맞으므로
  // 도형 층과 글자 층을 같은 변환을 받는 장면 두 개로 나누고, 도형 장면만 마스크를 씌운 묶음에 넣는다.
  // 그래서 hero에서는 영역 이름이 간선·노드 위에 온다. 넓은 화면의 정적 그림도 같은 순서로 그린다.
  const textScene = mode === 'hero' ? el('g') : scene;
  if (mode === 'hero') {
    scene.append(regionLayer, edgeLayer, nodeLayer);
    textScene.append(regionLabelLayer, labelLayer);
  } else scene.append(regionLayer, regionLabelLayer, edgeLayer, nodeLayer, labelLayer);
  // 주제 영역은 배치가 정해지면 고정이고, 노드를 직접 끌 때만 윤곽을 갱신한다. 색면은 장면 좌표(확대하면 같이 커짐), 이름은 제목처럼 화면 크기 고정.
  let regionList = topicRegions(nodes, positions);
  // 영역 이름은 노드 원을 피하고 무대 안에 둔다. 노드 제목은 planLabels가 영역 이름을 장애물로 보고 피한다.
  // 이름은 화면 크기로 그리므로 자리도 화면 배율(u)로 잰다. 배율은 맞춤(fit) 때 정해지므로 그때 자리를 다시 정하고,
  // 확대·이동과 노드 끌기 중에는 다시 계산하지 않아 이름이 튀지 않는다. 노드를 놓고 안정되면 한 번 정리한다. 확대하면 이름이 장면 대비 작아지므로 새로 겹치지 않는다.
  let regionObstacles = nodes.filter((node) => positions.has(node.id)).map((node) => ({ ...positions.get(node.id)!, r: baseRadius(node) + 4 }));
  let regionLabelAt: ReturnType<typeof placeRegionLabels> = new Map(), regionLabelU = 0, regionLabelStage = '';
  // 무대 위 조작(확대·축소)도 피한다. 맞춤 배율의 자리로 옮겨 재므로 맞춤 상태에서 이름이 조작 아래로 들어가지 않는다.
  // 전에는 휴대폰 폭에서 오른쪽 아래 영역 이름("조직", "지식관리")이 조작에 가려졌다.
  // 조작의 장면 좌표는 무대 크기에 따라 달라지므로 배율이 그대로여도 무대 크기가 바뀌면 자리를 다시 정한다.
  const placeRegionNames = (target: Transform) => {
    const u = 1 / (target.scale || 1);
    const { width, height } = size(), stage = `${width}x${height}`;
    if (regionLabelU && Math.abs(u - regionLabelU) / u < 0.01 && stage === regionLabelStage) return false;
    const obstacles = [...regionObstacles, ...reserved().map((box) => screenBoxToScene(box, target))];
    regionLabelAt = placeRegionLabels(regionList, obstacles, { fontSize: 15, scale: u, measure: estimateTextWidth, bounds: layoutSize ?? size() });
    regionLabelU = u;
    regionLabelStage = stage;
    return true;
  };
  // 자리를 얻지 못한 영역 이름은 그리지 않으므로 상자도 없다.
  const regionLabelBoxFor = (topic: string, u: number) => { const at = regionLabelAt.get(topic); return at ? regionLabelBox(at, topic, { fontSize: 15, measure: estimateTextWidth, scale: u }) : null; };
  const regionLabelBoxes = (u: number) => regionList.flatMap((region) => regionLabelBoxFor(region.topic, u) ?? []);
  const regionEls = new Map<string, SVGElement[]>();
  const refreshRegionStates = () => {
    const filtering = mode === 'map' && Boolean(state.topics?.size);
    svg.classList.toggle('has-topic-filter', filtering);
    for (const [topic, elements] of regionEls) {
      const active = filtering && state.topics!.has(topic);
      for (const element of elements) {
        element.classList.toggle('is-topic-active', active);
        element.classList.toggle('is-topic-dim', filtering && !active);
      }
    }
  };
  const topicCenters = () => {
    const totals = new Map<string, { x: number; y: number; count: number }>();
    for (const node of nodes) {
      const point = positions.get(node.id);
      if (!point) continue;
      const total = totals.get(node.topic) ?? { x: 0, y: 0, count: 0 };
      total.x += point.x; total.y += point.y; total.count++;
      totals.set(node.topic, total);
    }
    return new Map([...totals].map(([topic, total]) => [topic, { x: total.x / total.count, y: total.y / total.count }]));
  };
  let regionNameCenters = new Map<string, Point>();
  const drawRegions = () => {
    regionLayer.replaceChildren();
    regionLabelLayer.replaceChildren();
    regionEls.clear();
    for (const region of regionList) {
      const shape = el('path', { class: 'region', d: regionPath(region.hull), fill: topicColor(region.topic), stroke: topicColor(region.topic) });
      regionLayer.append(shape);
      const at = regionLabelAt.get(region.topic);
      if (!at) { regionEls.set(region.topic, [shape]); continue; }
      const label = el('text', { class: 'region-label', x: at.x.toFixed(1), y: at.y.toFixed(1), 'text-anchor': at.anchor, fill: topicLabelColor(region.topic) });
      label.textContent = region.topic;
      regionLabelLayer.append(label);
      regionEls.set(region.topic, [shape, label]);
    }
    regionNameCenters = topicCenters();
    refreshRegionStates();
  };
  if (mode === 'hero') {
    svg.insertAdjacentHTML('beforeend', heroFadeDefs(HERO_FADE_LIVE_ID));
    const faded = el('g', { mask: `url(#${HERO_FADE_LIVE_ID})` });
    faded.append(scene);
    svg.append(faded, textScene);
  } else svg.append(scene);

  // 선택한 노드로 부드럽게 이동·확대. 드래그가 시작되면 애니메이션을 끊는다.
  let animation: number | null = null;
  let animationFinish: (() => void) | null = null;
  // 중간에 멈춰도 현재 시점의 제목을 정리한다. 먼저 비워 재진입해도 같은 완료 처리를 두 번 부르지 않는다.
  const stopAnimation = () => {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    const finish = animationFinish;
    animationFinish = null;
    finish?.();
  };
  const animateTo = (target: Transform, duration = 320, onComplete?: () => void) => {
    stopAnimation();
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { state.transform = target; applyTransform(); onComplete?.(); return; }
    animationFinish = onComplete ?? null;
    const from = { ...state.transform }, start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration), e = 1 - (1 - k) ** 3;
      state.transform = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, scale: from.scale + (target.scale - from.scale) * e };
      applyTransform();
      if (k < 1) animation = requestAnimationFrame(step);
      else stopAnimation();
    };
    animation = requestAnimationFrame(step);
  };
  // 제목은 확대해도 화면에서 같은 크기를 유지한다. 배율이 바뀌면 노드 원의 반지름을 고치고 제목을 다시 그린다.
  let labelScale = 1;
  const applyTransform = () => {
    const { width, height } = size();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const transform = `translate(${state.transform.x.toFixed(1)} ${state.transform.y.toFixed(1)}) scale(${state.transform.scale.toFixed(3)})`;
    scene.setAttribute('transform', transform);
    if (textScene !== scene) textScene.setAttribute('transform', transform);
    if (Math.abs(state.transform.scale - labelScale) > 0.005) { labelScale = state.transform.scale; resizeNodes(); drawLabels(); } else hideUnderControls();
  };
  // 원 크기 조정은 지도에만 한다. 홈 지도는 넓은 화면에서 정적 그림과 바뀔 때 티가 나지 않도록 같은 크기를 지켜야 한다.
  const resizeNodes = () => {
    const next = mode === 'map' ? zoomedNodeScale(state.transform.scale, fitScale) : 1;
    if (Math.abs(next - nodeZoom) < 1e-3) return;
    nodeZoom = next;
    for (const [circle, base] of nodeCircles) circle.setAttribute('r', (base * nodeZoom).toFixed(2));
  };
  const drawnEdges: { line: SVGLineElement; source: string; target: string; offset: number }[] = [];
  const drawEdges = () => {
    edgeLayer.replaceChildren(); drawnEdges.length = 0;
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
      const element = el('line', { class: `edge is-${edge.state}${topicDim ? ' is-topic-dim' : ''}`, x1: line.x1.toFixed(1), y1: line.y1.toFixed(1), x2: line.x2.toFixed(1), y2: line.y2.toFixed(1) });
      edgeLayer.append(element);
      drawnEdges.push({ line: element, source: edge.source, target: edge.target, offset: edge.offset });
    }
  };
  // 노드 원과 그 원의 맞춤 배율 반지름. 확대하면 원을 다시 만들지 않고 반지름만 고친다(resizeNodes).
  const nodeCircles: [SVGCircleElement, number][] = [];
  const drawNodes = () => {
    nodeLayer.replaceChildren(); nodeEls.clear(); nodeCircles.length = 0;
    for (const node of nodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      const r = baseRadius(node);
      const circle = (base: number, attrs: Record<string, string>) => { const c = el('circle', { cx: p.x, cy: p.y, r: (base * nodeZoom).toFixed(2), ...attrs }); nodeCircles.push([c, base]); return c; };
      const g = el('g', { class: `node${node.isEntry ? ' is-entry' : ''}`, 'data-id': node.id, tabindex: focusable ? '0' : '-1', role: 'button', ...(mode === 'map' ? { 'aria-pressed': 'false' } : {}), 'aria-label': node.type === 'hub' ? `${cleanTitle(node.displayTitle ?? node.title)}. 허브` : cleanTitle(node.displayTitle ?? node.title) });
      if (node.isEntry) g.append(circle(r + RING_GAP.entry, { class: 'entry-halo' }));
      if (node.type === 'hub') g.append(circle(r + RING_GAP.hub, { class: 'hub-ring' }));
      g.append(circle(Math.max(22, r), { class: 'hit', fill: 'transparent' }));
      g.append(circle(r, { class: 'dot', fill: topicColor(node.topic) }));
      g.append(circle(r + RING_GAP.select, { class: 'select-ring' }));
      nodeLayer.append(g); nodeEls.set(node.id, g);
    }
  };
  // 제목 배치 계획. 우선순위(선택 → 호버 → 허브 → 연결 많은 순)로 placeLabels에 넘긴다. 자리가 없어도 아래에 두는 제목은 mustPlaceLabel이 정한다.
  // 지도에서는 고르거나 미리 보는 노드와 호버한 노드뿐이고, 홈 히어로는 스냅샷처럼 기본 집합(허브 등)을 모두 둔다.
  // 나머지는 1.2배 이상 확대했거나 선택 상태일 때, 자리가 날 때만 보인다. 흐려진 노드는 제외.
  const planLabels = (u: number) => {
    // 선택 전 호버는 허브를 남기고 해당 노드의 이웃 제목을 미리 보여준다.
    const preview = mode === 'map' && !state.selected && state.hovered && !outOfFilter(state.hovered)
      ? state.hovered : null;
    const base = preview
      ? [...new Set([preview, ...nodes.filter((node) => node.type === 'hub' && !outOfFilter(node.id)).map((node) => node.id)])]
      : [...labelIds(nodes, edges, { selected: state.selected, hovered: null })];
    const scale = state.transform.scale || 1;
    const neighbors = selectedNeighbors();
    const dimmed = (id: string) => isDimmed(id, neighbors);
    // 흐려지지 않은 노드 원과 영역 이름, 무대 위 조작은 장애물이다. 제목이 그 위에 얹히지 않게.
    // 노드 원은 따로 넘긴다. 지도의 기본 제목은 빈자리가 없으면 노드 원 위에는 얹을 수 있지만 다른 글자 위에는 얹지 않는다.
    // 조작도 따로 넘긴다. 고른 제목은 영역 이름 위에는 얹을 수 있지만 조작 아래에는 두지 않는다.
    // 제목은 점이 아니라 노드 둘레 고리 밖에 놓는다. 선택 링은 고른 노드와 키보드로 포커스한 노드에만 보인다.
    const ringed = (id: string) => id === state.selected || (id === state.hovered && nodeEls.get(id)?.matches(':focus-visible') === true);
    const labelRadius = (node: GraphNode) => ringedRadius(node, baseRadius(node), { ringed: ringed(node.id) }) * nodeZoom;
    const nodeObstacles = nodes.filter((node) => !dimmed(node.id) && positions.has(node.id)).map((node) => nodeBox(positions.get(node.id)!, labelRadius(node) + 2 * u));
    const obstacles = regionLabelBoxes(u);
    reservedBoxes = reserved();
    const blocked = reservedBoxes.map((box) => screenBoxToScene(box, state.transform));
    // 화면 밖으로 나가는 자리는 쓰지 않는다(장면 좌표로 환산한 무대 범위).
    const { width: vw, height: vh } = size();
    const view = { left: -state.transform.x * u, top: -state.transform.y * u, right: (vw - state.transform.x) * u, bottom: (vh - state.transform.y) * u };
    const inside = (b: Box) => b.left >= view.left && b.right <= view.right && b.top >= view.top && b.bottom <= view.bottom;
    const priority = (id: string) => (id === (state.selected || preview) ? 0 : 1);
    const baseSet = new Set(base);
    const focus = state.selected || preview;
    const order: { node: GraphNode; mustPlace: boolean; overNodes?: boolean }[] = base.sort((a, b) => priority(a) - priority(b)).map((id) => byId.get(id)).filter((node): node is GraphNode => node !== undefined).map((node) => ({ node, mustPlace: mustPlaceLabel(node.id, { mode, focus }), overNodes: mode === 'map' }));
    // 홈 히어로(hero 모드)는 허브·호버만 보인다. 자리 채우기는 지도에서만: 평소에는 연결 많은 순으로 몇 개, 확대하거나 선택하면 자리가 나는 만큼 전부.
    if (mode === 'map') {
      const candidates = preview ? hoverLabelCandidates(nodes, edges, preview) : nodes;
      const rest = candidates.filter((node) => !baseSet.has(node.id) && !dimmed(node.id)).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
      const reveal = preview || scale >= LABEL_REVEAL_SCALE || state.selected;
      order.push(...(reveal ? rest : rest.slice(0, RESTING_LABEL_LIMIT)).map((node) => ({ node, mustPlace: false })));
    }
    // 호버한 노드는 이미 자리가 있으면 그대로 두고, 숨어 있던 노드면 그때만 빈자리(없으면 아래)에 얹는다. 맨 위에 그려지므로 겹쳐도 읽힌다.
    if (state.hovered) { const node = byId.get(state.hovered); if (node) order.push({ node, mustPlace: true }); }
    return placeLabels(order, { positions, radius: labelRadius, u, obstacles, nodeObstacles, blocked, inside, labelGap: mode === 'map' && (state.selected || preview) ? 8 : 0 });
  };
  // 제목은 배율이 바뀔 때만, 영역 이름은 맞춤 때만 자리를 다시 정한다. 지도를 끌 때마다 자리를 옮기면 글자가 튄다.
  // 그래서 끌거나 확대해 조작 아래로 들어간 글자는 자리를 그대로 두고 숨긴다. 일부만 가려진 글자는 읽히지 않는다.
  // 조작의 자리는 제목을 배치할 때 잰 값을 쓴다. 끄는 동안 매 프레임 레이아웃을 읽지 않으려는 것이다.
  let reservedBoxes: readonly Box[] = [];
  let drawnLabels: { text: SVGElement; box: Box }[] = [];
  let labelNodePositions = new Map<string, Point>();
  const hideUnderControls = () => {
    const covered = reservedBoxes.map((box) => screenBoxToScene(box, state.transform));
    const under = (box: Box | null) => box !== null && covered.some((b) => boxesOverlap(b, box));
    for (const { text, box } of drawnLabels) text.classList.toggle('is-under-controls', under(box));
    const u = 1 / (state.transform.scale || 1);
    for (const region of regionList) regionEls.get(region.topic)?.[1]?.classList.toggle('is-under-controls', under(regionLabelBoxFor(region.topic, u)));
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
    const plan = planLabels(u);
    // 자리가 없어도 놓는 제목(고른 노드·호버한 노드)은 영역 이름 위에 얹힐 수 있다. 그때는 영역 이름을 흐려 고른 제목을 먼저 읽게 한다.
    if (mode === 'map') {
      const labelBoxes = [...plan.values()].map(({ g }) => g.box);
      for (const region of regionList) {
        const box = regionLabelBoxFor(region.topic, u);
        regionEls.get(region.topic)?.[1]?.classList.toggle('is-under-label', box !== null && labelBoxes.some((label) => boxesOverlap(label, box)));
      }
    }
    drawnLabels = [];
    for (const [id, { lines, g }] of plan) {
      const node = byId.get(id)!;
      const topicDim = outOfFilter(id);
      const text = el('text', { class: `label${node.isEntry ? ' is-entry' : ''}${id === state.selected ? ' is-selected' : ''}${id === state.hovered ? ' is-hovered' : ''}${topicDim ? ' is-topic-dim' : ''}`, 'data-for': id, x: g.x.toFixed(1), y: g.y.toFixed(1), 'text-anchor': g.anchor });
      lines.forEach((line, index) => { const tspan = el('tspan', { x: g.x.toFixed(1), dy: index === 0 ? 0 : (18 * u).toFixed(1) }); tspan.textContent = line; text.append(tspan); });
      labelLayer.append(text);
      drawnLabels.push({ text, box: g.box });
    }
    labelNodePositions = new Map(drawnLabels.map(({ text }) => {
      const id = text.getAttribute('data-for')!;
      return [id, { ...positions.get(id)! }];
    }));
    hideUnderControls();
    // 무관한 허브는 위치를 알려주는 제목만 남기고 노드와 같은 농도로 낮춘다.
    for (const text of labelLayer.querySelectorAll<SVGTextElement>('[data-for]')) {
      const id = text.dataset.for!;
      if (byId.get(id)?.type === 'hub') text.classList.toggle('is-faint', nodeEls.get(id)?.classList.contains('is-faint') ?? false);
    }
    // 호버·선택한 제목은 다른 제목의 테두리에 가리지 않게 맨 위로 올린다.
    for (const id of [state.selected, state.hovered]) { const text = id && labelLayer.querySelector(`[data-for="${CSS.escape(id)}"]`); if (text) labelLayer.append(text); }
  };
  // 지도의 Tab 정지점은 기준 노드 하나뿐이다. 노드가 수십 개인 지도를 Tab으로 하나씩 지나가게 하지 않고, 안에서는 화살표로 옮긴다.
  // 마지막으로 포커스한 노드가 우선이라 지도를 나갔다 돌아오면 있던 자리에서 이어진다. 그다음은 고른 노드,
  // 없으면 입구 노드 가운데 화면 왼쪽 위에 가장 가까운 노드(입구가 모두 흐려졌으면 보이는 노드 전체에서)다.
  let lastFocused: string | null = null;
  const anchorId = (neighbors: ReadonlySet<string>) => {
    if (lastFocused && nodeEls.has(lastFocused) && !isDimmed(lastFocused, neighbors)) return lastFocused;
    if (state.selected && nodeEls.has(state.selected)) return state.selected;
    const visible = nodes.filter((node) => positions.has(node.id) && !isDimmed(node.id, neighbors));
    const entries = visible.filter((node) => node.isEntry);
    const topLeft = (list: readonly GraphNode[]) => { let best: GraphNode | null = null, bestScore = Infinity; for (const node of list) { const p = positions.get(node.id)!, score = p.x + p.y; if (score < bestScore) { best = node; bestScore = score; } } return best?.id ?? null; };
    return topLeft(entries.length ? entries : visible);
  };
  const refreshTabStops = (neighbors: ReadonlySet<string> = selectedNeighbors()) => {
    const anchor = focusable ? anchorId(neighbors) : null;
    // 흐려진 노드는 기준 노드가 될 수 없으므로 늘 -1이다. 남겨 두면 필터를 걸어도 보이지 않는 노드가 정지점이 된다.
    for (const [id, g] of nodeEls) g.setAttribute('tabindex', id === anchor ? '0' : '-1');
  };
  const refreshNodeStates = () => {
    const neighbors = selectedNeighbors();
    // 선택이 없을 때 호버는 예고편: 호버한 노드와 이웃만 또렷하고 나머지는 살짝 흐려진다.
    const previewId = !state.selected && mode === 'map' ? state.hovered : null;
    const previewNear = new Set();
    if (previewId) { previewNear.add(previewId); for (const e of edges) { if (e.source === previewId) previewNear.add(e.target); if (e.target === previewId) previewNear.add(e.source); } }
    for (const [id, g] of nodeEls) {
      const dim = isDimmed(id, neighbors);
      g.classList.toggle('is-faint', Boolean(previewId && !previewNear.has(id)));
      g.classList.toggle('is-dim', Boolean(dim));
      g.classList.toggle('is-selected', id === state.selected);
      g.classList.toggle('is-neighbor', neighbors.has(id));
      // 눌린 채로 남는 것은 지도의 선택뿐이다. 홈은 누르면 그 노트로 이동하므로 누름 상태를 말할 것이 없다.
      if (mode === 'map') g.setAttribute('aria-pressed', String(id === state.selected));
    }
    refreshTabStops(neighbors);
  };
  const render = () => { drawEdges(); refreshNodeStates(); drawLabels(); };

  const point = (event: MouseEvent) => { const rect = svg.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const pointer = (event: PointerEvent) => ({ id: event.pointerId, ...point(event), touch: event.pointerType === 'touch', onNode: Boolean((event.target as Element).closest<SVGGElement>('.node')) });
  // 매 이동마다 레이아웃을 읽지 않고, 스크롤이나 크기 변경으로 무대가 달라졌을 때만 다시 잰다.
  let nodeDrag: { id: string; pointer: ReturnType<typeof pointer>; start: Point; offset: Point; moved: boolean; frame: DOMRect; bounds: Size; geometryDirty: boolean } | null = null;
  let suppressNodeClick = false;
  let motionFrame: number | null = null;
  let motionTime = 0;
  // 처음 배치에서 노드를 옮긴 적이 있는지. 전체 보기는 옮긴 적이 있을 때만 배치를 되돌린다.
  let layoutMoved = false;
  let pointerAt: Point | null = null;
  // 놓은 뒤 포인터 아래 노드를 다시 찾으려고 마지막 마우스·펜 위치를 둔다. 손가락에는 호버가 없다.
  const trackPointer = (event: PointerEvent) => { if (event.pointerType !== 'touch') pointerAt = { x: event.clientX, y: event.clientY }; };
  const hoveredUnderPointer = () => {
    if (!pointerAt) return null;
    const hit = document.elementFromPoint(pointerAt.x, pointerAt.y)?.closest<SVGGElement>('.node');
    return hit?.closest('svg') === svg ? hit.dataset.id! : null;
  };
  const paintNodeMotion = (finished = false) => {
    for (const [id, g] of nodeEls) {
      const at = positions.get(id)!;
      for (const circle of g.querySelectorAll('circle')) { circle.setAttribute('cx', String(at.x)); circle.setAttribute('cy', String(at.y)); }
    }
    regionList = topicRegions(nodes, positions);
    if (finished) {
      // 감쇠 중 키보드로 들어온 노드는 포인터가 멀리 있어도 미리보기를 유지한다.
      state.hovered = svg.querySelector<SVGGElement>('.node:focus-visible')?.dataset.id ?? hoveredUnderPointer();
      regionObstacles = nodes.filter(node => positions.has(node.id)).map(node => ({ ...positions.get(node.id)!, r: baseRadius(node) + 4 }));
      // 영역 이름은 처음 배치·전체 보기와 같이 맞춤 배율에서 자리를 정한다. 지금 배율로 정하면 확대한 채 놓은 뒤 축소할 때 이름이 커지며 노드와 겹친다.
      regionLabelU = 0;
      placeRegionNames(fitTransform(positions, size()));
      drawRegions(); render();
      return;
    }
    // 끄는 동안 선과 글자를 새로 만들지 않는다. 제목의 방향·줄바꿈은 유지하고 노드 변위만 더한다.
    for (const edge of drawnEdges) {
      const a = positions.get(edge.source)!, b = positions.get(edge.target)!;
      const at = edge.offset ? offsetLine(a, b, edge.offset) : { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      for (const [name, value] of Object.entries(at)) edge.line.setAttribute(name, value.toFixed(1));
    }
    for (const region of regionList) regionEls.get(region.topic)?.[0]?.setAttribute('d', regionPath(region.hull));
    const centers = topicCenters();
    for (const [topic, center] of centers) {
      const previous = regionNameCenters.get(topic), at = regionLabelAt.get(topic);
      if (!previous || !at) continue;
      at.x += center.x - previous.x; at.y += center.y - previous.y;
      const name = regionEls.get(topic)?.[1];
      name?.setAttribute('x', String(at.x)); name?.setAttribute('y', String(at.y));
    }
    regionNameCenters = centers;
    for (const label of drawnLabels) {
      const id = label.text.getAttribute('data-for')!;
      const at = positions.get(id)!, previous = labelNodePositions.get(id)!;
      const dx = at.x - previous.x, dy = at.y - previous.y;
      const x = Number(label.text.getAttribute('x')) + dx, y = Number(label.text.getAttribute('y')) + dy;
      label.text.setAttribute('x', String(x)); label.text.setAttribute('y', String(y));
      for (const line of label.text.children) line.setAttribute('x', String(x));
      label.box = { left: label.box.left + dx, right: label.box.right + dx, top: label.box.top + dy, bottom: label.box.bottom + dy };
      labelNodePositions.set(id, { ...at });
    }
    const u = 1 / (state.transform.scale || 1);
    for (const region of regionList) {
      const box = regionLabelBoxFor(region.topic, u);
      regionEls.get(region.topic)?.[1]?.classList.toggle('is-under-label', box !== null && drawnLabels.some(label => boxesOverlap(label.box, box)));
    }
    hideUnderControls();
  };
  const runNodeMotion = () => {
    if (!nodeMotion) return;
    svg.dataset.nodeMotion = nodeDrag?.moved ? 'dragging' : 'settling';
    // 포인터 이벤트마다 수백 단계를 돌리지 않고, 따라가기만 조금 계산한 뒤 놓으면 즉시 멈춘다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (motionFrame !== null) cancelAnimationFrame(motionFrame);
      motionFrame = null;
      if (nodeDrag?.moved) for (let i = 0; i < 6; i++) nodeMotion.step();
      else nodeMotion.stop();
      paintNodeMotion(!nodeDrag?.moved);
      if (!nodeDrag?.moved) delete svg.dataset.nodeMotion;
      return;
    }
    if (motionFrame !== null) return;
    motionTime = performance.now();
    const tick = (now: number) => {
      const moving = nodeMotion.step(now - motionTime);
      motionTime = now;
      paintNodeMotion(!moving);
      if (moving) motionFrame = requestAnimationFrame(tick);
      else { motionFrame = null; delete svg.dataset.nodeMotion; }
    };
    motionFrame = requestAnimationFrame(tick);
  };
  const releaseNode = () => {
    const moved = nodeDrag?.moved;
    nodeDrag = null;
    svg.classList.remove('is-node-dragging');
    if (moved) { nodeMotion!.release(); runNodeMotion(); }
  };
  listen('pointerdown', event => {
    stopAnimation();
    const input = pointer(event);
    trackPointer(event);
    // 마우스·펜으로 잡은 중에 터치가 시작되면 노드를 놓고 터치 조작으로 넘긴다.
    if (nodeDrag && input.id !== nodeDrag.pointer.id && input.touch) {
      gesture.end(nodeDrag.pointer.id);
      releaseNode();
      suppressNodeClick = true;
    } else if (!gesture.active()) {
      suppressNodeClick = false;
      const node = (event.target as Element).closest<SVGGElement>('.node');
      const at = node ? positions.get(node.dataset.id!) : null;
      const t = state.transform;
      const canDragNode = event.pointerType === 'mouse' || event.pointerType === 'pen';
      if (nodeMotion && node && at && event.button === 0 && canDragNode) {
        nodeDrag = { id: node.dataset.id!, pointer: input, start: { x: event.clientX, y: event.clientY }, offset: { x: at.x - (input.x - t.x) / t.scale, y: at.y - (input.y - t.y) / t.scale }, moved: false, frame: svg.getBoundingClientRect(), bounds: size(), geometryDirty: false };
        gesture.down(input, state.transform);
        return;
      }
    }
    if (gesture.down(input, state.transform)) { svg.setPointerCapture?.(event.pointerId); svg.classList.add('is-panning'); }
  });
  listen('pointermove', event => {
    trackPointer(event);
    if (nodeDrag?.pointer.id === event.pointerId) {
      if (nodeDrag.geometryDirty) {
        nodeDrag.frame = svg.getBoundingClientRect();
        nodeDrag.bounds = size();
        nodeDrag.geometryDirty = false;
      }
      const input = { ...nodeDrag.pointer, x: event.clientX - nodeDrag.frame.left, y: event.clientY - nodeDrag.frame.top };
      nodeDrag.pointer = input;
      if (!nodeDrag.moved && Math.hypot(event.clientX - nodeDrag.start.x, event.clientY - nodeDrag.start.y) <= 6) return;
      if (!nodeDrag.moved) {
        nodeDrag.moved = true; suppressNodeClick = true; layoutMoved = true;
        gesture.end(input.id);
        svg.setPointerCapture?.(event.pointerId);
        svg.classList.add('is-node-dragging');
        state.hovered = nodeDrag.id;
        render();
      }
      const t = state.transform, bounds = nodeDrag.bounds;
      const clamp = (value: number, maximum: number) => Math.max(28, Math.min(maximum - 28, value));
      nodeMotion!.hold(nodeDrag.id, { x: (clamp(input.x, bounds.width) - t.x) / t.scale + nodeDrag.offset.x, y: (clamp(input.y, bounds.height) - t.y) / t.scale + nodeDrag.offset.y });
      runNodeMotion();
      return;
    }
    const next = gesture.move(pointer(event));
    if (next) { state.transform = next; applyTransform(); }
  });
  const endPointer = (event: PointerEvent) => {
    if (event.type !== 'lostpointercapture') trackPointer(event);
    if (nodeDrag?.pointer.id === event.pointerId) releaseNode();
    gesture.end(event.pointerId);
    if (!gesture.active()) svg.classList.remove('is-panning');
  };
  listen('pointerup', endPointer);
  listen('pointercancel', endPointer);
  listen('lostpointercapture', event => { if (event.target === svg) endPointer(event); });
  if (nodeMotion) {
    const invalidateDragGeometry = () => { if (nodeDrag) nodeDrag.geometryDirty = true; };
    // 상위 스크롤 상자의 이동도 포착한다. 크기는 창 외의 레이아웃 변경으로도 달라질 수 있다.
    window.addEventListener('scroll', invalidateDragGeometry, { capture: true, passive: true });
    window.addEventListener('resize', invalidateDragGeometry);
    new ResizeObserver(invalidateDragGeometry).observe(svg);
    // 임계 거리를 넘기 전에는 포인터를 잡지 않으므로 무대 밖에서 놓아도 후보를 해제한다.
    const endOutside = (event: PointerEvent) => { if (nodeDrag?.pointer.id === event.pointerId) endPointer(event); };
    window.addEventListener('pointerup', endOutside);
    window.addEventListener('pointercancel', endOutside);
    window.addEventListener('blur', () => { if (nodeDrag) { gesture.end(nodeDrag.pointer.id); pointerAt = null; releaseNode(); } });
  }
  listen('click', (event) => {
    if (suppressNodeClick || gesture.shouldSuppressClick()) return;
    const g = (event.target as Element).closest<SVGGElement>('.node');
    if (g) onSelect(g.dataset.id!); else if (mode === 'map') onSelect(null);
  });
  listen('dblclick', (event) => { if (suppressNodeClick) return; const g = (event.target as Element).closest<SVGGElement>('.node'); if (g) onOpen(g.dataset.id!); });
  listen('keydown', (event) => {
    const g = (event.target as Element).closest<SVGGElement>('.node');
    if (!g) return;
    if (event.key === 'Enter') { event.preventDefault(); onOpen(g.dataset.id!); }
    if (event.key === ' ') { event.preventDefault(); onSelect(g.dataset.id!); }
    const direction = ARROW_DIRECTIONS[event.key];
    // 알트+화살표는 브라우저의 뒤로 가기라서 건드리지 않는다.
    if (direction && mode === 'map' && focusable && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); moveByArrow(g.dataset.id!, direction); }
  });
  // 흐려지지 않은 노드 가운데 그 방향에서 가장 가까운 노드로 포커스를 옮긴다. 없으면 제자리에 둔다.
  // 선택이 있으면 이웃이 아닌 노드가 흐려져 후보에서 빠지므로 화살표는 고른 노드와 이웃 사이만 오간다.
  const moveByArrow = (fromId: string, direction: Direction) => {
    const from = positions.get(fromId);
    if (!from) return;
    const neighbors = selectedNeighbors();
    const candidates = nodes.filter((node) => node.id !== fromId && positions.has(node.id) && !isDimmed(node.id, neighbors)).map((node) => ({ id: node.id, ...positions.get(node.id)! }));
    const next = nextInDirection(from, direction, candidates);
    // 화면 밖 노드로 가도 브라우저가 페이지를 스크롤하지 않게 한다. 시점은 focusin이 옮긴다.
    if (next) nodeEls.get(next)?.focus({ preventScroll: true });
  };
  // 키보드로 포커스한 노드가 무대 여백 밖이거나 확대·축소 조작 아래이면, 배율은 두고 그 노드가 들어오도록 최소한만 옮긴다.
  const revealNode = (id: string) => {
    const p = positions.get(id);
    if (!p) return;
    const { x, y, scale } = state.transform, { width, height } = size();
    const sx = p.x * scale + x, sy = p.y * scale + y;
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
    const m = KEYBOARD_VIEW_MARGIN;
    const insideStage = (px: number, py: number) => px >= m && px <= width - m && py >= m && py <= height - m;
    let tx = clamp(sx, m, width - m), ty = clamp(sy, m, height - m);
    const controls = reserved();
    const under = (px: number, py: number) => controls.find((b) => px >= b.left && px <= b.right && py >= b.top && py <= b.bottom);
    const covered = under(tx, ty);
    if (covered) {
      // 조작의 네 변 밖으로 나가는 자리 가운데 무대 여백 안이고 다른 조작과도 겹치지 않는 가장 가까운 자리로 간다. 없으면 여백만 지킨다.
      const c = CONTROL_CLEARANCE;
      const exits = [{ x: covered.left - c, y: ty }, { x: covered.right + c, y: ty }, { x: tx, y: covered.top - c }, { x: tx, y: covered.bottom + c }]
        .filter((o) => insideStage(o.x, o.y) && !under(o.x, o.y))
        .sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy));
      if (exits[0]) { tx = exits[0].x; ty = exits[0].y; }
    }
    if (Math.abs(tx - sx) < 0.5 && Math.abs(ty - sy) < 0.5) return;
    animateTo({ scale, x: x + tx - sx, y: y + ty - sy });
  };
  // 호버 예고편은 지도에만 있다. 홈에서 다시 그리면 같은 간선과 같은 상태를 만들려고 간선 전체를 버렸다가 새로 만든다.
  const hoverChanged = () => { if (nodeDrag?.moved || motionFrame !== null) return; if (mode === 'map' && !state.selected) { drawEdges(); refreshNodeStates(); } drawLabels(); };
  listen('pointerover', (event) => { trackPointer(event); if (nodeDrag?.moved) return; const g = (event.target as Element).closest<SVGGElement>('.node'); const id = g ? g.dataset.id! : null; if (id !== state.hovered) { state.hovered = id; hoverChanged(); } });
  listen('pointerleave', () => { pointerAt = null; if (nodeDrag?.moved) return; if (state.hovered) { state.hovered = null; hoverChanged(); } });
  if (mode === 'map') listen('wheel', (event) => { event.preventDefault(); if (nodeDrag) return; api.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, point(event)); }, { passive: false });
  listen('focusin', (event) => {
    const g = (event.target as Element).closest<SVGGElement>('.node');
    if (!g) return;
    const id = g.dataset.id!;
    state.hovered = id;
    lastFocused = id;
    refreshTabStops();
    // 시점 이동은 키보드로 닿았을 때만 한다. 마우스로 누른 노드는 이미 눈에 보이는 자리에 있어 움직이면 클릭이 어긋난다.
    if (mode === 'map' && focusable && g.matches(':focus-visible')) revealNode(id);
    hoverChanged();
  });
  listen('focusout', () => { state.hovered = null; hoverChanged(); });

  const api = {
    resetLayout() {
      if (!nodeMotion) return;
      stopAnimation();
      if (motionFrame !== null) cancelAnimationFrame(motionFrame);
      motionFrame = null;
      if (nodeDrag) gesture.end(nodeDrag.pointer.id);
      nodeDrag = null;
      svg.classList.remove('is-node-dragging', 'is-panning');
      delete svg.dataset.nodeMotion;
      // 옮긴 적이 없으면 처음 배치 그대로라 다시 그릴 것이 없다. 되돌릴 때 영역 이름은 맞춤 배율로 정하므로, 이어지는 fit이 같은 계산을 반복하지 않는다.
      if (!layoutMoved) return;
      layoutMoved = false;
      nodeMotion.reset();
      pointerAt = null;
      state.hovered = null;
      paintNodeMotion(true);
    },
    select(id: string | null) { state.selected = id && byId.has(id) ? id : null; render(); },
    setFilter({ topics = state.topics, hubsOnly = state.hubsOnly }: GraphFilter = {}) { state.topics = topics; state.hubsOnly = hubsOnly; refreshRegionStates(); drawEdges(); refreshNodeStates(); drawLabels(); },
    view: () => ({ ...state.transform }),
    moveTo(target: Transform) { animateTo(target); },
    fit(animate = false) {
      const target = fitTransform(positions, size());
      fitScale = target.scale;
      // 상자 크기가 바뀌어 맞춤 배율이 달라졌으면 영역 이름 자리를 새 배율로 다시 정하고, 노드 제목도 새 자리를 피해 다시 그린다.
      if (placeRegionNames(target)) { drawRegions(); labelScale = -1; }
      // 같은 배율로 시점만 돌아와도 제목 후보는 달라진다. 이동 중에는 자리를 유지하고 도착한 화면에서 한 번 정리한다.
      const finish = () => { labelScale = state.transform.scale; resizeNodes(); drawLabels(); };
      if (animate) animateTo(target, 320, finish); else { stopAnimation(); state.transform = target; applyTransform(); finish(); }
    },
    zoom(factor: number, center?: Point) {
      const { width, height } = size();
      const c = center ?? { x: width / 2, y: height / 2 };
      const t = state.transform;
      const scale = Math.max(minScale(), Math.min(MAX_SCALE, t.scale * factor));
      const ratio = scale / t.scale;
      state.transform = { scale, x: c.x - (c.x - t.x) * ratio, y: c.y - (c.y - t.y) * ratio };
      applyTransform();
    },
    position: (id: string) => { const at = positions.get(id); return at ? { ...at } : null; },
    selected: () => state.selected
  };
  placeRegionNames(fitTransform(positions, size()));
  drawRegions(); drawNodes(); render(); api.fit();
  return api;
}
