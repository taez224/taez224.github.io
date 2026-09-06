import { Resvg } from '@resvg/resvg-js';
import { kindLabel, formatDate, cleanTitle } from './format.mjs';
import { estimateTextWidth } from '../graph/engine.mjs';
import { localGraphLayout } from '../components/local-graph-layout.mjs';
import { layoutGraph, nodeRadius } from '../graph/layout.mjs';
import { topicColor } from './format.mjs';
import { ensureOgFonts } from './og-fonts.mjs';

const PAPER = '#f7f7f2', INK = '#252e29', MUTED = '#626d64', FAINT = '#747c73', ACCENT = '#315b48', LINE = '#9aab9d';
const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 단어 단위로 접되, 한 단어가 폭을 넘으면 글자 단위로 자른다.
function wrapToWidth(text, fontSize, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) { line = candidate; continue; }
    if (line) lines.push(line);
    line = '';
    let chunk = '';
    for (const ch of word) {
      if (estimateTextWidth(chunk + ch, fontSize) > maxWidth && chunk) { lines.push(chunk); chunk = ''; }
      chunk += ch;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

// 제목은 세 줄 안에 들어가는 가장 큰 크기로. 그래도 넘치면 마지막 줄을 줄임표로 자른다.
export function fitTitle(title, { maxWidth = 620, maxLines = 3, sizes = [60, 54, 48, 42, 36] } = {}) {
  for (const size of sizes) {
    const lines = wrapToWidth(title, size, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  const lines = wrapToWidth(title, 36, maxWidth).slice(0, maxLines);
  lines[maxLines - 1] = `${[...lines[maxLines - 1]].slice(0, -1).join('')}…`;
  return { size: 36, lines };
}

// 종이 배경, 왼쪽에 명조 제목과 메타, 오른쪽에 그 노트의 로컬 그래프. 글마다 그래프 모양이 달라 카드가 서로 다르다.
export function ogSvg({ note, outgoing, incoming, siteLabel }) {
  const title = cleanTitle(note.displayTitle || note.title);
  const { size, lines } = fitTitle(title);
  const lineHeight = Math.round(size * 1.34);
  const blockHeight = lineHeight * lines.length;
  const firstBaseline = Math.round((630 - blockHeight) / 2 + size * 0.92);
  const meta = [kindLabel(note), note.date ? formatDate(note.date) : '', note.readingMinutes ? `${note.readingMinutes}분` : ''].filter(Boolean).join(' · ');
  const layout = localGraphLayout(note, outgoing, incoming, { width: 400, height: 400, max: 8 });
  const edges = layout.edges.map((e) => `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${LINE}" stroke-width="1.8" stroke-opacity=".85"${e.direction === 'in' ? ' stroke-dasharray="7 6"' : ''}/>`).join('');
  const nodes = layout.nodes.map((n) => n.current
    ? `<circle cx="${n.x}" cy="${n.y}" r="22" fill="none" stroke="${ACCENT}" stroke-width="1.8" stroke-opacity=".7"/><circle cx="${n.x}" cy="${n.y}" r="13" fill="${n.color}"/>`
    : `<circle cx="${n.x}" cy="${n.y}" r="9" fill="${n.color}" stroke="${PAPER}" stroke-width="3"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${PAPER}"/>
<text x="72" y="94" font-family="Noto Serif KR" font-weight="700" font-size="34" fill="${INK}">TaeZ</text>
<g transform="translate(740 115)">${edges}${nodes}</g>
${lines.map((line, index) => `<text x="72" y="${firstBaseline + index * lineHeight}" font-family="Noto Serif KR" font-weight="700" font-size="${size}" letter-spacing="-1.5" fill="${INK}">${esc(line)}</text>`).join('\n')}
<text x="72" y="560" font-family="Pretendard" font-size="26" fill="${MUTED}">${esc(meta)}</text>
<text x="1128" y="560" text-anchor="end" font-family="Pretendard" font-size="22" fill="${FAINT}">${esc(siteLabel)}</text>
</svg>`;
}

let fontsPromise = null;
export async function renderOgPng(garden, notePath, { siteLabel }) {
  const byPath = new Map(garden.notes.map((n) => [n.path, n]));
  const note = byPath.get(notePath);
  if (!note) throw new Error(`OG: unknown note ${notePath}`);
  const resolve = (paths) => paths.map((p) => byPath.get(p)).filter(Boolean);
  const svg = ogSvg({ note, outgoing: resolve(note.outgoing), incoming: resolve(note.incoming), siteLabel });
  fontsPromise ??= ensureOgFonts();
  const fontFiles = await fontsPromise;
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: fontFiles ? { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Pretendard' } : { loadSystemFonts: true, defaultFontFamily: 'Apple SD Gothic Neo' }
  });
  return resvg.render().asPng();
}

// 사이트 카드: 홈·목록·지도처럼 노트가 아닌 페이지에 쓴다. 오른쪽에 전체 노트 지도를 얹는다.
// 워드마크 'TaeZ'가 왼쪽 위에 있으니 제목에서는 이름을 빼고 'Thinking Garden'만 크게 둔다. 소개문은 넣지 않는다.
export function siteSvg({ garden, title, siteLabel }) {
  const { size, lines } = fitTitle(title, { maxWidth: 600, maxLines: 2, sizes: [84, 76, 68, 60, 52] });
  const lineHeight = Math.round(size * 1.2);
  const box = { width: 440, height: 440 };
  const positions = layoutGraph(garden.nodes, garden.edges, { ...box, pad: 24 });
  const edges = garden.edges.map((e) => { const a = positions.get(e.source), b = positions.get(e.target); return a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${LINE}" stroke-width="1.1" stroke-opacity=".6"/>` : ''; }).join('');
  const nodes = garden.nodes.map((n) => { const p = positions.get(n.id); if (!p) return ''; const r = nodeRadius(n.degree ?? 0, 0.95); const ring = n.type === 'hub' ? `<circle cx="${p.x}" cy="${p.y}" r="${(r + 6).toFixed(1)}" fill="none" stroke="${ACCENT}" stroke-width="1.4" stroke-opacity=".7"/>` : ''; return `${ring}<circle cx="${p.x}" cy="${p.y}" r="${r.toFixed(1)}" fill="${topicColor(n.topic)}" stroke="${PAPER}" stroke-width="2"/>`; }).join('');
  const blockHeight = lineHeight * lines.length;
  const firstBaseline = Math.round((630 - blockHeight) / 2 + size * 0.9);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${PAPER}"/>
<text x="72" y="94" font-family="Noto Serif KR" font-weight="700" font-size="34" fill="${INK}">TaeZ</text>
<g transform="translate(700 95)">${edges}${nodes}</g>
${lines.map((line, index) => `<text x="72" y="${firstBaseline + index * lineHeight}" font-family="Noto Serif KR" font-weight="700" font-size="${size}" letter-spacing="-2" fill="${INK}">${esc(line)}</text>`).join('\n')}
<text x="1128" y="560" text-anchor="end" font-family="Pretendard" font-size="22" fill="${FAINT}">${esc(siteLabel)}</text>
</svg>`;
}

export async function renderSiteOgPng(garden, { title, siteLabel }) {
  const svg = siteSvg({ garden, title, siteLabel });
  fontsPromise ??= ensureOgFonts();
  const fontFiles = await fontsPromise;
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: fontFiles ? { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Pretendard' } : { loadSystemFonts: true, defaultFontFamily: 'Apple SD Gothic Neo' }
  });
  return resvg.render().asPng();
}
