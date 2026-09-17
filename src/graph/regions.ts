import type { GraphNode, Point, Box, Size } from './types.ts';
interface Region { topic: string; count: number; hull: Point[]; label: Point }
interface LabelPosition extends Point { anchor: string }
type Circle = Point & { r: number };

// 주제 영역. 같은 주제 노드의 볼록 껍질을 옅은 색면으로 깔고 이름을 얹으면 그래프가 지도처럼 읽힌다.
// 중심에서 유난히 먼 노드(중앙값의 trim배 밖)는 색면에서 뺀다. 점은 그대로 찍히고 영토만 둥글어진다.
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [], upper: Point[] = [];
  for (const q of sorted) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop(); lower.push(q); }
  for (const q of sorted.reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// 노드 minNodes개 이상인 주제만 영역이 된다. 기타는 나머지를 모은 색이라 영토가 아니다. label은 껍질의 맨 위 점(이름은 그 위에 얹는다).
export function topicRegions(nodes: readonly Pick<GraphNode, 'id' | 'topic'>[], positions: ReadonlyMap<string, Point>, { minNodes = 3, trim = 1.7, skip = ['기타'] } = {}): Region[] {
  const byTopic = new Map<string, Point[]>();
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p || !node.topic || skip.includes(node.topic)) continue;
    if (!byTopic.has(node.topic)) byTopic.set(node.topic, []);
    byTopic.get(node.topic)!.push({ x: p.x, y: p.y });
  }
  const regions: Region[] = [];
  for (const [topic, pts] of byTopic) {
    if (pts.length < minNodes) continue;
    const cx = pts.reduce((sum, q) => sum + q.x, 0) / pts.length, cy = pts.reduce((sum, q) => sum + q.y, 0) / pts.length;
    const dist = (q: Point) => Math.hypot(q.x - cx, q.y - cy);
    const sorted = pts.map(dist).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    const core = pts.filter((q) => dist(q) <= median * trim);
    const hull = convexHull(core.length >= minNodes ? core : pts);
    const top = hull.reduce((a, b) => (b.y < a.y ? b : a));
    regions.push({ topic, count: pts.length, hull, label: { x: top.x, y: top.y } });
  }
  return regions.sort((a, b) => b.count - a.count);
}

export const regionPath = (hull: readonly Point[]) => `M${hull.map((q) => `${q.x} ${q.y}`).join('L')}Z`;

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const hitsCircle = (box: Box, c: Circle) => { const nx = Math.max(box.left, Math.min(c.x, box.right)), ny = Math.max(box.top, Math.min(c.y, box.bottom)); return Math.hypot(c.x - nx, c.y - ny) < c.r; };

// 영역 이름 자리. 껍질의 위·아래·왼쪽·오른쪽 순으로 시도해 장애물(노드 원 {x,y,r} 또는 상자 {left,right,top,bottom})과
// 먼저 놓인 이름에 겹치지 않는 첫 자리를 준다. 다 막히면 위. 결과는 주제 → { x, y(기준선), anchor }.
// bounds({ width, height })를 주면 무대 밖으로 나가는 자리는 쓰지 않는다.
// scale은 regionLabelBox와 같은 뜻(화면 1px당 장면 단위)이다. 이름과 껍질과의 간격은 화면 크기로 그리므로 자리도 화면 크기로 잰다.
// 이 값을 빼면 그래프가 작게 그려지는 폭(홈 721~1000px)에서 실제 이름이 계산보다 몇 배 넓어져 서로 겹친다.
export function placeRegionLabels(regions: readonly Region[], obstacles: readonly (Box | Circle)[] = [], { fontSize = 15, pad: padPx = 18, measure = (text, size) => [...text].length * size, bounds = null, scale = 1 }: { fontSize?: number; pad?: number; measure?: (text: string, size: number) => number; bounds?: (Size & { top?: number }) | null; scale?: number } = {}): Map<string, LabelPosition> {
  const placed: Box[] = [], out = new Map<string, LabelPosition>();
  const pad = padPx * scale;
  for (const region of regions) {
    const w = measure(region.topic, fontSize) * 1.16 * scale, h = fontSize * 1.2 * scale;
    const ext = { top: region.hull[0], bottom: region.hull[0], left: region.hull[0], right: region.hull[0] };
    for (const q of region.hull) { if (q.y < ext.top.y) ext.top = q; if (q.y > ext.bottom.y) ext.bottom = q; if (q.x < ext.left.x) ext.left = q; if (q.x > ext.right.x) ext.right = q; }
    const candidates = [
      { x: ext.top.x, y: ext.top.y - pad, anchor: 'middle', box: { left: ext.top.x - w / 2, right: ext.top.x + w / 2, top: ext.top.y - pad - h, bottom: ext.top.y - pad + h * 0.25 } },
      { x: ext.bottom.x, y: ext.bottom.y + pad + h, anchor: 'middle', box: { left: ext.bottom.x - w / 2, right: ext.bottom.x + w / 2, top: ext.bottom.y + pad, bottom: ext.bottom.y + pad + h * 1.25 } },
      { x: ext.left.x - pad, y: ext.left.y + h * 0.35, anchor: 'end', box: { left: ext.left.x - pad - w, right: ext.left.x - pad, top: ext.left.y - h * 0.6, bottom: ext.left.y + h * 0.6 } },
      { x: ext.right.x + pad, y: ext.right.y + h * 0.35, anchor: 'start', box: { left: ext.right.x + pad, right: ext.right.x + pad + w, top: ext.right.y - h * 0.6, bottom: ext.right.y + h * 0.6 } }
    ];
    // bounds.top을 음수로 주면 그림 위쪽 여백까지 이름 자리로 쓴다. 그림 밖을 비워 둔 정적 스냅샷이 쓴다.
    const minTop = bounds?.top ?? 0;
    const inBounds = (b: Box) => b.top >= minTop && b.left >= 0 && (!bounds || (b.right <= bounds.width && b.bottom <= bounds.height));
    const free = (c: { box: Box }) => inBounds(c.box) && !placed.some((b) => overlaps(b, c.box)) && !obstacles.some((o) => ('r' in o ? hitsCircle(c.box, o) : overlaps(c.box, o)));
    // 네 자리가 모두 막히면 노드나 다른 이름과 겹치는 편이 무대 밖으로 잘리는 것보다 낫다. 무대 안의 자리를 먼저 고르고,
    // 그런 자리도 없으면 첫 자리(위)를 무대 안으로 밀어 넣는다. 전에는 첫 자리를 그대로 써서 맨 위 영역 이름이 그림 밖으로 잘렸다.
    const intoBounds = (c: typeof candidates[number]) => {
      const dx = Math.max(0, -c.box.left) - Math.max(0, bounds ? c.box.right - bounds.width : 0);
      const dy = Math.max(0, minTop - c.box.top) - Math.max(0, bounds ? c.box.bottom - bounds.height : 0);
      return { ...c, x: c.x + dx, y: c.y + dy, box: { left: c.box.left + dx, right: c.box.right + dx, top: c.box.top + dy, bottom: c.box.bottom + dy } };
    };
    const pick = candidates.find(free) ?? candidates.find((c) => inBounds(c.box)) ?? intoBounds(candidates[0]);
    placed.push(pick.box);
    out.set(region.topic, { x: pick.x, y: pick.y, anchor: pick.anchor });
  }
  return out;
}

// 놓인 영역 이름의 상자(장면 좌표). scale은 화면 1px당 장면 단위(u)라 이름 크기가 화면에 고정될 때 쓴다.
export function regionLabelBox(at: LabelPosition, topic: string, { fontSize = 15, measure = (text, size) => [...text].length * size, scale = 1 }: { fontSize?: number; measure?: (text: string, size: number) => number; scale?: number } = {}): Box {
  const w = measure(topic, fontSize) * 1.16 * scale, h = fontSize * 1.2 * scale;
  if (at.anchor === 'start') return { left: at.x, right: at.x + w, top: at.y - h * 0.85, bottom: at.y + h * 0.35 };
  if (at.anchor === 'end') return { left: at.x - w, right: at.x, top: at.y - h * 0.85, bottom: at.y + h * 0.35 };
  return { left: at.x - w / 2, right: at.x + w / 2, top: at.y - h, bottom: at.y + h * 0.25 };
}
