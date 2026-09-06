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
  cancel = (handle) => clearTimeout(handle)
} = {}) {
  const fillers = new Map();
  let timer = null;
  let tail = Promise.resolve();

  function register(name, fill) {
    fillers.set(name, fill);
  }

  function unregister(name) {
    fillers.delete(name);
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

  function scheduleRefresh() {
    if (timer !== null) cancel(timer);
    timer = schedule(() => {
      timer = null;
      return run().catch(() => {
        // Errors are surfaced to whoever calls run() directly; swallow here
        // so one bad refresh doesn't take down the dev server's
        // unhandled-rejection handler.
      });
    }, debounceMs);
  }

  return { register, unregister, run, scheduleRefresh };
}
