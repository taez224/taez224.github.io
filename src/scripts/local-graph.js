for (const root of document.querySelectorAll('.local-graph')) {
  const scene = root.querySelector('[data-scene]');
  const reset = root.querySelector('[data-local-zoom="reset"]');
  let scale = 1;
  const apply = () => {
    scene.setAttribute('transform', `translate(${155 - 155 * scale} ${95 - 95 * scale}) scale(${scale})`);
    reset.textContent = `${Math.round(scale * 100)}%`;
  };
  root.querySelector('[data-local-zoom="in"]').addEventListener('click', () => { scale = Math.min(2.2, scale + .2); apply(); });
  root.querySelector('[data-local-zoom="out"]').addEventListener('click', () => { scale = Math.max(.6, scale - .2); apply(); });
  reset.addEventListener('click', () => { scale = 1; apply(); });
}
