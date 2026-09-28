import type { Token } from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { MARKDOWN_IMAGE_SIZE, TASK_MARKER, stripObsidianComments, structureParser as parser } from './markdown.ts';

const stripBlockIds = (value: unknown) => String(value ?? '').replace(/(^|\s)\^[A-Za-z0-9-]+(?=\s|$)/g, '$1');

// 검색·요약용 텍스트를 한 번의 파싱으로 만든다. bodyText는 본문 전체이고 excerptText는 코드 블록과
// 본문 흐름의 제목 줄(`#`로 시작하는 ATX 제목), 각주를 뺀 것이다. 요약은 후자를 잘라 만든다.
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
  // 각주 목록은 문서 끝에 모인다. 검색에는 넣되 요약은 본문 흐름만으로 만든다.
  let inFootnotes = false;
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'footnote_block_open') inFootnotes = true;
    let text = content(token);
    // 할 일 목록 항목의 `[ ]`·`[x]` 표시는 글이 아니므로 뺀다. 이스케이프 여부는 원문(token.content)으로 가린다.
    if (token.type === 'inline' && tokens[index - 1]?.type === 'paragraph_open' && tokens[index - 2]?.type === 'list_item_open'
      && TASK_MARKER.test(token.content)) text = text.replace(TASK_MARKER, '');
    if (text) full.push(text);
    // 요약은 본문 흐름의 ATX 제목과 코드 블록을 뺀다. 제목 줄을 원문에서 지우던 규칙과 같은 대상이다.
    if (token.type === 'heading_open' && token.level === 0 && token.markup.startsWith('#')) skippingHeading = true;
    const isCode = token.type === 'fence' || token.type === 'code_block';
    if (text && !skippingHeading && !isCode && !inFootnotes) excerpt.push(text);
    if (token.type === 'heading_close' && token.level === 0) skippingHeading = false;
  }
  const join = (parts: string[]) => parts.join(' ').replace(/\s+/g, ' ').trim();
  return { bodyText: join(full), excerptText: join(excerpt) };
}

// 읽는 시간(분). 한글·한자·가나는 음절(글자) 단위로 분당 450자, 영문·숫자는 단어 단위로 분당 200단어로 센다.
// 전체 글자 수를 600으로 나누던 방식은 코드와 영문을 글자마다 한 음절처럼 세서 코드가 많은 글을 두세 배로 부풀렸다.
// 한글 설명문의 묵독 속도는 쉬운 문장 기준 분당 약 550음절(대한안과학회지 2016, 송지호 외)이고, 설명·논증 글은 그보다 느리므로
// 450을 쓴다. 이전 방식이 공백을 포함해 한국어 글에 주던 결과와도 가깝다. 코드 블록은 영문 단어로 함께 센다.
const READING_SYLLABLES_PER_MINUTE = 450;
const READING_WORDS_PER_MINUTE = 200;
export function readingMinutes(text: string): number {
  const syllables = text.match(/[가-힣぀-ヿ一-鿿]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z0-9]+(?:['’._-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return Math.max(1, Math.round(syllables / READING_SYLLABLES_PER_MINUTE + words / READING_WORDS_PER_MINUTE));
}
