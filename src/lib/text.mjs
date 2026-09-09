import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { stripObsidianComments } from './markdown.mjs';

const parser = new MarkdownIt({ html: true });
const stripBlockIds = (value) => String(value ?? '').replace(/(^|\s)\^[A-Za-z0-9-]+(?=\s|$)/g, '$1');
export function plainText(body, { includeCodeBlocks = true } = {}) {
  const source = stripObsidianComments(body)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*>?\s*\[![^\]]+\]\s*/gm, '> ')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target);
  const content = (token) => {
    if (!includeCodeBlocks && ['fence', 'code_block'].includes(token.type)) return '';
    if (token.type === 'inline') return (token.children ?? []).map(content).join('');
    if (token.type === 'text') return stripBlockIds(token.content);
    if (['code_inline', 'fence', 'code_block', 'image'].includes(token.type)) return token.content;
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    if (token.type === 'html_inline' || token.type === 'html_block') {
      return parser.utils.unescapeAll(sanitizeHtml(token.content, { allowedTags: [], allowedAttributes: {} }));
    }
    return '';
  };
  return parser.parse(source, {}).map(content).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
