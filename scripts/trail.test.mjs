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
