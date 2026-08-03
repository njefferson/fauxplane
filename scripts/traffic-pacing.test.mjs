import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { POLICIES } from '../functions/api/_lib.js';
import { FETCH_RANGE_NM, RADAR_RANGE_NM, withRangeAndBearing, withinRange } from '../public/src/data/traffic.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The client's intervals are plain constants in app.js, which imports the whole
 * browser world and cannot be loaded here. Reading them as text is the honest
 * option: it fails loudly if either is renamed, which is the only way this
 * check could silently stop measuring anything.
 */
async function clientIntervals() {
  const src = await readFile(path.join(repo, 'public', 'src', 'app.js'), 'utf8');
  const read = (name) => {
    const m = src.match(new RegExp(`const ${name} = ([0-9_]+);`));
    assert.ok(m, `${name} not found in app.js — this test has stopped measuring anything`);
    return Number(m[1].replace(/_/g, ''));
  };
  return { traffic: read('TRAFFIC_INTERVAL_MS'), follow: read('FOLLOW_INTERVAL_MS') };
}

test('the edge cache outlives the poll interval, or it does nothing', async () => {
  // THE DEFECT THIS EXISTS FOR. The TTLs were 8 s and 5 s against polls of 10 s
  // and 5 s: every entry expired just before the poll that would have used it,
  // so every request went upstream and Noah was rate limited off the radar
  // repeatedly. Both files' comments claimed the caching worked. Prose did not
  // catch it; arithmetic does.
  const { traffic, follow } = await clientIntervals();

  assert.ok(
    POLICIES.traffic.cacheSeconds * 1000 > traffic,
    `nearby cache ${POLICIES.traffic.cacheSeconds}s does not outlive the ${traffic / 1000}s poll — every poll would miss`,
  );
  assert.ok(
    POLICIES.traffic.callsignCacheSeconds * 1000 > follow,
    `followed cache ${POLICIES.traffic.callsignCacheSeconds}s does not outlive the ${follow / 1000}s poll — every poll would miss`,
  );
});

test('each cache TTL is at least twice its poll, so most polls never leave the edge', async () => {
  // Merely "greater than" leaves a one-second margin that clock skew erases.
  const { traffic, follow } = await clientIntervals();
  assert.ok(POLICIES.traffic.cacheSeconds * 1000 >= traffic * 2, 'nearby cache is under 2x its poll');
  assert.ok(POLICIES.traffic.callsignCacheSeconds * 1000 >= follow * 2, 'followed cache is under 2x its poll');
});

test('the panel never polls faster than the tightest published limit', async () => {
  // adsb.fi publishes 1 req/s and counts invalid requests against it. This is
  // about our own restraint, not their ceiling — but the ceiling is still a
  // ceiling (Doctrine §15.6).
  const { traffic, follow } = await clientIntervals();
  assert.ok(traffic >= 1000 && follow >= 1000);
});

test('one radius is fetched, and it is the widest the panel offers', () => {
  // `dist` is part of the Function's cache key, so a per-range fetch meant four
  // cache entries and four upstream requests for the same sky — and tapping
  // through four range buttons is the obvious thing to do with four buttons.
  assert.equal(FETCH_RANGE_NM, Math.max(...RADAR_RANGE_NM));
});

test('a narrower range is a filter over what was already fetched', () => {
  // DRIVEN THROUGH THE REAL PRODUCER, not through hand-written distances. The
  // first version of this test invented a field name, `withinRange` read the
  // same invented name, and the pair agreed with each other while filtering
  // every real aircraft away. A fixture written from the same assumption as the
  // code under test proves the assumption is self-consistent and nothing else.
  const centre = { lat: 38.68, lon: -121.0 };
  const withDistance = withRangeAndBearing(
    [
      { hex: 'close', lat: 38.75, lon: -121.0 }, // ~4 nm
      { hex: 'mid', lat: 39.0, lon: -121.0 }, // ~19 nm
      { hex: 'far', lat: 39.55, lon: -121.0 }, // ~52 nm
    ],
    centre,
  );

  // The producer's own numbers, so a rename breaks this loudly rather than
  // quietly emptying the sky.
  for (const a of withDistance) assert.ok(Number.isFinite(a.distanceNm), `${a.hex} has no distance`);

  assert.deepEqual(withinRange(withDistance, 10).map((a) => a.hex), ['close']);
  assert.deepEqual(withinRange(withDistance, 25).map((a) => a.hex), ['close', 'mid']);
  assert.deepEqual(withinRange(withDistance, 80).map((a) => a.hex), ['close', 'mid', 'far']);
});

test('an aircraft with no computed distance is dropped, not drawn at the centre', () => {
  // A missing distance is a missing measurement. Treating it as zero would put
  // an unknown-position aircraft on top of the reader.
  const aircraft = [{ hex: 'x', distanceNm: null }, { hex: 'y' }, { hex: 'z', distanceNm: 3 }];
  assert.deepEqual(withinRange(aircraft, 40).map((a) => a.hex), ['z']);
});

test('every provider is asked for a radius the Function will accept', async () => {
  // An out-of-range dist is a 400, and adsb.fi counts invalid requests against
  // the rate limit — so an over-wide fetch would spend the budget on nothing.
  const src = await readFile(path.join(repo, 'functions', 'api', 'traffic.js'), 'utf8');
  const m = src.match(/MAX_DIST_NM\s*=\s*(\d+)/);
  assert.ok(m, 'MAX_DIST_NM not found');
  assert.ok(FETCH_RANGE_NM <= Number(m[1]), `fetch radius ${FETCH_RANGE_NM} exceeds the Function's cap ${m[1]}`);
});
