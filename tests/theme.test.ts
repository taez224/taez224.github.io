import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_BOOT, THEME_KEY, applyWithTransition, resolveTheme } from '../src/lib/theme.ts';

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

// 첫 페인트 전에 도는 인라인 스크립트는 모듈을 가져올 수 없어 같은 판정을 직접 쓴다. 두 판정이 갈라지면 첫 화면만 다른 색으로 그려진다.
test('the inline boot script decides the same theme as resolveTheme', () => {
  for (const { stored, systemDark, expected } of cases) {
    const element = { dataset: {} as Record<string, string> };
    const store = { getItem: (key: string) => (key === THEME_KEY ? stored : null) };
    const run = new Function('document', 'localStorage', 'matchMedia', THEME_BOOT);
    run({ documentElement: element }, store, () => ({ matches: systemDark }));
    assert.equal(element.dataset.theme, expected, `${stored} · ${systemDark}`);
  }
});

test('the boot script keeps the system setting when the storage cannot be read', () => {
  const element = { dataset: {} as Record<string, string> };
  const store = { getItem: () => { throw new Error('denied'); } };
  const run = new Function('document', 'localStorage', 'matchMedia', THEME_BOOT);
  run({ documentElement: element }, store, () => ({ matches: true }));
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
