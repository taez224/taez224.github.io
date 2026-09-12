import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineGraph } from '../src/lib/graph-data.ts';
import { inlineJson } from '../src/lib/format.ts';

const nodes = [
  { id: 'a.md', title: 'A', displayTitle: 'A', url: '/notes/a/', type: 'hub', topic: 'AI', degree: 9, isEntry: true, path: 'a.md', mapKey: 'notes/a', tags: ['AI'], date: '2026-01-01', summaryIsExplicit: true },
  { id: 'b.md', title: 'B', displayTitle: 'B', url: '/notes/b/', type: 'permanent', topic: '개발', degree: 1, isEntry: false, path: 'b.md', mapKey: 'notes/b', tags: [], date: '2026-01-02' },
  { id: 'c.md', title: 'C', url: '/notes/c/', type: 'permanent', topic: '기타', degree: 0, isEntry: false, path: 'c.md', mapKey: 'notes/c' }
];
const edges = [{ source: 'a.md', target: 'b.md', kind: 'link', weight: 2 }];
const positions = new Map([['a.md', { x: 10.5, y: 20 }], ['b.md', { x: 30, y: 40 }]]);

test('inlineGraph with positions keeps only what the hero engine draws and drops nodes without a position', () => {
  const data = inlineGraph(nodes, edges, { positions });
  assert.deepEqual(data.nodes.map((n) => n.id), ['a.md', 'b.md'], 'c has no position');
  assert.deepEqual(Object.keys(data.nodes[0]).sort(), ['degree', 'id', 'isEntry', 'title', 'topic', 'type', 'url']);
  assert.deepEqual(data.edges, [{ source: 'a.md', target: 'b.md' }]);
  assert.deepEqual(data.positions, [['a.md', { x: 10.5, y: 20 }], ['b.md', { x: 30, y: 40 }]]);
  assert.equal(JSON.stringify(data).includes('tags'), false);
});

test('inlineGraph without positions keeps every node and can add the fields the map page needs', () => {
  const data = inlineGraph(nodes, edges, { extra: ['path', 'mapKey'] });
  assert.equal(data.nodes.length, 3);
  assert.deepEqual(Object.keys(data.nodes[2]).sort(), ['degree', 'id', 'isEntry', 'mapKey', 'path', 'title', 'topic', 'type', 'url']);
  assert.equal('positions' in data, false);
});

test('inlineJson escapes < so a title cannot close the inline script', () => {
  assert.equal(inlineJson({ t: '</script><b>' }), '{"t":"\\u003c/script>\\u003cb>"}');
});

import { inlinePanelNotes } from '../src/lib/graph-data.ts';

test('inlinePanelNotes keeps the panel fields, only explicit summaries, and indexes note edges by position', () => {
  const notes = [
    { path: 'a.md', title: 'A', displayTitle: 'A', url: '/notes/a/', kind: 'slipbox', category: null, date: '2026-01-01', publicTags: ['AI'], summary: '명시한 요약', summaryIsExplicit: true, headings: [{ id: 'x' }], bodyText: 'LONG', slug: 'a' },
    { path: 'b.md', title: 'B', displayTitle: 'B', url: '/dev/b/', kind: 'development', category: 'Tools', date: '2026-01-02', publicTags: [], summary: '본문에서 뽑은 요약', summaryIsExplicit: false, headings: [] }
  ];
  const noteEdges = [{ source: 'a.md', target: 'b.md' }, { source: 'b.md', target: 'missing.md' }];
  const data = inlinePanelNotes(notes, noteEdges, { 글쓰기: '기타' });
  assert.deepEqual(Object.keys(data.notes[0]).sort(), ['category', 'date', 'kind', 'path', 'publicTags', 'summary', 'summaryIsExplicit', 'title', 'url']);
  assert.equal(data.notes[0].summary, '명시한 요약');
  assert.equal(data.notes[1].summary, '', '본문 발췌 요약은 패널에 안 쓰니 싣지 않는다');
  assert.deepEqual(data.noteEdges, [[0, 1]], '양 끝이 모두 있는 간선만, 위치 색인으로');
  assert.deepEqual(data.topicFold, { 글쓰기: '기타' });
  assert.equal(JSON.stringify(data).includes('LONG'), false);
});
