// 같은 버튼·바깥 누르기·Esc로 닫는 일은 네이티브 팝오버가 맡는다.
// 어떤 경로로 닫혀도 버튼의 표시와 새싹 도안이 열린 상태로 남지 않게 맞춘다.
// 노트 페이지는 불러올 때 한 번 걸고, 지도 패널은 노트를 고를 때마다 새로 그린 버튼에 다시 건다.
export function bindMaturity(root: ParentNode = document) {
  const button = root.querySelector<HTMLButtonElement>('[data-maturity]');
  const note = button ? document.getElementById(button.getAttribute('aria-controls') ?? '') : null;
  if (!button || !note || typeof note.showPopover !== 'function') return;
  const sync = () => button.setAttribute('aria-expanded', String(note.matches(':popover-open')));
  note.addEventListener('toggle', sync);
  sync();
}

bindMaturity();
