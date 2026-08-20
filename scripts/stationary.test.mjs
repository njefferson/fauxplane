/**
 * stationary.test.mjs — zero is a measurement.
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
  // measured numbers from a real device: 5 m accuracy, fixes about 5 s apart, and the position
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

/* ------------------------------------------------- vertical resolution floor */

import { verticalResolutionFpm } from '../public/src/core/derive.js';

test('RESOLUTION: a tablet indoors cannot resolve a light-aircraft climb', () => {
  // 27 m altitude accuracy, fixes about 5 s apart — measured from real reports. The
  // answer is roughly 1,500 fpm, which is most of what a light aircraft ever
  // does, and that is a fact about GPS rather than a defect to hide.
  const floor = verticalResolutionFpm({ accuracyM: 27, gapS: 5 });
  assert.ok(floor > 1200 && floor < 1800, `got ${Math.round(floor)} fpm`);
});

test('RESOLUTION: a good fix at 1 Hz resolves far better', () => {
  const floor = verticalResolutionFpm({ accuracyM: 5, gapS: 1 });
  assert.ok(floor < 800, `got ${Math.round(floor)} fpm`);
  assert.ok(floor < verticalResolutionFpm({ accuracyM: 27, gapS: 5 }));
});

test('RESOLUTION: it refuses to invent a bound it cannot compute', () => {
  assert.equal(verticalResolutionFpm({ accuracyM: null, gapS: 5 }), null);
  assert.equal(verticalResolutionFpm({ accuracyM: 27, gapS: null }), null);
  assert.equal(verticalResolutionFpm({ accuracyM: 27, gapS: 0 }), null);
});

test('RESOLUTION: a rate under the floor keeps its VALUE and gains the bound', () => {
  // The opposite of what groundspeed does, deliberately: two fixes agreeing IS
  // evidence of standing still, but an altitude rate under the floor is NOT
  // evidence of not climbing — the accelerometer half may hold real
  // information. Zeroing it would invent a fact nothing measured.
  const vsi = createVsi();
  vsi.updateAltitude(1500, 0);
  vsi.updateAltitude(1504, 5000); // 48 fpm, far under a 27 m / 5 s floor
  const out = vsi.read({
    altitudeField: altField,
    verticalAccelField: accelField,
    altitudeAccuracyField: { provenance: 'LIVE', value: 27, at: 1000, reason: null },
  });
  assert.notEqual(out.provenance, 'FAIL');
  assert.ok(Number.isFinite(out.value), 'the estimate is kept, not replaced with zero');
  // String(...) on purpose: a null reason must fail as an ASSERTION quoting
  // this regex, not as a TypeError that quotes nothing — which is exactly how
  // the plant for this check came to look like it failed for another reason.
  assert.match(String(out.reason ?? ''), /resolves no better than/);
});

test('RESOLUTION: a climb well ABOVE the floor is reported without the caveat', () => {
  const vsi = createVsi();
  // A real airliner climb, not an absurd one: 1,200 fpm against a floor of
  // about 460. The first version of this test used 30,000 fpm and tripped the
  // runaway guard instead, which is the guard working.
  vsi.updateAltitude(1500, 0);
  vsi.updateAltitude(1560, 3000); // 60 ft in 3 s = 1,200 fpm
  const out = vsi.read({
    altitudeField: altField,
    verticalAccelField: accelField,
    altitudeAccuracyField: { provenance: 'LIVE', value: 5, at: 1000, reason: null },
  });
  assert.notEqual(out.provenance, 'FAIL');
  assert.ok(!/resolves no better/.test(out.reason ?? ''), `unexpected caveat: ${out.reason}`);
});
