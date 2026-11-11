import type { Box, Point, GraphEdge } from './types.ts';

export type ReaderPlacement = 'below' | 'above' | 'left' | 'right';
export interface ReaderLabel { id: string; variants: { placement: ReaderPlacement; point: Point; box: Box }[] }

function crossingLength(a: Point, b: Point, box: Box) {
  let start = 0, end = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.left], [dx, box.right - a.x], [-dy, a.y - box.top], [dy, box.bottom - a.y]]) {
    if (p === 0) { if (q < 0) return 0; continue; }
    const t = q / p;
    if (p < 0) start = Math.max(start, t); else end = Math.min(end, t);
    if (start >= end) return 0;
  }
  return (end - start) * Math.hypot(dx, dy);
}

// 제목과 점을 예약한 상자 안에서 옮긴다. 제목끼리의 간격과 누르는 영역은 그대로 유지한다.
export function orientReaderLabels(labels: readonly ReaderLabel[], edges: readonly GraphEdge[]): Map<string, ReaderPlacement> {
  const selected = new Map(labels.map(n => [n.id, 0]));
  const score = () => {
    const placed = labels.map(n => ({ id: n.id, ...n.variants[selected.get(n.id)!] }));
    const byId = new Map(placed.map(n => [n.id, n]));
    let total = 0;
    for (const edge of edges) {
      const a = byId.get(edge.source)!, b = byId.get(edge.target)!;
      for (const n of placed) {
        const length = crossingLength(a.point, b.point, n.box);
        if (length > 0) total += 10000 + length;
      }
    }
    return total;
  };
  let best = score();
  // 한 제목을 바꾸면 그 점에서 나가는 선도 바뀌므로, 자기 연결만이 아니라 전체 가림을 비교한다.
  for (let pass = 0; pass < 8 && best > 0; pass++) {
    let improved = false;
    for (const n of labels) {
      let winner = selected.get(n.id)!;
      for (let index = 0; index < n.variants.length; index++) {
        selected.set(n.id, index);
        const next = score();
        if (next < best) { best = next; winner = index; improved = true; }
      }
      selected.set(n.id, winner);
    }
    if (!improved) break;
  }
  return new Map(labels.map(n => [n.id, n.variants[selected.get(n.id)!].placement]));
}
