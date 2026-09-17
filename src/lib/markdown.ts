import type { PublicNote } from './content-model.ts';
export type ResolvedNote = { visibility: 'private'; title?: never; url?: never } | { visibility?: 'public'; title?: string; url: string };
interface Resolvers {
  resolveNote?: (source: string, target: string, fragment?: string) => ResolvedNote | null | undefined;
  resolveAsset?: (source: string, target: string) => { url: string } | null | undefined;
}
interface LinkContext extends Resolvers { sourcePath: string }
interface RenderContext extends LinkContext { markdown: InstanceType<typeof MarkdownIt> }

import MarkdownIt, { type Token } from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { highlightCode } from './highlight.ts';
import { escapeHtml } from './format.ts';
import { isImagePath } from './image-types.ts';

// 제목을 적지 않은 콜아웃의 한국어 기본 제목이다. 별칭은 Obsidian이 제목에 별칭 이름을 쓰는 것처럼 따로 둔다.
const CALLOUT_TITLES: Record<string, string> = {
  abstract: '요약',
  article: '함께 읽기',
  attention: '주의',
  bug: '문제',
  caution: '주의',
  check: '확인',
  cite: '인용',
  compare: '비교',
  'compare-stacked': '비교',
  danger: '주의',
  done: '완료',
  error: '오류',
  example: '예시',
  fail: '실패',
  failure: '실패',
  faq: '질문과 답변',
  help: '도움말',
  hint: '힌트',
  important: '중요',
  info: '정보',
  missing: '누락',
  note: '메모',
  question: '질문',
  quote: '인용',
  success: '성공',
  summary: '요약',
  tip: '팁',
  tldr: '요약',
  todo: '할 일',
  warning: '주의'
};

// Obsidian이 기본 종류로 취급하는 별칭이다(https://obsidian.md/help/callouts). 모양은 기본 종류의 클래스를 따르고,
// 사이트에서 따로 꾸밀 수 있게 별칭 클래스도 함께 단다.
const CALLOUT_ALIASES: Record<string, string> = {
  attention: 'warning', caution: 'warning', check: 'success', cite: 'quote', done: 'success', error: 'danger',
  fail: 'failure', faq: 'question', help: 'question', hint: 'tip', important: 'tip', missing: 'failure',
  summary: 'abstract', tldr: 'abstract'
};

// markdown-it은 ~~취소선~~을 <s>로 그리므로 del과 함께 s도 허용한다.
const ALLOWED_TAGS = [
  'a', 'aside', 'blockquote', 'br', 'code', 'del', 'details', 'div', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'kbd', 'li', 'mark', 'ol',
  'p', 'pre', 's', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
];

const ALLOWED_ATTRIBUTES = {
  a: ['class', 'data-note-path', 'href', 'rel', 'target', 'title'],
  aside: ['class', 'data-article-card'],
  code: ['class'],
  details: ['class', 'open'],
  div: ['class'],
  h1: ['class', 'id'],
  h2: ['class', 'id'],
  h3: ['class', 'id'],
  h4: ['class', 'id'],
  h5: ['class', 'id'],
  h6: ['class', 'id'],
  img: ['alt', 'class', 'height', 'loading', 'src', 'title', 'width'],
  mark: ['class'],
  p: ['class'],
  pre: ['class'],
  section: ['class'],
  span: ['class', 'id', 'role', 'aria-label', 'aria-hidden', 'tabindex'],
  summary: ['class'],
  table: ['class'],
  td: ['class', 'colspan', 'rowspan'],
  th: ['class', 'colspan', 'rowspan']
};


function stripInlineMarkup(value: unknown): string {
  return String(value ?? '')
    .replace(/\\([!-\/:-@[-`{-~])/g, '$1')
    .replace(/!?(\[\[|\]\])/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function headingTextForId(value: unknown): string {
  return stripInlineMarkup(replaceOutsideInlineCode(String(value ?? ''), (text) => text
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/==([^=\n]+)==/g, '$1')
    .replace(/(^|[ \t]+)\^([A-Za-z0-9-]+)[ \t]*$/, '$1')));
}

function slugifyHeading(value: unknown): string {
  const slug = stripInlineMarkup(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  return slug || 'section';
}

function splitWikiTarget(rawTarget: unknown) {
  const parts = String(rawTarget ?? '').split('|');
  const target = parts.shift()?.trim() ?? '';
  const label = parts.join('|');
  const hashIndex = target.indexOf('#');
  // Obsidian은 `노트#상위#하위`처럼 제목 경로를 적을 수 있고 마지막 제목으로 이동한다.
  const section = hashIndex < 0 ? '' : target.slice(hashIndex + 1).split('#').at(-1)!;
  return {
    target: hashIndex < 0 ? target : target.slice(0, hashIndex),
    fragment: hashIndex < 0 ? '' : slugifyHeading(section),
    section: section.trim(),
    label
  };
}

// Obsidian의 그림 크기 표기다. 위키 임베드는 `![[그림.png|300]]`·`|300x200`이고, Markdown 그림은 대체 텍스트 끝의
// `|300`이나 숫자만 쓴 `![300](주소)`다. 너비만 주면 비율을 유지한다(본문 CSS의 height: auto).
const WIKI_IMAGE_SIZE = /^\s*(\d+)(?:x(\d+))?\s*$/;
export const MARKDOWN_IMAGE_SIZE = /^(?:([\s\S]*)\|)?\s*(\d+)(?:x(\d+))?\s*$/;
const sizeAttributes = (width?: string, height?: string) => `${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''}`;

function renderPrivateNote(label: string, target: string): string {
  let decodedTarget = target;
  try { decodedTarget = decodeURIComponent(target); } catch { /* Keep malformed authored text. */ }
  const basename = decodedTarget.split('#')[0].replace(/\\/g, '/').split('/').at(-1)!.replace(/\.md$/i, '');
  return `<span class="private-note">${escapeHtml(label || basename)} <span class="visibility-mark" role="img" tabindex="0" aria-label="공개되지 않은 자료"><span class="visibility-hint" aria-hidden="true">공개되지 않은 자료</span></span></span>`;
}

function replaceWikiLinks(source: string, context: LinkContext): string {
  return source.replace(/!?\[\[([^\]]+)\]\]/g, (whole, rawTarget) => {
    const embedded = whole.startsWith('!');
    const { target, fragment, section, label } = splitWikiTarget(rawTarget);
    if (!target && !fragment) return whole;

    if (embedded) {
      const asset = context.resolveAsset?.(context.sourcePath, target);
      if (asset) {
        const size = label.match(WIKI_IMAGE_SIZE);
        const alt = (size ? '' : label) || target.replace(/\.[^.]+$/, '');
        return `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}"${sizeAttributes(size?.[1], size?.[2])}>`;
      }
    }

    const note = context.resolveNote?.(context.sourcePath, target || context.sourcePath, fragment);
    if (!note) return escapeHtml(label || target || whole);
    if (note.visibility === 'private') return renderPrivateNote(label, target);
    // 같은 문서의 제목 링크(`[[#절]]`)는 지금 읽는 노트의 제목 대신 절 이름을 보인다. 블록 링크는 보일 제목이 없다.
    const sameNoteHeading = !target && !section.startsWith('^') ? section : '';
    const display = label || sameNoteHeading || note.title || target;
    return `<a class="internal-note-link" href="${escapeHtml(note.url)}">${escapeHtml(display)}</a>`;
  });
}

function replaceStandardLinks(source: string, context: LinkContext): string {
  if (source.startsWith('![')) return source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (whole, alt, target) => {
    if (/^(?:https?:)?\/\//i.test(target) || target.startsWith('data:')) return whole;
    const asset = context.resolveAsset?.(context.sourcePath, target);
    if (!asset) return whole;
    const size = alt.match(MARKDOWN_IMAGE_SIZE);
    return `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(size ? size[1] ?? '' : alt)}"${sizeAttributes(size?.[2], size?.[3])}>`;
  });

  return source.replace(/\[([^\]]*)\]\(([^)\s]+\.md(?:#[^)]*)?)(?:\s+"[^"]*")?\)/gi, (_whole, label, rawTarget) => {
    const { target, fragment } = splitWikiTarget(rawTarget);
    const note = context.resolveNote?.(context.sourcePath, target, fragment);
    if (note?.visibility === 'private') return renderPrivateNote(label, target);
    return note
      ? `<a class="internal-note-link" href="${escapeHtml(note.url)}">${escapeHtml(label)}</a>`
      : escapeHtml(label);
  });
}

function inlineCodeEnd(source: string, start: number): number {
  let escapes = 0;
  for (let i = start - 1; i >= 0 && source[i] === '\\'; i -= 1) escapes += 1;
  if (escapes % 2) return -1;
  let runEnd = start;
  while (source[runEnd] === '`') runEnd += 1;
  const runs = /`+/g;
  runs.lastIndex = runEnd;
  for (let match; (match = runs.exec(source));) {
    if (match[0].length === runEnd - start) return runs.lastIndex;
  }
  return -1;
}

// 사이트 규칙 없이 문법 구조만 보는 파서다. 주석 제거의 코드 범위, 목차의 제목 위치, 검색 텍스트 추출이 같이 쓴다.
// 렌더러 인스턴스와 달리 노트 해석기가 필요 없어 어디서든 env 없이 부를 수 있다.
export const structureParser = new MarkdownIt({ html: true });
// 헤딩 id. 같은 제목이 되풀이되면 -2, -3을 붙인다. 렌더러가 id를 매기면서 목차도 같이 모으므로 앵커와 목차가 어긋나지 않는다.
export function headingId(headingIds: Map<string, number>, text: unknown): string {
  const baseId = slugifyHeading(headingTextForId(text));
  const count = (headingIds.get(baseId) ?? 0) + 1;
  headingIds.set(baseId, count);
  return count === 1 ? baseId : `${baseId}-${count}`;
}

export function stripObsidianComments(source: unknown): string {
  const original = String(source ?? '');
  // 이미 정리한 공개 본문이 목차·검색·링크 추출 때마다 다시 들어온다. 주석 표시가 없으면 파싱 없이 그대로 돌려준다.
  if (!original.includes('%%')) return original;
  const offsets = [0];
  for (let i = 0; i < original.length; i += 1) if (original[i] === '\n') offsets.push(i + 1);
  const ranges = structureParser.parse(original, {})
    .filter((token) => ['fence', 'code_block'].includes(token.type) && token.map)
    .map((token) => [offsets[token.map![0]], offsets[token.map![1]] ?? original.length]);
  let output = '', rangeIndex = 0;
  for (let i = 0; i < original.length;) {
    // 주석 안에서 시작한 코드 블록은 주석을 건너뛴 뒤의 본문을 보호하지 않는다.
    while (rangeIndex < ranges.length && ranges[rangeIndex][0] < i) rangeIndex += 1;
    const range = ranges[rangeIndex];
    if (range && range[0] <= i) {
      output += original.slice(i, range[1]); i = range[1]; continue;
    }
    if (original.startsWith('%%', i)) {
      const end = original.indexOf('%%', i + 2);
      if (end >= 0) {
        output += original.slice(i, end + 2).replace(/[^\n]/g, '');
        i = end + 2; continue;
      }
    }
    if (original[i] === '`') {
      const end = inlineCodeEnd(original, i);
      if (end >= 0 && (!range || end <= range[0])) {
        output += original.slice(i, end); i = end; continue;
      }
      let runEnd = i + 1;
      while (original[runEnd] === '`') runEnd += 1;
      output += original.slice(i, runEnd); i = runEnd; continue;
    }
    output += original[i++];
  }
  return output;
}

function replaceOutsideInlineCode(line: string, transform: (text: string) => string): string {
  let output = '';
  let cursor = 0;
  while (cursor < line.length) {
    const start = line.indexOf('`', cursor);
    if (start < 0) {
      output += transform(line.slice(cursor));
      break;
    }

    let runEnd = start + 1;
    while (line[runEnd] === '`') runEnd += 1;
    const end = inlineCodeEnd(line, start);
    if (end < 0) {
      output += transform(line.slice(cursor, runEnd));
      cursor = runEnd;
      continue;
    }

    output += transform(line.slice(cursor, start));
    output += line.slice(start, end);
    cursor = end;
  }
  return output;
}

// 인라인 토큰 목록에서 Obsidian 표기를 바꾼다. 줄바꿈 토큰으로 나눈 줄 안에서만 짝을 찾는다.
// 형광은 `==`와 `==` 사이에 `=`가 없고 비어 있지 않을 때만 짝이고, 그 사이의 굵게·링크 같은 토큰은 그대로 안에 든다.
// 블록 id는 줄 끝의 텍스트 토큰에서만 보며, 줄 첫머리가 아니면 앞에 공백이 있어야 한다. 운영 규칙(원문 정규식)과 같다.
const BLOCK_ID = /(^|[ \t]+)\^([A-Za-z0-9-]+)[ \t]*$/;
type TokenConstructor = new (type: string, tag: string, nesting: 1 | 0 | -1) => Token;

function rewriteObsidianInline(children: Token[], Token: TokenConstructor): Token[] {
  const make = (type: string, content: string) => { const token = new Token(type, '', 0); token.content = content; return token; };
  const output: Token[] = [];
  let line: Token[] = [];
  const flush = () => { output.push(...rewriteLine(line, make)); line = []; };
  for (const token of children) {
    if (token.type === 'softbreak' || token.type === 'hardbreak') { flush(); output.push(token); continue; }
    line.push(token);
  }
  flush();
  return output;
}

function rewriteLine(line: Token[], make: (type: string, content: string) => Token): Token[] {
  const last = line[line.length - 1];
  if (last?.type === 'text') {
    const match = last.content.match(BLOCK_ID);
    if (match && (match[1] !== '' || line.length === 1)) {
      last.content = last.content.slice(0, match.index) + match[1];
      line = [...line, make('html_inline', `<span id="${slugifyHeading(match[2])}"></span>`)];
    }
  }
  // 표시 위치를 모은다. 텍스트 토큰 안의 `==`만 표시이고, 다른 토큰의 내용은 짝 사이의 `=` 검사에만 쓴다.
  const markers: { index: number; at: number }[] = [];
  line.forEach((token, index) => {
    if (token.type !== 'text') return;
    for (const found of token.content.matchAll(/==/g)) markers.push({ index, at: found.index });
  });
  const chosen = new Set<number>();
  for (let i = 0; i < markers.length - 1; i += 1) {
    if (chosen.has(i)) continue;
    const open = markers[i];
    const close = markers[i + 1];
    const between = line.slice(open.index, close.index + 1).map((token, offset, slice) => {
      const from = offset === 0 ? open.at + 2 : 0;
      const to = offset === slice.length - 1 ? close.at : token.content.length;
      return token.type === 'text' || token.type === 'code_inline' || token.type === 'text_special' ? token.content.slice(from, to) : '';
    }).join('');
    const hasOtherTokens = close.index > open.index;
    if ((between.length === 0 && !hasOtherTokens) || between.includes('=')) continue;
    chosen.add(i); chosen.add(i + 1); i += 1;
  }
  if (!chosen.size) return line;
  const result: Token[] = [];
  let opened = false;
  line.forEach((token, index) => {
    const here = markers.map((marker, position) => ({ ...marker, position })).filter((marker) => marker.index === index && chosen.has(marker.position));
    if (!here.length) { result.push(token); return; }
    let cursor = 0;
    for (const marker of here) {
      if (marker.at > cursor) result.push(make('text', token.content.slice(cursor, marker.at)));
      result.push(make('html_inline', opened ? '</mark>' : '<mark>'));
      opened = !opened;
      cursor = marker.at + 2;
    }
    if (cursor < token.content.length) result.push(make('text', token.content.slice(cursor)));
  });
  return result;
}

// 대체 텍스트 자리의 크기 표기를 너비·높이 속성으로 옮기고 나머지만 대체 텍스트로 남긴다.
function applyImageSize(image: Token, Token: TokenConstructor) {
  const size = image.content.match(MARKDOWN_IMAGE_SIZE);
  if (!size) return;
  const alt = size[1] ?? '';
  const text = new Token('text', '', 0);
  text.content = alt;
  image.children = alt ? [text] : [];
  image.content = alt;
  image.attrSet('width', size[2]);
  if (size[3]) image.attrSet('height', size[3]);
}

function articleTarget(line: string) {
  const match = line.match(/^\s*\[\[([^\]]+)\]\]\s*$/);
  if (!match) return null;
  const parsed = splitWikiTarget(match[1]);
  return parsed.target ? parsed : null;
}

// 콜아웃은 이 깊이까지만 콜아웃으로 그리고 그 아래는 인용문으로 둔다. 바깥 콜아웃이 0이다.
const MAX_CALLOUT_DEPTH = 3;
const CALLOUT_HEAD = /^>\s*\[!([\w-]+)\]([+-])?(?:\s+(.*))?\s*$/i;
const CALLOUT_LINE = /^>\s?(.*)$/;

function createMarkdownIt() {
  const markdown = new MarkdownIt({
    breaks: false,
    highlight: highlightCode,
    html: true,
    linkify: true,
    typographer: false
  });
  // CommonMark rejects a ** run that sits between punctuation and a Korean syllable: it can neither close
  // (`역량(Capacity)**이라는`) nor be trusted to only open (`(**중요**)`). Hand the run to markdown-it as both an
  // opener and a closer and let its own pairing decide which role it plays.
  markdown.inline.ruler.before('emphasis', 'korean_strong_pair', (state, silent) => {
    if (silent || state.src.slice(state.pos, state.pos + 2) !== '**') return false;
    const scanned = state.scanDelims(state.pos, true);
    const previous = state.src.codePointAt(state.pos - 1);
    const next = state.src[state.pos + scanned.length] ?? '';
    if (scanned.length !== 2 || scanned.can_close || !/[가-힣]/u.test(next)
      || !state.md.utils.isPunctCharCode(previous!)) return false;

    for (let index = 0; index < 2; index += 1) {
      state.push('text', '', 0).content = '*';
      state.delimiters.push({
        marker: 0x2A,
        length: 2,
        token: state.tokens.length - 1,
        end: -1,
        open: true,
        close: true
      });
    }
    state.pos += 2;
    return true;
  });

  // Run note and asset resolution only where MarkdownIt expects inline syntax.
  // Code, fenced blocks and escaped opening brackets never enter this rule.
  markdown.inline.ruler.before('link', 'vault_links', (state, silent) => {
    const source = state.src.slice(state.pos, state.posMax);
    const wiki = source.match(/^!?\[\[([^\]]+)\]\]/);
    const standard = wiki ? null : source.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|^\[([^\]]*)\]\(([^)\s]+\.md(?:#[^)]*)?)(?:\s+"[^"]*")?\)/i);
    const match = wiki || standard;
    if (!match) return false;
    const context = state.env.context as LinkContext;
    const result = wiki
      ? replaceWikiLinks(match[0], context)
      : replaceStandardLinks(match[0], context);
    if (result === match[0]) return false;
    if (!silent) state.push('html_inline', '', 0).content = result;
    state.pos += match[0].length;
    return true;
  });

  // 이미지 하나뿐인 문단 바로 뒤에 통째로 기울임인 문단이 오면 그림(figure)과 캡션(figcaption)으로 묶는다.
  // 다른 확장처럼 토큰 단계에서 문단 구조를 보고 판단하므로, `*강조*로 시작`하는 문단이나 뒤 블록을 잘못 끌어안지 않는다.
  // 이미지는 markdown-it의 image 토큰이거나 vault_links가 만든 <img> html_inline 토큰이다.
  const isImageOnly = (inline: Token) => {
    const only = inline.children?.length === 1 ? inline.children[0] : null;
    return only !== null && (only.type === 'image' || (only.type === 'html_inline' && /^<img\b/i.test(only.content)));
  };
  const isWhollyItalic = (inline: Token) => {
    const kids = inline.children ?? [];
    if (kids.length < 3 || kids[0].type !== 'em_open' || kids[kids.length - 1].type !== 'em_close') return false;
    let depth = 0;
    for (let i = 0; i < kids.length; i += 1) {
      if (kids[i].type === 'em_open') depth += 1;
      else if (kids[i].type === 'em_close') depth -= 1;
      if (depth === 0 && i < kids.length - 1) return false; // 첫 기울임이 문단 끝 전에 닫히면 문단 전체가 기울임이 아니다
    }
    return depth === 0;
  };
  markdown.core.ruler.push('image_caption', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 5 < tokens.length; i += 1) {
      const [pOpen, image, pClose, cOpen, caption, cClose] = tokens.slice(i, i + 6);
      if (pOpen.type !== 'paragraph_open' || image.type !== 'inline' || pClose.type !== 'paragraph_close') continue;
      if (cOpen.type !== 'paragraph_open' || caption.type !== 'inline' || cClose.type !== 'paragraph_close') continue;
      if (pOpen.level !== cOpen.level || !isImageOnly(image) || !isWhollyItalic(caption)) continue;
      pOpen.type = 'figure_open'; pOpen.tag = 'figure';
      pClose.type = 'figcaption_open'; pClose.tag = 'figcaption'; pClose.nesting = 1;
      cClose.type = 'figcaption_close'; cClose.tag = 'figcaption';
      caption.children = caption.children!.slice(1, -1);
      const figureClose = new state.Token('figure_close', 'figure', -1);
      figureClose.block = true;
      tokens.splice(i + 3, 1); // 캡션 문단의 paragraph_open은 필요 없다
      tokens.splice(i + 5, 0, figureClose);
      i += 5;
    }
  });

  // 기존 전처리는 일반 인용문 뒤의 콜아웃을 별도 블록으로 분리했다. 기본 인용문 규칙이
  // 같은 깊이의 콜아웃까지 삼키지 않도록 앞부분만 먼저 파싱한다. 인용문 속 코드 예시는 제외한다.
  markdown.block.ruler.before('blockquote', 'quote_before_callout', (state, startLine, endLine, silent) => {
    if (state.parentType === 'blockquote' || state.sCount[startLine] - state.blkIndent >= 4) return false;
    const lineAt = (line: number) => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    if (!lineAt(startLine).startsWith('>') || CALLOUT_HEAD.test(lineAt(startLine))) return false;
    let protectedLines: Set<number> | undefined;
    for (let line = startLine + 1; line < endLine; line++) {
      if (!lineAt(line).startsWith('>')) break;
      if (!CALLOUT_HEAD.test(lineAt(line))) continue;
      protectedLines ??= new Set(structureParser.parse(state.src, {})
        .filter((token) => ['fence', 'code_block'].includes(token.type) && token.map)
        .flatMap((token) => Array.from({ length: token.map![1] - token.map![0] }, (_, i) => token.map![0] + i)));
      if (protectedLines.has(line)) continue;
      if (silent) return true;
      state.md.block.tokenize(state, startLine, line);
      state.line = line;
      return true;
    }
    return false;
  });

  // Obsidian 콜아웃(`> [!종류]±? 제목`과 이어지는 `>` 줄)을 블록 규칙으로 잡는다. 인용문 규칙보다 앞에 두어 `>`를 먼저 본다.
  // 본문은 `>`를 벗겨 다시 블록 파싱하고 그 토큰을 같은 흐름에 넣으므로, 인라인 처리·그림 설명·제목 규칙이 한 번만 돈다.
  // 종류 이름은 대소문자를 가리지 않고 사용자 정의를 받으며, 뜻은 CSS가 준다. 일반 인용문 안의 `> [!종류]`는
  // 그대로 인용문으로 둔다(운영 동작 유지). 글 카드는 접히지 않는 article 콜아웃의 본문이 위키링크 한 줄일 때만 만든다.
  markdown.block.ruler.before('blockquote', 'callout', (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4 || state.parentType === 'blockquote') return false;
    const env = state.env as { context?: RenderContext; articleCards?: PublicNote['articleCards']; calloutDepth?: number };
    const depth = env.calloutDepth ?? 0;
    if (depth > MAX_CALLOUT_DEPTH) return false;
    const lineAt = (line: number) => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    const head = lineAt(startLine).match(CALLOUT_HEAD);
    if (!head) return false;
    if (silent) return true;

    const [, rawType, foldMarker, customTitle] = head;
    const type = rawType.toLowerCase();
    const quotedLines: string[] = [];
    let next = startLine + 1;
    for (; next < endLine; next += 1) {
      const quoted = lineAt(next).match(CALLOUT_LINE);
      if (!quoted) break;
      quotedLines.push(quoted[1]);
    }

    // 글 카드는 카드 목록을 받은 렌더링에서만 해석한다. 링크 추출과 코드 범위 계산의 파싱에서는 본문의 위키링크가
    // 인라인 규칙으로 문서 순서대로 모이도록 일반 콜아웃으로 둔다.
    const context = env.context;
    const target = env.articleCards && type === 'article' && !foldMarker && quotedLines.length === 1 ? articleTarget(quotedLines[0]) : null;
    const note = target && context ? context.resolveNote?.(context.sourcePath, target.target, target.fragment) : null;
    if (note && note.visibility !== 'private' && note.url && env.articleCards) {
      const cardIndex = env.articleCards.length;
      const title = note.title || target!.target;
      env.articleCards.push({ url: note.url, title, caption: customTitle?.trim() || '' });
      const card = state.push('article_card', 'aside', 0);
      card.block = true;
      card.map = [startLine, next];
      card.meta = { cardIndex, url: note.url, title };
      state.line = next;
      return true;
    }

    // 접기 표시가 있으면 Obsidian처럼 접을 수 있는 콜아웃이다. `-`는 접힌 채로, `+`는 펼친 채로 시작한다.
    const open = state.push('callout_open', foldMarker ? 'details' : 'aside', 1);
    open.block = true;
    open.map = [startLine, next];
    const kind = type.replace(/[^a-z0-9_-]/gi, '') || 'note';
    const canonical = CALLOUT_ALIASES[kind];
    open.meta = {
      expanded: foldMarker === '+',
      title: customTitle?.trim() || CALLOUT_TITLES[type] || type,
      className: canonical ? `callout callout-${canonical} callout-${kind}` : `callout callout-${kind}`
    };
    // 본문 토큰은 새 상태에서 깊이 0으로 나오므로 현재 깊이를 더해 넣는다. 제목 id 규칙이 level 0만 보기 때문이다.
    const body: Token[] = [];
    env.calloutDepth = depth + 1;
    state.md.block.parse(quotedLines.join('\n').trim(), state.md, state.env, body);
    env.calloutDepth = depth;
    for (const token of body) {
      token.level += state.level;
      state.tokens.push(token);
    }
    const close = state.push('callout_close', open.tag, -1);
    close.block = true;
    state.line = next;
    return true;
  });
  markdown.renderer.rules.callout_open = (tokens, index) => {
    const { expanded, title, className } = tokens[index].meta as { expanded: boolean; title: string; className: string };
    return tokens[index].tag === 'details'
      ? `<details class="${className}"${expanded ? ' open' : ''}><summary>${escapeHtml(title)}</summary><div class="callout-body">`
      : `<aside class="${className}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-body">`;
  };
  markdown.renderer.rules.callout_close = (tokens, index) => `</div></${tokens[index].tag}>\n`;
  markdown.renderer.rules.article_card = (tokens, index) => {
    const { cardIndex, url, title } = tokens[index].meta as { cardIndex: number; url: string; title: string };
    return `<aside class="article-card-slot" data-article-card="${cardIndex}"><a class="internal-note-link" href="${escapeHtml(url)}">${escapeHtml(title)}</a></aside>\n`;
  };

  // Obsidian의 형광(==글==)과 블록 id(줄 끝의 ^id)를 인라인 토큰에서 바꾼다. 원문을 미리 고치지 않으므로 코드 안의
  // 표기는 저절로 남고, 이스케이프한 `\=`는 text_special 토큰이라 표시로 읽히지 않는다. 그래서 text_join보다 앞에 둔다.
  // 외부 주소 그림은 vault_links를 거치지 않고 markdown-it의 image 토큰이 되므로 크기 표기를 여기서 떼어 낸다.
  markdown.core.ruler.after('inline', 'obsidian_inline', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue;
      for (const child of token.children) if (child.type === 'image') applyImageSize(child, state.Token);
      token.children = rewriteObsidianInline(token.children, state.Token);
    }
  });

  // 문서의 목차를 소유한 렌더만 headingIds를 넘긴다. 콜아웃 본문의 토큰은 level이 0보다 커서 번호를 매기지 않고 id도 두지 않는다.
  // 인용·목록 안의 헤딩(level > 0)도 같은 이유로 건너뛴다. 목차(env.headings)도 여기서 같이 모으므로 앵커와 목차가 어긋날 수 없다.
  const defaultHeadingOpen = markdown.renderer.rules.heading_open;
  markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const headingText = nextToken?.type === 'inline' ? nextToken.content : '';
    const headingIds = env?.headingIds as Map<string, number> | undefined;
    if (headingIds && token.level === 0) {
      const id = headingId(headingIds, headingText);
      token.attrSet('id', id);
      const level = Number(token.tag.slice(1));
      const headings = env?.headings as PublicNote['headings'] | undefined;
      if (headings && level >= 2 && level <= 4) headings.push({ id, level, title: headingTextForId(headingText) });
    }
    return defaultHeadingOpen
      ? defaultHeadingOpen(tokens, index, options, env, self)
      : `<${token.tag}${self.renderAttrs(token)}>`;
  };
  return markdown;
}

const linkParser = createMarkdownIt();

// 렌더러와 같은 inline 규칙으로 노트 대상만 모은다. 코드·주석·이스케이프는 링크가 되지 않는다.
// 파일 해석과 공개 판정은 호출자가 맡고, 같은 문서의 절 링크는 노트 사이 연결에서 제외한다.
export function extractNoteTargets(source: string): string[] {
  const targets = new Set<string>();
  linkParser.parse(stripObsidianComments(source), { context: {
    sourcePath: '',
    resolveAsset: (_source: string, target: string) => isImagePath(target) ? { url: target } : null,
    resolveNote: (_source: string, target: string) => { if (target) targets.add(target); return null; }
  } });
  return [...targets];
}

export function createMarkdownRenderer({ resolveNote, resolveAsset }: Resolvers) {
  const markdown = createMarkdownIt();

  // articleCards와 headings는 렌더링이 채우는 출력 인자다. 글 카드는 카드 목록에, 목차는 2~4단계 제목이 렌더러가 매긴 id와 함께 쌓인다.
  return function renderMarkdown(sourcePath: string, source: string, { articleCards = [], headings }: { articleCards?: PublicNote['articleCards']; headings?: PublicNote['headings'] } = {}): string {
    const context = {
      resolveAsset,
      resolveNote,
      sourcePath,
      markdown
    };
    const rendered = markdown.render(stripObsidianComments(source), { headingIds: new Map(), headings, context, articleCards });
    return sanitizeHtml(rendered, {
      allowedAttributes: ALLOWED_ATTRIBUTES,
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: {
        a: ['http', 'https', 'mailto'],
        img: ['http', 'https']
      },
      allowedTags: ALLOWED_TAGS,
      allowProtocolRelative: false,
      transformTags: {
        a: (tagName, attributes) => {
          if (/^https?:\/\//i.test(attributes.href ?? '')) {
            return {
              attribs: { ...attributes, rel: 'noreferrer', target: '_blank' },
              tagName
            };
          }
          return { attribs: attributes, tagName };
        }
      }
    });
  };
}
