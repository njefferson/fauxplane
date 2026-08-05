/**
 * levelling-report.test.mjs — the panel must not contradict itself about
 * whether it is levelled.
 *
 * His diagnostics agreed with
 * the ADI badge and both disagreed with the PFD: MOUNT LEVELLING cradle -46.0
 * deg pitch, 3.2 deg roll — being subtracted from every reading, LVL -46 +3 on
 * the horizon, and "Not levelled — the horizon shows the device's own angle"
 * underneath it.
 *
 * TWO FAULTS PRODUCED THAT, and both are worth a test.
 *
 *   1. A stored calibration is re-applied AFTER boot, and the PFD's line was
 *      written once, at boot, before it existed.
 *   2. The writer only produced text in the NOT-levelled branch, so in every
 *      other state it left whatever was already on screen — which is how a
 *      panel ends up asserting something it knows to be false.
 *
 * The second is testable here. The first is DOM timing and is asserted by the
 * accessibility gate, which loads the real app with a calibration already in
 * storage and reads the rendered line.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSetup } from '../public/src/panels/setup.js';

/** Enough of a document for createSetup to build its DOM. */
function stubDom() {
  const make = () => {
    const node = {
      children: [],
      dataset: {},
      style: {},
      _text: '',
      disabled: false,
      hidden: false,
      get textContent() {
        return this._text;
      },
      set textContent(v) {
        this._text = String(v);
      },
      append: (...kids) => node.children.push(...kids),
      appendChild: (kid) => node.children.push(kid),
      replaceChildren: (...kids) => {
        node.children = kids;
      },
      setAttribute() {},
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    return node;
  };
  globalThis.document = { createElement: make, createTextNode: (t) => ({ text: t }) };
  return make();
}

/** A fusion stand-in whose mount offset the test controls directly. */
const fusionWith = (offset) => ({
  mountOffset: offset,
  read: () => ({ hasAttitude: false, reason: 'not under test' }),
  setMountOffset() {},
  clearMountOffset() {},
});

const setupWith = (offset, screenAngle = 0) => {
  const host = stubDom();
  return createSetup({
    host,
    fusion: fusionWith(offset),
    screenAngle: () => screenAngle,
    onChange: () => {},
  });
};

test('with NO calibration it says so', () => {
  const { describeLevelling } = setupWith(null);
  const d = describeLevelling();
  assert.equal(d.state, 'off');
  assert.match(d.text, /Not levelled/);
});

test('with a calibration applied it NEVER says "not levelled"', () => {
  // THE BUG, as a single assertion. The owner's exact numbers.
  const { describeLevelling } = setupWith({ pitchDeg: -46, rollDeg: 3.2, capturedAtScreenAngle: 90 }, 90);
  const d = describeLevelling();
  assert.equal(d.state, 'on');
  assert.doesNotMatch(d.text, /Not levelled/i, 'the panel claimed it was not levelled while an offset was applied');
});

test('the applied numbers are IN the sentence, so it can be checked against the badge', () => {
  // The ADI badge and the diagnostics both print these. A sentence that says
  // "levelled" without saying to what cannot be reconciled with either.
  const { describeLevelling } = setupWith({ pitchDeg: -46, rollDeg: 3.2, capturedAtScreenAngle: 90 }, 90);
  const { text } = describeLevelling();
  assert.match(text, /46\.0/);
  assert.match(text, /3\.2/);
});

test('a calibration captured at another screen angle says it no longer applies', () => {
  // Levelling is a rotation in the DEVICE frame; rotating the screen invalidates
  // it. Silently continuing to claim "levelled" would be the same lie in a
  // different state.
  const { describeLevelling } = setupWith({ pitchDeg: -46, rollDeg: 3.2, capturedAtScreenAngle: 0 }, 90);
  const d = describeLevelling();
  assert.equal(d.state, 'stale');
  assert.match(d.text, /no longer applies/);
  assert.doesNotMatch(d.text, /^Levelled: /, 'a stale calibration must not read as a live one');
});

test('every state produces its OWN text — none inherits the previous one', () => {
  // The root cause: a writer with a branch that produces nothing leaves the
  // last state's sentence on screen. Asserting all three are distinct and
  // non-empty is what stops that shape returning.
  const states = [
    setupWith(null).describeLevelling(),
    setupWith({ pitchDeg: -46, rollDeg: 3.2, capturedAtScreenAngle: 90 }, 90).describeLevelling(),
    setupWith({ pitchDeg: -46, rollDeg: 3.2, capturedAtScreenAngle: 0 }, 90).describeLevelling(),
  ];
  for (const s of states) assert.ok(s.text && s.text.length > 10, 'a state produced no sentence of its own');
  assert.equal(new Set(states.map((s) => s.text)).size, 3, 'two states share a sentence');
  assert.equal(new Set(states.map((s) => s.state)).size, 3);
});
