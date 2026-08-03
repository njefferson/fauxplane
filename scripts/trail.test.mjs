/**
 * trail.test.mjs — the observed path of a followed aircraft.
 *
 * Noah: "I also want to view the flight path/plan of a followed flight."
 *
 * This is the PATH — where the aircraft has actually been, every point of it a
 * position this panel was told at a time it was told it. It is deliberately not
 * a flight PLAN: ADS-B carries no intent, so where an aircraft means to go is
 * not in the broadcast and is not invented here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { appendTrail } from '../public/src/data/traffic.js';

const p = (lat, lon, at) => ({ lat, lon, at, altFt: 30000 });

test('TRAIL: positions accumulate in the order they were heard', () => {
  let t = [];
  t = appendTrail(t, p(38.6, -121.0, 1000));
  t = appendTrail(t, p(38.7, -121.0, 2000));
  assert.equal(t.length, 2);
  assert.equal(t[0].at, 1000);
});

test('TRAIL: the same position heard twice is not stored twice', () => {
  // The followed aircraft is polled harder than it broadcasts, so identical
  // positions arrive repeatedly. Storing them would weight a stationary
  // aircraft's trail by how often we asked rather than by where it went.
  let t = [];
  t = appendTrail(t, p(38.6, -121.0, 1000));
  t = appendTrail(t, p(38.6, -121.0, 2000));
  t = appendTrail(t, p(38.6, -121.0, 3000));
  assert.equal(t.length, 1);
});

test('TRAIL: an incomplete position is refused rather than stored as a hole', () => {
  let t = [];
  t = appendTrail(t, { lat: null, lon: -121, at: 1000 });
  t = appendTrail(t, { lat: 38.6, lon: undefined, at: 1000 });
  t = appendTrail(t, { lat: 38.6, lon: -121, at: null });
  t = appendTrail(t, null);
  assert.deepEqual(t, []);
});

test('TRAIL: it is bounded by COUNT, so a long follow cannot grow without limit', () => {
  let t = [];
  for (let i = 0; i < 500; i += 1) t = appendTrail(t, p(38 + i / 10000, -121, 1000 + i * 1000), { maxPoints: 240 });
  assert.equal(t.length, 240);
  // The OLDEST are dropped: a trail is about where it has been recently.
  assert.equal(t[t.length - 1].at, 1000 + 499 * 1000);
});

test('TRAIL: it is bounded by AGE as well', () => {
  let t = [p(38.0, -121, 0)];
  t = appendTrail(t, p(38.5, -121, 60 * 60_000), { maxAgeMs: 45 * 60_000 });
  assert.equal(t.length, 1, 'an hour-old point is dropped from a 45-minute trail');
  assert.equal(t[0].at, 60 * 60_000);
});

test('TRAIL: nothing is interpolated between observations', () => {
  // The gaps are information. A receiver dropout looks like a gap because it
  // WAS one, and a smooth curve through sparse points would be a drawing of a
  // flight path rather than a record of one.
  let t = [];
  t = appendTrail(t, p(38.0, -121.0, 0));
  t = appendTrail(t, p(39.0, -121.0, 600_000)); // ten minutes later, 60 nm on
  assert.equal(t.length, 2, 'exactly what was heard, and nothing in between');
});

/* ------------------------------------------------- a failed refresh is not an empty sky */

import { createTrafficSource } from '../public/src/data/traffic.js';

/**
 * A source whose /api/traffic answers are scripted.
 *
 * Driven through `fetchImpl` — the SAME seam the browser uses — rather than
 * through a private hook. The first version of this stubbed a `fetchJson`
 * option that does not exist, so the source fell through to the real `fetch`
 * and returned nothing; the test failed for the right reason and for none of
 * the reasons it was about.
 */
const sourceWith = (replies) => {
  let i = 0;
  let t = 1000;
  return createTrafficSource({
    state: { write() {}, fail() {} },
    clock: () => (t += 1000),
    fetchImpl: async () => {
      const body = replies[Math.min(i++, replies.length - 1)];
      return {
        ok: body.ok !== false,
        status: body.ok === false ? 502 : 200,
        json: async () => body,
      };
    },
  });
};

const FIELDS = {
  'position.lat': { provenance: 'LIVE', value: 38.69, at: 0 },
  'position.lon': { provenance: 'LIVE', value: -120.97, at: 0 },
};
const TWO = { ok: true, aircraft: [
  { hex: 'a1', lat: 38.8, lon: -121.0, callsign: 'UAL1' },
  { hex: 'b2', lat: 38.6, lon: -120.9, callsign: 'DAL2' },
] };

test('RADAR: a FAILED refresh keeps the aircraft already on the plan view', () => {
  // Noah: "The radar loses everything when you change range." Each range is a
  // different cache key upstream, so tapping through them issues real requests
  // — and one rate-limited reply used to wipe every aircraft off the screen.
  // The reader sees "no traffic" and believes it, which is the one lie a radar
  // page must never tell.
  const traffic = sourceWith([TWO, { ok: false, reason: 'rate limited' }]);
  return traffic
    .refreshNearby(FIELDS, 40)
    .then(() => {
      assert.equal(traffic.nearby.length, 2, 'the first fetch must land');
      return traffic.refreshNearby(FIELDS, 80);
    })
    .then(() => {
      assert.equal(traffic.nearby.length, 2, 'a failed refresh emptied the sky');
    });
});

test('RADAR: kept aircraft do NOT claim to be freshly updated', () => {
  // Stale data wearing a new timestamp is a worse lie than blanking it. The
  // display age comes from when the aircraft last CHANGED, not from the last
  // attempt to change them.
  const traffic = sourceWith([TWO, { ok: false, reason: 'rate limited' }]);
  return traffic
    .refreshNearby(FIELDS, 40)
    .then(() => traffic.last.nearbyAt)
    .then((first) =>
      traffic.refreshNearby(FIELDS, 80).then((after) => {
        assert.equal(after.nearbyAt, first, 'the age was reset by a failed fetch');
        assert.ok(after.at > first, 'while the ATTEMPT time did move on');
      }),
    );
});
