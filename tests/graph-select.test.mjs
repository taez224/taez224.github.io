import test from 'node:test';
import assert from 'node:assert/strict';
import { selectGraphNodes } from '../src/graph/select.mjs';

const edge = (source, target) => ({ source, target });
const candidates = (...paths) => new Set(paths);

test('depth grows the selection outward from the seeds', () => {
  // 사슬이 간선 목록에 역방향으로 들어 있을 때의 동작. 한 번의 통과가 한 칸씩 넓힌다.
  const input = { candidates: candidates('a', 'b', 'c', 'd'), edges: [edge('c', 'd'), edge('b', 'c'), edge('a', 'b')], seeds: ['a'] };
  assert.deepEqual(selectGraphNodes({ ...input, depth: 0 }).paths, ['a']);
  assert.deepEqual(selectGraphNodes({ ...input, depth: 1 }).paths.sort(), ['a', 'b']);
  assert.deepEqual(selectGraphNodes({ ...input, depth: 2 }).paths.sort(), ['a', 'b', 'c']);
});

// 현재 동작을 그대로 고정한 테스트다. 한 번의 depth 통과가 간선 목록을 순서대로 훑으면서 방금 넣은 노드를
// 같은 통과 안에서 다시 출발점으로 쓴다. 그래서 사슬이 목록에 정방향으로 들어 있으면 depth 1이 사슬 전체를
// 끌어온다. depth를 홉 수로 만들려면 통과마다 새로 추가된 노드를 따로 모아야 한다.
test('one depth pass follows the edge list in order, so a forward chain arrives at once', () => {
  const input = { candidates: candidates('a', 'b', 'c', 'd'), edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')], seeds: ['a'] };
  assert.deepEqual(selectGraphNodes({ ...input, depth: 1 }).paths.sort(), ['a', 'b', 'c', 'd']);
});

test('a seed outside the candidates never enters the map', () => {
  const { paths } = selectGraphNodes({ candidates: candidates('a'), edges: [], seeds: ['a', '비공개'], depth: 2 });
  assert.deepEqual(paths, ['a']);
});

test('maxNodes keeps every seed and fills the rest with the best connected notes', () => {
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('b', 'd'), edge('c', 'd'), edge('d', 'e')];
  const { paths } = selectGraphNodes({ candidates: candidates('a', 'b', 'c', 'd', 'e'), edges, seeds: ['a'], depth: 4, maxNodes: 3 });
  assert.equal(paths.length, 3);
  assert.ok(paths.includes('a'), '씨앗은 연결이 적어도 남는다');
  assert.deepEqual(paths.slice(1).sort(), ['b', 'd'], '연결이 많은 순으로 채운다');
});

test('an endpoint note joins only when a regular note links it directly', () => {
  const isEndpoint = (item) => item.startsWith('dev/');
  const edges = [edge('a', 'dev/one'), edge('dev/one', 'dev/two')];
  const { paths } = selectGraphNodes({ candidates: candidates('a', 'dev/one', 'dev/two'), edges, seeds: ['a'], depth: 3, isEndpoint });
  assert.deepEqual(paths.sort(), ['a', 'dev/one'], '종점 노트는 그 너머로 뻗지 않는다');
});

test('endpoint notes that only cite each other stay out even when everything is included', () => {
  const isEndpoint = (item) => item.startsWith('dev/');
  const { paths } = selectGraphNodes({ candidates: candidates('a', 'dev/one', 'dev/two'), edges: [edge('dev/one', 'dev/two')], all: true, depth: 2, isEndpoint });
  assert.deepEqual(paths, ['a']);
});

test('degree counts every edge of the whole graph, not just the selected part', () => {
  const { degree } = selectGraphNodes({ candidates: candidates('a', 'b'), edges: [edge('a', 'b'), edge('a', 'b')], seeds: ['a'], depth: 1 });
  assert.equal(degree.get('a'), 2);
});
