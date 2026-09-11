// 패널 내용이 노드 선택마다 바뀌므로 포커스 대상은 키를 누를 때 다시 찾는다.
export function loopTabFocus(event, container) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const items = [...container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
    .filter((item) => item.tabIndex >= 0 && !item.disabled && !item.closest('[inert]') && item.getClientRects().length);
  if (!items.length) return;
  const active = container.ownerDocument.activeElement;
  const first = items[0], last = items.at(-1);
  if (!items.includes(active) || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
