import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph, nodeRadius } from '../src/graph/layout.mjs';
import { renderSnapshotSvg } from '../src/graph/snapshot.mjs';

const nodes = [{ id: 'a', degree: 2, type: 'hub', displayTitle: 'A', topic: 'AI' }, { id: 'b', degree: 1, displayTitle: 'B', topic: '개발' }, { id: 'c', degree: 1, displayTitle: '아주 긴 제목이라 라벨이 되지 않는 노드', topic: '기타' }];
const edges = [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }];

test('layoutGraph is deterministic and keeps nodes inside the padded box', () => {
  const first = layoutGraph(nodes, edges, { width: 1000, height: 640 });
  const second = layoutGraph(nodes, edges, { width: 1000, height: 640 });
  assert.deepEqual([...first], [...second]);
  for (const { x, y } of first.values()) assert.ok(x >= 56 && x <= 944 && y >= 56 && y <= 584, `${x},${y}`);
  assert.equal(nodeRadius(15), 13.5);
  assert.equal(nodeRadius(40), 13.5);
  assert.equal(layoutGraph([], [], { width: 100, height: 100 }).size, 0);
});

test('renderSnapshotSvg labels hubs only and colors by topic', () => {
  const svg = renderSnapshotSvg(nodes, edges, layoutGraph(nodes, edges, { width: 1000, height: 640 }), { width: 1000, height: 640 });
  assert.match(svg, /^<svg viewBox="0 0 1000 640"/);
  assert.match(svg, />A<\/text>/);
  assert.doesNotMatch(svg, /아주 긴 제목/);
  assert.match(svg, /fill="#80698f"/);
  assert.match(svg, /fill="#5f8184"/);
  assert.equal((svg.match(/<line /g) || []).length, 2);
});
