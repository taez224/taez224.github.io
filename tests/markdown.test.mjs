import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownRenderer } from '../src/lib/markdown.mjs';

const render = createMarkdownRenderer({ resolveNote: () => null, resolveAsset: () => null });

test('block ids become invisible anchors at paragraph ends and on their own line', () => {
  const html = render('x.md', '플랫폼 팀의 첫 번째 미션은 몰입 시간을 되찾는 것이다. ^flow-time-mission\n\n다음 문단.\n^para-2\n\n`a ^ b`는 코드라 남는다.');
  assert.doesNotMatch(html, /\^flow-time-mission|\^para-2/);
  assert.match(html, /되찾는 것이다\. <span id="flow-time-mission"><\/span><\/p>/);
  assert.match(html, /<span id="para-2"><\/span>/);
  assert.match(html, /a \^ b/);
});

test('block ids in fenced and indented code stay literal', () => {
  const html = render('x.md', '```text\nexample ^code-id\n^standalone-code\n```\n\n    example ^indented-id');
  assert.match(html, /example \^code-id/);
  assert.match(html, /\^standalone-code/);
  assert.match(html, /example \^indented-id/);
  assert.doesNotMatch(html, /<span id=/);
});

test('comments are removed and highlights become mark', () => {
  const html = render('x.md', '보임 %%숨김%% ==강조==');
  assert.doesNotMatch(html, /숨김/);
  assert.match(html, /<mark>강조<\/mark>/);
});

test('multiline comments hide their contents even when they contain code fences', () => {
  const html = render('x.md', '공개\n\n%%\n숨길 메모\n```js\nsecret()\n```\n%%\n\n끝');
  assert.doesNotMatch(html, /숨길|secret|%%/);
  assert.match(html, /<p>공개<\/p>/);
  assert.match(html, /<p>끝<\/p>/);
});

test('escaped backticks do not protect comments, real code spans do', () => {
  const html = render('x.md', '일반 \\` %%숨김%% \\`\n\n``코드 ` %%유지%%``\n\n`여러 줄\n%%코드 유지%%`');
  assert.doesNotMatch(html, /숨김/);
  assert.match(html, /<code>코드 ` %%유지%%<\/code>/);
  assert.match(html, /<code>여러 줄 %%코드 유지%%<\/code>/);
});

test('unmatched code delimiters do not expose subsequent comments', () => {
  assert.doesNotMatch(render('x.md', '%%\n```\n%%\n공개\n%%숨김%%'), /숨김|%%/);
  assert.doesNotMatch(render('x.md', '`` unmatched %%숨김%% ` end'), /숨김|%%/);
});

test('callouts adjacent to prose remain independent blocks', () => {
  const html = render('x.md', '앞 문단\n> [!note]\n> 내용\n뒤 문단');
  assert.match(html, /<p>앞 문단<\/p>\s*<aside/);
  assert.match(html, /<\/aside>\s*<p>뒤 문단<\/p>/);
  assert.doesNotMatch(html, /<p><\/p>|CALLOUT_/);
});

test('comments and highlights stay literal in inline and fenced code', () => {
  const html = render('x.md', [
    '`if (status == 2 || status == 6) {}` `SELECT * WHERE a LIKE \'%%\';`',
    '',
    '```sql',
    "SELECT * WHERE a LIKE '%%' AND b LIKE '%%';",
    'if (status == 2 || status == 6) {}',
    '```',
    '',
    '실제 ==강조== %%숨김%%'
  ].join('\n'));
  assert.match(html, /<code>if \(status == 2 \|\| status == 6\) \{\}<\/code>/);
  assert.match(html, /<code>SELECT \* WHERE a LIKE '%%';<\/code>/);
  assert.match(html, /SELECT \* WHERE a LIKE '%%' AND b LIKE '%%';/);
  assert.match(html, /if \(status == 2 \|\| status == 6\) \{\}/);
  assert.match(html, /<mark>강조<\/mark>/);
  assert.doesNotMatch(html, /숨김/);
});

test('heading ids ignore Obsidian-only comments, highlights, and block ids', () => {
  const html = render('x.md', '## 제목 ^heading-id\n\n## 제목 %%숨김%%\n\n## ==강조 제목==');
  assert.match(html, /<h2 id="제목">제목/);
  assert.match(html, /<h2 id="제목-2">제목/);
  assert.match(html, /<h2 id="강조-제목">/);
});

test('strong emphasis closes after punctuation before Korean particles', () => {
  const html = render('x.md', '**흡수 역량(Absorptive Capacity)**이라는 **워크슬롭(Workslop)**이라고 **"결국 내가 다시 확인해야 하나"**라는');
  assert.match(html, /<strong>흡수 역량\(Absorptive Capacity\)<\/strong>이라는/);
  assert.match(html, /<strong>워크슬롭\(Workslop\)<\/strong>이라고/);
  assert.match(html, /<strong>"결국 내가 다시 확인해야 하나"<\/strong>라는/);
  assert.doesNotMatch(html, /\*\*/);
});

test('Korean emphasis preserves native nesting and code and escaped delimiters', () => {
  const html = render('x.md', [
    '**일반 강조**와 *기울임* 그리고 ***중첩 강조***.',
    '**흡수 *역량*(Capacity)**이라는',
    '`**"코드"**라는`',
    '\\*\\*"이스케이프"\\*\\*라는',
    '',
    '```md',
    '**"코드 블록"**라는',
    '```',
    '',
    '    **"들여쓴 코드"**라는'
  ].join('\n'));
  assert.match(html, /<strong>일반 강조<\/strong>와 <em>기울임<\/em>/);
  assert.match(html, /<em><strong>중첩 강조<\/strong><\/em>/);
  assert.match(html, /<strong>흡수 <em>역량<\/em>\(Capacity\)<\/strong>이라는/);
  assert.match(html, /<code>\*\*"코드"\*\*라는<\/code>/);
  assert.match(html, /\*\*"이스케이프"\*\*라는/);
  assert.match(html, /<code class="language-md">\*\*"코드 블록"\*\*라는/);
  assert.match(html, /<pre><code>\*\*"들여쓴 코드"\*\*라는/);
});

function renderWithVisibility() {
  return createMarkdownRenderer({
    resolveNote: (_source, target) => target.startsWith('hidden/')
      ? { visibility: 'private', title: 'NEVER_SHOW_SECRET_TITLE', url: '/NEVER_SHOW_SECRET_URL' }
      : target === 'public.md' ? { title: '공개 제목', url: '/notes/public/' } : null,
    resolveAsset: (_source, target) => target === 'picture.png' ? { url: '/assets/picture.png' } : null
  });
}

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

test('private links and Korean strong emphasis work inside callouts', () => {
  const html = renderWithVisibility()('x.md', '> [!note]\n> [[hidden/private.md|별칭]] **워크슬롭(Workslop)**이라고');
  assert.match(html, /class="callout callout-note"/);
  assert.match(html, /class="private-note">별칭/);
  assert.match(html, /<strong>워크슬롭\(Workslop\)<\/strong>이라고/);
});

test('callout code fences keep blank lines inside the code block', () => {
  const html = render('x.md', [
    '> [!note] 예시',
    '>',
    '> ```js',
    '> const a = 1;',
    '>',
    '> ```',
    '>',
    '> **굵게** 아님'
  ].join('\n'));
  assert.match(html, /<pre><code class="language-js">const a = 1;\n\n<\/code><\/pre>/);
  assert.match(html, /<p><strong>굵게<\/strong> 아님<\/p>/);
  assert.doesNotMatch(html, /<code[^>]*>[\s\S]*<p><\/p>/);
});

function renderWithArticles() {
  return createMarkdownRenderer({
    resolveNote: (_source, target, fragment) => {
      if (target === 'public.md') return { title: 'Canonical & <title>', url: `/notes/public/${fragment ? `#${fragment}` : ''}` };
      if (target === 'hidden.md') return { visibility: 'private', title: 'SECRET TITLE', url: '/secret/' };
      return null;
    },
    resolveAsset: () => null
  });
}

test('public article callouts register canonical card metadata and a safe fallback link', () => {
  const articleCards = [];
  const html = renderWithArticles()('x.md', '> [!article] <img src=x onerror=alert(1)>\n> [[public.md|authored alias]]', { articleCards });
  assert.deepEqual(articleCards, [{ url: '/notes/public/', title: 'Canonical & <title>', caption: '<img src=x onerror=alert(1)>' }]);
  assert.match(html, /<aside class="article-card-slot" data-article-card="0"><a class="internal-note-link" href="\/notes\/public\/">Canonical &amp; &lt;title&gt;<\/a><\/aside>/);
  assert.doesNotMatch(html, /authored alias|onerror=|<img /);
});

test('article cards preserve heading and block destinations while using canonical metadata', () => {
  for (const [target, fragment] of [['public.md#설명과 예시', '설명과-예시'], ['public.md#^source-proof|별칭', 'source-proof']]) {
    const articleCards = [];
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
    const articleCards = [];
    const html = renderer('x.md', source, { articleCards });
    assert.equal(articleCards.length, 0, source);
    assert.match(html, /callout-article/, source);
    assert.match(html, /함께 읽기/, source);
    assert.doesNotMatch(html, /article-card-slot/, source);
  }
});

test('article syntax is protected in fenced, indented and inline code', () => {
  const articleCards = [];
  const html = renderWithArticles()('x.md', [
    '```md',
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
  assert.match(html, /<pre><code class="language-md">&gt; \[!article\]/);
  assert.match(html, /<pre><code>&gt; \[!article\]/);
  assert.match(html, /<code>&gt; \[!article\]<\/code>/);
  assert.match(html, /data-article-card="0"/);
});

test('ordinary wiki links remain ordinary links and nested article callouts still register cards', () => {
  const articleCards = [];
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

test('a ** that opens after punctuation before Korean still starts strong emphasis', () => {
  const html = render('x.md', '(**중요**)라는 말과 그는 "**진짜**"라고 말했다');
  assert.match(html, /\(<strong>중요<\/strong>\)라는/);
  assert.match(html, /"<strong>진짜<\/strong>"라고/);
  assert.doesNotMatch(html, /\*\*/);
});
