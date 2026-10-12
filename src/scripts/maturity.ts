// 노트 메타 줄의 성숙도 버튼이 메타 줄 아래의 설명 상자를 열고 닫는다.
// Esc는 초점이 버튼이나 상자 안에 있을 때만 상자를 닫는다. 각주 미리보기와 검색 창도 Esc를 쓰므로 다른 곳에서 누른 Esc까지 가져가지 않는다.
const button = document.querySelector<HTMLButtonElement>('[data-maturity]');
const note = button ? document.getElementById(button.getAttribute('aria-controls') ?? '') : null;

if (button && note) {
  const setOpen = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    note.hidden = !open;
  };
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || note.hidden) return;
    if (document.activeElement !== button && !note.contains(document.activeElement)) return;
    setOpen(false);
    button.focus();
  });
}
