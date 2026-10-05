import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE, DARK_PALETTE } from '../src/lib/palette.ts';
import { flatRules, mediaRuleBody, ruleBody } from './css-blocks.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function rootVariables(css: string): Map<string, string> {
  return new Map([...ruleBody(css, ':root').matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
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
  // accent는 이름만 남은 토큰이고 값은 먹색이다. 어두운 화면 쪽과 함께 검사한다.
  assert.equal(vars.get('accent'), PALETTE.ink, 'accent는 먹색과 같다');
  // 테마를 지정한 도표의 판은 화면 모드와 상관없이 각 모드의 paper-strong이다. 판 색을 바꾸면 이 값도 따라가야 한다.
  assert.equal(vars.get('diagram-plate-light'), PALETTE['paper-strong'], '--diagram-plate-light');
  assert.equal(vars.get('diagram-plate-dark'), DARK_PALETTE['paper-strong'], '--diagram-plate-dark');
});

// 어두운 화면은 두 경로로 들어온다. 독자가 고른 data-theme과, 선택이 없을 때의 시스템 설정이다. 두 블록의 값이 갈라지면 한쪽만 옛 색으로 남는다.
test('site.css declares the same dark palette for the chosen theme and the system setting', () => {
  const css = read('src/styles/site.css');
  const blocks = [
    mediaRuleBody(css, '(prefers-color-scheme: dark)', ':root:not([data-theme])'),
    ruleBody(css, ':root[data-theme="dark"]')
  ];
  for (const block of blocks) {
    const vars = new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
    assert.equal(vars.size > 0, true, '어두운 화면 블록이 있다');
    for (const [name, value] of Object.entries(DARK_PALETTE)) assert.equal(vars.get(name), value, `--${name}`);
    assert.equal(vars.get('accent'), DARK_PALETTE.ink, 'accent는 어두운 화면에서도 먹색 역할과 같다');
  }
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

// 팔레트 색은 hex 말고도 rgb()(쉼표·공백 문법)나 data URI 안의 %23hex로 옮겨 적을 수 있다. 찾은 값은 #rrggbb로 맞춰 돌려준다.
const toHex = (r: string, g: string, b: string) => `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
function colorLiterals(text: string): { at: number; value: string }[] {
  return [
    ...[...text.matchAll(/(?:#|%23)([0-9a-fA-F]{6})\b/g)].map((m) => ({ at: m.index!, value: `#${m[1].toLowerCase()}` })),
    ...[...text.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/g)].map((m) => ({ at: m.index!, value: toHex(m[1], m[2], m[3]) }))
  ];
}

// CSS 변수를 쓸 수 없어 팔레트 값을 옮겨 적은 자리다. 구형 브라우저의 ::backdrop은 문서의 변수를 물려받지 않고,
// data URI 안의 SVG는 페이지의 변수를 읽지 못한다. 선택자가 정확히 같은 규칙의 본문에서 첫 색이 팔레트와 같아야 한다.
// 같은 선택자 문자열이 어두운 화면 규칙(`:root[data-theme="dark"] .search::backdrop`)에도 부분으로 들어 있어, 글자 위치로 찾으면 순서에 기댄다.
const COPIES = [
  { file: 'src/styles/site.css', selector: '.search::backdrop', color: PALETTE.ink },
  { file: 'src/styles/body.css', selector: '.diagram-viewer::backdrop', color: PALETTE.ink },
  { file: 'src/styles/body.css', selector: '.body .task-list-item-checkbox:checked', color: PALETTE['paper-strong'] },
  { file: 'src/styles/body.css', selector: ':root:not([data-theme]) .body .task-list-item-checkbox:checked', color: DARK_PALETTE.paper },
  { file: 'src/styles/body.css', selector: ':root[data-theme="dark"] .body .task-list-item-checkbox:checked', color: DARK_PALETTE.paper }
];
function copyLiteral({ file, selector }: (typeof COPIES)[number]) {
  const rule = flatRules(read(file)).find(({ selectors }) => selectors.includes(selector));
  return { found: Boolean(rule), literal: rule ? colorLiterals(rule.body).sort((a, b) => a.at - b.at)[0] : undefined };
}

test('palette values copied where CSS variables cannot reach still match the palette', () => {
  for (const copy of COPIES) {
    const { found, literal } = copyLiteral(copy);
    assert.ok(found, `${copy.file}: ${copy.selector}`);
    assert.equal(literal?.value, copy.color, `${copy.file}: ${copy.selector}`);
  }
});

test('palette colors are written only in palette.ts and site.css, in any notation', () => {
  const allowed = new Set(['src/lib/palette.ts', 'src/styles/site.css']);
  const values = new Set<string>([...Object.values(PALETTE), ...Object.values(DARK_PALETTE)]);
  // 등록한 옮겨 적기는 파일과 값의 개수로 뺀다. 같은 값이 등록한 수보다 많이 나오면 그만큼이 등록 밖의 복사본이다.
  const declared = new Map<string, number>();
  for (const copy of COPIES) { const key = `${copy.file}|${copyLiteral(copy).literal?.value}`; declared.set(key, (declared.get(key) ?? 0) + 1); }
  const copies = sourceFiles('src').filter((path) => !allowed.has(path)).flatMap((path) => {
    const spare = new Map(declared);
    return colorLiterals(read(path)).filter((c) => values.has(c.value)).filter((c) => {
      const key = `${path}|${c.value}`, left = spare.get(key) ?? 0;
      if (left > 0) { spare.set(key, left - 1); return false; }
      return true;
    }).map((c) => `${relative('.', path)}: ${c.value}`);
  });
  assert.deepEqual(copies, []);
});

test('the retired ink #242720 does not come back as hex or rgb', () => {
  const copies = sourceFiles('src').filter((path) => /(?:#|%23)242720|rgba?\(\s*36[\s,]+39[\s,]+32\b/i.test(read(path)));
  assert.deepEqual(copies, []);
});

// 링크 글자는 본문과 같은 먹색이라 링크임을 알리는 단서가 밑줄 하나다. 밑줄이 바탕과 3:1에 못 미치면 링크가 본문에 묻힌다.
// 밑줄은 먹색을 투명과 섞은 값이라 놓이는 바탕에 따라 결과가 달라지므로, 종이와 올라온 판 양쪽에서 계산한다.
test('the link underline, the only cue of an ink-colored link, keeps 3:1 against both papers in both themes', () => {
  const share = Number(rootVariables(read('src/styles/site.css')).get('link-underline')?.match(/var\(--ink\)\s*([\d.]+)%/)?.[1]) / 100;
  assert.ok(share > 0 && share <= 1, '--link-underline은 먹색을 투명과 섞은 값이다');
  const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const luminance = (rgb: number[]) => { const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a: number[], b: number[]) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const [name, palette] of [['밝은 화면', PALETTE], ['어두운 화면', DARK_PALETTE]] as const) {
    for (const ground of ['paper', 'paper-strong'] as const) {
      const ink = channels(palette.ink), base = channels(palette[ground]);
      const underline = ink.map((value, at) => value * share + base[at] * (1 - share));
      assert.ok(contrast(underline, base) >= 3, `${name} ${ground}: ${contrast(underline, base).toFixed(2)}`);
    }
  }
});
