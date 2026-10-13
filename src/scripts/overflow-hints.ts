// 스크롤 막대가 숨겨지는 기기에서도 더 읽을 내용이 있는 방향을 알린다.
// 코드 복사 도구는 pre 밖에 있으므로 흐려지지 않는다. 접힌 콜아웃을 열거나 창·글꼴 크기가 바뀌어도 다시 잰다.
const regions = [...document.querySelectorAll<HTMLElement>('.body table, .body pre')];
for (const region of regions) {
  const originalTabIndex = region.getAttribute('tabindex');
  const update = () => {
    const overflow = region.clientWidth > 0 && region.scrollWidth > region.clientWidth + 1;
    region.toggleAttribute('data-overflow-left', overflow && region.scrollLeft > 1);
    region.toggleAttribute('data-overflow-right', overflow && region.scrollLeft + region.clientWidth < region.scrollWidth - 1);
    // 넘칠 때만 키보드로 들어가 화살표로 스크롤한다. 기존 탭 순서가 있으면 그대로 둔다.
    if (originalTabIndex === null) {
      if (overflow) region.tabIndex = 0;
      else region.removeAttribute('tabindex');
    }
  };
  region.addEventListener('scroll', update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(region);
  for (const child of region.children) observer.observe(child);
  update();
  void document.fonts.ready.then(update);
}
