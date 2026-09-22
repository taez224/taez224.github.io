import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_BOOT, THEME_KEY, resolveTheme } from '../src/lib/theme.ts';

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
