import test from 'node:test';
import assert from 'node:assert/strict';
import { fitViewerSize, opensFitted, setViewerButton } from '../src/scripts/mermaid-viewer.ts';

type FakeEl = {
  tagName: string; className: string; textContent: string; type: string;
  attributes: Record<string, string>;
  classList: { contains(name: string): boolean };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(name: string, handler: () => void): void;
  remove(): void;
  __handlers: Record<string, (() => void)[]>;
};

// 도표 컨테이너와 그 형제들을 담는 최소 대역이다. 버튼은 컨테이너 앞에 형제로 들어간다.
function fixture() {
  const children: FakeEl[] = [];
  const makeEl = (tagName: string): FakeEl => {
    const el: FakeEl = {
      tagName, className: '', textContent: '', type: '',
      attributes: {},
      classList: { contains: (name: string) => el.className.split(' ').includes(name) },
      setAttribute(name, value) { el.attributes[name] = value; },
      getAttribute(name) { return el.attributes[name] ?? null; },
      addEventListener(name, handler) { (el.__handlers[name] ??= []).push(handler); },
      remove() { const i = children.indexOf(el); if (i >= 0) children.splice(i, 1); },
      __handlers: {}
    };
    return el;
  };
  const container = makeEl('div');
  const parentNode = {
    insertBefore(node: FakeEl, ref: FakeEl) { children.splice(children.indexOf(ref), 0, node); }
  };
  const host = {
    ...container,
    ownerDocument: { createElement: makeEl, body: makeEl('body') },
    parentNode,
    get previousElementSibling() { const i = children.indexOf(host as unknown as FakeEl); return i > 0 ? children[i - 1] : null; },
    querySelector: () => null
  };
  children.push(host as unknown as FakeEl);
  return { host: host as unknown as Element, children, makeEl };
}

test('a diagram that fits its column gets no viewer button', () => {
  const f = fixture();
  setViewerButton(f.host, false);
  assert.equal(f.children.length, 1, '버튼이 붙지 않아야 한다');
});

test('a diagram that overflows gets a labelled button in front of it', () => {
  const f = fixture();
  setViewerButton(f.host, true);
  assert.equal(f.children.length, 2);
  const button = f.children[0];
  assert.equal(button.tagName, 'button');
  assert.equal(button.type, 'button');
  assert.match(button.textContent, /크게/);
});

test('calling twice does not add a second button', () => {
  const f = fixture();
  setViewerButton(f.host, true);
  setViewerButton(f.host, true);
  assert.equal(f.children.length, 2);
});

test('a diagram that stops overflowing loses its button', () => {
  const f = fixture();
  setViewerButton(f.host, true);
  assert.equal(f.children.length, 2);
  setViewerButton(f.host, false);
  assert.equal(f.children.length, 1, '넘치지 않게 되면 버튼도 사라져야 한다');
});


test('viewer fitting preserves the whole diagram in both wide and tall viewports without enlarging it', () => {
  const wide = fitViewerSize(2400, 400, 800, 600);
  assert.equal(wide.width, 800);
  assert.ok(Math.abs(wide.height - 400 / 3) < 0.001);
  assert.deepEqual(fitViewerSize(400, 2400, 800, 600), { width: 100, height: 600 });
  assert.deepEqual(fitViewerSize(200, 100, 800, 600), { width: 200, height: 100 });
  assert.deepEqual(fitViewerSize(2400, 400, 300, 600), { width: 300, height: 50 });
});

test('the viewer opens at original size on narrow screens and fitted elsewhere', () => {
  const screen = (narrow: boolean) => ({ matchMedia: (query: string) => ({ matches: narrow && query === '(max-width: 720px)' }) });
  assert.equal(opensFitted(screen(true)), false, '좁은 화면에서는 원래 크기로 연다');
  assert.equal(opensFitted(screen(false)), true);
  assert.equal(opensFitted(undefined), true, '화면 정보를 모르면 기존처럼 화면에 맞춘다');
});
