const links = [...document.querySelectorAll('.rail a[data-heading]')];
if (links.length) {
  const byId = new Map(links.map((link) => [link.dataset.heading, link]));
  const headings = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  let active = null;
  // 긴 목차에서 현재 항목이 보이는 영역 밖이면 목차(스크롤될 때) 또는 사이드바만 스크롤한다. 페이지는 건드리지 않는다.
  const rail = links[0].closest('.rail'), side = links[0].closest('.note-side');
  // 현재 항목을 위에서 35% 자리에 둔다. 그래야 다음 절이 아래에 보인다. 이미 편한 구간(15%~60%)에 있으면 건드리지 않는다.
  const reveal = (link) => {
    const scroller = [rail, side].find((el) => el && el.scrollHeight > el.clientHeight + 1);
    if (!scroller) return;
    const box = scroller.getBoundingClientRect(), l = link.getBoundingClientRect();
    const offset = l.top - box.top;
    if (offset >= box.height * 0.15 && offset + l.height <= box.height * 0.6) return;
    scroller.scrollTop += offset - box.height * 0.35;
  };
  // 목차를 끝까지 내리면 아래 페이드를 걷는다.
  const wrap = rail?.parentElement;
  const atEnd = () => { if (wrap?.classList.contains('rail-scroll')) wrap.toggleAttribute('data-at-end', rail.scrollTop + rail.clientHeight >= rail.scrollHeight - 2); };
  rail?.addEventListener('scroll', atEnd, { passive: true });
  atEnd();
  // 아코디언: 읽고 있는 절(h2)의 하위 항목만 펼친다. 다른 절로 넘어가면 그 절은 접히고 새 절이 펼쳐진다.
  const expand = (section) => { for (const link of links) if (link.dataset.parent) link.hidden = link.dataset.parent !== section; };
  const mark = (id) => {
    if (active === id) return;
    active = id;
    const current = byId.get(id);
    expand(current?.dataset.parent || id);
    for (const [key, link] of byId) {
      if (key === id) { link.setAttribute('aria-current', 'location'); reveal(link); } else link.removeAttribute('aria-current');
    }
  };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) mark(visible[0].target.id);
  }, { rootMargin: '-96px 0px -70% 0px', threshold: 0 });
  headings.forEach((heading) => observer.observe(heading));
  mark(headings[0]?.id);
}
