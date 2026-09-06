import { Resvg } from '@resvg/resvg-js';
import { kindLabel, formatDate, cleanTitle } from './format.mjs';
import { estimateTextWidth } from '../graph/engine.mjs';
import { localGraphLayout } from '../components/local-graph-layout.mjs';
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
export function fitTitle(title, { maxWidth = 620, maxLines = 3 } = {}) {
  for (const size of [60, 54, 48, 42, 36]) {
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
