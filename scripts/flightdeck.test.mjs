/**
 * flightdeck.test.mjs — the three PFD corrections that came from using the app
 * beside a real flight deck's conventions.
 *
 * A CANVAS IS INVISIBLE TO THE ACCESSIBILITY GATE, so every decision here that
 * could put a wrong or invented number on an instrument is a pure function, and
 * this is the only place it can be checked. What is left on the canvas is
 * geometry, which is checked by driving it and counting painted pixels.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadInset, saveInset, selectTape, speedLadderFor } from '../public/src/panels/pfd.js';
import { showsSelected } from '../public/src/render/gauges/tape.js';

const f = (value, provenance = 'LIVE') => ({ value, provenance, ageMs: 0 });
const failed = (reason = 'not available') => ({ value: null, provenance: 'FAIL', reason });

// ---------------------------------------------------------------------------
// The speed tape names which speed it is
// ---------------------------------------------------------------------------

/**
 * A REAL PFD'S LEFT TAPE IS AIRSPEED AND NEVER GROUNDSPEED — groundspeed is a
 * readout in the navigation display's corner. This tape was hard-coded to GS,
 * which put a real number in the position a pilot reads as airspeed. It is now
 * the same labelled ladder the altitude tape has always been.
 */
const speedLadder = (cas, tas, gs) => [['CAS', cas], ['TAS', tas], ['GS', gs]];

test('the speed tape takes the BEST speed available and names it', () => {
  assert.deepEqual(selectTape(speedLadder(f(250), f(260), f(240)))[0], 'CAS');
  assert.deepEqual(selectTape(speedLadder(failed(), f(260), f(240)))[0], 'TAS');
  assert.deepEqual(selectTape(speedLadder(failed(), failed(), f(240)))[0], 'GS');
});

test('ON A DESK IT LANDS ON GS AND SAYS GS', () => {
  // The stationary case: no air data at all, a GPS groundspeed, and a heading
  // that must not imply airspeed.
  const [label, field] = selectTape(speedLadder(failed(), failed(), f(3)));
  assert.equal(label, 'GS');
  assert.equal(field.value, 3);
});

test('WHILE FOLLOWING it lands on GS too, because the weather is this desk’s', () => {
  // CAS and TAS are correctly FAIL in follow mode — they would need the winds
  // and the altimeter setting where the AIRCRAFT is, not where the phone is.
  // The tape must not imply the broadcast groundspeed is an airspeed.
  const [label] = selectTape(speedLadder(failed('needs pressure altitude from the aircraft'), failed('needs winds aloft at the aircraft'), f(441)));
  assert.equal(label, 'GS');
});

test('with EVERYTHING failed it still returns the last rung, so the tape crosses itself out under an honest heading', () => {
  const [label, field] = selectTape(speedLadder(failed(), failed(), failed()));
  assert.equal(label, 'GS');
  assert.equal(field.provenance, 'FAIL', 'the tape draws its own cross; it is not handed a null');
});

test('the altitude ladder is the same function, which is the point of extracting it', () => {
  const ladder = [['ALT', failed()], ['MSL', f(1538)], ['GPS ALT', f(1444)]];
  assert.deepEqual(selectTape(ladder)[0], 'MSL');
});

// ---------------------------------------------------------------------------
// A selected-value bug is never invented
// ---------------------------------------------------------------------------

test('A BUG IS DRAWN ONLY FOR A TARGET SOMEBODY ACTUALLY SET', () => {
  // The honesty rule on these instruments. A bug marks what the crew dialled in;
  // one drawn from a value nobody broadcast is an invented intention on the one
  // display whose job is to say where the aircraft is going.
  assert.equal(showsSelected(f(15000)), true);
  assert.equal(showsSelected(failed('N123 is not broadcasting a selected altitude')), false);
  assert.equal(showsSelected(null), false);
  assert.equal(showsSelected(undefined), false);
  assert.equal(showsSelected({ value: null, provenance: 'LIVE' }), false, 'LIVE with no number is still no target');
  assert.equal(showsSelected({ value: Number.NaN, provenance: 'LIVE' }), false);
});

test('a STALE selection is still drawn, because a target does not go stale the way a position does', () => {
  // What aged is the aircraft's report, not the crew's decision. Suppressing it
  // would remove a target that is still true; it is drawn in the stale tone.
  assert.equal(showsSelected(f(15000, 'STALE')), true);
});

test('zero is a real selected value', () => {
  // A heading bug on 000 is north, not an absent target. The guard is on
  // finiteness, never on truthiness.
  assert.equal(showsSelected(f(0)), true);
});

// ---------------------------------------------------------------------------
// The ND inset preference
// ---------------------------------------------------------------------------

const store = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('THE INSET DEFAULTS ON, and every failure mode also means on', () => {
  // The inset is what the panel has always had. A preference that failed closed
  // would silently remove an instrument from someone who never touched it.
  assert.equal(loadInset(store()), true, 'nothing stored');
  assert.equal(loadInset(store({ 'fauxplane.nd-inset': 'nonsense' })), true, 'a value we did not write');
  assert.equal(loadInset(undefined), true, 'no storage at all — a private window');
  assert.equal(loadInset({ getItem() { throw new Error('denied'); } }), true, 'storage that throws');
});

test('off is stored and read back, and survives a reload', () => {
  const s = store();
  assert.equal(saveInset(false, s), true);
  assert.equal(loadInset(s), false);
  assert.equal(saveInset(true, s), true);
  assert.equal(loadInset(s), true);
});

test('a storage that refuses to write is not an error the reader has to see', () => {
  // The switch still works for this session; it just will not be remembered.
  assert.equal(saveInset(false, { setItem() { throw new Error('quota'); } }), false);
});

test('THE LADDER REALLY CONTAINS THE AIRSPEEDS, not just groundspeed', () => {
  // The rungs, from the shared builder both the tape and the spoken description
  // read. Asserted on the DATA rather than on the source, so a rename cannot
  // quietly pass it.
  const fields = { 'speed.cas': f(250), 'speed.tas': f(260), 'position.groundspeed': f(240) };
  assert.deepEqual(speedLadderFor(fields).map(([label]) => label), ['CAS', 'TAS', 'GS']);
  assert.deepEqual(speedLadderFor(fields).map(([, v]) => v.value), [250, 260, 240]);
});

test('and the PFD actually USES it for the tape — the wiring, not the helper', () => {
  /**
   * A HELPER CAN BE PERFECT AND UNUSED. The first plant for this broke the call
   * site while every test exercised only the function, so it stayed green: the
   * ladder was proven and its USE was not.
   *
   * The tape's heading is painted on a canvas, and the one scenario that would
   * prove the choice at runtime — the tape landing on TAS — needs a ground
   * track, which a stationary headless browser can never have. So this reads the
   * source, exactly as the map page's airport identifiers are covered, and says
   * so rather than pretending to be an outcome check.
   */
  const src = readFileSync(new URL('../public/src/panels/pfd.js', import.meta.url), 'utf8');
  assert.match(src, /selectTape\(speedLadderFor\(fields\)\)/, 'the speed tape no longer chooses from the ladder');
  assert.match(src, /selectTape\(speedLadderFor\(fields\)\)[\s\S]*selectTape\(speedLadderFor\(fields\)\)/,
    'the text alternative no longer makes the same choice as the tape');
});
