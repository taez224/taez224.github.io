import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE, DARK_PALETTE } from '../src/lib/palette.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function rootVariables(css: string): Map<string, string> {
  const block = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|astro|css)$/.test(name) ? [path] : [];
  });
}

test('site.css :root declares every palette color with the same value', () => {
  const vars = rootVariables(read('src/styles/site.css'));
  for (const [name, value] of Object.entries(PALETTE)) assert.equal(vars.get(name), value, `--${name}`);
});

test('site.css declares the dark palette under prefers-color-scheme: dark with the same values', () => {
  const block = read('src/styles/site.css').match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? '';
  const vars = new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
  assert.equal(vars.size > 0, true, '어두운 화면 :root 블록이 있다');
  for (const [name, value] of Object.entries(DARK_PALETTE)) assert.equal(vars.get(name), value, `--${name}`);
  assert.equal(vars.get('accent'), DARK_PALETTE.ink, 'accent는 어두운 화면에서도 먹색 역할과 같다');
});

test('DESIGN.md color tokens match the palette', () => {
  const yaml = read('DESIGN.md').match(/^colors:\n((?: {2}.+\n)+)/m)?.[1] ?? '';
  const tokens = new Map([...yaml.matchAll(/^ {2}([\w-]+): '(#[0-9a-f]{6})'$/gm)].map((m) => [m[1], m[2]]));
  // DESIGN.md는 먹색을 공식 포맷의 역할 이름인 primary로 적는다.
  assert.equal(tokens.get('primary'), PALETTE.ink);
  for (const [name, value] of Object.entries(PALETTE)) if (tokens.has(name)) assert.equal(tokens.get(name), value, name);
  // 어두운 화면 토큰은 같은 이름에 -dark를 붙인다.
  assert.equal(tokens.get('primary-dark'), DARK_PALETTE.ink);
  for (const [name, value] of Object.entries(DARK_PALETTE)) if (tokens.has(`${name}-dark`)) assert.equal(tokens.get(`${name}-dark`), value, `${name}-dark`);
});

test('palette hex values are written only in palette.ts and site.css', () => {
  const allowed = new Set(['src/lib/palette.ts', 'src/styles/site.css']);
  const values = new Set<string>([...Object.values(PALETTE), ...Object.values(DARK_PALETTE)]);
  const copies = sourceFiles('src').filter((path) => !allowed.has(path)).flatMap((path) =>
    [...read(path).matchAll(/#[0-9a-fA-F]{6}\b/g)].filter((m) => values.has(m[0].toLowerCase())).map((m) => `${relative('.', path)}: ${m[0]}`));
  assert.deepEqual(copies, []);
});

test('the retired ink #242720 does not come back as hex or rgb', () => {
  const copies = sourceFiles('src').filter((path) => /#242720|rgba?\(\s*36\s*,\s*39\s*,\s*32/i.test(read(path)));
  assert.deepEqual(copies, []);
});
