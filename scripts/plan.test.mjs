/**
 * plan.test.mjs — labels on a busy plan view.
 *
 * The owner's 40 nm screenshot at 1.0.0 had nineteen aircraft, about a dozen of them
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
import { readFileSync } from 'node:fs';

import { placeLabels, RUNWAY_MIN_PX, runwayWidthPx } from '../public/src/render/gauges/plan.js';

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
  // A dozen aircraft crammed into one small area, which is the real case.
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

/**
 * RUNWAY WIDTH, WHICH WAS DEAD CODE FOR EVERY RUNWAY AT EVERY RANGE.
 *
 * The formula was `max(1.5, min(5, len * 0.06))`, and
 * `len * 0.06` never reaches 1.5 at any drawn length a real runway produces —
 * a 24px runway gives 1.44 — so the `max` pinned it at 1.5 permanently. Every
 * runway, every range, one width, forever.
 *
 * This is the shape of defect a unit test catches instantly and a screenshot
 * never does, because 1.5px and 1.44px look the same and BOTH look wrong only
 * once you know what you are looking at.
 */
// IMPORTED, not re-declared. See the note on runwayWidthPx in plan.js.
const runwayWidth = runwayWidthPx;

/**
 * MEASURED, not invented. These are the drawn lengths real NorCal runways
 * actually produce on a 350px scope at 10/20/40/80 nm, computed from
 * `navdata.json`: 2.2px at the far end up to 24px for the closest at 10 nm.
 *
 * The distinction matters and the first version of this test got it wrong: the
 * old formula is NOT constant for arbitrary lengths — at 40px it gives 2.4 —
 * it is constant across the lengths REAL RUNWAYS REACH, because none of them
 * reaches 25px. A test using invented sizes proved a claim nobody made.
 */
const REAL_DRAWN_PX = [2.2, 2.9, 4.3, 5.8, 6, 8.6, 11.5, 12, 17.3, 24];

test('runway width: it varies across the sizes real runways actually reach', () => {
  const widths = new Set(REAL_DRAWN_PX.map((l) => runwayWidth(l).toFixed(2)));
  assert.ok(widths.size > 1, `every real runway drew the same width: ${[...widths]}`);

  // The old formula, kept as the thing that must never come back. Across every
  // size a real runway reaches, it produced ONE number.
  const dead = new Set(REAL_DRAWN_PX.map((l) => Math.max(1.5, Math.min(5, l * 0.06)).toFixed(2)));
  assert.deepEqual([...dead], ['1.50'], 'the old formula was pinned at 1.5 for every real runway — that is why this exists');
});

test('runway width: it is a strip at every size, never a hairline', () => {
  for (const len of [...REAL_DRAWN_PX, 14, 20, 40, 80, 200]) {
    const w = runwayWidth(len);
    assert.ok(w >= 2, `${len}px runway drew a ${w}px hairline`);
    assert.ok(w <= 7, `${len}px runway drew ${w}px — two parallels would merge`);
  }
});

test('runway width: it rises with length and then stops', () => {
  assert.ok(runwayWidth(40) > runwayWidth(20), 'a longer runway must be wider');
  assert.equal(runwayWidth(200), runwayWidth(1000), 'past the cap it must not keep growing');
});

/**
 * THE THRESHOLD IS THE HONEST PART. Below it a line cannot carry a direction,
 * so the mark becomes an airport SYMBOL rather than a runway drawn bigger than
 * it is — which would be a lie about a distance.
 */
test('runway threshold: real runways fall the right side of it at each range', () => {
  // A 4,000 ft runway is about 0.66 nm; a 350px scope radius is typical.
  const drawnPx = (nm, rangeNm) => nm * (350 / rangeNm);
  assert.ok(drawnPx(0.66, 10) >= RUNWAY_MIN_PX, 'at 10 nm a small runway must draw as a runway');
  assert.ok(drawnPx(0.66, 40) < RUNWAY_MIN_PX, 'at 40 nm it cannot, and must become a symbol');
  assert.ok(drawnPx(0.66, 80) < RUNWAY_MIN_PX, 'at 80 nm certainly not');
  // A big one — 12,000 ft, about 2 nm — should survive further out.
  assert.ok(drawnPx(2.0, 20) >= RUNWAY_MIN_PX, 'a major runway must still read at 20 nm');
});

/**
 * THE RING LABEL MUST NAME THE RING'S ACTUAL DISTANCE.
 *
 * At 10 nm the
 * quarter and three-quarter rings sit at 2.5 and 7.5 nm and were labelled "3"
 * and "8" — a scope whose entire contract is distance, printing a distance the
 * circle is not at. The other ranges divide evenly and hid it.
 */
import { ringLabelFor } from '../public/src/render/gauges/plan.js';

test('range rings: every label is the distance the ring is actually at', () => {
  for (const range of [10, 20, 40, 80]) {
    for (const frac of [0.25, 0.5, 0.75, 1]) {
      const shown = Number(ringLabelFor(range, frac));
      assert.equal(shown, range * frac, `at ${range} nm the ${frac} ring reads ${shown} and sits at ${range * frac}`);
    }
  }
});

test('range rings: 10 nm is the case that was wrong, and it is exact now', () => {
  assert.deepEqual(
    [0.25, 0.5, 0.75, 1].map((f) => ringLabelFor(10, f)),
    ['2.5', '5', '7.5', '10'],
    'the old code rounded these to 3, 5, 8, 10',
  );
});

test('range rings: whole numbers do not grow a decimal point', () => {
  assert.deepEqual([0.25, 0.5, 0.75, 1].map((f) => ringLabelFor(40, f)), ['10', '20', '30', '40']);
  assert.deepEqual([0.25, 0.5, 0.75, 1].map((f) => ringLabelFor(80, f)), ['20', '40', '60', '80']);
});

/**
 * THE TAP TARGET MUST INCLUDE THE LABEL, because that is what a finger goes for.
 *
 * `placeLabels` offsets a label by `size + lineHeight * 0.9` — about 20px — and
 * the label has its own height on top of that.
 * It was not flaky;
 * the biggest thing on the scope was outside the target.
 */
test('tap slop: a tap on the altitude label still finds its aircraft', () => {
  const centre = { lat: 38.5, lon: -121.5 };
  const geom = { centre, rangeNm: 40, w: 350, h: 350 };
  const one = [{ hex: 'aaa111', lat: 38.5, lon: -121.5 }];
  // The aircraft is at the centre; its label sits about 20-28px below.
  for (const dy of [10, 20, 28]) {
    assert.ok(hitTestAircraft(one, geom, 175, 175 + dy), `a tap ${dy}px away — where the label is — must hit`);
  }
});

test('tap slop: a tap in genuinely empty space still misses', () => {
  // Widening the target must not turn the whole scope into one button.
  const geom = { centre: { lat: 38.5, lon: -121.5 }, rangeNm: 40, w: 350, h: 350 };
  const one = [{ hex: 'aaa111', lat: 38.5, lon: -121.5 }];
  assert.equal(hitTestAircraft(one, geom, 175, 175 + 60), null, 'far from anything must remain a miss');
});

test('tap slop: the nearest aircraft still wins in a cluster', () => {
  const centre = { lat: 38.5, lon: -121.5 };
  const geom = { centre, rangeNm: 40, w: 350, h: 350 };
  const near = { hex: 'near01', lat: 38.5, lon: -121.5 };
  const far = { hex: 'far001', lat: 38.62, lon: -121.5 };
  const hit = hitTestAircraft([far, near], geom, 175, 178);
  assert.equal(hit.hex, 'near01', 'a wider radius must not stop the closest mark winning');
});

// ---------------------------------------------------------------------------
// Airport marks, and the identifier that never once appeared
// ---------------------------------------------------------------------------

import { AIRPORT_IDENT_MIN_PX, airportIdentSize, airportSymbolR } from '../public/src/render/gauges/plan.js';

/**
 * SCOPE RADII MEASURED FROM THE RUNNING APP, in CSS pixels — which is what this
 * renderer draws in, because the surface applies the device pixel ratio as a
 * transform rather than handing the drawing code buffer pixels.
 *
 * These are the whole point of the test below. The first version of the ident
 * gate required a radius of 346 to draw anything, and NOTHING here reaches it —
 * so the feature shipped, was described in a release note, and never rendered
 * once on any device. A canvas is invisible to the accessibility gate, so this
 * is the only place it could have been caught.
 */
const REAL_SCOPES = [
  { where: 'PFD plan scope, phone landscape', r: 66 },
  { where: 'MAP page, phone landscape', r: 108 },
  { where: 'PFD plan scope, phone portrait', r: 141 },
  { where: 'RADAR page, phone', r: 168 },
  { where: 'MAP page, phone portrait', r: 168 },
  { where: 'PFD plan scope, tablet', r: 184 },
  { where: 'MAP page, tablet', r: 295 },
];

test('AN IDENT IS LEGIBLE AT EVERY SIZE A REAL DEVICE ACTUALLY HAS', () => {
  // The check that was missing. Not "is the formula reasonable" — is the text
  // big enough to read on the scopes this app is rendered on.
  for (const s of REAL_SCOPES) {
    assert.ok(
      airportIdentSize(s.r) >= AIRPORT_IDENT_MIN_PX,
      `${s.where} (r=${s.r}) draws idents at ${airportIdentSize(s.r).toFixed(1)}px`,
    );
  }
});

test('the floor is AT OR ABOVE the legibility minimum, which is what broke before', () => {
  // The original was `max(8, r * 0.026)` gated on `>= 9`. A floor BELOW the
  // threshold means the floor can never satisfy it, so the gate could only be
  // met by the scaled term — and no scope is big enough. A floor that cannot
  // pass its own gate is a feature that cannot run.
  assert.ok(airportIdentSize(0) >= AIRPORT_IDENT_MIN_PX, 'the floor is below the minimum it is checked against');
  assert.equal(airportIdentSize(0), AIRPORT_IDENT_MIN_PX);
});

test('a LABELLED field gets a bigger mark than an unlabelled one', () => {
  // A speck with a caption reads as a caption with a speck. The austere scopes
  // keep the smaller mark, because nothing hangs off it.
  for (const s of REAL_SCOPES) {
    assert.ok(
      airportSymbolR(s.r, { labelled: true }) > airportSymbolR(s.r),
      `${s.where}: labelled and unlabelled marks are the same size`,
    );
  }
});

test('the mark still grows with the glass, and never shrinks below its floor', () => {
  assert.equal(airportSymbolR(0), 3.5, 'the austere floor');
  assert.equal(airportSymbolR(0, { labelled: true }), 5, 'the labelled floor');
  assert.ok(airportSymbolR(2000) > airportSymbolR(200), 'a big canvas gets a bigger mark');
});

test('THE MAP PAGE ASKS FOR IDENTS, and nothing else can check that it does', () => {
  // A canvas is invisible to the accessibility gate, so if this option stopped
  // being passed, every field on the chart would go back to being an anonymous
  // circle and every gate would stay green — which is exactly how the first
  // version of it shipped unnoticed. Reading the source is the only reach there
  // is; `traffic-pacing.test.mjs` does the same for the poll schedule.
  const src = readFileSync(new URL('../public/src/panels/map.js', import.meta.url), 'utf8');
  assert.match(src, /airportIdents:\s*true/, 'the MAP page no longer names its airports');
});

test('and the AUSTERE scopes do not', () => {
  // PLAN beside the horizon and the RADAR page are traffic displays. A TCAS
  // scope does not label the ground, and turning this on there would be a
  // second opinion about what those pages are for.
  for (const f of ['../public/src/panels/pfd.js', '../public/src/panels/radar.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /airportIdents:\s*true/, `${f} turned on airport idents`);
  }
});
