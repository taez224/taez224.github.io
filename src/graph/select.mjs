// 지도에 올릴 노트를 고른다. 씨앗과 읽기 경로에서 출발해 depth만큼 이웃으로 넓히고, 너무 많으면 연결이 많은 순으로
// 자른 뒤, 종점 노트를 정리한다. 경로 규칙이나 vault 사정은 모르고 후보 집합과 간선만 본다.
//
// 종점(isEndpoint) 규칙: 개발 노트처럼 종점으로 지정한 노트는 일반 노트가 직접 링크할 때만 지도에 들어온다.
// 종점끼리 서로를 인용하는 사슬은 나머지를 끌어오지 않고, 서로만 인용하는 짝은 아예 빠진다.
export function selectGraphNodes({
  candidates, edges, seeds = [], pathItems = [], depth = 0,
  maxNodes = Infinity, isEndpoint = () => false, all = false
}) {
  const required = new Set([...seeds, ...pathItems].filter((item) => candidates.has(item)));

  const selected = all ? new Set(candidates) : new Set(required);
  for (let level = 0; level < depth; level += 1) {
    for (const edge of edges) {
      if (selected.has(edge.source)) selected.add(edge.target);
      if (selected.has(edge.target)) selected.add(edge.source);
    }
  }

  const degree = new Map();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  let paths = [...selected];
  if (paths.length > maxNodes) {
    const optional = paths
      .filter((item) => !required.has(item))
      .sort((left, right) => (degree.get(right) ?? 0) - (degree.get(left) ?? 0));
    paths = [...required, ...optional.slice(0, maxNodes - required.size)];
  }

  const inGraph = new Set(paths);
  const adjacency = new Map();
  for (const edge of edges) {
    if (!inGraph.has(edge.source) || !inGraph.has(edge.target)) continue;
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const bucket = adjacency.get(from);
      if (bucket) bucket.push(to);
      else adjacency.set(from, [to]);
    }
  }
  const reached = new Set(paths.filter((item) => !isEndpoint(item)));
  const queue = [...reached];
  while (queue.length) {
    const current = queue.pop();
    if (isEndpoint(current)) continue; // 종점에서 더 뻗지 않는다.
    for (const next of adjacency.get(current) ?? []) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  }

  return { paths: paths.filter((item) => !isEndpoint(item) || reached.has(item)), degree };
}
