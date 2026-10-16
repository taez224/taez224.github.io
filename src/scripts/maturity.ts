// 같은 버튼·바깥 누르기·Esc로 닫는 일은 네이티브 팝오버가 맡는다.
// 어떤 경로로 닫혀도 버튼의 표시와 새싹 도안이 열린 상태로 남지 않게 맞춘다.
const button = document.querySelector<HTMLButtonElement>('[data-maturity]');
const note = button ? document.getElementById(button.getAttribute('aria-controls') ?? '') : null;

if (button && note && typeof note.showPopover === 'function') {
  const sync = () => button.setAttribute('aria-expanded', String(note.matches(':popover-open')));
  note.addEventListener('toggle', sync);
  sync();
}
