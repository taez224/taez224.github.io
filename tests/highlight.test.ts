import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHighlighter } from '@tanstack/highlight/core';
import { createMarkdownRenderer } from '../src/lib/markdown.ts';
import { themeTokenClasses } from '@tanstack/highlight/theme';
import { EXCLUDED_LANGUAGES, highlightCode } from '../src/lib/highlight.ts';
import { java } from '../src/lib/highlight-java.ts';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/highlight/${name}`, import.meta.url)), 'utf8');
const javaHighlighter = createHighlighter({ languages: [java] });
const tokensFor = (code: string) => javaHighlighter.tokenize(code, { lang: 'java' }).tokens;
const classed = (code: string) => {
  const grouped = new Map<string, string[]>();
  for (const token of tokensFor(code)) {
    if (!token.className) continue;
    grouped.set(token.className, [...(grouped.get(token.className) ?? []), token.value]);
  }
  return grouped;
};

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

// 토큰을 다시 이었을 때 원문과 한 글자도 달라지면 코드가 조용히 바뀐 채 배포된다.
test('tokens rejoin to the exact source including tabs and blank lines', () => {
  for (const source of [read('java-sample.java'), 'int\ta = 1;\n\n\n  // 끝\n', '', '\n\t \n']) {
    assert.equal(tokensFor(source).map((token) => token.value).join(''), source);
  }
});

test('code that looks like markup is escaped rather than emitted as HTML', () => {
  const html = highlightCode('String s = "<script>alert(1)</script>"; // <b>굵게</b>', 'java');
  assert.ok(!/<script|<b>/i.test(html), '코드 안의 태그가 살아 있으면 페이지에서 실행된다');
  assert.match(html, /&lt;script&gt;/);
});

// 문자열과 주석의 경계가 틀리면 그 뒤 코드 전체가 잘못 칠해진다. 텍스트 블록은 안쪽이 산문이라 더 나쁘다.
test('Java strings, comments and text blocks keep their boundaries', () => {
  const sample = read('java-sample.java');
  const strings = classed(sample).get('string') ?? [];
  const comments = classed(sample).get('comment') ?? [];
  const textBlock = strings.find((value) => value.startsWith('"""'));
  assert.ok(textBlock, '텍스트 블록을 문자열로 잡지 못했다');
  assert.ok(textBlock.includes('SELECT') && textBlock.includes('--'), '텍스트 블록 안쪽이 코드로 새어 나갔다');
  assert.ok(strings.includes('"https://example.com/notes"'), '문자열 안의 //가 주석으로 읽혔다');
  assert.ok(comments.some((value) => value.includes('"따옴표"')), '주석 안의 따옴표가 문자열로 읽혔다');
  assert.ok(strings.includes("'\"'"), '문자 리터럴 안의 따옴표를 놓쳤다');
});

test('Java annotations, keywords and numbers are marked without swallowing identifiers', () => {
  const grouped = classed('@Override public long f() { long a = 1_000_000L; return a + x1; }');
  assert.deepEqual(grouped.get('function'), ['@Override', 'f'], '애너테이션은 TS 데코레이터처럼 function이어야 주석 회색과 갈린다');
  assert.ok((grouped.get('keyword') ?? []).includes('public'));
  assert.deepEqual(grouped.get('number'), ['1_000_000L'], 'x1의 1을 숫자로 잡으면 안 된다');
});

// Java 타입 이름은 대문자로 시작하는 관례를 따른다. 제네릭 인자와 한 글자 타입 매개변수도 같은 색이어야 한다.
test('Java type names, generic arguments and type parameters are marked as types', () => {
  const grouped = classed('public <T extends Comparable<T>> Map<String, List<Integer>> index(String[] names, HTTPClient client) {}');
  assert.deepEqual(grouped.get('type'), ['T', 'Comparable', 'T', 'Map', 'String', 'List', 'Integer', 'String', 'HTTPClient']);
});

// 전부 대문자인 이름은 Java에서 상수와 enum 값이다. 공개 노트의 Java 블록에서 이런 이름 가운데 클래스는 URI·URL뿐이었다.
test('all-caps Java constants and enum values are neither types nor functions', () => {
  const grouped = classed('static final long LIMIT = 10; Status s = Status.ACTIVE; enum Tier { GOLD("gold"), SILVER("silver") } URL u = URI.create(x).toURL(); s.ACTIVE.name();');
  assert.deepEqual(grouped.get('type'), ['long', 'Status', 'Status', 'Tier', 'URI'], '점 없이 시작해 메서드를 부르는 URI만 타입이고 선언 자리의 URL은 색이 없다');
  assert.deepEqual(grouped.get('property'), ['ACTIVE', 'create', 'toURL', 'ACTIVE', 'name'], '점 뒤의 ACTIVE는 메서드를 불러도 속성이다');
  assert.equal(grouped.get('function'), undefined);
});

// 라이브러리의 TS 문법처럼 점 바로 뒤의 이름은 속성, 점 없이 괄호가 붙은 이름은 함수로 칠한다.
test('Java member access is marked as properties and unqualified calls and declarations as functions', () => {
  const grouped = classed('List<String> find(String... args) { if (ok) run(); return notes.stream().map(String::valueOf).filter(n -> helper(n, this.limit)).toList(); }');
  assert.deepEqual(grouped.get('function'), ['find', 'run', 'helper']);
  assert.deepEqual(grouped.get('property'), ['stream', 'map', 'valueOf', 'filter', 'limit', 'toList'], '가변 인자 ... 뒤의 이름은 속성이 아니다');
  assert.deepEqual(grouped.get('type'), ['List', 'String', 'String', 'String']);
});

// import·package의 경로는 이름 하나라서 조각마다 속성·타입 색을 입히면 줄 전체가 얼룩진다.
test('Java package and import paths stay unclassified apart from their keywords', () => {
  const grouped = classed('package garden.sample;\nimport java.util.List;\nimport static org.junit.Assert.assertEquals;\nimport java.util.*;\n\nList<String> names;');
  assert.deepEqual(grouped.get('keyword'), ['package', 'import', 'import', 'static', 'import']);
  assert.deepEqual(grouped.get('type'), ['List', 'String']);
  assert.equal(grouped.get('property'), undefined);
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

// Java 식별자는 통화 기호(₩ € $)도 받는다. 식별자 안의 낱말을 키워드·타입·숫자로 잡으면 변수 하나가 세 색으로 갈라진다.
test('Java identifiers containing Korean, currency signs and combining marks stay unclassified', () => {
  const source = 'int 한글class = 0; int 값1 = 2; int $return = 3; int cafe\u0301int = 4; int ₩return = 5; int a₩1 = 6;';
  const grouped = classed(source);
  assert.equal(grouped.get('keyword'), undefined);
  assert.deepEqual(grouped.get('type'), ['int', 'int', 'int', 'int', 'int', 'int']);
  assert.deepEqual(grouped.get('number'), ['0', '2', '3', '4', '5', '6']);
  assert.deepEqual(classed('@한글설정 @₩Ann public class A {}').get('function'), ['@한글설정', '@₩Ann']);
});

// module-info.java 전용 낱말은 일반 코드에서 변수 이름으로 더 자주 나온다. 그 자리에서 키워드 색이 붙으면 안 된다.
test('module directive words are not keywords in ordinary Java code', () => {
  const grouped = classed('String to = with; map.put(module, uses); record Point(int x) {} sealed interface S permits A {}');
  assert.deepEqual(grouped.get('keyword'), ['record', 'sealed', 'interface', 'permits']);
});

test('Java fractional and hexadecimal floating point literals keep the whole number', () => {
  const grouped = classed('double a = .5; double b = 0x1.8p2; float c = 1e-3F; long d = 0xffL;');
  assert.deepEqual(grouped.get('number'), ['.5', '0x1.8p2', '1e-3F', '0xffL']);
});

test('unfinished comments and strings protect the remainder of an excerpt', () => {
  for (const [source, kind] of [
    ['/* public int no end', 'comment'],
    ['"unterminated // public int', 'string'],
    ['"""\npublic int // excerpt', 'string']
  ]) {
    assert.deepEqual(tokensFor(source), [{ className: kind, value: source }]);
  }
});
