import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { codeLanguageLabel } from '../src/lib/highlight.ts';
import { render } from './helpers/markdown.ts';

test('codeLanguageLabel turns fence languages into the names readers know', () => {
  assert.equal(codeLanguageLabel('java'), 'Java');
  assert.equal(codeLanguageLabel('ts'), 'TypeScript');
  assert.equal(codeLanguageLabel('typescript'), 'TypeScript');
  assert.equal(codeLanguageLabel('tsx'), 'TSX');
  assert.equal(codeLanguageLabel('yml'), 'YAML');
  assert.equal(codeLanguageLabel('bash'), 'Bash');
  assert.equal(codeLanguageLabel('JSON'), 'JSON', '대소문자를 가리지 않는다');
  assert.equal(codeLanguageLabel('gradle'), 'Gradle', '강조하지 않는 언어도 이름은 보인다');
});

test('codeLanguageLabel leaves plain text and missing languages unnamed', () => {
  // 언어가 없는 블록은 이름 없이 복사만 둔다. text라고 적은 것도 "언어 없음"과 같다.
  for (const lang of ['', 'text', 'plaintext', 'txt']) assert.equal(codeLanguageLabel(lang), '', lang || '(빈 값)');
});

test('codeLanguageLabel shows an unknown language as written', () => {
  assert.equal(codeLanguageLabel('zig'), 'zig');
});

test('a fenced block with a language gets a head row naming it above the code', () => {
  const html = render('note.md', '```java\nclass A {}\n```');
  assert.match(html, /<div class="code-block"><div class="code-head"><span class="code-lang">Java<\/span><\/div><pre><code class="language-java">/);
});

test('a block without a language is wrapped without a head row', () => {
  // 머리 줄은 복사 버튼을 붙이는 스크립트가 만든다. 스크립트가 없으면 빈 줄이 남지 않는다.
  for (const source of ['```\nls -al\n```', '```text\nls -al\n```', '    ls -al']) {
    const html = render('note.md', source);
    assert.match(html, /<div class="code-block"><pre><code/, source);
    assert.doesNotMatch(html, /code-head/, source);
  }
});

test('mermaid blocks stay bare so the diagram script can replace them', () => {
  const html = render('note.md', '```mermaid\nflowchart TD\n  A --> B\n```');
  assert.doesNotMatch(html, /code-block/);
  assert.match(html, /^<pre><code class="language-mermaid">/);
});

// 복사 스크립트를 Node와 같은 타입 제거 방식으로 읽는다. share.test.ts와 같은 방식이다.
const source = stripTypeScriptTypes(await fs.readFile(new URL('../src/scripts/code-copy.ts', import.meta.url), 'utf8')).replace(/^export \{\};\s*/, '');

// 스크립트가 실제로 쓰는 DOM 기능만 갖춘 가짜 요소.
class FakeElement {
  tagName: string; className = ''; textContent = ''; innerHTML = ''; type = ''; title = '';
  children: FakeElement[] = []; dataset: Record<string, string> = {}; attributes = new Map<string, string>();
  listeners = new Map<string, () => unknown>();
  constructor(tagName: string) { this.tagName = tagName; }
  append(...nodes: FakeElement[]) { this.children.push(...nodes); }
  prepend(...nodes: FakeElement[]) { this.children.unshift(...nodes); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(event: string, listener: () => unknown) { this.listeners.set(event, listener); }
  querySelector(selector: string): FakeElement | null {
    const cls = selector.replace(/^\./, '');
    for (const child of this.children) {
      if (child.className.split(' ').includes(cls) || child.tagName === selector) return child;
      const deep = child.querySelector(selector);
      if (deep) return deep;
    }
    return null;
  }
}
function codeBlock(code: string, label = '') {
  const block = new FakeElement('div'); block.className = 'code-block';
  if (label) {
    const head = new FakeElement('div'); head.className = 'code-head';
    const name = new FakeElement('span'); name.className = 'code-lang'; name.textContent = label;
    head.append(name); block.append(head);
  }
  const pre = new FakeElement('pre'); const codeEl = new FakeElement('code'); codeEl.textContent = code;
  pre.append(codeEl); block.append(pre);
  return block;
}
function setup(blocks: FakeElement[], clipboard?: { writeText: (text: string) => Promise<void> }) {
  const timers = new Map<number, { fn: () => void; delay: number }>();
  let next = 0;
  vm.runInNewContext(source, {
    navigator: { clipboard },
    document: { querySelectorAll: () => blocks, createElement: (tag: string) => new FakeElement(tag) },
    window: {
      setTimeout(fn: () => void, delay: number) { const id = ++next; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id: number) { timers.delete(id); }
    }
  });
  const button = (block: FakeElement) => block.querySelector('code-copy')!;
  const status = (block: FakeElement) => block.querySelector('code-copy-status')!;
  return { timers, button, status, click: (block: FakeElement) => button(block).listeners.get('click')!() };
}

test('every code block gets a copy button, and a head row is made where none was built', () => {
  const named = codeBlock('class A {}', 'Java');
  const bare = codeBlock('ls -al');
  const ui = setup([named, bare]);
  for (const block of [named, bare]) {
    const head = block.children[0];
    assert.equal(head.className, 'code-head');
    assert.ok(ui.button(block), '복사 버튼이 있다');
    assert.equal(ui.button(block).attributes.get('aria-label'), '코드 복사');
  }
  assert.equal(bare.children[0].querySelector('code-lang'), null, '언어 이름은 새로 만들지 않는다');
});

test('a successful copy writes the code text and shows a check for two seconds', async () => {
  let copied = '';
  const block = codeBlock('class A {}\n', 'Java');
  const ui = setup([block], { writeText: async (text) => { copied = text; } });
  await ui.click(block);
  assert.equal(copied, 'class A {}\n');
  assert.equal(ui.button(block).dataset.state, 'done');
  assert.equal(ui.status(block).textContent, '코드를 복사했습니다.');
  const timer = [...ui.timers.values()][0];
  assert.equal(timer.delay, 2000);
  timer.fn();
  assert.equal(ui.button(block).dataset.state, undefined);
  assert.equal(ui.status(block).textContent, '');
});

test('a failed copy says so and tells the reader to select the code instead', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('denied'); } }]) {
    const block = codeBlock('class A {}', 'Java');
    const ui = setup([block], clipboard);
    await ui.click(block);
    assert.equal(ui.button(block).dataset.state, 'error', 'share.ts와 같은 상태 이름을 쓴다');
    assert.match(ui.status(block).textContent, /복사하지 못했습니다/);
    assert.match(ui.status(block).textContent, /직접 선택/);
    assert.equal([...ui.timers.values()][0].delay, 5000);
  }
});

test('the copy button hover plate fits inside the code head row', () => {
  // 누르는 영역(44px)에 판을 깔면 34px 머리 줄 위아래로 넘친다. 판은 아이콘 둘레의 작은 상자에만 칠한다.
  const css = readFileSync(new URL('../src/styles/body.css', import.meta.url), 'utf8');
  const px = (rule: string, prop: string) => Number(css.match(new RegExp(`\\n${rule.replace(/[.[\]]/g, '\\$&')} \\{[^}]*?${prop}:\\s*(\\d+)px`))?.[1] ?? NaN);
  const head = px('.body .code-head', 'min-height');
  const plate = px('.body .code-copy-plate', 'height');
  assert.ok(Number.isFinite(head) && Number.isFinite(plate), `머리 줄 ${head}px, 판 ${plate}px`);
  assert.ok(plate < head, `판 ${plate}px가 머리 줄 ${head}px보다 작다`);
  assert.doesNotMatch(css, /\.code-copy:hover \{[^}]*background/, '버튼 전체에는 호버 판을 깔지 않는다');
});
