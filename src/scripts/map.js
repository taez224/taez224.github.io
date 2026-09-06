import { createGraph } from '../graph/engine.mjs';
import { layoutGraph } from '../graph/layout.mjs';
import { graphNeighborhood } from '../graph/focus.mjs';
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

const list = (icon, label, items) => items.length ? `<section class="list-block"><div class="meta">${icon}${label}<span class="count">${items.length}</span></div><div class="scroll-list${items.length > 6 ? ' is-long' : ''}"><ul class="side-list">${items.map((i) => `<li><a href="${escape(i.url)}">${escape(i.title)}</a></li>`).join('')}</ul></div></section>` : '';

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
const byMapKey = new Map(site.nodes.map((n) => [n.mapKey, n]));
const full = { nodes: site.nodes, edges: site.edges, positions: layoutGraph(site.nodes, site.edges, { width: 1000, height: 640 }) };
let graph = null;
let focusRoot = null;

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

function mount(data) {
  graph?.destroy();
  graph = createGraph(svg, {
    ...data,
    mode: 'map',
    onSelect: (id) => select(id, true),
    onOpen: (id) => { const node = site.nodes.find((n) => n.id === id); if (node) window.location.href = node.url; }
  });
  applyTopics();
}

function select(id, pushUrl) {
  graph.select(id);
  focusButton.disabled = !id;
  const node = site.nodes.find((n) => n.id === id);
  if (node) { renderPanel(panelModel(notesByPath.get(node.path) ?? node, notesByPath, site.noteEdges)); panel.dataset.open = ''; }
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
  focusRoot = rootId;
  focusButton.setAttribute('aria-pressed', String(Boolean(rootId)));
  if (rootId) {
    const sub = graphNeighborhood(rootId, site.nodes, site.edges);
    mount({ nodes: sub.nodes, edges: sub.edges, positions: layoutGraph(sub.nodes, sub.edges, { width: 1000, height: 640 }) });
  } else mount(full);
  select(rootId ?? previousSelection, true);
}

const pressedTopics = () => new Set([...document.querySelectorAll('[data-topic][aria-pressed="true"]')].map((b) => b.dataset.topic));
function applyTopics() { const set = pressedTopics(); graph.setTopics(set.size ? set : null); }
for (const button of document.querySelectorAll('[data-topic]')) button.addEventListener('click', () => { button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')); applyTopics(); });
document.querySelector('[data-graph-zoom="in"]').addEventListener('click', () => graph.zoom(1.25));
document.querySelector('[data-graph-zoom="out"]').addEventListener('click', () => graph.zoom(1 / 1.25));
document.querySelector('[data-graph-zoom="fit"]').addEventListener('click', () => graph.fit());
focusButton.addEventListener('click', () => setFocus(focusRoot ? null : graph.selected()));
document.querySelector('[data-panel-close]')?.addEventListener('click', () => select(null, true));
document.querySelector('[data-open-hubs]')?.addEventListener('click', () => { graph.select(null); focusButton.disabled = true; body.innerHTML = emptyPanel; panel.dataset.open = ''; syncSheet(); });
backdrop?.addEventListener('click', () => select(null, true));
narrow.addEventListener('change', syncSheet);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && narrow.matches && 'open' in panel.dataset) select(null, true); });
window.addEventListener('resize', () => graph.fit());

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
