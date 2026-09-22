export {};
// 헤더의 테마 버튼. 상태의 단일 출처는 <html>의 data-theme이고, 첫 페인트 전에 <head>의 인라인 스크립트가 정한다(lib/theme.ts).
// 여기서는 누름을 받아 상태를 바꾸고, 고른 값만 저장하며, CSS 밖에서 색을 읽는 곳(도표·브라우저 색)에 알린다.
// 읽는 도중 시스템 설정이 바뀌어도 따라가지 않는다. 독자가 고른 화면이 글을 읽는 동안 뒤집히지 않게 한다.
import { THEME_KEY, applyWithTransition, type Theme } from '../lib/theme.ts';

const root = document.documentElement;
const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const current = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');

// 브라우저 UI 색은 <head>의 두 메타가 시스템 설정에 따라 고른다. 독자가 시스템과 다른 화면을 고르면 두 메타를 같은 값으로 맞춰
// 어느 쪽이 뽑히든 지금 화면과 같은 색이 된다.
const paint = (theme: Theme) => {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const color = getComputedStyle(root).getPropertyValue('--paper').trim();
  for (const meta of metas) meta.content = color;
  if (!button) return;
  const label = theme === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.dataset.themeToggle = theme;
};

if (button) {
  button.hidden = false;
  button.addEventListener('click', () => {
    // 다음 화면은 누른 시점이 아니라 실제로 바꾸는 시점에 정한다. 전환 콜백이 도는 사이에 한 번 더 누르면
    // 두 번 모두 같은 값을 골라 한 번만 바뀐다.
    const change = () => {
      const next: Theme = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch { /* 저장이 막혀도 이번 화면은 바뀐다 */ }
      paint(next);
      // 도표처럼 CSS 변수를 읽지 못하는 곳이 다시 그릴 수 있게 알린다.
      document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
    };
    applyWithTransition(document, matchMedia('(prefers-reduced-motion: reduce)').matches, change);
  });
}
paint(current());
