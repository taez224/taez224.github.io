import test from 'node:test';
import assert from 'node:assert/strict';
import { localGraphLayout } from '../src/components/local-graph-layout.mjs';

const note = (id) => ({ path: id, displayTitle: id, topic: 'AI', kind: 'slipbox' });

test('localGraphLayout places the center in the middle and neighbors on a ring with direction', () => {
  const layout = localGraphLayout(note('c'), [note('a'), note('b')], [note('b'), note('d')], { width: 310, height: 190 });
  const ids = layout.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
  const center = layout.nodes.find((n) => n.id === 'c');
  assert.deepEqual([center.x, center.y], [155, 95]);
  assert.deepEqual(layout.edges.map((e) => e.direction).sort(), ['both', 'in', 'out']);
  for (const edge of layout.edges) assert.ok(edge.x1 >= 0 && edge.x2 <= 310 && edge.y1 >= 0 && edge.y2 <= 190);
});

test('localGraphLayout carries each node url so the reader graph can link', () => {
  const layout = localGraphLayout({ path: 'c.md', displayTitle: 'C', topic: 'AI', kind: 'slipbox', url: '/obsidian/notes/c/' }, [{ path: 'a.md', displayTitle: 'A', topic: 'AI', kind: 'slipbox', url: '/obsidian/notes/a/' }], [], { width: 310, height: 190 });
  assert.equal(layout.nodes[0].url, '/obsidian/notes/c/');
  assert.equal(layout.nodes[1].url, '/obsidian/notes/a/');
});

test('localGraphLayout caps neighbors at eight and reports the remainder', () => {
  const many = Array.from({ length: 12 }, (_, i) => note(`n${i}`));
  const layout = localGraphLayout(note('c'), many, [], { width: 310, height: 190 });
  assert.equal(layout.nodes.length, 9);
  assert.equal(layout.hidden, 4);
});
