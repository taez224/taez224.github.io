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
// 한 줄 규칙이 대부분이라 가장 안쪽 블록만 고르면 @media 안의 규칙도 선택자와 선언이 짝지어진다.
const rules = (path: string) => [...styleText(path).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ path, selector: m[1].trim(), body: m[2] }));
const allRules = sourceFiles('src', /\.(css|astro)$/).filter((path) => !path.endsWith('fonts.css')).flatMap(rules);
// 아이콘을 CSS 선으로 그린 곳은 아이콘 크기에 맞춘 곡률과 선이라 모양 토큰 대상이 아니다.
const iconDrawings = /visibility-mark::|task-list-item-checkbox|sheet-grip::before|summary::after/;

test('border radii stay on the DESIGN.md rounded tokens', () => {
  const yaml = read('DESIGN.md').match(/^rounded:\n((?: {2}.+\n)+)/m)?.[1] ?? '';
  const allowed = new Set([...yaml.matchAll(/: (\d+px)$/gm)].map((m) => m[1]).concat('50%'));
  const found = allRules.filter((rule) => !iconDrawings.test(rule.selector)).flatMap((rule) => [...rule.body.matchAll(/border-radius:\s*([^;]+)/g)]
    .filter((m) => m[1].trim().split(/\s+/).some((value) => value !== '0' && !allowed.has(value)))
    .map((m) => `${rule.path}: ${rule.selector} { border-radius: ${m[1].trim()} }`));
  assert.ok(allowed.has('4px') && allowed.has('6px'));
  assert.deepEqual(found, []);
});

// 시간 토큰을 ms 숫자로 바꾼다. 150ms, 0.15s, .15s는 같은 값이다.
const toMs = (amount: string, unit: string) => Math.round(parseFloat(amount) * (unit === 's' ? 1000 : 1) * 1000) / 1000;

test('state transitions use the documented durations', () => {
  // 상태 변화 150ms, 모바일 지도 시트 200ms. 움직임 줄이기 설정은 0s로 끈다.
  const allowed = new Set([0, 150, 200]);
  const found = allRules.flatMap((rule) => [...rule.body.matchAll(/(?<![\w-])(transition(?:-duration)?):\s*([^;]+)/g)].flatMap((m) => {
    // cubic-bezier()와 var() 안의 숫자는 시간이 아니다. 목록의 항목마다 첫 시간값이 지속 시간이고, 단축형의 두 번째 시간값은 지연이다.
    const items = m[2].replace(/\([^)]*\)/g, '').split(',');
    return items.flatMap((item) => {
      const times = [...item.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map((t) => toMs(t[1], t[2]));
      return m[1] === 'transition' ? times.slice(0, 1) : times;
    }).filter((ms) => !allowed.has(ms)).map((ms) => `${rule.path}: ${rule.selector} (${ms}ms)`);
  }));
  assert.deepEqual(found, []);
});

test('thick one-sided borders stay on quotes and the table of contents rail', () => {
  // 카드·안내 상자의 한쪽 막대는 장식으로 읽힌다. 인용문과 목차 레일(사이드바, 한 열 화면의 목차 판)만 관례로 남긴다.
  const allowed = /blockquote|\.(?:toc-)?rail\b/;
  const found = allRules.filter((rule) => !allowed.test(rule.selector) && !iconDrawings.test(rule.selector)).flatMap((rule) => [...rule.body.matchAll(/border-(?:left|right)(?:-width)?:\s*(\d*\.?\d+)px/g)]
    .filter((m) => Number(m[1]) > 1)
    .map((m) => `${rule.path}: ${rule.selector} (${m[0]})`));
  assert.deepEqual(found, []);
});

test('overlays separate layers with borders and backdrops instead of drop shadows', () => {
  const found = allRules.flatMap((rule) => [...rule.body.matchAll(/box-shadow:\s*([^;]+)/g)]
    .filter((m) => m[1].trim() !== 'none' && !/\binset\b/.test(m[1]))
    .map((m) => `${rule.path}: ${rule.selector} (${m[1].trim()})`));
  assert.deepEqual(found, []);
});
