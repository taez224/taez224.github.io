import { readingProgress } from './reading-progress.ts';
// 한 열 화면의 목차·연결 버튼(ReaderNavigation.astro). 본문 위 목차를 지나면 나타나며, 목차가 없으면 연결을 바로 열 수 있다.
// 판을 맨 위 층에 올리고 바깥 누르기와 Escape로 닫는 일은 popover가 맡는다. popover가 없는 브라우저에서는 버튼을 보이지 않는다.
// 두 열 화면에서는 CSS가 버튼을 그리지 않으므로 여기서는 폭을 따지지 않는다.
const button = document.querySelector<HTMLButtonElement>('[data-toc-button]');
const sheet = document.getElementById('toc-sheet');
const folded = document.querySelector('.mobile-toc');
const body = document.querySelector<HTMLElement>('.note-article .body');
if (button && sheet && body && typeof sheet.showPopover === 'function') {
  // 사이드바 목차(toc.ts)는 .rail a[data-heading]을 찾는다. 같은 이름을 쓰면 그 스크립트가 이 판의 링크를 대신 표시하므로 클래스와 속성 이름을 달리한다.
  const links = [...sheet.querySelectorAll<HTMLAnchorElement>('a[data-toc-target]')];
  const headings = links.map((link) => document.getElementById(link.dataset.tocTarget!)).filter((heading): heading is HTMLElement => heading !== null);
  let foldedOnScreen = !!folded;
  const narrow = matchMedia('(max-width: 1120px)');
  let queued = false;
  const update = () => {
    queued = false;
    // 본문 위 목차가 보이는 동안은 같은 목차를 두 곳에 두지 않는다.
    button.hidden = foldedOnScreen || !narrow.matches;
    if (button.hidden) { if (sheet.matches(':popover-open')) sheet.hidePopover(); return; }
    const last = body.lastElementChild ?? body;
    const progress = readingProgress({
      bodyTop: body.getBoundingClientRect().top,
      lastBlockTop: last.getBoundingClientRect().top,
      viewportHeight: innerHeight,
      headerBottom: document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0
    });
    button.style.setProperty('--progress', String(progress));
  };
  // 스크롤마다 위치를 재지 않고 다음 프레임에 한 번만 잰다.
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  if (folded) new IntersectionObserver(([entry]) => { foldedOnScreen = entry.isIntersecting; schedule(); }).observe(folded);
  new ResizeObserver(schedule).observe(body);
  narrow.addEventListener('change', schedule);
  schedule();
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);

  const tabs = [...sheet.querySelectorAll<HTMLButtonElement>('[data-reader-tab]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')!)!);
  const map = sheet.querySelector<HTMLElement>('[data-reader-map]');
  // 숨긴 목차로 scrollIntoView를 호출하면 본문 위치까지 바뀔 수 있으므로 목차 탭이 열린 때만 표시한다.
  const markCurrent = () => {
    if (document.getElementById('reader-toc-panel')?.hidden !== false) return;
    const line = innerHeight * 0.3;
    const current = headings.findLast(heading => heading.getBoundingClientRect().top <= line) ?? headings[0];
    for (const link of links) {
      if (link.dataset.tocTarget === current?.id) { link.setAttribute('aria-current', 'location'); link.scrollIntoView({ block: 'nearest' }); }
      else link.removeAttribute('aria-current');
    }
  };
  const select = (index: number, focus = false) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (map) map.hidden = panels[index].id !== 'reader-links-panel';
    if (focus) tabs[index].focus();
    markCurrent();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(next, true);
    });
  });
  sheet.querySelector('[data-reader-close]')?.addEventListener('click', () => {
    sheet.hidePopover();
    button.focus({ preventScroll: true });
  });
  sheet.addEventListener('toggle', event => {
    if ((event as ToggleEvent).newState === 'open') markCurrent();
  });
  // 절을 고르면 그 절이 판에 가리지 않게 닫는다.
  sheet.addEventListener('click', (event) => { if ((event.target as Element).closest('a')) sheet.hidePopover(); });
}
