import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DARK_PALETTE } from '../src/lib/palette.ts';

// 코드 강조의 토큰 색은 body.css가 유일한 출처다. DESIGN.md에는 코드 상자의 바탕과 기본 글자색만 두고,
// 토큰 색마다 대비를 맞췄는지는 여기서 CSS를 직접 읽어 밝은 화면과 어두운 화면 모두 검사한다.
const css = readFileSync(new URL('../src/styles/body.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// 어두운 화면은 두 갈래다. 선택이 없을 때의 미디어 쿼리와 독자가 고른 data-theme이다. 둘의 색이 갈라지면 한쪽만 옛 색으로 남는다.
const darkStart = css.search(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \.body pre \{/);
const chosenDark = css.split('\n').filter((line) => line.startsWith(':root[data-theme="dark"] .body ')).join('\n');
const blocks = { light: css.slice(0, darkStart), dark: css.slice(darkStart, css.indexOf('\n}\n', darkStart)) };
const TOKENS = ['comment', 'keyword', 'function', 'string', 'number', 'type', 'meta', 'tag', 'link', 'inserted'];

const channel = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const tokenColor = (block: string, name: string) => block.match(new RegExp(`\\.th-${name}\\b[^{]*\\{\\s*color:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
const box = (block: string) => {
  const rule = block.match(/\.body pre \{([^}]*)\}/)?.[1] ?? '';
  const background = rule.match(/background:\s*([^;]+);/)?.[1].trim();
  return { background: background === 'var(--paper-strong)' ? DARK_PALETTE['paper-strong'] : background, text: rule.match(/color:\s*(#[0-9a-f]{6})/)?.[1] };
};

test('both color schemes color every code token kind', () => {
  for (const [scheme, block] of Object.entries(blocks)) for (const name of TOKENS) assert.ok(tokenColor(block, name), `${scheme} .th-${name}`);
});

test('every code token and the base code text read at 4.5:1 on the code block in both color schemes', () => {
  for (const [scheme, block] of Object.entries(blocks)) {
    const { background, text } = box(block);
    assert.ok(background?.startsWith('#') && text, `${scheme} 코드 상자의 바탕과 글자색`);
    assert.ok(contrast(text!, background!) >= 4.5, `${scheme} 기본 글자 ${text}`);
    for (const name of TOKENS) {
      const color = tokenColor(block, name)!;
      assert.ok(contrast(color, background!) >= 4.5, `${scheme} ${name} ${color} ${contrast(color, background!).toFixed(2)}`);
    }
  }
});

test('the DESIGN.md code block tokens match the code box in body.css', () => {
  const yaml = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8').match(/^colors:\n((?: {2}.+\n)+)/m)?.[1] ?? '';
  const tokens = new Map([...yaml.matchAll(/^ {2}([\w-]+): '(#[0-9a-f]{6})'$/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual([tokens.get('code-bg'), tokens.get('code-text')], [box(blocks.light).background, box(blocks.light).text]);
  assert.deepEqual([tokens.get('code-bg-dark'), tokens.get('code-text-dark')], [box(blocks.dark).background, box(blocks.dark).text]);
});

test('the system and the chosen dark path declare the same code colors', () => {
  for (const name of TOKENS) assert.equal(tokenColor(chosenDark, name), tokenColor(blocks.dark, name), `.th-${name}`);
  assert.deepEqual(box(chosenDark), box(blocks.dark), '코드 상자의 바탕과 기본 글자색');
});
