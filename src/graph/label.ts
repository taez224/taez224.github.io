import type { GraphNode, GraphEdge, Point, Box } from './types.ts';

import { cleanTitle } from '../lib/format.ts';

// 13px 기준 글자 폭 어림. 한글 12.5, 영숫자 7.2, 그 외 4.5.
export function estimateTextWidth(line: string, fontSize = 13) {
  return [...line].reduce((sum, ch) => sum + (/[\u3131-\uD79D]/.test(ch) ? 12.5 : /[A-Za-z0-9]/.test(ch) ? 7.2 : 4.5), 0) * (fontSize / 13);
}

export function graphTitleLines(title: string, limit: number): string[] {
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
// 제목을 고를 때 읽는 값만 받는다. 제목은 displayTitle이나 title 중 있는 것을 쓴다.
export type LabelNode = Pick<GraphNode, 'id' | 'type' | 'degree'> & Partial<Pick<GraphNode, 'title' | 'displayTitle'>>;
export function labelIds(nodes: readonly LabelNode[], edges: readonly GraphEdge[], { selected = null, hovered = null }: { selected?: string | null; hovered?: string | null } = {}): Set<string> {
  const ids = new Set<string>();
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

// 자리가 없어도 제목을 놓을 노드인지 정한다. 지도에서는 고르거나 미리 보는 노드 하나만 억지로 놓는다. 허브와 연결 많은 노드까지
// 억지로 놓았더니 좁은 무대에서 허브 제목끼리, 또는 영역 이름과 겹쳤다. 그 제목들은 노드 원 위라도 다른 글자와 겹치지 않는 자리가
// 있을 때만 보이고(placeLabels의 overNodes), 자리가 없으면 고른 뒤 시트에서 읽는다.
// 홈 히어로는 정적 스냅샷과 같은 규칙이어야 넓은 화면에서 엔진으로 바뀔 때 티가 나지 않으므로 기본 집합을 모두 놓는다.
export function mustPlaceLabel(id: string, { mode, focus }: { mode: 'map' | 'hero'; focus: string | null }): boolean {
  return mode === 'hero' || id === focus;
}

// 20자를 넘는 제목은 두 줄로 접는다. 줄 길이를 절반 근처로 잡아 두 줄이 비슷하게 나뉘게 한다.
export function wrapLabel(title: string, maxChars = 20) {
  const chars = [...title];
  if (chars.length <= maxChars) return [title];
  let limit = Math.ceil(chars.length / 2) + 2;
  let lines = graphTitleLines(title, limit);
  while (lines.length > 2 && limit < chars.length) { limit += 3; lines = graphTitleLines(title, limit); }
  return lines;
}

export const boxesOverlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
export const nodeBox = (p: Point, r: number) => ({ left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r });

// 제목 자리 후보. 아래·위·오른쪽·왼쪽, 그다음 대각선 넷.
const PLACEMENTS = ['below', 'above', 'right', 'left', 'below-right', 'below-left', 'above-right', 'above-left'];

// 제목 상자의 기하. p: 노드 중심, r: 노드 반지름(장면 단위), u: 화면 1px의 장면 단위. 글자 13px·줄 간격 18px·간격 8px을 화면 기준으로 고정한다.
export function labelGeometry(p: Point, r: number, lines: string[], placement: string, u: number) {
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

// 제목 배치. order는 우선순위 순의 [{ node, mustPlace, overNodes }]. 후보 자리를 차례로 시도해 이미 놓인 제목·장애물과 겹치지 않고
// 보이는 범위(inside) 안에 드는 첫 자리를 준다. 그런 자리가 없을 때 overNodes는 노드 원(nodeObstacles) 위라도 다른 제목·장애물과
// 겹치지 않는 자리를 찾고, mustPlace는 그래도 없으면 아래에 둔다. 같은 노드는 한 번만 놓는다.
// blocked는 억지로 두는 제목도 덮지 않는 자리(무대 위 조작)다. 아래 자리가 막히면 보이는 범위 안의 다른 자리를 찾고, 없으면 두지 않는다.
// 조작 아래로 들어간 제목은 일부만 보여 읽히지 않고, 고른 노드라면 시트가 제목을 보여 준다.
// 결과는 id → { placement, lines, g }. 엔진(살아 있는 지도)과 스냅샷(정적 SVG)이 같은 규칙으로 그린다.
export function placeLabels<T extends Pick<GraphNode, 'id'> & Partial<Pick<GraphNode, 'title' | 'displayTitle'>>>(order: readonly { node: T; mustPlace: boolean; overNodes?: boolean }[], { positions, radius, u = 1, obstacles = [], nodeObstacles = [], blocked = [], inside = () => true, labelGap = 0 }: { positions: ReadonlyMap<string, Point>; radius: (node: T) => number; u?: number; obstacles?: readonly Box[]; nodeObstacles?: readonly Box[]; blocked?: readonly Box[]; inside?: (box: Box) => boolean; labelGap?: number }) {
  const placed: Box[] = [], plan = new Map<string, { placement: string; lines: string[]; g: ReturnType<typeof labelGeometry> }>();
  const open = (box: Box) => !blocked.some((b) => boxesOverlap(b, box));
  const clear = (box: Box, avoidNodes: boolean) => inside(box) && open(box) && !placed.some((b) => boxesOverlap(b, box)) && !obstacles.some((b) => boxesOverlap(b, box))
    && (!avoidNodes || !nodeObstacles.some((b) => boxesOverlap(b, box)));
  for (const { node, mustPlace, overNodes = false } of order) {
    if (plan.has(node.id)) continue;
    const p = positions.get(node.id); if (!p) continue;
    const lines = wrapLabel(cleanTitle(node.displayTitle ?? node.title ?? '')), r = radius(node);
    // 첫 후보가 아래 자리다. 억지로 둘 때도 그 자리가 먼저다.
    const candidates = PLACEMENTS.map((placement) => ({ placement, g: labelGeometry(p, r, lines, placement, u) }));
    const free = candidates.find(({ g }) => clear(g.box, true)) ?? (overNodes ? candidates.find(({ g }) => clear(g.box, false)) : undefined);
    const forced = !mustPlace ? undefined : open(candidates[0].g.box) ? candidates[0] : candidates.find(({ g }) => inside(g.box) && open(g.box));
    const chosen = free ?? forced;
    if (!chosen) continue;
    // 간격은 화면 픽셀 기준으로 예약해 확대해도 제목 사이의 여유가 일정하게 남는다.
    const gap = labelGap * u;
    const { left, right, top, bottom } = chosen.g.box;
    placed.push({ left: left - gap, right: right + gap, top: top - gap, bottom: bottom + gap });
    plan.set(node.id, { placement: chosen.placement, lines, g: chosen.g });
  }
  return plan;
}
