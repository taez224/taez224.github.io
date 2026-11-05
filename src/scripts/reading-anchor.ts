// 한 열과 두 열이 바뀔 때 읽던 본문 블록의 위쪽을 같은 높이에 둔다. 한 열에서는 본문 위에 목차를 펼쳐 두므로
// 두 열로 바뀌면 그 높이만큼 본문이 올라가고, 반대로 좁히면 내려간다. 브라우저의 스크롤 앵커링은 기준 요소의
// 조상(.note-view)의 폭과 배치가 바뀌면 꺼지도록 정해져 있어 이 전환을 보정하지 않는다.
// 독자의 위치를 대신 정하는 일이라 본문을 읽는 중일 때만 보정한다. 줄 단위로 추적하지 않으므로, 본문 폭이 달라져
// 줄바꿈이 바뀌는 큰 글자에서는 블록 안의 문장이 조금 움직일 수 있다.
//
// 배치가 바뀐 뒤에는 바뀌기 전의 위치를 잴 수 없으므로, 스크롤과 창 크기가 바뀔 때마다 화면 맨 위에 걸친 본문 블록과
// 그 높이를 기억해 두고, 전환을 알아챈 순간 그 블록을 기억한 높이로 되돌린다.
// 전환은 미디어 쿼리가 아니라 계산된 열 수로 알아챈다. ResizeObserver 콜백에서는 matchMedia가 아직 이전 값을 돌려주었고,
// 조건 문자열을 여기에 한 번 더 적지 않아도 된다.
const view = document.querySelector<HTMLElement>('.note-view');
const columns = () => (view ? getComputedStyle(view).gridTemplateColumns.trim().split(/\s+/).length : 1);
const blocks = [...document.querySelectorAll<HTMLElement>('.note-article .body > *')];
const header = document.querySelector<HTMLElement>('.site-header');

if (view && blocks.length) {
  let layout = columns() > 1;
  // block: 읽는 선에 걸친 본문 블록, first: 본문 첫 블록의 높이, line: 헤더 아래 읽는 선
  let saved: { block: HTMLElement; top: number; first: number; line: number; scrollY: number } | null = null;
  let queued = false;
  // 위치를 재기 전에 늘 전환부터 확인한다. 스크롤 직후 창 크기가 바뀌면 스크롤 쪽 프레임 콜백이 ResizeObserver보다 먼저 돌아,
  // 새 배치에서 잰 값으로 바뀌기 전의 위치를 덮어썼다.
  const sync = () => {
    queued = false;
    const two = columns() > 1;
    if (two !== layout && saved) {
      // 기억한 뒤 다음 프레임이 오기 전에 스크롤했으면 그 거리만큼 기억한 높이에서 뺀다.
      const moved = scrollY - saved.scrollY;
      // 본문 첫 블록이 읽는 선에 닿기 전에는 제목·요약·본문 위 목차를 읽는 중이므로 보정하지 않고 브라우저에 맡긴다.
      // 보정하면 창을 좁힐 때 목차 높이만큼 내려가 읽던 제목이 화면 밖으로 사라졌다.
      if (saved.first - moved <= saved.line) scrollBy(0, saved.block.getBoundingClientRect().top - (saved.top - moved));
    }
    layout = two;
    const line = header?.getBoundingClientRect().bottom ?? 0;
    const block = blocks.find((element) => element.getBoundingClientRect().bottom > line);
    saved = block ? { block, top: block.getBoundingClientRect().top, first: blocks[0].getBoundingClientRect().top, line, scrollY } : null;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(sync); } }, { passive: true });
  // 창 크기 변화는 ResizeObserver로 받는다. 콜백이 새 배치를 계산한 뒤 그리기 전에 돌아, 밀린 화면이 한 프레임 보이지 않는다.
  // resize 이벤트는 좁힐 때 새 배치를 한 번 그린 다음에 오기도 했다.
  new ResizeObserver(sync).observe(document.documentElement);
}
