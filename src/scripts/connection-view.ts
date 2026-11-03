export {};
for (const region of document.querySelectorAll<HTMLElement>('[data-connections]')) {
  const controls = region.querySelector<HTMLElement>('.connection-switch');
  const graph = region.querySelector<HTMLElement>('[data-connection-graph]');
  const list = region.querySelector<HTMLElement>('[data-connection-list]');
  if (!controls || !graph || !list) continue;
  const buttons = [...controls.querySelectorAll<HTMLButtonElement>('[data-connection-mode]')];
  const show = (mode: string) => {
    graph.hidden = mode !== 'graph';
    list.hidden = mode !== 'list';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.connectionMode === mode));
  };
  // 스크립트가 없으면 제목 전체 목록을 읽을 수 있고, 조작 가능한 경우에만 그래프를 기본으로 둔다.
  controls.hidden = false;
  for (const button of buttons) button.addEventListener('click', () => show(button.dataset.connectionMode!));
  show('graph');
}
