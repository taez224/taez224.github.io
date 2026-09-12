import test from 'node:test';
import assert from 'node:assert/strict';
import { panelModel } from '../src/lib/panel.ts';

const hubNote = { path: 'a.md', title: 'A', displayTitle: 'A', url: '/obsidian/notes/a/', kind: 'slipbox' as const, type: 'hub', date: '2026-07-12', topic: 'AI', publicTags: ['AI', '개발'], summary: '자동 발췌', summaryIsExplicit: false };
const plainNote = { path: 'b.md', title: 'B', displayTitle: 'B', url: '/obsidian/notes/b/', kind: 'slipbox' as const, type: '', date: '2026-08-01', topic: 'AI', publicTags: ['AI'], summary: '명시 요약', summaryIsExplicit: true };
const devNote = { path: 'c.md', title: 'C', displayTitle: 'C', url: '/obsidian/dev/c/', kind: 'development' as const, category: 'Concepts' as const, type: '', date: '', topic: '개발', publicTags: ['개발/설계'], summary: '', summaryIsExplicit: false };
// 조회 결과가 아니라 만든 노트를 그대로 넘긴다. 테스트가 보는 것은 패널 모델이지 Map 조회가 아니다.
const notes = new Map<string, typeof hubNote | typeof plainNote | typeof devNote>([['a.md', hubNote], ['b.md', plainNote], ['c.md', devNote]]);
const edges = [{ source: 'a.md', target: 'b.md' }, { source: 'c.md', target: 'a.md' }, { source: 'a.md', target: 'private.md' }];

test('panelModel builds meta, topic dots and reference lists from public edges only', () => {
  const model = panelModel(hubNote, notes, edges);
  assert.deepEqual([model.kind, model.date, model.isHub, model.title, model.url], ['노트', '2026.07.12', true, 'A', '/obsidian/notes/a/']);
  assert.deepEqual(model.topics.map((t) => t.name), ['AI', '개발']);
  assert.equal(model.topics[0].color, '#80698f');
  const folded = panelModel(hubNote, notes, edges, { 개발: '기타' });
  assert.equal(folded.topics[1].color, '#817f72', '접힌 주제의 점은 기타 색');
  assert.equal(model.summary, '');
  assert.deepEqual(model.outgoing, [{ path: 'b.md', title: 'B', url: '/obsidian/notes/b/' }]);
  assert.deepEqual(model.incoming, [{ path: 'c.md', title: 'C', url: '/obsidian/dev/c/' }]);
});

test('panelModel shows explicit summaries and category labels for development notes', () => {
  assert.equal(panelModel(plainNote, notes, edges).summary, '명시 요약');
  const dev = panelModel(devNote, notes, edges);
  assert.equal(dev.kind, '개념·설계');
  assert.deepEqual(dev.topics.map((t) => t.name), ['설계']);
});
