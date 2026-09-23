export type Theme = 'light' | 'dark';
// 독자가 버튼으로 고른 값만 담는다. 고르지 않은 상태는 저장하지 않으므로, 저장된 값이 없으면 시스템 설정을 따른다.
export const THEME_KEY = 'theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  return stored === 'light' || stored === 'dark' ? stored : systemDark ? 'dark' : 'light';
}

// 버튼을 누를 때만 두 화면을 짧게 겹쳐 바꾼다. 브라우저가 이 전환을 모르거나 독자가 움직임을 줄였으면 기다리지 않고 바로 바꾼다.
// 전환은 보기 좋으라고 있는 것이므로, 없다고 해서 화면 모드가 바뀌지 않으면 안 된다.
export function applyWithTransition(view: { startViewTransition?: (update: () => void) => unknown }, motionReduced: boolean, apply: () => void): void {
  if (motionReduced || typeof view.startViewTransition !== 'function') { apply(); return; }
  view.startViewTransition(apply);
}

// 첫 페인트 전에 <head>에서 도는 인라인 스크립트다. 모듈을 가져올 수 없어 resolveTheme과 같은 판정을 직접 쓰고,
// tests/theme.test.ts가 두 판정이 갈라지지 않는지 검사한다. 저장소 접근이 막히면 시스템 설정으로 그린다.
// data-js는 스크립트가 도는지 CSS에 알리는 표시다. 스크립트가 채우는 값(헤더 판의 농도)에 기대는 규칙이 그 표시를 보고 대체 모양을 고른다.
// 일반 스크립트의 최상위 var는 window의 속성이 되므로 즉시 실행 함수로 감싸 전역에 이름을 남기지 않는다.
export const THEME_BOOT = `(function(){var t;try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}
document.documentElement.dataset.js='1';
document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('${DARK_QUERY}').matches?'dark':'light';})();`;
