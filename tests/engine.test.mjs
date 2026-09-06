import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEdges, labelIds, fitTransform, offsetLine, isFilteredOut, wrapLabel } from '../src/graph/engine.mjs';

const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'a', target: 'c' }, { source: 'd', target: 'e' }];
const nodes = [
  { id: 'a', degree: 3, type: 'hub', displayTitle: 'A' },
  { id: 'b', degree: 2, type: 'hub', displayTitle: 'B' },
  { id: 'c', degree: 9, displayTitle: '짧은 제목' },
  { id: 'd', degree: 12, displayTitle: '열네 글자를 넘기는 아주아주 긴 제목' },
  { id: 'e', degree: 1, displayTitle: 'E' }
];

test('classifyEdges collapses mutual pairs when nothing is selected', () => {
  const idle = classifyEdges(edges, null);
  assert.equal(idle.length, 3);
  assert.deepEqual(idle.find((e) => e.mutual), { source: 'a', target: 'b', state: 'idle', mutual: true, offset: 0 });
  assert.ok(idle.every((e) => e.state === 'idle'));
});

test('classifyEdges marks out, in, dim and offsets mutual edges apart when selected', () => {
  const selected = classifyEdges(edges, 'a');
  assert.equal(selected.length, 4);
  const ab = selected.find((e) => e.source === 'a' && e.target === 'b');
  const ba = selected.find((e) => e.source === 'b' && e.target === 'a');
  assert.deepEqual([ab.state, ab.mutual, ab.offset], ['out', true, 1]);
  assert.deepEqual([ba.state, ba.mutual, ba.offset], ['in', true, 1]);
  assert.equal(selected.find((e) => e.source === 'a' && e.target === 'c').state, 'out');
  assert.equal(selected.find((e) => e.source === 'd').state, 'dim');
});

test('labelIds follows the idle, selected and hovered rules', () => {
  assert.deepEqual([...labelIds(nodes, edges, {})].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...labelIds(nodes, edges, { selected: 'a' })].sort(), ['a', 'b']);
  assert.deepEqual([...labelIds(nodes, edges, { selected: 'a', hovered: 'e' })].sort(), ['a', 'b', 'e']);
});

test('fitTransform brings every point inside the padded viewport and clamps scale', () => {
  const positions = new Map([['a', { x: 0, y: 0 }], ['b', { x: 2000, y: 1000 }]]);
  const t = fitTransform(positions, { width: 800, height: 500, pad: 40 });
  for (const p of positions.values()) {
    const x = p.x * t.scale + t.x, y = p.y * t.scale + t.y;
    assert.ok(x >= 40 - 1e-6 && x <= 760 + 1e-6 && y >= 40 - 1e-6 && y <= 460 + 1e-6);
  }
  assert.ok(t.scale > 0 && t.scale <= 3.2);
  assert.ok(Math.abs(t.scale - 0.36) < 1e-6);
  assert.equal(fitTransform(new Map([['a', { x: 10, y: 10 }]]), { width: 800, height: 500 }).scale, 1);
});

test('offsetLine shifts a segment along its normal by the requested distance', () => {
  const { x1, y1, x2, y2 } = offsetLine({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 2.5);
  assert.deepEqual([x1, y1, x2, y2].map((v) => +v.toFixed(2)), [0, 2.5, 10, 2.5]);
});

test('isFilteredOut applies the topic set and the hubs-only switch together', () => {
  const hub = { topic: 'AI', type: 'hub' }, leaf = { topic: '커리어', type: '' };
  assert.equal(isFilteredOut(hub), false);
  assert.equal(isFilteredOut(leaf, { topics: new Set(['AI']) }), true);
  assert.equal(isFilteredOut(hub, { topics: new Set(['AI']) }), false);
  assert.equal(isFilteredOut(leaf, { hubsOnly: true }), true);
  assert.equal(isFilteredOut(hub, { hubsOnly: true }), false);
  assert.equal(isFilteredOut(hub, { topics: new Set(['커리어']), hubsOnly: true }), true);
  assert.equal(isFilteredOut(undefined, { hubsOnly: true }), false);
});

test('wrapLabel keeps short titles on one line and folds long ones into two balanced lines', () => {
  assert.deepEqual(wrapLabel('AI 활용'), ['AI 활용']);
  assert.deepEqual(wrapLabel('스무 글자 안쪽이면 한 줄로 둔다'), ['스무 글자 안쪽이면 한 줄로 둔다']);
  const lines = wrapLabel('산출물이 팀의 자산이 되려면 판단·추적·복구가 가능해야 한다');
  assert.equal(lines.length, 2);
  assert.ok(Math.abs([...lines[0]].length - [...lines[1]].length) <= 8, lines.join('|'));
  assert.equal(lines.join(' '), '산출물이 팀의 자산이 되려면 판단·추적·복구가 가능해야 한다');
});
