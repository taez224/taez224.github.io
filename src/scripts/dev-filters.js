const state = { category: 'all', tag: 'all' };
const records = [...document.querySelectorAll('article[data-category]')];
const counter = document.querySelector('[data-result-count]');
const empty = document.querySelector('[data-empty]');
function apply() {
  let shown = 0;
  for (const record of records) {
    const tags = record.dataset.tags ? record.dataset.tags.split('|') : [];
    const visible = (state.category === 'all' || record.dataset.category === state.category) && (state.tag === 'all' || tags.includes(state.tag));
    record.hidden = !visible;
    if (visible) shown += 1;
  }
  if (counter) counter.textContent = `${shown}개`;
  if (empty) empty.hidden = shown > 0;
}
for (const [attr, key] of [['data-category-filter', 'category'], ['data-tag-filter', 'tag']]) {
  const buttons = [...document.querySelectorAll(`[${attr}]`)];
  for (const button of buttons) button.addEventListener('click', () => {
    state[key] = button.getAttribute(attr);
    for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
    apply();
  });
}
