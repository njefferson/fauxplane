/**
 * boot.test.mjs — the stale-service-worker escape hatch.
 *
 * These tests exist because the thing they cover is allowed to FORCE A PAGE
 * RELOAD. Every false positive costs the reader a reload they did not ask for,
 * and a false positive that repeats is a reload loop — a worse failure than the
 * stale panel it is trying to fix. So the empty-result cases are tested harder
 * than the one case that acts.
 *
 * Importing the module is safe here: it guards its side effect on a navigator
 * that has serviceWorker, which Node's does not.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseVersion, staleShell } from '../public/boot.js';
import { VERSION } from '../public/src/core/version.js';

test('BOOT: the version is read out of the module source, not imported', () => {
  // Imported it would come from the cache under suspicion, which is the whole
  // problem. Read as text from a cache-busted URL, it comes from the server.
  assert.equal(parseVersion("export const VERSION = '0.4.4';"), '0.4.4');
  assert.equal(parseVersion('export const VERSION = "1.2.3";'), '1.2.3');
  assert.equal(parseVersion('const CACHE = `fauxplane-${VERSION}`;'), null);
  assert.equal(parseVersion(''), null);
});

test('BOOT: the real version.js parses — this is what the fetch actually reads', () => {
  // Guards the regex against a future reformat of version.js. If someone
  // switches to double quotes or adds a type annotation, this fails here rather
  // than silently disabling the escape hatch on every device.
  const source = "export const VERSION = '" + VERSION + "';";
  assert.equal(parseVersion(source), VERSION);
});

test('BOOT: a worker from an older release is detected', () => {
  // the owner's iPad, exactly: stuck on 0.4.1 while the server had 0.4.3.
  assert.deepEqual(staleShell(['fauxplane-0.4.1'], '0.4.3'), ['fauxplane-0.4.1']);
});

test('BOOT: a first visit does not reload', () => {
  // No caches means no worker, so there is nothing stale. Reloading a
  // first-time visitor would be a bug that only ever shows up in the wild.
  assert.deepEqual(staleShell([], '0.4.4'), []);
});

test('BOOT: the current release does not reload', () => {
  assert.deepEqual(staleShell(['fauxplane-0.4.4'], '0.4.4'), []);
});

test('BOOT: a new worker part-way through installing is left alone', () => {
  // Both caches exist between a new worker's install and its activate, which
  // deletes the old one. Unregistering in that window would tear down the fix
  // while it was working, and the next load would do it again.
  assert.deepEqual(staleShell(['fauxplane-0.4.3', 'fauxplane-0.4.4'], '0.4.4'), []);
});

test('BOOT: another app on the same origin is never touched', () => {
  // caches.keys() is per-ORIGIN, not per-app. Deleting a cache we did not make
  // would break a neighbour to fix ourselves.
  assert.deepEqual(staleShell(['photo-pointer-2.1', 'some-other-cache'], '0.4.4'), []);
  assert.deepEqual(staleShell(['photo-pointer-2.1', 'fauxplane-0.4.1'], '0.4.4'), ['fauxplane-0.4.1']);
});

test('BOOT: an unreadable version never triggers a reload', () => {
  // liveVersion() returns null when the fetch fails or the source cannot be
  // parsed. That is the offline case and the deploy-broken case, and in both of
  // them the shell on the device is the best thing available.
  assert.deepEqual(staleShell(['fauxplane-0.4.1'], null), []);
  assert.deepEqual(staleShell(['fauxplane-0.4.1'], ''), []);
});
