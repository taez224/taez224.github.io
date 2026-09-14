import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMermaidBlocks } from '../src/scripts/mermaid-render.ts';

function fixture() {
  const slots: unknown[] = [];
  const makeNode = (textContent: string) => ({
    textContent, className: '',
    replaceWith(next: unknown) { const index = slots.indexOf(this); assert.notEqual(index, -1); slots[index] = next; }
  });
  const document = { createElement: () => makeNode('') };
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
