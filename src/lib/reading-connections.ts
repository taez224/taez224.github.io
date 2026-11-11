import sanitizeHtml from 'sanitize-html';
import type { PublicNote, GraphEdge } from './content-model.ts';
import type { seriesNeighbors } from './note-nav.ts';

// 관련 자료를 모은 절은 주제의 읽기 순서나 소속으로 취급하지 않는다.
const supplementaryHeading = /^(?:연관된|관련) (?:글|노트)$|^(?:더 읽어볼 자료|참고 자료|참고문헌|출처)$/;

export interface HubSection { id: string; title: string; items: PublicNote[] }
// 이미 공개 판정과 링크 해석을 마친 HTML만 읽는다. 절 id는 렌더러가 만든 목차와 공유한다.
export function hubSections(note: PublicNote, notes: readonly PublicNote[]): HubSection[] {
  const byUrl = new Map(notes.map(n => [n.url, n]));
  const headings = new Map(note.headings.filter(h => h.level === 2).map(h => [h.id, h]));
  const stack: { name: string; card: boolean }[] = [];
  const sections: HubSection[] = [];
  let current: HubSection | undefined;
  sanitizeHtml(note.bodyHtml, {
    onOpenTag(name, attrs) {
      if (!stack.length && /^h[12]$/.test(name)) {
        current = undefined;
        const heading = name === 'h2' && headings.get(attrs.id);
        if (heading && !supplementaryHeading.test(heading.title)) { current = { id: heading.id, title: heading.title, items: [] }; sections.push(current); }
      }
      if (current && name === 'a' && stack.some(s => s.name === 'li' || s.card)) {
        const linked = byUrl.get((attrs.href ?? '').split('#')[0]);
        if (linked && linked.path !== note.path && !current.items.some(n => n.path === linked.path)) current.items.push(linked);
      }
      stack.push({ name, card: (attrs.class ?? '').split(/\s+/).includes('article-card-slot') });
    },
    onCloseTag() { stack.pop(); }
  });
  return sections.filter(s => s.items.length);
}

// 원문에 남긴 추천 설명과 명시적인 글 카드는 자동 연결에서 반복하지 않는다.
function introducedLinks(html: string, headingId: string | undefined, byUrl: Map<string, PublicNote>): Set<string> {
  const paths = new Set<string>();
  const stack: { name: string; card: boolean }[] = [];
  let inRelated = false;
  sanitizeHtml(html, {
    onOpenTag(name, attrs) {
      if (!stack.length && /^h[12]$/.test(name)) inRelated = name === 'h2' && attrs.id === headingId;
      if (name === 'a' && (inRelated || stack.some(s => s.card))) {
        const target = byUrl.get((attrs.href ?? '').split('#')[0]);
        if (target) paths.add(target.path);
      }
      stack.push({ name, card: (attrs.class ?? '').split(/\s+/).includes('article-card-slot') });
    },
    onCloseTag() { stack.pop(); }
  });
  return paths;
}

// 자동 연결로 대체해도 원고의 설명을 잃지 않는, 공개 링크만 든 목록에 한해서 합친다.
function relatedBody(note: PublicNote, byUrl: Map<string, PublicNote>) {
  let bodyHtml = note.bodyHtml;
  let headingId = '';
  const preferred: string[] = [];
  const heading = note.headings.find(h => h.level === 2 && h.title === '연관된 노트');
  if (heading && note.type !== 'hub') {
    const escaped = heading.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<h2 id="${escaped}">연관된 노트<\\/h2>\\s*<ul>([\\s\\S]*?)<\\/ul>\\s*(?=<h2\\b|<section class="footnotes"|$)`);
    const match = bodyHtml.match(pattern);
    if (match) {
      const targets: PublicNote[] = [];
      let valid = true, inItem = false, inLink = false, links = 0;
      // 정규식으로 링크 안쪽을 통째로 잡으면 한 항목의 링크 둘을 하나로 삼킬 수 있다.
      // 한 항목에 공개 링크 하나만 있고 다른 설명이 없는지 태그와 텍스트를 따로 확인한다.
      sanitizeHtml(match[1], {
        onOpenTag(name, attrs) {
          if (name === 'li' && !inItem) { inItem = true; links = 0; }
          else if (name === 'p' && inItem && !inLink) { /* 느슨한 Markdown 목록의 문단 */ }
          else if (name === 'a' && inItem && !inLink) {
            inLink = true;
            if (++links !== 1) valid = false;
            const target = byUrl.get((attrs.href ?? '').split('#')[0]);
            if (target) targets.push(target); else valid = false;
          } else valid = false;
        },
        onCloseTag(name) {
          if (name === 'a') inLink = false;
          if (name === 'li') { if (links !== 1) valid = false; inItem = false; }
        },
        textFilter(text) { if (!inLink && text.trim()) valid = false; return text; }
      });
      if (valid && targets.length) {
        preferred.push(...targets.map(n => n.path));
        headingId = heading.id;
        bodyHtml = bodyHtml.replace(match[0], '');
      }
    }
  }
  // 원고에 남은 제목과 자동 영역의 id가 겹치지 않게 한다.
  if (!headingId) {
    headingId = 'related-notes';
    while (note.headings.some(h => h.id === headingId)) headingId += '-connections';
  }
  return { bodyHtml, headingId, preferred, introduced: introducedLinks(bodyHtml, heading?.id, byUrl), headingTitle: heading && !preferred.length ? '더 읽기' : '연관된 노트' };
}

export function readingConnections(note: PublicNote, notes: readonly PublicNote[], edges: readonly GraphEdge[], series: ReturnType<typeof seriesNeighbors> = null) {
  const byPath = new Map(notes.map(n => [n.path, n]));
  const body = relatedBody(note, new Map(notes.map(n => [n.url, n])));
  const inSeries = new Set(series?.posts.map(p => p.path) ?? []);
  const paths = new Set([...body.preferred, ...note.outgoing, ...note.incoming]);
  paths.delete(note.path);
  const connected = [...paths].flatMap(path => { const n = byPath.get(path); return n ? [n] : []; });
  const hubs = connected.filter(n => n.type === 'hub').map(hub => ({
    path: hub.path, title: hub.displayTitle, url: hub.url,
    sections: hubSections(hub, notes).filter(s => s.items.some(n => n.path === note.path)).map(({ id, title }) => ({ id, title }))
  }));
  const neighbors = connected.filter(n => note.type !== 'hub' && n.type !== 'hub' && !body.introduced.has(n.path) && !inSeries.has(n.path) && n.url !== series?.url);
  const ids = new Set([note.path, ...neighbors.map(n => n.path)]);
  const seen = new Set<string>();
  const uniqueEdges = edges.filter(e => {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) return false;
    const key = JSON.stringify([e.source, e.target].sort());
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return { ...body, neighbors, hubs, edges: uniqueEdges };
}
