export function nodeRadius(degree, scale = 1) {
  return (4.5 + Math.min(degree, 15) * 0.6) * scale;
}

export function layoutGraph(nodes, edges, { width, height, seed = 7, iterations = 700, pad = 56 } = {}) {
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const points = nodes.map(() => ({ x: width * (0.1 + 0.8 * random()), y: height * (0.35 + 0.3 * random()), dx: 0, dy: 0 }));
  const pairs = edges.filter((e) => index.has(e.source) && index.has(e.target)).map((e) => [index.get(e.source), index.get(e.target)]);
  const k = Math.sqrt((width * height) / Math.max(1, nodes.length)) * 0.8;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const temperature = 50 * (1 - iteration / iterations) + 0.5;
    for (const p of points) { p.dx = 0; p.dy = 0; }
    for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i], b = points[j];
      let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 0.01; const f = (k * k) / d; dx /= d; dy /= d;
      a.dx += dx * f; a.dy += dy * f; b.dx -= dx * f; b.dy -= dy * f;
    }
    for (const [i, j] of pairs) {
      const a = points[i], b = points[j];
      let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 0.01; const f = (d * d) / k; dx /= d; dy /= d;
      a.dx -= dx * f; a.dy -= dy * f; b.dx += dx * f; b.dy += dy * f;
    }
    for (const p of points) {
      p.dx += (width / 2 - p.x) * 0.015; p.dy += (height / 2 - p.y) * 0.11;
      const d = Math.hypot(p.dx, p.dy) || 0.01; const m = Math.min(d, temperature);
      p.x += (p.dx / d) * m; p.y += (p.dy / d) * m;
    }
  }
  if (!points.length) return new Map();
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((width - 2 * pad) / Math.max(1, maxX - minX), (height - 2 * pad) / Math.max(1, maxY - minY));
  const ox = (width - (maxX - minX) * scale) / 2, oy = (height - (maxY - minY) * scale) / 2;
  return new Map(nodes.map((node, i) => [node.id, { x: +(ox + (points[i].x - minX) * scale).toFixed(1), y: +(oy + (points[i].y - minY) * scale).toFixed(1) }]));
}
