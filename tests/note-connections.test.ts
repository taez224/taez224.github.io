import test from 'node:test';
import assert from 'node:assert/strict';
import { noteConnections } from '../src/lib/note-connections.ts';
import type { PublicNote } from '../src/lib/content-model.ts';
import type { seriesNeighbors } from '../src/lib/note-nav.ts';

const note = (name: string) => ({ path: `${name}.md`, url: `/notes/${name}/`, displayTitle: name }) as PublicNote;
const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(note);

test('a note linked both ways is listed once under the mutual group', () => {
  const blocks = noteConnections([a, b, c], [b, d], null);
  assert.deepEqual(blocks.map(block => [block.label, block.items.map(n => n.displayTitle)]), [
    ['서로 언급한 글', ['b']],
    ['이 글에서 언급한 글', ['a', 'c']],
    ['이 글을 언급한 글', ['d']]
  ]);
});

test('empty groups are dropped and series posts are left out of every group', () => {
  const series = { total: 2, url: '/notes/a/', posts: [{ url: '/notes/b/' }] } as unknown as ReturnType<typeof seriesNeighbors>;
  const blocks = noteConnections([a, b, c], [b], series);
  assert.deepEqual(blocks.map(block => [block.label, block.items.map(n => n.displayTitle)]), [['이 글에서 언급한 글', ['c']]]);
});
