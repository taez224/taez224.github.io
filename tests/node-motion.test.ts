import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeMotion, NODE_SETTLE_LIMIT } from '../src/graph/node-motion.ts';

const initial = () => new Map([['a', { x: 0, y: 0 }], ['b', { x: 100, y: 0 }], ['c', { x: 1000, y: 1000 }]]);
const edges = [{ source: 'a', target: 'b' }];

test('dragging holds the chosen point and moves its neighbor without moving a distant disconnected point', () => {
  const source = initial(), motion = createNodeMotion(source, edges);
  motion.hold('a', { x: 90, y: 50 });
  for (let i = 0; i < 30; i++) motion.step();
  assert.deepEqual(motion.positions.get('a'), { x: 90, y: 50 });
  assert.ok(motion.positions.get('b')!.x > 120);
  assert.ok(motion.positions.get('b')!.y > 10);
  assert.deepEqual(motion.positions.get('c'), source.get('c'));
  assert.deepEqual(source, initial(), '입력 배치는 바꾸지 않는다');
});

test('released nodes settle at a finite new balance and stop requesting frames', () => {
  const motion = createNodeMotion(initial(), edges);
  motion.hold('a', { x: 90, y: 50 });
  for (let i = 0; i < 30; i++) motion.step();
  motion.release();
  let frames = 0;
  while (motion.step() && frames++ < 400) { /* 잔여 운동이 끝날 때까지 계산한다. */ }
  assert.ok(frames < 400);
  assert.ok(motion.positions.get('a')!.x > 60, '사용자가 놓은 위치 근처에서 멈춘다');
  for (const point of motion.positions.values()) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

test('coincident points separate and duplicate or unavailable edges cannot destabilize motion', () => {
  const motion = createNodeMotion(new Map([['a', { x: 0, y: 0 }], ['b', { x: 0, y: 0 }]]), [
    ...edges, ...edges, { source: 'b', target: 'a' }, { source: 'missing', target: 'a' }, { source: 'a', target: 'a' }
  ]);
  for (let i = 0; i < 100; i++) motion.step(10000);
  const a = motion.positions.get('a')!, b = motion.positions.get('b')!;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 1);
  for (const point of motion.positions.values()) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

test('a stationary or empty graph stops without inventing perpetual motion', () => {
  for (const positions of [new Map(), initial()]) {
    const motion = createNodeMotion(positions, edges);
    for (let i = 0; i < 15; i++) motion.step();
    assert.equal(motion.step(), false);
    assert.deepEqual(motion.positions, positions);
  }
});

test('reset restores the original positions and cancels held points and residual velocity', () => {
  const motion = createNodeMotion(initial(), edges);
  motion.hold('a', { x: 90, y: 50 });
  for (let i = 0; i < 20; i++) motion.step();
  motion.reset();
  assert.deepEqual(motion.positions, initial());
  for (let i = 0; i < 40; i++) assert.equal(motion.step(), false);
  assert.deepEqual(motion.positions, initial());
  motion.hold('b', { x: 160, y: 50 });
  assert.equal(motion.step(), true, '복원 뒤에도 다시 끌 수 있다');
});

test('stopping motion freezes coordinates until another node is held', () => {
  const motion = createNodeMotion(initial(), edges);
  motion.hold('a', { x: 60, y: 30 });
  for (let i = 0; i < 6; i++) motion.step();
  motion.release(); motion.stop();
  const frozen = structuredClone(motion.positions);
  for (let i = 0; i < 20; i++) assert.equal(motion.step(), false);
  assert.deepEqual(motion.positions, frozen);
  motion.hold('b', { x: 140, y: 20 });
  assert.equal(motion.step(), true);
});

test('residual motion stops no later than one second after release', () => {
  assert.equal(NODE_SETTLE_LIMIT, 1000);
  const motion = createNodeMotion(initial(), edges);
  motion.hold('a', { x: 10000, y: 5000 });
  motion.step();
  motion.release();
  assert.equal(motion.step(NODE_SETTLE_LIMIT - 1), true);
  assert.equal(motion.step(1), false);
  const frozen = structuredClone(motion.positions);
  assert.equal(motion.step(), false);
  assert.deepEqual(motion.positions, frozen);
});

test('repeated drops at the same point do not leave two strong anchors overlapping', () => {
  const motion = createNodeMotion(new Map([['a', { x: 0, y: 0 }], ['b', { x: 100, y: 0 }]]), []);
  motion.hold('b', { x: 100, y: 0 }); motion.release();
  while (motion.step()) { /* 첫 노트를 놓은 뒤 두 번째를 같은 곳으로 옮긴다. */ }
  motion.hold('a', { x: 100, y: 0 }); motion.release();
  while (motion.step()) { /* 1초 상한에서도 겹침 보정이 적용된다. */ }
  const a = motion.positions.get('a')!, b = motion.positions.get('b')!;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 12);
});

test('stopping a dense pile separates visible node circles with bounded correction', () => {
  const motion = createNodeMotion(new Map(Array.from({ length: 43 }, (_, i) => [String(i), { x: 0, y: 0 }])), []);
  motion.stop();
  const points = [...motion.positions.values()];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= 12);
  }
});
