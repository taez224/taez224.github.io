import { hashTarget, inPageLink } from './in-page-link.ts';

const links = [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-heading]')];
if (links.length) {
  const byId = new Map(links.map((link) => [link.dataset.heading!, link]));
  const headings = [...byId.keys()].map((id) => document.getElementById(id)).filter((heading): heading is HTMLElement => heading !== null);
  let active: string | undefined | null = null;
  // 긴 목차에서 현재 항목이 보이는 영역 밖이면 사이드바만 스크롤한다. 페이지는 건드리지 않는다.
  const side = links[0].closest('.note-side');
  // 현재 항목을 위에서 35% 자리에 둔다. 그래야 다음 절이 아래에 보인다. 이미 편한 구간(15%~60%)에 있으면 건드리지 않는다.
  const reveal = (link: HTMLAnchorElement) => {
    const scroller = side && side.scrollHeight > side.clientHeight + 1 ? side : null;
    if (!scroller) return;
    const box = scroller.getBoundingClientRect(), l = link.getBoundingClientRect();
    const offset = l.top - box.top;
    if (offset >= box.height * 0.15 && offset + l.height <= box.height * 0.6) return;
    scroller.scrollTop += offset - box.height * 0.35;
  };
  // 아코디언: 읽고 있는 절(h2)의 하위 항목만 펼친다. 다른 절로 넘어가면 그 절은 접히고 새 절이 펼쳐진다.
  const expand = (section: string | undefined) => { for (const link of links) if (link.dataset.parent) link.hidden = link.dataset.parent !== section; };
  const mark = (id: string | undefined) => {
    if (active === id) return;
    active = id;
    const current = byId.get(id ?? '');
    expand(current?.dataset.parent || id);
    for (const [key, link] of byId) {
      if (key === id) { link.setAttribute('aria-current', 'location'); reveal(link); } else link.removeAttribute('aria-current');
    }
  };
  // 현재 절은 읽는 선(화면 위에서 30%)을 지난 제목 가운데 마지막 것이고, 아무 제목도 지나지 않았으면 첫 제목이다.
  // 다만 첫 제목이 아직 화면 아래에 있으면 어느 절도 가리키지 않는다. 절 없이 주장을 쓰고 끝에 「출처」만 둔 생각 노트에서
  // 첫 화면부터 「출처」를 읽는 중으로 표시했다.
  // 감시 구역을 선 근처의 좁은 띠로 두면, 스크롤 한 번에 띠를 건너뛴 제목은 교차 상태가 그대로라 알림이 오지 않아
  // 맨 위로 가도 이전 절이 남았다. 구역을 선 위로 문서보다 길게 늘려 두면 제목이 선을 넘을 때마다 상태가 바뀐다.
  // 알림이 온 제목의 상태만 고치므로 스크롤마다 모든 제목의 위치를 다시 잴 필요가 없다.
  const ABOVE_LINE = 1_000_000;
  const passed = new Set<Element>();
  // 목차에서 누르거나 주소로 가리킨 절은 독자가 다시 스크롤할 때까지 선 규칙보다 먼저 가리킨다. 페이지 끝의 짧은 절은
  // 끝까지 내려도 제목이 선에 닿지 못해, 선 규칙만 따르면 누른 항목 대신 앞 절이 강조된다.
  let chosen: HTMLElement | undefined;
  let chosenSeen = false;
  let readerInput = false;
  let firstReached = false;
  const update = () => mark((chosen ?? headings.findLast((heading) => passed.has(heading)) ?? (firstReached ? headings[0] : undefined))?.id);
  const onScreen = (element: Element) => { const box = element.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight; };
  const choose = (target: HTMLElement | null) => {
    chosen = target && headings.includes(target) ? target : undefined;
    chosenSeen = chosen ? onScreen(chosen) : false;
    readerInput = false;
    update();
  };
  const release = () => { if (chosen) { chosen = undefined; update(); } };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) passed.add(entry.target);
      else passed.delete(entry.target);
    }
    update();
  }, { rootMargin: `${ABOVE_LINE}px 0px -70% 0px` });
  headings.forEach((heading) => observer.observe(heading));
  // 첫 제목이 화면 아래 끝을 넘어 들어왔는지 본다. 위쪽 구역을 문서보다 길게 늘려 화면 위로 지나간 뒤에도 들어온 것으로 둔다.
  if (headings[0]) new IntersectionObserver(([entry]) => { firstReached = entry.isIntersecting; update(); }, { rootMargin: `${ABOVE_LINE}px 0px 0px 0px` }).observe(headings[0]);
  choose(hashTarget(location.hash));
  // 각주처럼 제목이 아닌 곳으로 가는 앵커는 고른 절을 풀고 선 규칙으로 돌아간다.
  document.addEventListener('click', (event) => { const link = inPageLink(event); if (link) choose(hashTarget(link.hash)); });
  window.addEventListener('hashchange', () => choose(hashTarget(location.hash)));
  // 독자가 직접 스크롤하면 선 규칙으로 돌아간다. 입력 자리가 아니라 뒤이어 페이지가 실제로 움직였는지로 가린다.
  // 목차 목록만 스크롤되면 창의 scroll이 오지 않고, 맨 아래에서 더 내려도 페이지가 그대로라 고른 절이 남는다.
  // 누른 직후에는 마우스가 목차 위에 있어도 휠이 페이지를 움직이므로 입력 자리로 가리면 풀리지 않았다.
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  const byReader = () => { readerInput = true; };
  addEventListener('wheel', byReader, { passive: true });
  addEventListener('touchmove', byReader, { passive: true });
  addEventListener('keydown', (event) => { if (SCROLL_KEYS.has(event.key)) byReader(); });
  // 스크롤 막대를 끌거나 찾기로 옮긴 것처럼 위 입력 없이 스크롤해도, 고른 절이 화면에 들어왔다가 벗어나면 돌아간다.
  // 누른 순간에는 그 절이 아직 화면 밖일 수 있으므로, 한 번 화면에 들어온 뒤에만 이 규칙으로 푼다.
  addEventListener('scroll', () => {
    if (!chosen) return;
    if (readerInput) release();
    else if (onScreen(chosen)) chosenSeen = true;
    else if (chosenSeen) release();
  }, { passive: true });
}
