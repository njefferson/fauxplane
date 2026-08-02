/**
 * version.js — the single constant the release process bumps (Doctrine §7b).
 *
 * Everything that shows or caches a version reads it FROM HERE: the on-screen
 * build stamp, the About/BITE header, the service-worker cache name, and the
 * User-Agent the Pages Functions send upstream. Never typed twice, or it will
 * eventually report a version the code is not.
 *
 * The triplet is version.capability.iteration (Doctrine §7). Noah decides what
 * counts as a VERSION, so the first slot stays 0 until he says otherwise; this
 * release bumps the CAPABILITY slot, because the app can now do something it
 * could not do before.
 */

export const VERSION = '0.1.0';

/** Cache name for the service worker. Bumping VERSION invalidates the shell. */
export const CACHE_NAME = `fauxplane-${VERSION}`;

/** Identifies us to every upstream service (Doctrine §15.2). */
export const USER_AGENT = `fauxplane/${VERSION} (+https://github.com/njefferson/fauxplane)`;
