import path from 'node:path';
import { getGarden, invalidateGarden, projectPaths } from '../lib/get-garden.mjs';
import { kindPrefix } from '../lib/slug.mjs';
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
  paths.add(path.join(vaultRoot, '30_Resources/References/Books'));
  paths.add(path.join(projectRoot, 'config.json'));
  for (const asset of config.assets ?? []) paths.add(path.join(vaultRoot, asset));
  return [...paths];
}

function fillNotesStore({ store, parseData }) {
  return async (garden) => {
    store.clear();
    for (const note of garden.notes) {
      const { bodyHtml, ...rest } = note;
      const id = noteEntryId(note);
      const data = await parseData({ id, data: rest });
      store.set({
        id,
        data,
        rendered: {
          html: bodyHtml,
          metadata: { headings: note.headings.map((heading) => ({ depth: heading.level, slug: heading.id, text: heading.title })) }
        }
      });
    }
  };
}

function fillBooksStore({ store, parseData }) {
  return async (garden) => {
    store.clear();
    for (const book of garden.books) {
      const data = await parseData({ id: book.slug, data: book });
      store.set({ id: book.slug, data });
    }
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

export function vaultLoader({ garden = getGarden } = {}) {
  return {
    name: 'vault-notes',
    async load({ store, parseData, watcher, logger }) {
      coordinator.setLogger(logger);
      const fill = fillNotesStore({ store, parseData });
      coordinator.register('notes', fill);
      const data = await garden();
      await fill(data);
      attachWatcher(watcher, data.config);
    }
  };
}

export function bookLoader({ garden = getGarden } = {}) {
  return {
    name: 'vault-books',
    async load({ store, parseData, watcher, logger }) {
      coordinator.setLogger(logger);
      const fill = fillBooksStore({ store, parseData });
      coordinator.register('books', fill);
      const data = await garden();
      await fill(data);
      attachWatcher(watcher, data.config);
    }
  };
}
