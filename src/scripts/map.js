import { createGraph, isFilteredOut } from '../graph/engine.mjs';
import { layoutGraph, ATLAS_LAYOUT } from '../graph/layout.mjs';
import { panelModel } from '../lib/panel.mjs';

const page = document.querySelector('[data-site]');
const svg = document.querySelector('svg[data-map]');
const panel = document.querySelector('[data-panel]');
const body = document.querySelector('[data-panel-body]');
const emptyPanel = body.innerHTML;
const countEl = document.querySelector('[data-map-count]');
const totalCount = countEl?.textContent ?? '';
const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const OUT = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4" cy="7" r="2"></circle><path d="M6 7h6m-2.5-2.5L12 7l-2.5 2.5"></path></svg>';
const IN = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="7" r="2"></circle><path d="M8 7H2m2.5-2.5L2 7l2.5 2.5"></path></svg>';

// 그래프 노드인 항목은 data-node를 달아 지도 안에서 선택되게 한다(그래프 밖 노트만 페이지로 이동).
const list = (icon, label, items) => items.length ? `<section class="list-block"><div class="meta">${icon}${label}<span class="count">${items.length}</span></div><div class="scroll-list${items.length > 6 ? ' is-long' : ''}"><ul class="side-list">${items.map((i) => `<li><a href="${escape(i.url)}"${i.nodeId ? ` data-node="${escape(i.nodeId)}"` : ''}>${i.isHub ? '<i class="hub-mark" aria-hidden="true"></i>' : ''}${escape(i.title)}</a></li>`).join('')}</ul></div></section>` : '';

function renderPanel(model) {
  body.innerHTML = `<div class="panel-head">
    <div class="meta">${escape(model.kind)}${model.isHub ? ' · <i class="hub-mark" aria-hidden="true"></i>허브' : ''}${model.date ? ` · ${model.date}` : ''}</div>
    <h2 class="display">${escape(model.title)}</h2>
    ${model.topics.length ? `<div class="panel-topics">${model.topics.map((t) => `<span><i style="background:${t.color}"></i>${escape(t.name)}</span>`).join('')}</div>` : ''}
    ${model.summary ? `<p class="panel-summary">${escape(model.summary)}</p>` : ''}
    <a class="btn small" href="${escape(model.url)}" style="align-self:flex-start;margin-top:4px">노트 읽기</a>
  </div><div class="panel-lists">${list(OUT, '참조', model.outgoing)}${list(IN, '역참조', model.incoming)}</div>`;
}

try {
const response = await fetch(page.dataset.site);
if (!response.ok) throw new Error(`Map data: ${response.status}`);
const site = await response.json();
const notesByPath = new Map(site.notes.map((n) => [n.path, n]));
const nodeByPath = new Map(site.nodes.map((n) => [n.path, n]));
const decorate = (i) => { const node = nodeByPath.get(i.path); return { ...i, nodeId: node?.id, isHub: node?.type === 'hub' }; };
const withNodeIds = (model) => ({ ...model, outgoing: model.outgoing.map(decorate), incoming: model.incoming.map(decorate) });
const byMapKey = new Map(site.nodes.map((n) => [n.mapKey, n]));
// SVG는 마운트 전까지 기본 크기(300×150)라서 CSS로 크기가 정해진 상자를 잰다.
const rect = svg.parentElement.getBoundingClientRect();
// 무대 픽셀 크기로 배치한다. 맞춤 배율이 1이 되어 제목이 13px 그대로 보인다(pad는 fitTransform의 여백과 같은 40).
const stageSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
let graph = null;

const backdrop = document.querySelector('[data-sheet-backdrop]');
const stage = document.querySelector('.map-stage');
const header = document.querySelector('.site-header');
const narrow = window.matchMedia('(max-width: 720px)');
let lastFocus = null;
function syncSheet() {
  const open = narrow.matches && 'open' in panel.dataset;
  if (backdrop) backdrop.hidden = !open;
  // 닫힌 시트는 화면 밖으로 밀려 있을 뿐이라 inert로 포커스·접근성 트리에서도 뺀다. 데스크톱 패널은 항상 보이므로 그대로.
  panel.toggleAttribute('inert', narrow.matches && !open);
  if (open && !panel.hasAttribute('role')) {
    lastFocus = document.activeElement;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '노트 정보');
    stage?.setAttribute('inert', ''); header?.setAttribute('inert', '');
    panel.querySelector('[data-panel-close]')?.focus();
  } else if (!open && panel.hasAttribute('role')) {
    panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); panel.removeAttribute('aria-label');
    stage?.removeAttribute('inert'); header?.removeAttribute('inert');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }
}

const positions = layoutGraph(site.nodes, site.edges, { ...stageSize, pad: 40, ...ATLAS_LAYOUT });
graph = createGraph(svg, {
  nodes: site.nodes,
  edges: site.edges,
  positions,
  mode: 'map',
  nodeScale: 0.7,
  onSelect: (id) => select(id, true),
  onOpen: (id) => { const node = site.nodes.find((n) => n.id === id); if (node) window.location.href = node.url; }
});

// 모바일 시트가 고른 노드를 덮을 때만 배율은 그대로 두고 노드가 시트 위 띠 안에 오도록 세로로 민다.
function keepNodeAboveSheet(id) {
  const p = positions.get(id);
  if (!p || !narrow.matches) return;
  const view = graph.view();
  const svgTop = svg.getBoundingClientRect().top;
  const nodeY = svgTop + view.y + p.y * view.scale;
  const margin = 56; // 노드 반지름과 아래 제목 한 줄
  const limit = window.innerHeight - panel.offsetHeight - margin;
  if (nodeY <= limit) return;
  const top = Math.max(svgTop, header?.getBoundingClientRect().bottom ?? 0) + margin;
  graph.moveTo({ ...view, y: view.y + Math.max(top, limit) - nodeY });
}

function select(id, pushUrl, { open = true } = {}) {
  // 선택해도 시점은 그대로 둔다. 이웃 제목은 자리가 나는 만큼 그 자리에서 보인다.
  graph.select(id);
  const node = site.nodes.find((n) => n.id === id);
  // 공개 노트 레코드에는 type이 없어 허브 여부는 그래프 노드에서 가져온다.
  if (node) { renderPanel({ ...withNodeIds(panelModel(notesByPath.get(node.path) ?? node, notesByPath, site.noteEdges, site.topicFold ?? {})), isHub: node.type === 'hub' }); if (open) panel.dataset.open = ''; }
  else { body.innerHTML = emptyPanel; delete panel.dataset.open; }
  if (pushUrl) {
    const params = new URLSearchParams();
    if (node) params.set('node', node.mapKey);
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  }
  syncSheet();
  if (node && open) keepNodeAboveSheet(node.id);
  updateCount();
}

// 시트만 닫는다. 선택은 유지된다. 선택 해제는 빈 곳 탭.
function closeSheet() { delete panel.dataset.open; syncSheet(); }

const pressedTopics = () => new Set([...document.querySelectorAll('[data-topic][aria-pressed="true"]')].map((b) => b.dataset.topic));
const hubFilter = document.querySelector('[data-hub-filter]');
const currentFilter = () => { const set = pressedTopics(); return { topics: set.size ? set : null, hubsOnly: hubFilter?.getAttribute('aria-pressed') === 'true' }; };
// 필터가 켜지면 제목 옆 집계가 걸러진 수로 바뀐다. 선택된 노드는 엔진과 같이 흐려지지 않으므로 센다.
function updateCount() {
  if (!countEl) return;
  const filter = currentFilter();
  if (!filter.topics && !filter.hubsOnly) { countEl.textContent = totalCount; return; }
  const selected = graph.selected();
  const shown = new Set(site.nodes.filter((n) => n.id === selected || !isFilteredOut(n, filter)).map((n) => n.id));
  const links = site.edges.filter((e) => shown.has(e.source) && shown.has(e.target)).length;
  countEl.textContent = `노트 ${shown.size} · 연결 ${links}`;
}
function applyFilter() { graph.setFilter(currentFilter()); updateCount(); }
const toggle = (button) => { button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')); applyFilter(); };
for (const button of document.querySelectorAll('[data-topic]')) button.addEventListener('click', () => toggle(button));
hubFilter?.addEventListener('click', () => toggle(hubFilter));
// 패널의 시작점·참조·역참조 링크는 페이지로 가지 않고 지도에서 그 노드를 고른다.
panel.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-node]');
  if (!link) return;
  event.preventDefault();
  select(link.dataset.node, true);
});
document.querySelector('[data-graph-zoom="in"]').addEventListener('click', () => graph.zoom(1.25));
document.querySelector('[data-graph-zoom="out"]').addEventListener('click', () => graph.zoom(1 / 1.25));
document.querySelector('[data-graph-zoom="fit"]').addEventListener('click', () => graph.fit(true));
document.querySelector('[data-panel-close]')?.addEventListener('click', closeSheet);
backdrop?.addEventListener('click', closeSheet);
narrow.addEventListener('change', syncSheet);
// Escape: 시트가 열려 있으면 닫고, 아니면 선택을 푼다(빈 곳 클릭과 같다). 검색 다이얼로그의 Escape는 건드리지 않는다.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (narrow.matches && 'open' in panel.dataset) closeSheet();
  else if (graph.selected()) select(null, true);
});
// 모바일 주소창이 접히면 높이만 바뀐 resize가 온다. 무대 폭이 실제로 바뀔 때만 다시 맞춘다.
let stageWidth = stageSize.width;
window.addEventListener('resize', () => {
  const width = Math.round(svg.parentElement.getBoundingClientRect().width);
  if (width === stageWidth) return;
  stageWidth = width;
  graph.fit();
});
// 시트 손잡이를 아래로 끌면 따라 내려오고, 80px 넘게 끌어 놓으면 닫힌다.
const grip = panel.querySelector('[data-sheet-grip]');
let drag = null;
grip?.addEventListener('pointerdown', (event) => { drag = { id: event.pointerId, y: event.clientY }; try { grip.setPointerCapture(event.pointerId); } catch { /* 합성 이벤트 등 잡을 수 없는 포인터 */ } panel.style.transition = 'none'; });
grip?.addEventListener('pointermove', (event) => { if (drag?.id === event.pointerId) panel.style.transform = `translateY(${Math.max(0, event.clientY - drag.y)}px)`; });
const endDrag = (event) => {
  if (drag?.id !== event.pointerId) return;
  const dy = Math.max(0, event.clientY - drag.y);
  drag = null;
  panel.style.transition = ''; panel.style.transform = '';
  if (dy > 80) closeSheet();
};
grip?.addEventListener('pointerup', endDrag);
grip?.addEventListener('pointercancel', endDrag);

applyFilter();
syncSheet();
graph.fit();
const initial = byMapKey.get(new URLSearchParams(window.location.search).get('node') ?? '');
if (initial) select(initial.id, false);
} catch (error) {
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.textContent = '지도를 불러오지 못했습니다. 아래 시작점이나 헤더의 목록·검색으로 노트를 찾을 수 있습니다.';
  svg.closest('.graph-box').replaceChildren(message);
  console.error(error);
}
