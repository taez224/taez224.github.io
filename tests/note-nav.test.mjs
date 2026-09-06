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
  posts: [{ path: 'blog/a1.md', title: '1편', url: '/obsidian/posts/a1/', status: 'published' }, { path: 'blog/a2.md', title: '2편', url: '/obsidian/posts/a2/', status: 'published' }, { path: 'blog/a3.md', title: '3편', url: '/obsidian/posts/a3/', status: 'published' }]
}];

test('seriesNeighbors: 가운데 편은 앞뒤가 있고, 첫·마지막 편은 한쪽만 있다', () => {
  const middle = seriesNeighbors({ path: 'blog/a2.md' }, series);
  assert.equal(middle.title, '연재 A');
  assert.equal(middle.url, '/obsidian/posts/series-a/');
  assert.equal(middle.prev.title, '1편');
  assert.equal(middle.next.title, '3편');
  assert.equal(middle.isHub, false);
  assert.equal(middle.first.title, '1편');
  assert.equal(middle.total, 3);
  assert.equal(middle.position, 2);
  assert.deepEqual(middle.posts.map((post) => post.title), ['1편', '2편', '3편']);
  assert.equal(seriesNeighbors({ path: 'blog/a1.md' }, series).prev, null);
  assert.equal(seriesNeighbors({ path: 'blog/a3.md' }, series).next, null);
});

test('seriesNeighbors: 허브는 noteUrl로 식별하고 첫 공개 편으로 진입한다', () => {
  const hub = seriesNeighbors({ type: 'series', url: '/obsidian/posts/series-a/' }, series);
  assert.equal(hub.isHub, true);
  assert.equal(hub.first.title, '1편');
  assert.equal(hub.next.title, '1편');
  assert.equal(hub.prev, null);
  assert.equal(hub.total, 3);
  assert.equal(hub.position, 0);
});

test('seriesNeighbors: 초안은 공개 편 목록과 이웃에서 제외한다', () => {
  const withDraft = [{ ...series[0], posts: [...series[0].posts, { path: 'blog/draft.md', title: '초안', status: 'draft' }] }];
  const result = seriesNeighbors({ path: 'blog/a3.md' }, withDraft);
  assert.equal(result.total, 3);
  assert.equal(result.posts.some((post) => post.title === '초안'), false);
});

test('seriesNeighbors: 빈 연재 허브는 안전하게 반환한다', () => {
  const empty = seriesNeighbors({ type: 'series', url: '/obsidian/posts/empty/' }, [{ title: '빈 연재', noteUrl: '/obsidian/posts/empty/', posts: [] }]);
  assert.equal(empty.isHub, true);
  assert.equal(empty.first, null);
  assert.equal(empty.next, null);
  assert.equal(empty.total, 0);
  assert.equal(empty.position, 0);
});

test('seriesNeighbors: 연재가 아니면 null', () => {
  assert.equal(seriesNeighbors({ path: 'blog/solo.md' }, series), null);
  assert.equal(seriesNeighbors({ path: 'blog/a1.md' }, []), null);
});
