import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const CALLOUT_TITLES = {
  abstract: '요약',
  article: '함께 읽기',
  bug: '문제',
  danger: '주의',
  example: '예시',
  failure: '실패',
  faq: '질문과 답변',
  info: '정보',
  note: '메모',
  question: '질문',
  quote: '인용',
  success: '성공',
  tip: '팁',
  todo: '할 일',
  warning: '주의'
};

const ALLOWED_TAGS = [
  'a', 'aside', 'blockquote', 'br', 'code', 'del', 'details', 'div', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'kbd', 'li', 'mark', 'ol',
  'p', 'pre', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table',
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

export function stripInlineMarkup(value) {
  return String(value ?? '')
    .replace(/\\([!-\/:-@[-`{-~])/g, '$1')
    .replace(/!?(\[\[|\]\])/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function headingTextForId(value) {
  return stripInlineMarkup(replaceOutsideInlineCode(String(value ?? ''), (text) => text
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/==([^=\n]+)==/g, '$1')
    .replace(/(^|[ \t]+)\^([A-Za-z0-9-]+)[ \t]*$/, '$1')));
}

export function slugifyHeading(value) {
  const slug = stripInlineMarkup(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  return slug || 'section';
}

function splitWikiTarget(rawTarget) {
  const parts = String(rawTarget ?? '').split('|');
  const target = parts.shift()?.trim() ?? '';
  const label = parts.join('|');
  const hashIndex = target.indexOf('#');
  return {
    target: hashIndex < 0 ? target : target.slice(0, hashIndex),
    fragment: hashIndex < 0 ? '' : slugifyHeading(target.slice(hashIndex + 1)),
    label
  };
}

function renderPrivateNote(label, target) {
  let decodedTarget = target;
  try { decodedTarget = decodeURIComponent(target); } catch { /* Keep malformed authored text. */ }
  const basename = decodedTarget.split('#')[0].replace(/\\/g, '/').split('/').at(-1).replace(/\.md$/i, '');
  return `<span class="private-note">${escapeHtml(label || basename)} <span class="visibility-mark" role="img" tabindex="0" aria-label="공개되지 않은 자료"><span class="visibility-hint" aria-hidden="true">공개되지 않은 자료</span></span></span>`;
}

function replaceWikiLinks(source, context) {
  return source.replace(/!?\[\[([^\]]+)\]\]/g, (whole, rawTarget) => {
    const embedded = whole.startsWith('!');
    const { target, fragment, label } = splitWikiTarget(rawTarget);
    if (!target && !fragment) return whole;

    if (embedded) {
      const asset = context.resolveAsset?.(context.sourcePath, target);
      if (asset) {
        const alt = label || target.replace(/\.[^.]+$/, '');
        return `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}">`;
      }
    }

    const note = context.resolveNote?.(context.sourcePath, target || context.sourcePath, fragment);
    if (!note) return escapeHtml(label || target || whole);
    if (note.visibility === 'private') return renderPrivateNote(label, target);
    const display = label || note.title || target;
    return `<a class="internal-note-link" href="${escapeHtml(note.url)}">${escapeHtml(display)}</a>`;
  });
}

function replaceStandardLinks(source, context) {
  if (source.startsWith('![')) return source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (whole, alt, target) => {
    if (/^(?:https?:)?\/\//i.test(target) || target.startsWith('data:')) return whole;
    const asset = context.resolveAsset?.(context.sourcePath, target);
    return asset ? `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}">` : whole;
  });

  return source.replace(/\[([^\]]*)\]\(([^)\s]+\.md(?:#[^)]*)?)(?:\s+"[^"]*")?\)/gi, (whole, label, rawTarget) => {
    const { target, fragment } = splitWikiTarget(rawTarget);
    const note = context.resolveNote?.(context.sourcePath, target, fragment);
    if (note?.visibility === 'private') return renderPrivateNote(label, target);
    return note
      ? `<a class="internal-note-link" href="${escapeHtml(note.url)}">${escapeHtml(label)}</a>`
      : escapeHtml(label);
  });
}

function inlineCodeEnd(source, start) {
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

const commentParser = new MarkdownIt({ html: true });
export function stripObsidianComments(source) {
  const original = String(source ?? '');
  const offsets = [0];
  for (let i = 0; i < original.length; i += 1) if (original[i] === '\n') offsets.push(i + 1);
  const ranges = commentParser.parse(original, {})
    .filter((token) => ['fence', 'code_block'].includes(token.type) && token.map)
    .map((token) => [offsets[token.map[0]], offsets[token.map[1]] ?? original.length]);
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

function replaceOutsideInlineCode(line, transform) {
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

// 블록 ID는 보이는 표기 대신 링크 도착점으로 남긴다. 코드 예시는 변환하지 않는다.
function replaceObsidianFormatting(source, markdown, context) {
  const original = stripObsidianComments(source);
  const codeLines = codeLinesFor(original, markdown, context);
  return original.split('\n').map((line, index) => {
    if (codeLines.has(index)) return line;
    return replaceOutsideInlineCode(line, (text) => text
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      .replace(/(^|[ \t]+)\^([A-Za-z0-9-]+)[ \t]*$/, (_match, space, id) => `${space}<span id="${slugifyHeading(id)}"></span>`));
  }).join('\n');
}

function codeLinesFor(source, markdown, context) {
  const lines = new Set();
  for (const token of markdown.parse(source, { context })) {
    if ((token.type !== 'fence' && token.type !== 'code_block') || !token.map) continue;
    for (let index = token.map[0]; index < token.map[1]; index += 1) lines.add(index);
  }
  return lines;
}

function articleTarget(line) {
  const match = line.match(/^\s*\[\[([^\]]+)\]\]\s*$/);
  if (!match) return null;
  const parsed = splitWikiTarget(match[1]);
  return parsed.target ? parsed : null;
}

const calloutPlaceholder = (index) => `\uE000CALLOUT_${index}\uE001`;

function renderCallouts(source, renderCore, context, articleCards, depth = 0, blocks = []) {
  const lines = source.split('\n');
  const codeLines = codeLinesFor(source, context.markdown, context);
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*>\s*\[!([\w-]+)\]([+-])?(?:\s+(.*))?\s*$/i);
    if (!match || codeLines.has(index)) {
      output.push(lines[index]);
      continue;
    }

    const [, rawType, foldMarker, customTitle] = match;
    const type = rawType.toLowerCase();
    const quotedLines = [];
    let next = index + 1;
    while (next < lines.length) {
      const quoted = lines[next].match(/^\s*>\s?(.*)$/);
      if (!quoted) break;
      quotedLines.push(quoted[1]);
      next += 1;
    }

    const target = type === 'article' && !foldMarker && quotedLines.length === 1
      ? articleTarget(quotedLines[0])
      : null;
    const note = target ? context.resolveNote?.(context.sourcePath, target.target, target.fragment) : null;
    if (note && note.visibility !== 'private' && note.url) {
      const cardIndex = articleCards.length;
      const title = note.title || target.target;
      articleCards.push({ url: note.url, title, caption: customTitle?.trim() || '' });
      blocks.push(`<aside class="article-card-slot" data-article-card="${cardIndex}"><a class="internal-note-link" href="${escapeHtml(note.url)}">${escapeHtml(title)}</a></aside>`);
      output.push('', calloutPlaceholder(blocks.length - 1), '');
      index = next - 1;
      continue;
    }

    const title = customTitle?.trim() || CALLOUT_TITLES[type] || type;
    const body = quotedLines.join('\n').trim();
    const nestedBody = depth < 3 ? renderCallouts(body, renderCore, context, articleCards, depth + 1, blocks) : body;
    const bodyHtml = renderCore(nestedBody);
    const className = `callout callout-${type.replace(/[^a-z0-9_-]/gi, '') || 'note'}`;
    const block = foldMarker === '-'
      ? `<details class="${className}"><summary>${escapeHtml(title)}</summary><div class="callout-body">${bodyHtml}</div></details>`
      : `<aside class="${className}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-body">${bodyHtml}</div></aside>`;
    blocks.push(block);
    output.push('', calloutPlaceholder(blocks.length - 1), '');
    index = next - 1;
  }
  return output.join('\n');
}

function materializeCallouts(html, blocks) {
  let output = html;
  // 바깥 콜아웃이 안쪽 콜아웃의 placeholder를 품을 수 있으므로 역순으로 풀어낸다.
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const marker = calloutPlaceholder(index);
    output = output.replaceAll(`<p>${marker}</p>`, blocks[index]).replaceAll(marker, blocks[index]);
  }
  return output;
}

function createMarkdownIt() {
  const markdown = new MarkdownIt({
    breaks: false,
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
      || !state.md.utils.isPunctCharCode(previous)) return false;

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
    const context = state.env.context;
    const result = wiki
      ? replaceWikiLinks(match[0], context)
      : replaceStandardLinks(match[0], context);
    if (result === match[0]) return false;
    if (!silent) state.push('html_inline', '', 0).content = result;
    state.pos += match[0].length;
    return true;
  });

  // 문서의 목차를 소유한 렌더만 headingIds를 넘긴다. 콜아웃 본문은 따로 렌더하므로 번호를 다시 매기지 않고 id도 두지 않는다.
  // 인용·목록 안의 헤딩(level > 0)도 같은 이유로 건너뛴다. garden.mjs의 headingsFor가 쓰는 규칙과 같다.
  const defaultHeadingOpen = markdown.renderer.rules.heading_open;
  markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const headingText = nextToken?.type === 'inline' ? nextToken.content : '';
    if (env.headingIds && token.level === 0) {
      const baseId = slugifyHeading(headingTextForId(headingText));
      const count = (env.headingIds.get(baseId) ?? 0) + 1;
      env.headingIds.set(baseId, count);
      token.attrSet('id', count === 1 ? baseId : `${baseId}-${count}`);
    }
    return defaultHeadingOpen
      ? defaultHeadingOpen(tokens, index, options, env, self)
      : `<${token.tag}${self.renderAttrs(token)}>`;
  };
  return markdown;
}

export function createMarkdownRenderer({ resolveNote, resolveAsset }) {
  const markdown = createMarkdownIt();

  function renderCore(source, context) {
    const prepared = replaceObsidianFormatting(String(source ?? ''), markdown, context);
    return markdown.render(prepared, { context });
  }

  return function renderMarkdown(sourcePath, source, { articleCards = [] } = {}) {
    const context = {
      resolveAsset,
      resolveNote,
      sourcePath,
      markdown
    };
    const prepared = replaceObsidianFormatting(String(source ?? ''), markdown, context);
    const calloutBlocks = [];
    const withCallouts = renderCallouts(prepared, (body) => renderCore(body, context), context, articleCards, 0, calloutBlocks);
    const rendered = materializeCallouts(markdown.render(withCallouts, { headingIds: new Map(), context }), calloutBlocks);
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
