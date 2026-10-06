// CSS 문자열에서 중괄호 깊이를 따라 블록을 읽는 테스트용 도우미다. *.test.ts가 아니라 `npm test`가 직접 실행하지 않는다.
// 정규식으로 `@media ... { :root {` 같은 모양을 찾으면 사이에 주석이 끼거나 같은 조건의 블록이 둘 이상일 때 엉뚱한 블록을
// 읽거나 아무것도 찾지 못한 채 통과한다. 여기서는 찾지 못하면 항상 예외를 던져 검사가 조용히 비지 않게 한다.

export type Block = { prelude: string; body: string };

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

export const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// 한 층의 블록을 순서대로 돌려준다. 안쪽 중괄호는 body에 그대로 남는다. 따옴표 안의 중괄호는 세지 않는다.
export function parseBlocks(css: string): Block[] {
  const source = stripComments(css);
  const blocks: Block[] = [];
  let depth = 0, start = 0, prelude = '', quote = '';
  for (let at = 0; at < source.length; at += 1) {
    const ch = source[at];
    if (quote) { if (ch === quote && source[at - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') {
      if (depth === 0) { prelude = collapse(source.slice(start, at)); start = at + 1; }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { blocks.push({ prelude, body: source.slice(start, at) }); start = at + 1; }
      if (depth < 0) throw new Error('닫는 중괄호가 짝 없이 나왔다');
    } else if (ch === ';' && depth === 0) start = at + 1; // @import 같은 블록 없는 규칙
  }
  if (depth !== 0) throw new Error('여는 중괄호가 닫히지 않았다');
  return blocks;
}

// 괄호 밖의 쉼표에서만 선택자를 나눈다. `:is(.a, .b)` 안의 쉼표는 나누지 않는다.
export function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let at = 0; at < prelude.length; at += 1) {
    const ch = prelude[at];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) { parts.push(collapse(prelude.slice(start, at))); start = at + 1; }
  }
  parts.push(collapse(prelude.slice(start)));
  return parts.filter(Boolean);
}

// 선택자의 마지막 복합 선택자다. 괄호와 대괄호 안의 공백과 결합자는 나누지 않는다.
export function lastCompound(selector: string): string {
  let depth = 0, cut = 0;
  for (let at = 0; at < selector.length; at += 1) {
    const ch = selector[at];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(ch)) cut = at + 1;
  }
  return selector.slice(cut);
}

// 가장 안쪽 규칙을 문서 순서대로 평탄화한다. @media 같은 바깥 규칙은 건너뛰고 그 안의 규칙만 담는다.
export function flatRules(css: string): { selectors: string[]; body: string }[] {
  return parseBlocks(css).flatMap(({ prelude, body }) => body.includes('{')
    ? flatRules(body)
    : [{ selectors: splitSelectors(prelude), body }]);
}

// 이 조건의 @media 블록 본문을 모두 문서 순서대로 돌려준다. 조건의 공백과 주석 위치는 영향을 주지 않는다.
// 같은 조건의 블록이 여럿일 수 있어(예: max-width: 720px가 파일에 두 번 나온다) 하나로 고르지 않고 모두 돌려준다.
export function mediaBodies(css: string, query: string): string[] {
  const wanted = collapse(`@media ${query}`);
  const found = parseBlocks(css).filter(({ prelude }) => prelude === wanted).map(({ body }) => body);
  if (found.length === 0) throw new Error(`${wanted} 블록을 찾지 못했다`);
  return found;
}

// 최상위(바깥 @규칙 밖)에서 선택자가 정확히 같은 첫 규칙의 본문이다. 쉼표로 이은 선택자는 부분마다 비교한다.
export function ruleBody(css: string, selector: string): string {
  const hit = parseBlocks(css).find(({ prelude }) => splitSelectors(prelude).includes(selector));
  if (!hit) throw new Error(`${selector} 규칙을 찾지 못했다`);
  return hit.body;
}

// 이 조건의 @media 블록들 가운데 직계 자식으로 선택자가 정확히 같은 규칙을 가진 첫 블록의 그 규칙 본문이다.
// 같은 조건의 블록이 여럿이어도 그 규칙을 가진 쪽을 문서 순서대로 찾는다.
export function mediaRuleBody(css: string, query: string, selector: string): string {
  for (const body of mediaBodies(css, query)) {
    const hit = parseBlocks(body).find(({ prelude }) => splitSelectors(prelude).includes(selector));
    if (hit) return hit.body;
  }
  throw new Error(`@media ${query} 안에서 ${selector} 규칙을 찾지 못했다`);
}
