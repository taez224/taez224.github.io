import { hashTarget, inPageLink } from './in-page-link.ts';

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
function select(button: HTMLButtonElement) {
  for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
  apply(button.dataset.bookStatus);
}

for (const button of buttons) button.addEventListener('click', () => select(button));

// 거르개는 책을 숨길 뿐 주소와 무관하다. 숨긴 책으로 이동하면(검색 결과) 주소만 바뀌고 책은 보이지 않으므로
// 전체로 되돌린다. 거르개가 가리킨 상태를 조용히 어기는 대신 눌린 버튼과 권수까지 함께 맞춘다.
function reveal(card: HTMLElement | null): boolean {
  const all = buttons.find((button) => button.dataset.bookStatus === 'all');
  if (!card || !cards.includes(card) || !card.hidden || !all) return false;
  select(all);
  return true;
}
// 누른 링크는 이동하기 전에 드러내야 브라우저가 그 자리로 스크롤한다. 같은 주소를 다시 누르면 hashchange가 오지 않는 것도 이 길로 막는다.
document.addEventListener('click', (event) => {
  const link = inPageLink(event);
  if (link) reveal(hashTarget(link.hash));
});
// 뒤로·앞으로 가기처럼 누르지 않고 주소만 바뀐 경우는 브라우저가 스크롤을 이미 마쳤으므로 드러낸 뒤 다시 이동한다.
window.addEventListener('hashchange', () => {
  const card = hashTarget(location.hash);
  if (reveal(card)) card?.scrollIntoView();
});
