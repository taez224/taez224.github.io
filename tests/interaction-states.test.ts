import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function sourceFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}
const styleText = (path: string) => (path.endsWith('.css') ? read(path) : [...read(path).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));

// 중괄호 깊이를 따라가며 규칙마다 바깥 @규칙의 머리를 함께 넘긴다. 한 줄 규칙과 중첩된 @media를 모두 다룬다.
function selectorsWithParents(css: string) {
  const out: { selector: string; parents: string[] }[] = [];
  const stack: string[] = [];
  let prelude = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') { out.push({ selector: prelude.trim(), parents: [...stack] }); stack.push(prelude.trim()); prelude = ''; }
    else if (ch === '}') { stack.pop(); prelude = ''; }
    else if (ch === ';') prelude = '';
    else prelude += ch;
  }
  return out;
}

test('hover styles apply only on devices that can hover', () => {
  // 터치 기기는 탭한 요소에 :hover가 남는다. 호버 규칙은 (hover: hover) 안에 두고, 포커스·선택 상태는 따로 적는다.
  const found = sourceFiles('src', /\.(css|astro)$/).flatMap((path) => selectorsWithParents(styleText(path))
    .filter(({ selector, parents }) => selector.includes(':hover') && !parents.some((p) => /^@media\b.*\(hover:\s*hover\)/.test(p)))
    .map(({ selector }) => `${path}: ${selector}`));
  assert.deepEqual(found, []);
});

test('the copy button hover plate fits inside the code head row', () => {
  // 누르는 영역(44px)에 판을 깔면 34px 머리 줄 위아래로 넘친다. 판은 아이콘 둘레의 작은 상자에만 칠한다.
  const css = read('src/styles/body.css');
  const px = (rule: string, prop: string) => Number(css.match(new RegExp(`\\n${rule.replace(/[.[\]]/g, '\\$&')} \\{[^}]*?${prop}:\\s*(\\d+)px`))?.[1] ?? NaN);
  const head = px('.body .code-head', 'min-height');
  const plate = px('.body .code-copy-plate', 'height');
  assert.ok(Number.isFinite(head) && Number.isFinite(plate), `머리 줄 ${head}px, 판 ${plate}px`);
  assert.ok(plate < head, `판 ${plate}px가 머리 줄 ${head}px보다 작다`);
  assert.doesNotMatch(css, /\.code-copy:hover \{[^}]*background/, '버튼 전체에는 호버 판을 깔지 않는다');
});
