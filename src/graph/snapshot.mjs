import { nodeRadius } from './layout.mjs';
import { topicColor, cleanTitle, escapeHtml as escape } from '../lib/format.mjs';
import { topicRegions, regionPath, placeRegionLabels, regionLabelBox } from './regions.mjs';
import { estimateTextWidth, labelIds, placeLabels, nodeBox } from './label.mjs';

const n = (value) => +value.toFixed(2);

// 홈의 정적 지도. 페이지에 인라인되므로 서체·색은 페이지 토큰(--display, --sans, --paper, --accent)을 쓴다.
// preset 'mobile': 높이 280px 상자용. viewBox 배율이 작아 글자를 크게 두고 허브 제목은 아래에만 놓는다(데스크톱 미만에서 그대로 보이는 그림).
// preset 'desktop': 높이 pixelHeight 상자용. hero.js가 올리는 살아 있는 그래프와 같은 크기·자리로 그려, 교체가 눈에 띄지 않게 한다.
export function renderSnapshotSvg(nodes, edges, positions, { width, height, preset = 'mobile', pixelHeight = 500, font = 14, regionFont = 16, strokeWidth = 1.1, label = '생각 지도' } = {}) {
  if (preset === 'desktop') return renderDesktop(nodes, edges, positions, { width, height, pixelHeight, label });
  const at = (id) => positions.get(id);
  const regions = topicRegions(nodes, positions);
  // 허브 제목은 연결 많은 순으로 놓고, 먼저 놓인 제목과 겹치면 건너뛴다(정적 그림이라 자리를 옮길 수 없다).
  const radiusOf = (node) => nodeRadius(node.degree ?? 0);
  const labelBoxes = [], labels = [];
  const idle = labelIds(nodes, []); // 엔진의 평소 규칙과 같은 노드에 제목을 단다.
  const titled = nodes.filter((node) => at(node.id) && idle.has(node.id)).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
  for (const node of titled) {
    const p = at(node.id), title = cleanTitle(node.displayTitle ?? node.title ?? ''), w = estimateTextWidth(title, font), y = p.y + radiusOf(node) + font + 4;
    const box = { left: p.x - w / 2, right: p.x + w / 2, top: y - font, bottom: y + font * 0.3 };
    if (labelBoxes.some((b) => b.left < box.right && box.left < b.right && b.top < box.bottom && box.top < b.bottom)) continue;
    labelBoxes.push(box); labels.push({ node, title, x: p.x, y });
  }
  const regionLabelAt = placeRegionLabels(regions, [...nodes.filter((node) => at(node.id)).map((node) => ({ ...at(node.id), r: radiusOf(node) + 4 })), ...labelBoxes], { fontSize: regionFont, pad: regionFont * 1.2, measure: estimateTextWidth, bounds: { width, height } });
  let out = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="snap is-mobile" role="img" aria-label="${escape(label)}">`;
  out += `<g data-regions="" opacity=".06">${regions.map((r) => `<path d="${regionPath(r.hull)}" fill="${topicColor(r.topic)}" stroke="${topicColor(r.topic)}" stroke-width="64" stroke-linejoin="round"></path>`).join('')}</g>`;
  out += `<g font-family="var(--display)" font-weight="700" font-size="${regionFont}" letter-spacing="${(regionFont * 0.16).toFixed(1)}" text-anchor="middle" opacity=".95" paint-order="stroke" stroke="#f7f7f2" stroke-width="${(regionFont * 0.25).toFixed(1)}" stroke-linejoin="round">`;
  out += regions.map((r) => { const a = regionLabelAt.get(r.topic); return `<text x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" text-anchor="${a.anchor}" fill="${topicColor(r.topic)}">${escape(r.topic)}</text>`; }).join('');
  out += `</g><g stroke="#9aab9d" stroke-width="${strokeWidth}" stroke-opacity=".22">`;
  for (const edge of edges) { const a = at(edge.source), b = at(edge.target); if (a && b) out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`; }
  out += '</g><g>';
  for (const node of nodes) {
    const p = at(node.id); if (!p) continue;
    const r = radiusOf(node);
    if (node.type === 'hub') out += `<circle cx="${p.x}" cy="${p.y}" r="${(r + 6).toFixed(1)}" fill="none" stroke="#252e29" stroke-width="1.2" stroke-opacity=".7"></circle>`;
    out += `<circle cx="${p.x}" cy="${p.y}" r="${r.toFixed(1)}" fill="${topicColor(node.topic)}" stroke="#f7f7f2" stroke-width="2"></circle>`;
  }
  out += `</g><g font-family="var(--sans)" font-size="${font}" fill="#252e29" text-anchor="middle" paint-order="stroke" stroke="#f7f7f2" stroke-width="${(font * 0.35).toFixed(1)}" stroke-linejoin="round">`;
  for (const { node, title, x, y } of labels) out += `<text x="${x}" y="${y.toFixed(1)}" font-weight="${node.type === 'hub' ? 600 : 450}">${escape(title)}</text>`;
  return `${out}</g></svg>`;
}

// 엔진의 hero 모드와 같은 값: nodeScale 0.9, 제목 13px, 영역 이름 15px, 간선 1.1(농도 .28), 색면 .07, 허브 링 r+7, 진입점 후광 r+11.
// 맞춤도 엔진의 fitTransform과 같다: 노드 경계 상자를 여백 40px으로 상자에 맞춘다. 데스크톱 상자는 폭이 넉넉해 높이(pixelHeight)가 배율을 정하므로,
// 경계 상자에 여백을 더한 영역을 viewBox로 두면 브라우저의 meet 맞춤이 엔진과 같은 배율·위치를 낸다. u는 화면 1px의 장면 단위.
function renderDesktop(nodes, edges, positions, { width, height, pixelHeight, label }) {
  const at = (id) => positions.get(id);
  const points = [...positions.values()];
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
  const u = Math.max(1, maxY - minY) / (pixelHeight - 80), pad = 40 * u;
  const viewBox = [minX - pad, minY - pad, Math.max(1, maxX - minX) + 2 * pad, Math.max(1, maxY - minY) + 2 * pad].map((v) => v.toFixed(1)).join(' ');
  const radiusOf = (node) => nodeRadius(node.degree ?? 0, 0.9);
  const placed = nodes.filter((node) => at(node.id));
  const regions = topicRegions(nodes, positions);
  const regionLabelAt = placeRegionLabels(regions, placed.map((node) => ({ ...at(node.id), r: radiusOf(node) + 4 })), { fontSize: 15, measure: estimateTextWidth, bounds: { width, height } });
  const obstacles = [
    ...placed.map((node) => nodeBox(at(node.id), radiusOf(node) + 2 * u)),
    ...regions.map((r) => regionLabelBox(regionLabelAt.get(r.topic), r.topic, { fontSize: 15, measure: estimateTextWidth, scale: u }))
  ];
  // 보이는 범위: 세로는 맞춤 영역, 가로는 무대(상자가 더 넓어 옆으로 여유가 있다).
  const inside = (b) => b.left >= 0 && b.right <= width && b.top >= minY - pad && b.bottom <= maxY + pad;
  const idle = labelIds(nodes, []);
  const plan = placeLabels(placed.filter((node) => idle.has(node.id)).map((node) => ({ node, mustPlace: true })), { positions, radius: radiusOf, u, obstacles, inside });
  let out = `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" class="snap is-desktop" role="img" aria-label="${escape(label)}">`;
  out += `<g data-regions="" opacity=".07">${regions.map((r) => `<path d="${regionPath(r.hull)}" fill="${topicColor(r.topic)}" stroke="${topicColor(r.topic)}" stroke-width="64" stroke-linejoin="round"></path>`).join('')}</g>`;
  out += `<g font-family="var(--display)" font-weight="700" font-size="${n(15 * u)}" letter-spacing=".16em" opacity=".95" paint-order="stroke" stroke="var(--paper)" stroke-width="${n(3.5 * u)}" stroke-linejoin="round">`;
  out += regions.map((r) => { const a = regionLabelAt.get(r.topic); return `<text x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" text-anchor="${a.anchor}" fill="${topicColor(r.topic)}">${escape(r.topic)}</text>`; }).join('');
  out += `</g><g stroke="#9aab9d" stroke-width="1.1" stroke-opacity=".28">`;
  for (const edge of edges) { const a = at(edge.source), b = at(edge.target); if (a && b) out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`; }
  out += '</g><g>';
  for (const node of placed) {
    const p = at(node.id), r = radiusOf(node);
    if (node.isEntry) out += `<circle cx="${p.x}" cy="${p.y}" r="${(r + 11).toFixed(1)}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1" stroke-opacity=".5"></circle>`;
    if (node.type === 'hub') out += `<circle cx="${p.x}" cy="${p.y}" r="${(r + 7).toFixed(1)}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-opacity=".9"></circle>`;
    out += `<circle cx="${p.x}" cy="${p.y}" r="${r.toFixed(1)}" fill="${topicColor(node.topic)}" stroke="var(--paper)" stroke-width="${node.isEntry ? 2.8 : 2}"></circle>`;
  }
  out += `</g><g font-family="var(--sans)" font-size="${n(13 * u)}" fill="var(--ink)" paint-order="stroke" stroke="var(--paper)" stroke-width="${n(4.5 * u)}" stroke-linejoin="round">`;
  for (const [id, { lines, g }] of plan) {
    const node = placed.find((item) => item.id === id);
    const tspans = lines.map((line, index) => `<tspan x="${g.x.toFixed(1)}" dy="${index === 0 ? 0 : n(18 * u)}">${escape(line)}</tspan>`).join('');
    out += `<text x="${g.x.toFixed(1)}" y="${g.y.toFixed(1)}" text-anchor="${g.anchor}"${node.isEntry ? ' fill="var(--accent)" font-weight="700"' : ''}>${tspans}</text>`;
  }
  return `${out}</g></svg>`;
}
