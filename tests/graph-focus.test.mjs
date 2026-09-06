import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphNeighborhood,
  layoutDesktopFocus,
  layoutGraphFocus,
  visibleFixedLabels
} from '../src/graph/focus.mjs';

const boxFor = (position, item) => ({
  x: position.x - item.width / 2,
  y: position.y - item.height / 2,
  width: item.width,
  height: item.height
});

const boxesOverlap = (left, right, gap = 0) => left.x < right.x + right.width + gap
  && left.x + left.width + gap > right.x
  && left.y < right.y + right.height + gap
  && left.y + left.height + gap > right.y;

function assertLayoutHasNoOverlappingSlots(layout, items) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const boxes = [...layout.positions.entries()].map(([id, position]) => boxFor(position, itemById.get(id)));
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      assert.equal(boxesOverlap(boxes[left], boxes[right], 0), false,
        `layout slots overlap: ${JSON.stringify(boxes[left])} and ${JSON.stringify(boxes[right])}`);
    }
  }
}

test('graphNeighborhood keeps one hop, deduplicates node ids, and excludes neighbor-to-neighbor edges', () => {
  const nodes = [
    { id: 'root' },
    { id: 'first' },
    { id: 'first' },
    { id: 'second' },
    { id: 'second-hop' },
    { id: 'root' }
  ];
  const edges = [
    { source: 'root', target: 'first' },
    { source: 'first', target: 'root' },
    { source: 'root', target: 'second' },
    { source: 'first', target: 'second' },
    { source: 'second', target: 'first' },
    { source: 'second', target: 'second-hop' }
  ];

  const result = graphNeighborhood('root', nodes, edges);

  assert.deepEqual(result.nodes.map((node) => node.id), ['root', 'first', 'second']);
  assert.deepEqual(result.edges, [
    { source: 'root', target: 'first' },
    { source: 'first', target: 'root' },
    { source: 'root', target: 'second' }
  ]);
  assert.ok(result.edges.every((edge) => edge.source === 'root' || edge.target === 'root'));
});

test('graphNeighborhood returns an isolated root with no edges', () => {
  const result = graphNeighborhood('solo', [{ id: 'solo' }, { id: 'other' }], []);

  assert.deepEqual(result, { nodes: [{ id: 'solo' }], edges: [] });
});

test('layoutGraphFocus uses measured title sizes for desktop slots and keeps title boxes apart', () => {
  const items = [
    { id: 'root', width: 80, height: 24 },
    { id: 'alpha', width: 240, height: 24 },
    { id: 'beta', width: 120, height: 68 },
    { id: 'gamma', width: 160, height: 24 },
    { id: 'delta', width: 100, height: 24 }
  ];
  const layout = layoutGraphFocus('root', items, 1024, 1);

  assert.equal(layout.positions.size, items.length);
  assert.equal(layout.positions.get('root').x, 512);
  assert.equal(layout.positions.get('root').y, layout.height / 2);
  assert.ok(layout.positions.get('alpha').x < layout.positions.get('gamma').x);
  assert.ok(layout.positions.get('gamma').y > layout.positions.get('alpha').y);
  assert.ok(layout.height > 360);
  assertLayoutHasNoOverlappingSlots(layout, items);
});

test('layoutGraphFocus adapts to mobile width and measured height without moving existing slots sideways', () => {
  const shortItems = [
    { id: 'root', width: 72, height: 20 },
    { id: 'a', width: 180, height: 20 },
    { id: 'b', width: 180, height: 20 },
    { id: 'c', width: 180, height: 20 }
  ];
  const tallItems = shortItems.map((item) => item.id === 'a' ? { ...item, height: 96 } : item);
  const shortLayout = layoutGraphFocus('root', shortItems, 360, 2);
  const tallLayout = layoutGraphFocus('root', tallItems, 360, 2);

  assert.equal(shortLayout.positions.get('root').y, shortLayout.height / 2);
  assert.equal(tallLayout.positions.get('root').y, tallLayout.height / 2);
  assert.equal(shortLayout.positions.get('a').x, 180);
  assert.equal(shortLayout.positions.get('b').x, 180);
  assert.equal(shortLayout.positions.get('c').x, 180);
  assert.ok(tallLayout.positions.get('b').y > shortLayout.positions.get('b').y);
  assert.ok(tallLayout.height > shortLayout.height);
  assertLayoutHasNoOverlappingSlots(tallLayout, tallItems);
});

test('layoutGraphFocus leaves an isolated node usable and returns an empty layout for an unknown root', () => {
  const isolated = layoutGraphFocus('solo', [{ id: 'solo', width: 180, height: 52 }], 375, 2);
  assert.deepEqual([...isolated.positions.keys()], ['solo']);
  assert.ok(isolated.height >= 180);
  assertLayoutHasNoOverlappingSlots(isolated, [{ id: 'solo', width: 180, height: 52 }]);

  const empty = layoutGraphFocus('missing', [{ id: 'solo', width: 180, height: 52 }], 375, 2);
  assert.equal(empty.positions.size, 0);
  assert.equal(empty.height, 700);
});

test('visibleFixedLabels gives overlapping labels to selected titles first and keeps coordinates unchanged', () => {
  const labels = [
    { id: 'unselected', x: 20, y: 20, width: 100, height: 18, selected: false },
    { id: 'selected', x: 24, y: 22, width: 100, height: 18, selected: true },
    { id: 'free', x: 180, y: 20, width: 60, height: 18, selected: false }
  ];
  const before = structuredClone(labels);

  assert.deepEqual(visibleFixedLabels(labels, [], { width: 300, height: 100 }), ['selected', 'free']);
  assert.deepEqual(labels, before);
});

test('visibleFixedLabels hides labels behind node obstacles while preserving input objects and positions', () => {
  const labels = [
    { id: 'blocked', x: 40, y: 42, width: 80, height: 18, selected: false },
    { id: 'selected-over-node', x: 40, y: 42, width: 80, height: 18, selected: true },
    { id: 'visible', x: 180, y: 42, width: 80, height: 18, selected: false }
  ];
  const nodeBoxes = [{ id: 'node', x: 20, y: 20, width: 130, height: 80 }];
  const beforeLabels = structuredClone(labels);
  const beforeNodes = structuredClone(nodeBoxes);

  assert.deepEqual(
    visibleFixedLabels(labels, nodeBoxes, { width: 300, height: 120 }),
    ['selected-over-node', 'visible']
  );
  assert.deepEqual(labels, beforeLabels);
  assert.deepEqual(nodeBoxes, beforeNodes);
});

test('visibleFixedLabels ignores labels outside bounds without changing their coordinates', () => {
  const labels = [
    { id: 'left', x: -40, y: 10, width: 20, height: 20, selected: false },
    { id: 'right', x: 101, y: 10, width: 20, height: 20, selected: false },
    { id: 'inside', x: 10, y: 10, width: 20, height: 20, selected: false }
  ];
  const before = structuredClone(labels);

  assert.deepEqual(visibleFixedLabels(labels, [], { width: 100, height: 50 }), ['inside']);
  assert.deepEqual(labels, before);
});


test('full titles wrap between words when possible', async () => {
  const { graphTitleLines } = await import('../src/graph/focus.mjs');
  assert.deepEqual(graphTitleLines('가능해야 한다', 10), ['가능해야 한다']);
  const title = '산출물이 팀의 자산이 되려면 판단 추적 복구가 가능해야 한다';
  const lines = graphTitleLines(title, 16);
  assert.equal(lines.join(' '), title);
  assert.ok(lines.every(line => [...line].length <= 16));
});

test('layoutDesktopFocus keeps readable two-column slots at narrow desktop widths', () => {
  const nodes = [
    { id: 'root', displayTitle: '중앙 시작점' },
    { id: 'left', displayTitle: '왼쪽에 놓이는 긴 제목과 설명' },
    { id: 'right', displayTitle: '오른쪽에 놓이는 긴 제목과 설명' }
  ];
  const layout = layoutDesktopFocus('root', nodes, 626);
  assert.equal(layout.maxChars, 16);
  assert.deepEqual(layout.positions.get('root'), { x: 313, y: layout.height / 2 });
  assert.equal(layout.positions.get('left').x, 36);
  assert.equal(layout.positions.get('right').x, 590);
  assert.ok([...layout.labelLines.values()].flat().every((line) => [...line].length <= 16));
  assert.ok(layout.height >= 420);
});
