import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const CALLOUT_TITLES = {
  abstract: '요약',
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
  aside: ['class'],
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
  span: ['class'],
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

function stripInlineMarkup(value) {
  return String(value ?? '')
    .replace(/!?(\[\[|\]\])/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
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
  const label = parts.join('|').trim();
  const hashIndex = target.indexOf('#');
  return {
    target: hashIndex < 0 ? target : target.slice(0, hashIndex),
    fragment: hashIndex < 0 ? '' : slugifyHeading(target.slice(hashIndex + 1)),
    label
  };
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
        return `![${alt}](${asset.url})`;
      }
    }

    const note = context.resolveNote?.(context.sourcePath, target || context.sourcePath, fragment);
    if (!note) return label || target || whole;
    const display = label || note.title || target;
    return `<a class="internal-note-link" href="${escapeHtml(note.url)}">${escapeHtml(display)}</a>`;
  });
}

function replaceStandardLinks(source, context) {
  let result = source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (whole, alt, target) => {
    if (/^(?:https?:)?\/\//i.test(target) || target.startsWith('data:')) return whole;
    const asset = context.resolveAsset?.(context.sourcePath, target);
    return asset ? `![${alt}](${asset.url})` : whole;
  });

  result = result.replace(/\[([^\]]+)\]\(([^)\s]+\.md(?:#[^)]*)?)(?:\s+"[^"]*")?\)/gi, (whole, label, rawTarget) => {
    const { target, fragment } = splitWikiTarget(rawTarget);
    const note = context.resolveNote?.(context.sourcePath, target, fragment);
    // 공개되지 않은 노트로 가는 링크는 죽은 링크 대신 평문으로 둔다(위키링크와 같은 규칙).
    return note
      ? `<a class="internal-note-link" href="${escapeHtml(note.url)}">${escapeHtml(label)}</a>`
      : label;
  });
  return result;
}

function replaceObsidianFormatting(source) {
  return source
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
}

function renderCallouts(source, renderCore, depth = 0) {
  const lines = source.split('\n');
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*>\s*\[!([\w-]+)\]([+-])?(?:\s+(.*))?\s*$/i);
    if (!match) {
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

    const title = customTitle?.trim() || CALLOUT_TITLES[type] || type;
    const body = quotedLines.join('\n').trim();
    const nestedBody = depth < 3 ? renderCallouts(body, renderCore, depth + 1) : body;
    const bodyHtml = renderCore(nestedBody);
    const className = `callout callout-${type.replace(/[^a-z0-9_-]/gi, '') || 'note'}`;
    if (foldMarker === '-') {
      output.push(`<details class="${className}"><summary>${escapeHtml(title)}</summary><div class="callout-body">${bodyHtml}</div></details>`);
    } else {
      output.push(`<aside class="${className}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-body">${bodyHtml}</div></aside>`);
    }
    index = next - 1;
  }
  return output.join('\n');
}

function createMarkdownIt() {
  const markdown = new MarkdownIt({
    breaks: false,
    html: true,
    linkify: true,
    typographer: false
  });
  const defaultHeadingOpen = markdown.renderer.rules.heading_open;
  markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const headingText = nextToken?.type === 'inline' ? nextToken.content : '';
    const baseId = slugifyHeading(headingText);
    env.headingIds ??= new Map();
    const count = (env.headingIds.get(baseId) ?? 0) + 1;
    env.headingIds.set(baseId, count);
    token.attrSet('id', count === 1 ? baseId : `${baseId}-${count}`);
    return defaultHeadingOpen
      ? defaultHeadingOpen(tokens, index, options, env, self)
      : `<${token.tag}${self.renderAttrs(token)}>`;
  };
  return markdown;
}

export function createMarkdownRenderer({ resolveNote, resolveAsset }) {
  const markdown = createMarkdownIt();

  function renderCore(source, context) {
    const prepared = replaceStandardLinks(
      replaceWikiLinks(
        replaceObsidianFormatting(String(source ?? '')),
        context
      ),
      context
    );
    return markdown.render(prepared, { headingIds: new Map() });
  }

  return function renderMarkdown(sourcePath, source) {
    const context = {
      resolveAsset,
      resolveNote,
      sourcePath
    };
    const prepared = replaceStandardLinks(
      replaceWikiLinks(
        replaceObsidianFormatting(String(source ?? '')),
        context
      ),
      context
    );
    const withCallouts = renderCallouts(prepared, (body) => renderCore(body, context));
    const rendered = markdown.render(withCallouts, { headingIds: new Map() });
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
