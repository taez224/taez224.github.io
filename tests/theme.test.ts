import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { THEME_BOOT, THEME_KEY, applyWithTransition, resolveTheme } from '../src/lib/theme.ts';
import { PALETTE, DARK_PALETTE } from '../src/lib/palette.ts';

const cases: { stored: string | null; systemDark: boolean; expected: 'light' | 'dark' }[] = [
  { stored: null, systemDark: false, expected: 'light' },
  { stored: null, systemDark: true, expected: 'dark' },
  { stored: 'light', systemDark: true, expected: 'light' },
  { stored: 'dark', systemDark: false, expected: 'dark' },
  { stored: '', systemDark: true, expected: 'dark' },
  { stored: 'sepia', systemDark: false, expected: 'light' },
  { stored: 'DARK', systemDark: false, expected: 'light' }
];

test('resolveTheme trusts only a stored light or dark and falls back to the system setting', () => {
  for (const { stored, systemDark, expected } of cases) {
    assert.equal(resolveTheme(stored, systemDark), expected, `${stored} · ${systemDark}`);
  }
});

// 부트 스크립트가 만지는 문서의 대역. <html>과 브라우저 UI 색 메타 둘만 둔다.
const bootDocument = () => {
  const element = { dataset: {} as Record<string, string> };
  const metas = [{ content: 'system-light' }, { content: 'system-dark' }];
  return { element, metas, document: { documentElement: element, querySelectorAll: () => metas } };
};

// 첫 페인트 전에 도는 인라인 스크립트는 모듈을 가져올 수 없어 같은 판정을 직접 쓴다. 두 판정이 갈라지면 첫 화면만 다른 색으로 그려진다.
test('the inline boot script decides the same theme as resolveTheme', () => {
  for (const { stored, systemDark, expected } of cases) {
    const { element, document } = bootDocument();
    const store = { getItem: (key: string) => (key === THEME_KEY ? stored : null) };
    const run = new Function('document', 'localStorage', 'matchMedia', THEME_BOOT);
    run(document, store, () => ({ matches: systemDark }));
    assert.equal(element.dataset.theme, expected, `${stored} · ${systemDark}`);
  }
});

// 메타는 시스템 설정에 따라 하나가 뽑힌다. 시스템과 다른 화면을 고른 독자에게 모듈 스크립트가 돌 때까지 휴대폰 상단 색이 본문과 달랐다.
test('the boot script paints both browser UI colors with the chosen theme', () => {
  for (const { stored, systemDark, expected } of cases) {
    const { metas, document } = bootDocument();
    const run = new Function('document', 'localStorage', 'matchMedia', THEME_BOOT);
    run(document, { getItem: () => stored }, () => ({ matches: systemDark }));
    const paper = expected === 'dark' ? DARK_PALETTE.paper : PALETTE.paper;
    assert.deepEqual(metas.map((meta) => meta.content), [paper, paper], `${stored} · ${systemDark}`);
  }
});

// 부트 스크립트는 페이지의 일반 스크립트로 돈다. 최상위에 이름을 선언하면 window의 속성이 되어 다른 스크립트와 부딪칠 수 있다.
// new Function 안에서는 var가 함수 범위라 이 누출이 드러나지 않으므로, 전역 문맥에서 직접 실행해 본다.
test('the boot script leaves no names on the global object', () => {
  const { element, document } = bootDocument();
  const context = vm.createContext({
    document,
    localStorage: { getItem: () => 'dark' },
    matchMedia: () => ({ matches: false })
  });
  const before = new Set(Object.keys(context));
  vm.runInContext(THEME_BOOT, context);
  assert.equal(element.dataset.theme, 'dark');
  assert.deepEqual(Object.keys(context).filter((key) => !before.has(key)), []);
});

test('the boot script keeps the system setting when the storage cannot be read', () => {
  const { element, document } = bootDocument();
  const store = { getItem: () => { throw new Error('denied'); } };
  const run = new Function('document', 'localStorage', 'matchMedia', THEME_BOOT);
  run(document, store, () => ({ matches: true }));
  assert.equal(element.dataset.theme, 'dark');
});

// 전환 효과는 버튼을 누를 때만이다. 화면 모드가 바뀌는 것 자체를 기다리게 만들면 안 되므로, 못 쓰는 환경에서는 그냥 바꾼다.
test('the switch animates only when the browser offers it and the reader allows motion', () => {
  const calls: string[] = [];
  const apply = () => calls.push('바꿈');
  const view = { startViewTransition: (run: () => void) => { calls.push('전환 시작'); run(); return {}; } };

  applyWithTransition(view, false, apply);
  assert.deepEqual(calls, ['전환 시작', '바꿈'], '전환을 거쳐 바꾼다');

  calls.length = 0;
  applyWithTransition(view, true, apply);
  assert.deepEqual(calls, ['바꿈'], '움직임 줄이기 설정에서는 전환 없이 바꾼다');

  calls.length = 0;
  applyWithTransition({}, false, apply);
  assert.deepEqual(calls, ['바꿈'], '전환을 지원하지 않는 브라우저에서도 바꾼다');
});
