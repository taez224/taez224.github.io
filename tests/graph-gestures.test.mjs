import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphGesture } from '../client/graph-gestures.mjs';
const initial = { x: 0, y: 0, scale: 1 };
const touch = (id, x, y = 100) => ({ id, x, y, touch: true, onNode: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('pinches from nodes around the two-finger midpoint and suppresses the synthetic click', () => {
  const g = createGraphGesture();
  g.down(touch(1, 50), initial); g.down(touch(2, 150), initial);
  g.move(touch(1, 0)); const t = g.move(touch(2, 200));
  assert.deepEqual(t, { x: -100, y: -100, scale: 2 });
  near((100 - t.x) / t.scale, 100); near((100 - t.y) / t.scale, 100);
  g.end(1); g.end(2);
  assert.equal(g.shouldSuppressClick(), true);
});

test('pinch also follows midpoint translation and clamps scale without moving the anchored world point', () => {
  const g = createGraphGesture();
  const start = { x: 20, y: -10, scale: 2 };
  g.down(touch(1, 50), start); g.down(touch(2, 150), start);
  const t = g.move(touch(2, 550, 200));
  assert.equal(t.scale, 3.2);
  near((300 - t.x) / t.scale, (100 - start.x) / start.scale);
  near((150 - t.y) / t.scale, (100 - start.y) / start.scale);
});

test('pinch-in obeys the minimum zoom', () => {
  const g = createGraphGesture();
  g.down(touch(1, 0), initial); g.down(touch(2, 200), initial);
  assert.equal(g.move(touch(2, 10)).scale, .65);
});

test('lifting one finger rebases to a smooth single-finger pan', () => {
  const g = createGraphGesture();
  g.down(touch(1, 50), initial); g.down(touch(2, 150), initial);
  const t = g.move(touch(2, 250)); g.end(2);
  const pan = g.move(touch(1, 70, 110));
  near(pan.x, t.x + 20); near(pan.y, t.y + 10); near(pan.scale, t.scale);
});

test('tap jitter stays a tap and mouse node clicks remain available after a drag', () => {
  const g = createGraphGesture();
  g.down(touch(1, 50), initial);
  assert.equal(g.move(touch(1, 51)), null); g.end(1);
  assert.equal(g.shouldSuppressClick(), false);
  g.down({ id: 2, x: 0, y: 0, touch: false, onNode: false }, initial);
  g.move({ id: 2, x: 20, y: 0 }); g.end(2);
  assert.equal(g.shouldSuppressClick(), true);
  assert.equal(g.down({ id: 3, x: 40, y: 0, touch: false, onNode: true }, initial), false);
  assert.equal(g.shouldSuppressClick(), false);
});

test('cancelled pointers cannot keep moving the graph and the next tap starts cleanly', () => {
  const g = createGraphGesture();
  g.down(touch(1, 20), initial); g.down(touch(2, 80), initial);
  g.end(1); g.end(2);
  assert.equal(g.active(), false);
  assert.equal(g.move(touch(2, 200)), null);
  g.down(touch(3, 40), initial); g.end(3);
  assert.equal(g.shouldSuppressClick(), false);
});
