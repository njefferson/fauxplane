/**
 * plan.test.mjs — labels on a busy plan view.
 *
 * Noah's 40 nm screenshot at 1.0.0 had nineteen aircraft, about a dozen of them
 * in one quadrant, and their labels overprinted into a smear that read as
 * corruption rather than as density. Every label was drawn at a fixed offset
 * below its symbol, so a cluster put several lines of text in the same pixels.
 *
 * The accessibility gate cannot see inside a canvas, so this is the only place
 * the behaviour can be checked at all — which is exactly why the placement is a
 * pure function that takes its own text measurement.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { placeLabels } from '../public/src/render/gauges/plan.js';

/** A monospace-ish stand-in: every glyph six pixels wide. */
const measure = (t) => t.length * 6;
const opts = { measure, lineHeight: 10, bounds: { left: 0, right: 400, top: 0, bottom: 400 } };

const boxOf = (l) => {
  const w = measure(l.text);
  const left = l.align === 'center' ? l.x - w / 2 : l.align === 'left' ? l.x : l.x - w;
  return { left, right: left + w, top: l.y - 6, bottom: l.y + 6 };
};
const collide = (a, b) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;

test('PLAN: two aircraft far apart both keep their labels, below the symbol', () => {
  const out = placeLabels(
    [
      { key: 'a', x: 60, y: 60, size: 5, text: 'UAL328 FL350', priority: 1 },
      { key: 'b', x: 300, y: 300, size: 5, text: 'DAL1088 FL235', priority: 0 },
    ],
    opts,
  );
  assert.equal(out.length, 2);
  for (const l of out) assert.ok(l.y > 60 || l.y > 300, 'the familiar position is below');
});

test('PLAN: NO TWO LABELS EVER OVERLAP — the defect, directly', () => {
  // A dozen aircraft crammed into one small area, which is Noah's screenshot.
  const items = [];
  for (let i = 0; i < 12; i += 1) {
    items.push({ key: `k${i}`, x: 200 + (i % 4) * 6, y: 200 + Math.floor(i / 4) * 6, size: 5, text: `FLT${i}00 FL${300 + i}`, priority: -i });
  }
  const out = placeLabels(items, opts);
  const boxes = out.map(boxOf);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!collide(boxes[i], boxes[j]), `labels ${out[i].text} and ${out[j].text} overlap`);
    }
  }
});

test('PLAN: a label that fits nowhere is DROPPED, not smeared', () => {
  // The honest trade. The symbol is still drawn at the right bearing and range,
  // and the callsign is in the RADAR list as text — drawing the label anyway
  // would hide a neighbour and help nobody.
  const items = [];
  for (let i = 0; i < 40; i += 1) items.push({ key: `k${i}`, x: 200, y: 200, size: 5, text: 'AAA111 FL350', priority: -i });
  const out = placeLabels(items, opts);
  assert.ok(out.length < items.length, 'some must be dropped');
  assert.ok(out.length >= 1, 'but not all of them');
});

test('PLAN: the FOLLOWED aircraft keeps its label whatever the density', () => {
  // It is the one driving the panel, so it is the one that must stay named.
  const items = [{ key: 'me', x: 200, y: 200, size: 9, text: 'UAL328 FL350', priority: 1e6 }];
  for (let i = 0; i < 30; i += 1) items.push({ key: `k${i}`, x: 200, y: 200, size: 5, text: 'AAA111 FL350', priority: -i });
  const out = placeLabels(items, opts);
  assert.ok(out.some((l) => l.key === 'me'), 'the followed aircraft lost its label');
});

test('PLAN: no label is placed outside the plan view', () => {
  // A label spilling past the edge reads as belonging to whatever is beyond it.
  const out = placeLabels([{ key: 'edge', x: 398, y: 398, size: 5, text: 'WAAAY OUT FL350', priority: 0 }], opts);
  for (const l of out) {
    const b = boxOf(l);
    assert.ok(b.left >= 0 && b.right <= 400 && b.top >= 0 && b.bottom <= 400, `escaped: ${JSON.stringify(b)}`);
  }
});

test('PLAN: an empty sky places nothing and does not throw', () => {
  assert.deepEqual(placeLabels([], opts), []);
});

/* ------------------------------------------------------------- tap to follow */

import { hitTestAircraft } from '../public/src/render/gauges/plan.js';

const VIEW = { centre: { lat: 38.7, lon: -121.0 }, rangeNm: 40, w: 400, h: 400 };

test('TAP: a touch near a symbol picks that aircraft', () => {
  // ~20 nm north of centre: at 400x400 and 40 nm, that is ~98px above centre.
  const a = { hex: 'a1', callsign: 'UAL1', lat: 39.033, lon: -121.0 };
  const hit = hitTestAircraft([a], VIEW, 200, 102, 24);
  assert.equal(hit?.hex, 'a1');
});

test('TAP: empty sky, or a tap far from anything, follows nothing', () => {
  assert.equal(hitTestAircraft([], VIEW, 200, 200), null);
  const a = { hex: 'a1', callsign: 'UAL1', lat: 39.033, lon: -121.0 };
  assert.equal(hitTestAircraft([a], VIEW, 200, 300, 24), null, 'a 200px miss is not a tap on it');
});

test('TAP: the NEAREST of two close symbols wins — a tap is not a lottery', () => {
  // Two aircraft on the same bearing: 39.02° is 19.2 nm out (~94 px above
  // centre at 4.9 px/nm), 39.05° is 21 nm (~103 px). A tap on the nearer one
  // is within a finger of both; the nearer must win, and list order must not
  // decide it.
  const near = { hex: 'n1', lat: 39.02, lon: -121.0 };
  const far = { hex: 'f1', lat: 39.05, lon: -121.0 };
  assert.equal(hitTestAircraft([far, near], VIEW, 200, 106, 44)?.hex, 'n1');
  assert.equal(hitTestAircraft([near, far], VIEW, 200, 106, 44)?.hex, 'n1');
});
