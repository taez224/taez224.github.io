import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMarkdownRenderer } from '../src/lib/markdown.ts';
import { themeTokenClasses } from '@tanstack/highlight/theme';
import { EXCLUDED_LANGUAGES, highlightCode } from '../src/lib/highlight.ts';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/highlight/${name}`, import.meta.url)), 'utf8');

// markdown-it은 highlight가 <pre로 시작하는 값을 돌려주면 그것을 그대로 쓰면서 language-* 클래스를
// 떼어 낸다. 그러면 mermaid-render.ts가 도표 블록을 찾지 못한다. 안쪽 토큰만 돌려줘야 한다.
test('highlighting returns inner markup so markdown-it keeps writing the code element itself', () => {
  const html = highlightCode('const a = 1;', 'ts');
  assert.ok(html.length > 0);
  assert.ok(!html.startsWith('<pre'), '완성된 블록을 돌려주면 language-* 클래스가 사라진다');
  assert.match(html, /class="th-token th-keyword"/);
});

// 빈 문자열을 돌려주면 markdown-it이 원문을 이스케이프한다. 도표는 원문 그대로 남아야 다시 그려진다.
test('diagram blocks and unknown languages are left to markdown-it', () => {
  // 등록하지 않아 걸러지는 것과 일부러 뺀 것은 다르다. 라이브러리에 mermaid 언어가 있으므로 결정 쪽을 붙든다.
  assert.ok(EXCLUDED_LANGUAGES.has('mermaid'), '도표를 강조 대상에서 빼는 결정이 사라졌다');
  assert.equal(highlightCode('flowchart LR\n  A --> B', 'mermaid'), '');
  assert.equal(highlightCode('plugins { id "java" }', 'gradle'), '');
  assert.equal(highlightCode('int main(void) { return 0; }', 'c'), '');
  assert.equal(highlightCode('그냥 글', 'text'), '', 'plaintext는 이스케이프한 원문과 같아 손대지 않는다');
  assert.equal(highlightCode('아무 것', ''), '');
});

// 강조한 HTML에서 태그를 걷고 이스케이프를 풀었을 때 원문과 한 글자도 달라지면 코드가 조용히 바뀐 채 배포된다.
// Java 등록이 빠지면 원문만 나와 복원 검사는 그대로 통과하므로, 색이 붙는지도 함께 본다.
test('highlighted Java renders the exact source including tabs and blank lines', () => {
  const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  for (const source of [read('java-sample.java'), 'int\ta = 1;\n\n\n  // 끝\n']) {
    const html = highlightCode(source, 'java');
    assert.match(html, /class="th-token th-/);
    assert.equal(plain(html), source);
  }
});

test('code that looks like markup is escaped rather than emitted as HTML', () => {
  const html = highlightCode('String s = "<script>alert(1)</script>"; // <b>굵게</b>', 'java');
  assert.ok(!/<script|<b>/i.test(html), '코드 안의 태그가 살아 있으면 페이지에서 실행된다');
  assert.match(html, /&lt;script&gt;/);
});

// 라이브러리가 토큰을 더하면 색 없는 클래스가 조용히 생기고, 라이브러리가 토큰을 빼면 CSS에 죽은 규칙이 남는다.
// CSS가 색의 유일한 출처이므로 선택자 이름을 뽑아 양쪽을 대조한다. 부분 문자열로 찾으면 .th-variable이
// .th-var를 덮은 것처럼 보이고 주석 속 이름도 세므로 선택자 단위로 본다.
test('the stylesheet names exactly the token classes the library can emit', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/styles/body.css', import.meta.url)), 'utf8');
  const styled = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.th-([a-z-]+)/g)].map((match) => match[1]));
  assert.deepEqual([...themeTokenClasses].filter((name) => !styled.has(name)), [], '색을 정하지 않은 토큰이 남아 있다');
  assert.deepEqual([...styled].filter((name) => !(themeTokenClasses as readonly string[]).includes(name)), [], '라이브러리가 내지 않는 토큰의 규칙이 남아 있다');
});

// 도표 원문은 mermaid.ts가 `code.language-mermaid`로 찾아 다시 그린다. highlightCode의 반환값만 보면
// markdown-it이 클래스를 떼는 경우를 놓치므로, 렌더러와 sanitize까지 지난 결과를 본다.
test('a mermaid fence reaches the page as a language-mermaid code element with its raw source', () => {
  const render = createMarkdownRenderer({ resolveNote: () => null, resolveAsset: () => null });
  const html = render('x.md', '```mermaid\nflowchart LR\n  A[시작] --> B\n```');
  assert.match(html, /<pre><code class="language-mermaid">flowchart LR\n  A\[시작\] --&gt; B\n<\/code><\/pre>/);
  assert.doesNotMatch(html, /th-token/);
});

// 강조된 블록은 sanitize를 지나야 하고, 콜아웃 본문의 펜스도 같은 길을 지난다.
test('highlighted fences survive sanitizing inside callouts with their code intact', () => {
  const render = createMarkdownRenderer({ resolveNote: () => null, resolveAsset: () => null });
  const html = render('x.md', '> [!note]\n> ```js\n> const a = "<b>";\n> ```');
  assert.match(html, /<pre><code class="language-js"><span class="th-token th-keyword">const<\/span> a = <span class="th-token th-string">"&lt;b&gt;"<\/span>;\n<\/code><\/pre>/);
});
