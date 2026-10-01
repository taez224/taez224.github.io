import { readingProgress } from './reading-progress.ts';
// 한 열 화면의 목차 버튼(NotePage.astro). 접힌 목차가 화면을 벗어나면 나타나고, 누르면 목차 판이 열린다.
// 판을 맨 위 층에 올리고 바깥 누르기와 Escape로 닫는 일은 popover가 맡는다. popover가 없는 브라우저에서는 버튼을 보이지 않는다.
// 두 열 화면에서는 CSS가 버튼을 그리지 않으므로 여기서는 폭을 따지지 않는다.
const button = document.querySelector<HTMLButtonElement>('[data-toc-button]');
const sheet = document.getElementById('toc-sheet');
const folded = document.querySelector('.mobile-toc');
const body = document.querySelector<HTMLElement>('.note-article .body');
if (button && sheet && folded && body && typeof sheet.showPopover === 'function') {
  // 사이드바 목차(toc.ts)는 .rail a[data-heading]을 찾는다. 같은 이름을 쓰면 그 스크립트가 이 판의 링크를 대신 표시하므로 클래스와 속성 이름을 달리한다.
  const links = [...sheet.querySelectorAll<HTMLAnchorElement>('a[data-toc-target]')];
  const headings = links.map((link) => document.getElementById(link.dataset.tocTarget!)).filter((heading): heading is HTMLElement => heading !== null);
  let foldedOnScreen = true;
  let queued = false;
  const update = () => {
    queued = false;
    // 접힌 목차가 보이는 동안은 같은 목차를 두 곳에 두지 않는다.
    button.hidden = foldedOnScreen;
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
  new IntersectionObserver(([entry]) => { foldedOnScreen = entry.isIntersecting; schedule(); }).observe(folded);
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);

  // 판을 열 때 지금 읽는 절을 가리킨다. 기준은 사이드바 목차와 같이 화면 위 30% 선을 지난 마지막 제목이다(toc.ts).
  // 막대가 알려 주는 대략의 위치를 절 이름으로 구체화한다. 판이 닫혀 있는 동안은 계산하지 않는다.
  sheet.addEventListener('toggle', (event) => {
    if ((event as ToggleEvent).newState !== 'open') return;
    const line = innerHeight * 0.3;
    const current = headings.findLast((heading) => heading.getBoundingClientRect().top <= line) ?? headings[0];
    for (const link of links) {
      if (link.dataset.tocTarget === current?.id) { link.setAttribute('aria-current', 'location'); link.scrollIntoView({ block: 'nearest' }); }
      else link.removeAttribute('aria-current');
    }
  });
  // 절을 고르면 그 절이 판에 가리지 않게 닫는다.
  sheet.addEventListener('click', (event) => { if ((event.target as Element).closest('a')) sheet.hidePopover(); });
}
