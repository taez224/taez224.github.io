import type { MermaidConfig } from 'mermaid';

// 도표의 테마·배치·외형을 여기서만 바꾼다. 값을 비교할 때 이 파일 하나만 고치면 된다.
// 12가 배치·외형·접힘 폭 기본값을 한꺼번에 바꿨으므로, 측정해서 고른 값을 기본값에 맡기지 않고 적어 둔다.
export const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  // 실패한 도표는 원문 코드 블록으로 되돌리므로 Mermaid가 그리는 오류 화면은 쓰지 않는다.
  suppressErrorRendering: true,
  theme: 'base',
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
  flowchart: { useMaxWidth: false, wrappingWidth: 120 },
  // useMaxWidth는 도표 종류마다 따로 있다. flowchart만 끄면 나머지는 좁은 화면에서 컨테이너에
  // 맞춰 줄어들어 320px에서 글자가 6px까지 작아진다. 쓰는 종류를 모두 적고, 새 종류를 쓰게 되면 여기에 더한다.
  sequence: { useMaxWidth: false },
  state: { useMaxWidth: false },
  class: { useMaxWidth: false },
  er: { useMaxWidth: false },
  usecase: { useMaxWidth: false },
  agentflow: { useMaxWidth: false },
  themeVariables: {
    background: '#fbfaf6',
    lineColor: '#746f64',
    primaryColor: '#e3ece5',
    primaryTextColor: '#242720',
    secondaryColor: '#f2efe7',
    tertiaryColor: '#fbfaf6',
    fontFamily: 'Pretendard Variable, Pretendard, sans-serif'
  }
};

// 라벨 폭을 재기 전에 받아 둘 서체다. themeVariables.fontFamily의 첫 후보와 같아야 한다.
export const LABEL_FONT = '16px "Pretendard Variable"';

// 컨테이너보다 넓은 도표를 줄여 넣을지 정하는 기준이다. 줄인 뒤의 라벨이 이 크기 이상이면 접어 넣고,
// 그보다 작아지면 원래 크기로 두고 가로로 스크롤한다. 16px 라벨이 13px까지 줄어드는 배율이다.
export const LABEL_FONT_PX = 16;
export const MIN_READABLE_LABEL_PX = 13;

// 폰트를 기다리는 시간이다. 도표 표시가 이보다 늦어지지 않게 끊는다.
export const FONT_WAIT_MS = 1000;
