/**
 * version.js — the single constant the release process bumps (Doctrine §7b).
 *
 * Everything that shows or caches a version reads it FROM HERE: the on-screen
 * build stamp, the About/BITE header, the service-worker cache name, and the
 * User-Agent the Pages Functions send upstream. Never typed twice, or it will
 * eventually report a version the code is not.
 *
 * `releases.js` is checked AGAINST this constant by `releases.test.mjs`, so the
 * release notes and the build stamp cannot describe different builds. That test
 * failed on its first run, which is how it earned its place: notes for 1.8.0
 * had been written while this line still said 1.7.4.
 *
 * The triplet is version.capability.iteration (Doctrine §7). Noah decides what
 * counts as a VERSION, and on 2026-08-03 he said this one: "Promote to main as
 * v1.0.0", with a radar page in front of him showing nineteen real aircraft.
 * The first slot moved because he moved it, which is the only thing that moves
 * it.
 */

export const VERSION = '1.13.0';

/** Cache name for the service worker. Bumping VERSION invalidates the shell. */
export const CACHE_NAME = `fauxplane-${VERSION}`;

/** Identifies us to every upstream service (Doctrine §15.2). */
export const USER_AGENT = `fauxplane/${VERSION} (+https://github.com/njefferson/fauxplane)`;
