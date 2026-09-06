import { createGraph } from '../graph/engine.mjs';
import { layoutGraph } from '../graph/layout.mjs';
import { panelModel } from '../lib/panel.mjs';

const page = document.querySelector('[data-site]');
const svg = document.querySelector('svg[data-map]');
const panel = document.querySelector('[data-panel]');
const body = document.querySelector('[data-panel-body]');
const emptyPanel = body.innerHTML;
const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const OUT = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4" cy="7" r="2"></circle><path d="M6 7h6m-2.5-2.5L12 7l-2.5 2.5"></path></svg>';
const IN = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="7" r="2"></circle><path d="M8 7H2m2.5-2.5L2 7l2.5 2.5"></path></svg>';

// 그래프 노드인 항목은 data-node를 달아 지도 안에서 선택되게 한다(그래프 밖 노트만 페이지로 이동).
const list = (icon, label, items) => items.length ? `<section class="list-block"><div class="meta">${icon}${label}<span class="count">${items.length}</span></div><div class="scroll-list${items.length > 6 ? ' is-long' : ''}"><ul class="side-list">${items.map((i) => `<li><a href="${escape(i.url)}"${i.nodeId ? ` data-node="${escape(i.nodeId)}"` : ''}>${escape(i.title)}</a></li>`).join('')}</ul></div></section>` : '';

function renderPanel(model) {
  body.innerHTML = `<div class="panel-head">
    <div class="meta">${escape(model.kind)}${model.isHub ? ' · 허브' : ''}${model.date ? ` · ${model.date}` : ''}</div>
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
const withNodeIds = (model) => ({ ...model, outgoing: model.outgoing.map((i) => ({ ...i, nodeId: nodeByPath.get(i.path)?.id })), incoming: model.incoming.map((i) => ({ ...i, nodeId: nodeByPath.get(i.path)?.id })) });
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

graph = createGraph(svg, {
  nodes: site.nodes,
  edges: site.edges,
  positions: layoutGraph(site.nodes, site.edges, { ...stageSize, pad: 40 }),
  mode: 'map',
  nodeScale: 0.85,
  onSelect: (id) => select(id, true),
  onOpen: (id) => { const node = site.nodes.find((n) => n.id === id); if (node) window.location.href = node.url; }
});

function select(id, pushUrl, { open = true } = {}) {
  // 선택해도 시점은 그대로 둔다. 이웃 제목은 자리가 나는 만큼 그 자리에서 보인다.
  graph.select(id);
  const node = site.nodes.find((n) => n.id === id);
  if (node) { renderPanel(withNodeIds(panelModel(notesByPath.get(node.path) ?? node, notesByPath, site.noteEdges))); if (open) panel.dataset.open = ''; }
  else { body.innerHTML = emptyPanel; delete panel.dataset.open; }
  if (pushUrl) {
    const params = new URLSearchParams();
    if (node) params.set('node', node.mapKey);
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  }
  syncSheet();
}

// 시트만 닫는다. 선택은 유지된다. 선택 해제는 빈 곳 탭.
function closeSheet() { delete panel.dataset.open; syncSheet(); }

const pressedTopics = () => new Set([...document.querySelectorAll('[data-topic][aria-pressed="true"]')].map((b) => b.dataset.topic));
const hubFilter = document.querySelector('[data-hub-filter]');
function applyFilter() { const set = pressedTopics(); graph.setFilter({ topics: set.size ? set : null, hubsOnly: hubFilter?.getAttribute('aria-pressed') === 'true' }); }
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
document.querySelector('[data-open-hubs]')?.addEventListener('click', () => { graph.select(null); body.innerHTML = emptyPanel; panel.dataset.open = ''; syncSheet(); });
backdrop?.addEventListener('click', closeSheet);
narrow.addEventListener('change', syncSheet);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && narrow.matches && 'open' in panel.dataset) closeSheet(); });
window.addEventListener('resize', () => graph.fit());

applyFilter();
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
