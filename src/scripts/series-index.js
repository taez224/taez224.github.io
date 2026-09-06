const index = document.querySelector('.series-index');
const list = index?.querySelector('ol');

function revealCurrent() {
  const current = list?.querySelector('[aria-current="page"]');
  if (!index?.open || !current) return;
  const itemTop = current.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  // Scroll only the chapter list; preserve the reader's position in the page.
  list.scrollTop = Math.max(0, itemTop - (list.clientHeight - current.clientHeight) / 2);
}

index?.addEventListener('toggle', revealCurrent);
document.fonts.ready.then(revealCurrent);
