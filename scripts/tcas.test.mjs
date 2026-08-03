/**
 * tcas.test.mjs — the traffic layer, held to what a flight deck actually shows.
 *
 * Noah: "What does the radar look like in a real jet? This crowded? What info
 * is shown for each object? ... My desired fix is ALWAYS more like a regular
 * aircraft." A real ND's traffic layer is TCAS: a symbol, a RELATIVE altitude
 * in hundreds of feet, and a vertical trend arrow. No callsign, no
 * registration, no type code, and an altitude band that hides most of the sky.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { ALTITUDE_BANDS, RADAR_RANGE_NM, ownAltitudeFt, withinBand } from '../public/src/data/traffic.js';
import { tcasLabel } from '../public/src/render/gauges/plan.js';

const ac = (altGeomFt, verticalRateFpm = 0, extra = {}) => ({ altGeomFt, altBaroFt: altGeomFt, verticalRateFpm, onGround: false, ...extra });

// ---------------------------------------------------------------------------
// The label
// ---------------------------------------------------------------------------

test('relative altitude, signed, in hundreds of feet', () => {
  assert.equal(tcasLabel(ac(34300), 34000), '+03');
  assert.equal(tcasLabel(ac(33700), 34000), '−03');
  assert.equal(tcasLabel(ac(34000), 34000), '+00');
});

test('a MINUS SIGN, not a hyphen — it is arithmetic, and it aligns', () => {
  assert.ok(tcasLabel(ac(20000), 34000).startsWith('−'));
  assert.ok(!tcasLabel(ac(20000), 34000).startsWith('-'));
});

test('two digits, clamped — TCAS never shows a third', () => {
  assert.equal(tcasLabel(ac(99000), 1000), '+99');
  assert.equal(tcasLabel(ac(0), 99000), '−99');
});

test('a vertical trend arrow only past the 500 fpm threshold', () => {
  assert.equal(tcasLabel(ac(34300, 1200), 34000), '+03↑');
  assert.equal(tcasLabel(ac(34300, -1200), 34000), '+03↓');
  assert.equal(tcasLabel(ac(34300, 300), 34000), '+03', 'a drift is level as far as the display is concerned');
  assert.equal(tcasLabel(ac(34300, null), 34000), '+03', 'no rate broadcast is not a level aircraft, it is no arrow');
});

test('on the ground says GND, not a relative altitude', () => {
  assert.equal(tcasLabel({ onGround: true, altGeomFt: null }, 1000), 'GND');
});

test('WITH NO OWN ALTITUDE it falls back to absolute rather than inventing a datum', () => {
  // The desk case before a GPS fix. "+340" relative to nothing would be a
  // number computed from an assumption nobody measured.
  const label = tcasLabel(ac(34000), null);
  assert.match(label, /FL340/);
});

test('an aircraft broadcasting no altitude gets no label, not a zero', () => {
  assert.equal(tcasLabel({ altGeomFt: null, altBaroFt: null, onGround: false }, 34000), '');
});

// ---------------------------------------------------------------------------
// The band — the real de-clutter
// ---------------------------------------------------------------------------

test('NORM keeps only traffic within 2700 ft either way', () => {
  // Own altitude 34000. The arithmetic, done rather than assumed — the first
  // version of this test asserted 31000 was kept, which is 3000 ft below and
  // outside the band. The code was right and the expectation was wrong.
  const fleet = [ac(36000), ac(34000), ac(31500), ac(31000), ac(3000)];
  const kept = withinBand(fleet, 34000, 'NORM').map((a) => a.altGeomFt);
  assert.deepEqual(kept, [36000, 34000, 31500], '2000 up and 2500 down are in; 3000 down is not');
});

test('the band edge is inclusive, and one foot past it is out', () => {
  assert.equal(withinBand([ac(36700)], 34000, 'NORM').length, 1, 'exactly 2700 above is inside');
  assert.equal(withinBand([ac(36701)], 34000, 'NORM').length, 0);
  assert.equal(withinBand([ac(31300)], 34000, 'NORM').length, 1, 'exactly 2700 below is inside');
  assert.equal(withinBand([ac(31299)], 34000, 'NORM').length, 0);
});

test('ABOVE reaches 9900 up and only 2700 down', () => {
  const fleet = [ac(43000), ac(44500), ac(31500), ac(30000)];
  const kept = withinBand(fleet, 34000, 'ABOVE').map((a) => a.altGeomFt);
  assert.ok(kept.includes(43000), '9000 ft above should be kept');
  assert.ok(!kept.includes(44500), '10500 ft above is outside the band');
  assert.ok(kept.includes(31500), '2500 ft below is inside ABOVE\'s 2700 floor');
  assert.ok(!kept.includes(30000), '4000 ft below is outside ABOVE');
});

test('BELOW is ABOVE mirrored', () => {
  const fleet = [ac(25000), ac(23500), ac(36500), ac(37000)];
  const kept = withinBand(fleet, 34000, 'BELOW').map((a) => a.altGeomFt);
  assert.ok(kept.includes(25000), '9000 ft below is inside');
  assert.ok(!kept.includes(23500), '10500 ft below is outside');
  assert.ok(kept.includes(36500), '2500 ft above is inside the 2700 ceiling');
  assert.ok(!kept.includes(37000), '3000 ft above is outside BELOW');
});

test('ALL is not a real setting and is marked as ours', () => {
  const all = ALTITUDE_BANDS.find((b) => b.id === 'ALL');
  assert.equal(all.real, false);
  for (const b of ALTITUDE_BANDS.filter((x) => x.id !== 'ALL')) assert.equal(b.real, true);
  assert.equal(withinBand([ac(1000), ac(40000)], 34000, 'ALL').length, 2);
});

test('WITH NO OWN ALTITUDE there is no band, and nothing is hidden', () => {
  // "Relative to what?" has no answer. Filtering against an assumed zero would
  // hide real aircraft using a number nobody measured.
  assert.equal(withinBand([ac(1000), ac(40000)], null, 'NORM').length, 2);
});

test('an aircraft with NO altitude is kept by every band', () => {
  // It is really there. The band cannot judge it, and dropping it would hide a
  // real aircraft on the strength of a measurement that does not exist.
  const mystery = { altGeomFt: null, altBaroFt: null, onGround: false };
  for (const b of ALTITUDE_BANDS) {
    assert.equal(withinBand([mystery], 34000, b.id).length, 1, `${b.id} dropped an aircraft it cannot judge`);
  }
});

// ---------------------------------------------------------------------------
// Own altitude, and the ranges
// ---------------------------------------------------------------------------

test('while following, OWN altitude is the followed aircraft', () => {
  const fields = { 'position.altitudeGeometric': { provenance: 'LIVE', value: 187 } };
  assert.equal(ownAltitudeFt(fields, { altGeomFt: 34000 }), 34000);
  assert.equal(ownAltitudeFt(fields, null), 187);
});

test('own altitude prefers GEOMETRIC, matching what aircraft broadcast', () => {
  // Mixing a barometric own-altitude with geometric traffic puts a real error
  // into every relative number on the scope.
  assert.equal(ownAltitudeFt({}, { altGeomFt: 34350, altBaroFt: 34000 }), 34350);
});

test('the ranges are real Boeing steps', () => {
  // An EFIS control panel offers 10/20/40/80/160/320/640. It never offers 25,
  // which is what this had.
  assert.deepEqual(RADAR_RANGE_NM, [10, 20, 40, 80]);
  assert.ok(!RADAR_RANGE_NM.includes(25));
});
