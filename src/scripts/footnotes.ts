import { setupCodeCopy } from './code-copy.ts';
// 각주 번호를 누르면 번호 아래에 그 각주를 판으로 띄운다. 판을 번호에 붙이고 화면 가장자리와 아래 공간을 피하는 일은
// CSS anchor positioning이 맡고(body.css의 .footnote-panel), 판을 맨 위 층에 올리는 일은 popover가 맡는다.
// 둘 중 하나라도 없는 브라우저에서는 손대지 않으므로 번호가 링크대로 글 끝 각주 목록으로 가고, ↩로 돌아온다.
// 키보드로 누르면(click의 detail이 0) 판을 띄우지 않고 링크대로 목록으로 간다. 화면 낭독기와 키보드 사용자는
// 목록과 ↩로 오가는 편이 흐름을 잃지 않고, 맨 위 층의 판 안팎으로 포커스를 옮기는 처리가 필요 없다.
//
// 마우스에서는 번호에 잠시 머물면 같은 판을 미리보기로 띄운다. 미리보기는 포인터가 번호와 판을 떠나면 닫히고,
// 번호를 누르면 고정되어 바깥을 누르거나 Escape를 누를 때까지 남는다. 누르는 동작은 터치·마우스 모두 같다.
// 수치는 위키백과 참조 미리보기와 Radix·Base UI의 기본값 범위에서 골랐다.
const OPEN_DELAY = 300;   // 본문을 읽다 포인터가 번호를 스쳐 지나갈 때는 열리지 않을 만큼 기다린다.
const CLOSE_GRACE = 300;  // 번호에서 판으로 포인터를 옮기는 사이 판이 닫히지 않게 둔다.
const SKIP_WINDOW = 300;  // 판이 닫힌 직후 이웃 번호로 옮기면 기다리지 않고 연다.

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
  let pinned = false;
  let openTimer = 0;
  let closeTimer = 0;
  let lastClosed = -Infinity;
  const cancelTimers = () => { clearTimeout(openTimer); clearTimeout(closeTimer); };
  const close = () => {
    cancelTimers();
    if (!current) return;
    current.classList.remove('is-open');
    current.setAttribute('aria-expanded', 'false');
    current = null;
    pinned = false;
    lastClosed = performance.now();
    panel.hidePopover();
  };
  const open = (ref: HTMLAnchorElement, item: HTMLElement, { instant = false } = {}) => {
    const switching = current !== null;
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
    // 복제한 버튼에는 이벤트가 따라오지 않으므로 각주 판의 버튼도 초기화한다.
    setupCodeCopy(content);
    // 판은 is-open인 번호에 붙는다(anchor-name). 한 번에 하나만 열리므로 이름 하나를 옮겨 단다.
    ref.classList.add('is-open');
    ref.setAttribute('aria-expanded', 'true');
    current = ref;
    // 이웃 번호로 옮겨 가며 읽을 때 판마다 다시 떠오르면 번거롭다. 이어서 여는 판은 움직임 없이 바꾼다.
    panel.toggleAttribute('data-instant', instant || switching);
    panel.showPopover();
  };
  const itemFor = (ref: HTMLAnchorElement) => document.getElementById(ref.getAttribute('href')!.slice(1));

  for (const ref of refs) {
    ref.setAttribute('aria-controls', panel.id);
    ref.setAttribute('aria-expanded', 'false');
    ref.addEventListener('click', (event) => {
      const item = itemFor(ref);
      if (event.detail === 0 || !item) return;
      event.preventDefault();
      if (current === ref && pinned) close();
      else {
        // 미리보기로 떠 있던 판을 누르면 다시 그리지 않고 고정만 한다.
        if (current !== ref) open(ref, item, { instant: current !== null });
        cancelTimers();
        pinned = true;
      }
    });
  }

  // 미리보기는 포인터를 올려 둘 수 있는 기기에서만 쓴다. 터치의 pointerenter는 탭과 함께 오므로 마우스만 받는다.
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const scheduleClose = () => {
    if (pinned || !current) return;
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, CLOSE_GRACE);
  };
  for (const ref of refs) {
    ref.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse' || !canHover.matches || pinned) return;
      const item = itemFor(ref);
      if (!item) return;
      cancelTimers();
      if (current === ref) return;
      // 글 끝 목록의 그 항목이 이미 화면 안에 있으면 같은 내용을 판으로 겹쳐 띄우지 않는다.
      // 이웃 번호의 미리보기가 떠 있었다면 그 판도 닫는다. 남겨 두면 지금 가리키는 번호와 다른 각주가 보인다.
      const box = item.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= innerHeight) { close(); return; }
      const skip = current !== null || performance.now() - lastClosed < SKIP_WINDOW;
      openTimer = window.setTimeout(() => open(ref, item, { instant: skip }), skip ? 0 : OPEN_DELAY);
    });
    ref.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse') return;
      clearTimeout(openTimer);
      scheduleClose();
    });
  }
  // 판 위에 포인터가 있는 동안은 닫지 않는다. 확대 화면에서 판을 끝까지 읽으려면 판 위로 옮겨 갈 수 있어야 한다.
  panel.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  panel.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') scheduleClose(); });

  // 다른 번호를 누르면 여기서 먼저 닫히고, 이어지는 click이 그 번호의 판을 연다.
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null;
    if (current && !panel.contains(target) && !current.contains(target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}
