// 아래에 읽을 항목이 남아 있을 때만 페이드를 표시한다.
export function setupScrollFades(root: Document | Element = document) {
  const lists = [...root.querySelectorAll('.scroll-list.is-long .side-list')];
  let active = true;
  const update = () => {
    if (!active) return;
    for (const list of lists) list.parentElement!.toggleAttribute('data-overflow', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  };
  const observer = new ResizeObserver(update);
  for (const list of lists) {
    list.addEventListener('scroll', update, { passive: true });
    observer.observe(list);
  }
  document.fonts.ready.then(update);
  update();
  return () => {
    active = false;
    observer.disconnect();
    for (const list of lists) list.removeEventListener('scroll', update);
  };
}

// 목차·참조 목록 각각의 스크롤과 달리, 사이드바 전체가 잘리는 경우를 표시한다.
export function setupSidebarFade(sidebar: HTMLElement): () => void {
  let active = true;
  const update = () => {
    if (!active) return;
    const scrolls = ['auto', 'scroll'].includes(getComputedStyle(sidebar).overflowY);
    sidebar.toggleAttribute('data-sidebar-overflow', scrolls && sidebar.clientHeight > 0
      && sidebar.scrollTop + sidebar.clientHeight < sidebar.scrollHeight - 2);
  };
  const observer = new ResizeObserver(update);
  observer.observe(sidebar);
  // 하위 목차가 접히거나 펼쳐져도 바깥 상자 높이는 같을 수 있으므로 내용 블록도 관찰한다.
  for (const child of sidebar.children) observer.observe(child);
  sidebar.addEventListener('scroll', update, { passive: true });
  void document.fonts.ready.then(update);
  update();
  return () => {
    active = false;
    observer.disconnect();
    sidebar.removeEventListener('scroll', update);
    sidebar.removeAttribute('data-sidebar-overflow');
  };
}
