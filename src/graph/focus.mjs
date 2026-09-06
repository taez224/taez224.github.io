export function graphNeighborhood(root, nodes, edges) {
  const ids = new Set([root]);
  const directEdges = edges.filter((edge) => edge.source === root || edge.target === root);
  for (const edge of directEdges) { ids.add(edge.source); ids.add(edge.target); }
  return { nodes: [...new Map(nodes.filter((node) => ids.has(node.id)).map((node) => [node.id, node])).values()], edges: directEdges };
}

export function graphEdgeEndpoints(source, target, sourceRadius, targetRadius) {
  const dx = target.x - source.x, dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { x1: source.x, y1: source.y, x2: target.x, y2: target.y };
  const from = Math.min(sourceRadius + 3, distance / 2);
  const to = Math.min(targetRadius + 3, distance / 2);
  return { x1: source.x + dx / distance * from, y1: source.y + dy / distance * from,
    x2: target.x - dx / distance * to, y2: target.y - dy / distance * to };
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

// Measured label sizes determine fixed slots. No layout changes on hover.
export function layoutGraphFocus(root, items, width, pixelScale, minHeight = 0) {
  const padding = 24 / pixelScale, gap = 18 / pixelScale;
  const rootItem = items.find((item) => item.id === root);
  if (!rootItem) return { positions: new Map(), height: 700 };
  const neighbors = items.filter((item) => item.id !== root).sort((a, b) => a.id.localeCompare(b.id));
  const widest = Math.max(0, ...neighbors.map((item) => item.width));
  const slot = (item) => item.height + 36 + gap;
  const positions = new Map();
  let height;
  if (widest * 2 + rootItem.width + gap * 2 + padding * 2 <= width) {
    const left = neighbors.filter((_, index) => index % 2 === 0);
    const right = neighbors.filter((_, index) => index % 2 === 1);
    height = Math.max(minHeight, 440 / pixelScale, ...[left, right].map((side) => side.reduce((sum, item) => sum + slot(item), 0) + padding * 2));
    for (const [side, x] of [[left, padding + widest / 2], [right, width - padding - widest / 2]]) {
      const contentHeight = side.reduce((sum, item) => sum + slot(item), 0);
      const extra = side.length > 1 ? (height - padding * 2 - contentHeight) / (side.length - 1) : 0;
      let y = side.length === 1 ? height / 2 : padding + 18;
      for (const item of side) { positions.set(item.id, { x, y }); y += slot(item) + extra; }
    }
  } else {
    const columns = Math.max(1, Math.min(2, Math.floor((width - padding * 2 + gap) / (widest + gap))));
    const split = Math.ceil(neighbors.length / 2);
    const makeRows = (list) => {
      const rows = [];
      for (let i = 0; i < list.length; i += columns) rows.push(list.slice(i, i + columns));
      return rows;
    };
    const above = makeRows(neighbors.slice(0, split)), below = makeRows(neighbors.slice(split));
    const rowHeight = (row) => Math.max(...row.map(slot));
    const size = (rows) => rows.reduce((sum, row) => sum + rowHeight(row), 0);
    const centerGap = rootItem.height + 36 + gap;
    height = Math.max(minHeight, 440 / pixelScale, 2 * (Math.max(size(above), size(below)) + centerGap + padding));
    for (const [rows, start] of [[above, height / 2 - centerGap - size(above)], [below, height / 2 + centerGap]]) {
      let y = start;
      for (const row of rows) {
        row.forEach((item, index) => positions.set(item.id, { x: width / 2 + (index - (row.length - 1) / 2) * (widest + gap), y }));
        y += rowHeight(row);
      }
    }
  }
  positions.set(root, { x: width / 2, y: height / 2 });
  return { positions, height };
}

export function visibleFixedLabels(labels, nodeBoxes, bounds, gap = 4) {
  const chosen = [];
  const overlap = (a, b) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  for (const label of [...labels].sort((a, b) => Number(b.selected) - Number(a.selected) || a.id.localeCompare(b.id))) {
    if (label.x + label.width < 0 || label.y + label.height < 0 || label.x > bounds.width || label.y > bounds.height) continue;
    if (chosen.some((other) => overlap(label, other))) continue;
    if (!label.selected && nodeBoxes.some((other) => other.id !== label.id && overlap(label, other))) continue;
    chosen.push(label);
  }
  return chosen.map((label) => label.id);
}
