import { highlightParts, matchRecord, normalizeQuery, resultCountLabel, SEARCH_PAGE, type SearchRecord } from '../lib/search-match.ts';
import { escapeHtml } from '../lib/format.ts';
import { searchShortcut } from '../lib/shortcuts.ts';
import { closeOnBackdrop } from './dialog-backdrop.ts';
import { inPageLink } from './in-page-link.ts';

interface Hit { r: SearchRecord; m: NonNullable<ReturnType<typeof matchRecord>> }

const dialog = document.querySelector<HTMLDialogElement>('#search')!;
const input = document.querySelector<HTMLInputElement>('#search-input')!;
const results = document.getElementById('search-results')!;
const status = document.getElementById('search-status')!;
const form = dialog.querySelector('.search-head');
const closeButton = dialog.querySelector('.search-close');
const triggers = [...document.querySelectorAll<HTMLButtonElement>('[data-search-open]')];
const EMPTY_HINT = status.textContent ?? '';
let index: Promise<SearchRecord[]> | null = null;
let queryVersion = 0;
let hits: Hit[] = [];
let queryTerms: string[] = [];
let shown = 0;

const shortcut = searchShortcut(navigator.platform, navigator.userAgent, navigator.maxTouchPoints);
if (shortcut) for (const t of triggers) t.title = `검색 (${shortcut})`;

function loadIndex(): Promise<SearchRecord[]> {
  index ??= fetch(dialog.dataset.index!).then((response) => {
    if (!response.ok) throw new Error(`Search index: ${response.status}`);
    return response.json();
  }).catch((error) => { index = null; throw error; });
  return index;
}
function open() { if (!dialog.open) dialog.showModal(); input.focus(); input.select(); render(); }
// 조각마다 이스케이프하고 표시만 여기서 붙인다. 원문을 통째로 넣으면 노트의 글이 태그가 된다.
const marked = (text: string) => highlightParts(text, queryTerms)
  .map((part) => (part.hit ? `<mark>${escapeHtml(part.text)}</mark>` : escapeHtml(part.text))).join('');
function itemHtml({ r, m }: Hit): string {
  return `<div class="search-item"><span class="search-kind">${escapeHtml(r.label)}</span><div><a href="${escapeHtml(r.url)}">${marked(r.title)}</a><small>${marked(m.snippet || r.summary || '')}</small></div></div>`;
}
// 결과를 다시 그리면 눌렀던 더 보기 버튼이 사라지므로, 새로 붙인 첫 결과로 초점을 옮겨 키보드 사용자가 자리를 잃지 않게 한다.
function paint(focusFrom = -1) {
  const page = hits.slice(0, shown);
  status.textContent = resultCountLabel(hits.length, page.length);
  const more = shown < hits.length ? '<button type="button" class="text-button search-more" data-search-more>더 보기</button>' : '';
  results.innerHTML = page.map(itemHtml).join('') + more;
  results.querySelector('[data-search-more]')?.addEventListener('click', () => {
    const from = shown;
    shown = Math.min(shown + SEARCH_PAGE, hits.length);
    paint(from);
  }, { once: true });
  if (focusFrom >= 0) results.querySelectorAll<HTMLAnchorElement>('.search-item a')[focusFrom]?.focus();
}
async function render() {
  const version = ++queryVersion;
  const terms = normalizeQuery(input.value);
  queryTerms = terms;
  hits = [];
  shown = 0;
  if (!terms.length) { status.textContent = EMPTY_HINT; results.replaceChildren(); return; }
  status.textContent = '검색 색인을 불러오는 중입니다.';
  results.replaceChildren();
  try {
    const records = await loadIndex();
    if (version !== queryVersion || !dialog.open) return;
    hits = records.map((r) => ({ r, m: matchRecord(r, terms) })).filter((x): x is Hit => x.m !== null).sort((a, b) => b.m.score - a.m.score);
    if (!hits.length) { status.textContent = '검색 결과가 없습니다.'; return; }
    shown = Math.min(SEARCH_PAGE, hits.length);
    paint();
  } catch {
    if (version !== queryVersion || !dialog.open) return;
    status.textContent = '검색을 불러오지 못했습니다.';
    results.innerHTML = '<button type="button" class="text-button search-retry" data-search-retry>다시 시도</button>';
    results.querySelector('[data-search-retry]')?.addEventListener('click', render, { once: true });
  }
}
dialog.addEventListener('close', () => { queryVersion++; });
// search 입력의 기본 Escape는 검색어만 지우므로, 닫기 안내와 맞춰 창을 닫고 검색어를 보존한다. 조합 취소는 IME에 맡긴다.
dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  dialog.close();
});
// 책 결과는 책장 안의 앵커라, 책장에서 누르면 페이지를 다시 열지 않고 스크롤만 한다. 검색창이 남아 도착한 책을 가리므로
// 같은 페이지로 가는 결과는 이동하기 전에 닫는다.
results.addEventListener('click', (event) => { if (inPageLink(event)) dialog.close(); });
closeOnBackdrop(dialog);
form?.addEventListener('submit', (event) => { event.preventDefault(); render(); });
closeButton?.addEventListener('click', () => dialog.close());
for (const t of triggers) t.addEventListener('click', open);
input.addEventListener('input', render);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); dialog.open ? dialog.close() : open(); }
});
