import { nodeRadius } from './layout.mjs';
import { topicColor } from '../lib/format.mjs';

const escape = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function renderSnapshotSvg(nodes, edges, positions, { width, height, font = 14, strokeWidth = 1.1, radiusScale = 1 } = {}) {
  const at = (id) => positions.get(id);
  let out = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="노트 지도"><g stroke="#9aab9d" stroke-width="${strokeWidth}" stroke-opacity=".55">`;
  for (const edge of edges) { const a = at(edge.source), b = at(edge.target); if (a && b) out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`; }
  out += '</g><g>';
  for (const node of nodes) {
    const p = at(node.id); if (!p) continue;
    const r = nodeRadius(node.degree ?? 0, radiusScale);
    if (node.type === 'hub') out += `<circle cx="${p.x}" cy="${p.y}" r="${(r + 6 * radiusScale).toFixed(1)}" fill="none" stroke="#315b48" stroke-width="${1.2 * radiusScale}" stroke-opacity=".7"></circle>`;
    out += `<circle cx="${p.x}" cy="${p.y}" r="${r.toFixed(1)}" fill="${topicColor(node.topic)}" stroke="#f7f7f2" stroke-width="${2 * radiusScale}"></circle>`;
  }
  out += `</g><g font-family="Pretendard Variable, Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="${font}" fill="#252e29" text-anchor="middle" paint-order="stroke" stroke="#f7f7f2" stroke-width="${(font * 0.35).toFixed(1)}" stroke-linejoin="round">`;
  for (const node of nodes) {
    const p = at(node.id); if (!p) continue;
    const title = node.displayTitle ?? node.title ?? '';
    const show = node.type === 'hub' || ((node.degree ?? 0) >= 9 && [...title].length <= 14);
    if (!show) continue;
    out += `<text x="${p.x}" y="${(p.y + nodeRadius(node.degree ?? 0, radiusScale) + font + 4 * radiusScale).toFixed(1)}" font-weight="${node.type === 'hub' ? 600 : 450}">${escape(title)}</text>`;
  }
  return `${out}</g></svg>`;
}
