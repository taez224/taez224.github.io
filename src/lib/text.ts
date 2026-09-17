import type { Token } from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { MARKDOWN_IMAGE_SIZE, stripObsidianComments, structureParser as parser } from './markdown.ts';

const stripBlockIds = (value: unknown) => String(value ?? '').replace(/(^|\s)\^[A-Za-z0-9-]+(?=\s|$)/g, '$1');

// 검색·요약용 텍스트를 한 번의 파싱으로 만든다. bodyText는 본문 전체이고 excerptText는 코드 블록과
// 본문 흐름의 제목 줄(`#`로 시작하는 ATX 제목)을 뺀 것이다. 요약은 후자를 잘라 만든다.
export interface TextAnalysis { bodyText: string; excerptText: string }

export function analyzeText(body: string): TextAnalysis {
  const source = stripObsidianComments(body)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*>?\s*\[![^\]]+\]\s*/gm, '> ')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target);
  const content = (token: Token): string => {
    if (token.type === 'inline') return (token.children ?? []).map(content).join('');
    if (token.type === 'text') return stripBlockIds(token.content);
    // 그림의 대체 텍스트에 붙은 Obsidian 크기 표기(`설명|300`)는 글이 아니므로 뺀다.
    if (token.type === 'image') {
      const size = token.content.match(MARKDOWN_IMAGE_SIZE);
      return size ? size[1] ?? '' : token.content;
    }
    if (['code_inline', 'fence', 'code_block'].includes(token.type)) return token.content;
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    if (token.type === 'html_inline' || token.type === 'html_block') {
      return parser.utils.unescapeAll(sanitizeHtml(token.content, { allowedTags: [], allowedAttributes: {} }));
    }
    return '';
  };
  const tokens = parser.parse(source, {});
  const full: string[] = [];
  const excerpt: string[] = [];
  let skippingHeading = false;
  for (const token of tokens) {
    const text = content(token);
    if (text) full.push(text);
    // 요약은 본문 흐름의 ATX 제목과 코드 블록을 뺀다. 제목 줄을 원문에서 지우던 규칙과 같은 대상이다.
    if (token.type === 'heading_open' && token.level === 0 && token.markup.startsWith('#')) skippingHeading = true;
    const isCode = token.type === 'fence' || token.type === 'code_block';
    if (text && !skippingHeading && !isCode) excerpt.push(text);
    if (token.type === 'heading_close' && token.level === 0) skippingHeading = false;
  }
  const join = (parts: string[]) => parts.join(' ').replace(/\s+/g, ' ').trim();
  return { bodyText: join(full), excerptText: join(excerpt) };
}
