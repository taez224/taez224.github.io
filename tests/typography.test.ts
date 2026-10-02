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

const MOBILE = '(max-width: 720px)';
const TABLET = '(min-width: 721px) and (max-width: 1000px)';

const desktopTokens = () => typeTokens(siteCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '');

// 미디어 쿼리와 :root 사이에 주석이 있어도 블록을 찾는다. 못 찾으면 그 폭의 검사가 통째로 빠지므로 여기서 멈춘다.
function mediaTokens(query: string): Map<string, string> {
  const block = siteCss.match(new RegExp(`@media ${query.replace(/[()]/g, '\\$&')} \\{\\s*(?:/\\*[\\s\\S]*?\\*/\\s*)*:root \\{([^}]*)\\}`))?.[1] ?? '';
  const tokens = typeTokens(block);
  assert.ok(tokens.size > 0, `${query} 블록에서 글자 토큰을 읽지 못했다`);
  return tokens;
}

test('type role tokens are rem and match DESIGN.md typography at each width', () => {
  const design = designFontSizes();
  const desktop = desktopTokens();
  assert.ok(desktop.size > 0);
  const checks: [string, Map<string, string>][] = [['', desktop], ['-mobile', mediaTokens(MOBILE)], ['-tablet', mediaTokens(TABLET)]];
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
  // @font-face의 font-weight는 글꼴 파일이 지원하는 범위(가변 글꼴의 45 920 등)라 요소에 쓰는 굵기가 아니다.
  const found = sourceFiles('src').flatMap((path) => [...styleText(path).replace(/@font-face\s*\{[^}]*\}/g, '').matchAll(/font-weight:\s*(\d+)/g)]
    .filter((m) => !['400', '600', '700'].includes(m[1])).map((m) => `${path}: ${m[1]}`));
  assert.deepEqual(found, []);
});
