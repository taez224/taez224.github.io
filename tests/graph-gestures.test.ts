import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphGesture } from '../src/graph/gestures.ts';
const initial = { x: 0, y: 0, scale: 1 };
const touch = (id: number, x: number, y = 100) => ({ id, x, y, touch: true, onNode: true });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

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
  assert.ok(t, '두 손가락이 움직이면 변환이 나온다');
  assert.equal(t.scale, 3.2);
  near((300 - t.x) / t.scale, (100 - start.x) / start.scale);
  near((150 - t.y) / t.scale, (100 - start.y) / start.scale);
});

test('pinch-in obeys the minimum zoom', () => {
  const g = createGraphGesture();
  g.down(touch(1, 0), initial); g.down(touch(2, 200), initial);
  const pinched = g.move(touch(2, 10));
  assert.ok(pinched, '오므리는 동작도 변환을 낸다');
  assert.equal(pinched.scale, .65);
});

test('lifting one finger rebases to a smooth single-finger pan', () => {
  const g = createGraphGesture();
  g.down(touch(1, 50), initial); g.down(touch(2, 150), initial);
  const t = g.move(touch(2, 250)); g.end(2);
  const pan = g.move(touch(1, 70, 110));
  assert.ok(t && pan, '손가락을 하나 떼도 이어서 끌 수 있다');
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

test('pinch honours a fit scale below the default minimum instead of jumping to .65', () => {
  const gesture = createGraphGesture({ getMinScale: () => .36 });
  gesture.down({ id: 1, x: 0, y: 0, touch: true }, { x: 0, y: 0, scale: .36 });
  gesture.down({ id: 2, x: 100, y: 0, touch: true }, { x: 0, y: 0, scale: .36 });
  const next = gesture.move({ id: 2, x: 90, y: 0 });
  assert.ok(next, '맞춤 배율이 기본 최소보다 작아도 변환이 나온다');
  assert.ok(Math.abs(next.scale - .36) < 1e-9, `scale ${next.scale}`);
});
