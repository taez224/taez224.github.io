import { nodeRadius } from './layout.mjs';
import { topicColor } from '../lib/format.mjs';
import { topicRegions, regionPath, placeRegionLabels } from './regions.mjs';
import { estimateTextWidth } from './focus.mjs';

const escape = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 모바일 홈의 정적 지도. 페이지에 인라인되므로 서체는 페이지 토큰(--display, --sans)을 쓴다.
// 엔진과 같은 그림: 옅은 주제 색면 → 영역 이름 → 옅은 간선 → 노드(허브 링) → 허브 제목.
export function renderSnapshotSvg(nodes, edges, positions, { width, height, font = 14, regionFont = 16, strokeWidth = 1.1, radiusScale = 1, label = '생각 지도' } = {}) {
  const at = (id) => positions.get(id);
  const regions = topicRegions(nodes, positions);
  // 허브 제목은 연결 많은 순으로 놓고, 먼저 놓인 제목과 겹치면 건너뛴다(정적 그림이라 자리를 옮길 수 없다).
  const radiusOf = (node) => nodeRadius(node.degree ?? 0, radiusScale);
  const labelBoxes = [], labels = [];
  const titled = nodes.filter((node) => at(node.id) && (node.type === 'hub' || ((node.degree ?? 0) >= 9 && [...(node.displayTitle ?? node.title ?? '')].length <= 14))).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
  for (const node of titled) {
    const p = at(node.id), title = node.displayTitle ?? node.title ?? '', w = estimateTextWidth(title, font), y = p.y + radiusOf(node) + font + 4 * radiusScale;
    const box = { left: p.x - w / 2, right: p.x + w / 2, top: y - font, bottom: y + font * 0.3 };
    if (labelBoxes.some((b) => b.left < box.right && box.left < b.right && b.top < box.bottom && box.top < b.bottom)) continue;
    labelBoxes.push(box); labels.push({ node, title, x: p.x, y });
  }
  const regionLabelAt = placeRegionLabels(regions, [...nodes.filter((node) => at(node.id)).map((node) => ({ ...at(node.id), r: radiusOf(node) + 4 })), ...labelBoxes], { fontSize: regionFont, pad: regionFont * 1.2, measure: estimateTextWidth, bounds: { width, height } });
  let out = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="snap" role="img" aria-label="${escape(label)}">`;
  out += `<g data-regions="" opacity=".06">${regions.map((r) => `<path d="${regionPath(r.hull)}" fill="${topicColor(r.topic)}" stroke="${topicColor(r.topic)}" stroke-width="64" stroke-linejoin="round"></path>`).join('')}</g>`;
  out += `<g font-family="var(--display)" font-weight="700" font-size="${regionFont}" letter-spacing="${(regionFont * 0.16).toFixed(1)}" text-anchor="middle" opacity=".95" paint-order="stroke" stroke="#f7f7f2" stroke-width="${(regionFont * 0.25).toFixed(1)}" stroke-linejoin="round">`;
  out += regions.map((r) => { const a = regionLabelAt.get(r.topic); return `<text x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" text-anchor="${a.anchor}" fill="${topicColor(r.topic)}">${escape(r.topic)}</text>`; }).join('');
  out += `</g><g stroke="#9aab9d" stroke-width="${strokeWidth}" stroke-opacity=".22">`;
  for (const edge of edges) { const a = at(edge.source), b = at(edge.target); if (a && b) out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`; }
  out += '</g><g>';
  for (const node of nodes) {
    const p = at(node.id); if (!p) continue;
    const r = nodeRadius(node.degree ?? 0, radiusScale);
    if (node.type === 'hub') out += `<circle cx="${p.x}" cy="${p.y}" r="${(r + 6 * radiusScale).toFixed(1)}" fill="none" stroke="#252e29" stroke-width="${1.2 * radiusScale}" stroke-opacity=".7"></circle>`;
    out += `<circle cx="${p.x}" cy="${p.y}" r="${r.toFixed(1)}" fill="${topicColor(node.topic)}" stroke="#f7f7f2" stroke-width="${2 * radiusScale}"></circle>`;
  }
  out += `</g><g font-family="var(--sans)" font-size="${font}" fill="#252e29" text-anchor="middle" paint-order="stroke" stroke="#f7f7f2" stroke-width="${(font * 0.35).toFixed(1)}" stroke-linejoin="round">`;
  for (const { node, title, x, y } of labels) out += `<text x="${x}" y="${y.toFixed(1)}" font-weight="${node.type === 'hub' ? 600 : 450}">${escape(title)}</text>`;
  return `${out}</g></svg>`;
}
