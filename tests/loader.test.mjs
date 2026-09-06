import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { vaultLoader, bookLoader, noteEntryId, isIgnoredWatchPath, watchPathsFor } from '../src/loaders/vault.mjs';
import { createRefreshCoordinator } from '../src/loaders/refresh-coordinator.mjs';

const garden = {
  notes: [{ path: '20_Projects/blog/x.md', slug: 'x', kind: 'blog', title: 'X', bodyHtml: '<p>본문</p>', headings: [{ id: 'a', level: 2, title: 'A' }], outgoing: [], incoming: [] }],
  books: [{ path: '30_Resources/References/Books/b.md', slug: 'b', title: 'B', rate: 5 }]
};
function fakeStore() {
  const entries = [];
  return { entries, clear() { entries.length = 0; }, set(entry) { entries.push(entry); } };
}
const parseData = async ({ data }) => data;

test('vaultLoader stores notes with rendered html and Astro heading metadata', async () => {
  const store = fakeStore();
  await vaultLoader({ garden: async () => garden }).load({ store, parseData });
  assert.equal(store.entries.length, 1);
  const [entry] = store.entries;
  assert.equal(entry.id, 'posts/x');
  assert.equal(noteEntryId(garden.notes[0]), 'posts/x');
  assert.equal(entry.rendered.html, '<p>본문</p>');
  assert.deepEqual(entry.rendered.metadata.headings, [{ depth: 2, slug: 'a', text: 'A' }]);
  assert.equal('bodyHtml' in entry.data, false);
  assert.equal(entry.data.slug, 'x');
});

test('bookLoader stores books by slug', async () => {
  const store = fakeStore();
  await bookLoader({ garden: async () => garden }).load({ store, parseData });
  assert.deepEqual(store.entries.map((entry) => entry.id), ['b']);
});

test('isIgnoredWatchPath excludes DevLog, _workspace and build output roots', () => {
  assert.equal(isIgnoredWatchPath('30_Resources/Development/DevLog'), true);
  assert.equal(isIgnoredWatchPath('30_Resources/Development/DevLog/daily/2026-09-06.md'), true);
  assert.equal(isIgnoredWatchPath('_workspace'), true);
  assert.equal(isIgnoredWatchPath('dist'), true);
  assert.equal(isIgnoredWatchPath('node_modules'), true);
  assert.equal(isIgnoredWatchPath('.astro'), true);
  assert.equal(isIgnoredWatchPath('30_Resources/Development/Concepts'), false);
  assert.equal(isIgnoredWatchPath('01_Slipbox'), false);
});

test('watchPathsFor watches every include root, Books, config.json and reviewed assets', () => {
  const vaultRoot = '/vault';
  const projectRoot = '/vault/20_Projects/obsidian-garden';
  const config = {
    include: [
      { path: '01_Slipbox' },
      { path: '30_Resources/Development/DevLog' }
    ],
    assets: ['_attachments/reviewed.svg']
  };
  const paths = watchPathsFor(config, { vaultRoot, projectRoot });
  assert.ok(paths.includes(path.join(vaultRoot, '01_Slipbox')));
  assert.ok(!paths.includes(path.join(vaultRoot, '30_Resources/Development/DevLog')));
  assert.ok(paths.includes(path.join(vaultRoot, '30_Resources/References/Books')));
  assert.ok(paths.includes(path.join(projectRoot, 'config.json')));
  assert.ok(paths.includes(path.join(vaultRoot, '_attachments/reviewed.svg')));
});

test('refresh coordinator serializes overlapping refreshes so a slow older run cannot clobber a newer one', async () => {
  let loadCount = 0;
  const invalidations = [];
  const applied = [];
  const coordinator = createRefreshCoordinator({
    invalidate() { invalidations.push(loadCount); },
    async load() {
      loadCount += 1;
      const generation = loadCount;
      // The first load is slow, simulating a full garden reassembly that
      // is still in flight when a second filesystem event arrives.
      await new Promise((resolve) => setTimeout(resolve, generation === 1 ? 20 : 0));
      return generation;
    }
  });
  coordinator.register('notes', async (garden) => { applied.push(['notes', garden]); });
  coordinator.register('books', async (garden) => { applied.push(['books', garden]); });

  const first = coordinator.run();
  const second = coordinator.run();
  await Promise.all([first, second]);

  assert.equal(loadCount, 2);
  // Both stores are refreshed for every run (one coordinating function
  // manages both), and the final applied generation is the latest one -
  // run 1 finishing after run 2 started would violate this.
  assert.deepEqual(applied.map(([name]) => name), ['notes', 'books', 'notes', 'books']);
  assert.deepEqual(applied.map(([, garden]) => garden), [1, 1, 2, 2]);
});

test('refresh coordinator debounces rapid scheduleRefresh calls into a single run', async () => {
  let runCount = 0;
  let scheduledFn = null;
  const coordinator = createRefreshCoordinator({
    invalidate() { runCount += 1; },
    async load() { return runCount; },
    schedule(fn) { scheduledFn = fn; return 'timer'; },
    cancel() {}
  });
  coordinator.scheduleRefresh();
  coordinator.scheduleRefresh();
  coordinator.scheduleRefresh();
  assert.equal(runCount, 0, 'debounced calls must not run before the timer fires');
  await scheduledFn();
  assert.equal(runCount, 1);
});
