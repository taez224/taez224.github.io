import { cleanTitle } from '../lib/format.mjs';

// 13px 기준 글자 폭 어림. 한글 12.5, 영숫자 7.2, 그 외 4.5.
export function estimateTextWidth(line, fontSize = 13) {
  return [...line].reduce((sum, ch) => sum + (/[\u3131-\uD79D]/.test(ch) ? 12.5 : /[A-Za-z0-9]/.test(ch) ? 7.2 : 4.5), 0) * (fontSize / 13);
}

export function graphTitleLines(title, limit) {
  const lines = [];
  let line = '';
  for (const word of title.split(/\s+/).filter(Boolean)) {
    if (line && [...`${line} ${word}`].length <= limit) { line += ` ${word}`; continue; }
    if (line) lines.push(line);
    const characters = [...word];
    while (characters.length > limit) lines.push(characters.splice(0, limit).join(''));
    line = characters.join('');
  }
  if (line) lines.push(line);
  return lines;
}

// 평소에 제목을 보이는 노드. 허브와 연결 많고 짧은 제목(14자 이하). 선택 중에는 선택 노드와 허브 이웃만.
export function labelIds(nodes, edges, { selected = null, hovered = null } = {}) {
  const ids = new Set();
  if (selected) {
    ids.add(selected);
    for (const edge of edges) {
      const other = edge.source === selected ? edge.target : edge.target === selected ? edge.source : null;
      if (other && nodes.find((n) => n.id === other)?.type === 'hub') ids.add(other);
    }
  } else {
    for (const node of nodes) {
      const title = cleanTitle(node.displayTitle ?? node.title ?? '');
      if (node.type === 'hub' || ((node.degree ?? 0) >= 9 && [...title].length <= 14)) ids.add(node.id);
    }
  }
  if (hovered) ids.add(hovered);
  return ids;
}

// 20자를 넘는 제목은 두 줄로 접는다. 줄 길이를 절반 근처로 잡아 두 줄이 비슷하게 나뉘게 한다.
export function wrapLabel(title, maxChars = 20) {
  const chars = [...title];
  if (chars.length <= maxChars) return [title];
  let limit = Math.ceil(chars.length / 2) + 2;
  let lines = graphTitleLines(title, limit);
  while (lines.length > 2 && limit < chars.length) { limit += 3; lines = graphTitleLines(title, limit); }
  return lines;
}

export const boxesOverlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
export const nodeBox = (p, r) => ({ left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r });

// 제목 자리 후보. 아래·위·오른쪽·왼쪽, 그다음 대각선 넷.
export const PLACEMENTS = ['below', 'above', 'right', 'left', 'below-right', 'below-left', 'above-right', 'above-left'];

// 제목 상자의 기하. p: 노드 중심, r: 노드 반지름(장면 단위), u: 화면 1px의 장면 단위. 글자 13px·줄 간격 18px·간격 8px을 화면 기준으로 고정한다.
export function labelGeometry(p, r, lines, placement, u) {
  const lh = 18 * u, gap = 8 * u;
  const w = Math.max(...lines.map((line) => estimateTextWidth(line))) * u, h = lines.length * lh;
  const mid = p.y - ((lines.length - 1) * lh) / 2 + 5 * u;
  // 대각선 자리: 원 테두리에서 45도 방향으로 살짝 떨어진 모서리에 제목의 안쪽 모서리를 맞춘다. 밀집 구간에서 상하좌우가 다 막혔을 때 쓴다.
  if (placement.includes('-')) {
    const [vertical, side] = placement.split('-');
    const d = (r + gap) * 0.75;
    const ax = side === 'right' ? p.x + d : p.x - d, anchor = side === 'right' ? 'start' : 'end';
    const left = side === 'right' ? ax : ax - w, right = left + w;
    if (vertical === 'below') { const top = p.y + d; return { x: ax, y: top + 13 * u, anchor, box: { left, right, top, bottom: top + h } }; }
    const bottom = p.y - d + 4 * u;
    return { x: ax, y: p.y - d - (lines.length - 1) * lh, anchor, box: { left, right, top: bottom - h, bottom } };
  }
  if (placement === 'above') return { x: p.x, y: p.y - r - gap - (lines.length - 1) * lh, anchor: 'middle', box: { left: p.x - w / 2, right: p.x + w / 2, top: p.y - r - gap - h + 4 * u, bottom: p.y - r - gap + 4 * u } };
  if (placement === 'right') return { x: p.x + r + gap, y: mid, anchor: 'start', box: { left: p.x + r + gap, right: p.x + r + gap + w, top: p.y - h / 2, bottom: p.y + h / 2 } };
  if (placement === 'left') return { x: p.x - r - gap, y: mid, anchor: 'end', box: { left: p.x - r - gap - w, right: p.x - r - gap, top: p.y - h / 2, bottom: p.y + h / 2 } };
  return { x: p.x, y: p.y + r + 18 * u, anchor: 'middle', box: { left: p.x - w / 2, right: p.x + w / 2, top: p.y + r + 5 * u, bottom: p.y + r + 5 * u + h } };
}

// 제목 배치. order는 우선순위 순의 [{ node, mustPlace }]. 후보 자리를 차례로 시도해 이미 놓인 제목·장애물과 겹치지 않고
// 보이는 범위(inside) 안에 드는 첫 자리를 준다. mustPlace는 자리가 없어도 아래에 둔다. 같은 노드는 한 번만 놓는다.
// 결과는 id → { placement, lines, g }. 엔진(살아 있는 지도)과 스냅샷(정적 SVG)이 같은 규칙으로 그린다.
export function placeLabels(order, { positions, radius, u = 1, obstacles = [], inside = () => true, labelGap = 0 }) {
  const placed = [], plan = new Map();
  for (const { node, mustPlace } of order) {
    if (plan.has(node.id)) continue;
    const p = positions.get(node.id); if (!p) continue;
    const lines = wrapLabel(cleanTitle(node.displayTitle ?? node.title ?? '')), r = radius(node);
    const free = PLACEMENTS.map((placement) => ({ placement, g: labelGeometry(p, r, lines, placement, u) }))
      .find(({ g }) => inside(g.box) && !placed.some((b) => boxesOverlap(b, g.box)) && !obstacles.some((b) => boxesOverlap(b, g.box)));
    const chosen = free ?? (mustPlace ? { placement: 'below', g: labelGeometry(p, r, lines, 'below', u) } : null);
    if (!chosen) continue;
    // 간격은 화면 픽셀 기준으로 예약해 확대해도 제목 사이의 여유가 일정하게 남는다.
    const gap = labelGap * u;
    const { left, right, top, bottom } = chosen.g.box;
    placed.push({ left: left - gap, right: right + gap, top: top - gap, bottom: bottom + gap });
    plan.set(node.id, { placement: chosen.placement, lines, g: chosen.g });
  }
  return plan;
}
