import test from 'node:test';
import assert from 'node:assert/strict';
import { localGraphLabelLines, localGraphLayout } from '../src/components/local-graph-layout.ts';
import { offsetLine } from '../src/graph/edge-geometry.ts';
import { estimateTextWidth } from '../src/graph/label.ts';

const note = (id: string) => ({ path: id, displayTitle: id, url: `/notes/${id}/`, topic: 'AI' });

test('localGraphLayout places the center in the middle and neighbors on a ring with direction', () => {
  const layout = localGraphLayout(note('c'), [note('a'), note('b')], [note('b'), note('d')], { width: 310, height: 190 });
  const ids = layout.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
  const center = layout.nodes.find((n) => n.id === 'c');
  assert.ok(center, '가운데 노트가 배치에 있다');
  assert.deepEqual([center.x, center.y], [155, 95]);
  assert.deepEqual(layout.edges.map((e) => e.direction).sort(), ['both', 'in', 'out']);
  for (const edge of layout.edges) assert.ok(edge.x1 >= 0 && edge.x2 <= 310 && edge.y1 >= 0 && edge.y2 <= 190);
});

test('localGraphLayout carries each node url so the reader graph can link', () => {
  const layout = localGraphLayout({ path: 'c.md', displayTitle: 'C', topic: 'AI', url: '/obsidian/notes/c/' }, [{ path: 'a.md', displayTitle: 'A', topic: 'AI', url: '/obsidian/notes/a/' }], [], { width: 310, height: 190 });
  assert.equal(layout.nodes[0].url, '/obsidian/notes/c/');
  assert.equal(layout.nodes[1].url, '/obsidian/notes/a/');
});

test('localGraphLayout caps neighbors at six so two-line titles stay readable, and reports the remainder', () => {
  const many = Array.from({ length: 12 }, (_, i) => note(`n${i}`));
  const layout = localGraphLayout(note('c'), many, [], { width: 310, height: 190 });
  assert.equal(layout.nodes.length, 7);
  assert.equal(layout.hidden, 6);
});

test('localGraphLabelLines breaks between words and keeps up to two lines', () => {
  assert.deepEqual(localGraphLabelLines('AI 활용'), ['AI 활용'], '짧은 제목은 한 줄 그대로');
  assert.deepEqual(localGraphLabelLines('AI Agent 시대의 Human Agency'), ['AI Agent 시대의', 'Human Agency'], '두 줄에 다 들어가면 줄임표가 없다');
  assert.deepEqual(localGraphLabelLines('Taste는 지금 필요한 것에 무게를 두는 감각이다'), ['Taste는 지금', '필요한 것에 무게를…']);
});

test('localGraphLabelLines keeps every line inside the label width, even for one very long word', () => {
  for (const title of ['Supercalifragilisticexpialidociousandmorewords', '아주아주길게붙여쓴한국어제목이라서단어경계가없는경우', 'AI 시대의 판단력은 맥락을 실행 기준으로 바꾸는 능력이다']) {
    const lines = localGraphLabelLines(title);
    assert.ok(lines.length <= 2, title);
    for (const line of lines) assert.ok(estimateTextWidth(line, 11) <= 100, `${line} (${estimateTextWidth(line, 11)})`);
    assert.ok(title.startsWith(lines.join(' ').replace(/…$/, '').split(' ')[0]), '제목의 앞부분을 보인다');
  }
});

test('local graph titles sit above upper neighbors and below the rest', () => {
  const layout = localGraphLayout(note('c'), Array.from({ length: 6 }, (_, i) => note(`n${i}`)), [], { width: 310, height: 190 });
  for (const node of layout.nodes.filter((n) => !n.current)) {
    const label = node.label!;
    if (node.y < 95) assert.ok(label.y < node.y, `${node.id}의 제목은 노드 위에 있다`);
    else assert.ok(label.y > node.y, `${node.id}의 제목은 노드 아래에 있다`);
  }
});

test('local graph titles never overlap each other, the nodes or the center, for one to six neighbors', () => {
  const long = (i: number) => ({ ...note(`n${i}`), displayTitle: `AI 시대의 판단력은 맥락을 실행 기준으로 바꾸는 능력이다 ${i}` });
  type Box = { left: number; right: number; top: number; bottom: number };
  const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (let count = 1; count <= 6; count += 1) {
    const layout = localGraphLayout(note('c'), Array.from({ length: count }, (_, i) => long(i)), [], { width: 310, height: 190 });
    const boxes = layout.nodes.filter((n) => !n.current).map((n) => ({ id: n.id, box: n.label!.box }));
    const center = { left: 155 - 22, right: 155 + 22, top: 95 - 17, bottom: 95 + 34 };
    const circles = layout.nodes.map((n) => ({ id: n.id, box: { left: n.x - 8, right: n.x + 8, top: n.y - 8, bottom: n.y + 8 } }));
    for (const [i, a] of boxes.entries()) {
      assert.ok(a.box.left >= 0 && a.box.right <= 310, `${count}개: ${a.id} 제목이 그래프 폭 안에 있다`);
      assert.ok(!overlap(a.box, center), `${count}개: ${a.id} 제목이 가운데 노드와 겹치지 않는다`);
      for (const b of boxes.slice(i + 1)) assert.ok(!overlap(a.box, b.box), `${count}개: ${a.id}와 ${b.id} 제목이 겹치지 않는다`);
      for (const c of circles) assert.ok(!overlap(a.box, c.box), `${count}개: ${a.id} 제목이 ${c.id} 노드를 덮지 않는다`);
    }
  }
});

// 기본 글자를 작게 설정하면 rem으로 정한 사이드바가 205px보다 좁아진다(크롬 「아주 작게」 9px에서 146px).
// 어느 폭에서도 제목 크기를 지키고, 겹치면 그리는 이웃을 줄인다.
test('narrow graph layouts keep full-size labels inside the frame and apart', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ ...note(`n${i}`), displayTitle: 'AI 시대의 판단력은 맥락을 실행 기준으로 바꾸는 능력이다' }));
  for (let width = 140; width <= 279; width += 1) for (let count = 1; count <= 6; count++) {
    const layout = localGraphLayout(note('c'), many.slice(0, count), [], { width, height: 240 });
    assert.ok(layout.nodes.length - 1 >= 1 && layout.nodes.length - 1 <= Math.min(count, 4), `${width}px: 이웃을 하나 이상, 넷 이하로 그린다`);
    assert.equal(layout.nodes.length - 1 + layout.hidden, count, `${width}px: 덜어 낸 이웃은 hidden으로 알린다`);
    if (width >= 205) assert.equal(layout.nodes.length - 1, Math.min(count, 4), `${width}px: 205px 이상에서는 넷까지 그린다`);
    const labels = layout.nodes.flatMap(n => n.label ? [n.label.box] : []);
    for (const [i, box] of labels.entries()) {
      assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= 240);
      for (const other of labels.slice(i + 1)) assert.ok(!(box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom));
    }
  }
});

// "이 노트" 아래에 이웃이 있으면 관계선이 글자 사이를 관통했다. 모든 폭과 이웃 수에서 관계선·이웃 제목·점을 피하는지 본다.
test('the center label keeps clear of every edge, neighbor title and dot', () => {
  type Box = { left: number; right: number; top: number; bottom: number };
  const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  // 선을 1px 간격으로 따라가며 글자 상자에 들어오는지 본다. 상호 참조는 벌린 두 선을 모두 본다.
  const touches = (line: { x1: number; y1: number; x2: number; y2: number }, box: Box) => {
    const steps = Math.ceil(Math.hypot(line.x2 - line.x1, line.y2 - line.y1));
    return Array.from({ length: steps + 1 }, (_, i) => i / steps).some((t) => {
      const x = line.x1 + (line.x2 - line.x1) * t, y = line.y1 + (line.y2 - line.y1) * t;
      return x > box.left && x < box.right && y > box.top && y < box.bottom;
    });
  };
  const long = (i: number) => ({ ...note(`n${i}`), displayTitle: `AI 시대의 판단력은 맥락을 실행 기준으로 바꾸는 능력이다 ${i}` });
  // 사이드바 폭은 연속해서 바뀌므로 1px마다 본다. 데스크톱 사이드바 폭(220·260·310px)에서는 판 없이 비어 있는 자리를 찾아야 한다.
  // 휴대폰 폭에 이웃이 많으면 빈자리가 없을 수 있고, 그때는 글자 뒤의 판이 선을 가리므로 관계선 검사만 건너뛴다.
  for (let width = 140; width <= 310; width += 1) for (let count = 1; count <= 6; count += 1) {
    const height = width < 280 ? 240 : 190;
    const neighbors = Array.from({ length: count }, (_, i) => long(i));
    const layout = localGraphLayout(note('c'), neighbors, neighbors.slice(0, 1), { width, height });
    const { box, clear } = layout.centerLabel;
    const label = `${width}px, 이웃 ${count}개`;
    assert.ok(box.left >= 0 && box.right <= width, `${label}: 이 노트가 그래프 폭 안에 있다`);
    if ([220, 260, 310].includes(width)) assert.ok(clear, `${label}: 데스크톱 폭에서는 빈자리를 찾는다`);
    if (clear) for (const edge of layout.edges) {
      const lines = edge.direction === 'both' ? [offsetLine({ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }, 1), offsetLine({ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }, -1)] : [edge];
      for (const line of lines) assert.ok(!touches(line, box), `${label}: 관계선이 이 노트를 지나지 않는다`);
    }
    for (const node of layout.nodes.filter((n) => !n.current)) {
      assert.ok(!overlap(box, node.label!.box), `${label}: ${node.id} 제목과 겹치지 않는다`);
      assert.ok(!overlap(box, { left: node.x - 8, right: node.x + 8, top: node.y - 8, bottom: node.y + 8 }), `${label}: ${node.id} 점과 겹치지 않는다`);
    }
  }
});
