import test from 'node:test';
import assert from 'node:assert/strict';
import { nextInDirection } from '../src/graph/keyboard-nav.ts';

const from = { x: 100, y: 100 };
const node = (id: string, x: number, y: number) => ({ id, x, y });

test('each arrow key moves to the node in that direction', () => {
  const nodes = [node('up', 100, 40), node('down', 100, 160), node('left', 40, 100), node('right', 160, 100)];
  assert.equal(nextInDirection(from, 'up', nodes), 'up');
  assert.equal(nextInDirection(from, 'down', nodes), 'down');
  assert.equal(nextInDirection(from, 'left', nodes), 'left');
  assert.equal(nextInDirection(from, 'right', nodes), 'right');
});

test('a far node inside the 45 degree cone beats a near node outside it', () => {
  const nodes = [node('near-outside', 110, 150), node('far-inside', 300, 120)];
  assert.equal(nextInDirection(from, 'right', nodes), 'far-inside');
});

test('a node exactly on the 45 degree edge counts as inside the cone', () => {
  const nodes = [node('edge', 150, 150), node('far-outside', 160, 260)];
  assert.equal(nextInDirection(from, 'right', nodes), 'edge');
});

test('inside the cone the node closer to the axis wins over a slightly nearer off-axis node', () => {
  const nodes = [node('off-axis', 140, 135), node('on-axis', 160, 100)];
  assert.equal(nextInDirection(from, 'right', nodes), 'on-axis');
});

test('falls back to the half plane when no node is inside the cone', () => {
  const nodes = [node('steep-near', 110, 190), node('steep-far', 120, 300), node('behind', 20, 100)];
  assert.equal(nextInDirection(from, 'right', nodes), 'steep-near');
});

test('returns null when nothing lies in that direction instead of wrapping around', () => {
  const nodes = [node('left', 40, 100), node('up', 100, 40)];
  assert.equal(nextInDirection(from, 'right', nodes), null);
  assert.equal(nextInDirection(from, 'down', nodes), null);
});

test('returns null for an empty candidate list', () => {
  assert.equal(nextInDirection(from, 'up', []), null);
});

test('never picks the node at the starting position', () => {
  const nodes = [node('self', 100, 100)];
  for (const direction of ['up', 'down', 'left', 'right'] as const) assert.equal(nextInDirection(from, direction, nodes), null);
  assert.equal(nextInDirection(from, 'right', [...nodes, node('other', 150, 100)]), 'other');
});

test('ties resolve to the smaller id regardless of input order', () => {
  const a = node('a', 150, 80);
  const b = node('b', 150, 120);
  assert.equal(nextInDirection(from, 'right', [a, b]), 'a');
  assert.equal(nextInDirection(from, 'right', [b, a]), 'a');
});

test('a dimmed node the caller left out of the candidates is never picked', () => {
  const nearDimmed = node('dimmed', 140, 100);
  const far = node('far', 260, 100);
  assert.equal(nextInDirection(from, 'right', [nearDimmed, far]), 'dimmed');
  assert.equal(nextInDirection(from, 'right', [far]), 'far');
});
