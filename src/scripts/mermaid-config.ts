import type { MermaidConfig } from 'mermaid';

// 도표에서 항목마다 돌려 쓰는 색이다. Mermaid는 묶음(subgraph·복합 상태·유스케이스 경계)과
// 항목이 여러 개인 도표(클래스도·ER·시퀀스 참여자)에 이 배열의 색을 순서대로 물린다.
// 값은 지도의 주제색(format.ts의 GRAPH_COLORS)과 같은 대역에서 골랐다. 채도 15~38%, 명도 43~52%다.
// 이웃한 칸끼리 색상각이 최소 75도 떨어지도록 배열해서, 묶음이 두세 개인 도표에서도 색이 붙어 보이지 않는다.
// 주제색과 같은 값을 쓰는 칸이 있지만 뜻은 다르다. 지도에서는 주제를 가리키고 여기서는 묶음을 구분할 뿐이다.
const DIAGRAM_BORDER_COLORS = [
  '#5d7897', '#9a7852', '#5c806c', '#a4617f', '#9b8a45', '#67639c',
  '#9c6e6e', '#4a8791', '#996695', '#658156', '#80698f', '#817f72'
];

// 위 테두리 색과 같은 색상각을 유지하고 명도만 92%로 올린 면 색이다.
// 종이색(#fdfdfa) 대비는 1.12~1.23으로, 노드가 쓰는 연두(#e3ece5)의 1.18과 같은 깊이다.
// 먹색 글자 대비는 모두 12:1을 넘으므로 어느 칸이 걸려도 라벨을 읽는 데 지장이 없다.
const DIAGRAM_FILL_COLORS = [
  '#e4eaf1', '#f3ebe2', '#e6efea', '#f2e3ea', '#f4f0e1', '#e5e4f1',
  '#f0e5e5', '#e2f1f4', '#f0e5ef', '#e9f0e5', '#ebe6ef', '#ecece9'
];

// 색과 상관없는 설정이다. 앞머리에 테마를 적은 도표도 같은 값으로 그려야 접기 판단과 크게 보기가
// 똑같이 걸리므로, 아래 두 설정이 이 값을 나눠 갖는다.
const RENDERING_BASE: MermaidConfig = {
  startOnLoad: false,
  // 실패한 도표는 원문 코드 블록으로 되돌리므로 Mermaid가 그리는 오류 화면은 쓰지 않는다.
  suppressErrorRendering: true,
  // ELK는 도표마다 이득이 갈리는데(세로는 좁아지고 가로는 넓어짐) 압축 후 436KB를 더 받아야 한다.
  // 전역은 dagre로 두고, ELK가 나은 도표만 front matter의 config.layout으로 지정하면 그 페이지만 청크를 받는다.
  layout: 'dagre',
  // neo는 노드 여백이 작아 같은 배치에서 폭이 9~10% 줄고, 그만큼 본문 폭 안에 들어갈 확률이 높아진다.
  // 노드에 붙는 옅은 그림자는 도형 구분에 도움이 되고 가로 스크롤 60프레임 측정에서 프레임 시간 차이가 없었다.
  look: 'neo',
  // Mermaid가 본문 폭에 맞춰 줄이면 긴 도표의 글자가 읽을 수 없이 작아진다. 원래 크기로 그리게 두고,
  // 줄일지 스크롤할지는 렌더링 뒤 mermaid-render.ts의 fitDiagram이 라벨 크기를 기준으로 정한다.
  // 이 설정은 flowchart에만 걸리므로 상태도·시퀀스처럼 다른 종류는 여전히 컨테이너에 맞춰 줄어든다.
  // 접힘 폭은 라벨을 가로로 펴고 세로로 낮추는 값이다. 본문이 세로로 흐르므로 가로가 병목이고,
  // 200으로 올리면 짧은 흐름도가 컨테이너를 넘어 가로 스크롤을 얻는다(k8s 도표 774px → 905px).
  // 12의 기본값과 같지만 측정해서 고른 값이므로 적어 둔다. 긴 라벨이 필요한 도표는
  // 그 노트의 front matter에 config.flowchart.wrappingWidth를 적어 개별로 올린다.
  // 12가 새로 넣은 minNodeWidth는 짧은 라벨을 이 폭까지 늘려 노드 폭을 고르게 맞춘다. 기본값은 120이다.
  // 한국어 라벨은 두세 글자가 많아 거의 모든 노드가 이 바닥값에 붙고, 남는 자리가 전부 빈 여백이 된다.
  // 60으로 내리면 라벨 크기는 그대로 둔 채 흐름도가 370px에서 250px, 상태도가 347px에서 249px이 되어
  // 320px 화면에서 가로 스크롤 없이 들어간다. 글자 크기는 이 문제에 듣지 않는다. 16px을 14px로 내려도
  // 폭은 0~3%밖에 줄지 않는다. 폭을 정하는 것이 글자가 아니라 이 바닥값이기 때문이다.
  // minNodeWidth를 받는 종류는 흐름도·상태도·유스케이스·에이전트 흐름 넷이다.
  flowchart: { useMaxWidth: false, wrappingWidth: 120, minNodeWidth: 60 },
  // useMaxWidth는 도표 종류마다 따로 있다. flowchart만 끄면 나머지는 좁은 화면에서 컨테이너에
  // 맞춰 줄어들어 320px에서 글자가 6px까지 작아진다. 쓰는 종류를 모두 적고, 새 종류를 쓰게 되면 여기에 더한다.
  sequence: { useMaxWidth: false },
  state: { useMaxWidth: false, minNodeWidth: 60 },
  class: { useMaxWidth: false },
  er: { useMaxWidth: false },
  usecase: { useMaxWidth: false, minNodeWidth: 60 },
  agentflow: { useMaxWidth: false, minNodeWidth: 60 }
};

// 도표의 테마·배치·외형을 여기서만 바꾼다. 값을 비교할 때 이 파일 하나만 고치면 된다.
// 12가 배치·외형·접힘 폭 기본값을 한꺼번에 바꿨으므로, 측정해서 고른 값을 기본값에 맡기지 않고 적어 둔다.
export const MERMAID_CONFIG: MermaidConfig = {
  ...RENDERING_BASE,
  // 항목별 색을 켜는 조건이 테마 이름이다. colorThemeGate.ts의 COLOR_THEMES에 redux-color와
  // redux-dark-color만 들어 있어서, base로 두면 아래 색 배열을 넘겨도 Mermaid가 무시한다.
  // 그래서 이름만 redux-color로 두고 색은 themeVariables에서 전부 사이트 값으로 덮는다.
  theme: 'redux-color',
  themeVariables: {
    background: '#fbfaf6',
    lineColor: '#746f64',
    // redux-color는 글자와 선을 남보라 계열(#28253D)로 두므로 먹색으로 되돌린다.
    primaryTextColor: '#242720',
    textColor: '#242720',
    nodeTextColor: '#242720',
    titleColor: '#242720',
    // 노드 자체는 연두 한 가지로 두고 색은 묶음이 지게 한다. 노드까지 색을 돌리면
    // 색이 묶음을 뜻하는지 항목을 뜻하는지 읽는 쪽에서 구분할 수 없다.
    mainBkg: '#e3ece5',
    secondaryColor: '#f2efe7',
    tertiaryColor: '#fbfaf6',
    // 본문의 표·코드·콜아웃과 같은 1px 구분선 색이다. 묶음 테두리만 색을 갖게 하려고 낮게 둔다.
    nodeBorder: '#d8ded4',
    stateBorder: '#d8ded4',
    actorBorder: '#d8ded4',
    clusterBkg: '#fbfaf6',
    clusterBorder: '#d8ded4',
    // 기본값은 형광에 가까운 노랑(#fff5ad)이라 본문의 형광 표시(--highlight)와 같은 계열로 낮춘다.
    noteBkgColor: '#f4efd8',
    noteBorderColor: '#c9b978',
    noteTextColor: '#242720',
    borderColorArray: DIAGRAM_BORDER_COLORS,
    bkgColorArray: DIAGRAM_FILL_COLORS,
    // 유스케이스는 행위자·기능·경계가 각각 고정 색을 쓴다. 배열과 같은 대역에서 골라 맞춘다.
    usecaseActorBorder: '#80698f',
    usecaseActorBkg: '#ebe6ef',
    usecaseBorder: '#4a8791',
    usecaseBkg: '#e2f1f4',
    usecaseBoundaryBorder: '#d8ded4',
    usecaseBoundaryBkg: '#fbfaf6',
    usecaseIncludeLine: '#5d7897',
    usecaseExtendLine: '#9a7852',
    fontFamily: 'Pretendard Variable, Pretendard, sans-serif',
    fontSize: '16px',
    // redux-color는 도표의 모든 글자를 600으로 올린다. 본문 옆에서 도표만 굵어 보이므로 되돌린다.
    fontWeight: 400,
    noteFontWeight: 400,
    // 테두리 2px에 라벨 12px 모서리는 도표만 둥글고 굵어 보인다. 본문의 표·코드와 같은 인상으로 맞춘다.
    strokeWidth: 1,
    radius: 4
  }
};

// 앞머리나 init 지시문으로 테마를 지정한 도표에 쓰는 설정이다. 그런 도표는 그 테마의 색을 보여 주려는 것이므로
// 사이트 색이 도표별 테마에 섞이지 않도록 초기화 설정에서 팔레트를 제외한다.
// 서체는 기본으로 유지하되 도표의 themeVariables가 명시한 값은 Mermaid가 적용한다.
export const MERMAID_PINNED_THEME_CONFIG: MermaidConfig = {
  ...RENDERING_BASE,
  themeVariables: { fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }
};

// 라벨 폭을 재기 전에 받아 둘 서체다. themeVariables.fontFamily의 첫 후보와 같아야 한다.
export const LABEL_FONT = '16px "Pretendard Variable"';

// 컨테이너보다 넓은 도표를 줄여 넣을지 정하는 기준이다. 줄인 뒤의 라벨이 이 크기 이상이면 접어 넣고,
// 그보다 작아지면 원래 크기로 두고 가로로 스크롤한다. 16px 라벨이 13px까지 줄어드는 배율이다.
export const LABEL_FONT_PX = 16;
export const MIN_READABLE_LABEL_PX = 13;

// 좁은 화면에서는 가로로 밀어 보는 것보다 도표 전체가 한눈에 들어오는 쪽을 택한다. 본문 CSS와 같은 720px에서 나눈다.
// 375px 화면에서 도표 14개 중 10개가 13px 기준으로는 가로로 스크롤했고, 하한을 8px로 내리면 그중 7개가 들어간다.
// 13px보다 작게 줄인 도표에는 크게 보기를 남겨 원래 크기로 읽을 수 있게 한다.
export const NARROW_SCREEN_QUERY = '(max-width: 720px)';
export const NARROW_MIN_READABLE_LABEL_PX = 8;

// 폰트를 기다리는 시간이다. 도표 표시가 이보다 늦어지지 않게 끊는다.
export const FONT_WAIT_MS = 1000;
