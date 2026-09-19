import test from 'node:test';
import assert from 'node:assert/strict';
import { localGraphLabelLines, localGraphLayout } from '../src/components/local-graph-layout.ts';
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
