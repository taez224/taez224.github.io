import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// 브라우저 검사는 모두 fixtures.ts의 test를 쓴다. @playwright/test에서 바로 가져오면 외부 요청 차단이 빠진 채로 실행된다.
test('every browser spec takes its test from the shared fixture', () => {
  const dir = new URL('./browser/', import.meta.url);
  const specs = readdirSync(dir).filter((name) => name.endsWith('.spec.ts'));
  assert.ok(specs.length > 0, '브라우저 검사 파일이 있다');
  for (const name of specs) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    assert.match(source, /from '\.\/fixtures\.ts'/, `${name}가 공통 픽스처를 쓴다`);
    assert.doesNotMatch(source, /from '@playwright\/test'/, `${name}가 @playwright/test를 바로 가져오지 않는다`);
  }
});

// 어두운 화면 프로젝트는 @both-themes 태그가 붙은 검사만 돈다. 칠한 모양을 단언하는 검사에서 태그를 빠뜨리면
// 어두운 화면 쪽 단언이 한 번도 돌지 않은 채 통과하므로, spec 파일을 검사 단위로 나눠 태그가 있는지 훑는다.
// 이 검사는 휴리스틱이라 좌표 같은 다른 방법으로 칠한 모양을 재는 검사는 잡지 못한다. 그런 검사는 목적을 보고 직접 붙인다.
const PAINT_PROPERTIES = ['color', 'background-color', 'border-color', 'outline-style', 'outline-color', 'outline-width', 'opacity', 'stroke', 'fill', 'filter', 'backdrop-filter', 'mask-image'];
const PAINT_READS = ['color', 'backgroundColor', 'borderColor', 'stroke', 'fill', 'opacity', 'outlineStyle', 'outlineColor', 'maskImage', 'backdropFilter'];
const PAINT_PATTERNS: [string, RegExp][] = [
  ['toHaveCSS', new RegExp(`toHaveCSS\\(\\s*['"\`](?:${PAINT_PROPERTIES.join('|')})['"\`]`)],
  ['계산된 스타일 읽기', new RegExp(`\\.(?:${PAINT_READS.join('|')})\\b(?!\\s*\\()`)],
  ['systemDark', /\bsystemDark\b/]
];
const UNIT_START = /^\s*test\(/;
// 검사 안의 들여쓴 for 반복문에서는 끊지 않는다. 들여쓰지 않은 for와 최상위 선언만 검사 밖이다.
const UNIT_END = /^(?:\s*test\(|\s*test\.describe\(|for \(|(?:const|let|function|async function|export)\b)/;

type BrowserTestUnit = { title: string; tagged: boolean; text: string };

function browserTestUnits(source: string): BrowserTestUnit[] {
  const units: BrowserTestUnit[] = [];
  let current: string[] | null = null;
  const close = () => {
    if (!current) return;
    const text = current.join('\n');
    const head = text.slice(0, text.indexOf('=>'));
    units.push({ title: head.match(/test\(\s*(['"`])(.*?)\1/)?.[2] ?? head, tagged: /\{\s*tag:\s*BOTH_THEMES\b/.test(head), text });
    current = null;
  };
  for (const line of source.split('\n')) {
    if (UNIT_END.test(line)) close();
    if (UNIT_START.test(line)) current = [];
    current?.push(line);
  }
  close();
  return units;
}

const browserSpecs = () => {
  const dir = new URL('./browser/', import.meta.url);
  return readdirSync(dir).filter((name) => name.endsWith('.spec.ts')).map((name) => ({ name, source: readFileSync(new URL(name, dir), 'utf8') }));
};

test('browser tests that assert painted looks or the system theme carry the both-themes tag', () => {
  const found: string[] = [];
  let units = 0, tagged = 0;
  for (const { name, source } of browserSpecs()) {
    for (const unit of browserTestUnits(source)) {
      units += 1;
      if (unit.tagged) tagged += 1;
      const reasons = PAINT_PATTERNS.filter(([, pattern]) => pattern.test(unit.text)).map(([reason]) => reason);
      if (reasons.length > 0 && !unit.tagged) found.push(`${name} '${unit.title}': 칠한 모양이나 시스템 테마를 다루는데(${reasons.join(', ')}) { tag: BOTH_THEMES }가 없다`);
    }
  }
  assert.ok(units > 0, '검사 단위를 하나도 찾지 못했다');
  assert.ok(tagged > 0, '태그가 붙은 검사가 하나도 없다');
  assert.deepEqual(found, []);
});

test('browser specs read the system theme through the systemDark fixture only', () => {
  const found = browserSpecs().filter(({ source }) => /project\.use\.colorScheme/.test(source)).map(({ name }) => `${name}가 project.use.colorScheme을 직접 읽는다. systemDark 픽스처를 쓴다`);
  assert.deepEqual(found, []);
});
