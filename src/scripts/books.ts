export {};
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-book-status]')];
const cards = [...document.querySelectorAll<HTMLElement>('article[data-status]')];

function apply(status: string | undefined) {
  for (const card of cards) card.hidden = !(status === 'all' || card.dataset.status === status);
  for (const tier of document.querySelectorAll<HTMLElement>('[data-tier]')) {
    const count = [...tier.querySelectorAll('article')].filter((card) => !card.hidden).length;
    tier.hidden = count === 0;
    const tierCounter = tier.querySelector('[data-tier-count]');
    if (tierCounter) tierCounter.textContent = `${count}권`;
  }
}

for (const button of buttons) button.addEventListener('click', () => {
  for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
  apply(button.dataset.bookStatus);
});
