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

test('state transitions use the documented durations', () => {
  // 상태 변화 150ms, 모바일 지도 시트 200ms. 움직임 줄이기 설정은 0s로 끈다.
  const allowed = new Set(['.15s', '.2s', '0s']);
  const found = allRules.flatMap((rule) => [...rule.body.matchAll(/transition(?:-duration)?:\s*([^;]+)/g)]
    .flatMap((m) => [...m[1].matchAll(/(?<![\w(,.])(\d*\.?\d+m?s)\b/g)].map((t) => t[1]))
    .filter((duration) => !allowed.has(duration))
    .map((duration) => `${rule.path}: ${rule.selector} (${duration})`));
  assert.deepEqual(found, []);
});

test('thick one-sided borders stay on quotes and the table of contents rail', () => {
  // 카드·안내 상자의 한쪽 막대는 장식으로 읽힌다. 인용문과 목차 레일만 관례로 남긴다.
  const allowed = /blockquote|\.rail\b/;
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
