import { closeOnBackdrop } from './dialog-backdrop.ts';
import { fitViewerSize } from './mermaid-viewer.ts';

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
  button.addEventListener('click', () => {
    // 아직 불러오지 못한 그림은 크기를 계산할 수 없다. 로드가 끝난 뒤 다시 누를 수 있다.
    if (!image.naturalWidth || !image.naturalHeight) return;
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
  });
}
