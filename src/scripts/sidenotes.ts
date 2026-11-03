import { hashTarget } from './in-page-link.ts';
// 원본 각주 항목을 그대로 배치해 앵커·코드 복사·반복 참조의 복귀 링크를 보존한다.
export function setupSidenotes(refs: HTMLAnchorElement[]) {
  const view = document.querySelector<HTMLElement>('.note-view');
  const article = view?.querySelector<HTMLElement>('.note-article');
  const wide = matchMedia('(min-width: 1121px) and (min-width: 100em)');
  const notes = new Map<HTMLElement, HTMLAnchorElement[]>();
  for (const ref of refs) {
    const item = hashTarget(ref.hash);
    if (item) notes.set(item, [...notes.get(item) ?? [], ref]);
  }
  if (!view || !article || !notes.size) return { active: () => false };
  let active = false;
  let pending = 0;
  const layout = () => {
    pending = 0;
    const next = wide.matches;
    view.toggleAttribute('data-sidenotes', next);
    if (next !== active) {
      active = next;
      document.dispatchEvent(new Event('sidenoteschange'));
    }
    if (!next) {
      for (const item of notes.keys()) item.style.removeProperty('--sidenote-top');
      view.style.removeProperty('--sidenote-overflow');
      return;
    }
    const origin = view.getBoundingClientRect().top;
    const gap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.5;
    let bottom = 0;
    for (const [item, references] of notes) {
      // 반복 참조 중 보이는 번호를 먼저 쓴다. 모두 접혀 있으면 가장 바깥 접힌 상자의 제목에 맞춘다.
      let anchor: HTMLElement = references.find(ref => ref.getClientRects().length > 0) ?? references[0];
      for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement && !parent.open) anchor = parent.querySelector<HTMLElement>(':scope > summary') ?? parent;
      }
      const top = Math.max(anchor.getBoundingClientRect().top - origin, bottom);
      item.style.setProperty('--sidenote-top', `${top}px`);
      bottom = top + item.getBoundingClientRect().height + gap;
    }
    // 긴 마지막 각주가 사이트 바닥글을 덮지 않도록 글 끝의 공간을 확보한다.
    const overflow = Math.max(0, bottom - (article.getBoundingClientRect().bottom - origin));
    view.style.setProperty('--sidenote-overflow', `${overflow}px`);
  };
  const schedule = () => { if (!pending) pending = requestAnimationFrame(layout); };
  const observer = new ResizeObserver(schedule);
  observer.observe(article);
  for (const item of notes.keys()) observer.observe(item);
  window.addEventListener('resize', schedule);
  article.addEventListener('toggle', schedule, true);
  wide.addEventListener('change', schedule);
  document.fonts.ready.then(schedule);
  layout();
  return { active: () => active };
}
