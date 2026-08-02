/**
 * boot.js — the escape hatch from a service worker that has stopped updating.
 *
 * WHAT WENT WRONG, because this file only makes sense next to it.
 *
 * The worker reads its version from its own registration URL (`/sw.js?v=0.4.3`)
 * so the version is typed in exactly one place — see the note at the top of
 * sw.js. The cost of that, which took two releases to surface, is that
 * `public/sw.js` is then BYTE-IDENTICAL from one release to the next.
 *
 * A browser decides whether to replace a worker by re-fetching the registered
 * script and comparing bytes. Identical bytes mean no update, forever. The only
 * thing that would ever register the NEW url is `app.js` — which the running
 * worker serves from its own release's cache. So the old worker served the old
 * app.js, which asked for the old worker, which served the old app.js.
 *
 * Noah's iPad sat on 0.4.1 through two green deploys because of that loop. It
 * would not have expired on its own; nothing about it was a race or a delay.
 *
 * WHY THIS FILE IS THE FIX. One request escapes a cache-first worker: a
 * navigation, which sw.js has always handled network-first. So index.html is
 * the single channel that still reaches a stuck device, and anything that
 * unsticks it has to be reachable FROM index.html — which is this file, loaded
 * before the app and absent from every previous release's cache, so no old
 * worker can hold a copy of it.
 *
 * It is deliberately not clever. It asks the network what the current release
 * is, compares that against the caches on the device, and if a worker from some
 * other release is holding the app, it drops it and reloads once.
 */

/** Every cache this app has ever created is named `fauxplane-<version>`. */
const PREFIX = 'fauxplane-';

/** Remembers which version we have already reset for, so a pathological case
 *  reloads once rather than spinning. Session-scoped on purpose: a genuinely
 *  new release should get a fresh attempt. */
const RESET_KEY = 'fauxplane:sw-reset';

/**
 * Reads the version out of the module source, without importing it — an import
 * would be served from the very cache we are trying to check.
 */
export function parseVersion(source) {
  const m = /VERSION\s*=\s*['"]([^'"]+)['"]/.exec(source);
  return m ? m[1] : null;
}

/**
 * The whole decision, kept pure so it can be tested without a browser.
 *
 * Returns the caches that prove a worker from an older release is in charge, or
 * an empty array when there is nothing to do. THE EMPTY CASES MATTER MORE THAN
 * THE POSITIVE ONE — this function is allowed to force a reload, so every way
 * of being wrong costs the reader a page load:
 *
 *   - no caches at all: a first visit. There is no worker to be stale.
 *   - the live version's cache is present: either the right worker is running,
 *     or a new one is part-way through installing and is about to claim the
 *     page. Reloading there would interrupt the fix in progress.
 *   - caches belonging to something else on the origin: not ours to delete.
 */
export function staleShell(cacheNames, liveVersion) {
  const mine = cacheNames.filter((n) => n.startsWith(PREFIX));
  if (!mine.length) return [];
  if (!liveVersion || mine.includes(PREFIX + liveVersion)) return [];
  return mine;
}

/**
 * Asks the SERVER what the current release is.
 *
 * The cache-busting query is the point, not decoration: a cache-first worker
 * answers from `cache.match(request)`, which keys on the full URL including the
 * search string. No previous release can hold `version.js?boot=<n>`, so the
 * lookup misses and the request reaches the network — through the same worker
 * that is otherwise refusing to let anything new through.
 */
async function liveVersion() {
  const res = await fetch(`/src/core/version.js?boot=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return parseVersion(await res.text());
}

async function unstick() {
  const live = await liveVersion();
  const stale = staleShell(await caches.keys(), live);
  if (!stale.length) return;

  // Once per released version. If the reset does not take, the reader is left
  // on a working older panel rather than in a reload loop.
  if (sessionStorage.getItem(RESET_KEY) === live) return;
  sessionStorage.setItem(RESET_KEY, live);

  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  await Promise.all(stale.map((n) => caches.delete(n)));

  // Uncontrolled now, so the reload fetches index.html, boot.js and app.js from
  // the network. The new app.js registers the new worker on its own.
  location.reload();
}

// Guarded so importing this module in Node (the unit tests) is inert. Node has
// a `navigator`, but not one with serviceWorker on it, and no CacheStorage.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined') {
  // Offline is not a failure here. A device with no network keeps whatever
  // shell it has, which is the honest outcome and the one acceptance criterion
  // 5 asks for.
  unstick().catch(() => {});
}
