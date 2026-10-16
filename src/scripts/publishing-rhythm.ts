for (const root of document.querySelectorAll<HTMLElement>('[data-publishing-rhythm]')) {
  const chart = root.querySelector<SVGSVGElement>('[data-rhythm-chart]')!;
  const points = [...chart.querySelectorAll<SVGCircleElement>('[data-month]')];
  const guide = chart.querySelector<SVGLineElement>('[data-rhythm-guide]')!;
  const reading = root.querySelector<HTMLElement>('[data-rhythm-reading]')!;
  const announcement = root.querySelector<HTMLElement>('[data-rhythm-announcement]')!;
  let selected = points.length - 1;
  const inspect = (index: number, announce = false) => {
    selected = Math.max(0, Math.min(points.length - 1, index));
    points.forEach((point, i) => point.toggleAttribute('data-active', i === selected));
    const point = points[selected];
    guide.setAttribute('x1', point.getAttribute('cx')!);
    guide.setAttribute('x2', point.getAttribute('cx')!);
    guide.setAttribute('data-active', '');
    reading.textContent = `${point.dataset.month!.replace('-', '.')} · ${point.dataset.count}편`;
    if (announce) announcement.textContent = reading.textContent;
  };
  const reset = () => {
    points.forEach(point => point.removeAttribute('data-active'));
    guide.removeAttribute('data-active');
    reading.textContent = reading.dataset.summary!;
    announcement.textContent = '';
  };
  const inspectPointer = (event: PointerEvent) => {
    // SVG가 글자 크기와 창 폭을 따라 줄어들어도 그려진 점과 같은 좌표로 고른다.
    const matrix = chart.getScreenCTM();
    if (!matrix) return;
    const pointer = chart.createSVGPoint();
    pointer.x = event.clientX; pointer.y = event.clientY;
    const x = pointer.matrixTransform(matrix.inverse()).x;
    const nearest = points.reduce((best, point, index) =>
      Math.abs(point.cx.baseVal.value - x) < Math.abs(points[best].cx.baseVal.value - x) ? index : best, 0);
    inspect(nearest);
  };
  chart.setAttribute('tabindex', '0');
  chart.setAttribute('role', 'group');
  chart.setAttribute('aria-label', '월별 발행 흐름. 방향키로 월을 살펴봅니다.');
  chart.addEventListener('pointermove', inspectPointer);
  chart.addEventListener('pointerdown', event => { chart.focus({ preventScroll: true }); inspectPointer(event); });
  chart.addEventListener('pointerleave', () => { if (document.activeElement !== chart) reset(); });
  chart.addEventListener('focus', () => inspect(selected, true));
  chart.addEventListener('blur', reset);
  chart.addEventListener('keydown', event => {
    const direction = new Map([['ArrowLeft', -1], ['ArrowDown', -1], ['ArrowRight', 1], ['ArrowUp', 1]]).get(event.key);
    if (direction === undefined && event.key !== 'Home' && event.key !== 'End' && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Escape') { reset(); return; }
    inspect(event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : selected + direction!, true);
  });
}
