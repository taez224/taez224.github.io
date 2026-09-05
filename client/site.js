const DATA = __GARDEN_PAYLOAD__;
const viewLabels = { home: '홈', notes: '노트 지도', blog: '글과 연재', development: '문제 해결', books: '책장' };
function readNotePath() { return new URLSearchParams(window.location.search).get('note') || ''; }
function readView() {
  const view = new URLSearchParams(window.location.search).get('view');
  if (Object.hasOwn(viewLabels, view)) return view;
  const note = noteByPath(readNotePath());
  return ({ slipbox: 'notes', blog: 'blog', development: 'development' })[note?.kind] || 'home';
}
function readGraphNode() {
  const id = new URLSearchParams(window.location.search).get('node');
  return DATA.nodes.some((node) => node.id === id) ? id : null;
}
function graphNodeUrl(id) { return `?view=notes&node=${encodeURIComponent(id)}${state.graphMode === 'focus' ? '&focus=1' : ''}`; }
function readGraphMode() { return readGraphNode() && new URLSearchParams(window.location.search).get('focus') === '1' ? 'focus' : 'overview'; }
function viewUrl(view) { return view === 'home' ? window.location.pathname : `?view=${view}`; }
const state = { view: readView(), notePath: readNotePath(), noteOriginView: readView(), graphMode: readGraphMode(), focusRoot: readGraphMode() === 'focus' ? readGraphNode() : null, overviewSnapshot: null, restoreOverview: null, graphBounds: { width: 1200, height: 700 }, topic: 'all', problemTag: 'all', bookStatus: 'all', bookFocusPath: '', selected: readGraphNode(), positions: new Map(), graphTransform: { x: 0, y: 0, scale: 1 } };
const app = document.querySelector('#app');
let graphAnimationFrame = null;
let graphResizeObserver = null;
let graphHoverNode = null;
let graphFocusNode = null;
const kindLabels = { slipbox: 'Slipbox', blog: 'Blog', development: 'Development' };
const graphTopicColors = { AI: '#80698f', 소프트웨어공학: '#5d7897', 커리어: '#9a7852', 지식관리: '#5c806c', 글쓰기: '#9c6e6e', 철학: '#7b7086', 개발: '#5f8184', 기타: '#817f72' };
const graphTopicOrder = ['AI', '소프트웨어공학', '커리어', '지식관리', '글쓰기', '철학', '개발', '기타'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function safeUrl(value) {
  return /^(?:https?:\/\/|mailto:|\?note=|#)/.test(String(value ?? '')) ? value : '#';
}

function nodeDisplayTitle(node) {
  return node.displayTitle || node.title;
}

function noteByPath(notePath) {
  return DATA.notes.find((note) => note.path === notePath);
}

function isToolRecord(note) {
  return note?.category === 'Tools' || DATA.development.tools.some((record) => record.path === note?.path);
}

function noteKindLabel(note) {
  if (note?.kind === 'development') return isToolRecord(note) ? '도구·워크플로' : '문제 해결';
  return ({ slipbox: '노트', blog: '글', book: '독서 기록' })[note?.kind] || '노트';
}

function noteSectionLabel(note) {
  if (note?.kind === 'slipbox') return 'Slipbox';
  if (note?.kind === 'blog') return note.series || '단독 글';
  if (note?.kind === 'development') return isToolRecord(note) ? '도구·워크플로' : '문제 해결';
  if (note?.kind === 'book') return '독서 기록';
  return '공개 노트';
}

function noteUrl(notePath) {
  return `?note=${encodeURIComponent(notePath)}`;
}

function bindInternalNoteLinks() {
  document.querySelectorAll('a.internal-note-link').forEach((link) => {
    if (link.dataset.bound === 'true') return;
    link.dataset.bound = 'true';
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      const target = new URL(link.href, window.location.href);
      navigateToNote(target.searchParams.get('note'), false, target.hash);
    });
  });
}

function navigateToNote(notePath, replace = false, fragment = '') {
  if (!noteByPath(notePath)) return;
  if (!state.notePath) state.noteOriginView = state.view;
  state.notePath = notePath;
  const url = `${noteUrl(notePath)}${fragment || ''}`;
  if (replace) window.history.replaceState({ view: state.view, noteOriginView: state.noteOriginView }, '', url);
  else window.history.pushState({ view: state.view, noteOriginView: state.noteOriginView }, '', url);
  document.querySelector('#global-search-dialog')?.close();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  window.setTimeout(() => {
    const heading = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
    if (heading) heading.scrollIntoView({ block: 'start' });
    else app.focus({ preventScroll: true });
  }, 0);
}

function searchPlainText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function scoreSearchRecord(record, query) {
  const title = searchPlainText(nodeDisplayTitle(record));
  const summary = searchPlainText(record.summary || record.note);
  const tags = searchPlainText((record.tags || []).join(' '));
  const body = searchPlainText(record.bodyHtml);
  let score = 0;
  if (title === query) score += 1000;
  else if (title.startsWith(query)) score += 700;
  else if (title.includes(query)) score += 500;
  if (tags.includes(query)) score += 250;
  if (summary.includes(query)) score += 150;
  if (body.includes(query)) score += 50;
  return score;
}

function globalSearchRecords(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const books = DATA.books.map((book) => ({ ...book, kind: 'book', displayTitle: book.fileTitle, summary: book.note }));
  return [...DATA.notes, ...books]
    .map((record) => ({ record, score: scoreSearchRecord(record, normalized) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || nodeDisplayTitle(left.record).localeCompare(nodeDisplayTitle(right.record), 'ko'))
    .slice(0, 12)
    .map((result) => result.record);
}

function renderGlobalSearchResults(query) {
  const results = document.querySelector('#global-search-results');
  if (!results) return;
  if (!query.trim()) {
    results.innerHTML = '';
    return;
  }
  const records = globalSearchRecords(query);
  if (!records.length) {
    results.innerHTML = '<p class="global-search-empty">검색 결과가 없습니다.</p>';
    return;
  }
  results.innerHTML = `<ul class="global-search-list">${records.map((record) => {
    const title = escapeHtml(nodeDisplayTitle(record));
    const summary = escapeHtml(record.summary || record.note || '');
    const kind = escapeHtml(noteKindLabel(record));
    if (record.kind === 'book') {
      return `<li class="global-search-item"><span class="global-search-kind">${kind}</span><div><button class="global-search-book" type="button" data-book-path="${escapeHtml(record.path)}">${title}</button>${summary ? `<span class="global-search-summary">${summary}</span>` : ''}</div></li>`;
    }
    return `<li class="global-search-item"><span class="global-search-kind">${kind}</span><div><a class="global-search-link internal-note-link" data-note-path="${escapeHtml(record.path)}" href="${safeUrl(record.url)}">${title}</a>${summary ? `<span class="global-search-summary">${summary}</span>` : ''}</div></li>`;
  }).join('')}</ul>`;
  document.querySelectorAll('.global-search-book').forEach((button) => button.addEventListener('click', () => {
    const dialog = document.querySelector('#global-search-dialog');
    dialog?.close();
    state.view = 'books';
    state.notePath = '';
    state.bookStatus = 'all';
    state.bookFocusPath = button.dataset.bookPath;
    window.history.pushState({ view: state.view }, '', viewUrl(state.view));
    render();
    window.setTimeout(() => {
      [...document.querySelectorAll('.book-card')].find((card) => card.dataset.bookPath === state.bookFocusPath)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }));
  bindInternalNoteLinks();
}

function openGlobalSearch() {
  const dialog = document.querySelector('#global-search-dialog');
  const input = document.querySelector('#global-search-input');
  if (!dialog || !input) return;
  input.value = '';
  renderGlobalSearchResults('');
  dialog.showModal();
  input.focus();
}

function visibleNodes() {
  if (state.graphMode === 'focus') return graphNeighborhood(state.focusRoot, DATA.nodes, DATA.edges).nodes;
  return DATA.nodes.filter((node) => {
    const matchesTopic = state.topic === 'all' || node.topic === state.topic;
    return matchesTopic;
  });
}

function graphEmptyDetail() {
  return '노트를 선택하면 이곳에서 읽고, 연결을 따라갈 수 있습니다.';
}

function isGraphWorkspace() { return window.matchMedia('(min-width: 1000px)').matches; }

function graphNodeRadius(node) {
  const base = node.type === 'hub' ? Math.min(18, 9 + Math.sqrt(node.degree + 1) * 2) : Math.min(13, 5 + Math.sqrt(node.degree + 1) * 2);
  return base * (isGraphWorkspace() ? 1.2 : 1);
}

function graphLinePoints(sourceId, targetId) {
  return graphEdgeEndpoints(state.positions.get(sourceId), state.positions.get(targetId),
    graphNodeRadius(DATA.nodes.find((node) => node.id === sourceId)),
    graphNodeRadius(DATA.nodes.find((node) => node.id === targetId)));
}

function configureGraphViewport(svg) {
  svg.style.height = '';
  svg.style.minHeight = '';
  const height = isGraphWorkspace() ? 1200 * svg.clientHeight / svg.clientWidth : 700;
  state.graphBounds = { width: 1200, height };
  svg.setAttribute('viewBox', `0 0 1200 ${height}`);
}

function fittedGraphTransform() {
  const points = [...state.positions.values()];
  if (!points.length) return { x: 0, y: 0, scale: 1 };
  const svg = document.querySelector('#graph');
  const pixelScale = (svg?.clientWidth || 850) / 1200;
  const padding = 55 / pixelScale;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const { width, height } = state.graphBounds;
  const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX),
    (height - padding * 2 - 36 / pixelScale) / Math.max(1, maxY - minY), 2.2);
  return { x: (width - (minX + maxX) * scale) / 2,
    y: (height - 36 / pixelScale - (minY + maxY) * scale) / 2, scale };
}

function toggleGraphFocus() {
  if (state.graphMode === 'overview') {
    if (!state.selected) return;
    state.overviewSnapshot = { selected: state.selected, topic: state.topic,
      positions: new Map([...state.positions].map(([id, point]) => [id, { ...point }])),
      transform: { ...state.graphTransform } };
    state.graphMode = 'focus';
    state.focusRoot = state.selected;
  } else {
    state.graphMode = 'overview';
    state.focusRoot = null;
    if (state.overviewSnapshot) {
      state.selected = state.overviewSnapshot.selected;
      state.topic = state.overviewSnapshot.topic;
      state.restoreOverview = state.overviewSnapshot;
    }
  }
  window.history.pushState({ view: 'notes' }, '', graphNodeUrl(state.selected));
  renderGraph();
}

function fitFocusLayout(svg, nodes, edges) {
  const pixelScale = svg.clientWidth / 1200;
  if (!pixelScale) return;
  configureGraphViewport(svg);
  if (!isGraphWorkspace()) {
    svg.style.minHeight = '0';
    svg.style.height = `${700 * pixelScale}px`;
  }
  state.graphTransform = { x: 0, y: 0, scale: 1 };
  const layer = svg.querySelector('#graph-label-layer');
  layer.innerHTML = nodes.map((node) => graphLabelMarkup(node.id, true)).join('');
  const sizes = [...layer.children].map((element) => {
    const box = element.querySelector('text').getBBox();
    return { id: element.dataset.node, width: box.width + 12 / pixelScale, height: box.height + 7 / pixelScale };
  });
  const layout = layoutGraphFocus(state.focusRoot, sizes, 1200, pixelScale, isGraphWorkspace() ? state.graphBounds.height : 0);
  state.positions = layout.positions;
  if (isGraphWorkspace()) {
    const offsetY = (state.graphBounds.height - layout.height) / 2;
    for (const point of layout.positions.values()) point.y += offsetY;
  } else {
    state.graphBounds = { width: 1200, height: layout.height };
    svg.setAttribute('viewBox', `0 0 1200 ${layout.height}`);
    svg.style.height = `${layout.height * pixelScale}px`;
  }
  for (const element of svg.querySelectorAll('.graph-node')) {
    const point = state.positions.get(element.dataset.node);
    for (const circle of element.querySelectorAll('circle')) {
      circle.setAttribute('cx', point.x);
      circle.setAttribute('cy', point.y);
    }
  }
  for (const element of svg.querySelectorAll('.graph-edge')) {
    const points = graphLinePoints(element.dataset.source, element.dataset.target);
    for (const [attribute, value] of Object.entries(points)) element.setAttribute(attribute, value);
  }
  applyGraphTransform();
}

function renderHome() {
  const featured = (DATA.home?.featured || []).map(noteByPath).filter(Boolean);
  const recent = DATA.notes
    .filter((note) => note.date && note.type !== 'series')
    .sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title, 'ko'))
    .slice(0, 4);
  const book = [...DATA.books].filter((item) => item.note && item.rate).sort((left, right) => right.rate - left.rate)[0];
  const homeTitle = (note) => escapeHtml(nodeDisplayTitle(note).replace(/^🗺\s*/, ''));
  app.innerHTML = `
    <section class="home-about" aria-label="소개"><p><strong>소프트웨어 개발자 TaeZ입니다.</strong> 개발 중 해결한 문제와 AI를 쓰며 생긴 질문을 기록합니다. <br>발행한 글과 계속 다듬는 노트를 함께 두었습니다.</p><nav class="home-contacts" aria-label="TaeZ 프로필과 연락처">${(DATA.home.contacts || []).map((contact) => `<a href="${safeUrl(contact.url)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(contact.name)} 프로필 (새 탭)" title="${escapeHtml(contact.name)}"><img src="assets/social/${escapeHtml(contact.icon)}" alt="" aria-hidden="true" width="20" height="20" /></a>`).join('')}</nav></section>
    <section class="home-featured" aria-label="대표 기록">
      <div class="featured-grid">${featured.map((note, index) => {
        const excerpt = index === 0 && note.summaryIsExplicit ? note.summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || note.summary : '';
        const topics = note.kind === 'development'
          ? (note.tags || []).filter((tag) => tag.startsWith('개발/') && !['개발/트러블슈팅', '개발/도구'].includes(tag)).map((tag) => tag.slice(3)).join(' · ')
          : note.topic || '';
        return `<article class="featured-note">
          <div class="featured-meta"><span>${escapeHtml(noteKindLabel(note))}</span><span class="featured-number" aria-hidden="true">0${index + 1}</span></div>
          <h${index === 0 ? '1' : '2'}><a class="internal-note-link" href="${safeUrl(note.url)}">${homeTitle(note)}</a></h${index === 0 ? '1' : '2'}>
          ${excerpt ? `<p class="featured-excerpt">${escapeHtml(excerpt)}</p>` : ''}
          <div class="featured-foot">${note.publishedUrl ? `<a href="${safeUrl(note.publishedUrl)}" target="_blank" rel="noreferrer">발행 글 ↗</a>` : `<span>${escapeHtml(topics)}</span>`}${DATA.nodes.some((node) => node.path === note.path) ? `<a class="graph-entry-link" data-graph-node="${escapeHtml(note.path)}" href="${graphNodeUrl(note.path)}">지도에서 연결 보기 ↗</a>` : ''}<a class="internal-note-link" href="${safeUrl(note.url)}" aria-label="${homeTitle(note)} 읽기">읽기 <span aria-hidden="true">↗</span></a></div>
        </article>`;
      }).join('')}</div>
    </section>
    ${renderReadingPaths()}
    <div class="home-lower">
      <section class="home-recent" aria-labelledby="recent-heading">
        <div class="home-section-heading"><h2 id="recent-heading">최근 기록</h2><span>작성·발행일 순</span></div>
        <ol class="recent-list">${recent.map((note) => `<li><a class="internal-note-link" href="${safeUrl(note.url)}"><span class="recent-kind">${escapeHtml(noteKindLabel(note))}</span><span class="recent-title">${homeTitle(note)}</span><time datetime="${escapeHtml(note.date)}">${escapeHtml(note.date.replaceAll('-', '.'))}</time></a></li>`).join('')}</ol>
      </section>
      ${book ? `<aside class="home-book"><div class="home-section-heading"><h2>책장</h2><a class="text-action" href="?view=books" data-view="books">모두 보기 ↗</a></div><blockquote>${escapeHtml(book.note)}</blockquote><p>${escapeHtml(book.fileTitle || book.title)}</p></aside>` : ''}
    </div>`;
  bindInternalNoteLinks();
  bindViewLinks();
  bindGraphLinks();
}

function openGraphNode(nodeId) {
  if (!DATA.nodes.some((node) => node.id === nodeId)) return;
  state.view = 'notes';
  state.notePath = '';
  state.graphMode = 'overview';
  state.focusRoot = null;
  state.topic = 'all';
  state.selected = nodeId;
  window.history.pushState({ view: 'notes' }, '', graphNodeUrl(nodeId));
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  app.focus({ preventScroll: true });
}

function bindGraphLinks() {
  document.querySelectorAll('a[data-graph-node]').forEach((link) => link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openGraphNode(link.dataset.graphNode);
  }));
}

function hashPosition(id, width, height, index) {
  let hash = 0;
  for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const angle = Math.abs(hash % 628) / 100;
  const radius = 80 + Math.abs(hash % 190);
  return {
    x: width / 2 + Math.cos(angle) * radius + ((index % 5) - 2) * 24,
    y: height / 2 + Math.sin(angle) * radius + ((index % 7) - 3) * 18
  };
}

function layoutGraph(nodes, edges, width = 1200, height = 700) {
  const positions = new Map(nodes.map((node, index) => [node.id, hashPosition(node.id, width, height, index)]));
  if (!nodes.length) return positions;
  const activeTopics = graphTopicOrder.filter((topic) => nodes.some((node) => node.topic === topic));
  const anchorSets = {
    1: [{ x: width * .5, y: height * .5 }],
    2: [{ x: width * .3, y: height * .5 }, { x: width * .7, y: height * .5 }],
    3: [{ x: width * .25, y: height * .3 }, { x: width * .75, y: height * .3 }, { x: width * .5, y: height * .73 }],
    4: [{ x: width * .28, y: height * .28 }, { x: width * .72, y: height * .28 }, { x: width * .28, y: height * .72 }, { x: width * .72, y: height * .72 }],
    5: [{ x: width * .22, y: height * .28 }, { x: width * .5, y: height * .2 }, { x: width * .78, y: height * .28 }, { x: width * .32, y: height * .72 }, { x: width * .68, y: height * .72 }],
    6: [{ x: width * .2, y: height * .24 }, { x: width * .5, y: height * .19 }, { x: width * .8, y: height * .24 }, { x: width * .2, y: height * .73 }, { x: width * .5, y: height * .78 }, { x: width * .8, y: height * .73 }]
  };
  const anchors = anchorSets[Math.min(activeTopics.length, 6)];
  const centers = new Map(activeTopics.map((topic, index) => [topic, anchors[index % anchors.length]]));
  const edgePairs = edges.filter((edge) => positions.has(edge.source) && positions.has(edge.target));
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const force = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = positions.get(nodes[leftIndex].id);
        const right = positions.get(nodes[rightIndex].id);
        let dx = left.x - right.x;
        let dy = left.y - right.y;
        const distance = Math.max(18, Math.hypot(dx, dy));
        const strength = 3200 / (distance * distance);
        dx = dx / distance * strength;
        dy = dy / distance * strength;
        force.get(nodes[leftIndex].id).x += dx;
        force.get(nodes[leftIndex].id).y += dy;
        force.get(nodes[rightIndex].id).x -= dx;
        force.get(nodes[rightIndex].id).y -= dy;
      }
    }
    for (const edge of edgePairs) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const strength = (distance - 125) * .0045;
      dx = dx / distance * strength;
      dy = dy / distance * strength;
      force.get(edge.source).x += dx;
      force.get(edge.source).y += dy;
      force.get(edge.target).x -= dx;
      force.get(edge.target).y -= dy;
    }
    for (const node of nodes) {
      const point = positions.get(node.id);
      const center = centers.get(node.topic) ?? { x: width / 2, y: height / 2 };
      const pull = iteration < 40 ? .0025 : .0011;
      const currentForce = force.get(node.id);
      currentForce.x += (center.x - point.x) * pull;
      currentForce.y += (center.y - point.y) * pull;
      point.x = Math.max(24, Math.min(width - 24, point.x + currentForce.x * 8));
      point.y = Math.max(24, Math.min(height - 24, point.y + currentForce.y * 8));
    }
  }
  return positions;
}

function clearSelection() {
  if (state.graphMode === 'focus') return;
  cancelGraphAnimation();
  state.selected = null;
  const focusButton = document.querySelector('[data-graph-action="focus"]');
  if (focusButton) focusButton.disabled = true;
  window.history.replaceState({ view: 'notes' }, '', viewUrl('notes'));
  const detail = document.querySelector('#detail');
  if (detail) {
    detail.classList.add('empty');
    detail.innerHTML = graphEmptyDetail();
  }
  document.querySelectorAll('.graph-node').forEach((element) => {
    element.setAttribute('aria-pressed', 'false');
    element.classList.remove('is-selected', 'is-neighbor', 'is-dim');
  });
  document.querySelectorAll('.graph-edge').forEach((element) => element.classList.remove('is-connected', 'is-dim'));
  layoutGraphLabels();
}

function applyGraphTransform() {
  const scene = document.querySelector('#graph-scene');
  if (!scene) return;
  const { x, y, scale } = state.graphTransform;
  scene.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`);
  layoutGraphLabels();
}

function previewGraphNode(nodeId) {
  if (graphHoverNode === nodeId) return;
  graphHoverNode = nodeId;
  updateGraphPreview();
}

// Hover paints an independent, pointer-transparent label at the same node.
// It cannot change the base labels or the pointer's hit target.
function updateGraphPreview() {
  const activeId = graphHoverNode || graphFocusNode;
  document.querySelectorAll('#graph .graph-node, #graph-label-layer .graph-label-item').forEach((element) => {
    element.classList.toggle('is-preview', element.dataset.node === activeId);
  });
  renderGraphHover(activeId);
}

function graphLabelMarkup(nodeId, full = false) {
  const svg = document.querySelector('#graph');
  const point = state.positions.get(nodeId);
  const node = DATA.nodes.find((item) => item.id === nodeId);
  if (!point || !node || !svg?.getScreenCTM()) return '';
  const matrix = svg.getScreenCTM();
  const pixelScale = Math.hypot(matrix.a, matrix.b);
  const fontSize = (isGraphWorkspace() ? 15 : 13) / pixelScale;
  const { x, y, scale } = state.graphTransform;
  const radius = graphNodeRadius(node) * scale;
  const title = nodeDisplayTitle(node).replace(/^🗺\s*/, '');
  const characters = [...title], lines = [];
  const lineLength = state.graphMode === 'focus' ? (svg.clientWidth < 500 ? 10 : 16) : 10;
  if (full || state.graphMode === 'focus') lines.push(...graphTitleLines(title, lineLength));
  else lines.push(...wrapGraphLabel(title, 10));
  const labelX = point.x * scale + x;
  const labelY = point.y * scale + y + radius + 7 / pixelScale;
  return `<g class="${full ? 'graph-hover-label' : 'graph-label-item'}${nodeId === state.selected ? ' is-active' : ''}" data-node="${escapeHtml(nodeId)}" transform="translate(${labelX} ${labelY})"><text class="graph-label-text" text-anchor="middle" dominant-baseline="hanging" style="font-size:${fontSize}px">${lines.map((line, index) => `<tspan x="0" dy="${index ? fontSize * 1.3 : 0}">${escapeHtml(line)}</tspan>`).join('')}</text></g>`;
}

function renderGraphHover(nodeId) {
  const layer = document.querySelector('#graph-hover-layer');
  if (layer) layer.innerHTML = nodeId ? graphLabelMarkup(nodeId, true) : '';
}

function layoutGraphLabels() {
  const svg = document.querySelector('#graph');
  const layer = document.querySelector('#graph-label-layer');
  if (!svg || !layer) return;
  const candidates = [...svg.querySelectorAll('.graph-node')].filter((element) =>
    element.dataset.node === state.selected || element.classList.contains('is-neighbor')
    || state.graphMode === 'focus' || (!state.selected && (element.classList.contains('is-hub') || state.topic !== 'all')));
  // Fixed anchors: only visibility changes; hover never runs this pass.
  candidates.sort((a, b) => Number(a.dataset.node === state.selected) - Number(b.dataset.node === state.selected));
  layer.innerHTML = candidates.map((element) => graphLabelMarkup(element.dataset.node)).join('');
  if (state.graphMode === 'overview') {
    const bounds = svg.getBoundingClientRect();
    const labels = [...layer.children].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.node, x: rect.left - bounds.left, y: rect.top - bounds.top,
        width: rect.width, height: rect.height, selected: element.dataset.node === state.selected };
    });
    const obstacles = [...svg.querySelectorAll('.graph-node')].map((element) => {
      const rect = element.querySelector('.graph-node-dot').getBoundingClientRect();
      return { id: element.dataset.node, x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
    });
    const visible = new Set(visibleFixedLabels(labels, obstacles, { width: bounds.width, height: bounds.height }));
    for (const element of [...layer.children]) if (!visible.has(element.dataset.node)) element.remove();
  }
  updateGraphPreview();
}

function cancelGraphAnimation() {
  if (graphAnimationFrame !== null) cancelAnimationFrame(graphAnimationFrame);
  graphAnimationFrame = null;
}

function animateGraphTransform(target, duration = 320) {
  cancelGraphAnimation();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    state.graphTransform = target;
    applyGraphTransform();
    return;
  }
  const start = { ...state.graphTransform };
  const startedAt = performance.now();
  const ease = (value) => 1 - Math.pow(1 - value, 3);
  const frame = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = ease(progress);
    state.graphTransform = {
      x: start.x + (target.x - start.x) * eased,
      y: start.y + (target.y - start.y) * eased,
      scale: start.scale + (target.scale - start.scale) * eased
    };
    applyGraphTransform();
    if (progress < 1) graphAnimationFrame = requestAnimationFrame(frame);
    else graphAnimationFrame = null;
  };
  graphAnimationFrame = requestAnimationFrame(frame);
}

function focusGraphNode(nodeId) {
  const point = state.positions.get(nodeId);
  if (!point) return;
  const scale = Math.max(state.graphTransform.scale, 1.2);
  animateGraphTransform({ x: 600 - point.x * scale, y: 350 - point.y * scale, scale });
}

function graphPoint(svg, event) {
  const point = new DOMPoint(event.clientX, event.clientY);
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function wrapGraphLabel(value, maxLength = 12) {
  const characters = [...String(value ?? '')];
  const lines = [];
  while (characters.length && lines.length < 2) lines.push(characters.splice(0, maxLength).join(''));
  if (characters.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  return lines.length ? lines : [''];
}

function zoomGraph(factor, focus = { x: state.graphBounds.width / 2, y: state.graphBounds.height / 2 }) {
  cancelGraphAnimation();
  const current = state.graphTransform;
  const scale = Math.max(.65, Math.min(3.2, current.scale * factor));
  const worldX = (focus.x - current.x) / current.scale;
  const worldY = (focus.y - current.y) / current.scale;
  state.graphTransform = {
    scale,
    x: focus.x - worldX * scale,
    y: focus.y - worldY * scale
  };
  applyGraphTransform();
}

function resetGraphView() {
  cancelGraphAnimation();
  state.graphTransform = state.graphMode === 'focus' ? { x: 0, y: 0, scale: 1 } : fittedGraphTransform();
  applyGraphTransform();
}

function relatedNotes(nodeId, direction) {
  const paths = new Set(DATA.noteEdges
    .filter((edge) => direction === 'out' ? edge.source === nodeId : edge.target === nodeId)
    .map((edge) => direction === 'out' ? edge.target : edge.source));
  return [...paths]
    .map((path) => noteByPath(path))
    .filter(Boolean)
    .sort((left, right) => left.title.localeCompare(right.title, 'ko'));
}

function detailRelationItem(note) {
  const title = escapeHtml(nodeDisplayTitle(note));
  if (DATA.nodes.some((candidate) => candidate.path === note.path)) {
    return `<li><button class="detail-related-node" type="button" data-node="${escapeHtml(note.path)}"><span class="detail-related-title">${title}</span></button></li>`;
  }
  return noteContextLink(note);
}

function renderConnections(outgoing, incoming, renderItem = noteContextLink) {
  return `<div class="note-connections">
    <section class="context-block"><div class="context-heading">이 노트가 연결한 것 · ${outgoing.length}</div>${outgoing.length ? `<ul class="context-list">${outgoing.map(renderItem).join('')}</ul>` : '<p class="context-meta">직접 연결된 노트가 없습니다.</p>'}</section>
    <section class="context-block"><div class="context-heading">이 노트를 연결한 것 · ${incoming.length}</div>${incoming.length ? `<ul class="context-list">${incoming.map(renderItem).join('')}</ul>` : '<p class="context-meta">이 노트를 가리키는 노트가 없습니다.</p>'}</section>
  </div>`;
}

let mermaidPromise = null;
function loadMermaid() {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
    script.async = true;
    script.onload = () => window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid did not load'));
    script.onerror = () => reject(new Error('Mermaid failed to load'));
    document.head.appendChild(script);
  });
  return mermaidPromise;
}

async function renderMermaid() {
  const codeBlocks = [...document.querySelectorAll('.markdown-body pre code.language-mermaid')];
  if (!codeBlocks.length) return;
  const containers = codeBlocks.map((code) => {
    const source = code.textContent.trim();
    const container = document.createElement('div');
    container.className = 'mermaid';
    container.dataset.source = source;
    code.parentElement.replaceWith(container);
    container.textContent = source;
    return container;
  });
  try {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        background: '#fbfaf6',
        fontFamily: 'Pretendard, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif',
        lineColor: '#746f64',
        primaryColor: '#e3ece5',
        primaryTextColor: '#242720',
        secondaryColor: '#f2efe7',
        tertiaryColor: '#fbfaf6'
      }
    });
    await mermaid.run({ nodes: containers });
  } catch {
    containers.forEach((container) => {
      const pre = document.createElement('pre');
      pre.className = 'mermaid-fallback';
      const code = document.createElement('code');
      code.className = 'language-mermaid';
      code.textContent = container.dataset.source || '';
      pre.appendChild(code);
      container.replaceWith(pre);
    });
  }
}

function selectNode(nodeId, shouldFocus = false) {
  if (state.graphMode === 'focus' && state.focusRoot !== nodeId) {
    state.focusRoot = nodeId;
    state.selected = nodeId;
    renderGraph();
    return;
  }
  state.selected = nodeId;
  const focusButton = document.querySelector('[data-graph-action="focus"]');
  if (focusButton) focusButton.disabled = false;
  window.history.replaceState({ view: 'notes' }, '', graphNodeUrl(nodeId));
  const node = DATA.nodes.find((candidate) => candidate.id === nodeId);
  const detail = document.querySelector('#detail');
  if (!node || !detail) return;
  const relatedIds = new Set();
  for (const edge of DATA.edges) {
    if (edge.source === nodeId) relatedIds.add(edge.target);
    if (edge.target === nodeId) relatedIds.add(edge.source);
  }
  const outgoing = relatedNotes(nodeId, 'out');
  const incoming = relatedNotes(nodeId, 'in');
  const tags = (node.tags || []).filter((tag) => tag !== 'slipbox').slice(0, 6);
  const summary = node.summaryIsExplicit
    ? `<p class="excerpt">${escapeHtml(node.summary)}</p>`
    : '';
  detail.classList.remove('empty');
  detail.innerHTML = `
    <div class="kind">${escapeHtml(noteKindLabel(node))}${node.type ? ` · ${escapeHtml(node.type)}` : ''}</div>
    <h3>${escapeHtml(nodeDisplayTitle(node))}</h3>
    ${tags.length ? `<div class="detail-tags">${tags.map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    ${summary}
    <a class="detail-link internal-note-link" data-note-path="${escapeHtml(node.path)}" href="${safeUrl(node.url)}">이 노트 열기 →</a>
    ${renderConnections(outgoing, incoming, detailRelationItem)}`;
  document.querySelectorAll('.detail-related-node[data-node]').forEach((button) => {
    button.addEventListener('click', () => selectNode(button.dataset.node));
    button.addEventListener('pointerenter', () => previewGraphNode(button.dataset.node));
    button.addEventListener('pointerleave', () => previewGraphNode(null));
    button.addEventListener('focus', () => { graphFocusNode = button.dataset.node; updateGraphPreview(); });
    button.addEventListener('blur', () => { graphFocusNode = null; updateGraphPreview(); });
  });
  bindInternalNoteLinks();
  document.querySelectorAll('.graph-node').forEach((element) => {
    const isSelected = element.dataset.node === nodeId;
    element.setAttribute('aria-pressed', String(isSelected));
    element.classList.toggle('is-selected', isSelected);
    element.classList.toggle('is-neighbor', relatedIds.has(element.dataset.node));
    element.classList.toggle('is-dim', !isSelected && !relatedIds.has(element.dataset.node));
  });
  document.querySelectorAll('.graph-edge').forEach((element) => {
    const touchesSelected = element.dataset.source === nodeId || element.dataset.target === nodeId;
    element.classList.toggle('is-connected', touchesSelected);
    element.classList.toggle('is-dim', !touchesSelected);
  });
  layoutGraphLabels();
  if (shouldFocus) focusGraphNode(nodeId);
}

function noteContextLink(note) {
  return `<li><a class="internal-note-link" data-note-path="${escapeHtml(note.path)}" href="${safeUrl(note.url)}">${escapeHtml(nodeDisplayTitle(note))}</a></li>`;
}

function localGraphNeighbors(notePath) {
  const neighbors = new Map();
  for (const edge of DATA.noteEdges) {
    if (edge.source !== notePath && edge.target !== notePath) continue;
    const neighborPath = edge.source === notePath ? edge.target : edge.source;
    const neighbor = noteByPath(neighborPath);
    if (!neighbor) continue;
    const relation = neighbors.get(neighborPath) || { note: neighbor, outgoing: false, incoming: false };
    if (edge.source === notePath) relation.outgoing = true;
    if (edge.target === notePath) relation.incoming = true;
    neighbors.set(neighborPath, relation);
  }
  return [...neighbors.values()].sort((left, right) => left.note.title.localeCompare(right.note.title, 'ko'));
}

function localGraphLabel(note, x, y, centerX, centerY, current = false) {
  if (current) return '';
  const lines = wrapGraphLabel(nodeDisplayTitle(note), 8);
  const anchor = 'middle';
  const labelX = x;
  const labelY = y + 16;
  return `<text class="local-graph-label" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${lines.map((line, index) => `<tspan x="${labelX.toFixed(1)}" dy="${index === 0 ? 0 : 11}">${escapeHtml(line)}</tspan>`).join('')}</text>`;
}

function renderLocalGraph(note) {
  const relations = localGraphNeighbors(note.path);
  const visible = relations.slice(0, 8);
  const centerX = 150;
  const centerY = 135;
  const twoRings = visible.length > 6;
  const innerCount = twoRings ? Math.ceil(visible.length / 2) : visible.length;
  const points = visible.map((relation, index) => {
    const inner = !twoRings || index < innerCount;
    const ringIndex = inner ? index : index - innerCount;
    const ringCount = inner ? innerCount : visible.length - innerCount;
    const radius = twoRings ? (inner ? 65 : 96) : 98;
    const phase = inner ? 0 : Math.PI / Math.max(ringCount, 1);
    const angle = -Math.PI / 2 + phase + (Math.PI * 2 * ringIndex) / Math.max(ringCount, 1);
    return { ...relation, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  });
  if (!relations.length) {
    return `<section class="context-block local-graph-section"><div class="context-heading">로컬 그래프</div><p class="local-graph-empty">직접 연결된 노트가 없습니다.</p></section>`;
  }
  const edgeMarkup = points.flatMap((point) => {
    const center = { x: centerX, y: centerY };
    const directions = [];
    if (point.outgoing) directions.push(graphEdgeEndpoints(center, point, 13, 6.5));
    if (point.incoming) directions.push(graphEdgeEndpoints(point, center, 6.5, 13));
    return directions.map((edge) => `<line class="local-graph-edge" ${Object.entries(edge).map(([key, value]) => `${key}="${value.toFixed(1)}"`).join(' ')} marker-end="url(#local-graph-direction)" />`);
  }).join('');
  const nodeMarkup = points.map((point) => {
    const color = graphTopicColors[point.note.topic] || graphTopicColors.기타;
    const label = localGraphLabel(point.note, point.x, point.y, centerX, centerY);
    return `<g class="local-graph-node" data-note-path="${escapeHtml(point.note.path)}" tabindex="0" role="button" aria-label="${escapeHtml(nodeDisplayTitle(point.note))}"><title>${escapeHtml(nodeDisplayTitle(point.note))}</title><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="6.5" fill="${color}" />${label}</g>`;
  }).join('');
  const currentColor = graphTopicColors[note.topic] || graphTopicColors.기타;
  return `<section class="context-block local-graph-section"><div class="context-heading"><span>로컬 그래프</span><span>${relations.length}개 연결</span></div><div class="local-graph-tools"><button type="button" data-local-zoom="out" aria-label="로컬 그래프 축소">−</button><button type="button" data-local-zoom="reset" aria-label="로컬 그래프 배율 초기화">100%</button><button type="button" data-local-zoom="in" aria-label="로컬 그래프 확대">＋</button>${DATA.nodes.some((node) => node.path === note.path) ? `<a class="internal-map-link" data-graph-node="${escapeHtml(note.path)}" href="?view=notes&amp;node=${encodeURIComponent(note.path)}&amp;focus=1">큰 지도로 ↗</a>` : ''}</div><svg class="local-graph" viewBox="0 0 300 300" role="group" aria-label="현재 노트 중심의 연결 그래프"><defs><marker id="local-graph-direction" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 1 L 8 4 L 0 7 Z" fill="var(--accent)" /></marker></defs><g class="local-graph-scene">${edgeMarkup}<g class="local-graph-node is-current" aria-label="현재 노트"><title>현재 노트: ${escapeHtml(nodeDisplayTitle(note))}</title><circle class="local-graph-current-ring" cx="${centerX}" cy="${centerY}" r="19" /><circle cx="${centerX}" cy="${centerY}" r="13" fill="${currentColor}" />${localGraphLabel(note, centerX, centerY, centerX, centerY, true)}</g>${nodeMarkup}</g></svg>${relations.length > visible.length ? `<p class="local-graph-hint">그래프에는 가까운 연결 ${visible.length}개를 표시했습니다. 전체 연결은 아래 목록에서 확인할 수 있습니다.</p>` : '<p class="local-graph-hint">주변 노트를 선택하면 해당 노트로 이동합니다.</p>'}</section>`;
}

function bindLocalGraph() {
  const svg = document.querySelector('.local-graph');
  if (svg) {
    let scale = 1;
    const applyZoom = () => {
      svg.querySelector('.local-graph-scene').setAttribute('transform', `translate(${150 * (1 - scale)} ${150 * (1 - scale)}) scale(${scale})`);
      document.querySelector('[data-local-zoom="reset"]').textContent = `${Math.round(scale * 100)}%`;
    };
    document.querySelectorAll('[data-local-zoom]').forEach((button) => button.addEventListener('click', () => {
      scale = button.dataset.localZoom === 'reset' ? 1 : Math.max(.7, Math.min(2.5, scale * (button.dataset.localZoom === 'in' ? 1.2 : 1 / 1.2)));
      applyZoom();
    }));
    svg.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && event.deltaMode !== 1) return;
      event.preventDefault();
      scale = Math.max(.7, Math.min(2.5, scale * Math.exp(-event.deltaY * .008)));
      applyZoom();
    }, { passive: false });
    const mapLink = document.querySelector('.internal-map-link');
    mapLink?.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      if (!DATA.nodes.some((node) => node.id === mapLink.dataset.graphNode)) return;
      state.graphMode = 'focus'; state.focusRoot = mapLink.dataset.graphNode;
      state.selected = state.focusRoot; state.view = 'notes'; state.notePath = '';
      state.overviewSnapshot = null; state.restoreOverview = null;
      window.history.pushState({ view: 'notes' }, '', graphNodeUrl(state.selected));
      render(); window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  document.querySelectorAll('.local-graph-node[data-note-path]').forEach((node) => {
    if (node.dataset.bound === 'true') return;
    node.dataset.bound = 'true';
    const open = () => navigateToNote(node.dataset.notePath);
    node.addEventListener('click', open);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function renderNoteView() {
  const note = noteByPath(state.notePath);
  if (!note) {
    document.title = 'TaeZ · 글과 노트';
    app.innerHTML = '<div class="empty-state">찾을 수 없는 공개 노트입니다.</div>';
    return;
  }
  document.title = `${note.title} · TaeZ`;
  const outgoing = DATA.noteEdges
    .filter((edge) => edge.source === note.path)
    .map((edge) => noteByPath(edge.target))
    .filter(Boolean);
  const incoming = DATA.noteEdges
    .filter((edge) => edge.target === note.path)
    .map((edge) => noteByPath(edge.source))
    .filter(Boolean);
  const properties = [
    `<span class="note-property kind">${escapeHtml(noteKindLabel(note))}</span>`,
    note.type ? `<span class="note-property">${escapeHtml(note.type)}</span>` : '',
    note.status ? `<span class="note-property">${escapeHtml(note.status)}</span>` : '',
    ...(note.tags || []).filter((tag) => tag !== 'slipbox').slice(0, 8).map((tag) => `<span class="note-property">${escapeHtml(tag)}</span>`)
  ].filter(Boolean).join('');
  const publicationLink = note.publishedUrl
    ? `<a class="context-link" href="${safeUrl(note.publishedUrl)}" target="_blank" rel="noreferrer" title="실제 발행 글 열기">발행 글 보기 ↗</a>`
    : '';
  const noteToc = (note.headings || []).length >= 2
    ? `<section class="context-block"><div class="context-heading">목차</div><ol class="note-toc">${note.headings.map((heading) => `<li class="level-${heading.level}"><a href="#${encodeURIComponent(heading.id)}">${escapeHtml(heading.title)}</a></li>`).join('')}</ol></section>`
    : '';
  app.innerHTML = `
    <div class="note-view">
      <article class="note-article">
        <div class="note-view-nav"><button class="note-back" type="button" data-note-back>← ${escapeHtml(viewLabels[state.noteOriginView] || '홈')}</button><span>${escapeHtml(noteSectionLabel(note))}</span></div>
        <div class="note-kicker"><span>${escapeHtml(noteKindLabel(note))}</span>${note.date ? `<time datetime="${escapeHtml(note.date)}">작성일 · ${escapeHtml(note.date)}</time>` : ''}</div>
        <div class="note-title-row"><h1>${escapeHtml(note.title)}</h1>${publicationLink ? `<div class="note-publication">${publicationLink}</div>` : ''}</div>
        ${note.summaryIsExplicit && note.summary ? `<div class="note-lead"><span class="note-lead-label">요약</span>${escapeHtml(note.summary)}</div>` : ''}
        ${properties ? `<div class="note-properties">${properties}</div>` : ''}
        <div class="markdown-body">${note.bodyHtml || '<p class="related-empty">본문이 없습니다.</p>'}</div>
      </article>
      <aside class="note-context">
        ${noteToc}
        ${renderLocalGraph(note)}
        ${renderConnections(outgoing, incoming)}
      </aside>
    </div>`;
  document.querySelector('[data-note-back]').addEventListener('click', () => {
    navigateToView(state.noteOriginView || 'home');
  });
  bindInternalNoteLinks();
  bindLocalGraph();
  renderMermaid();
}

function renderReadingPaths() {
  const paths = DATA.paths.map((path, index) => {
    const items = path.items.filter((item) => !item.missing);
    if (!items.length) return '';
    return `<details class="reading-path"><summary><span class="reading-index">${String(index + 1).padStart(2, '0')}</span><span class="reading-heading"><span class="reading-title">${escapeHtml(path.title)}</span><span class="reading-preview">${escapeHtml(items[0].label)}</span></span><span class="reading-count">${items.filter((item) => !item.external).length}개 기록 <span aria-hidden="true">＋</span></span></summary><ol>${items.map((item) => `<li><a class="${item.external ? '' : 'internal-note-link'}" href="${safeUrl(item.url)}">${escapeHtml(item.label)}${item.external ? ' ↗' : ''}</a></li>`).join('')}</ol></details>`;
  }).join('');
  return paths ? `<section class="home-paths" aria-labelledby="paths-heading"><div class="home-section-heading"><h2 id="paths-heading">묶어서 읽기</h2></div><div class="reading-path-grid">${paths}</div></section>` : '';
}

function renderGraph() {
  const scope = state.graphMode === 'focus' ? graphNeighborhood(state.focusRoot, DATA.nodes, DATA.edges) : { nodes: DATA.nodes, edges: DATA.edges };
  const topics = graphTopicOrder.filter((topic) => scope.nodes.some((node) => node.topic === topic));
  app.innerHTML = `
    <div class="view-head">
      <div><h1 class="map-title">노트 지도</h1><p>노트를 고르고, 연결된 생각을 따라가 보세요.</p></div>
      <span class="count">${scope.nodes.length}개 노트 · ${scope.edges.length}개 연결</span>
    </div>
    <div class="graph-layout">
      <div class="card graph-card">
        <div class="graph-controls"><span>클릭: 선택 · 제목 클릭/더블클릭: 노트 열기</span><span class="graph-control-buttons"><button class="graph-control graph-focus-toggle" type="button" data-graph-action="focus" aria-pressed="${state.graphMode === 'focus'}"${!state.selected ? ' disabled' : ''}>${state.graphMode === 'focus' ? '전체 지도로' : '연결만 보기'}</button><button class="graph-control" type="button" data-graph-action="zoom-out" aria-label="축소">−</button><button class="graph-control" type="button" data-graph-action="reset">맞춤</button><button class="graph-control" type="button" data-graph-action="zoom-in" aria-label="확대">＋</button></span></div>
        <div class="graph-stage"><svg id="graph" viewBox="0 0 1200 700" role="group" aria-label="노트 연결 그래프"></svg></div>
        <div class="legend" aria-label="노트 주제 범례">
          ${topics.map((topic) => state.graphMode === 'focus' ? `<span class="legend-key"><i class="dot" style="background:${graphTopicColors[topic]}"></i>${escapeHtml(topic)}</span>` : `<button class="legend-filter${state.topic === topic ? ' active' : ''}" type="button" data-topic="${escapeHtml(topic)}" aria-pressed="${state.topic === topic}"><i class="dot" style="background:${graphTopicColors[topic]}"></i>${escapeHtml(topic)}</button>`).join('')}
          <span><i class="dot hub-dot"></i>허브</span><span class="edge-legend"><span aria-hidden="true">→</span> 링크 방향</span>
        </div>
      </div>
      <aside id="detail" class="card detail note-context empty">노트를 선택하면 연결 정보와 읽기 버튼이 여기에 표시됩니다.</aside>
    </div>`;

  mountGraph();
}

function mountGraph() {
  document.querySelectorAll('.legend-filter').forEach((button) => button.addEventListener('click', () => {
    state.topic = state.topic === button.dataset.topic ? 'all' : button.dataset.topic;
    state.selected = null;
    window.history.replaceState({ view: 'notes' }, '', viewUrl('notes'));
    renderGraph();
  }));
  const nodes = visibleNodes();
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = DATA.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    && (state.graphMode !== 'focus' || edge.source === state.focusRoot || edge.target === state.focusRoot));
  const svg = document.querySelector('#graph');
  configureGraphViewport(svg);
  const positions = state.restoreOverview?.positions || layoutGraph(nodes, edges, state.graphBounds.width, state.graphBounds.height);
  state.positions = positions;
  graphResizeObserver?.disconnect();
  graphHoverNode = null;
  graphFocusNode = null;
  const lineMarkup = edges.map((edge) => {
    const points = graphLinePoints(edge.source, edge.target);
    return `<line class="graph-edge" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}" ${Object.entries(points).map(([key, value]) => `${key}="${value.toFixed(1)}"`).join(' ')} />`;
  }).join('');
  const nodeMarkup = nodes.map((node) => {
    const point = positions.get(node.id);
    const isHub = node.type === 'hub';
    const radius = graphNodeRadius(node);
    const ring = isHub ? `<circle class="graph-hub-ring" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${(radius + 5).toFixed(1)}" />` : '';
    return `<g class="graph-node${isHub ? ' is-hub' : ''}" data-node="${escapeHtml(node.id)}" tabindex="0" role="button" aria-label="${escapeHtml(nodeDisplayTitle(node))}" aria-pressed="false"><circle class="graph-node-hit" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="26" fill="transparent" />${ring}<circle class="graph-node-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${graphTopicColors[node.topic] || graphTopicColors.기타}" /></g>`;
  }).join('');
  svg.innerHTML = `<defs><marker id="graph-direction-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 1 L 10 5 L 0 9 Z" fill="var(--accent)" /></marker></defs><g id="graph-scene">${lineMarkup + nodeMarkup}</g><g id="graph-label-layer"></g><g id="graph-hover-layer" aria-hidden="true"></g>`;
  if (state.graphMode === 'focus') fitFocusLayout(svg, nodes, edges);
  else if (state.restoreOverview) {
    state.graphTransform = { ...state.restoreOverview.transform };
    state.restoreOverview = null;
    applyGraphTransform();
  } else resetGraphView();
  document.querySelectorAll('.graph-node').forEach((element) => {
    let clickTimer = null;
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      if (clickTimer !== null) window.clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => {
        clickTimer = null;
        if (state.selected === element.dataset.node) clearSelection();
        else selectNode(element.dataset.node);
      }, 180);
    });
    element.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (clickTimer !== null) window.clearTimeout(clickTimer);
      clickTimer = null;
      navigateToNote(element.dataset.node);
    });
    element.addEventListener('focus', () => { graphFocusNode = element.dataset.node; updateGraphPreview(); });
    element.addEventListener('blur', () => { graphFocusNode = null; updateGraphPreview(); });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); navigateToNote(element.dataset.node); }
      else if (event.key === ' ') { event.preventDefault(); if (state.selected === element.dataset.node) clearSelection(); else selectNode(element.dataset.node); }
    });
  });
  const gesture = createGraphGesture();
  svg.addEventListener('click', (event) => {
    if (!gesture.shouldSuppressClick()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  svg.addEventListener('dblclick', (event) => {
    if (!gesture.shouldSuppressClick()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  svg.addEventListener('pointermove', (event) => {
    if (gesture.active() || event.pointerType === 'touch') return;
    const target = event.target.closest?.('.graph-node, .graph-label-item');
    previewGraphNode(target?.dataset.node || null);
  });
  svg.addEventListener('pointerleave', () => previewGraphNode(null));
  document.querySelector('#graph-label-layer').addEventListener('click', (event) => {
    const label = event.target.closest('.graph-label-item');
    if (!label) return;
    event.stopPropagation();
    navigateToNote(label.dataset.node);
  });
  const pointerData = (event) => {
    const point = graphPoint(svg, event);
    return { id: event.pointerId, x: point.x, y: point.y,
      touch: event.pointerType === 'touch', onNode: Boolean(event.target.closest?.('.graph-node, .graph-label-item')) };
  };
  const capturePointers = () => {
    for (const id of gesture.ids()) if (!svg.hasPointerCapture(id)) svg.setPointerCapture(id);
  };
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (!gesture.down(pointerData(event), state.graphTransform)) return;
    cancelGraphAnimation();
    if (gesture.ids().length > 1 || (event.pointerType !== 'touch' && !pointerData(event).onNode)) capturePointers();
  });
  svg.addEventListener('pointermove', (event) => {
    const matrix = svg.getScreenCTM();
    const transform = gesture.move(pointerData(event), 3 / Math.hypot(matrix.a, matrix.b));
    if (!transform) return;
    event.preventDefault();
    capturePointers();
    graphHoverNode = null;
    graphFocusNode = null;
    svg.classList.add('is-panning');
    state.graphTransform = transform;
    applyGraphTransform();
  }, { passive: false });
  const finishGesture = (event) => {
    gesture.end(event.pointerId);
    if (!gesture.active()) svg.classList.remove('is-panning');
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  };
  svg.addEventListener('pointerup', finishGesture);
  svg.addEventListener('pointercancel', finishGesture);
  svg.addEventListener('lostpointercapture', (event) => {
    // Ignore implicit capture moving from a child circle to the SVG during pinch.
    if (event.target !== svg) return;
    gesture.end(event.pointerId);
    if (!gesture.active()) svg.classList.remove('is-panning');
  });
  svg.addEventListener('click', (event) => {
    if (!event.target.closest?.('.graph-node, .graph-label-item')) clearSelection();
  });
  svg.addEventListener('wheel', (event) => {
    const isTrackpadPinch = event.ctrlKey;
    const isLineBasedMouseWheel = event.deltaMode === 1;
    if (!isTrackpadPinch && !isLineBasedMouseWheel) return;
    event.preventDefault();
    const factor = Math.max(.82, Math.min(1.22, Math.exp(-event.deltaY * .008)));
    zoomGraph(factor, graphPoint(svg, event));
  }, { passive: false });
  document.querySelector('[data-graph-action="focus"]').addEventListener('click', toggleGraphFocus);
  document.querySelector('[data-graph-action="zoom-out"]')?.addEventListener('click', () => zoomGraph(.84));
  document.querySelector('[data-graph-action="reset"]')?.addEventListener('click', resetGraphView);
  document.querySelector('[data-graph-action="zoom-in"]')?.addEventListener('click', () => zoomGraph(1.19));
  bindViewLinks();
  bindInternalNoteLinks();
  let graphWidth = svg.clientWidth, graphHeight = svg.clientHeight, workspace = isGraphWorkspace();
  graphResizeObserver = new ResizeObserver(() => {
    const nextWorkspace = isGraphWorkspace();
    if (Math.abs(svg.clientWidth - graphWidth) > 1 || (nextWorkspace && Math.abs(svg.clientHeight - graphHeight) > 1) || workspace !== nextWorkspace) {
      graphWidth = svg.clientWidth;
      graphHeight = svg.clientHeight;
      workspace = nextWorkspace;
      if (state.graphMode === 'focus') fitFocusLayout(svg, nodes, edges);
      else { configureGraphViewport(svg); resetGraphView(); }
      graphHeight = svg.clientHeight;
    } else layoutGraphLabels();
  });
  graphResizeObserver.observe(svg);
  if (state.selected && nodeIds.has(state.selected)) selectNode(state.selected);
}

function blogStatusLabel(status) {
  return ({ active: '진행 중', completed: '완결', 'on-hold': '잠정 중단' })[status] || status || '상태 미상';
}


function publicationLink(post, className = '') {
  if (!post.publishedUrl) return '';
  const publication = post.publication === 'Nextree 기술 블로그' ? 'Nextree' : post.publication || '발행본';
  return `<a class="publication-link ${className}" href="${safeUrl(post.publishedUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(post.title)} — ${escapeHtml(publication)} 발행본">${escapeHtml(publication)} <span aria-hidden="true">↗</span></a>`;
}

function renderWritingPost(post) {
  const title = post.title || post.fileTitle;
  const summary = post.summaryIsExplicit ? String(post.summary || '').trim() : '';
  const excerpt = summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || summary;
  return `<li class="writing-post"><article>
    <div class="writing-post-meta">${post.published ? `<time datetime="${escapeHtml(post.published)}">${escapeHtml(post.published.replaceAll('-', '.'))}</time>` : ''}${publicationLink(post)}</div>
    <h3><a class="internal-note-link" href="${safeUrl(post.url)}">${escapeHtml(title)}</a></h3>
    ${excerpt ? `<p class="writing-excerpt">${escapeHtml(excerpt)}</p>` : ''}
  </article></li>`;
}

function renderWritingSeries(group, index) {
  const posts = [...group.posts].sort((a, b) => a.seriesOrder - b.seriesOrder || a.published.localeCompare(b.published));
  if (!posts.length) return '';
  const first = posts[0];
  return `<article class="writing-series">
    <div class="series-kicker"><span class="series-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span>${posts.length}편 · ${escapeHtml(blogStatusLabel(group.status))}</span></div>
    <h3>${escapeHtml(group.title)}</h3>
    <div class="series-entry"><a class="internal-note-link" href="${safeUrl(first.url)}" aria-label="${escapeHtml(group.title)} 1편부터 읽기">1편부터 읽기 <span aria-hidden="true">→</span></a></div>
    <details class="series-contents"><summary><span>목차</span><span class="series-disclosure" aria-hidden="true">＋</span></summary>
      <ol>${posts.map((post) => `<li value="${post.seriesOrder}"><div class="series-chapter"><a class="series-chapter-title internal-note-link" href="${safeUrl(post.url)}">${escapeHtml(post.title || post.fileTitle)}</a>${publicationLink(post)}</div></li>`).join('')}</ol>
    </details>
  </article>`;
}

function renderBlog() {
  const series = DATA.blog.series;
  const standalone = DATA.blog.publications.flatMap((group) => group.posts)
    .sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title, 'ko'));
  const total = standalone.length + series.reduce((sum, group) => sum + group.posts.length, 0);
  app.innerHTML = `
    <div class="view-head writing-head"><h1>글과 연재</h1><span class="count">${total}편 · 연재 ${series.length}개</span></div>
    <nav class="writing-jumps" aria-label="글과 연재 바로가기"><a href="#writing-posts">단독 글 <span>${standalone.length}</span></a><a href="#writing-series">연재 <span>${series.length}</span></a></nav>
    <div class="writing-layout">
      <section class="writing-main" aria-labelledby="writing-posts"><div class="writing-section-heading"><h2 id="writing-posts">단독 글</h2><span>최신순</span></div>
        ${standalone.length ? `<ol class="writing-posts">${standalone.map(renderWritingPost).join('')}</ol>` : '<p class="empty-state">공개된 단독 글이 없습니다.</p>'}
      </section>
      <aside class="writing-series-shelf" aria-labelledby="writing-series"><div class="writing-section-heading"><h2 id="writing-series">연재</h2><span>${series.length}개</span></div>
        ${series.length ? series.map(renderWritingSeries).join('') : '<p class="empty-state">공개된 연재가 없습니다.</p>'}
      </aside>
    </div>`;
  bindInternalNoteLinks();
}

function visibleBooks() {
  return state.bookStatus === 'all' ? DATA.books : DATA.books.filter((book) => book.status === state.bookStatus);
}

function ratingMarkup(rate) {
  // The build payload uses zero for an absent rating.
  if (!rate || !Number.isFinite(rate)) return '<span class="empty-rating">미평가</span>';
  const value = Number.isInteger(rate) ? rate.toFixed(1) : String(rate);
  return `<data class="book-rating-value" value="${rate}" aria-label="내 평점 ${value}, 5점 만점">${value}</data><span class="book-rating-scale" aria-hidden="true">/ 5</span>`;
}

function renderBookCard(book) {
  const title = book.fileTitle || book.title;
  const coverUrl = safeUrl(book.coverUrl);
  const fallback = `<span class="book-cover-placeholder"${coverUrl !== '#' ? ' hidden' : ''} aria-hidden="true">${escapeHtml(title)}</span>`;
  const cover = coverUrl !== '#'
    ? `<img class="book-cover" src="${coverUrl}" alt="${escapeHtml(title)} 표지" width="88" height="128" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />${fallback}`
    : fallback;
  const review = String(book.note || '').trim();
  const hasReview = review && !/^한줄평\.{0,3}$/.test(review);
  return `<article class="book-card${book.path === state.bookFocusPath ? ' is-focused' : ''}" data-book-path="${escapeHtml(book.path)}" aria-label="${escapeHtml(title)}">
    <div class="book-cover-wrap">${cover}</div>
    <div class="book-content">
      <div class="book-heading"><h3 class="book-title">${escapeHtml(title)}</h3><div class="book-rating">${ratingMarkup(book.rate)}</div></div>
      ${hasReview ? `<blockquote class="book-note">${escapeHtml(book.note)}</blockquote>` : ''}
      <div class="book-meta">
        ${book.author || book.publisher ? `<p class="book-byline">${escapeHtml([book.author, book.publisher].filter(Boolean).join(' · '))}</p>` : ''}
        ${book.status ? `<p class="book-reading-meta"><span class="book-status">${escapeHtml(book.status)}</span>${book.finishDate ? `<span class="book-finished">${escapeHtml(book.finishDate)}</span>` : ''}</p>` : ''}
      </div>
    </div>
  </article>`;
}

function renderBooks() {
  const books = visibleBooks();
  const tierOrder = ['S', 'A', 'B', 'C', 'D', '미분류'];
  const statusOptions = [['all', '전체'], ['읽는 중', '읽는 중'], ['완독', '완독'], ['중단', '중단'], ['예정', '예정']];
  const tierSections = tierOrder.map((tier) => {
    const tierBooks = books.filter((book) => book.tier === tier);
    if (!tierBooks.length) return '';
    return `<section class="book-tier-section${tierBooks.length === 1 ? ' is-single' : ''}" aria-labelledby="book-tier-heading-${escapeHtml(tier)}" id="book-tier-${escapeHtml(tier)}"><div class="book-tier-heading"><h2 id="book-tier-heading-${escapeHtml(tier)}"${tier === '미분류' ? ' class="unrated-tier"' : ''}>${tier === '미분류' ? '미평가' : tier}</h2><span>${tierBooks.length}권</span></div><div class="book-grid">${tierBooks.map(renderBookCard).join('')}</div></section>`;
  }).join('');
  app.innerHTML = `
    <div class="view-head">
      <div><h1 class="books-title">책장</h1></div>
      <div class="book-view-tools"><label class="book-filter" for="book-status-filter">읽기 상태 <select id="book-status-filter" class="book-status-select">${statusOptions.map(([value, label]) => `<option value="${escapeHtml(value)}"${state.bookStatus === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label><span class="count book-count" aria-live="polite" aria-atomic="true">${books.length}권</span></div>
    </div>
    ${books.length ? tierSections : '<div class="empty-state">조건에 맞는 책이 없습니다.</div>'}`;
  document.querySelector('#book-status-filter').addEventListener('change', (event) => {
    state.bookStatus = event.target.value;
    state.bookFocusPath = '';
    renderBooks();
    document.querySelector('#book-status-filter').focus({ preventScroll: true });
  });
  if (state.bookFocusPath) {
    window.setTimeout(() => [...document.querySelectorAll('.book-card')].find((card) => card.dataset.bookPath === state.bookFocusPath)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }
}

const problemPreviewCache = new Map();
function developmentPreview(record) {
  if (problemPreviewCache.has(record.path)) return problemPreviewCache.get(record.path);
  const template = document.createElement('template');
  // bodyHtml is already sanitized by the shared publication renderer.
  template.innerHTML = noteByPath(record.path)?.bodyHtml || '';
  const paragraphs = (element, limit) => [...(element?.children || [])]
    .filter((child) => child.tagName === 'P' && child.textContent.trim())
    .slice(0, limit).map((child) => child.outerHTML).join('');
  const section = (title, limit) => {
    const callout = [...template.content.querySelectorAll('.callout')].find((element) =>
      element.querySelector('.callout-title, summary')?.textContent.trim() === title);
    return paragraphs(callout?.querySelector('.callout-body'), limit);
  };
  const preview = { problem: section('문제', 2), cause: section('원인', 1), introduction: paragraphs(template.content, 1) };
  problemPreviewCache.set(record.path, preview);
  return preview;
}

function displayDevelopmentTags(record) {
  return (record.tags || []).filter((tag) => tag.startsWith('개발/') && !['개발/트러블슈팅', '개발/도구'].includes(tag))
    .map((tag) => tag.slice(3));
}

function renderProblemRecord(record, index) {
  const preview = developmentPreview(record);
  const tags = displayDevelopmentTags(record);
  return `<article class="problem-record" data-problem-path="${escapeHtml(record.path)}">
    <span class="problem-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
    <div class="problem-heading"><h2><a class="internal-note-link" href="${safeUrl(record.url)}">${escapeHtml(record.title || record.fileTitle)}</a></h2>
      <div class="problem-meta">${tags.length ? `<span>${tags.map(escapeHtml).join(' · ')}</span>` : ''}${record.date ? `<time datetime="${escapeHtml(record.date)}">${escapeHtml(record.date.replaceAll('-', '.'))}</time>` : ''}</div>
    </div>
    <div class="problem-context">
      ${preview.problem ? `<div class="problem-excerpt"><span class="problem-section-label">증상</span>${preview.problem}</div>` : ''}
      ${preview.cause ? `<details class="problem-cause"><summary><span>원인 보기</span><span aria-hidden="true">＋</span></summary><div class="problem-cause-body">${preview.cause}</div><a class="problem-read internal-note-link" href="${safeUrl(record.url)}">전체 기록 읽기 <span aria-hidden="true">→</span></a></details>` : `<a class="problem-read internal-note-link" href="${safeUrl(record.url)}">전체 기록 읽기 →</a>`}
    </div>
  </article>`;
}

function renderDevelopment() {
  const problems = DATA.development.troubleshooting;
  const tools = DATA.development.tools;
  const tags = [...new Set(problems.flatMap((record) => displayDevelopmentTags(record)))].sort((a, b) => a.localeCompare(b, 'ko'));
  const visible = state.problemTag === 'all' ? problems : problems.filter((record) => displayDevelopmentTags(record).includes(state.problemTag));
  app.innerHTML = `
    <div class="view-head problem-head"><h1>문제 해결</h1><span class="count">${problems.length}개 문제${tools.length ? ` · <a href="#problem-tools-heading">도구 ${tools.length}개 ↓</a>` : ''}</span></div>
    <div class="problem-toolbar"><div class="problem-filters" role="group" aria-label="문제 기록 기술 필터">${['all', ...tags].map((tag) => `<button type="button" class="problem-filter" data-problem-tag="${escapeHtml(tag)}" aria-pressed="${state.problemTag === tag}">${tag === 'all' ? '전체' : escapeHtml(tag)}</button>`).join('')}</div><span class="problem-result-count" aria-live="polite" aria-atomic="true">${visible.length}개 기록</span></div>
    <section class="problem-records" aria-label="트러블슈팅 기록">${visible.length ? visible.map(renderProblemRecord).join('') : '<p class="empty-state">해당 기술의 문제 기록이 없습니다.</p>'}</section>
    ${tools.length ? `<section class="problem-tools" aria-labelledby="problem-tools-heading"><div class="problem-tools-heading"><h2 id="problem-tools-heading">도구·워크플로</h2><span>${tools.length}개</span></div><div class="problem-tools-grid">${tools.map((record) => {
      const preview = developmentPreview(record);
      return `<article class="problem-tool"><h3><a class="internal-note-link" href="${safeUrl(record.url)}">${escapeHtml(record.title || record.fileTitle)}</a></h3>${preview.introduction ? `<div class="problem-tool-intro">${preview.introduction}</div>` : ''}<a class="problem-read internal-note-link" href="${safeUrl(record.url)}">기록 읽기 →</a></article>`;
    }).join('')}</div></section>` : ''}`;
  document.querySelectorAll('[data-problem-tag]').forEach((button) => button.addEventListener('click', () => {
    const tag = button.dataset.problemTag;
    state.problemTag = tag;
    renderDevelopment();
    [...document.querySelectorAll('[data-problem-tag]')].find((element) => element.dataset.problemTag === tag)?.focus({ preventScroll: true });
  }));
  bindInternalNoteLinks();
}

function render() {
  document.body.classList.toggle('map-workspace', state.view === 'notes' && !state.notePath);
  cancelGraphAnimation();
  graphResizeObserver?.disconnect();
  graphHoverNode = null;
  graphFocusNode = null;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === state.view);
    if (tab.dataset.view === state.view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  app.classList.toggle('is-home', state.view === 'home' && !state.notePath);
  if (!state.notePath) document.title = 'TaeZ · 글과 노트';
  if (state.notePath) renderNoteView();
  else if (state.view === 'home') renderHome();
  else if (state.view === 'notes') renderGraph();
  else if (state.view === 'development') renderDevelopment();
  else if (state.view === 'blog') renderBlog();
  else if (state.view === 'books') renderBooks();
  else renderHome();
}

function navigateToView(view) {
  if (!Object.hasOwn(viewLabels, view)) return;
  state.view = view;
  state.notePath = '';
  state.bookFocusPath = '';
  state.topic = 'all';
  state.selected = null;
  state.graphMode = 'overview';
  state.focusRoot = null;
  state.overviewSnapshot = null;
  window.history.pushState({ view }, '', viewUrl(view));
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  app.focus({ preventScroll: true });
}

function bindViewLinks() {
  document.querySelectorAll('a[data-view]').forEach((link) => {
    if (link.dataset.bound === 'true') return;
    link.dataset.bound = 'true';
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      navigateToView(link.dataset.view);
    });
  });
}
bindViewLinks();
window.addEventListener('popstate', (event) => {
  state.notePath = readNotePath();
  state.selected = readGraphNode();
  const mode = readGraphMode();
  if (mode === 'overview' && state.graphMode === 'focus') state.restoreOverview = state.overviewSnapshot;
  state.graphMode = mode;
  state.focusRoot = mode === 'focus' ? state.selected : null;
  state.view = event.state?.view || readView();
  state.noteOriginView = event.state?.noteOriginView || state.view;
  render();
});
const globalSearchDialog = document.querySelector('#global-search-dialog');
const globalSearchInput = document.querySelector('#global-search-input');
const searchTrigger = document.querySelector('#global-search-trigger');
const shortcut = searchShortcut(navigator.userAgentData?.platform || navigator.platform, navigator.userAgent, navigator.maxTouchPoints);
const shortcutHint = searchTrigger.querySelector('kbd');
shortcutHint.textContent = shortcut;
shortcutHint.hidden = !shortcut;
searchTrigger.setAttribute('aria-label', shortcut ? `전체 검색 (${shortcut})` : '전체 검색');
searchTrigger.title = searchTrigger.getAttribute('aria-label');
searchTrigger.addEventListener('click', openGlobalSearch);
document.querySelector('.global-search-close').addEventListener('click', () => globalSearchDialog.close());
globalSearchInput.addEventListener('input', (event) => renderGlobalSearchResults(event.target.value));
globalSearchDialog.addEventListener('click', (event) => { if (event.target === globalSearchDialog) globalSearchDialog.close(); });
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openGlobalSearch();
  }
});
render();
