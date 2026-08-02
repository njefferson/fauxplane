/**
 * stationary.test.mjs — zero is a measurement.
 *
 * Noah, holding a panel that crossed out groundspeed on a desk: "Why can you
 * not show ground speed of zero?? Why can't you tell a wiggle isn't vertical
 * acceleration when stationary?"
 *
 * Both were the same defect. A missing reading is a FAIL, and that rule is
 * right — but "the platform handed me null" is not the same fact as "the
 * quantity is unknowable", and this app had been treating them as one. A
 * receiver that is not moving HAS a groundspeed, and the two fixes it is made
 * of were already in hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createVsi, groundspeedFromFixes, metresBetween } from '../public/src/core/derive.js';

const KT = 0.514444; // m/s per knot

test('DISTANCE: a tenth of a degree of latitude is about 11.1 km', () => {
  const d = metresBetween({ lat: 38.6, lon: -120.97 }, { lat: 38.7, lon: -120.97 });
  assert.ok(Math.abs(d - 11_119) < 30, `got ${d.toFixed(0)} m`);
});

test('GROUNDSPEED: a receiver sitting still reads ZERO, not a failure', () => {
  // Noah's own numbers: 5 m accuracy, fixes about 5 s apart, and the position
  // jittering by a couple of metres because that is what GPS does indoors.
  const prev = { lat: 38.69, lon: -120.97, accuracy: 5, at: 0 };
  const next = { lat: 38.690_00002, lon: -120.970_00002, accuracy: 5, at: 5000 };
  const solved = groundspeedFromFixes(prev, next);
  assert.equal(solved.moving, false, 'jitter inside the accuracy bound is not motion');
  assert.ok(solved.floorMs / KT > 1, 'the resolution bound is real and worth showing');
});

test('GROUNDSPEED: real motion is not mistaken for jitter', () => {
  // ~10 m/s (about 20 kt) over 5 s = 50 m, an order of magnitude outside the
  // fix accuracy.
  const prev = { lat: 38.69, lon: -120.97, accuracy: 5, at: 0 };
  const next = { lat: 38.690_45, lon: -120.97, accuracy: 5, at: 5000 };
  const solved = groundspeedFromFixes(prev, next);
  assert.equal(solved.moving, true);
  assert.ok(solved.speedMs / KT > 15 && solved.speedMs / KT < 25, `got ${(solved.speedMs / KT).toFixed(1)} kt`);
});

test('GROUNDSPEED: a walking pace is BELOW what two 5 m fixes can resolve', () => {
  // Kept because it is a limitation, not a bug, and the first version of the
  // test above asserted the opposite and failed. Two fixes of ±5 m taken 5 s
  // apart resolve to ±1.41 m/s; a 1.40 m/s walk is inside that, so the honest
  // answer is "not distinguishable from standing still, to ±2.7 kt" — which is
  // what the panel says, bound included. Faster fixes or a better accuracy
  // lower the floor; nothing else does.
  const prev = { lat: 38.69, lon: -120.97, accuracy: 5, at: 0 };
  const next = { lat: 38.690_063, lon: -120.97, accuracy: 5, at: 5000 };
  const solved = groundspeedFromFixes(prev, next);
  assert.ok(Math.abs(solved.speedMs - 1.4) < 0.05);
  assert.equal(solved.moving, false, 'below the floor, so it reads zero with the bound shown');
});

test('GROUNDSPEED: one fix cannot carry a speed', () => {
  assert.equal(groundspeedFromFixes(null, { lat: 0, lon: 0, accuracy: 5, at: 1000 }), null);
});

test('GROUNDSPEED: a long gap is not differenced across', () => {
  // The receiver may have gone anywhere in five minutes. A straight line
  // between the endpoints is not the path it took.
  const prev = { lat: 38.69, lon: -120.97, accuracy: 5, at: 0 };
  const next = { lat: 38.75, lon: -120.97, accuracy: 5, at: 300_000 };
  assert.equal(groundspeedFromFixes(prev, next), null);
});

/** A usable vertical-acceleration input, which is all the ZUPT path needs. */
const accelField = { provenance: 'DERIVED', value: 0.1, at: 1000, reason: null };
const altField = { provenance: 'LIVE', value: 1500, at: 1000, reason: null };

test('VSI: a device held still reads ZERO fpm', () => {
  const vsi = createVsi();
  vsi.setStationary(true, 1000);
  const out = vsi.read({ altitudeField: altField, verticalAccelField: accelField });
  assert.equal(out.provenance !== 'FAIL', true, `crossed out: ${out.reason}`);
  assert.equal(out.value, 0);
  assert.match(out.reason, /stationary/);
});

test('VSI: A WIGGLE IS NOT A CLIMB', () => {
  // THE BUG, exactly as reported. Shake the thing: the vertical accelerometer
  // swings hard both ways, and an integrator with no zero-velocity update banks
  // every excursion. Without ZUPT this reached thousands of fpm and crossed
  // itself out; with it, the device is still between shakes and says zero.
  const vsi = createVsi();
  vsi.setStationary(true, 0);
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    // A wiggle: bounded oscillation, no net displacement.
    vsi.updateAccel(Math.sin(i / 3) * 4, t);
    // The filter keeps reporting still, because the device IS still overall.
    if (i % 10 === 0) vsi.setStationary(true, t);
  }
  const out = vsi.read({ altitudeField: altField, verticalAccelField: accelField });
  assert.notEqual(out.provenance, 'FAIL', `a shaken desk crossed out the VSI: ${out.reason}`);
  assert.equal(out.value, 0, 'a wiggle has no net vertical speed');
});

test('VSI: stillness does not depend on GPS altitude still arriving', () => {
  // The evidence for "not moving" is the motion sensors. A fix that stopped
  // arriving cannot make a stationary device's vertical speed unknown — and
  // inheriting the fix's provenance is what crossed this out on a desk.
  const vsi = createVsi();
  vsi.setStationary(true, 1000);
  const out = vsi.read({
    altitudeField: { provenance: 'FAIL', value: null, at: null, reason: 'no fix' },
    verticalAccelField: accelField,
  });
  assert.equal(out.value, 0);
});

test('VSI: once it starts moving again it stops claiming zero', () => {
  const vsi = createVsi();
  vsi.setStationary(true, 1000);
  vsi.setStationary(false, 1200);
  vsi.updateAltitude(1500, 1200);
  vsi.updateAltitude(1600, 2200); // 100 ft in 1 s = 6000 fpm
  const out = vsi.read({ altitudeField: altField, verticalAccelField: accelField });
  assert.ok(out.value > 1000, `a real climb must still read: got ${out.value}`);
});
