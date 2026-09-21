// 배경을 눌러 대화상자를 닫는다. dialog는 배경까지 자기 영역이라 저절로 닫히지 않으므로 누른 자리가 상자 밖인지 좌표로 가린다.
// 상자 안에서 눌러 배경에서 뗀 경우(글자를 끌어 고르거나 도표를 끌다 벗어난 경우)는 닫지 않는다.
// 브라우저는 이때 click을 두 지점의 공통 조상인 대화상자 자신에게 보내므로 click만 보면 배경을 누른 것과 구분되지 않는다.
export function closeOnBackdrop(dialog: HTMLDialogElement): void {
  const outside = (event: MouseEvent) => {
    const box = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (event) => { pressedOutside = outside(event); });
  dialog.addEventListener('click', (event) => { if (pressedOutside && outside(event)) dialog.close(); });
}
