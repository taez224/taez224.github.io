import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaRuleBody, ruleBody } from './css-blocks.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const siteCss = read('src/styles/site.css');

function sourceFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}
const styleText = (path: string) => (path.endsWith('.css') ? read(path) : [...read(path).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));
// px가 아닌 --s-* 토큰은 조용히 빼지 않고 멈춘다. 빠진 토큰은 DESIGN.md와 맞는지 보지 못한 채 통과하기 때문이다.
function spaceTokens(block: string): Map<string, number> {
  const tokens = new Map<string, number>();
  for (const [, name, value] of block.matchAll(/--s-([\w-]+):\s*([^;]+);/g)) {
    assert.match(value.trim(), /^[\d.]+px$/, `--s-${name}은 px 값이다`);
    tokens.set(name, parseFloat(value));
  }
  return tokens;
}

test('structural spacing tokens match DESIGN.md spacing at each width', () => {
  const yaml = read('DESIGN.md').match(/^spacing:\n((?: {2}.+\n)+)/m)?.[1] ?? '';
  const design = new Map([...yaml.matchAll(/^ {2}([\w-]+): ([\d.]+)px$/gm)].map((m) => [m[1], Number(m[2])]));
  const desktop = spaceTokens(ruleBody(siteCss, ':root'));
  // 같은 조건(max-width: 720px)의 블록이 파일에 둘 이상이라, :root 규칙을 가진 첫 블록을 읽는다.
  const mobile = spaceTokens(mediaRuleBody(siteCss, '(max-width: 720px)', ':root'));
  assert.ok(desktop.size > 0 && mobile.size > 0);
  for (const [name, value] of desktop) assert.equal(design.get(name), value, `DESIGN.md spacing.${name}`);
  for (const [name, value] of mobile) assert.equal(design.get(`${name}-mobile`), value, `DESIGN.md spacing.${name}-mobile`);
  // 반대 방향: 문서에만 있는 토큰은 CSS가 그 값을 선언하지 않는다는 뜻이다. -mobile은 모바일 :root에서, 나머지는 기본 :root에서 찾는다.
  for (const [name, value] of design) {
    const mobileName = name.endsWith('-mobile') ? name.slice(0, -'-mobile'.length) : undefined;
    const actual = mobileName === undefined ? desktop.get(name) : mobile.get(mobileName);
    assert.equal(actual, value, `CSS --s-${mobileName ?? name}(${mobileName === undefined ? '기본' : '모바일'}) for DESIGN.md spacing.${name}`);
  }
});

test('page shells read structural sizes from spacing tokens', () => {
  // 구조 크기를 다시 숫자로 적으면 토큰과 어긋나도 알 수 없다. 전환 폭(@media)과 :root 선언은 제외한다.
  const literals = [/min\(1180px/, /100% - (48|40)px/, /minmax\(0, 720px\)/, /\b310px\b/, /padding: (36|56|64)px 0 96px/];
  const found = sourceFiles('src', /\.(css|astro)$/).flatMap((path) => styleText(path).split('\n')
    .filter((line) => !/^\s*(@media|--s-)/.test(line) && literals.some((re) => re.test(line)))
    .map((line) => `${path}: ${line.trim().slice(0, 90)}`));
  assert.deepEqual(found, []);
});

test('breakpoints stay on the documented widths in CSS and scripts', () => {
  // 721과 1001은 720·1000의 짝이다. 그 폭보다 넓을 때만 적용하는 규칙(min-width)이 쓴다.
  const allowed = new Set([359, 360, 480, 720, 721, 1000, 1001, 1240]);
  // Astro 파일은 스타일 블록만 본다. 이미지 sizes 속성의 폭은 받을 이미지를 고르는 힌트라 전환 폭이 아니다.
  const text = (path: string) => (path.endsWith('.ts') ? read(path) : styleText(path));
  const found = sourceFiles('src', /\.(css|astro|ts)$/).flatMap((path) => [...text(path).matchAll(/\((?:min|max)-width:\s*([\d.]+)px\)/g)]
    .filter((m) => !allowed.has(Number(m[1]))).map((m) => `${path}: ${m[0]}`));
  assert.deepEqual(found, []);
});
