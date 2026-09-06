export function nodeRadius(degree, scale = 1) {
  return (4.5 + Math.min(degree, 15) * 0.6) * scale;
}

// repelRange: 척력이 미치는 거리(k 배수). gravity: 중심 장력. spring: 주면 링크를 고정 길이(spring·k)의 용수철로 당긴다(없으면 기존 d²/k).
export function layoutGraph(nodes, edges, { width, height, seed = 7, iterations = 700, pad = 56, repelRange = 1.5, gravity = 0.08, spring = null } = {}) {
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
      let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 0.01; if (d > cutoff) continue; const f = (k * k) / d; dx /= d; dy /= d;
      a.dx += dx * f; a.dy += dy * f; b.dx -= dx * f; b.dy -= dy * f;
    }
    for (const [i, j] of pairs) {
      const a = points[i], b = points[j];
      let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 0.01; const f = spring ? (d - spring * k) : (d * d) / k; dx /= d; dy /= d;
      a.dx -= dx * f; a.dy -= dy * f; b.dx += dx * f; b.dy += dy * f;
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

// 제목 상자가 겹치는 노드 쌍을 조금씩 밀어낸다. boxes: id → { w, h, top, left } (노드 중심 기준 상자: x-left…x-left+w, y-top…y-top+h).
// 배치 뒤 후처리라 힘 모델과 무관하게 결정적이다. 상자 밖으로는 나가지 않는다.
export function relaxLabels(positions, boxes, { width, height, pad = 40, iterations = 80, gap = 6 } = {}) {
  const pts = [...positions.entries()].filter(([id]) => boxes.has(id)).map(([id, p]) => ({ id, x: p.x, y: p.y, ...boxes.get(id) }));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let moved = false;
    for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) {
      const a = pts[i], b = pts[j];
      const overlapX = Math.min(a.x - a.left + a.w, b.x - b.left + b.w) - Math.max(a.x - a.left, b.x - b.left) + gap;
      const overlapY = Math.min(a.y - a.top + a.h, b.y - b.top + b.h) - Math.max(a.y - a.top, b.y - b.top) + gap;
      if (overlapX <= 0 || overlapY <= 0) continue;
      moved = true;
      if (overlapX < overlapY) { const sign = a.x < b.x ? -1 : 1; a.x += (sign * overlapX) / 2; b.x -= (sign * overlapX) / 2; }
      else { const sign = a.y < b.y ? -1 : 1; a.y += (sign * overlapY) / 2; b.y -= (sign * overlapY) / 2; }
    }
    // 상자 전체가 무대 안에 남도록 노드 중심을 상자 크기만큼 안쪽으로 묶는다.
    for (const p of pts) { p.x = Math.min(width - pad - (p.w - p.left), Math.max(pad + p.left, p.x)); p.y = Math.min(height - pad - (p.h - p.top), Math.max(pad + p.top, p.y)); }
    if (!moved) break;
  }
  const out = new Map(positions);
  for (const p of pts) out.set(p.id, { x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
  return out;
}

// 상자끼리 겹치는 쌍의 수. 무대를 얼마나 키워야 하는지 정할 때 쓴다.
export function labelOverlaps(positions, boxes) {
  const pts = [...boxes.entries()].filter(([id]) => positions.has(id)).map(([id, b]) => ({ ...b, ...positions.get(id) }));
  let count = 0;
  for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) {
    const a = pts[i], b = pts[j];
    const overlapX = Math.min(a.x - a.left + a.w, b.x - b.left + b.w) - Math.max(a.x - a.left, b.x - b.left);
    const overlapY = Math.min(a.y - a.top + a.h, b.y - b.top + b.h) - Math.max(a.y - a.top, b.y - b.top);
    if (overlapX > 0 && overlapY > 0) count += 1;
  }
  return count;
}
