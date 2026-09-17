import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicNote } from '../src/lib/content-model.ts';
import { render, renderWithArticles, renderWithVisibility } from './helpers/markdown.ts';

test('callouts adjacent to prose remain independent blocks', () => {
  const html = render('x.md', '앞 문단\n> [!note]\n> 내용\n뒤 문단');
  assert.match(html, /<p>앞 문단<\/p>\s*<aside/);
  assert.match(html, /<\/aside>\s*<p>뒤 문단<\/p>/);
  assert.doesNotMatch(html, /<p><\/p>|CALLOUT_/);
});

test('a callout following an ordinary quote starts a separate block', () => {
  const html = render('x.md', '> 앞 인용\n> [!note] 메모\n> 뒤 본문');
  assert.match(html, /<blockquote>\n<p>앞 인용<\/p>\n<\/blockquote>\n<aside class="callout callout-note">/);
  assert.match(html, /<p>뒤 본문<\/p>/);
});

test('a callout folded with - starts closed as details with its title as the summary', () => {
  const html = render('x.md', '> [!question]- 발전시킬 질문\n> - 질문 하나');
  assert.match(html, /^<details class="callout callout-question"><summary>발전시킬 질문<\/summary><div class="callout-body"><ul>\n<li>질문 하나<\/li>\n<\/ul>\n<\/div><\/details>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen/);
  // 제목을 적지 않으면 종류의 한국어 기본 제목이 요약 줄이 된다.
  assert.match(render('x.md', '> [!note]-\n> 본문'), /<details class="callout callout-note"><summary>메모<\/summary>/);
});

test('a callout inside a list item stays inside that item', () => {
  const html = render('x.md', '- 항목\n  > [!note] 제목\n  > 본문\n- 다음 항목');
  assert.match(html, /<li>항목<aside class="callout callout-note"><div class="callout-title">제목<\/div><div class="callout-body"><p>본문<\/p>\n<\/div><\/aside>\n<\/li>\n<li>다음 항목<\/li>/);
});

test('callouts nest four levels deep and the fifth level stays a blockquote', () => {
  const html = render('x.md', '> [!a] 1\n> > [!b] 2\n> > > [!c] 3\n> > > > [!d] 4\n> > > > > [!e] 5\n> > > > > 본문');
  for (const kind of ['a', 'b', 'c', 'd']) assert.match(html, new RegExp(`<aside class="callout callout-${kind}">`));
  assert.doesNotMatch(html, /callout-e/);
  assert.match(html, /<blockquote>\n<p>\[!e\] 5\n본문<\/p>\n<\/blockquote>/);
});

test('callout code fences keep blank lines inside the code block', () => {
  const html = render('x.md', [
    '> [!note] 예시',
    '>',
    '> ```text',
    '> const a = 1;',
    '>',
    '> ```',
    '>',
    '> **굵게** 아님'
  ].join('\n'));
  // 강조하지 않는 언어로 두어 산출물 바이트를 그대로 대조한다. 강조된 펜스는 highlight.test.ts가 본다.
  assert.match(html, /<pre><code class="language-text">const a = 1;\n\n<\/code><\/pre>/);
  assert.match(html, /<p><strong>굵게<\/strong> 아님<\/p>/);
  assert.doesNotMatch(html, /<code[^>]*>[\s\S]*<p><\/p>/);
});

test('callout markers inside a quoted code fence stay literal', () => {
  const html = render('x.md', '> 인용\n> ```text\n> [!note] 예시\n> ```');
  assert.doesNotMatch(html, /<aside/);
  assert.match(html, /\[!note\] 예시/);
});

test('private links and Korean strong emphasis work inside callouts', () => {
  const html = renderWithVisibility()('x.md', '> [!note]\n> [[hidden/private.md|별칭]] **워크슬롭(Workslop)**이라고');
  assert.match(html, /class="callout callout-note"/);
  assert.match(html, /class="private-note">별칭/);
  assert.match(html, /<strong>워크슬롭\(Workslop\)<\/strong>이라고/);
});

test('comparison callouts keep each nested case as a direct callout with its Mermaid source', () => {
  const html = render('x.md', [
    '> [!compare] 기본 모습',
    '> > [!example] Mermaid 11까지',
    '> > ```mermaid',
    '> > flowchart TD',
    '> >     A --> B',
    '> > ```',
    '>',
    '> > [!example] Mermaid 12',
    '> > ```mermaid',
    '> > flowchart TD',
    '> >     A --> C',
    '> > ```'
  ].join('\n'));
  // 격자는 CSS가 바깥 콜아웃의 본문에 건다. 칸이 그 본문의 직계 자식이어야 한 칸씩 자리를 차지한다.
  assert.match(html, /<aside class="callout callout-compare"><div class="callout-title">기본 모습<\/div><div class="callout-body"><aside class="callout callout-example">/);
  assert.equal(html.match(/<aside class="callout callout-example">/g)?.length, 2);
  assert.match(html, /<div class="callout-title">Mermaid 12<\/div><div class="callout-body"><pre><code class="language-mermaid">flowchart TD\n    A --&gt; C\n<\/code><\/pre>/);
  // 칸 제목은 Markdown 제목이 아니므로 목차에 올라오지 않는다.
  assert.doesNotMatch(html, /<h[1-6]/);

  const stacked = render('x.md', '> [!compare-stacked] 조합\n> > [!example] classic + default\n> > 본문');
  assert.match(stacked, /<aside class="callout callout-compare-stacked">/);
  assert.match(stacked, /<div class="callout-title">classic \+ default<\/div>/);
  // 제목을 적지 않으면 종류 이름이 아니라 한국어 기본 제목이 나온다.
  assert.match(render('x.md', '> [!compare]\n> > [!example]\n> > 본문'), /<div class="callout-title">비교<\/div>/);
  assert.match(render('x.md', '> [!compare-stacked]\n> 본문'), /<div class="callout-title">비교<\/div>/);
});

test('public article callouts register canonical card metadata and a safe fallback link', () => {
  const articleCards: PublicNote['articleCards'] = [];
  const html = renderWithArticles()('x.md', '> [!article] <img src=x onerror=alert(1)>\n> [[public.md|authored alias]]', { articleCards });
  assert.deepEqual(articleCards, [{ url: '/notes/public/', title: 'Canonical & <title>', caption: '<img src=x onerror=alert(1)>' }]);
  assert.match(html, /<aside class="article-card-slot" data-article-card="0"><a class="internal-note-link" href="\/notes\/public\/">Canonical &amp; &lt;title&gt;<\/a><\/aside>/);
  assert.doesNotMatch(html, /authored alias|onerror=|<img /);
});

test('article cards preserve heading and block destinations while using canonical metadata', () => {
  for (const [target, fragment] of [['public.md#설명과 예시', '설명과-예시'], ['public.md#^source-proof|별칭', 'source-proof']]) {
    const articleCards: PublicNote['articleCards'] = [];
    const html = renderWithArticles()('x.md', `> [!article] 연결 근거\n> [[${target}]]`, { articleCards });
    assert.deepEqual(articleCards, [{ url: `/notes/public/#${fragment}`, title: 'Canonical & <title>', caption: '연결 근거' }]);
    assert.ok(html.includes(`href="/notes/public/#${fragment}"`));
  }
});

test('invalid article callouts fall back to ordinary callouts without discarding their body', () => {
  const renderer = renderWithArticles();
  for (const source of [
    '> [!article]\n> [[public.md]]\n> 추가 본문',
    '> [!article]\n> [[public.md]] [[public.md]]',
    '> [!article]-\n> [[public.md]]',
    '> [!article]+\n> [[public.md]]',
    '> [!article]\n> [[hidden.md]]',
    '> [!article]\n> [[missing.md]]'
  ]) {
    const articleCards: PublicNote['articleCards'] = [];
    const html = renderer('x.md', source, { articleCards });
    assert.equal(articleCards.length, 0, source);
    assert.match(html, /callout-article/, source);
    assert.match(html, /함께 읽기/, source);
    assert.doesNotMatch(html, /article-card-slot/, source);
  }
});

test('article syntax is protected in fenced, indented and inline code', () => {
  const articleCards: PublicNote['articleCards'] = [];
  const html = renderWithArticles()('x.md', [
    '```text',
    '> [!article]',
    '> [[public.md]]',
    '```',
    '',
    '    > [!article]',
    '    > [[public.md]]',
    '',
    '`> [!article]`',
    '',
    '> [!article]',
    '> [[public.md]]'
  ].join('\n'), { articleCards });
  assert.equal(articleCards.length, 1);
  assert.match(html, /<pre><code class="language-text">&gt; \[!article\]\n&gt; \[\[public\.md\]\]\n<\/code><\/pre>/);
  assert.match(html, /<pre><code>&gt; \[!article\]/);
  assert.match(html, /<code>&gt; \[!article\]<\/code>/);
  assert.match(html, /data-article-card="0"/);
});

test('ordinary wiki links remain ordinary links and nested article callouts still register cards', () => {
  const articleCards: PublicNote['articleCards'] = [];
  const html = renderWithArticles()('x.md', [
    '[[public.md]]',
    '',
    '> [!note]',
    '> > [!article]',
    '> > [[public.md]]'
  ].join('\n'), { articleCards });
  assert.equal(articleCards.length, 1);
  assert.equal((html.match(/class="article-card-slot"/g) ?? []).length, 1);
  assert.equal((html.match(/class="internal-note-link"/g) ?? []).length, 2);
});
