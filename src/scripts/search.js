import { matchRecord, normalizeQuery } from '../lib/search-match.mjs';
import { searchShortcut } from '../lib/shortcuts.mjs';

const dialog = document.getElementById('search');
const input = document.getElementById('search-input');
const results = document.getElementById('search-results');
const hint = document.querySelector('[data-search-hint]');
const triggers = [...document.querySelectorAll('[data-search-open]')];
let index = null;
let queryVersion = 0;

const shortcut = searchShortcut(navigator.platform, navigator.userAgent, navigator.maxTouchPoints);
if (shortcut) { hint.textContent = shortcut; hint.hidden = false; for (const t of triggers) t.title = `검색 (${shortcut})`; }

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function loadIndex() {
  index ??= fetch(dialog.dataset.index).then((response) => {
    if (!response.ok) throw new Error(`Search index: ${response.status}`);
    return response.json();
  }).catch((error) => { index = null; throw error; });
  return index;
}
function open() { if (!dialog.open) dialog.showModal(); input.focus(); input.select(); render(); }
async function render() {
  const version = ++queryVersion;
  const terms = normalizeQuery(input.value);
  if (!terms.length) { results.replaceChildren(); return; }
  results.textContent = '검색 색인을 불러오는 중입니다.';
  try {
    const records = await loadIndex();
    if (version !== queryVersion || !dialog.open) return;
    const hits = records.map((r) => ({ r, m: matchRecord(r, terms) })).filter((x) => x.m).sort((a, b) => b.m.score - a.m.score).slice(0, 30);
    if (!hits.length) { results.innerHTML = '<p class="search-empty">검색 결과가 없습니다.</p>'; return; }
    results.innerHTML = hits.map(({ r, m }) => `<div class="search-item"><span class="search-kind">${escapeHtml(r.label)}</span><div><a href="${escapeHtml(r.url)}">${escapeHtml(r.title)}</a><small>${escapeHtml(m.snippet || r.summary || '')}</small></div></div>`).join('');
  } catch {
    if (version !== queryVersion || !dialog.open) return;
    results.innerHTML = '<p class="search-empty">검색을 불러오지 못했습니다.</p><button type="button" data-search-retry>다시 시도</button>';
    results.querySelector('[data-search-retry]')?.addEventListener('click', render, { once: true });
  }
}
dialog.addEventListener('close', () => { queryVersion++; });
for (const t of triggers) t.addEventListener('click', open);
input.addEventListener('input', render);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); dialog.open ? dialog.close() : open(); }
});
