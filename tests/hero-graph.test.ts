import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIVE_HERO_QUERY, mountHeroGraph, type HeroGraph } from '../src/scripts/hero-graph.ts';

test('the live hero map is limited to devices that can hover with a fine pointer', () => {
  // 지도 SVG는 touch-action: none이라 손가락 스와이프를 가져간다. 태블릿 세로 폭에서 올라오면 페이지가 내려가지 않는다.
  // 살아 있는 지도가 주는 것은 호버로 제목을 미리 보는 일이라 호버가 없는 기기에서는 얻는 것도 없다.
  assert.match(LIVE_HERO_QUERY, /\(min-width: 721px\)/);
  assert.match(LIVE_HERO_QUERY, /\(hover: hover\)/);
  assert.match(LIVE_HERO_QUERY, /\(pointer: fine\)/);
});

// 홈 지도 상자, 폭 미디어 쿼리, 창의 resize 이벤트만 갖춘 대역이다. 엔진 대신 맞춤 횟수만 세는 그래프를 그린다.
function fixture({ wide, width = 880, height = 500, fail = false }: { wide: boolean; width?: number; height?: number; fail?: boolean }) {
  const media = { matches: wide, listeners: [] as (() => void)[], addEventListener(_type: string, listener: () => void) { this.listeners.push(listener); } };
  const resizeListeners: (() => void)[] = [];
  const view = {
    matchMedia(query: string) { assert.equal(query, LIVE_HERO_QUERY); return media; },
    addEventListener(type: string, listener: () => void) { if (type === 'resize') resizeListeners.push(listener); }
  };
  let size = { width, height };
  const classes = new Set<string>();
  const box = { classList: { add: (name: string) => classes.add(name) }, getBoundingClientRect: () => size };
  let draws = 0, fits = 0;
  const draw = (): HeroGraph => {
    draws += 1;
    if (fail) throw new Error('broken data');
    return { fit: () => { fits += 1; } };
  };
  mountHeroGraph(box as unknown as HTMLElement, view as unknown as Window, draw);
  return {
    classes,
    draws: () => draws,
    fits: () => fits,
    // 브라우저처럼 경계를 넘을 때만 미디어 쿼리 change가 오고, resize는 매번 온다.
    resize(next: { width: number; height: number; wide: boolean }) {
      size = { width: next.width, height: next.height };
      const crossed = media.matches !== next.wide;
      media.matches = next.wide;
      if (crossed) for (const listener of media.listeners) listener();
      for (const listener of resizeListeners) listener();
    }
  };
}

test('a home opened wide draws the live graph and marks the box so CSS can hide the snapshot', () => {
  const home = fixture({ wide: true });
  assert.equal(home.draws(), 1);
  assert.ok(home.classes.has('is-live'));
});

test('a home opened at phone width draws the live graph once it is widened', () => {
  const home = fixture({ wide: false, width: 390, height: 304 });
  assert.equal(home.draws(), 0, '휴대폰 폭에서는 정적 그림을 쓴다');
  assert.ok(!home.classes.has('is-live'));
  home.resize({ width: 880, height: 500, wide: true });
  assert.equal(home.draws(), 1, '넓어지면 엔진을 그린다');
  assert.ok(home.classes.has('is-live'));
  home.resize({ width: 390, height: 304, wide: false });
  home.resize({ width: 880, height: 500, wide: true });
  assert.equal(home.draws(), 1, '한 번 그린 엔진은 다시 만들지 않는다');
});

test('the live graph refits when its box changes size while wide, and waits while hidden', () => {
  // 엔진은 상자 크기로 viewBox를 정하므로, 맞추지 않으면 제목이 상자 비율만큼 줄어든다.
  const home = fixture({ wide: true, width: 880, height: 500 });
  home.resize({ width: 640, height: 500, wide: true });
  assert.equal(home.fits(), 1, '넓은 폭 안에서 상자가 바뀌면 다시 맞춘다');
  home.resize({ width: 640, height: 500, wide: true });
  assert.equal(home.fits(), 1, '크기가 그대로면 맞추지 않는다');
  home.resize({ width: 390, height: 304, wide: false });
  assert.equal(home.fits(), 1, '숨은 엔진은 크기가 0이라 맞추지 않는다');
  home.resize({ width: 880, height: 500, wide: true });
  assert.equal(home.fits(), 2, '다시 넓어지면 그 사이 바뀐 상자에 맞춘다');
});

test('a graph that fails to draw leaves the snapshot in place and is not retried', (t) => {
  t.mock.method(console, 'error', () => {});
  const home = fixture({ wide: true, fail: true });
  assert.ok(!home.classes.has('is-live'), '정적 그림을 가리지 않는다');
  home.resize({ width: 640, height: 500, wide: true });
  assert.equal(home.draws(), 1);
});

test('phone width shows the snapshot even after the live graph was drawn', () => {
  // 엔진을 보이고 정적 그림을 가리는 규칙은 스크립트가 엔진을 그리는 폭과 같은 미디어 쿼리 안에만 있어야 한다.
  // 두 경계가 어긋나면 그 사이 폭에서 지도가 둘 다 보이거나 둘 다 사라진다.
  const css = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  const blocks = (query: string) => {
    const found: string[] = [];
    for (let at = css.indexOf(`@media ${query} {`); at >= 0; at = css.indexOf(`@media ${query} {`, at + 1)) {
      let depth = 0, end = css.indexOf('{', at);
      for (let i = end; i < css.length; i++) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}' && --depth === 0) { end = i; break; }
      }
      found.push(css.slice(at, end + 1));
    }
    return found.join('\n');
  };
  const outside = (rule: RegExp) => css.split(/@media [^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/).join('').match(rule);
  const live = blocks(LIVE_HERO_QUERY);
  assert.match(live, /\.hero-graph\.is-live \.hero-snapshot \{ display: none; \}/, '넓은 폭에서만 정적 그림을 가린다');
  assert.match(live, /\.hero-graph > :global\(\.graph\) \{ display: block; \}/, '넓은 폭에서만 엔진을 보인다');
  assert.ok(outside(/\.hero-graph > :global\(\.graph\) \{ display: none; \}/), '그 밖의 폭에서는 엔진을 숨긴다');
  assert.ok(!outside(/\.is-live \.hero-snapshot/), '정적 그림을 가리는 규칙이 미디어 쿼리 밖에 없다');
});
