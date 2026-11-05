import { hashTarget, inPageLink } from './in-page-link.ts';
// 원본 각주 항목을 그대로 배치해 앵커·코드 복사·반복 참조의 복귀 링크를 보존한다.
export function setupSidenotes(refs: HTMLAnchorElement[]) {
  const view = document.querySelector<HTMLElement>('.note-view');
  const article = view?.querySelector<HTMLElement>('.note-article');
  const wide = matchMedia('(min-width: 1121px) and (min-width: 81em)');
  const notes = new Map<HTMLElement, HTMLAnchorElement[]>();
  for (const ref of refs) {
    const item = hashTarget(ref.hash);
    if (item) notes.set(item, [...notes.get(item) ?? [], ref]);
  }
  if (!view || !article || !notes.size) return { active: () => false };
  let active = false;
  let pending = 0;
  // 번호와 각주의 짝 표시. 겹치는 각주를 아래로 밀면 번호와 높이가 어긋나 숫자만으로 짝을 찾아야 했다.
  const mark = (item: HTMLElement, name: string, on: boolean) => {
    item.classList.toggle(name, on);
    for (const ref of notes.get(item) ?? []) ref.classList.toggle(name, on);
  };
  let current: HTMLElement | null = null;
  const select = (item: HTMLElement | null) => {
    if (current) mark(current, 'is-current', false);
    current = item;
    if (item) mark(item, 'is-current', true);
  };
  const layout = () => {
    pending = 0;
    const next = wide.matches;
    view.toggleAttribute('data-sidenotes', next);
    if (next !== active) {
      active = next;
      document.dispatchEvent(new Event('sidenoteschange'));
    }
    if (!next) {
      select(null);
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
  for (const [item, references] of notes) {
    // 짝 표시는 마우스와 키보드 포커스에만 준다. 터치의 pointerenter는 탭과 함께 와서 표시가 남는다.
    // 호버와 포커스를 따로 기억한다. 한쪽이 떠날 때 함께 지우면 포커스가 남은 번호의 짝 표시가 사라진다.
    let hovered = false;
    let focused = false;
    const update = () => mark(item, 'is-paired', active && (hovered || focused));
    for (const target of [item, ...references]) {
      target.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { hovered = true; update(); } });
      target.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') { hovered = false; update(); } });
      target.addEventListener('focusin', () => { focused = true; update(); });
      target.addEventListener('focusout', () => { focused = false; update(); });
    }
    for (const ref of references) {
      // 여백 각주는 이미 번호 옆에 있으므로 누른 번호로 스크롤하지 않고 짝만 표시한다. 읽던 줄이 밀리지 않는다.
      // 화면 밖에 있을 때만 보일 만큼 옮긴다. 키보드로 누르면(detail 0) 링크대로 포커스를 각주로 옮기고 ↩로 돌아온다.
      // 새 탭·새 창으로 여는 누름은 inPageLink가 걸러 브라우저에 맡긴다.
      ref.addEventListener('click', (event) => {
        if (!active || event.detail === 0 || !inPageLink(event)) return;
        event.preventDefault();
        select(item);
        const box = item.getBoundingClientRect();
        if (box.top < 0 || box.bottom > innerHeight) item.scrollIntoView({ block: 'nearest' });
      });
    }
  }
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
