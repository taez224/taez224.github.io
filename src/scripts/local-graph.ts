export {};
// 로컬 그래프의 이웃 노드와 사이드바 목록(참조·역참조·연재)의 같은 노트 줄을 함께 강조한다.
// 그래프의 제목은 두 줄까지 줄여 보이므로, 마우스를 올리거나 포커스한 노드의 전체 제목은 목록의 같은 줄이 보여 준다.
// 터치 기기는 탭한 요소에 mouseenter만 오고 mouseleave가 오지 않아 강조가 남으므로, 호버할 수 있을 때만 마우스로 잇는다.
const graph = document.querySelector('.local-graph');
if (graph) {
  const rows = [...document.querySelectorAll<HTMLAnchorElement>('.note-side .side-list a')];
  const canHover = matchMedia('(hover: hover)').matches;
  for (const node of graph.querySelectorAll<SVGAElement>('a.node')) {
    const href = node.getAttribute('href');
    const pair: Element[] = [node, ...rows.filter((row) => row.getAttribute('href') === href)];
    const hovered = new Set<Element>();
    const focused = new Set<Element>();
    // 같은 노트의 다른 줄을 가리키거나 키보드 포커스가 남아 있으면 강조를 유지한다.
    const mark = () => { for (const element of pair) element.classList.toggle('is-linked', hovered.size > 0 || focused.size > 0); };
    for (const element of pair) {
      if (canHover) {
        element.addEventListener('mouseenter', () => { hovered.add(element); mark(); });
        element.addEventListener('mouseleave', () => { hovered.delete(element); mark(); });
      }
      element.addEventListener('focus', () => { focused.add(element); mark(); });
      element.addEventListener('blur', () => { focused.delete(element); mark(); });
    }
  }
}
