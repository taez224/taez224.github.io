export {};
// 각주 번호를 누르면 번호 아래에 그 각주를 판으로 띄운다. 판을 번호에 붙이고 화면 가장자리와 아래 공간을 피하는 일은
// CSS anchor positioning이 맡고(body.css의 .footnote-panel), 판을 맨 위 층에 올리는 일은 popover가 맡는다.
// 둘 중 하나라도 없는 브라우저에서는 손대지 않으므로 번호가 링크대로 글 끝 각주 목록으로 가고, ↩로 돌아온다.
// 키보드로 누르면(click의 detail이 0) 판을 띄우지 않고 링크대로 목록으로 간다. 화면 낭독기와 키보드 사용자는
// 목록과 ↩로 오가는 편이 흐름을 잃지 않고, 맨 위 층의 판 안팎으로 포커스를 옮기는 처리가 필요 없다.
const refs = [...document.querySelectorAll<HTMLAnchorElement>('.body .footnote-ref a')];
if (refs.length && typeof HTMLElement.prototype.showPopover === 'function' && CSS.supports('anchor-name: --footnote')) {
  const panel = document.createElement('div');
  // 판은 맨 위 층에 올라가 본문 밖에 있으므로 body 클래스를 함께 달아 링크·형광·인라인 코드 모양을 물려받는다.
  panel.className = 'body footnote-panel';
  panel.id = 'footnote-panel';
  // auto로 두면 번호를 누르는 순간 브라우저가 먼저 판을 닫아, 같은 번호로 닫기와 다른 번호로 옮기기가 꼬인다.
  // 그래서 manual로 두고 바깥 누르기와 Escape를 여기서 처리한다.
  panel.setAttribute('popover', 'manual');
  document.body.append(panel);

  let current: HTMLAnchorElement | null = null;
  const close = () => {
    if (!current) return;
    current.classList.remove('is-open');
    current.setAttribute('aria-expanded', 'false');
    current = null;
    panel.hidePopover();
  };
  const open = (ref: HTMLAnchorElement, item: HTMLElement) => {
    close();
    const number = document.createElement('span');
    number.className = 'footnote-panel-number';
    number.textContent = ref.textContent;
    // 목록 항목을 복제해 내용만 옮긴다. ↩는 목록 안에서만 뜻이 있으므로 뺀다.
    const copy = item.cloneNode(true) as HTMLElement;
    for (const back of copy.querySelectorAll('.footnote-backref')) back.remove();
    const content = document.createElement('div');
    content.className = 'footnote-panel-body';
    content.append(...copy.childNodes);
    panel.replaceChildren(number, content);
    // 판은 is-open인 번호에 붙는다(anchor-name). 한 번에 하나만 열리므로 이름 하나를 옮겨 단다.
    ref.classList.add('is-open');
    ref.setAttribute('aria-expanded', 'true');
    current = ref;
    panel.showPopover();
  };

  for (const ref of refs) {
    ref.setAttribute('aria-controls', panel.id);
    ref.setAttribute('aria-expanded', 'false');
    ref.addEventListener('click', (event) => {
      const item = document.getElementById(ref.getAttribute('href')!.slice(1));
      if (event.detail === 0 || !item) return;
      event.preventDefault();
      if (current === ref) close();
      else open(ref, item);
    });
  }
  // 다른 번호를 누르면 여기서 먼저 닫히고, 이어지는 click이 그 번호의 판을 연다.
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null;
    if (current && !panel.contains(target) && !current.contains(target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}
