import type { GraphNode, GraphEdge, Point } from '../lib/content-model.ts';
import { createGraph } from '../graph/engine.ts';

interface HeroData { nodes: GraphNode[]; edges: GraphEdge[]; positions: [string, Point][] }
export interface HeroGraph { fit(): void }

// 살아 있는 지도를 쓰는 폭이다. index.astro에서 엔진을 보이고 정적 그림을 가리는 미디어 쿼리와 같아야 한다.
// 휴대폰 폭에서는 허브 제목이 읽을 수 없을 만큼 작아져, 영역 이름을 크게 놓은 정적 그림을 쓴다.
export const LIVE_HERO_QUERY = '(min-width: 721px)';

// 데이터와 좌표는 페이지에 인라인돼 있다(index.astro의 data-hero-data). fetch와 배치 계산이 없어 첫 화면 전에 그래프가 올라간다.
export function drawHeroGraph(box: HTMLElement): HeroGraph {
  let interactiveGraph: SVGSVGElement | undefined;
  try {
    const { nodes, edges, positions } = JSON.parse(box.querySelector('[data-hero-data]')!.textContent!) as HeroData;
    interactiveGraph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    interactiveGraph.setAttribute('role', 'group');
    interactiveGraph.setAttribute('aria-label', `생각 지도. 노드 ${nodes.length}개와 연결 ${edges.length}개. 노드를 누르면 그 노트를 엽니다.`);
    // 호버로 제목을 보고 누르는 것이라 지도를 거치지 않고 노트를 바로 연다. 지도 입구는 버튼과 헤더 탭이 맡는다.
    const open = (id: string) => { const node = nodes.find((n) => n.id === id); if (node) window.location.href = node.url; };
    box.append(interactiveGraph);
    // 홈에서는 노드를 탭 순서에서 뺀다(36개를 지나야 대표 글에 닿는다). 키보드 탐색은 지도 페이지가 맡는다.
    return createGraph(interactiveGraph, { nodes, edges, positions: new Map(positions), mode: 'hero', focusable: false, nodeScale: 0.9, layoutSize: { width: 1000, height: 640 }, onSelect: (id) => { if (id) open(id); }, onOpen: open });
  } catch (error) {
    interactiveGraph?.remove();
    throw error;
  }
}

// 어느 지도를 보일지는 CSS가 폭으로 정하고, 여기서는 엔진을 만들고 상자에 맞추기만 한다.
// 정적 그림을 지우면 창을 휴대폰 폭으로 줄이거나 기기를 돌렸을 때 되살릴 수 없으므로, is-live 표시만 달아 CSS가 가리게 한다.
// 휴대폰 폭으로 연 페이지도 나중에 넓어지면 그때 엔진을 만든다.
export function mountHeroGraph(box: HTMLElement, view: Pick<Window, 'matchMedia' | 'addEventListener'>, draw: (box: HTMLElement) => HeroGraph = drawHeroGraph): void {
  const wide = view.matchMedia(LIVE_HERO_QUERY);
  let graph: HeroGraph | null = null;
  let failed = false;
  let fittedSize = '';
  const sync = () => {
    // 휴대폰 폭에서는 엔진이 숨어 크기가 0이다. 이때 맞추면 엔진이 기본 무대 크기로 viewBox를 잡으므로 넓어질 때까지 기다린다.
    if (!wide.matches || failed) return;
    const { width, height } = box.getBoundingClientRect();
    const size = `${Math.round(width)}x${Math.round(height)}`;
    if (!graph) {
      try {
        graph = draw(box);
      } catch (error) {
        failed = true;
        console.error(error);
        return;
      }
      box.classList.add('is-live');
    } else if (size !== fittedSize) {
      // 엔진은 맞출 때의 상자 크기로 viewBox를 정한다. 상자가 바뀐 뒤 맞추지 않으면 제목이 상자 비율만큼 줄어든다.
      graph.fit();
    }
    fittedSize = size;
  };
  sync();
  wide.addEventListener('change', sync);
  view.addEventListener('resize', sync);
}
