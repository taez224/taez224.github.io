// 지금 페이지 안의 앵커로 스크롤만 하는 누름이면 그 링크를 돌려준다. 이런 이동은 페이지를 다시 열지 않으므로
// 열린 검색창이나 숨긴 대상은 부른 쪽이 정리한다. 새 탭·새 창으로 여는 누름, 다른 창을 가리키는 링크,
// 앞선 처리가 이미 취소한 누름은 이 페이지에 남으므로 빼낸다. 검색창과 책장이 이 판정을 따로 적었더니
// 한쪽만 수정키를 보았다.
export function inPageLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = event.target instanceof Element ? event.target.closest('a') : null;
  if (!(link instanceof HTMLAnchorElement) || !link.hash || (link.target && link.target !== '_self')) return null;
  return link.origin === location.origin && link.pathname === location.pathname && link.search === location.search ? link : null;
}

// 해시가 가리키는 요소. 한글 id는 주소에서 퍼센트 인코딩되므로 풀어서 찾되, `#%`처럼 풀 수 없는 해시는 대상이 없는 것으로 본다.
export function hashTarget(hash: string): HTMLElement | null {
  if (hash.length < 2) return null;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}
