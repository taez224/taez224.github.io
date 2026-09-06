import { createGraph } from '../graph/engine.mjs';
import { layoutGraph } from '../graph/layout.mjs';
import { graphNeighborhood, layoutDesktopFocus } from '../graph/focus.mjs';
import { panelModel } from '../lib/panel.mjs';

const page = document.querySelector('[data-site]');
const svg = document.querySelector('svg[data-map]');
const panel = document.querySelector('[data-panel]');
const body = document.querySelector('[data-panel-body]');
const emptyPanel = body.innerHTML;
const focusButton = document.querySelector('[data-graph-focus]');
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
// 세로로 긴 화면(모바일)에서는 배치 상자도 세로로 두어 무대를 채운다.
// SVG는 마운트 전까지 기본 크기(300×150)라서 CSS로 크기가 정해진 상자를 잰다.
const rect = svg.parentElement.getBoundingClientRect();
const box = rect.height > rect.width ? { width: 640, height: Math.round((640 * rect.height) / rect.width) } : { width: 1000, height: 640 };
const full = { nodes: site.nodes, edges: site.edges, positions: layoutGraph(site.nodes, site.edges, box) };
let graph = null;
let focusRoot = null;

const backdrop = document.querySelector('[data-sheet-backdrop]');
const stage = document.querySelector('.map-stage');
const graphBox = svg.parentElement;
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

function mount(data) {
  graph?.destroy();
  graph = createGraph(svg, {
    ...data,
    mode: 'map',
    onSelect: (id) => select(id, true),
    onOpen: (id) => { const node = site.nodes.find((n) => n.id === id); if (node) window.location.href = node.url; }
  });
  applyFilter();
}

function focusData(sub, rootId) {
  if (!window.matchMedia('(min-width: 1000px)').matches) return { nodes: sub.nodes, edges: sub.edges, positions: layoutGraph(sub.nodes, sub.edges, box), labelAll: true };
  const width = Math.max(320, Math.round(graphBox.clientWidth || 1000));
  const layout = layoutDesktopFocus(rootId, sub.nodes, width);
  graphBox.style.height = `${Math.max(420, layout.height)}px`;
  return { nodes: sub.nodes, edges: sub.edges, positions: layout.positions, labelAll: true, labelLines: layout.labelLines, fitBounds: { x: 0, y: 0, scale: 1 } };
}

function select(id, pushUrl, { open = true } = {}) {
  graph.select(id);
  // 연결만 보기 중에는 선택을 풀어도 버튼을 살려 둔다. 그래야 모드를 끌 수 있다.
  focusButton.disabled = !id && !focusRoot;
  const node = site.nodes.find((n) => n.id === id);
  if (node) { renderPanel(withNodeIds(panelModel(notesByPath.get(node.path) ?? node, notesByPath, site.noteEdges))); if (open) panel.dataset.open = ''; }
  else { body.innerHTML = emptyPanel; delete panel.dataset.open; }
  if (pushUrl) {
    const params = new URLSearchParams();
    if (node) params.set('node', node.mapKey);
    if (focusRoot) params.set('focus', '1');
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  }
  syncSheet();
}

function setFocus(rootId) {
  const previousSelection = graph?.selected();
  const previousFocusRoot = focusRoot;
  focusRoot = rootId;
  focusButton.setAttribute('aria-pressed', String(Boolean(rootId)));
  if (rootId) {
    const sub = graphNeighborhood(rootId, site.nodes, site.edges);
    mount(focusData(sub, rootId));
  } else {
    graphBox.style.height = '';
    mount(full);
  }
  // 모바일: 시트를 다시 띄우지 않는다. 방금 본 연결을 가리면 안 된다.
  const selection = rootId && previousFocusRoot !== rootId ? rootId : previousSelection;
  select(selection, true, { open: false });
}

// 시트만 닫는다. 선택은 유지되어 "연결만 보기"를 누를 수 있다. 선택 해제는 빈 곳 탭.
function closeSheet() { delete panel.dataset.open; syncSheet(); }

const pressedTopics = () => new Set([...document.querySelectorAll('[data-topic][aria-pressed="true"]')].map((b) => b.dataset.topic));
const hubFilter = document.querySelector('[data-hub-filter]');
function applyFilter() { const set = pressedTopics(); graph.setFilter({ topics: set.size ? set : null, hubsOnly: hubFilter?.getAttribute('aria-pressed') === 'true' }); }
const toggle = (button) => { button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')); applyFilter(); };
for (const button of document.querySelectorAll('[data-topic]')) button.addEventListener('click', () => toggle(button));
hubFilter?.addEventListener('click', () => toggle(hubFilter));
// 패널의 시작점·참조·역참조 링크는 페이지로 가지 않고 지도에서 그 노드를 고른다. 연결만 보기 중에 범위 밖 노드면 그 노드로 다시 좁힌다.
panel.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-node]');
  if (!link) return;
  event.preventDefault();
  const id = link.dataset.node;
  if (focusRoot && !graph.has(id)) setFocus(id); else select(id, true);
});
document.querySelector('[data-graph-zoom="in"]').addEventListener('click', () => graph.zoom(1.25));
document.querySelector('[data-graph-zoom="out"]').addEventListener('click', () => graph.zoom(1 / 1.25));
document.querySelector('[data-graph-zoom="fit"]').addEventListener('click', () => graph.fit());
focusButton.addEventListener('click', () => setFocus(focusRoot ? null : graph.selected()));
document.querySelector('[data-panel-close]')?.addEventListener('click', closeSheet);
document.querySelector('[data-open-hubs]')?.addEventListener('click', () => { graph.select(null); focusButton.disabled = true; body.innerHTML = emptyPanel; panel.dataset.open = ''; syncSheet(); });
backdrop?.addEventListener('click', closeSheet);
narrow.addEventListener('change', syncSheet);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && narrow.matches && 'open' in panel.dataset) closeSheet(); });
window.addEventListener('resize', () => {
  if (focusRoot && window.matchMedia('(min-width: 1000px)').matches) setFocus(focusRoot);
  else graph.fit();
});

mount(full);
const params = new URLSearchParams(window.location.search);
const initial = byMapKey.get(params.get('node') ?? '');
if (initial && params.get('focus') === '1') { graph.select(initial.id); setFocus(initial.id); }
else if (initial) select(initial.id, false);
} catch (error) {
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.textContent = '지도를 불러오지 못했습니다. 아래 시작점이나 헤더의 목록·검색으로 노트를 찾을 수 있습니다.';
  svg.closest('.graph-box').replaceChildren(message);
  console.error(error);
}
