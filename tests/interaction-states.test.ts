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

// 중괄호 깊이를 따라가며 규칙마다 바깥 @규칙의 머리를 함께 넘긴다. 한 줄 규칙과 중첩된 @media를 모두 다룬다.
function selectorsWithParents(css: string) {
  const out: { selector: string; parents: string[] }[] = [];
  const stack: string[] = [];
  let prelude = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') { out.push({ selector: prelude.trim(), parents: [...stack] }); stack.push(prelude.trim()); prelude = ''; }
    else if (ch === '}') { stack.pop(); prelude = ''; }
    else if (ch === ';') prelude = '';
    else prelude += ch;
  }
  return out;
}

test('hover styles apply only on devices that can hover', () => {
  // 터치 기기는 탭한 요소에 :hover가 남는다. 호버 규칙은 (hover: hover) 안에 두고, 포커스·선택 상태는 따로 적는다.
  const found = sourceFiles('src', /\.(css|astro)$/).flatMap((path) => selectorsWithParents(styleText(path))
    .filter(({ selector, parents }) => selector.includes(':hover') && !parents.some((p) => /^@media\b.*\(hover:\s*hover\)/.test(p)))
    .map(({ selector }) => `${path}: ${selector}`));
  assert.deepEqual(found, []);
});

// 한 블록의 선언만 뽑는다. 중첩된 @규칙 안에서도 가장 안쪽 블록만 짝지어진다.
const blocks = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ parts: selector.split(',').map((part) => part.trim()), body }));
const blockFor = (css: string, selector: string) => blocks(css).find((rule) => rule.parts.includes(selector))?.body ?? '';

test('dimming a graph node leaves its focus ring readable', () => {
  // 흐리게 만드는 일을 노드 묶음에 걸면 자식인 포커스 링까지 곱해져 종이색 위에서 1.5:1이 된다.
  // opacity는 부분 트리를 한 층으로 합성하므로 자식에서 되돌릴 수 없다. 보이는 점에만 걸어야 링이 살아남는다.
  const css = read('src/styles/graph.css');
  for (const state of ['is-dim', 'is-faint']) {
    assert.doesNotMatch(blockFor(css, `.graph .node.${state}`), /opacity/, `.graph .node.${state}에 묶음 불투명도가 없다`);
    const marks = blocks(css).filter((rule) => rule.parts.some((part) => part.includes(`.node.${state} `)) && /opacity/.test(rule.body));
    assert.ok(marks.length > 0, `.node.${state}의 점은 흐려진다`);
  }
});

test('the search input takes its colors and focus ring from the site rules', () => {
  // 사이트에 하나뿐인 글자 입력란이다. UA 기본값에 맡기면 어두운 화면에서 자리 표시 글자가 3.51:1이 되고 포커스 표시가 사라진다.
  const css = read('src/styles/site.css');
  const input = blockFor(css, '.search-head input');
  assert.match(input, /(^|;)\s*color:\s*var\(--/, '글자색이 토큰이다');
  assert.doesNotMatch(input, /outline:\s*(0|none)/, '전역 포커스 표시를 끄지 않는다');
  assert.match(blockFor(css, '.search-head input::placeholder'), /color:\s*var\(--/, '자리 표시 글자도 토큰이다');
});

test('hit areas widened for touch do not overlap the line above', () => {
  // padding-block으로 넓힌 링크는 위아래로 그만큼 커진다. 줄 간격이 넓힌 양의 두 배보다 좁으면 두 줄의 누르는 영역이 겹치고,
  // 겹친 자리에서는 뒤 줄이 이겨서 앞 줄의 글자를 눌러도 다른 곳으로 간다.
  const css = styleText('src/components/NotePage.astro').replace(/\/\*[\s\S]*?\*\//g, '');
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  const pad = Number(blockFor(coarse, '.note-meta a').match(/padding-block:\s*(\d+)px/)?.[1] ?? 0);
  // 터치에서 줄 간격을 따로 정하지 않으면 기본 규칙의 gap이 그대로 쓰인다. 두 값 중 실제로 적용되는 쪽을 본다.
  const base = blockFor(css, '.note-meta').match(/(?:^|;)\s*gap:\s*(\d+)px/)?.[1] ?? '0';
  const gap = Number(blockFor(coarse, '.note-meta').match(/row-gap:\s*(\d+)px/)?.[1] ?? base);
  assert.ok(pad > 0, '메타 줄의 링크는 터치에서 누르는 영역을 넓힌다');
  assert.ok(gap >= pad * 2, `메타 줄의 줄 간격 ${gap}px이 위아래로 넓힌 ${pad}px의 두 배 이상이다`);
});

test('widened touch targets stay inside the room their neighbour leaves', () => {
  // 넓힌 영역이 이웃에 닿으면 겹친 자리에서 뒤에 그려지는 쪽이 이겨 엉뚱한 곳으로 간다.
  // 이웃이 물러서 줄 수 있으면 그만큼 물러서게 하고, 그럴 수 없으면 이웃이 남긴 여백까지만 넓힌다.
  const body = read('src/styles/body.css');
  const coarseBody = body.slice(body.indexOf('@media (pointer: coarse)'));
  const summaryPad = Number(blockFor(coarseBody, '.body details.callout > summary').match(/padding-block:\s*(\d+)px/)?.[1] ?? 0);
  const calloutGap = Number(blockFor(coarseBody, '.body details.callout[open] > .callout-body').match(/margin-top:\s*(\d+)px/)?.[1] ?? 0);
  assert.ok(summaryPad > 0, '콜아웃 머리표는 터치에서 누르는 영역을 넓힌다');
  assert.ok(calloutGap >= summaryPad, `머리표를 ${summaryPad}px 넓히므로 펼친 본문도 그만큼 물러선다`);

  const site = read('src/styles/site.css');
  const coarseSite = site.slice(site.indexOf('@media (pointer: coarse)'));
  const metaPad = Number(blockFor(coarseSite, '.ledger-row:not(.is-compact) .meta a').match(/padding-block:\s*(\d+)px/)?.[1] ?? 0);
  // 장부 행의 발행처 링크 위에는 제목이 있고, 제목 아래 여백만큼만 넓힐 수 있다. 더 넓히면 제목을 눌러도 발행처로 간다.
  const titleGap = Number(blockFor(site, '.ledger-row h3').match(/margin:\s*0 0 (\d+)px/)?.[1] ?? 0);
  assert.ok(metaPad > 0, '장부 행의 링크도 누르는 영역을 넓힌다');
  assert.ok(metaPad <= titleGap, `발행처 링크를 ${metaPad}px 넓혀도 제목 아래 ${titleGap}px 안에 머문다`);
});

test('links that stand alone in a line are marked with the shared underline', () => {
  // 행 전체가 이미 제목 링크인 자리에서는 색만으로 무엇이 따로 눌리는지 알 수 없다. 주변 글과 2.59:1뿐이다.
  // 밖으로 나가는 링크는 ↗가 그 일을 하므로, 표시가 없는 사이트 안 링크에만 밑줄을 준다.
  const site = read('src/styles/site.css');
  assert.match(blockFor(site, '.ledger-row .meta a:not([target])'), /text-decoration-color:\s*var\(--link-underline\)/, '사이트 안으로 가는 링크');
  assert.doesNotMatch(blockFor(site, '.ledger-row .meta a'), /text-decoration/, '↗를 단 링크에는 밑줄을 겹치지 않는다');
});

test('the external article page reaches its links like the reader does', () => {
  // 소개 페이지의 연결 목록과 되돌아가기 링크는 리더의 같은 자리와 성격이 같다. 누르는 영역도 같아야 한다.
  const css = styleText('src/components/ExternalArticle.astro');
  assert.match(blockFor(css, 'li'), /position:\s*relative/, '줄 전체가 링크의 영역이 된다');
  assert.match(blockFor(css, 'li a::after'), /inset:\s*0/);
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  assert.match(blockFor(coarse, '.back-to-posts'), /padding-block:\s*\d+px/, '되돌아가기 링크는 위아래로 넓힌다');
});

test('search results are clickable across the whole row', () => {
  // 한 줄짜리 결과의 제목 링크는 27.75px이라 44px 목표에 못 미친다. 링크의 ::after로 줄 전체를 덮어 누르는 영역만 넓힌다.
  const css = read('src/styles/site.css');
  const row = css.match(/\n\.search-item \{([^}]+)\}/)?.[1] ?? '';
  const stretch = css.match(/\n\.search-item a::after \{([^}]+)\}/)?.[1] ?? '';
  assert.match(row, /position:\s*relative/);
  assert.match(stretch, /position:\s*absolute/);
  assert.match(stretch, /inset:\s*0/);
});
