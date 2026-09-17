import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownRenderer, extractNoteTargets } from '../src/lib/markdown.ts';
import { renderWithVisibility } from './helpers/markdown.ts';

test('note target extraction follows rendered link syntax while ignoring examples and images', () => {
  const source = [
    '[[공개#절|표시 이름]] [일반 링크](note.md#section) ![[임베드 노트]]',
    '> [!article]', '> [[카드]]', '',
    '> [!note]', '> [[인용]]', '',
    '`[[코드]]` ``[[코드]] ` 예시``', '\\[[이스케이프]]',
    '%% [[주석]] %% <!-- [[HTML 주석]] -->', '',
    '```md', '[[펜스]]', '```', '', '    [[들여쓰기 코드]]', '',
    '> ```md', '> [[인용 코드]]', '> ```', '',
    '![이미지](cover.png) ![[cover.png]] [[#같은 문서의 절]]'
  ].join('\n');
  assert.deepEqual(extractNoteTargets(source), ['공개', 'note.md', '임베드 노트', '카드', '인용']);
});

test('private wiki and markdown links show safe author labels without private metadata', () => {
  const html = renderWithVisibility()('x.md', '[[hidden/private.md#SECRET_FRAGMENT|공개 별칭]] [작성한 이름](hidden/private.md#SECRET_FRAGMENT)');
  assert.match(html, /<span class="private-note">공개 별칭 <span class="visibility-mark"/);
  assert.match(html, /<span class="private-note">작성한 이름 <span class="visibility-mark"/);
  assert.match(html, /role="img" tabindex="0" aria-label="공개되지 않은 자료"/);
  assert.doesNotMatch(html, /hidden\/|private\.md|SECRET|<a\b|href=|data-/);
});

test('unlabelled private links expose only the authored basename', () => {
  const html = renderWithVisibility()('x.md', '[[hidden/inside/이름.md#SECRET_FRAGMENT]] [](hidden/inside/다른이름.md#SECRET_FRAGMENT) [[hidden/inside%2F인코딩.md#SECRET_FRAGMENT]]');
  assert.match(html, /class="private-note">이름 <span/);
  assert.match(html, /class="private-note">다른이름 <span/);
  assert.match(html, /class="private-note">인코딩 <span/);
  assert.doesNotMatch(html, /hidden\/|inside|SECRET|\.md|href=|data-/);
});

test('private labels are escaped as text, with authored whitespace preserved', () => {
  const html = renderWithVisibility()('x.md', '[[hidden/private.md| <img src=x onerror=alert(1)> & "별칭" ]] [<em>별칭</em>](hidden/private.md)');
  assert.match(html, /class="private-note"> &lt;img src=x onerror=alert\(1\)&gt; &amp; "별칭"  <span/);
  assert.match(html, /&lt;em&gt;별칭&lt;\/em&gt;/);
  assert.doesNotMatch(html, /<img\b|<em>|SECRET/);
});

test('public notes, external links, images, and unresolved targets retain their roles', () => {
  const html = renderWithVisibility()('x.md', '[[public.md]] [별칭](public.md) [사이트](https://example.com) ![[picture.png|그림]] ![그림](picture.png) [[missing|미해결]] [없는 노트](missing.md)');
  assert.match(html, /class="internal-note-link" href="\/notes\/public\/">공개 제목<\/a>/);
  assert.match(html, /class="internal-note-link" href="\/notes\/public\/">별칭<\/a>/);
  assert.match(html, /href="https:\/\/example.com" rel="noreferrer" target="_blank">사이트<\/a>/);
  assert.equal((html.match(/<img src="\/assets\/picture.png" alt="그림"/g) ?? []).length, 2);
  assert.match(html, /미해결 없는 노트/);
  assert.doesNotMatch(html, /비공개/);
});

test('wiki and Markdown heading links hand the heading path to the resolver, default to the last heading and show it for same-note links', () => {
  const paths: string[] = [];
  const renderer = createMarkdownRenderer({
    resolveNote: (source, target, fragment, headingPath = '') => {
      paths.push(headingPath);
      const current = target === source;
      return { title: current ? '현재 노트' : '대상 노트', url: `/notes/${current ? 'current' : 'target'}/${fragment ? `#${fragment}` : ''}` };
    },
    resolveAsset: () => null
  });
  const html = renderer('current.md', '[[대상#상위 절#하위 절]] [[#같은 절]] [[#같은 절|별칭]] [[#^block-id]] [일반 링크](대상.md#상위#하위)');
  assert.match(html, /href="\/notes\/target\/#하위-절">대상 노트<\/a>/);
  assert.match(html, /href="\/notes\/current\/#같은-절">같은 절<\/a>/);
  assert.match(html, /href="\/notes\/current\/#같은-절">별칭<\/a>/);
  assert.match(html, /href="\/notes\/current\/#block-id">현재 노트<\/a>/);
  assert.match(html, /href="\/notes\/target\/#하위">일반 링크<\/a>/);
  assert.deepEqual(paths, ['상위 절#하위 절', '같은 절', '같은 절', '^block-id', '상위#하위']);
});

test('note resolution leaves code examples and escaped wiki brackets untouched', () => {
  let resolutions = 0;
  const renderer = createMarkdownRenderer({
    resolveNote: () => { resolutions += 1; return { visibility: 'private' }; },
    resolveAsset: () => null
  });
  const html = renderer('x.md', [
    '`[[hidden/private.md]] [별칭](hidden/private.md)`',
    '\\[\\[hidden/private.md\\]\\]',
    '',
    '```md',
    '[[hidden/private.md]] [별칭](hidden/private.md)',
    '```',
    '',
    '    [[hidden/private.md]]'
  ].join('\n'));
  assert.equal(resolutions, 0);
  assert.match(html, /<code>\[\[hidden\/private.md\]\] \[별칭\]\(hidden\/private.md\)<\/code>/);
  assert.doesNotMatch(html, /비공개|class="private-note"/);
});
