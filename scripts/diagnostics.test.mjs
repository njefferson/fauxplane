/**
 * diagnostics.test.mjs — the report has to be right about ITSELF.
 *
 * This is the instrument used to diagnose every other instrument, and it had no
 * test. The specific bug it grew: it read the live attitude filter at
 * `snapshot.t`, the timestamp of the last publish, which is up to a frame old
 * by the time somebody presses the version stamp. The filter keeps accepting
 * samples in that window, so "how long since the last accepted sample" came out
 * NEGATIVE — `coasting -9ms`, `-21ms`, `-34ms`, in every report the owner ever sent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReport } from '../public/src/panels/diagnostics.js';

/** A filter that last accepted a sample at t=1000 and reports its own age. */
const fusionAt = (lastAcceptedAt, seen) => ({
  read(at) {
    seen.push(at);
    return {
      hasAttitude: true,
      pitch: 0,
      roll: 0,
      heading: 90,
      residualDeg: 0.3,
      acceptedSamples: 1292,
      coastingMs: at - lastAcceptedAt,
      quality: 'ALIGNED',
      converged: true,
      still: true,
      rejecting: false,
      aligned: true,
      reason: null,
      gyroBias: { alpha: 0, beta: 0, gamma: 0, samples: 1292 },
    };
  },
  get mountOffset() {
    return null;
  },
  get gyroBias() {
    return { alpha: 0, beta: 0, gamma: 0, samples: 1292 };
  },
});

const snapshotAt = (t) => ({ t, fields: {} });

test('REPORT: the filter is read at the moment the report is asked for', () => {
  // The publish that produced the snapshot was 11 ms ago; a sample landed 1 ms
  // after it. Reading at snapshot.t is what produced the negative.
  const seen = [];
  buildReport({ snapshot: snapshotAt(5000), fusion: fusionAt(5001, seen), bootAt: 0, now: 5011 });
  assert.deepEqual(seen, [5011], 'the filter must be read at `now`, not at the snapshot timestamp');
});

test('REPORT: coasting is never reported as a negative age', () => {
  const seen = [];
  const text = buildReport({ snapshot: snapshotAt(5000), fusion: fusionAt(5001, seen), bootAt: 0, now: 5011 });
  const line = text.split('\n').find((l) => l.includes('coasting'));
  assert.ok(line, 'the report must carry a coasting line');
  assert.ok(
    !/coasting\s+-\d/.test(line),
    `a reading cannot have been accepted in the future — got "${line?.trim()}"`,
  );
});

test('REPORT: without `now` it still works, falling back to the snapshot', () => {
  // The parameter is optional so a caller that has no clock — a test, or a
  // replay of a captured snapshot — still gets a report rather than a throw.
  const seen = [];
  const text = buildReport({ snapshot: snapshotAt(5000), fusion: fusionAt(4000, seen), bootAt: 0 });
  assert.deepEqual(seen, [5000]);
  assert.ok(text.includes('coasting 1000ms'));
});

test('REPORT: no second clock is used for anything that gets SUBTRACTED', async () => {
  // The app ages everything against ONE clock, the store's. `Date.now()` as a
  // FALLBACK for the report's own time base was a second clock in the ageing
  // path, and it is gone.
  //
  // The console capture still stamps with Date.now(), and that is correct and
  // deliberate: those stamps are printed as wall-clock ISO strings and never
  // differenced against anything. The rule is about arithmetic, not about the
  // identifier — so this test bans the fallback pattern rather than the call.
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../public/src/panels/diagnostics.js', import.meta.url),
    'utf8',
  );
  assert.ok(!/\?\?\s*Date\.now\(\)/.test(source), 'the report must not fall back to a second clock');
  assert.ok(/iso\(entry\.at\)/.test(source), 'console stamps stay wall-clock, printed not subtracted');
});

test('REPORT: a device that never got a position fix still gets a report', () => {
  // THE BUG THIS FILE WAS WRITTEN FOR. `undefined?.provenance !== 'FAIL'` is
  // true, so an unwritten position field went down the rounding path and threw
  // on `field.value` — killing the whole report. The device with no fix is
  // exactly the device somebody presses the version stamp on.
  const seen = [];
  const text = buildReport({
    snapshot: { t: 5000, fields: {} }, // not one field ever written
    fusion: fusionAt(4990, seen),
    bootAt: 0,
    now: 5000,
  });
  assert.ok(text.includes('position.lat'), 'the field table still lists position');
  assert.ok(text.includes('ALL FIELDS'));
});

test('REPORT: a filter returning undefined readings does not throw', () => {
  // `=== null` was the guard, so `undefined.toFixed()` threw. A report that
  // crashes on a half-dead filter is useless precisely when it is needed.
  const text = buildReport({
    snapshot: { t: 5000, fields: {} },
    fusion: { read: () => ({ hasAttitude: false }), mountOffset: null, gyroBias: null },
    bootAt: 0,
    now: 5000,
  });
  assert.ok(text.includes('ATTITUDE FILTER'));
  assert.ok(text.includes('pitch —'), 'a missing angle prints as a dash, not a crash');
});

/**
 * A FIELD THAT NEEDS A MODE THE PANEL IS NOT IN IS NOT A FAILURE.
 *
 * The owner's report read "8 of 41 fields failed" on a panel that was working. Five
 * had genuinely failed; three were the followed-aircraft autopilot readouts,
 * which cannot have a value unless an aircraft is being followed — this device
 * has no autopilot to read. Counting them inflates the headline on a healthy
 * panel, and a count that treats "inapplicable" as "broken" teaches the reader
 * to discount the number. That is the one thing this report cannot afford.
 */
test('the failure count excludes fields that need a followed aircraft', () => {
  const seen = [];
  // The three autopilot fields, FAILED — which is their state on every panel
  // that is not following an aircraft.
  const withNavFailed = (t) => ({
    t,
    fields: {
      'nav.selectedAltitude': { provenance: 'FAIL', value: null, reason: 'not yet initialised' },
      'nav.selectedHeading': { provenance: 'FAIL', value: null, reason: 'not yet initialised' },
      'nav.crewQnh': { provenance: 'FAIL', value: null, reason: 'not yet initialised' },
    },
  });

  const notFollowing = buildReport({
    snapshot: withNavFailed(5000),
    fusion: fusionAt(5001, seen),
    traffic: { isFollowing: false },
    bootAt: 0,
    now: 5011,
  });
  const following = buildReport({
    snapshot: withNavFailed(5000),
    fusion: fusionAt(5001, seen),
    traffic: { isFollowing: true },
    bootAt: 0,
    now: 5011,
  });

  const failedCount = (text) => Number(text.match(/(\d+) of \d+ fields failed/)[1]);

  assert.match(notFollowing, /NOT APPLICABLE \(3\)/, 'the three autopilot fields were not set aside');
  assert.doesNotMatch(following, /NOT APPLICABLE/, 'while following, those fields ARE applicable');
  assert.equal(
    failedCount(following) - failedCount(notFollowing),
    3,
    'exactly the three autopilot fields should move between the two counts',
  );
});

test('a field with a VALUE is never set aside as inapplicable', () => {
  // The opposite failure, and the worse one: hiding a real reading because of a
  // declared mode. If it has a value it is applicable, whatever the mode says.
  const seen = [];
  const text = buildReport({
    snapshot: {
      t: 5000,
      fields: { 'nav.selectedAltitude': { provenance: 'LIVE', value: 35000, reason: null, ageMs: 10 } },
    },
    fusion: fusionAt(5001, seen),
    traffic: { isFollowing: false },
    bootAt: 0,
    now: 5011,
  });
  const block = text.slice(text.indexOf('NOT APPLICABLE'));
  assert.ok(
    !/NOT APPLICABLE[^\n]*\n\s*[^\n]*nav\.selectedAltitude/.test(block),
    'a field carrying a real value was hidden as "not applicable"',
  );
});
