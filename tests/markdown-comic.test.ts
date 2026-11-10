import test from 'node:test';
import assert from 'node:assert/strict';
import { render, renderWithVisibility } from './helpers/markdown.ts';

test('comic preserves resolved images in author order without a callout heading', () => {
  const html = renderWithVisibility()('x.md', '> [!comic]\n> ![[picture.png|첫 장]]\n>\n> ![둘째 장](https://example.com/2.png)');
  assert.match(html, /class="comic"/);
  assert.equal((html.match(/class="comic-page"/g) ?? []).length, 2);
  assert.ok(html.indexOf('alt="첫 장"') < html.indexOf('alt="둘째 장"'));
  assert.doesNotMatch(html, /callout-title/);
});

test('comic keeps mixed, folded, nested and unavailable content as ordinary callouts', () => {
  for (const body of [
    '> [!comic]\n> 설명\n>\n> ![[picture.png]]',
    '> [!comic]-\n> ![[picture.png]]',
    '> [!comic]\n> > [!note]\n> > ![[picture.png]]',
    '> [!comic]\n> ![[hidden/secret.md]]',
    '> [!comic]',
    '> [!comic] 설명을 유지한다\n> ![[picture.png]]'
  ]) {
    const html = renderWithVisibility()('x.md', body);
    assert.doesNotMatch(html, /class="comic"/);
    assert.match(html, /callout/);
    assert.doesNotMatch(html, /NEVER_SHOW_SECRET/);
  }
});

test('one image can be a comic and code examples are not converted', () => {
  assert.match(render('x.md', '> [!comic]\n> ![한 장](https://example.com/1.png)'), /class="comic-page"/);
  assert.doesNotMatch(render('x.md', '```md\n> [!comic]\n> ![그림](https://example.com/1.png)\n```'), /class="comic"/);
});

test('comic fallback uses a Korean heading and keeps adjacent images visible', () => {
  const html = render('x.md', '> [!comic]\n> ![첫 장](https://example.com/1.png)\n> ![둘째 장](https://example.com/2.png)');
  assert.doesNotMatch(html, /class="comic"/);
  assert.match(html, /class="callout-title">만화</);
  assert.equal((html.match(/<img /g) ?? []).length, 2);
});
