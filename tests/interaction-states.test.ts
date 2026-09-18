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

test('search results are clickable across the whole row', () => {
  // 한 줄짜리 결과의 제목 링크는 27.75px이라 44px 목표에 못 미친다. 링크의 ::after로 줄 전체를 덮어 누르는 영역만 넓힌다.
  const css = read('src/styles/site.css');
  const row = css.match(/\n\.search-item \{([^}]+)\}/)?.[1] ?? '';
  const stretch = css.match(/\n\.search-item a::after \{([^}]+)\}/)?.[1] ?? '';
  assert.match(row, /position:\s*relative/);
  assert.match(stretch, /position:\s*absolute/);
  assert.match(stretch, /inset:\s*0/);
});
