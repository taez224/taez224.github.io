const links = [...document.querySelectorAll('.rail a[data-heading]')];
if (links.length) {
  const byId = new Map(links.map((link) => [link.dataset.heading, link]));
  const headings = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  let active = null;
  const mark = (id) => {
    if (active === id) return;
    active = id;
    for (const [key, link] of byId) {
      if (key === id) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    }
  };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) mark(visible[0].target.id);
  }, { rootMargin: '-96px 0px -70% 0px', threshold: 0 });
  headings.forEach((heading) => observer.observe(heading));
  mark(headings[0]?.id);
}
