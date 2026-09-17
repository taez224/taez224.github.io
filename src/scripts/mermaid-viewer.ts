// 도표를 크게 보는 다이얼로그다. 본문의 도표는 스크롤과 글자 선택을 그대로 두고, 전체 구조를 한눈에
// 보는 일만 여기로 옮긴다. 도표 전체를 누르게 하면 스크롤·선택과 부딪히므로 여는 수단은 버튼으로 둔다.
import { NARROW_SCREEN_QUERY } from './mermaid-config.ts';

const OPEN_CLASS = 'diagram-open';

export function fitViewerSize(width: number, height: number, availableWidth: number, availableHeight: number): { width: number; height: number } {
  const ratio = Math.max(0, Math.min(1, availableWidth / width, availableHeight / height));
  return { width: width * ratio, height: height * ratio };
}

// 크게 볼 이유가 있는 도표에만 버튼을 붙인다. 넘치는 도표와 본문에 맞추느라 라벨을 작게 줄인 도표다.
// 창 크기가 바뀌어 그 이유가 사라지면 버튼도 떼어 낸다.

// 좁은 화면에서 화면에 맞춰 열면 대화상자가 본문과 폭이 비슷해 도표가 거의 커지지 않는다.
// 그래서 원래 크기로 열고, 전체 구조는 전체 보기 버튼으로 본다.
export function opensFitted(view: { matchMedia?: (query: string) => { matches: boolean } } | null | undefined): boolean {
  return !(view?.matchMedia?.(NARROW_SCREEN_QUERY).matches ?? false);
}

export function setViewerButton(container: Element, needed: boolean, onRestore?: () => void): void {
  const previous = container.previousElementSibling;
  const existing = previous && previous.classList.contains(OPEN_CLASS) ? previous : null;
  if (!needed) { existing?.remove(); return; }
  if (existing) return;
  const doc = container.ownerDocument;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = OPEN_CLASS;
  button.textContent = '크게 보기';
  button.addEventListener('click', () => openViewer(container, button, onRestore));
  container.parentNode?.insertBefore(button, container);
}

function openViewer(container: Element, opener: HTMLElement, onRestore?: () => void): void {
  const doc = container.ownerDocument;
  const svg = container.querySelector('svg');
  const dialog = doc.createElement('dialog');
  // 모달 다이얼로그를 지원하지 않는 환경에서는 본문의 도표를 그대로 쓰게 둔다.
  if (!svg || typeof dialog.showModal !== 'function') return;
  dialog.className = 'diagram-viewer';
  dialog.setAttribute('aria-label', '도표 크게 보기');
  // 테마를 지정한 도표는 크게 볼 때도 같은 밝기의 판에 둔다.
  const tone = container.getAttribute('data-theme-tone');
  if (tone) dialog.setAttribute('data-theme-tone', tone);

  const tools = doc.createElement('div');
  tools.className = 'diagram-viewer-tools';
  const scale = doc.createElement('button');
  scale.type = 'button';
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = '닫기';
  const stage = doc.createElement('div');
  stage.className = 'diagram-viewer-stage';
  stage.tabIndex = 0;
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', '도표 탐색');

  // 복제하지 않고 원본을 옮긴다. Mermaid의 화살표 마커와 그라디언트는 id를 url()로 참조하므로
  // 같은 id를 가진 SVG가 둘이 되면 어느 쪽이 참조를 가져갈지 정해지지 않는다.
  // 빠진 자리는 같은 높이의 빈 요소로 채워 본문이 위로 밀리지 않게 한다.
  const slot = doc.createElement('div');
  slot.style.height = `${Math.round(svg.getBoundingClientRect().height)}px`;
  const inline = { width: svg.style.width, maxWidth: svg.style.maxWidth, maxHeight: svg.style.maxHeight, height: svg.style.height };
  const bounds = svg.getBoundingClientRect();
  const naturalWidth = svg.viewBox.baseVal.width || bounds.width;
  const naturalHeight = svg.viewBox.baseVal.height || bounds.height;
  const scroll = { left: container.scrollLeft, top: container.scrollTop };
  svg.replaceWith(slot);
  stage.appendChild(svg);

  // 넓은 화면에서는 화면에 맞춰 전체 구조를 먼저 보여 주고, 버튼으로 원래 크기와 오간다.
  let fitted = opensFitted(doc.defaultView);
  const applyScale = () => {
    const style = doc.defaultView!.getComputedStyle(stage);
    const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const size = fitted ? fitViewerSize(naturalWidth, naturalHeight, width, height) : { width: naturalWidth, height: naturalHeight };
    if (!size.width || !size.height) return;
    svg.style.width = `${size.width}px`;
    svg.style.height = `${size.height}px`;
    svg.style.maxWidth = 'none';
    svg.style.maxHeight = 'none';
    scale.textContent = fitted ? '원래 크기' : '전체 보기';
  };

  scale.addEventListener('click', () => { fitted = !fitted; applyScale(); stage.scrollLeft = 0; stage.scrollTop = 0; });
  close.addEventListener('click', () => dialog.close());
  // 다이얼로그 안의 빈 공간은 닫지 않고 실제 바깥을 누른 경우만 닫는다.
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  const observer = doc.defaultView?.ResizeObserver ? new doc.defaultView.ResizeObserver(applyScale) : null;
  // Escape로 닫아도 이 처리를 지나므로 원상 복구가 한곳에 모인다.
  dialog.addEventListener('close', () => {
    observer?.disconnect();
    svg.style.width = inline.width;
    svg.style.maxWidth = inline.maxWidth;
    svg.style.maxHeight = inline.maxHeight;
    svg.style.height = inline.height;
    slot.replaceWith(svg);
    dialog.remove();
    onRestore?.();
    container.scrollLeft = scroll.left;
    container.scrollTop = scroll.top;
    if (opener.isConnected) opener.focus();
    else {
      const host = container as HTMLElement;
      if (!host.hasAttribute('tabindex')) host.tabIndex = -1;
      host.focus();
    }
  });

  tools.append(scale, close);
  dialog.append(tools, stage);
  doc.body.appendChild(dialog);
  dialog.showModal();
  applyScale();
  observer?.observe(stage);
  scale.focus();
}
