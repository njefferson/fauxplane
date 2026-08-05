/**
 * mapmode.test.mjs — the navigation display's MAP mode.
 *
 * ALL OF THIS IS DRAWN ON A CANVAS, so the accessibility gate is structurally
 * blind to it: it can read the mode switch's name and the display's text
 * alternative, and it cannot see a single pixel of the rotation. Everything
 * worth checking here is therefore a PURE function that the renderer calls —
 * which is why `project` takes `upDeg` and `upReference` exists at all rather
 * than the choice being made inline where nothing could reach it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MAP_OWNSHIP_Y, project, upReference } from '../public/src/render/gauges/plan.js';

const CENTRE = { lat: 38.7, lon: -121.0 };
/** One nautical mile per pixel, centred at the origin, so a screen offset in
 *  pixels IS a distance in nautical miles and the arithmetic is readable. */
const view = (upDeg = 0) => ({ centre: CENTRE, pxPerNm: 1, cx: 0, cy: 0, upDeg });

/** A point `nm` miles from the centre on true bearing `brg`. */
const at = (brg, nm) => {
  const a = (brg * Math.PI) / 180;
  return {
    lat: CENTRE.lat + (Math.cos(a) * nm) / 60,
    lon: CENTRE.lon + (Math.sin(a) * nm) / (60 * Math.cos((CENTRE.lat * Math.PI) / 180)),
  };
};

const near = (actual, expected, why, tol = 0.02) =>
  assert.ok(Math.abs(actual - expected) < tol, `${why}: expected ~${expected}, got ${actual.toFixed(4)}`);

// ---------------------------------------------------------------------------
// The rotation, at the projection
// ---------------------------------------------------------------------------

test('north-up is the default, and it is what every existing caller gets', () => {
  // The RADAR page's scope is north-up and is not changed by MAP mode existing.
  // Omitting `upDeg` entirely must be identical to passing zero.
  const north = project(at(0, 10), { centre: CENTRE, pxPerNm: 1, cx: 0, cy: 0 });
  near(north.x, 0, 'due north is straight up: no sideways offset');
  near(north.y, -10, 'and ten miles above centre — screen y grows downward');
});

test('due east is to the RIGHT with north up, and STRAIGHT UP with east up', () => {
  const northUp = project(at(90, 10), view(0));
  near(northUp.x, 10, 'east is to the right of a north-up display');
  near(northUp.y, 0, 'and level with the centre');

  const eastUp = project(at(90, 10), view(90));
  near(eastUp.x, 0, 'turning the display to east puts east at the top');
  near(eastUp.y, -10, 'ten miles ahead');
});

test('every bearing lands where the rotation says, at four quarters', () => {
  // Done as a sweep rather than one case: a sign error in the rotation is
  // invisible at 90 degrees and obvious at 45 and 270.
  for (const up of [0, 45, 90, 180, 270, 315]) {
    for (const brg of [0, 30, 90, 145, 180, 250, 300]) {
      const p = project(at(brg, 12), view(up));
      const rel = ((brg - up) * Math.PI) / 180;
      near(p.x, Math.sin(rel) * 12, `bearing ${brg} with ${up} up: across`);
      near(p.y, -Math.cos(rel) * 12, `bearing ${brg} with ${up} up: along`);
    }
  }
});

test('rotation preserves distance — a turn moves nothing nearer or further', () => {
  // The one property that would make every range ring a lie if it were wrong.
  for (const up of [0, 17, 90, 233, 359]) {
    const p = project(at(63, 25), view(up));
    near(Math.hypot(p.x, p.y), 25, `distance at ${up} up`);
  }
});

test('the centre itself never moves, whatever is up', () => {
  for (const up of [0, 90, 200]) {
    const p = project(CENTRE, view(up));
    near(p.x, 0, 'centre x');
    near(p.y, 0, 'centre y');
  }
});

test('a point with no position is still nothing, rotated or not', () => {
  assert.equal(project({ lat: null, lon: -121 }, view(90)), null);
  assert.equal(project({ lat: 38.7, lon: undefined }, view(0)), null);
});

// ---------------------------------------------------------------------------
// Which way is up — a FIELD decision, and it says which one it made
// ---------------------------------------------------------------------------

const live = (value) => ({ value, provenance: 'LIVE', reason: null });
const failed = (reason) => ({ value: null, provenance: 'FAIL', reason });

test('PLAN mode is north-up whatever the sensors say', () => {
  // The existing display is not changed by MAP mode existing, and a track that
  // happens to be available must not quietly start rotating it.
  const fields = { 'position.track': live(275), 'attitude.heading': live(280) };
  const up = upReference(fields, 'plan');
  assert.equal(up.upDeg, 0);
  assert.equal(up.kind, 'north');
});

test('MAP prefers the GROUND TRACK, which is what a real ND is up to', () => {
  const fields = { 'position.track': live(275), 'attitude.heading': live(280) };
  const up = upReference(fields, 'map');
  assert.equal(up.upDeg, 275);
  assert.equal(up.kind, 'track');
  assert.equal(up.label, 'TRK UP');
  assert.equal(up.reason, null, 'nothing is degraded, so there is nothing to explain');
});

test('with no track it falls back to HEADING and is labelled as heading', () => {
  // A crew reads TRK and HDG as different numbers — on a windy day they differ
  // by several degrees — so a display showing one under the other's name is a
  // lie about which it is, even on the day they happen to be equal.
  const fields = { 'position.track': failed('no movement'), 'attitude.heading': live(280) };
  const up = upReference(fields, 'map');
  assert.equal(up.upDeg, 280);
  assert.equal(up.label, 'HDG UP');
  assert.equal(up.kind, 'heading');
  assert.match(up.reason, /nose/, 'and it says what the difference is');
});

test('with NEITHER it is north-up and carries the reason, rather than pointing somewhere', () => {
  // The desk case, which is most of this app's life. Rotating to an assumed
  // zero would be a bearing produced from no measurement at all.
  const fields = { 'position.track': failed('the device is not moving'), 'attitude.heading': failed('no magnetometer') };
  const up = upReference(fields, 'map');
  assert.equal(up.upDeg, 0);
  assert.equal(up.label, 'NORTH UP');
  assert.equal(up.kind, 'north');
  assert.match(up.reason, /not moving/, 'the track’s reason is the one that explains the fallback');
});

test('a track field that is present but not a number does not rotate anything', () => {
  const fields = { 'position.track': { value: null, provenance: 'LIVE', reason: null } };
  assert.equal(upReference(fields, 'map').kind, 'north');
});

test('no fields at all is north-up with a reason, not a crash', () => {
  const up = upReference({}, 'map');
  assert.equal(up.upDeg, 0);
  assert.ok(up.reason, 'it still says why');
  assert.equal(upReference().upDeg, 0);
});

// ---------------------------------------------------------------------------
// Own ship's place on the glass
// ---------------------------------------------------------------------------

test('MAP puts own ship near the bottom, because the question changed', () => {
  // Centred is right for "what is around me". Track-up asks "what is ahead",
  // and two thirds of a centred display is behind you.
  assert.ok(MAP_OWNSHIP_Y > 0.6 && MAP_OWNSHIP_Y < 0.9, `${MAP_OWNSHIP_Y} is not near the bottom`);
});
