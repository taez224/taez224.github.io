import type { PublicNote } from '../lib/content-model.ts';
type LocalNode = Pick<PublicNote, 'path' | 'displayTitle' | 'url' | 'topic'>;
export interface LocalEdge { x1: number; y1: number; x2: number; y2: number; direction: 'in' | 'out' | 'both' }
export interface LocalLabel { lines: string[]; x: number; y: number; box: { left: number; right: number; top: number; bottom: number } }
export interface LocalGraphNode { id: string; x: number; y: number; title: string; url: string; color: string; current: boolean; label?: LocalLabel }

import { cleanTitle, topicColor } from '../lib/format.ts';
import { estimateTextWidth } from '../graph/label.ts';

// 이웃 제목은 11px 글자에 줄 간격 13px이고, 한 줄은 약 100px(이웃 노드 사이 간격)이다.
const FONT = 11, LINE = 13, LABEL_WIDTH = 100, NODE_RADIUS = 6;
const fits = (text: string) => estimateTextWidth(text, FONT) <= LABEL_WIDTH;

// 제목을 단어 경계에서 최대 두 줄로 나눈다. 글자 수로 자르면 "Human Agenc…"처럼 단어 가운데가 끊기고,
// 한 줄로는 어떤 생각이 연결됐는지 알기 어렵다.
// 남는 글이 있으면 마지막 줄을 줄임표로 맺고, 한 단어가 한 줄보다 길면 그 단어만 글자 단위로 나눈다.
export function localGraphLabelLines(title: string, maxLines = 2): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let index = 0;
  while (lines.length < maxLines && index < words.length) {
    let line = '';
    while (index < words.length && fits(line ? `${line} ${words[index]}` : words[index])) {
      line = line ? `${line} ${words[index]}` : words[index];
      index += 1;
    }
    if (!line) {
      const characters = [...words[index]];
      while (characters.length && fits(line + characters[0])) line += characters.shift();
      words[index] = characters.join('');
    }
    lines.push(line);
  }
  if (index < words.length) {
    let last = lines[lines.length - 1];
    while (!fits(`${last}…`)) last = last.includes(' ') ? last.slice(0, last.lastIndexOf(' ')) : [...last].slice(0, -1).join('');
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

export function localGraphLayout(center: LocalNode, outgoing: readonly LocalNode[], incoming: readonly LocalNode[], { width, height, max = 6 }: { width: number; height: number; max?: number }) {
  const outSet = new Set(outgoing.map((n) => n.path));
  const inSet = new Set(incoming.map((n) => n.path));
  const byPath = new Map([...outgoing, ...incoming].map((n) => [n.path, n]));
  const all = [...byPath.values()];
  const narrow = width < 280;
  const cx = width / 2, cy = height / 2;
  const rx = width / 2 - 52, ry = height / 2 - (narrow ? 46 : 34);
  // 글자를 줄이지 않고 그리는 이웃을 줄인다. 280px 기준만으로는 기본 글자를 작게 설정해 rem 열이 205px보다 좁아진
  // 사이드바에서 제목끼리 겹쳤으므로, 실제로 겹치지 않을 때까지 하나씩 덜어 낸다.
  for (let count = Math.min(all.length, narrow ? Math.min(max, 4) : max); ; count -= 1) {
    const placed = placeNeighbors(all.slice(0, count));
    if (count <= 1 || fitsFrame(placed.nodes)) return { ...placed, hidden: all.length - count, centerLabel: placeCenterLabel(cx, cy, placed.nodes, placed.edges), height };
  }

  // 제목 상자가 그래프 폭 안에 있고, 서로와 다른 이웃의 점에 닿지 않는지 본다.
  function fitsFrame(nodes: LocalGraphNode[]) {
    const neighbors = nodes.filter((n) => n.label);
    return neighbors.every((n, i) => n.label!.box.left >= 0 && n.label!.box.right <= width
      && neighbors.every((other, j) => i === j || (!overlaps(n.label!.box, other.label!.box) && !overlaps(n.label!.box, { left: other.x - 8, right: other.x + 8, top: other.y - 8, bottom: other.y + 8 }))));
  }

  function placeNeighbors(shown: LocalNode[]) {
    const nodes: LocalGraphNode[] = [{ id: center.path, x: cx, y: cy, title: center.displayTitle, url: center.url, color: topicColor(center.topic), current: true }];
    const edges: LocalEdge[] = [];
    shown.forEach((n, index) => {
      const angle = -Math.PI / 2 + (index / shown.length) * Math.PI * 2;
      const x = narrow && shown.length === 3 && index > 0 ? (index === 1 ? width - 52 : 52) : +(cx + Math.cos(angle) * rx).toFixed(1);
      const y = narrow && shown.length === 3 && index > 0 ? height - 46 : +(cy + Math.sin(angle) * ry).toFixed(1);
      // 위쪽 이웃은 제목을 노드 위에, 나머지는 아래에 둔다. 제목이 가운데 노드와 관계선에서 바깥쪽으로 떨어진다.
      // 이웃이 6개 이하면 이 규칙만으로 제목끼리 겹치지 않는다. 그보다 많으면 글자를 줄이지 않고 그리는 이웃을 줄인다.
      const lines = localGraphLabelLines(cleanTitle(n.displayTitle));
      const baseline = y < cy ? y - NODE_RADIUS - 6 - (lines.length - 1) * LINE : y + NODE_RADIUS + (narrow ? 22 : 14);
      const labelWidth = Math.max(...lines.map((line) => estimateTextWidth(line, FONT)));
      const box = { left: x - labelWidth / 2, right: x + labelWidth / 2, top: baseline - 9, bottom: baseline + (lines.length - 1) * LINE + 3 };
      nodes.push({ id: n.path, x, y, title: n.displayTitle, url: n.url, color: topicColor(n.topic), current: false, label: { lines, x, y: baseline, box } });
      const direction = outSet.has(n.path) && inSet.has(n.path) ? 'both' : outSet.has(n.path) ? 'out' : 'in';
      edges.push({ x1: cx, y1: cy, x2: x, y2: y, direction });
    });
    return { nodes, edges };
  }
}

type Box = LocalLabel['box'];
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
// 선분이 상자를 지나는지 본다(Liang-Barsky). 상호 참조의 두 선은 2.5px 벌어지므로 상자를 그만큼 넓혀 함께 잡는다.
function crosses(edge: LocalEdge, box: Box) {
  let t0 = 0, t1 = 1;
  const dx = edge.x2 - edge.x1, dy = edge.y2 - edge.y1;
  for (const [p, q] of [[-dx, edge.x1 - box.left], [dx, box.right - edge.x1], [-dy, edge.y1 - box.top], [dy, box.bottom - edge.y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); }
    else { if (t < t0) return false; t1 = Math.min(t1, t); }
  }
  return true;
}

// "이 노트"는 아래를 먼저 쓰고, 그 자리에 관계선이나 이웃이 지나가면 위·옆·대각선으로 옮긴다.
// 아래에 이웃이 있으면 수직선이 글자 사이를 관통해, 글자 테두리(paint-order stroke)만으로는 선이 가려지지 않았다.
export const CENTER_LABEL = '이 노트';
function placeCenterLabel(cx: number, cy: number, nodes: LocalGraphNode[], edges: LocalEdge[]) {
  const half = estimateTextWidth(CENTER_LABEL, FONT) * 1.1 / 2;  // 굵은 글자는 추정 폭보다 넓다. 관계선과의 간격은 blocked에서 따로 둔다.
  const side = 16 + 6 + half, corner = half + 8;
  // 넓은 그래프는 이웃이 타원에 놓여 대각선 관계선이 완만하므로, 대각선 자리는 조금 더 아래·옆까지 찾는다.
  const candidates: [number, number][] = [[0, 29], [0, -22], [side, 4], [-side, 4],
    ...[29, 34, 39, -22, -27, -32].flatMap((dy) => [corner, -corner, corner + 10, -corner - 10, corner + 20, -corner - 20].map((dx): [number, number] => [dx, dy]))];
  const boxOf = ([dx, dy]: [number, number]) => ({ left: cx + dx - half, right: cx + dx + half, top: cy + dy - 9, bottom: cy + dy + 3 });
  const blocked = (box: Box) => {
    const wide = { left: box.left - 3, right: box.right + 3, top: box.top - 3, bottom: box.bottom + 3 };
    return edges.some((edge) => crosses(edge, wide))
      || nodes.some((n) => (n.label && overlaps(box, n.label.box)) || overlaps(box, { left: n.x - 8, right: n.x + 8, top: n.y - 8, bottom: n.y + 8 }));
  };
  // 이웃이 많은 좁은 그래프(휴대폰 사이드바 폭 280~291px에 이웃 5~6개)는 빈자리가 없다. 그때는 아래에 두고
  // 글자 뒤의 종이색 판(LocalGraph.astro)이 지나가는 선을 가린다. clear는 판 없이도 비어 있는 자리를 찾았는지 알린다.
  const free = candidates.find((candidate) => !blocked(boxOf(candidate)));
  const [dx, dy] = free ?? candidates[0];
  return { x: cx + dx, y: cy + dy, box: boxOf([dx, dy]), clear: free !== undefined };
}

// 그린 내용의 위아래 끝에 맞춰 그림 높이를 줄인다. 이웃이 한두 개인 글은 정해 둔 높이의 절반 가까이가 비어 사이드바가 헐거워 보였다.
// 좌표는 함께 옮기므로 겹침 판정은 그대로다. 너비와 가로 좌표는 바꾸지 않는다.
export function fitLocalGraph<T extends ReturnType<typeof localGraphLayout>>(layout: T, padding = 6): T {
  const tops = [layout.centerLabel.box.top, ...layout.nodes.map((n) => Math.min(n.y - (n.current ? 17 : 8), n.label?.box.top ?? Infinity))];
  const bottoms = [layout.centerLabel.box.bottom, ...layout.nodes.map((n) => Math.max(n.y + (n.current ? 17 : 8), n.label?.box.bottom ?? -Infinity))];
  const top = Math.min(...tops) - padding, bottom = Math.max(...bottoms) + padding;
  const height = Math.min(layout.height, Math.ceil(bottom - top));
  const shift = -Math.max(0, Math.min(top, layout.height - height));
  const moveBox = (box: Box) => ({ ...box, top: box.top + shift, bottom: box.bottom + shift });
  return {
    ...layout,
    height,
    nodes: layout.nodes.map((n) => ({ ...n, y: n.y + shift, label: n.label && { ...n.label, y: n.label.y + shift, box: moveBox(n.label.box) } })),
    edges: layout.edges.map((e) => ({ ...e, y1: e.y1 + shift, y2: e.y2 + shift })),
    centerLabel: { ...layout.centerLabel, y: layout.centerLabel.y + shift, box: moveBox(layout.centerLabel.box) }
  };
}

