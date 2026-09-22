import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// 각주 판 스크립트를 Node와 같은 타입 제거 방식으로 읽는다. code-block.test.ts와 같은 방식이다.
const source = stripTypeScriptTypes(await fs.readFile(new URL('../src/scripts/footnotes.ts', import.meta.url), 'utf8')).replace(/^import .*;\s*/m, '');

// 스크립트가 실제로 쓰는 DOM 기능만 갖춘 가짜 요소.
class FakeElement {
  tagName: string; className = ''; id = ''; text = '';
  children: FakeElement[] = []; parent: FakeElement | null = null;
  attributes = new Map<string, string>(); listeners = new Map<string, (event: unknown) => void>();
  open = false;
  constructor(tagName: string, text = '') { this.tagName = tagName; this.text = text; }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value: string) { this.text = value; this.children = []; }
  get childNodes() { return [...this.children]; }
  get classList() {
    const names = () => new Set(this.className.split(' ').filter(Boolean));
    return {
      add: (name: string) => { this.className = [...names().add(name)].join(' '); },
      remove: (name: string) => { const set = names(); set.delete(name); this.className = [...set].join(' '); },
      contains: (name: string) => names().has(name)
    };
  }
  append(...nodes: FakeElement[]) { for (const node of nodes) { node.parent?.removeChild(node); node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes: FakeElement[]) { this.children = []; this.text = ''; this.append(...nodes); }
  removeChild(node: FakeElement) { this.children = this.children.filter((child) => child !== node); node.parent = null; }
  remove() { this.parent?.removeChild(this); }
  contains(node: FakeElement | null): boolean { return node === this || this.children.some((child) => child.contains(node)); }
  cloneNode(): FakeElement {
    const copy = new FakeElement(this.tagName, this.text);
    copy.className = this.className; copy.id = this.id;
    for (const [name, value] of this.attributes) copy.attributes.set(name, value);
    copy.append(...this.children.map((child) => child.cloneNode()));
    return copy;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const cls = selector.replace(/^\./, '');
    return this.children.flatMap((child) => [...(child.classList.contains(cls) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  addEventListener(event: string, listener: (event: unknown) => void) { this.listeners.set(event, listener); }
  showPopover() { this.open = true; }
  hidePopover() { this.open = false; }
}

// 본문의 번호 두 개와 글 끝 목록의 항목 두 개. 항목 끝에는 번호로 돌아가는 ↩ 링크가 있다.
function page({ anchorPositioning = true } = {}) {
  const item = (n: number, text: string) => {
    const li = new FakeElement('li'); li.id = `fn-${n}`;
    const p = new FakeElement('p', text);
    const back = new FakeElement('a', '↩'); back.className = 'footnote-backref';
    p.append(back); li.append(p);
    return li;
  };
  const ref = (n: number) => { const a = new FakeElement('a', String(n)); a.setAttribute('href', `#fn-${n}`); return a; };
  const refs = [ref(1), ref(2)];
  const items = new Map([['fn-1', item(1, '첫 각주다.')], ['fn-2', item(2, '둘째 각주다.')]]);
  const body = new FakeElement('body');
  const initialized: FakeElement[] = [];
  const documentListeners = new Map<string, (event: unknown) => void>();
  vm.runInNewContext(source, {
    setupCodeCopy: (root: FakeElement) => initialized.push(root),
    CSS: { supports: (query: string) => anchorPositioning && /anchor-name/.test(query) },
    HTMLElement: { prototype: { showPopover() {} } },
    document: {
      body,
      querySelectorAll: () => refs,
      getElementById: (id: string) => items.get(id) ?? null,
      createElement: (tag: string) => new FakeElement(tag),
      addEventListener: (event: string, listener: (event: unknown) => void) => documentListeners.set(event, listener)
    }
  });
  const panel = () => body.children.find((child) => child.classList.contains('footnote-panel')) ?? null;
  // 누르기는 브라우저처럼 pointerdown 뒤에 click이 온다. 키보드로 누르면 pointerdown 없이 detail 0인 click만 온다.
  const press = (target: FakeElement, { keyboard = false } = {}) => {
    let prevented = false;
    if (!keyboard) documentListeners.get('pointerdown')?.({ target });
    target.listeners.get('click')?.({ detail: keyboard ? 0 : 1, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  return { refs, panel, press, initialized, key: (key: string) => documentListeners.get('keydown')?.({ key }) };
}

test('pressing a footnote number opens its text in a panel without the back links', () => {
  const { refs, panel, press, initialized } = page();
  assert.equal(press(refs[0]), true, '글 끝으로 이동하지 않는다');
  assert.equal(panel()!.open, true);
  assert.equal(initialized.length, 1);
  assert.equal(initialized[0], panel()!.children[1], '복제한 각주 내용의 코드 복사 버튼을 초기화한다');
  assert.match(panel()!.textContent, /^1첫 각주다\.$/, '번호와 각주 문장만 담고 ↩는 뺀다');
  assert.equal(refs[0].getAttribute('aria-expanded'), 'true');
  assert.ok(refs[0].classList.contains('is-open'), '판이 붙을 번호에 표시를 단다');
});

test('the panel closes on the same number, a press outside, or Escape', () => {
  const { refs, panel, press, key } = page();
  press(refs[0]);
  press(refs[0]);
  assert.equal(panel()!.open, false, '같은 번호를 다시 누르면 닫힌다');
  assert.equal(refs[0].getAttribute('aria-expanded'), 'false');
  assert.ok(!refs[0].classList.contains('is-open'));
  press(refs[0]);
  press(new FakeElement('p'));
  assert.equal(panel()!.open, false, '바깥을 누르면 닫힌다');
  press(refs[0]);
  key('Escape');
  assert.equal(panel()!.open, false, 'Escape로 닫힌다');
});

test('pressing another number moves the panel to that footnote', () => {
  const { refs, panel, press } = page();
  press(refs[0]);
  press(refs[1]);
  assert.equal(panel()!.open, true);
  assert.match(panel()!.textContent, /둘째 각주다/);
  assert.ok(!refs[0].classList.contains('is-open'));
  assert.ok(refs[1].classList.contains('is-open'));
});

test('a keyboard press follows the link to the footnote list instead', () => {
  // 키보드와 화면 낭독기 사용자는 목록으로 가서 ↩로 돌아오는 편이 흐름을 잃지 않는다.
  const { refs, panel, press } = page();
  assert.equal(press(refs[0], { keyboard: true }), false);
  assert.equal(panel()!.open, false);
});

test('browsers that cannot pin the panel to the number keep the plain links', () => {
  const { refs, panel, press } = page({ anchorPositioning: false });
  assert.equal(press(refs[0]), false, '링크대로 글 끝 목록으로 간다');
  assert.equal(panel(), null, '판을 만들지 않는다');
});

test('footnote styles keep the sizes DESIGN.md documents', async () => {
  const css = await fs.readFile(new URL('../src/styles/body.css', import.meta.url), 'utf8');
  const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[.()[\]:,*+]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
  // 번호의 누르는 영역은 위아래로만 넓힌다. 가로로 넓히면 붙어 있는 다른 번호를 덮는다.
  assert.match(rule('.body .footnote-ref a::before'), /inset: -\d+px 0 -\d+px;/);
  assert.doesNotMatch(rule('.body .footnote-ref a'), /min-width/, '번호는 앞 글자에 붙는다');
  assert.doesNotMatch(css, /footnote-backref[^{}]*::before/);
  // 목록과 판의 글자는 본문 바로 아래 읽는 글자 단계다.
  assert.match(rule('.body .footnotes'), /font-size: var\(--t-summary\)/);
  assert.match(rule('.body.footnote-panel'), /font-size: var\(--t-summary\)/);
  // 판은 스크립트가 is-open을 단 번호에 붙는다. 두 이름이 어긋나면 판이 화면 구석에 뜬다.
  const anchor = rule('.body .footnote-ref a.is-open').match(/anchor-name: (--[\w-]+)/)?.[1];
  assert.ok(anchor);
  assert.match(rule('.body.footnote-panel'), new RegExp(`position-anchor: ${anchor}`));
});
