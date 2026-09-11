import path from 'node:path';
import { getGarden, invalidateGarden, projectPaths } from '../lib/get-garden.mjs';
import { kindPrefix } from '../lib/slug.mjs';
import { BOOKS_PATH } from '../lib/books.mjs';
import { createRefreshCoordinator } from './refresh-coordinator.mjs';

export function noteEntryId(note) {
  return `${kindPrefix(note.kind)}/${note.slug}`;
}

// Roots that never need a dev watcher, even if a future config change were
// to point an include rule at them: local time-ordered logs, the scratch
// workspace, and build/tooling output.
const IGNORED_WATCH_ROOTS = ['30_Resources/Development/DevLog', '_workspace', 'dist', 'node_modules', '.astro'];

export function isIgnoredWatchPath(vaultRelativePath) {
  return IGNORED_WATCH_ROOTS.some((root) => vaultRelativePath === root || vaultRelativePath.startsWith(`${root}/`));
}

// Derives the set of absolute filesystem paths the dev watcher needs to
// observe so that editing vault content is reflected without restarting
// `astro dev`: every configured include root, the Books folder (books are
// not part of `config.include`), `config.json` itself (publication rules
// live there), and each individually reviewed attachment (assets that live
// outside any watched include root, e.g. a shared `_attachments/` folder).
export function watchPathsFor(config, { vaultRoot, projectRoot }) {
  const paths = new Set();
  for (const include of config.include ?? []) {
    if (!isIgnoredWatchPath(include.path)) paths.add(path.join(vaultRoot, include.path));
  }
  paths.add(path.join(vaultRoot, BOOKS_PATH));
  paths.add(path.join(projectRoot, 'config.json'));
  for (const asset of config.assets ?? []) paths.add(path.join(vaultRoot, asset));
  return [...paths];
}

// 새 항목을 모두 검증한 뒤에 스토어를 바꾼다. 먼저 비우면 개발 중 한 항목의 검증이 실패했을 때
// 이미 보이던 페이지까지 사라지고 앞쪽 새 항목만 남는다.
function replaceStore(store, entries) {
  store.clear();
  for (const entry of entries) store.set(entry);
}

// 새 항목을 검증하고 스토어를 바꿀 함수를 돌려준다. 여러 스토어를 함께 바꾸는 순서는 refresh-coordinator가 정한다.
function prepareNotes({ store, parseData }) {
  return async (garden) => {
    const { projectRoot, vaultRoot } = projectPaths();
    const entries = [];
    for (const note of garden.notes) {
      const { bodyHtml, ...rest } = note;
      const id = noteEntryId(note);
      const filePath = path.join(vaultRoot, note.path);
      const data = await parseData({ id, data: { ...rest, thumbnail: note.thumbnail ? path.join(vaultRoot, note.thumbnail) : null }, filePath });
      entries.push({
        id,
        data,
        filePath: path.relative(projectRoot, filePath).split(path.sep).join('/'),
        rendered: {
          html: bodyHtml,
          metadata: { headings: note.headings.map((heading) => ({ depth: heading.level, slug: heading.id, text: heading.title })) }
        }
      });
    }
    return () => replaceStore(store, entries);
  };
}

function prepareBooks({ store, parseData }) {
  return async (garden) => {
    const entries = [];
    for (const book of garden.books) entries.push({ id: book.slug, data: await parseData({ id: book.slug, data: book }) });
    return () => replaceStore(store, entries);
  };
}

// A single coordinator shared by both loaders (module singleton), so a
// filesystem event refreshes notes and books together from one reassembled
// garden instead of each loader invalidating/reloading independently.
const coordinator = createRefreshCoordinator({ invalidate: invalidateGarden, load: getGarden });

// Guards against wiring the same watcher twice: Astro calls each collection
// loader's `load()` once at startup, and both `vaultLoader` and `bookLoader`
// receive the same `context.watcher` instance, but only the first one to run
// should register paths and event listeners.
const wiredWatchers = new WeakSet();

function attachWatcher(watcher, config) {
  if (!watcher || wiredWatchers.has(watcher)) return;
  wiredWatchers.add(watcher);
  const { vaultRoot, projectRoot } = projectPaths();
  for (const watchedPath of watchPathsFor(config, { vaultRoot, projectRoot })) watcher.add(watchedPath);
  const onFsEvent = (changedPath) => coordinator.scheduleRefresh(changedPath);
  watcher.on('add', onFsEvent);
  watcher.on('change', onFsEvent);
  watcher.on('unlink', onFsEvent);
}

// 두 컬렉션 로더는 같은 조립 결과를 읽고 채우는 방식만 다르다. key는 coordinator가 재조립 뒤 다시 채울 스토어의 이름이다.
function gardenLoader({ name, key, prepareStore, garden }) {
  return {
    name,
    /** @param {import('astro/loaders').LoaderContext} context 정적 빌드에서는 watcher가 없다. */
    async load({ store, parseData, watcher, logger }) {
      coordinator.setLogger(logger);
      const prepare = prepareStore({ store, parseData });
      coordinator.register(key, prepare);
      const data = await garden();
      (await prepare(data))();
      attachWatcher(watcher, data.config);
    }
  };
}

export function vaultLoader({ garden = getGarden } = {}) {
  return gardenLoader({ name: 'vault-notes', key: 'notes', prepareStore: prepareNotes, garden });
}

export function bookLoader({ garden = getGarden } = {}) {
  return gardenLoader({ name: 'vault-books', key: 'books', prepareStore: prepareBooks, garden });
}
