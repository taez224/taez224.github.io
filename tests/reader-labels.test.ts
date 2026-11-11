import test from 'node:test';
import assert from 'node:assert/strict';
import { orientReaderLabels, type ReaderLabel } from '../src/graph/reader-labels.ts';
import type { Box, Point } from '../src/graph/types.ts';

function vertical(id: string, point: Point, box: Box, top: number, bottom: number): ReaderLabel {
  return { id, variants: [
    { placement: 'below', point, box },
    { placement: 'above', point: { x: point.x, y: top + bottom - point.y }, box: { ...box, top: top + bottom - box.bottom, bottom: top + bottom - box.top } }
  ] };
}
const labels = [
  vertical('a', { x: 0, y: 50 }, { left: -10, right: 10, top: 65, bottom: 85 }, 37.5, 90),
  vertical('b', { x: 100, y: 0 }, { left: 50, right: 150, top: 15, bottom: 55 }, -12.5, 60)
];
test('a title below an upper neighbor moves above its dot to clear an approaching edge', () => {
  const before = structuredClone(labels);
  assert.equal(orientReaderLabels(labels, [{ source: 'a', target: 'b' }]).get('b'), 'above');
  assert.deepEqual(labels, before, '측정한 노드 상자와 좌표는 바꾸지 않는다');
});
test('a neighboring edge can move a title sideways even when it does not connect to that node', () => {
  const nodes: ReaderLabel[] = [
    vertical('a', { x: 0, y: 0 }, { left: -20, right: -5, top: -40, bottom: -20 }, -45, 5),
    vertical('b', { x: 100, y: 100 }, { left: 105, right: 120, top: 110, bottom: 130 }, 95, 135),
    { id: 'middle', variants: [
      { placement: 'below', point: { x: 50, y: 30 }, box: { left: 30, right: 70, top: 40, bottom: 60 } },
      { placement: 'right', point: { x: 30, y: 30 }, box: { left: 60, right: 85, top: 20, bottom: 40 } }
    ] }
  ];
  assert.equal(orientReaderLabels(nodes, [{ source: 'a', target: 'b' }]).get('middle'), 'right');
});
test('titles keep their original placement when no edge crosses them', () => {
  assert.ok([...orientReaderLabels(labels, []).values()].every(p => p === 'below'));
  const clear = labels.map(n => ({ ...n, variants: n.variants.map(v => ({ ...v, box: { ...v.box, top: 200, bottom: 220 } })) }));
  assert.ok([...orientReaderLabels(clear, [{ source: 'a', target: 'b' }]).values()].every(p => p === 'below'));
});
