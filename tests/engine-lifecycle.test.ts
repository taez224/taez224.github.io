import test from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { createGraph } from '../src/graph/engine.ts';

// 배치의 모양은 브라우저 검사가 맡는다. 여기서는 실제 엔진을 실행하고 입력·프레임·관찰자의 수명만 제어한다.
class Surface extends EventTarget {
  calls = 0;
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (!callback) return;
    if (typeof options === 'object' && options.signal) setMaxListeners(0, options.signal);
    super.addEventListener(type, event => {
      this.calls++;
      if (typeof callback === 'function') callback(event); else callback.handleEvent(event);
    }, options);
  }
}

class ElementStub extends Surface {
  tag: string;
  parent: ElementStub | null = null;
  children: ElementStub[] = [];
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  textContent = '';
  clientWidth = 800;
  clientHeight = 600;
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classes.has(name);
      if (on) this.classes.add(name); else this.classes.delete(name);
      return on;
    }
  };
  constructor(tag: string) { super(); this.tag = tag; }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
    if (name === 'class') this.classes = new Set(value.split(' '));
    if (name.startsWith('data-')) this.dataset[name.slice(5)] = value;
  }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  append(...children: ElementStub[]) {
    for (const child of children) {
      if (child.parent) child.parent.children = child.parent.children.filter(c => c !== child);
      child.parent = this; this.children.push(child);
    }
  }
  replaceChildren(...children: ElementStub[]) { this.children = []; this.append(...children); }
  matches(selector: string): boolean {
    if (selector.includes(':')) return false;
    if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return attr ? this.attrs.has(attr[1]) && (attr[2] === undefined || this.attrs.get(attr[1]) === attr[2]) : this.tag === selector;
  }
  closest(selector: string): ElementStub | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  querySelectorAll(selector: string): ElementStub[] { return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  contains(node: ElementStub): boolean { return node === this || this.children.some(c => c.contains(node)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
}

function environment(t: import('node:test').TestContext) {
  const svg = new ElementStub('svg');
  const window = Object.assign(new Surface(), { matchMedia: () => ({ matches: false }) });
  const document = Object.assign(new Surface(), { createElementNS: (_ns: string, tag: string) => new ElementStub(tag), elementFromPoint: () => null });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const observers: Observer[] = [];
  class Observer {
    connected = false;
    calls = 0;
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
    notify() { if (this.connected) { this.calls++; this.callback(); } }
  }
  const globals = { window, document, ResizeObserver: Observer, CSS: { escape: (s: string) => s },
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); } };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); });
  }
  const send = (surface: Surface, type: string, fields: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
    surface.dispatchEvent(event);
  };
  return { svg, window, document, frames, observers, send };
}

test('destroy detaches svg, window and document input and disconnects the resize observer', t => {
  const env = environment(t);
  let selections = 0;
  const graph = createGraph(env.svg as unknown as SVGSVGElement, { nodes: [], edges: [], positions: new Map(), onSelect: () => selections++ });
  const fire = () => {
    env.send(env.svg, 'click');
    env.send(env.svg, 'wheel', { deltaY: -10, clientX: 100, clientY: 100 });
    for (const type of ['resize', 'scroll', 'pointerup', 'pointercancel', 'blur']) env.send(env.window, type, { pointerId: 1 });
    env.send(env.document, 'pointerdown', { target: env.svg });
    env.observers[0].notify();
  };
  fire();
  assert.equal(selections, 1);
  assert.ok(env.svg.calls > 0 && env.window.calls > 0 && env.document.calls > 0);
  assert.equal(env.observers[0].calls, 1);
  graph.destroy(); graph.destroy(); // 종료를 두 번 요청해도 안전하다.
  const counts = [env.svg.calls, env.window.calls, env.document.calls];
  const view = graph.view();
  fire();
  assert.deepEqual([env.svg.calls, env.window.calls, env.document.calls], counts);
  assert.deepEqual(graph.view(), view);
  assert.equal(selections, 1);
  assert.equal(env.observers[0].connected, false);
  assert.equal(env.observers[0].calls, 1);
});

test('destroy cancels both view animation and node-motion frames', t => {
  const env = environment(t);
  const graph = createGraph(env.svg as unknown as SVGSVGElement, {
    nodes: [{ id: 'a', title: 'A', type: '', topic: '개발', degree: 0, url: '/a/', isEntry: false }], edges: [], positions: new Map([['a', { x: 100, y: 100 }]])
  });
  const node = env.svg.querySelector('.node')!;
  env.send(env.svg, 'pointerdown', { target: node, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
  env.send(env.svg, 'pointermove', { target: node, pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 150 });
  assert.equal(env.frames.size, 1, '노드 이동 프레임이 예약된다');
  graph.moveTo({ x: 10, y: 20, scale: 1.2 });
  assert.equal(env.frames.size, 2, '시점 애니메이션도 별도 프레임을 예약한다');
  graph.destroy();
  assert.equal(env.frames.size, 0);
  assert.equal(env.svg.dataset.nodeMotion, undefined);
  const point = graph.position('a'), view = graph.view();
  for (const callback of env.frames.values()) callback(performance.now() + 1000);
  assert.deepEqual(graph.position('a'), point);
  assert.deepEqual(graph.view(), view);
});
