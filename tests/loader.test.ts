import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { vaultLoader, bookLoader, noteEntryId, isIgnoredWatchPath, watchPathsFor } from '../src/loaders/vault.ts';
import { createRefreshCoordinator } from '../src/loaders/refresh-coordinator.ts';

// Astro가 넘기는 스토어·컨텍스트와 조립 결과는 이 테스트가 쓰는 부분만 흉내 낸다.
// 흉내 낸 값이라는 사실을 이 두 도우미에서만 알리고, 본문은 실제 로더 호출과 같은 모양으로 둔다.
type LoaderArgs = Parameters<ReturnType<typeof vaultLoader>['load']>[0];
type GardenSource = NonNullable<Parameters<typeof vaultLoader>[0]>['garden'];
const asLoaderArgs = (fake: object) => fake as unknown as LoaderArgs;
// schedule로 잡아 둔 함수를 꺼내 부른다. let 변수는 콜백에서 다시 담기므로 좁히기가 이어지지 않는다.
const runScheduled = async (fn: (() => unknown) | null) => { assert.ok(fn, '갱신이 예약된다'); await fn(); };
const asGardenSource = (fake: () => Promise<unknown>) => fake as GardenSource;

interface FakeEntry { id: string; data?: Record<string, unknown>; filePath?: string; rendered?: { html: string; metadata: { headings: { depth: number; slug: string; text: string }[] } } }
interface ParseInput { id: string; data: Record<string, unknown>; filePath?: string }

const garden = {
  notes: [{ path: '20_Projects/blog/x.md', slug: 'x', kind: 'blog', title: 'X', bodyHtml: '<p>본문</p>', headings: [{ id: 'a', level: 2, title: 'A' }], outgoing: [], incoming: [] }],
  books: [{ path: '30_Resources/References/Books/b.md', slug: 'b', title: 'B', rate: 5 }]
};
function fakeStore() {
  const entries: FakeEntry[] = [];
  return { entries, clear() { entries.length = 0; }, set(entry: FakeEntry) { entries.push(entry); } };
}
const parseData = async ({ data }: ParseInput) => data;

test('vaultLoader stores notes with rendered html and Astro heading metadata', async () => {
  const store = fakeStore();
  await vaultLoader({ garden: asGardenSource(async () => garden) }).load(asLoaderArgs({ store, parseData }));
  assert.equal(store.entries.length, 1);
  const [entry] = store.entries;
  assert.ok(entry?.rendered && entry.data, '노트 항목에는 그린 본문과 데이터가 함께 들어간다');
  assert.equal(entry.id, 'posts/x');
  assert.equal(noteEntryId({ kind: 'blog', slug: 'x' }), 'posts/x');
  assert.equal(entry.rendered.html, '<p>본문</p>');
  assert.deepEqual(entry.rendered.metadata.headings, [{ depth: 2, slug: 'a', text: 'A' }]);
  assert.equal('bodyHtml' in entry.data, false);
  assert.equal(entry.data.slug, 'x');
});

test('bookLoader stores books by slug', async () => {
  const store = fakeStore();
  await bookLoader({ garden: asGardenSource(async () => garden) }).load(asLoaderArgs({ store, parseData }));
  assert.deepEqual(store.entries.map((entry) => entry.id), ['b']);
});

test('a validation failure while refreshing keeps the previous entries instead of a half-filled store', async () => {
  // 개발 서버에서 편집 중 한 항목의 검증이 실패해도, 이미 보이던 페이지가 사라지지 않아야 한다.
  const twoNotes = { ...garden, notes: [garden.notes[0], { ...garden.notes[0], path: '20_Projects/blog/y.md', slug: 'y' }] };
  const twoBooks = { ...garden, books: [garden.books[0], { ...garden.books[0], path: '30_Resources/References/Books/c.md', slug: 'c' }] };
  for (const [loader, data] of [[vaultLoader, twoNotes] as const, [bookLoader, twoBooks] as const]) {
    const store = fakeStore();
    store.set({ id: 'previous' });
    let calls = 0;
    const failSecond = async ({ data: item }: ParseInput) => { calls += 1; if (calls === 2) throw new Error('schema mismatch'); return item; };
    await assert.rejects(loader({ garden: asGardenSource(async () => data) }).load(asLoaderArgs({ store, parseData: failSecond })), /schema mismatch/);
    assert.deepEqual(store.entries.map((entry) => entry.id), ['previous']);
  }
});

test('vaultLoader gives Astro an absolute thumbnail and a site-relative entry path', async () => {
  const store = fakeStore();
  let parsed: ParseInput | undefined;
  const withImage = { ...garden, notes: [{ ...garden.notes[0], thumbnail: '20_Projects/blog/assets/cover.jpg' }] };
  await vaultLoader({ garden: asGardenSource(async () => withImage) }).load(asLoaderArgs({ store, parseData: async (input: ParseInput) => { parsed = input; return input.data; } }));
  assert.ok(parsed?.filePath && typeof parsed.data.thumbnail === 'string', 'Astro에 넘긴 값에는 파일 경로와 썸네일이 있다');
  assert.ok(path.isAbsolute(parsed.filePath));
  assert.ok(path.isAbsolute(parsed.data.thumbnail));
  assert.ok(parsed.filePath.endsWith('/20_Projects/blog/x.md'));
  assert.ok(parsed.data.thumbnail.endsWith('/20_Projects/blog/assets/cover.jpg'));
  assert.ok(store.entries[0]?.filePath && !path.isAbsolute(store.entries[0].filePath));
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
  const invalidations: number[] = [];
  const applied: [string, number][] = [];
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
  coordinator.register('notes', async (garden) => () => { applied.push(['notes', garden]); });
  coordinator.register('books', async (garden) => () => { applied.push(['books', garden]); });

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

test('refresh coordinator replaces the stores together, and none of them when one store fails validation', async () => {
  let broken = false;
  const applied: [string, string][] = [];
  const coordinator = createRefreshCoordinator({ invalidate() {}, async load() { return broken ? 'broken' : 'fresh'; } });
  // 등록한 함수는 새 항목을 검증하고 스토어를 바꿀 함수를 돌려준다. 바꾸기는 모든 스토어의 검증이 끝난 뒤에 한다.
  coordinator.register('notes', async (garden) => () => { applied.push(['notes', garden]); });
  coordinator.register('books', async (garden) => {
    if (garden === 'broken') throw new Error('book schema mismatch');
    return () => { applied.push(['books', garden]); };
  });
  await coordinator.run();
  assert.deepEqual(applied, [['notes', 'fresh'], ['books', 'fresh']]);
  broken = true;
  await assert.rejects(coordinator.run(), /book schema mismatch/);
  assert.deepEqual(applied, [['notes', 'fresh'], ['books', 'fresh']], '책 검증이 실패하면 노트 스토어도 새 상태로 바꾸지 않는다');
});

test('refresh coordinator reports a failed refresh through the logger, and a later successful refresh still applies', async () => {
  const errors: string[] = [];
  const fakeLogger = { error(message: string) { errors.push(message); }, warn() {} };
  let loadCount = 0;
  let scheduledFn: (() => unknown) | null = null;
  const applied: number[] = [];
  const coordinator = createRefreshCoordinator({
    invalidate() {},
    async load() {
      loadCount += 1;
      if (loadCount === 1) throw new Error('assembleGarden boom');
      return loadCount;
    },
    schedule(fn: () => unknown) { scheduledFn = fn; return 'timer'; },
    cancel() {},
    logger: fakeLogger
  });
  coordinator.register('notes', async (garden) => () => { applied.push(garden); });

  coordinator.scheduleRefresh('01_Slipbox/broken.md');
  await runScheduled(scheduledFn);
  assert.equal(errors.length, 1, 'the failed refresh must be reported, not swallowed silently');
  assert.match(errors[0], /assembleGarden boom/);
  assert.match(errors[0], /01_Slipbox\/broken\.md/);
  assert.equal(applied.length, 0, 'a failed load must not fill the store with anything');

  coordinator.scheduleRefresh('01_Slipbox/fixed.md');
  await runScheduled(scheduledFn);
  assert.deepEqual(applied, [2], 'a later successful refresh must still apply after a prior failure');
  assert.equal(errors.length, 1, 'the successful run must not add another error');
});

test('refresh coordinator falls back to console.error when no logger is set', async () => {
  const originalConsoleError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => calls.push(args);
  try {
    let scheduledFn: (() => unknown) | null = null;
    const coordinator = createRefreshCoordinator({
      invalidate() {},
      async load() { throw new Error('no logger boom'); },
      schedule(fn: () => unknown) { scheduledFn = fn; return 'timer'; },
      cancel() {}
    });
    coordinator.scheduleRefresh('01_Slipbox/x.md');
    await runScheduled(scheduledFn);
    assert.equal(calls.length, 1);
    assert.match(String(calls[0]?.[0]), /no logger boom/);
  } finally {
    console.error = originalConsoleError;
  }
});

test('refresh coordinator debounces rapid scheduleRefresh calls into a single run', async () => {
  let runCount = 0;
  let scheduledFn: (() => unknown) | null = null;
  const coordinator = createRefreshCoordinator({
    invalidate() { runCount += 1; },
    async load() { return runCount; },
    schedule(fn: () => unknown) { scheduledFn = fn; return 'timer'; },
    cancel() {}
  });
  coordinator.scheduleRefresh();
  coordinator.scheduleRefresh();
  coordinator.scheduleRefresh();
  assert.equal(runCount, 0, 'debounced calls must not run before the timer fires');
  await runScheduled(scheduledFn);
  assert.equal(runCount, 1);
});
