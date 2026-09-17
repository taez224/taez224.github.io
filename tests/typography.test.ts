import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const siteCss = read('src/styles/site.css');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.(css|astro)$/.test(name) ? [path] : [];
  });
}

// CSS 파일은 전체, Astro 파일은 <style> 블록만 스타일로 본다.
const styleText = (path: string) => (path.endsWith('.css') ? read(path) : [...read(path).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));

const typeTokens = (block: string) => new Map([...block.matchAll(/--t-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const px = (value: string) => (value.endsWith('rem') ? parseFloat(value) * 16 : NaN);

function designFontSizes(): Map<string, number> {
  const yaml = read('DESIGN.md').match(/^typography:\n([\s\S]*?)\n(?=\w)/m)?.[1] ?? '';
  return new Map([...yaml.matchAll(/^ {2}([\w-]+):\n(?: {4}.+\n)*? {4}fontSize: ([\d.]+)px/gm)].map((m) => [m[1], Number(m[2])]));
}

test('type role tokens are rem and match DESIGN.md typography at each width', () => {
  const design = designFontSizes();
  const desktop = typeTokens(siteCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '');
  assert.ok(desktop.size > 0);
  const checks: [string, Map<string, string>][] = [['', desktop]];
  for (const [query, suffix] of [['(max-width: 720px)', '-mobile'], ['(min-width: 721px) and (max-width: 1000px)', '-tablet']] as const) {
    const block = siteCss.match(new RegExp(`@media ${query.replace(/[()]/g, '\\$&')} \\{\\s*:root \\{([^}]*)\\}`))?.[1] ?? '';
    checks.push([suffix, typeTokens(block)]);
  }
  for (const [suffix, tokens] of checks) {
    for (const [name, value] of tokens) {
      assert.match(value, /^[\d.]+rem$/, `--t-${name}${suffix}`);
      assert.equal(design.get(name + suffix), px(value), `DESIGN.md typography.${name}${suffix}`);
    }
  }
});

test('font sizes outside :root use role tokens instead of px', () => {
  // 그래프 SVG 글자는 엔진이 px 폭으로 이름 배치를 계산하므로 px로 둔다.
  const allowed = [/\.graph \[data-labels\]/, /\.node text/];
  const found = sourceFiles('src').flatMap((path) => styleText(path).split('\n')
    .filter((line) => /font-size:\s*[^;]*\d+(\.\d+)?px/.test(line) && !/^\s*--t-/.test(line) && !allowed.some((re) => re.test(line)))
    .map((line) => `${path}: ${line.trim().slice(0, 80)}`));
  assert.deepEqual(found, []);
});

test('font weights stay on the 400, 600 and 700 steps', () => {
  const found = sourceFiles('src').flatMap((path) => [...styleText(path).matchAll(/font-weight:\s*(\d+)/g)]
    .filter((m) => !['400', '600', '700'].includes(m[1])).map((m) => `${path}: ${m[1]}`));
  assert.deepEqual(found, []);
});
