/**
 * diagnostics.test.mjs — the report has to be right about ITSELF.
 *
 * This is the instrument used to diagnose every other instrument, and it had no
 * test. The specific bug it grew: it read the live attitude filter at
 * `snapshot.t`, the timestamp of the last publish, which is up to a frame old
 * by the time somebody presses the version stamp. The filter keeps accepting
 * samples in that window, so "how long since the last accepted sample" came out
 * NEGATIVE — `coasting -9ms`, `-21ms`, `-34ms`, in every report Noah ever sent.
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
