import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import imageService from 'astro/assets/services/sharp';
import { kindLabel, formatDate, cleanTitle } from './format.mjs';
import { estimateTextWidth } from '../graph/engine.mjs';
import { localGraphLayout } from '../components/local-graph-layout.mjs';
import { layoutGraph, nodeRadius } from '../graph/layout.mjs';
import { topicColor } from './format.mjs';
import { ensureOgFonts } from './og-fonts.mjs';
import { projectPaths } from './get-garden.mjs';
import { pngDimensions } from './png.mjs';
import { imageMimeType } from './image-types.mjs';
export { pngDimensions } from './png.mjs';

const PAPER = '#f7f7f2', INK = '#252e29', MUTED = '#626d64', FAINT = '#747c73', ACCENT = '#252e29', LINE = '#9aab9d';
const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- PNG 캐시 ----
// 키는 최종 SVG 문자열 + 폰트 파일 정체 + resvg 버전에서 계산한다. 카드를 바꾸는 코드(템플릿·제목 접기·색상표·배치)는
// 전부 SVG에 드러나므로 수동 버전 상수가 필요 없다. 폰트가 없어 시스템 폰트로 그린 폴백은 저장하지 않는다.
const CARD = { width: 1200, height: 630 };
const RENDER_OPTIONS = { fitTo: { mode: 'width', value: CARD.width } };
const CACHE_MAX_AGE_DAYS = 14;
const ogCacheDir = process.env.GARDEN_OG_CACHE_DIR || path.join(projectPaths().projectRoot, 'node_modules', '.cache', 'garden-og-images');

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const isCard = (png) => { const d = pngDimensions(png); return Boolean(d && d.width === CARD.width && d.height === CARD.height); };

// 빌드마다 처음 한 번, 오래 안 쓴 항목과 남은 임시 파일을 지운다. 적중한 파일은 mtime을 갱신하므로 계속 쓰는 카드는 남는다.
export async function pruneOgCache({ dir = ogCacheDir, maxAgeDays = CACHE_MAX_AGE_DAYS } = {}) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const names = await fs.readdir(dir).catch(() => []);
  let removed = 0;
  await Promise.all(names.map(async (name) => {
    const file = path.join(dir, name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat && (name.endsWith('.tmp') || stat.mtimeMs < cutoff)) { await fs.rm(file, { force: true }); removed++; }
  }));
  return removed;
}

let prunePromise = null;
const inFlight = new Map();
export async function cachedPng(key, render) {
  if (inFlight.has(key)) return inFlight.get(key);
  const pending = readOrRender(key, render);
  inFlight.set(key, pending);
  try { return await pending; } finally { inFlight.delete(key); }
}

async function readOrRender(key, render) {
  await fs.mkdir(ogCacheDir, { recursive: true });
  await (prunePromise ??= pruneOgCache());
  const target = path.join(ogCacheDir, `${key}.png`);
  try {
    const png = await fs.readFile(target);
    if (isCard(png)) { const now = new Date(); await fs.utimes(target, now, now).catch(() => {}); return png; }
    await fs.rm(target, { force: true }); // 잘렸거나 PNG가 아니다. 다시 그린다.
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const png = await render();
  if (!isCard(png)) throw new Error('OG renderer returned an invalid 1200×630 PNG');
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, png);
    await fs.rename(tmp, target);
  } finally { await fs.rm(tmp, { force: true }); }
  return png;
}

let resvgVersionPromise = null;
const resvgVersion = () => (resvgVersionPromise ??= fs.readFile(path.join(projectPaths().projectRoot, 'node_modules', '@resvg', 'resvg-js', 'package.json'), 'utf8')
  .then((text) => JSON.parse(text).version).catch(() => 'unknown'));

let fontsPromise = null;
// 폰트 파일 경로와 정체(이름·크기). 없으면 null(로컬 폴백).
const fonts = () => (fontsPromise ??= ensureOgFonts().then(async (files) => files
  ? { files, meta: await Promise.all(files.map(async (file) => ({ name: path.basename(file), size: (await fs.stat(file)).size }))) }
  : null));

function renderPng(svg, fontFiles) {
  const resvg = new Resvg(svg, {
    ...RENDER_OPTIONS,
    font: fontFiles ? { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Pretendard' } : { loadSystemFonts: true, defaultFontFamily: 'Apple SD Gothic Neo' }
  });
  return resvg.render().asPng();
}

async function renderCard(svg) {
  const font = await fonts();
  if (!font) return renderPng(svg, null);
  const key = digest({ svg, render: RENDER_OPTIONS, fonts: font.meta, resvg: await resvgVersion() });
  return cachedPng(key, () => renderPng(svg, font.files));
}

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

function thumbnailSourcePath(thumbnail, vaultRoot) {
  if (!thumbnail) return null;
  const sourcePath = path.resolve(vaultRoot, thumbnail);
  const relative = path.relative(vaultRoot, sourcePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`OG thumbnail is outside the vault: ${thumbnail}`);
  }
  return sourcePath;
}

export async function thumbnailDataUri(thumbnail, { vaultRoot = projectPaths().vaultRoot } = {}) {
  const sourcePath = thumbnailSourcePath(thumbnail, vaultRoot);
  if (!sourcePath) return null;
  const extension = path.extname(sourcePath).toLowerCase();
  const mimeType = imageMimeType(sourcePath);
  if (!mimeType) {
    throw new Error(`Unsupported OG thumbnail format: ${extension || '(none)'}`);
  }
  const source = await fs.readFile(sourcePath);
  if (extension === '.svg') return `data:${mimeType};base64,${source.toString('base64')}`;
  // 홈과 같은 이미지 서비스를 사용한다. resvg가 직접 읽지 못하는 WebP도 PNG로 전달한다.
  const image = await imageService.transform(source, { src: sourcePath, width: 800, height: 800, fit: 'contain', format: 'png' }, { service: { config: {} } }, console);
  if (image.format !== 'png') throw new Error(`Could not normalize OG thumbnail: ${thumbnail}`);
  return `data:image/png;base64,${Buffer.from(image.data).toString('base64')}`;
}

// 왼쪽에 제목·메타, 오른쪽에 썸네일 또는 로컬 그래프를 둔다.
export function ogSvg({ note, outgoing, incoming, siteLabel, thumbnailDataUri: thumbnail, thumbnailRatio = 1 }) {
  const title = cleanTitle(note.displayTitle || note.title);
  const { size, lines } = fitTitle(title);
  const lineHeight = Math.round(size * 1.34);
  const blockHeight = lineHeight * lines.length;
  const firstBaseline = Math.round((630 - blockHeight) / 2 + size * 0.92);
  const meta = [kindLabel(note), note.date ? formatDate(note.date) : '', note.readingMinutes ? `${note.readingMinutes}분` : ''].filter(Boolean).join(' · ');
  const imageWidth = Math.min(400, 400 * thumbnailRatio), imageHeight = Math.min(400, 400 / thumbnailRatio);
  const image = thumbnail ? `<image href="${thumbnail}" x="${740 + (400 - imageWidth) / 2}" y="${115 + (400 - imageHeight) / 2}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid meet"/>` : '';
  const softMask = `<defs>
<linearGradient id="thumb-x"><stop stop-color="white" stop-opacity="0"/><stop offset=".18" stop-color="white"/><stop offset=".90" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
<linearGradient id="thumb-y" x2="0" y2="1"><stop stop-color="white" stop-opacity="0"/><stop offset=".14" stop-color="white"/><stop offset=".86" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
<mask id="thumb-mask-x" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#thumb-x)"/></mask>
<mask id="thumb-mask-y" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#thumb-y)"/></mask>
</defs>`;
  const rightPanel = thumbnail
    ? note.thumbnailStyle === 'soft' ? `${softMask}<g mask="url(#thumb-mask-x)"><g mask="url(#thumb-mask-y)">${image}</g></g>` : image
    : (() => {
      const layout = localGraphLayout(note, outgoing, incoming, { width: 400, height: 400, max: 8 });
      const edges = layout.edges.map((e) => `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${LINE}" stroke-width="1.8" stroke-opacity=".85"${e.direction === 'in' ? ' stroke-dasharray="7 6"' : ''}/>`).join('');
      const nodes = layout.nodes.map((n) => n.current
        ? `<circle cx="${n.x}" cy="${n.y}" r="22" fill="none" stroke="${ACCENT}" stroke-width="1.8" stroke-opacity=".7"/><circle cx="${n.x}" cy="${n.y}" r="13" fill="${n.color}"/>`
        : `<circle cx="${n.x}" cy="${n.y}" r="9" fill="${n.color}" stroke="${PAPER}" stroke-width="3"/>`).join('');
      return `<g transform="translate(740 115)">${edges}${nodes}</g>`;
    })();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${PAPER}"/>
<text x="72" y="94" font-family="Gowun Batang" font-weight="700" font-size="34" fill="${INK}">TaeZ</text>
${rightPanel}
${lines.map((line, index) => `<text x="72" y="${firstBaseline + index * lineHeight}" font-family="Gowun Batang" font-weight="700" font-size="${size}" letter-spacing="-1.5" fill="${INK}">${esc(line)}</text>`).join('\n')}
<text x="72" y="560" font-family="Pretendard" font-size="26" fill="${MUTED}">${esc(meta)}</text>
<text x="1128" y="560" text-anchor="end" font-family="Pretendard" font-size="22" fill="${FAINT}">${esc(siteLabel)}</text>
</svg>`;
}

export async function renderOgPng(garden, notePath, { siteLabel }) {
  const byPath = new Map(garden.notes.map((n) => [n.path, n]));
  const note = byPath.get(notePath);
  if (!note) throw new Error(`OG: unknown note ${notePath}`);
  const resolve = (paths) => paths.map((p) => byPath.get(p)).filter(Boolean);
  const thumbnail = await thumbnailDataUri(note.thumbnail);
  const dimensions = thumbnail?.startsWith('data:image/png;') ? pngDimensions(Buffer.from(thumbnail.split(',')[1], 'base64')) : null;
  return renderCard(ogSvg({ note, outgoing: resolve(note.outgoing), incoming: resolve(note.incoming), siteLabel, thumbnailDataUri: thumbnail, thumbnailRatio: dimensions ? dimensions.width / dimensions.height : 1 }));
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
<text x="72" y="94" font-family="Gowun Batang" font-weight="700" font-size="34" fill="${INK}">TaeZ</text>
<g transform="translate(700 95)">${edges}${nodes}</g>
${lines.map((line, index) => `<text x="72" y="${firstBaseline + index * lineHeight}" font-family="Gowun Batang" font-weight="700" font-size="${size}" letter-spacing="-2" fill="${INK}">${esc(line)}</text>`).join('\n')}
<text x="1128" y="560" text-anchor="end" font-family="Pretendard" font-size="22" fill="${FAINT}">${esc(siteLabel)}</text>
</svg>`;
}

export async function renderSiteOgPng(garden, { title, siteLabel }) {
  return renderCard(siteSvg({ garden, title, siteLabel }));
}
