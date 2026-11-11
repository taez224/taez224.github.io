import { uiIcon } from '../lib/ui-icons.ts';

const comics = [...document.querySelectorAll<HTMLElement>('.comic')].filter(comic => comic.querySelectorAll('.comic-page').length > 1);
for (const [comicIndex, comic] of comics.entries()) {
  const viewport = comic.querySelector<HTMLElement>('.comic-pages')!;
  const pages = [...viewport.querySelectorAll<HTMLElement>(':scope > .comic-page')];
  const name = comics.length > 1 ? `만화 ${comicIndex + 1}` : '만화';

  comic.setAttribute('role', 'region');
  comic.setAttribute('aria-label', name);
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-label', `${name} 이미지, 좌우 방향키로 넘기기`);
  const controls = document.createElement('div');
  controls.className = 'comic-controls';
  const previous = document.createElement('button');
  const next = document.createElement('button');
  for (const [button, direction, label] of [[previous, 'previous', '이전 이미지'], [next, 'next', '다음 이미지']] as const) {
    button.type = 'button';
    button.className = `comic-${direction}`;
    button.setAttribute('aria-label', label);
    button.innerHTML = uiIcon(direction === 'previous' ? 'previous' : 'next');
  }
  const status = document.createElement('div');
  status.className = 'comic-position';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  controls.append(previous, status, next);
  comic.append(controls);
  let current = -1;
  function show(index: number) {
    // 종료 알림과 크기 변경이 같은 장을 가리켜도 위치 안내를 다시 읽지 않게 한다.
    if (index === current) return;
    current = index;
    // 전체 묶음을 한꺼번에 받지 않고, 다음 입력에서 볼 그림 한 장만 준비한다.
    const nextImage = pages[index + 1]?.querySelector('img');
    if (nextImage) nextImage.loading = 'eager';
    previous.disabled = index === 0;
    next.disabled = index === pages.length - 1;
    if ((previous.disabled && document.activeElement === previous) || (next.disabled && document.activeElement === next)) viewport.focus({ preventScroll: true });
    status.textContent = `${index + 1} / ${pages.length}`;
    pages.forEach((page, n) => {
      // 화면 밖 이미지의 확대 버튼과 로딩 실패 버튼에 탭이 들어가지 않게 한다.
      if (n !== index && page.contains(document.activeElement)) viewport.focus({ preventScroll: true });
      page.inert = n !== index;
      page.setAttribute('aria-hidden', String(n !== index));
      page.setAttribute('role', 'group');
      page.setAttribute('aria-roledescription', '슬라이드');
      page.setAttribute('aria-label', `${n + 1} / ${pages.length}`);
    });
  }
  function go(index: number) {
    const target = Math.max(0, Math.min(pages.length - 1, index));
    show(target);
    viewport.scrollTo({ left: target * viewport.clientWidth, behavior: 'instant' });
  }
  previous.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));
  comic.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    go(current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  const syncPosition = () => {
    if (viewport.clientWidth) show(Math.max(0, Math.min(pages.length - 1, Math.round(viewport.scrollLeft / viewport.clientWidth))));
  };
  // 지원하는 브라우저에서는 손을 뗀 뒤의 실제 스냅 위치를 쓴다.
  if (Reflect.has(viewport, 'onscrollend')) {
    viewport.addEventListener('scrollend', syncPosition);
  } else {
    let timer: ReturnType<typeof setTimeout>;
    let touching = false;
    const schedulePosition = () => {
      clearTimeout(timer);
      // 스크롤이 잠시 멈춰도 손을 대고 있는 동안에는 장과 초점 범위를 확정하지 않는다.
      if (!touching) timer = setTimeout(syncPosition, 150);
    };
    viewport.addEventListener('scroll', schedulePosition, { passive: true });
    for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
      viewport.addEventListener(type, event => {
        touching = event.touches.length > 0;
        schedulePosition();
      }, { passive: true });
    }
  }
  // 세로 그림도 정사각형 틀에 맞추느라 작아지지 않게, 가장 긴 비율로 자리를 확보한다.
  const ratios = pages.map(page => {
    const image = page.querySelector('img')!;
    const width = Number(image.getAttribute('width'));
    const height = Number(image.getAttribute('height'));
    return width > 0 && height > 0 ? height / width : 1;
  });
  comic.style.setProperty('--comic-height-ratio', String(Math.max(...ratios)));
  new ResizeObserver(() => go(current)).observe(viewport);
  comic.classList.add('is-enhanced');
  show(0);
}
