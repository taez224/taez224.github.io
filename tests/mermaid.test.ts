import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDiagram, renderMermaidBlocks } from '../src/scripts/mermaid-render.ts';

// 렌더링된 SVG의 대역이다. max-width가 100%가 되면 컨테이너 폭에 맞춰 줄어든 것으로 본다.
type FakeSvg = { style: { maxWidth: string; height: string } };

function fixture(fonts?: unknown) {
  const slots: unknown[] = [];
  const makeNode = (textContent: string) => ({
    textContent, className: '',
    attributes: {} as Record<string, string>,
    clientWidth: 0, naturalWidth: 0, svg: null as FakeSvg | null,
    // 실제 DOM처럼 SVG가 컨테이너에 맞춰 줄어들면 넘치는 폭이 사라진다.
    get scrollWidth() { return this.svg?.style.maxWidth === '100%' ? this.clientWidth : Math.max(this.clientWidth, this.naturalWidth); },
    querySelector(selector: string) { return selector === 'svg' ? this.svg : null; },
    setAttribute(name: string, value: string) { this.attributes[name] = value; },
    removeAttribute(name: string) { delete this.attributes[name]; },
    getAttribute(name: string) { return this.attributes[name] ?? null; },
    // 크게 보기 버튼이 붙는 자리다. 이 대역에는 형제도 부모도 없어 버튼을 실제로 달지는 않는다.
    addEventListener() {},
    previousElementSibling: null,
    parentNode: null,
    replaceWith(next: unknown) { const index = slots.indexOf(this); assert.notEqual(index, -1); slots[index] = next; }
  });
  // 만들어 준 노드도 문서를 알아야 한다. 크게 보기 버튼이 container.ownerDocument로 만들어지기 때문이다.
  const document: { createElement: () => ReturnType<typeof makeNode>; fonts?: unknown } = {
    createElement: () => Object.assign(makeNode(''), { ownerDocument: document }),
    fonts
  };
  const blocks = ['invalid', 'valid'].map((text) => {
    const pre = makeNode(text);
    slots.push(pre);
    return { textContent: text, ownerDocument: document, closest: () => pre };
  });
  return { slots, originals: [...slots], blocks: blocks as unknown as Element[] };
}

test('a failed diagram restores its original block and later diagrams still render', async () => {
  const f = fixture();
  await renderMermaidBlocks(f.blocks, {
    initialize() {},
    async run({ nodes } = {}) {
      assert.ok(nodes);
      if (nodes[0].textContent === 'invalid') { nodes[0].textContent = 'partial output'; throw new Error('invalid syntax'); }
      nodes[0].textContent = 'rendered SVG';
    }
  });
  assert.equal(f.slots[0], f.originals[0]);
  assert.equal((f.slots[0] as { textContent: string }).textContent, 'invalid');
  assert.equal((f.slots[1] as { textContent: string }).textContent, 'rendered SVG');
});

test('initialization failure leaves all original code blocks intact', async () => {
  const f = fixture();
  await assert.rejects(renderMermaidBlocks(f.blocks, { initialize() { throw new Error('initialization failed'); }, async run() {} }));
  assert.deepEqual(f.slots, f.originals);
});

test('flowcharts keep their natural width instead of shrinking into the column', async () => {
  let useMaxWidth: boolean | undefined;
  const f = fixture();
  await renderMermaidBlocks(f.blocks, {
    initialize(config) { useMaxWidth = config?.flowchart?.useMaxWidth; },
    async run({ nodes } = {}) {
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  });
  assert.equal(useMaxWidth, false);
});

// Mermaid는 useMaxWidth를 도표 종류마다 따로 둔다. flowchart만 끄면 나머지는 좁은 화면에서
// 컨테이너에 맞춰 줄어들어 320px에서 글자가 6px까지 작아진다.
test('every diagram type in use is drawn at its natural size', async () => {
  let config: Record<string, { useMaxWidth?: boolean } | undefined> | undefined;
  const f = fixture();
  await renderMermaidBlocks(f.blocks, {
    initialize(received) { config = received as Record<string, { useMaxWidth?: boolean } | undefined>; },
    async run({ nodes } = {}) {
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  });
  for (const kind of ['flowchart', 'sequence', 'state', 'class', 'er', 'usecase', 'agentflow']) {
    assert.equal(config?.[kind]?.useMaxWidth, false, `${kind}가 컨테이너에 맞춰 줄어든다`);
  }
});

// 12는 배치·외형·접힘 폭 기본값을 한꺼번에 바꿨다. 측정해서 고른 값이므로 기본값에 맡기지 않고 못 박는다.
test('the layout engine, look and wrapping width are pinned instead of following Mermaid defaults', async () => {
  let config: Parameters<Parameters<typeof renderMermaidBlocks>[1]['initialize']>[0] | undefined;
  const f = fixture();
  await renderMermaidBlocks(f.blocks, {
    initialize(received) { config = received; },
    async run({ nodes } = {}) {
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  });
  assert.equal(config?.layout, 'dagre');
  assert.equal(config?.look, 'neo');
  assert.equal(config?.flowchart?.wrappingWidth, 120);
});

// 렌더링 결과를 대역 컨테이너에 심는다. 컨테이너 폭과 SVG의 원래 폭으로 맞춤 규칙을 시험한다.
function renderInto(clientWidth: number, naturalWidth: number) {
  return async ({ nodes }: { nodes?: ArrayLike<HTMLElement> } = {}) => {
    assert.ok(nodes);
    const node = nodes[0] as unknown as { textContent: string; clientWidth: number; naturalWidth: number; svg: FakeSvg | null };
    node.textContent = 'rendered SVG';
    node.clientWidth = clientWidth;
    node.naturalWidth = naturalWidth;
    node.svg = { style: { maxWidth: '', height: '' } };
  };
}
type Rendered = { getAttribute(name: string): string | null; svg: FakeSvg | null };

test('a diagram that fits the column is neither scaled nor a tab stop, but still carries a name', async () => {
  const f = fixture();
  await renderMermaidBlocks(f.blocks, { initialize() {}, run: renderInto(700, 500) });
  const container = f.slots[1] as Rendered;
  assert.equal(container.svg?.style.maxWidth, '');
  assert.equal(container.getAttribute('tabindex'), null);
  assert.equal(container.getAttribute('role'), 'group');
  assert.equal(container.getAttribute('aria-label'), '도표');
});

test('a diagram slightly wider than the column is scaled down while its labels stay readable', async () => {
  const f = fixture();
  await renderMermaidBlocks(f.blocks, { initialize() {}, run: renderInto(700, 760) });
  const container = f.slots[1] as Rendered;
  assert.equal(container.svg?.style.maxWidth, '100%');
  assert.equal(container.svg?.style.height, 'auto');
  assert.equal(container.getAttribute('tabindex'), null, '줄어든 도표는 넘치지 않으므로 Tab 정지점이 없다');
});

test('a diagram that would shrink its labels below the readable size keeps its width and becomes keyboard-scrollable', async () => {
  const f = fixture();
  await renderMermaidBlocks(f.blocks, { initialize() {}, run: renderInto(700, 2400) });
  const container = f.slots[1] as Rendered;
  assert.equal(container.svg?.style.maxWidth, '');
  assert.equal(container.getAttribute('tabindex'), '0');
});

test('the font request carries the label font and every diagram source', async () => {
  const requests: { font: string; text: string }[] = [];
  const f = fixture({ load: async (font: string, text: string) => { requests.push({ font, text }); } });
  await renderMermaidBlocks(f.blocks, {
    initialize() {},
    async run({ nodes } = {}) {
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].font, /Pretendard Variable/);
  for (const char of 'invalid') assert.ok(requests[0].text.includes(char));
  assert.equal(new Set(requests[0].text).size, requests[0].text.length, '같은 문자를 두 번 요청하지 않는다');
});

test('no diagram renders until the font request settles', async () => {
  let deliverFont = () => {};
  const pending = new Promise<void>((resolve) => { deliverFont = resolve; });
  let runs = 0;
  const f = fixture({ load: () => pending });
  const rendering = renderMermaidBlocks(f.blocks, {
    initialize() {},
    async run({ nodes } = {}) {
      runs += 1;
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(runs, 0, '폰트 요청이 끝나기 전에 렌더링이 시작됐다');
  deliverFont();
  await rendering;
  assert.equal(runs, 2);
  assert.equal((f.slots[1] as { textContent: string }).textContent, 'rendered SVG');
});

test('diagrams still render when the font request fails', async () => {
  const f = fixture({ load: async () => { throw new Error('font subset unavailable'); } });
  await renderMermaidBlocks(f.blocks, {
    initialize() {},
    async run({ nodes } = {}) {
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  });
  assert.equal((f.slots[0] as { textContent: string }).textContent, 'rendered SVG');
  assert.equal((f.slots[1] as { textContent: string }).textContent, 'rendered SVG');
});

test('rendering proceeds when the font request outlives the wait', { timeout: 500 }, async () => {
  const f = fixture({ load: () => new Promise(() => {}) });
  await renderMermaidBlocks(f.blocks, {
    initialize() {},
    async run({ nodes } = {}) {
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  }, 5);
  assert.equal((f.slots[1] as { textContent: string }).textContent, 'rendered SVG');
});

// 컨테이너 폭은 렌더링 뒤에도 바뀐다. 접힌 콜아웃이 열리거나 창 크기가 바뀌면 같은 도표를 다시 판단해야 한다.
test('fitDiagram re-decides when the container width changes and undoes an earlier choice', () => {
  const svg: FakeSvg = { style: { maxWidth: '', height: '' } };
  const attributes: Record<string, string> = {};
  const size = { clientWidth: 0, naturalWidth: 760 };
  const container = {
    get clientWidth() { return size.clientWidth; },
    get scrollWidth() { return svg.style.maxWidth === '100%' ? size.clientWidth : Math.max(size.clientWidth, size.naturalWidth); },
    querySelector: (selector: string) => (selector === 'svg' ? svg : null),
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    removeAttribute: (name: string) => { delete attributes[name]; },
    getAttribute: (name: string) => attributes[name] ?? null
  } as unknown as Element;
  fitDiagram(container);
  assert.equal(svg.style.maxWidth, '', '폭이 0인 컨테이너에서는 아무것도 정하지 않는다');
  assert.equal(container.getAttribute('tabindex'), null);
  size.clientWidth = 700;
  fitDiagram(container);
  assert.equal(svg.style.maxWidth, '100%');
  assert.equal(container.getAttribute('tabindex'), null);
  size.clientWidth = 300;
  fitDiagram(container);
  assert.equal(svg.style.maxWidth, '', '좁아지면 줄이기를 취소하고 원래 크기로 돌아간다');
  assert.equal(container.getAttribute('tabindex'), '0');
  size.clientWidth = 900;
  fitDiagram(container);
  assert.equal(container.getAttribute('tabindex'), null, '넘치지 않게 되면 Tab 정지점을 거둔다');
});

// 크게 보기 버튼은 넘치는 도표에만 붙는다. 그 판단을 두 번 하지 않도록 fitDiagram이 결과를 넘긴다.
test('fitDiagram reports whether the diagram still overflows', () => {
  const svg: FakeSvg = { style: { maxWidth: '', height: '' } };
  const attributes: Record<string, string> = {};
  const size = { clientWidth: 700, naturalWidth: 2400 };
  const container = {
    get clientWidth() { return size.clientWidth; },
    get scrollWidth() { return svg.style.maxWidth === '100%' ? size.clientWidth : Math.max(size.clientWidth, size.naturalWidth); },
    querySelector: (selector: string) => (selector === 'svg' ? svg : null),
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    removeAttribute: (name: string) => { delete attributes[name]; },
    getAttribute: (name: string) => attributes[name] ?? null
  } as unknown as Element;
  assert.equal(fitDiagram(container), true, '줄여도 못 읽는 도표는 넘친 채로 남는다');
  size.naturalWidth = 760;
  assert.equal(fitDiagram(container), false, '줄여서 들어간 도표는 넘치지 않는다');
  size.naturalWidth = 500;
  assert.equal(fitDiagram(container), false, '처음부터 들어가는 도표도 넘치지 않는다');
});

// useMaxWidth가 켜진 도표(상태도 등)는 Mermaid가 width="100%"에 max-width를 함께 주어 원래 크기를 지킨다.
// 그 max-width를 지우면 SVG가 컨테이너 폭까지 늘어나므로, 판단을 다시 할 때도 Mermaid가 준 값은 보존해야 한다.
test('fitDiagram keeps the max-width Mermaid set on a diagram that already fits', () => {
  const svg: FakeSvg = { style: { maxWidth: '251px', height: '' } };
  const attributes: Record<string, string> = {};
  const container = {
    clientWidth: 700,
    scrollWidth: 700,
    querySelector: (selector: string) => (selector === 'svg' ? svg : null),
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    removeAttribute: (name: string) => { delete attributes[name]; },
    getAttribute: (name: string) => attributes[name] ?? null
  } as unknown as Element;
  fitDiagram(container);
  assert.equal(svg.style.maxWidth, '251px', 'Mermaid가 준 max-width가 지워지면 안 된다');
  fitDiagram(container);
  assert.equal(svg.style.maxWidth, '251px', '두 번 불러도 같다');
  assert.equal(container.getAttribute('tabindex'), null);
});


test('fitDiagram excludes container padding when checking the minimum readable label size', () => {
  const attributes: Record<string, string> = {};
  const svg = { style: { maxWidth: '', height: '' }, getBoundingClientRect: () => ({ width: 870 }) };
  const container = {
    clientWidth: 718,
    get scrollWidth() { return svg.style.maxWidth === '100%' ? 718 : 882; },
    ownerDocument: { defaultView: { getComputedStyle: () => ({ paddingLeft: '12px', paddingRight: '12px' }) } },
    querySelector: () => svg,
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    removeAttribute: (name: string) => { delete attributes[name]; }
  } as unknown as Element;
  assert.equal(fitDiagram(container), true);
  assert.equal(svg.style.maxWidth, '', '실제 라벨은 12.8px이 되므로 축소하지 않는다');
  assert.equal(attributes.tabindex, '0');
});
