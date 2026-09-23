import test from 'node:test';
import assert from 'node:assert/strict';
import { convexHull, topicRegions, regionPath, placeRegionLabels, regionLabelBox } from '../src/graph/regions.ts';

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
  const free = placeRegionLabels([regions[0]], []).get('AI');
  assert.ok(free, '막힌 곳이 없으면 이름 자리를 잡는다');
  assert.equal(free.anchor, 'middle');
  assert.ok(free.y < 100, '막힌 곳이 없으면 위');
  const blockedTop = placeRegionLabels([regions[0]], [{ x: 100, y: 70, r: 30 }]).get('AI');
  assert.ok(blockedTop, '위가 막혀도 이름 자리를 잡는다');
  assert.ok(blockedTop.y > 200, '위가 막히면 아래');
  const both = placeRegionLabels(regions, []);
  assert.notDeepEqual(both.get('AI'), both.get('개발'), '두 이름은 같은 자리를 쓰지 않는다');
});

// 지도는 오른쪽 아래 확대·축소 조작의 자리를 상자 장애물로 넘긴다. 휴대폰 폭에서 그 아래로 영역 이름이 들어가 가려졌다.
test('placeRegionLabels keeps a name out from under a control drawn over the graph', () => {
  const hull = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }];
  const region = { topic: '조직', count: 4, hull, label: { x: 100, y: 100 } };
  const control = { left: 60, right: 140, top: 50, bottom: 95 };
  const name = placeRegionLabels([region], [control]).get('조직')!;
  const box = regionLabelBox(name, '조직');
  const overlaps = box.left < control.right && control.left < box.right && box.top < control.bottom && control.top < box.bottom;
  assert.equal(overlaps, false, '조작 아래가 아닌 다른 자리를 고른다');
});

test('placeRegionLabels keeps screen-sized names apart when the graph is drawn small', () => {
  // 이름은 화면에서 같은 크기로 그린다. 그래프가 작게 그려지면(화면 1px = 장면 3단위) 장면 좌표로는 이름이 세 배 넓다.
  const regions = [
    { topic: 'AI', count: 3, hull: [{ x: 100, y: 100 }, { x: 130, y: 200 }, { x: 70, y: 200 }], label: { x: 100, y: 100 } },
    { topic: '개발', count: 3, hull: [{ x: 140, y: 100 }, { x: 170, y: 200 }, { x: 110, y: 200 }], label: { x: 140, y: 100 } }
  ];
  const at = placeRegionLabels(regions, [], { scale: 3 });
  const [a, b] = regions.map((region) => regionLabelBox(at.get(region.topic)!, region.topic, { scale: 3 }));
  const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  assert.equal(overlap, false, '화면 크기로 그린 두 이름이 겹치지 않는다');
});

test('placeRegionLabels keeps names inside the given bounds', () => {
  const hull = [{ x: 100, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 120 }, { x: 100, y: 120 }];
  const at = placeRegionLabels([{ topic: 'AI', count: 3, hull, label: { x: 100, y: 20 } }], [], { bounds: { width: 300, height: 130 } }).get('AI');
  assert.ok(at, '무대가 좁아도 이름 자리를 잡는다');
  assert.equal(at.anchor, 'end', '위는 무대 밖, 아래도 밖이면 왼쪽');
});

test('placeRegionLabels keeps a name inside the bounds even when every spot is blocked', () => {
  // 맨 위 영역은 위 자리가 무대 밖이고 나머지 세 자리는 노드로 막힌다. 겹치더라도 무대 안에 둔다.
  const hull = [{ x: 100, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 110 }, { x: 100, y: 110 }];
  const region = { topic: '철학', count: 4, hull, label: { x: 100, y: 10 } };
  const blockers = [{ x: 200, y: 140, r: 40 }, { x: 60, y: 10, r: 40 }, { x: 240, y: 10, r: 40 }];
  const bounds = { width: 400, height: 300 };
  const at = placeRegionLabels([region], blockers, { bounds }).get('철학')!;
  const box = regionLabelBox(at, '철학');
  assert.ok(box.top >= 0 && box.left >= 0 && box.right <= bounds.width && box.bottom <= bounds.height, JSON.stringify(box));
});

test('placeRegionLabels pushes a name back inside when no spot fits the bounds', () => {
  const hull = [{ x: 20, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 50 }, { x: 20, y: 50 }];
  const at = placeRegionLabels([{ topic: 'AI', count: 4, hull, label: { x: 20, y: 10 } }], [], { bounds: { width: 100, height: 60 } }).get('AI')!;
  const box = regionLabelBox(at, 'AI');
  assert.ok(box.top >= 0, `위로 잘리지 않는다: ${JSON.stringify(box)}`);
});

test('placeRegionLabels can use a margin above the bounds when the picture leaves room there', () => {
  const hull = [{ x: 100, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 110 }, { x: 100, y: 110 }];
  const region = { topic: '철학', count: 4, hull, label: { x: 100, y: 10 } };
  const at = placeRegionLabels([region], [], { bounds: { top: -60, width: 400, height: 300 } }).get('철학')!;
  assert.equal(at.anchor, 'middle');
  assert.ok(at.y < 10, '위 여백을 자리로 쓰면 영역 위에 이름을 둔다');
  assert.ok(regionLabelBox(at, '철학').top >= -60, '여백보다 위로는 나가지 않는다');
});

test('topicRegions never draws a territory for 기타', () => {
  const nodes = [{ id: 'x1', topic: '기타' }, { id: 'x2', topic: '기타' }, { id: 'x3', topic: '기타' }, { id: 'x4', topic: '기타' }];
  const positions = new Map(nodes.map((n, i) => [n.id, { x: 100 + i * 40, y: 100 + (i % 2) * 40 }]));
  assert.equal(topicRegions(nodes, positions).length, 0);
});
