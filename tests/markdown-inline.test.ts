import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './helpers/markdown.ts';

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

test('highlights pair like Obsidian across inline markup and ignore escaped markers', () => {
  // Obsidian은 형광 사이에 든 굵게와 인라인 코드까지 함께 칠하고, 이스케이프한 \== 는 표시로 읽지 않는다.
  for (const [source, expected] of [
    ['==a **굵게** c==', '<p><mark>a <strong>굵게</strong> c</mark></p>'],
    ['==a `b` c==', '<p><mark>a <code>b</code> c</mark></p>'],
    ['\\==이스케이프==', '<p>==이스케이프==</p>']
  ]) {
    assert.equal(render('x.md', source).trim(), expected, source);
  }
});

// Obsidian의 기본 설정(Strict line breaks 끔)처럼 문단 안의 Enter 한 번은 줄바꿈으로 보인다.
test('a single line break inside a paragraph, list item or callout shows as a line break like Obsidian', () => {
  assert.equal(render('x.md', '"신은 주사위 놀이를 하지 않는다."\n— 알베르트 아인슈타인').trim(), '<p>"신은 주사위 놀이를 하지 않는다."<br />\n— 알베르트 아인슈타인</p>');
  assert.match(render('x.md', '- 설치: brew install bat\n  alias로 지정한다.'), /<li>설치: brew install bat<br \/>\nalias로 지정한다\.<\/li>/);
  assert.match(render('x.md', '> [!note]\n> 첫 줄\n> 둘째 줄'), /<p>첫 줄<br \/>\n둘째 줄<\/p>/);
  // 줄 끝 공백 두 칸으로 이미 줄을 바꾼 곳에 줄바꿈이 겹치지 않고, 빈 줄은 여전히 문단을 나눈다.
  assert.equal(render('x.md', '첫 줄  \n둘째 줄\n\n새 문단').trim(), '<p>첫 줄<br />\n둘째 줄</p>\n<p>새 문단</p>');
});

test('line breaks inside code blocks and inline code stay as written', () => {
  assert.equal(render('x.md', '```text\n첫 줄\n둘째 줄\n```').trim(), '<pre><code class="language-text">첫 줄\n둘째 줄\n</code></pre>');
  assert.doesNotMatch(render('x.md', '`여러\n줄`'), /<br/);
});

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

test('strong emphasis closes after punctuation before Korean particles', () => {
  const html = render('x.md', '**흡수 역량(Absorptive Capacity)**이라는 **워크슬롭(Workslop)**이라고 **"결국 내가 다시 확인해야 하나"**라는');
  assert.match(html, /<strong>흡수 역량\(Absorptive Capacity\)<\/strong>이라는/);
  assert.match(html, /<strong>워크슬롭\(Workslop\)<\/strong>이라고/);
  assert.match(html, /<strong>"결국 내가 다시 확인해야 하나"<\/strong>라는/);
  assert.doesNotMatch(html, /\*\*/);
});

test('a ** that opens after punctuation before Korean still starts strong emphasis', () => {
  const html = render('x.md', '(**중요**)라는 말과 그는 "**진짜**"라고 말했다');
  assert.match(html, /\(<strong>중요<\/strong>\)라는/);
  assert.match(html, /"<strong>진짜<\/strong>"라고/);
  assert.doesNotMatch(html, /\*\*/);
});

test('Korean strong emphasis may span inline code', () => {
  const html = render('x.md', '**앞 `코드`(X)**이라는 말과 **`코드`(Y)**라는 말');
  assert.match(html, /<strong>앞 <code>코드<\/code>\(X\)<\/strong>이라는 말과 <strong><code>코드<\/code>\(Y\)<\/strong>라는 말/);
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

test('strikethrough keeps its tag instead of flattening into plain text', () => {
  // markdown-it은 ~~ ~~를 <s>로 그린다. 허용 태그에서 빠지면 취소선이 사라지고 글자만 남는다.
  assert.match(render('x.md', '앞 ~~지운 글~~ 뒤'), /앞 <s>지운 글<\/s> 뒤/);
});
