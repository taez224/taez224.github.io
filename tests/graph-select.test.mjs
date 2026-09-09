import test from 'node:test';
import assert from 'node:assert/strict';
import { selectGraphNodes } from '../src/graph/select.mjs';

const edge = (source, target) => ({ source, target });
const candidates = (...paths) => new Set(paths);
const isEndpoint = (item) => item.startsWith('dev/');

test('every candidate is on the map, in candidate order', () => {
  const { paths } = selectGraphNodes({ candidates: candidates('b', 'a'), edges: [edge('a', 'b')] });
  assert.deepEqual(paths, ['b', 'a']);
});

test('an endpoint note joins only when a regular note links it directly', () => {
  const edges = [edge('a', 'dev/one'), edge('dev/one', 'dev/two')];
  const { paths } = selectGraphNodes({ candidates: candidates('a', 'dev/one', 'dev/two'), edges, isEndpoint });
  assert.deepEqual(paths.sort(), ['a', 'dev/one'], '종점 노트는 그 너머로 뻗지 않는다');
});

test('endpoint notes that only cite each other stay out', () => {
  const { paths } = selectGraphNodes({ candidates: candidates('a', 'dev/one', 'dev/two'), edges: [edge('dev/one', 'dev/two')], isEndpoint });
  assert.deepEqual(paths, ['a']);
});

test('degree counts every edge of the whole graph, including edges to notes outside the candidates', () => {
  const { degree } = selectGraphNodes({ candidates: candidates('a'), edges: [edge('a', 'b'), edge('a', 'b')] });
  assert.equal(degree.get('a'), 2);
});
