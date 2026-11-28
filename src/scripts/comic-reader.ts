import { createIdPhotoMotion } from './id-photo-motion.ts';
import { clampSlide, isSlideHash, positionLabel, slideFromHash, slideHash, tapDirection } from '../lib/comic-reader.ts';

// 독립 만화 작품의 리더다. 노트 본문 만화(comic.ts)와 달리 끝 장, 주소 조각, 크게 보기를 맡는다.
for (const root of document.querySelectorAll<HTMLElement>('[data-comic-book]')) {
  const pageCount = Number(root.dataset.pageCount);
  const home = root.querySelector<HTMLElement>('[data-comic-home]')!;
  const viewer = root.querySelector<HTMLElement>('[data-comic-viewer]')!;
  const track = root.querySelector<HTMLElement>('[data-comic-track]')!;
  const slides = [...track.querySelectorAll<HTMLElement>(':scope > .comic-slide')];
  const controls = root.querySelector<HTMLElement>('.comic-book-controls')!;
  const status = controls.querySelector<HTMLElement>('[role="status"]')!;
  const previous = controls.querySelector<HTMLButtonElement>('[data-comic-step="-1"]')!;
  const next = controls.querySelector<HTMLButtonElement>('[data-comic-step="1"]')!;
  const open = controls.querySelector<HTMLButtonElement>('[data-comic-open]')!;
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const slot = dialog.querySelector<HTMLElement>('[data-comic-slot]')!;
  const ambient = dialog.querySelector<HTMLImageElement>('[data-comic-ambient]')!;
  let current = -1;
  const motion = createIdPhotoMotion(track, step => turn(current + step));

  function show(index: number) {
    if (index === current) return;
    current = index;
    motion?.select(index);
    slides.forEach((slide, n) => {
      // 화면 밖 장의 링크와 버튼에 탭이 들어가지 않게 한다.
      if (n !== index && slide.contains(document.activeElement)) track.focus({ preventScroll: true });
      slide.inert = n !== index;
      slide.setAttribute('aria-hidden', String(n !== index));
    });
    status.textContent = positionLabel(index, pageCount);
    previous.disabled = index === 0;
    next.disabled = index === pageCount;
    if ((previous.disabled && document.activeElement === previous) || (next.disabled && document.activeElement === next)) track.focus({ preventScroll: true });
    // 주소로 뒤쪽 장에 바로 들어오면 지연 로딩이 늦게 깨어나므로 지금 장도 함께 서두른다.
    for (const slide of [slides[index], slides[index + 1]]) {
      const image = slide?.querySelector<HTMLImageElement>(':scope > img');
      if (image) image.loading = 'eager';
    }
    const image = slides[index].querySelector<HTMLImageElement>(':scope > img');
    if (image) ambient.src = image.currentSrc || image.src;
    // 장마다 기록을 쌓으면 뒤로 가기가 작품을 떠나지 못하므로 주소만 바꾼다.
    // 조각 없이 들어와 첫 장에 머무는 동안은 공유하기 좋은 깨끗한 작품 주소를 그대로 둔다.
    // 전용 주소는 늘 표지부터 열리므로, 읽는 동안 조각을 붙이면 주소와 실제로 열리는 장이 달라진다. 닫을 때 작품 주소에 붙인다.
    if (root.hasAttribute('data-start-open')) return;
    if (index !== 0 || location.hash) history.replaceState(history.state, '', slideHash(index, pageCount));
  }

  function align() {
    motion?.stop();
    track.scrollTo({ left: current * track.clientWidth, behavior: 'instant' });
  }

  function go(index: number) {
    show(clampSlide(index, pageCount));
    align();
  }

  function turn(index: number) {
    const from = current;
    const target = clampSlide(index, pageCount);
    if (from === target) return;
    if (motion?.active) align();
    show(target);
    if (!motion?.animate(from, target, align)) align();
  }

  const syncPosition = () => {
    if (!motion?.active && track.clientWidth) show(clampSlide(Math.round(track.scrollLeft / track.clientWidth), pageCount));
  };
  if (Reflect.has(track, 'onscrollend')) {
    track.addEventListener('scrollend', syncPosition);
  } else {
    let timer: ReturnType<typeof setTimeout>;
    let touching = false;
    const schedule = () => {
      clearTimeout(timer);
      // 스와이프 중 잠깐 멈춰도 손을 떼기 전에는 장을 확정하지 않는다.
      if (!touching) timer = setTimeout(syncPosition, 150);
    };
    track.addEventListener('scroll', schedule, { passive: true });
    for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
      track.addEventListener(type, event => { touching = event.touches.length > 0; schedule(); }, { passive: true });
    }
  }

  function openBig() {
    if (dialog.open) return;
    slot.append(viewer);
    dialog.showModal();
    // 옮기면 스크롤 위치가 사라지므로 새 폭으로 같은 장에 다시 맞춘다.
    align();
    track.focus({ preventScroll: true });
  }

  dialog.addEventListener('close', () => {
    home.append(viewer);
    align();
    const returnFocus = open.getClientRects().length ? open : track;
    returnFocus.focus({ preventScroll: true });
    // 전용 주소로 들어온 사람도 닫은 뒤에는 작품 페이지 주소에 남아야 새로고침이 크게 보기를 다시 열지 않는다.
    if (root.hasAttribute('data-start-open')) {
      root.removeAttribute('data-start-open');
      history.replaceState(history.state, '', `${root.dataset.workPath}${slideHash(current, pageCount)}`);
    }
  });

  previous.addEventListener('click', () => turn(current - 1));
  next.addEventListener('click', () => turn(current + 1));
  open.addEventListener('click', openBig);
  dialog.querySelector('[data-comic-close]')!.addEventListener('click', () => dialog.close());
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.defaultPrevented || event.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // 첫 진입 때는 본문에 초점이 있다. 머리글과 다른 위젯의 방향키는 해당 조작에 맡긴다.
    // 본문 여백이나 제목을 누르면 초점이 body가 아니라 초점을 받을 수 있는 main(#app)으로 간다. 이 경우도 첫 진입과 같이 본다.
    const page = target === document.body || target === document.documentElement || target.matches('main');
    if (!page && !root.contains(target)) return;
    if (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')) return;
    if (document.querySelector('dialog[open]:not(.comic-big)')) return;
    event.preventDefault();
    turn(current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  // 작은 글씨는 브라우저 확대에 맡긴다. 확대한 채 화면을 옮기려고 가장자리를 누를 때 장이 넘어가면 읽던 자리를 잃으므로, 확대를 풀 때까지 탭 넘기기를 쉰다.
  // 확대를 풀어도 배율이 1에서 아주 조금 어긋나게 남는 기기가 있어 여유를 둔다.
  const pinchZoomed = () => (visualViewport?.scale ?? 1) > 1.01;
  track.addEventListener('click', event => {
    const target = event.target as Element;
    if (dialog.open || !target.matches('.comic-slide > img')) return;
    if (open.getClientRects().length) {
      openBig();
      return;
    }
    // 휴대폰 본문에는 크게 보기 버튼이 없어 그림을 눌러도 할 일이 없다. 크게 보기와 같은 좌우 3분의 1 규칙으로 넘긴다.
    // 그림 안쪽만 받는다. 그림 밖의 본문 여백은 세로 스크롤을 시작하는 자리로 남긴다.
    if (pinchZoomed()) return;
    const box = target.getBoundingClientRect();
    const direction = tapDirection(event.clientX - box.left, box.width);
    if (direction) turn(current + direction);
  });
  // 크게 보기에서는 그림 위아래의 흐린 여백도 누르는 자리로 쓴다. 폰에서는 여백이 넓어 그림 높이 안쪽만 받으면 누를 자리를 가늠해야 한다.
  dialog.addEventListener('click', event => {
    const target = event.target as Element;
    // 머리줄, 버튼, 끝 장의 링크는 각자의 동작이 있으므로 넘기기로 가로채지 않는다.
    if (target.closest('a, button, .comic-end, .comic-big-top, [role="status"]')) return;
    if (pinchZoomed()) return;
    const direction = tapDirection(event.clientX, innerWidth);
    if (direction) turn(current + direction);
  });
  new ResizeObserver(align).observe(track);
  // 주소창에서 조각만 바꾸면 문서를 다시 읽지 않으므로 직접 그 장으로 옮긴다. replaceState는 이 이벤트를 일으키지 않는다.
  // 「본문으로 건너뛰기」(#app) 같은 다른 조각 이동은 장과 관계가 없으므로 그대로 둔다.
  addEventListener('hashchange', () => {
    if (isSlideHash(location.hash)) go(slideFromHash(location.hash, pageCount));
  });

  controls.hidden = false;
  root.classList.add('is-enhanced');
  // 전용 주소는 공유받은 조각과 상관없이 표지부터 크게 보기로 연다.
  if (root.hasAttribute('data-start-open')) {
    go(0);
    openBig();
  } else {
    go(slideFromHash(location.hash, pageCount));
  }
}
