import { closeOnBackdrop } from './dialog-backdrop.ts';
import { fitViewerSize } from './mermaid-viewer.ts';

let latestRequest = 0;
// 다른 모달을 열었다 닫아도 이전 확대 요청이 다시 살아나지 않게 한다.
new MutationObserver((records) => {
  if (records.some(record => record.target instanceof HTMLDialogElement && record.oldValue === null)) {
    latestRequest++;
  }
}).observe(document.body, { attributes: true, attributeFilter: ['open'], attributeOldValue: true, subtree: true });

// 링크와 카드의 이동을 가로채지 않는다. 스크립트가 없으면 원래 이미지 그대로 읽는다.
for (const image of document.querySelectorAll<HTMLImageElement>('.body img')) {
  if (image.closest('a, button, .article-card')) continue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-zoom';
  button.setAttribute('aria-label', `${image.alt || '본문 이미지'} 크게 보기`);
  button.setAttribute('aria-haspopup', 'dialog');
  image.replaceWith(button);
  button.append(image);
  const state = document.createElement('span');
  state.className = 'image-load-state';
  const message = document.createElement('span');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '다시 시도';
  retry.setAttribute('aria-label', `${image.alt || '본문 이미지'} 다시 시도`);
  retry.hidden = true;
  state.append(message, retry);
  button.after(state);
  let pending = false;
  let request = 0;
  const requestOpen = async (reload = false) => {
    // 같은 이미지의 로딩은 재사용하되, 취소 뒤 다시 누른 확대 의도는 새로 받는다.
    request = ++latestRequest;
    if (pending) return;
    pending = true;
    retry.hidden = true;
    message.textContent = '';
    button.setAttribute('aria-busy', 'true');
    // 빠르게 불러온 그림에는 안내가 번쩍이지 않게 한다. 대기 중 다시 눌러도 요청은 하나다.
    const timer = setTimeout(() => { message.textContent = '이미지를 불러오는 중…'; }, 200);
    try {
      image.loading = 'eager';
      if (reload) image.src = image.currentSrc || image.src;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image has no dimensions');
      clearTimeout(timer);
      message.textContent = '';
      // 로딩 중 다른 작업을 시작했다면 완료되어도 확대창을 열지 않는다.
      if (request === latestRequest && !document.querySelector('dialog[open]')) openViewer();
    } catch {
      clearTimeout(timer);
      message.textContent = '이미지를 불러오지 못했습니다.';
      retry.hidden = false;
      if (reload && request === latestRequest && !document.querySelector('dialog[open]')) {
        retry.focus({ preventScroll: true });
      }
    } finally {
      pending = false;
      button.removeAttribute('aria-busy');
    }
  };
  button.addEventListener('click', () => { void requestOpen(); });
  retry.addEventListener('click', () => { void requestOpen(true); });
  const openViewer = () => {
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function') return;
    dialog.className = 'diagram-viewer image-viewer';
    dialog.setAttribute('aria-label', '이미지 크게 보기');
    const tools = document.createElement('div');
    tools.className = 'diagram-viewer-tools';
    const scale = document.createElement('button');
    scale.type = 'button';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '닫기';
    close.autofocus = true;
    const stage = document.createElement('div');
    stage.className = 'diagram-viewer-stage';
    stage.tabIndex = 0;
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', '이미지 탐색');
    const full = document.createElement('img');
    full.src = image.currentSrc || image.src;
    full.alt = image.alt;
    full.draggable = false;
    stage.append(full);
    let fitted = true;
    const resize = () => {
      const style = getComputedStyle(stage);
      const size = fitted ? fitViewerSize(image.naturalWidth, image.naturalHeight,
        stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
        : { width: image.naturalWidth, height: image.naturalHeight };
      full.style.width = `${size.width}px`;
      full.style.height = `${size.height}px`;
      scale.textContent = fitted ? '원래 크기' : '전체 보기';
    };
    scale.addEventListener('click', () => { fitted = !fitted; resize(); stage.scrollTo(0, 0); });
    close.addEventListener('click', () => dialog.close());
    closeOnBackdrop(dialog);
    const observer = new ResizeObserver(resize);
    dialog.addEventListener('close', () => {
      observer.disconnect();
      dialog.remove();
      button.focus({ preventScroll: true });
    }, { once: true });
    tools.append(scale, close);
    dialog.append(tools, stage);
    document.body.append(dialog);
    dialog.showModal();
    resize();
    observer.observe(stage);
    close.focus();
  };
}
