const select = document.querySelector('[data-book-status]');
const counter = document.querySelector('[data-book-count]');
const cards = [...document.querySelectorAll('article[data-status]')];
select?.addEventListener('change', () => {
  let shown = 0;
  for (const card of cards) { const visible = select.value === 'all' || card.dataset.status === select.value; card.hidden = !visible; if (visible) shown += 1; }
  for (const tier of document.querySelectorAll('.tier')) {
    const count = [...tier.querySelectorAll('article')].filter((card) => !card.hidden).length;
    tier.hidden = count === 0;
    const tierCounter = tier.querySelector('[data-tier-count]');
    if (tierCounter) tierCounter.textContent = `${count}권`;
  }
  if (counter) counter.textContent = `${shown}권`;
});
