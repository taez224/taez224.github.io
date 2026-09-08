// 아래에 읽을 항목이 남아 있을 때만 페이드를 표시한다.
export function setupScrollFades(root = document) {
  const lists = [...root.querySelectorAll('.scroll-list.is-long .side-list')];
  let active = true;
  const update = () => {
    if (!active) return;
    for (const list of lists) list.parentElement.toggleAttribute('data-overflow', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
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
