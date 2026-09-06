const select = document.querySelector('[data-book-status]');
const counter = document.querySelector('[data-book-count]');
const cards = [...document.querySelectorAll('article[data-status]')];
select?.addEventListener('change', () => {
  let shown = 0;
  for (const card of cards) { const visible = select.value === 'all' || card.dataset.status === select.value; card.hidden = !visible; if (visible) shown += 1; }
  for (const tier of document.querySelectorAll('.tier')) tier.hidden = ![...tier.querySelectorAll('article')].some((card) => !card.hidden);
  if (counter) counter.textContent = `${shown}권`;
});
