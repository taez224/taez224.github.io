import test from 'node:test';
import assert from 'node:assert/strict';
import { parentLink, seriesNeighbors } from '../src/lib/note-nav.mjs';

test('parentLink: 글은 글 목록, 개발 노트는 개발 노트 목록, 노트는 지도(이 노트 선택)로 간다', () => {
  assert.deepEqual(parentLink({ kind: 'blog' }), { label: '글', path: '/posts/', listLabel: '글 목록' });
  assert.deepEqual(parentLink({ kind: 'development', category: 'Concepts' }), { label: '개념·설계', path: '/dev/', listLabel: '개발 노트 목록' });
  assert.deepEqual(parentLink({ kind: 'slipbox' }, 'notes/ai-활용'), { label: '노트', path: '/map/?node=notes%2Fai-%ED%99%9C%EC%9A%A9', listLabel: '노트 지도' });
  assert.equal(parentLink({ kind: 'slipbox' }).path, '/map/');
});

const series = [{
  title: '연재 A', noteUrl: '/obsidian/posts/series-a/',
  posts: [{ path: 'blog/a1.md', title: '1편', url: '/obsidian/posts/a1/' }, { path: 'blog/a2.md', title: '2편', url: '/obsidian/posts/a2/' }, { path: 'blog/a3.md', title: '3편', url: '/obsidian/posts/a3/' }]
}];

test('seriesNeighbors: 가운데 편은 앞뒤가 있고, 첫·마지막 편은 한쪽만 있다', () => {
  const middle = seriesNeighbors({ path: 'blog/a2.md' }, series);
  assert.equal(middle.title, '연재 A');
  assert.equal(middle.url, '/obsidian/posts/series-a/');
  assert.equal(middle.prev.title, '1편');
  assert.equal(middle.next.title, '3편');
  assert.equal(seriesNeighbors({ path: 'blog/a1.md' }, series).prev, null);
  assert.equal(seriesNeighbors({ path: 'blog/a3.md' }, series).next, null);
});

test('seriesNeighbors: 연재가 아니면 null', () => {
  assert.equal(seriesNeighbors({ path: 'blog/solo.md' }, series), null);
  assert.equal(seriesNeighbors({ path: 'blog/a1.md' }, []), null);
});
