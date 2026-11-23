function findMotionSlides(track: HTMLElement) {
  const gaze = track.querySelector<SVGSVGElement>('[data-layer="gaze"]');
  const badge = track.querySelector<SVGSVGElement>('[data-layer="badge"]');
  const gazeSlide = gaze?.closest<HTMLElement>('.comic-slide');
  const badgeSlide = badge?.closest<HTMLElement>('.comic-slide');
  const arrival = badgeSlide?.nextElementSibling?.querySelector<HTMLImageElement>(':scope > img');
  if (!gaze || !badge || !gazeSlide || !badgeSlide || gazeSlide.nextElementSibling !== badgeSlide || !arrival) return;
  return { gaze, badge, gazeSlide, badgeSlide, arrival };
}

// v14 원화에서 같은 사진 좌표를 작은 케이스와 최종 초상에 각각 맞춘 변환이다.
export function createIdPhotoMotion(track: HTMLElement, turn: (step: number) => void) {
  const slides = findMotionSlides(track);
  if (!slides) return;
  const { gaze, badge, gazeSlide, badgeSlide, arrival } = slides;
  const badgeIndex = Array.from(track.children).indexOf(badgeSlide);
  const bubble = gaze.querySelector('#bubble-left')!;
  const part = (id: string) => badge.querySelector('#' + id)!;
  const right = part('right'), cues = part('gaze-cues'), glass = part('card-glass');
  const reflection = part('reflection'), glints = part('glints'), detail = part('detail');
  const finish = part('finish'), iris = part('iris'), caseIris = part('case-iris');
  const small = new DOMMatrix().translate(101, 40).scale(.81416)
    .multiply(new DOMMatrix([.42, .12, -.202, .59, 86, 421])).scale(106 / 110, 104 / 106).translate(-95, -137);
  const large = new DOMMatrix().translate(200, 265).scale(2.22).translate(-150, -205);
  const start = small.multiply(large.inverse());
  const inverse = start.inverse();
  const scale = Math.sqrt(start.a * start.d - start.b * start.c);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const images = track.querySelectorAll<SVGImageElement>('.comic-art-layer image');
  let requested = false;
  let loaded = 0;
  let current = -1;
  function prepareLayers() {
    if (requested || reduced.matches || current < badgeIndex - 2 || current > badgeIndex + 1) return;
    requested = true;
    for (const image of images) {
      image.addEventListener('load', () => loaded++, { once: true });
      image.setAttribute('href', image.dataset.src ?? arrival.src);
    }
  }
  function select(index: number) {
    current = index;
    prepareLayers();
    track.classList.toggle('is-badge-stop', !reduced.matches && (index === badgeIndex || index === badgeIndex + 1));
  }
  reduced.addEventListener('change', () => select(current));
  let frame = 0;
  function ease(value: number) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }
  function paintZoom(time: number) {
    const p = ease(time);
    const w = (scale ** (1 - p) - scale) / (1 - scale);
    const m = new DOMMatrix([start.a + (1 - start.a) * w, start.b * (1 - w), start.c * (1 - w),
      start.d + (1 - start.d) * w, start.e * (1 - w), start.f * (1 - w)]);
    const camera = m.multiply(inverse).toString();
    right.setAttribute('transform', camera);
    cues.setAttribute('transform', camera);
    cues.setAttribute('opacity', String(1 - ease(p / .20)));
    glass.setAttribute('transform', m.multiply(large).toString());
    const glare = ease((p - .12) / .55);
    reflection.setAttribute('opacity', String(1 - glare));
    glints.setAttribute('transform', 'translate(' + 110 * glare + ' 0)');
    detail.setAttribute('transform', m.toString());
    detail.setAttribute('opacity', String(ease((p - .15) / .38)));
    finish.setAttribute('transform', m.toString());
    finish.setAttribute('opacity', '1');
    const wipe = ease((p - .60) / .40), grow = ease((p - .22) / .65);
    caseIris.setAttribute('rx', String(400 * wipe));
    caseIris.setAttribute('ry', String(470 * wipe));
    iris.setAttribute('rx', String(90 + 900 * grow));
    iris.setAttribute('ry', String(105 + 1000 * grow));
  }

  function paintSpread() {
    const distance = track.scrollLeft / track.clientWidth - (badgeIndex - 1);
    const moving = distance > 0 && distance < 1 && loaded === images.length && !reduced.matches;
    gazeSlide.classList.toggle('is-painting', moving);
    if (moving) bubble.setAttribute('opacity', String(1 - ease((distance - .85) / .13)));
  }
  track.addEventListener('scroll', paintSpread, { passive: true });

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    badgeSlide.classList.remove('is-painting');
    track.classList.remove('is-animating');
  }
  function animate(from: number, to: number, finishTurn: () => void) {
    const edge = Math.min(from, to);
    if (loaded !== images.length || reduced.matches || Math.abs(from - to) !== 1 || (edge !== badgeIndex && edge !== badgeIndex - 1)) return false;
    const zoom = edge === badgeIndex;
    track.classList.add('is-animating');
    if (zoom) {
      track.scrollLeft = badgeIndex * track.clientWidth;
      badgeSlide.classList.add('is-painting');
    }
    const began = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - began) / (zoom ? 550 : 270));
      if (zoom) paintZoom(to > from ? t : 1 - t);
      else {
        track.scrollLeft = (from + (to - from) * ease(t)) * track.clientWidth;
        paintSpread();
      }
      if (t < 1 && !reduced.matches) frame = requestAnimationFrame(tick);
      else { stop(); finishTurn(); }
    }
    tick(began);
    return true;
  }

  // 확대 양 끝에서는 손을 뗄 때 한 번만 넘긴다. 그 밖의 장은 브라우저의 기본 가로 스크롤을 쓴다.
  let drag: { id: number; x: number; y: number } | undefined;
  let suppressClick = false;
  track.addEventListener('pointerdown', e => {
    suppressClick = false;
    if (!e.isPrimary || e.button !== 0 || !track.classList.contains('is-badge-stop')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  track.addEventListener('pointercancel', () => { drag = undefined; });
  track.addEventListener('pointerup', e => {
    if (drag?.id !== e.pointerId) return;
    const dx = drag.x - e.clientX, dy = drag.y - e.clientY;
    drag = undefined;
    if (Math.abs(dx) < Math.min(45, track.clientWidth * .12) || Math.abs(dx) <= Math.abs(dy)) return;
    suppressClick = true;
    turn(Math.sign(dx));
  });
  track.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // 맥 트랙패드는 손을 뗀 뒤에도 관성 이벤트를 보낸다. 같은 방향의 한 묶음은 한 장으로 센다.
  let last = -Infinity, direction = 0, distance = 0, used = false, native = true;
  track.addEventListener('wheel', e => {
    if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const sign = Math.sign(e.deltaX), now = performance.now();
    if (sign !== direction || now - last > 180) {
      native = !track.classList.contains('is-badge-stop');
      distance = 0;
      used = false;
    }
    direction = sign;
    last = now;
    if (native) return;
    e.preventDefault();
    distance += Math.abs(e.deltaX) * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? track.clientWidth : 1);
    if (!used && distance >= 36) { used = true; turn(sign); }
  }, { passive: false });
  return {
    animate, stop,
    get active() { return frame !== 0; },
    select
  };
}
