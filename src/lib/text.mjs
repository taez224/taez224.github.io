import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const parser = new MarkdownIt({ html: true });
export function plainText(body) {
  const source = String(body ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*>?\s*\[![^\]]+\]\s*/gm, '> ')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target);
  const content = (token) => {
    if (token.type === 'inline') return (token.children ?? []).map(content).join('');
    if (['text', 'code_inline', 'fence', 'code_block', 'image'].includes(token.type)) return token.content;
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    if (token.type === 'html_inline' || token.type === 'html_block') {
      return parser.utils.unescapeAll(sanitizeHtml(token.content, { allowedTags: [], allowedAttributes: {} }));
    }
    return '';
  };
  return parser.parse(source, {}).map(content).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
