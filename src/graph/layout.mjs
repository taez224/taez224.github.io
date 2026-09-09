export function nodeRadius(degree, scale = 1) {
  return (4.5 + Math.min(degree, 15) * 0.6) * scale;
}

// repelRange: 척력이 미치는 거리(k 배수). gravity: 중심 장력. spring: 주면 링크를 고정 길이(spring·k)의 용수철로 당긴다(없으면 기존 d²/k).
// 아틀라스 배치: 같은 주제는 무게중심으로 당기고(topicGravity) 다른 주제끼리는 더 세게 밀어(crossRepel) 주제가 영토처럼 갈라진다.
// 2026-09-07 실측(36노드): 1000×640과 830×630 두 무대에서 남의 영역에 들어간 노드 0~1개, 최소 간격 41px. 지도·홈 히어로·모바일 스냅샷이 같은 값을 쓴다.
export const ATLAS_LAYOUT = { topicGravity: 0.12, crossRepel: 2 };

// topicGravity: 같은 주제 무게중심으로 당기는 힘. crossRepel: 주제가 다른 노드 쌍의 척력 배수.
export function layoutGraph(nodes, edges, { width, height, seed = 7, iterations = 700, pad = 56, repelRange = 1.5, gravity = 0.08, spring = null, topicGravity = 0, crossRepel = 1 } = {}) {
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const points = nodes.map(() => ({ x: width * (0.1 + 0.8 * random()), y: height * (0.1 + 0.8 * random()), dx: 0, dy: 0 }));
  const pairs = edges.filter((e) => index.has(e.source) && index.has(e.target)).map((e) => [index.get(e.source), index.get(e.target)]);
  const k = Math.sqrt((width * height) / Math.max(1, nodes.length)) * 0.8;
  // Repulsion only acts within a short range so small disconnected pieces settle beside the main cluster instead of flying to the corners.
  const cutoff = k * repelRange;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const temperature = 50 * (1 - iteration / iterations) + 0.5;
    for (const p of points) { p.dx = 0; p.dy = 0; }
    for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i], b = points[j];
      let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 0.01; if (d > cutoff) continue; const f = ((k * k) / d) * (crossRepel !== 1 && nodes[i].topic !== nodes[j].topic ? crossRepel : 1); dx /= d; dy /= d;
      a.dx += dx * f; a.dy += dy * f; b.dx -= dx * f; b.dy -= dy * f;
    }
    for (const [i, j] of pairs) {
      const a = points[i], b = points[j];
      let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 0.01; const f = spring ? (d - spring * k) : (d * d) / k; dx /= d; dy /= d;
      a.dx -= dx * f; a.dy -= dy * f; b.dx += dx * f; b.dy += dy * f;
    }
    if (topicGravity > 0) {
      const centers = new Map();
      nodes.forEach((node, i) => { const c = centers.get(node.topic) ?? { x: 0, y: 0, n: 0 }; c.x += points[i].x; c.y += points[i].y; c.n += 1; centers.set(node.topic, c); });
      nodes.forEach((node, i) => { const c = centers.get(node.topic); if (c.n > 1) { points[i].dx += (c.x / c.n - points[i].x) * topicGravity; points[i].dy += (c.y / c.n - points[i].y) * topicGravity; } });
    }
    for (const p of points) {
      p.dx += (width / 2 - p.x) * gravity; p.dy += (height / 2 - p.y) * gravity;
      const d = Math.hypot(p.dx, p.dy) || 0.01; const m = Math.min(d, temperature);
      p.x += (p.dx / d) * m; p.y += (p.dy / d) * m;
    }
  }
  if (!points.length) return new Map();
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const uniform = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  // A layout that comes out much flatter or taller than the box is stretched per axis so the map always fills its frame.
  const shape = (spanX / spanY) / (width / height);
  const scaleX = shape > 1.4 || shape < 0.7 ? (width - 2 * pad) / spanX : uniform;
  const scaleY = shape > 1.4 || shape < 0.7 ? (height - 2 * pad) / spanY : uniform;
  const ox = (width - spanX * scaleX) / 2, oy = (height - spanY * scaleY) / 2;
  return new Map(nodes.map((node, i) => [node.id, { x: +(ox + (points[i].x - minX) * scaleX).toFixed(1), y: +(oy + (points[i].y - minY) * scaleY).toFixed(1) }]));
}
