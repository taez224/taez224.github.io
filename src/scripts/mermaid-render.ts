import type { Mermaid } from 'mermaid';
import { FONT_WAIT_MS, LABEL_FONT, LABEL_FONT_PX, MERMAID_CONFIG, MIN_READABLE_LABEL_PX } from './mermaid-config.ts';
import { setViewerButton } from './mermaid-viewer.ts';
type MermaidRenderer = Pick<Mermaid, 'initialize' | 'run'>;

// 컨테이너보다 넓은 도표의 처리다. 조금 넘치는 도표는 줄여도 글자를 읽을 수 있으므로 접어 넣고, 크게 넘치는
// 도표는 원래 크기로 두어 컨테이너가 가로로 스크롤한다. 스크롤이 생긴 도표만 Tab으로 닿게 한다.
// 컨테이너 폭은 접힌 콜아웃이 열리거나 창 크기가 바뀔 때 달라지므로, 부를 때마다 이전 판단을 지우고 다시 잰다.
// useMaxWidth가 켜진 도표(상태도 등)는 Mermaid가 width="100%"에 max-width를 함께 주어 원래 크기를 지키므로,
// 처음 본 인라인 값을 기억해 두고 그 값으로 되돌린 뒤 판단한다. 지워 버리면 SVG가 컨테이너 폭까지 늘어난다.
const mermaidStyles = new WeakMap<Element, { maxWidth: string; height: string }>();

export function fitDiagram(container: Element): boolean {
  const svg = container.querySelector('svg');
  if (!svg) return false;
  let original = mermaidStyles.get(svg);
  if (!original) {
    original = { maxWidth: svg.style.maxWidth, height: svg.style.height };
    mermaidStyles.set(svg, original);
  }
  svg.style.maxWidth = original.maxWidth;
  svg.style.height = original.height;
  container.removeAttribute('tabindex');
  if (!container.clientWidth || container.scrollWidth <= container.clientWidth) return false;
  const view = container.ownerDocument?.defaultView;
  const style = view?.getComputedStyle(container);
  const padding = style ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0;
  const availableWidth = container.clientWidth - padding;
  const naturalWidth = svg.getBoundingClientRect?.().width ?? container.scrollWidth;
  const scaledLabelPx = LABEL_FONT_PX * (availableWidth / naturalWidth);
  if (scaledLabelPx >= MIN_READABLE_LABEL_PX) {
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
  }
  const overflowing = container.scrollWidth > container.clientWidth;
  if (overflowing) container.setAttribute('tabindex', '0');
  return overflowing;
}

function refreshDiagram(container: Element): void {
  setViewerButton(container, fitDiagram(container), () => refreshDiagram(container));
}

// 폭이 바뀌면 다시 판단한다. 폭이 0인 채로 그려진 도표(접힌 콜아웃 안, 아직 크기가 없는 창)도 여기서 바로잡힌다.
function refitOnResize(container: Element): void {
  const view = container.ownerDocument?.defaultView;
  if (!view?.ResizeObserver) return;
  new view.ResizeObserver(() => {
    // 크게 보기가 열려 있는 동안에는 도표가 다이얼로그에 가 있다. 빈 컨테이너를 재면 "넘치지 않는다"가 되어
    // 여는 버튼을 지워 버리고, 닫을 때 돌아갈 자리가 사라진다. 도표가 제자리에 있을 때만 다시 판단한다.
    if (!container.querySelector('svg')) return;
    refreshDiagram(container);
  }).observe(container);
}

// Pretendard는 동적 서브셋이라 페이지에 쓰인 문자만 내려받는다. 도표 원문은 고정폭 서체의 코드 블록으로
// 들어 있어 서브셋 요청을 일으키지 않으므로, 라벨 문자를 직접 넘겨 측정 전에 받아 둔다.
// 폰트는 Mermaid가 재는 글자 폭을 정확하게 할 뿐이므로, 늦거나 실패해도 도표 표시를 막지 않는다.
async function requestLabelFont(blocks: Element[], waitMs: number): Promise<void> {
  const fonts = blocks[0]?.ownerDocument.fonts;
  if (!fonts) return;
  // 서브셋 요청은 문자 집합만 필요하므로 중복 문자를 지워 요청을 짧게 한다.
  const text = [...new Set(blocks.map((code) => code.textContent ?? '').join(''))].join('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loaded = fonts.load(LABEL_FONT, text).catch(() => undefined);
  const waited = new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs); });
  await Promise.race([loaded, waited]);
  clearTimeout(timer);
}

export async function renderMermaidBlocks(blocks: Element[], mermaid: MermaidRenderer, fontWaitMs = FONT_WAIT_MS): Promise<void> {
  mermaid.initialize(MERMAID_CONFIG);
  await requestLabelFont(blocks, fontWaitMs);
  for (const code of blocks) {
    const pre = code.closest('pre');
    if (!pre) continue;
    const container = code.ownerDocument.createElement('div');
    container.className = 'mermaid';
    container.textContent = code.textContent;
    // 스크린리더가 도표 영역임을 알도록 이름을 준다. 포커스는 스크롤이 생긴 도표에만 fitDiagram이 준다.
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', '도표');
    pre.replaceWith(container);
    try {
      await mermaid.run({ nodes: [container] });
      refreshDiagram(container);
      refitOnResize(container);
    } catch {
      // 오류가 난 도표만 원문으로 되돌려 다른 도표는 계속 렌더링한다.
      container.replaceWith(pre);
    }
  }
}
