// 주제 영역. 같은 주제 노드의 볼록 껍질을 옅은 색면으로 깔고 이름을 얹으면 그래프가 지도처럼 읽힌다.
// 중심에서 유난히 먼 노드(중앙값의 trim배 밖)는 색면에서 뺀다. 점은 그대로 찍히고 영토만 둥글어진다.
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of sorted) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of sorted.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// 노드 minNodes개 이상인 주제만 영역이 된다. label은 껍질의 맨 위 점(이름은 그 위에 얹는다).
export function topicRegions(nodes, positions, { minNodes = 3, trim = 1.7 } = {}) {
  const byTopic = new Map();
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p || !node.topic) continue;
    if (!byTopic.has(node.topic)) byTopic.set(node.topic, []);
    byTopic.get(node.topic).push({ x: p.x, y: p.y });
  }
  const regions = [];
  for (const [topic, pts] of byTopic) {
    if (pts.length < minNodes) continue;
    const cx = pts.reduce((sum, q) => sum + q.x, 0) / pts.length, cy = pts.reduce((sum, q) => sum + q.y, 0) / pts.length;
    const dist = (q) => Math.hypot(q.x - cx, q.y - cy);
    const sorted = pts.map(dist).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    const core = pts.filter((q) => dist(q) <= median * trim);
    const hull = convexHull(core.length >= minNodes ? core : pts);
    const top = hull.reduce((a, b) => (b.y < a.y ? b : a));
    regions.push({ topic, count: pts.length, hull, label: { x: top.x, y: top.y } });
  }
  return regions.sort((a, b) => b.count - a.count);
}

export const regionPath = (hull) => `M${hull.map((q) => `${q.x} ${q.y}`).join('L')}Z`;

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const hitsCircle = (box, c) => { const nx = Math.max(box.left, Math.min(c.x, box.right)), ny = Math.max(box.top, Math.min(c.y, box.bottom)); return Math.hypot(c.x - nx, c.y - ny) < c.r; };

// 영역 이름 자리. 껍질의 위·아래·왼쪽·오른쪽 순으로 시도해 장애물(노드 원 {x,y,r} 또는 상자 {left,right,top,bottom})과
// 먼저 놓인 이름에 겹치지 않는 첫 자리를 준다. 다 막히면 위. 결과는 주제 → { x, y(기준선), anchor }.
// bounds({ width, height })를 주면 무대 밖으로 나가는 자리는 쓰지 않는다.
export function placeRegionLabels(regions, obstacles = [], { fontSize = 15, pad = 18, measure = (text, size) => [...text].length * size, bounds = null } = {}) {
  const placed = [], out = new Map();
  for (const region of regions) {
    const w = measure(region.topic, fontSize) * 1.16, h = fontSize * 1.2;
    const ext = { top: region.hull[0], bottom: region.hull[0], left: region.hull[0], right: region.hull[0] };
    for (const q of region.hull) { if (q.y < ext.top.y) ext.top = q; if (q.y > ext.bottom.y) ext.bottom = q; if (q.x < ext.left.x) ext.left = q; if (q.x > ext.right.x) ext.right = q; }
    const candidates = [
      { x: ext.top.x, y: ext.top.y - pad, anchor: 'middle', box: { left: ext.top.x - w / 2, right: ext.top.x + w / 2, top: ext.top.y - pad - h, bottom: ext.top.y - pad + h * 0.25 } },
      { x: ext.bottom.x, y: ext.bottom.y + pad + h, anchor: 'middle', box: { left: ext.bottom.x - w / 2, right: ext.bottom.x + w / 2, top: ext.bottom.y + pad, bottom: ext.bottom.y + pad + h * 1.25 } },
      { x: ext.left.x - pad, y: ext.left.y + h * 0.35, anchor: 'end', box: { left: ext.left.x - pad - w, right: ext.left.x - pad, top: ext.left.y - h * 0.6, bottom: ext.left.y + h * 0.6 } },
      { x: ext.right.x + pad, y: ext.right.y + h * 0.35, anchor: 'start', box: { left: ext.right.x + pad, right: ext.right.x + pad + w, top: ext.right.y - h * 0.6, bottom: ext.right.y + h * 0.6 } }
    ];
    const inBounds = (b) => b.top >= 0 && b.left >= 0 && (!bounds || (b.right <= bounds.width && b.bottom <= bounds.height));
    const free = (c) => inBounds(c.box) && !placed.some((b) => overlaps(b, c.box)) && !obstacles.some((o) => (o.r !== undefined ? hitsCircle(c.box, o) : overlaps(c.box, o)));
    const pick = candidates.find(free) ?? candidates[0];
    placed.push(pick.box);
    out.set(region.topic, { x: pick.x, y: pick.y, anchor: pick.anchor });
  }
  return out;
}

// 놓인 영역 이름의 상자(장면 좌표). scale은 화면 1px당 장면 단위(u)라 이름 크기가 화면에 고정될 때 쓴다.
export function regionLabelBox(at, topic, { fontSize = 15, measure = (text, size) => [...text].length * size, scale = 1 } = {}) {
  const w = measure(topic, fontSize) * 1.16 * scale, h = fontSize * 1.2 * scale;
  if (at.anchor === 'start') return { left: at.x, right: at.x + w, top: at.y - h * 0.85, bottom: at.y + h * 0.35 };
  if (at.anchor === 'end') return { left: at.x - w, right: at.x, top: at.y - h * 0.85, bottom: at.y + h * 0.35 };
  return { left: at.x - w / 2, right: at.x + w / 2, top: at.y - h, bottom: at.y + h * 0.25 };
}
