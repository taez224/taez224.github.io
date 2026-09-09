// Coordinates re-filling multiple Content Layer stores (notes, books) from a
// single shared, invalidate-then-reload cycle, so that:
//   1. A filesystem event only ever triggers ONE garden reassembly that both
//      stores read from (no duplicate `invalidateGarden()` + `getGarden()`
//      calls racing each other).
//   2. Overlapping refresh requests never run concurrently. Runs are chained
//      strictly one after another (a promise-chain mutex), so a slow older
//      run can never finish after a newer run and clobber the store with
//      stale data - the store always ends up reflecting whichever run
//      started last.
//
// This module has no dependency on Astro or the filesystem - `invalidate`
// and `load` are injected, and `schedule`/`cancel` default to timers but can
// be swapped out in tests for deterministic, timer-free behaviour.
export function createRefreshCoordinator({
  invalidate,
  load,
  debounceMs = 200,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
  logger
} = {}) {
  const fillers = new Map();
  let timer = null;
  let tail = Promise.resolve();
  let currentLogger = logger;
  let pendingPath = null;

  function register(name, fill) {
    fillers.set(name, fill);
  }

  function unregister(name) {
    fillers.delete(name);
  }

  // Astro's LoaderContext.logger is only available inside a loader's load(),
  // not at module-import time when the coordinator singleton is built - so
  // loaders call this once they have one.
  function setLogger(nextLogger) {
    currentLogger = nextLogger;
  }

  function reportError(error, triggeringPath) {
    const detail = triggeringPath ? ` (triggered by ${triggeringPath})` : '';
    const message = `Vault refresh failed${detail}: ${error?.message ?? error}`;
    if (currentLogger && typeof currentLogger.error === 'function') {
      currentLogger.error(message);
    } else {
      console.error(message, error);
    }
  }

  async function runOnce() {
    invalidate();
    const garden = await load();
    for (const fill of fillers.values()) {
      await fill(garden);
    }
    return garden;
  }

  // Chains this run strictly after whatever is already in flight (or already
  // queued), so runs never overlap. Each run re-invalidates and reloads, so
  // it always reflects the freshest filesystem state at the time it starts.
  function run() {
    tail = tail.then(runOnce, runOnce);
    return tail;
  }

  function scheduleRefresh(triggeringPath) {
    if (triggeringPath !== undefined) pendingPath = triggeringPath;
    if (timer !== null) cancel(timer);
    timer = schedule(() => {
      timer = null;
      const path = pendingPath;
      pendingPath = null;
      // Errors are surfaced to whoever calls run() directly; here (the
      // debounced fs-event path) we report through the logger instead of
      // swallowing, so a bad refresh (e.g. invalid frontmatter mid-edit, a
      // slug collision) doesn't leave the dev server silently serving stale
      // content with zero diagnostic output. A later successful refresh
      // still applies normally - run() re-invalidates and reloads from
      // scratch every time, it doesn't get stuck on the failure.
      return run().catch((error) => {
        reportError(error, path);
      });
    }, debounceMs);
  }

  return { register, unregister, run, scheduleRefresh, setLogger };
}
