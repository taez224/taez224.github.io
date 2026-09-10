// 참조·역참조 아이콘. 화살표 몸통을 지도 간선과 같은 실선(참조)·점선(역참조)으로 그려 목록 제목이 곧 선 범례가 된다.
// 노트 사이드바(Icon.astro)와 지도 패널(map.js)이 같은 마크업을 쓴다.
const icon = (body) => `<svg width="20" height="14" viewBox="0 0 20 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const REF_ICONS = {
  out: icon('<circle cx="4" cy="7" r="2"></circle><path d="M6 7h12m-2.5-2.5L18 7l-2.5 2.5"></path>'),
  // 점선 몸통만 butt 끝이다. 둥근 끝은 양쪽으로 굵기의 절반씩 늘어나 틈을 메우므로 실선처럼 보인다. 지도 간선(graph.css)도 butt 끝이고 대시 비율도 같다(5 4).
  in: icon('<circle cx="16" cy="7" r="2"></circle><path d="M14 7H2" stroke-dasharray="2.5 2" stroke-linecap="butt"></path><path d="M4.5 4.5L2 7l2.5 2.5"></path>')
};
