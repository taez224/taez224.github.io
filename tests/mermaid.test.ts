import test from 'node:test';
import assert from 'node:assert/strict';
import mermaid from 'mermaid';
import { MERMAID_CONFIG, MERMAID_DARK_CONFIG, DARK_SCHEME_QUERY } from '../src/scripts/mermaid-config.ts';
import { fitDiagram, pinsOwnTheme, renderMermaidBlocks, siteConfigFor } from '../src/scripts/mermaid-render.ts';
import { DARK_PALETTE } from '../src/lib/palette.ts';

// 렌더링된 SVG의 대역이다. max-width가 100%가 되면 컨테이너 폭에 맞춰 줄어든 것으로 본다.
type FakeSvg = { style: { maxWidth: string; height: string } };

function fixture(fonts?: unknown, texts: string[] = ['invalid', 'valid']) {
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
  const blocks = texts.map((text) => {
    const pre = makeNode(text);
    slots.push(pre);
    return { textContent: text, ownerDocument: document, closest: () => pre };
  });
  return { slots, originals: [...slots], blocks: blocks as unknown as Element[] };
}

test('a failed diagram restores its original block and later diagrams still render', async () => {
  const f = fixture();
  await renderMermaidBlocks(f.blocks, {
    parse: async () => ({ diagramType: 'flowchart-v2', config: {} }),
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
  await assert.rejects(renderMermaidBlocks(f.blocks, { parse: async () => ({ diagramType: 'flowchart-v2', config: {} }), initialize() { throw new Error('initialization failed'); }, async run() {} }));
  assert.deepEqual(f.slots, f.originals);
});

test('flowcharts keep their natural width instead of shrinking into the column', async () => {
  let useMaxWidth: boolean | undefined;
  const f = fixture();
  await renderMermaidBlocks(f.blocks, {
    parse: async () => ({ diagramType: 'flowchart-v2', config: {} }),
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
    parse: (source, options) => mermaid.parse(source, options),
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
    parse: (source, options) => mermaid.parse(source, options),
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

// 12는 짧은 라벨을 120px까지 늘려 노드 폭을 맞춘다. 한국어 라벨은 두세 글자가 많아 그 자리가 거의 빈 여백이 되고,
// 흐름도가 370px까지 넓어져 320px 화면에서 가로로 스크롤한다. 이 값을 받는 네 종류에 모두 적어야 한다.
test('the minimum node width is lowered for every diagram type that honours it', () => {
  const limited = ['flowchart', 'state', 'usecase', 'agentflow'] as const;
  for (const kind of limited) {
    assert.equal(MERMAID_CONFIG[kind]?.minNodeWidth, 60, `${kind}가 12의 기본 바닥값을 그대로 쓴다`);
  }
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
  await renderMermaidBlocks(f.blocks, { parse: async () => ({ diagramType: 'flowchart-v2', config: {} }), initialize() {}, run: renderInto(700, 500) });
  const container = f.slots[1] as Rendered;
  assert.equal(container.svg?.style.maxWidth, '');
  assert.equal(container.getAttribute('tabindex'), null);
  assert.equal(container.getAttribute('role'), 'group');
  assert.equal(container.getAttribute('aria-label'), '도표');
});

test('a diagram slightly wider than the column is scaled down while its labels stay readable', async () => {
  const f = fixture();
  await renderMermaidBlocks(f.blocks, { parse: async () => ({ diagramType: 'flowchart-v2', config: {} }), initialize() {}, run: renderInto(700, 760) });
  const container = f.slots[1] as Rendered;
  assert.equal(container.svg?.style.maxWidth, '100%');
  assert.equal(container.svg?.style.height, 'auto');
  assert.equal(container.getAttribute('tabindex'), null, '줄어든 도표는 넘치지 않으므로 Tab 정지점이 없다');
});

test('a diagram that would shrink its labels below the readable size keeps its width and becomes keyboard-scrollable', async () => {
  const f = fixture();
  await renderMermaidBlocks(f.blocks, { parse: async () => ({ diagramType: 'flowchart-v2', config: {} }), initialize() {}, run: renderInto(700, 2400) });
  const container = f.slots[1] as Rendered;
  assert.equal(container.svg?.style.maxWidth, '');
  assert.equal(container.getAttribute('tabindex'), '0');
});

test('the font request carries the label font and every diagram source', async () => {
  const requests: { font: string; text: string }[] = [];
  const f = fixture({ load: async (font: string, text: string) => { requests.push({ font, text }); } });
  await renderMermaidBlocks(f.blocks, {
    parse: async () => ({ diagramType: 'flowchart-v2', config: {} }),
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
    parse: async () => ({ diagramType: 'flowchart-v2', config: {} }),
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
    parse: async () => ({ diagramType: 'flowchart-v2', config: {} }),
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
    parse: async () => ({ diagramType: 'flowchart-v2', config: {} }),
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

// 크게 보기 버튼은 넘치는 도표와 작게 줄인 도표에만 붙는다. 그 판단을 두 번 하지 않도록 fitDiagram이 결과를 넘긴다.
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


// 좁은 화면에서는 라벨이 8px까지 줄어도 접어 넣는다. 13px보다 작아진 도표는 넘치지 않아도 크게 보기를 남긴다.
test('fitDiagram shrinks further on narrow screens and keeps the viewer for small labels', () => {
  const attributes: Record<string, string> = {};
  const svg: FakeSvg = { style: { maxWidth: '', height: '' } };
  const screen = { narrow: true };
  const size = { clientWidth: 309, naturalWidth: 598 };
  const container = {
    get clientWidth() { return size.clientWidth; },
    get scrollWidth() { return svg.style.maxWidth === '100%' ? size.clientWidth : Math.max(size.clientWidth, size.naturalWidth); },
    ownerDocument: { defaultView: {
      getComputedStyle: () => ({ paddingLeft: '0px', paddingRight: '0px' }),
      matchMedia: (query: string) => ({ matches: screen.narrow && query === '(max-width: 720px)' })
    } },
    querySelector: (selector: string) => (selector === 'svg' ? svg : null),
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    removeAttribute: (name: string) => { delete attributes[name]; }
  } as unknown as Element;
  assert.equal(fitDiagram(container), true, '라벨이 8.3px이면 접어 넣되 크게 보기는 남긴다');
  assert.equal(svg.style.maxWidth, '100%');
  assert.equal(attributes.tabindex, undefined, '넘치지 않으므로 Tab 정지점은 두지 않는다');
  size.naturalWidth = 759;
  assert.equal(fitDiagram(container), true, '8px 밑으로 내려가는 도표는 원래 크기로 스크롤한다');
  assert.equal(svg.style.maxWidth, '');
  assert.equal(attributes.tabindex, '0');
  size.naturalWidth = 598;
  screen.narrow = false;
  assert.equal(fitDiagram(container), true, '넓은 화면 규칙으로는 같은 도표를 줄이지 않는다');
  assert.equal(svg.style.maxWidth, '');
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

// 테마를 명시한 도표에는 사이트 팔레트가 섞이지 않게 하고, 다음 일반 도표는 사이트 설정으로 복귀한다.
test('a diagram pinning its own theme drops the site palette while keeping the size rules', async () => {
  const pinned = '---\nconfig:\n  theme: dark\n---\nflowchart LR\n  A --> B';
  const plain = 'flowchart LR\n  A --> B';
  type Config = Parameters<Parameters<typeof renderMermaidBlocks>[1]['initialize']>[0];
  let current: Config | undefined;
  const drawn: (Config | undefined)[] = [];
  const f = fixture(undefined, [pinned, plain, "%%{init: {'theme': 'dark'}}%%\nflowchart LR\n  A --> B"]);
  await renderMermaidBlocks(f.blocks, {
    parse: (source, options) => mermaid.parse(source, options),
    initialize(received) { current = received; },
    async run({ nodes } = {}) {
      drawn.push(current);
      assert.ok(nodes);
      nodes[0].textContent = 'rendered SVG';
    }
  });
  assert.equal(drawn.length, 3);
  const [first, middle, last] = drawn;
  assert.equal(first?.theme, undefined, '테마를 적은 도표에 사이트 테마를 씌우면 안 된다');
  assert.equal(first?.themeVariables?.borderColorArray, undefined, '사이트 팔레트가 남아 있다');
  assert.match(String(first?.themeVariables?.fontFamily), /Pretendard/, '서체까지 벗기면 한 페이지에서 글자가 따로 논다');
  assert.equal(first?.flowchart?.useMaxWidth, false, '크기 규칙은 테마와 무관하게 같아야 한다');
  assert.equal(first?.layout, 'dagre');
  assert.equal(middle?.theme, 'redux-color', '앞머리가 없는 도표는 사이트 설정으로 그린다');
  assert.ok(Array.isArray(middle?.themeVariables?.borderColorArray));
  assert.equal(last?.theme, undefined, '사이트 설정으로 돌아온 뒤 다시 벗겨지지 않았다');
});


test('diagrams follow the dark color scheme with the dark site palette', async () => {
  const view = (dark: boolean) => ({ matchMedia: (query: string) => ({ matches: dark && query === DARK_SCHEME_QUERY }) as MediaQueryList });
  assert.equal(siteConfigFor(view(true)), MERMAID_DARK_CONFIG);
  assert.equal(siteConfigFor(view(false)), MERMAID_CONFIG);
  assert.equal(siteConfigFor(undefined), MERMAID_CONFIG, '창이 없으면 밝은 화면으로 그린다');
  const received: unknown[] = [];
  const f = fixture(undefined, ['flowchart LR\n  A --> B']);
  const rendered = await renderMermaidBlocks(f.blocks, {
    parse: (source, options) => mermaid.parse(source, options),
    initialize(config) { received.push(config); },
    async run({ nodes } = {}) { assert.ok(nodes); nodes[0].textContent = 'rendered SVG'; }
  }, 0, MERMAID_DARK_CONFIG);
  assert.equal(received[0], MERMAID_DARK_CONFIG);
  assert.equal(rendered.length, 1, '다시 그릴 수 있게 그린 도표와 원문 짝을 돌려준다');
  assert.equal(rendered[0].pre, f.originals[0]);
});

test('the dark diagram palette keeps the light size rules and readable contrast', () => {
  const channel = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const { themeVariables: dark = {}, ...darkRest } = MERMAID_DARK_CONFIG;
  const { themeVariables: light = {}, ...lightRest } = MERMAID_CONFIG;
  assert.deepEqual({ ...darkRest, theme: undefined }, { ...lightRest, theme: undefined }, '배치·크기 설정은 화면 모드와 무관하다');
  assert.equal(dark.borderColorArray.length, light.borderColorArray.length);
  assert.equal(dark.textColor, DARK_PALETTE.ink);
  for (const border of dark.borderColorArray) assert.ok(contrast(border, dark.background) >= 3, `테두리 ${border}`);
  for (const fill of [...dark.bkgColorArray, dark.mainBkg, dark.secondaryColor, dark.noteBkgColor]) assert.ok(contrast(dark.textColor, fill) >= 4.5, `면 ${fill}`);
  assert.ok(contrast(dark.lineColor, dark.background) >= 3, '선');
});

test('theme detection uses Mermaid frontmatter, directives and the active diagram section', async () => {
  mermaid.initialize(MERMAID_CONFIG);
  const cases: [string, boolean][] = [
    ['---\nconfig: { theme: dark }\n---\nflowchart LR\n', true],
    ['---\nconfig:\n  "theme": dark\n---\nflowchart LR\n', true],
    ['---\ntitle: |\n  theme: dark\n---\nflowchart LR\n', false],
    ["%%{init: {'theme': 'dark'}}%%\nflowchart LR\n", true],
    ['---\nconfig: { flowchart: { theme: dark } }\n---\nflowchart LR\n', true],
    ['---\nconfig: { sequence: { theme: dark } }\n---\nflowchart LR\n', false]
  ];
  for (const [source, expected] of cases) {
    const parsed = await mermaid.parse(source);
    assert.ok(parsed);
    assert.equal(pinsOwnTheme(parsed), expected, source);
  }
  const merged = await mermaid.parse("---\nconfig: { theme: dark }\n---\n%%{init: {'theme': 'neutral'}}%%\nflowchart LR\n");
  assert.ok(merged);
  assert.equal(merged.config.theme, 'neutral');
});

test('a failed parse preserves the original and does not prevent later diagrams rendering', async () => {
  const f = fixture(undefined, ['bad', 'throws', 'valid']);
  let runs = 0;
  await renderMermaidBlocks(f.blocks, {
    initialize() {},
    async parse(source) {
      if (source === 'bad') return false;
      if (source === 'throws') throw new Error('invalid metadata');
      return { diagramType: 'flowchart-v2', config: {} };
    },
    async run() { runs += 1; }
  });
  assert.equal(f.slots[0], f.originals[0]);
  assert.equal(f.slots[1], f.originals[1]);
  assert.equal(runs, 1);
});

test('Mermaid accepts frontmatter theme variables', async () => {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ theme: 'base' });
  try {
    // 빈 흐름도는 DOM 없이 실제 Mermaid의 설정 해석을 검증할 수 있다.
    await mermaid.parse('---\nconfig:\n  theme: dark\n  themeVariables:\n    primaryColor: "#ff0000"\n---\nflowchart LR\n');
    assert.equal(mermaid.mermaidAPI.getConfig().themeVariables.primaryColor, '#ff0000');
  } finally {
    mermaid.initialize(MERMAID_CONFIG);
  }
});
