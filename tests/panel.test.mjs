import test from 'node:test';
import assert from 'node:assert/strict';
import { panelModel } from '../src/lib/panel.mjs';

const notes = new Map([
  ['a.md', { path: 'a.md', title: 'A', displayTitle: 'A', url: '/obsidian/notes/a/', kind: 'slipbox', type: 'hub', date: '2026-07-12', topic: 'AI', publicTags: ['AI', '소프트웨어공학'], summary: '자동 발췌', summaryIsExplicit: false }],
  ['b.md', { path: 'b.md', title: 'B', displayTitle: 'B', url: '/obsidian/notes/b/', kind: 'slipbox', type: '', date: '2026-08-01', topic: 'AI', publicTags: ['AI'], summary: '명시 요약', summaryIsExplicit: true }],
  ['c.md', { path: 'c.md', title: 'C', displayTitle: 'C', url: '/obsidian/dev/c/', kind: 'development', category: 'Concepts', type: '', date: '', topic: '개발', publicTags: ['개발/설계'], summary: '', summaryIsExplicit: false }]
]);
const edges = [{ source: 'a.md', target: 'b.md' }, { source: 'c.md', target: 'a.md' }, { source: 'a.md', target: 'private.md' }];

test('panelModel builds meta, topic dots and reference lists from public edges only', () => {
  const model = panelModel(notes.get('a.md'), notes, edges);
  assert.deepEqual([model.kind, model.date, model.isHub, model.title, model.url], ['노트', '2026.07.12', true, 'A', '/obsidian/notes/a/']);
  assert.deepEqual(model.topics.map((t) => t.name), ['AI', '소프트웨어공학']);
  assert.equal(model.topics[0].color, '#80698f');
  assert.equal(model.summary, '');
  assert.deepEqual(model.outgoing, [{ title: 'B', url: '/obsidian/notes/b/' }]);
  assert.deepEqual(model.incoming, [{ title: 'C', url: '/obsidian/dev/c/' }]);
});

test('panelModel shows explicit summaries and category labels for development notes', () => {
  assert.equal(panelModel(notes.get('b.md'), notes, edges).summary, '명시 요약');
  const dev = panelModel(notes.get('c.md'), notes, edges);
  assert.equal(dev.kind, '개념·설계');
  assert.deepEqual(dev.topics.map((t) => t.name), ['설계']);
});
