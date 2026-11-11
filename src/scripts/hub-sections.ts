// 빌드 때 추출한 허브 절을 보여 준다. 절의 순서를 관계선으로 바꾸지는 않는다.
import { escapeHtml } from '../lib/format.ts';
interface Item { path: string; title: string; url: string; color?: string }
interface Section { id: string; title: string; items: Item[] }
interface GroupedHub extends Item { sections: Section[] }

export function setupHubSections(svg: SVGSVGElement, panel: HTMLElement, body: HTMLElement, nodeIds: Map<string, string>, emphasize: (ids: string[] | null) => void, selectHub: (id: string) => void) {
  const source = document.querySelector('[data-hub-sections]');
  const hubs = source ? JSON.parse(source.textContent!) as GroupedHub[] : [];
  let active: GroupedHub | undefined;
  let sectionIndex = 0;
  let selected: string | null = null;

  function paint() {
    const group = active?.sections[sectionIndex];
    const ids = group?.items.map(n => nodeIds.get(n.path)).filter((id): id is string => Boolean(id)) ?? [];
    const anchor = active ? nodeIds.get(active.path) : undefined;
    const visible = [...ids, ...(anchor ? [anchor] : []), ...(selected ? [nodeIds.get(selected)!] : [])].filter(Boolean);
    const groupView = Boolean(active && selected === active.path);
    svg.classList.toggle('has-section-selection', groupView);
    document.documentElement.classList.toggle('has-hub-sections', Boolean(active && selected === active.path));
    emphasize(groupView ? visible : null);
    svg.setAttribute('data-section-count', String(ids.length));

  }
  function render() {
    body.querySelector('.hub-section-browser')?.remove();
    body.querySelector('.section-hub-return')?.remove();
    const ordinary = body.querySelector<HTMLElement>('.panel-lists');
    if (ordinary) ordinary.hidden = Boolean(active && selected === active.path);
    panel.classList.toggle('has-hub-sections', Boolean(active && selected === active.path));
    paint();
    if (!active) return;
    const section = active.sections[sectionIndex];
    if (selected !== active.path) {
      const back = document.createElement('a');
      back.className = 'section-hub-return';
      back.href = `${active.url}#${encodeURIComponent(section.id)}`;
      back.dataset.node = nodeIds.get(active.path);
      back.textContent = `← ${active.title} · ${section.title}`;
      body.querySelector('.panel-head')?.after(back);
      return;
    }
    const box = document.createElement('section');
    box.className = 'hub-section-browser';
    box.setAttribute('aria-label', `${active.title}의 절별 노트`);
    box.innerHTML = `<div class="hub-section-choices" role="group" aria-label="절 선택">${active.sections.map((s, index) => `<button type="button" data-hub-section="${index}" aria-pressed="${index === sectionIndex}" aria-controls="hub-section-items"><span>${escapeHtml(s.title)}</span></button>`).join('')}</div>
      <ul class="hub-section-items side-list" id="hub-section-items" aria-label="${escapeHtml(section.title)}">${section.items.map(item => `<li><a href="${escapeHtml(item.url)}"${nodeIds.has(item.path) ? ` data-node="${escapeHtml(nodeIds.get(item.path)!)}"` : ''}${item.path === selected ? ' aria-current="true"' : ''}><i class="section-topic-dot" style="background:${escapeHtml(item.color ?? 'var(--ink)')}" aria-hidden="true"></i><span class="section-note-title">${escapeHtml(item.title)}</span>${!nodeIds.has(item.path) ? '<span class="section-read">읽기</span>' : ''}</a></li>`).join('')}</ul>`;
    body.append(box);
    for (const button of box.querySelectorAll<HTMLButtonElement>('[data-hub-section]')) {
      button.addEventListener('click', () => {
        const scroll = panel.scrollTop;
        sectionIndex = Number(button.dataset.hubSection);
        selectHub(nodeIds.get(active!.path)!);
        panel.scrollTop = scroll;
        body.querySelector<HTMLButtonElement>(`[data-hub-section="${sectionIndex}"]`)?.focus({ preventScroll: true });
      });
    }
  }
  return { update(path: string | null) {
    selected = path;
    const hub = hubs.find(h => h.path === path);
    if (hub) {
      if (hub !== active) sectionIndex = 0;
      active = hub;
    } else if (active) {
      const at = active.sections[sectionIndex].items.some(n => n.path === path) ? sectionIndex
        : active.sections.findIndex(s => s.items.some(n => n.path === path));
      if (at >= 0) sectionIndex = at;
      else active = undefined;
    }
    render();
  } };
}
