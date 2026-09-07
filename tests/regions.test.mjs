import test from 'node:test';
import assert from 'node:assert/strict';
import { convexHull, topicRegions, regionPath, placeRegionLabels } from '../src/graph/regions.mjs';

test('convexHull drops interior points and keeps corners', () => {
  const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }]);
  assert.equal(hull.length, 4);
  assert.ok(!hull.some((p) => p.x === 5 && p.y === 5));
  assert.equal(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length, 2);
});

test('topicRegions needs three nodes, trims outliers and labels the top point', () => {
  const nodes = [
    { id: 'a1', topic: 'AI' }, { id: 'a2', topic: 'AI' }, { id: 'a3', topic: 'AI' }, { id: 'a4', topic: 'AI' }, { id: 'far', topic: 'AI' },
    { id: 'k1', topic: '개발' }, { id: 'k2', topic: '개발' }
  ];
  const positions = new Map([
    ['a1', { x: 100, y: 100 }], ['a2', { x: 140, y: 100 }], ['a3', { x: 100, y: 140 }], ['a4', { x: 140, y: 140 }], ['far', { x: 900, y: 600 }],
    ['k1', { x: 500, y: 500 }], ['k2', { x: 520, y: 520 }]
  ]);
  const regions = topicRegions(nodes, positions);
  assert.equal(regions.length, 1);
  const [ai] = regions;
  assert.equal(ai.topic, 'AI');
  assert.equal(ai.count, 5);
  assert.ok(!ai.hull.some((p) => p.x === 900), '외딴 노드는 껍질에서 빠진다');
  assert.equal(ai.label.y, 100);
  assert.match(regionPath(ai.hull), /^M[\d. L]+Z$/);
});

test('placeRegionLabels moves a name off nodes and other names', () => {
  const hull = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }];
  const regions = [{ topic: 'AI', count: 4, hull, label: { x: 100, y: 100 } }, { topic: '개발', count: 3, hull, label: { x: 100, y: 100 } }];
  const free = placeRegionLabels([regions[0]], []);
  assert.equal(free.get('AI').anchor, 'middle');
  assert.ok(free.get('AI').y < 100, '막힌 곳이 없으면 위');
  const blockedTop = placeRegionLabels([regions[0]], [{ x: 100, y: 70, r: 30 }]);
  assert.ok(blockedTop.get('AI').y > 200, '위가 막히면 아래');
  const both = placeRegionLabels(regions, []);
  assert.notDeepEqual(both.get('AI'), both.get('개발'), '두 이름은 같은 자리를 쓰지 않는다');
});

test('placeRegionLabels keeps names inside the given bounds', () => {
  const hull = [{ x: 100, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 120 }, { x: 100, y: 120 }];
  const at = placeRegionLabels([{ topic: 'AI', count: 3, hull, label: { x: 100, y: 20 } }], [], { bounds: { width: 300, height: 130 } });
  assert.equal(at.get('AI').anchor, 'end', '위는 무대 밖, 아래도 밖이면 왼쪽');
});
