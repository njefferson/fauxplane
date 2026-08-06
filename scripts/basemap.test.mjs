/**
 * basemap.test.mjs — the bundled ground map, and what the MAP page says about
 * itself.
 *
 * THE DATA IS CHECKED AS SHIPPED, not as generated. `build-basemap.mjs` needs
 * the network and runs once; what a reader actually gets is the committed file,
 * and a generator that was correct on the day is no evidence about a file
 * somebody has since hand-edited or truncated. So these read
 * `public/data/basemap.json` itself.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { REGION } from '../public/src/core/region.js';
import { MAP_LAYERS, describeMap } from '../public/src/panels/map.js';

const basemap = JSON.parse(readFileSync(new URL('../public/data/basemap.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../public/data/manifest.json', import.meta.url), 'utf8'));

// ---------------------------------------------------------------------------
// The bundle
// ---------------------------------------------------------------------------

test('the basemap declares its source and its licence', () => {
  // Doctrine §8: every ingest adapter declares its source's licence, and the
  // shipped artifact carries it too — a licence recorded only in a build script
  // is a licence nobody reading the data can find.
  assert.equal(basemap.source.name, 'Natural Earth');
  assert.equal(basemap.source.licence, 'public domain');
  assert.match(basemap.source.url, /^https:\/\//);
  // THEIR OWN WORDING, offered in the publisher's LICENSE.md. Writing our own
  // citation about somebody else's terms is the defect the traffic providers
  // already produced once.
  assert.equal(basemap.source.credit, 'Made with Natural Earth.');
});

test('every layer has shapes, and every shape has at least two points', () => {
  assert.ok(basemap.layers.length >= 4, 'expected ground, water and built-up layers');
  for (const layer of basemap.layers) {
    assert.ok(['line', 'area'].includes(layer.kind), `${layer.id}: unknown kind ${layer.kind}`);
    assert.ok(layer.shapes.length > 0, `${layer.id} is empty — an empty layer must never be written`);
    for (const shape of layer.shapes) {
      assert.ok(shape.length >= 2, `${layer.id} carries a shape of ${shape.length} point(s), which cannot be drawn`);
    }
  }
});

/**
 * THE TWO CLIPS HAVE DIFFERENT CONTRACTS, and the first version of this test
 * asserted the wrong one for half the file.
 *
 *   LINES are split at the boundary and kept only near it, plus one point of
 *   slack on each side so a coastline enters from off-screen rather than
 *   beginning abruptly just inside the edge.
 *
 *   AREAS are kept WHOLE or dropped. Clipping a polygon properly means cutting
 *   it against the box and closing the cut edge, and a lake closed along an
 *   invented straight edge is a shoreline this app did not measure. So a lake
 *   straddling the boundary keeps the points that fall outside it.
 *
 * The overshoot is still BOUNDED, because "keep anything that touches" would
 * let one continent-sized polygon back in and the clip is the whole reason this
 * file is 162 KB rather than 45 MB. Measured: 0.21 degrees, one lake.
 */
const OVERSHOOT_DEG = { line: 0.25, area: 1.0 };

test('the box covers the region, and nothing reaches far outside it', () => {
  const b = basemap.bbox;
  assert.ok(b.latMin < REGION.bbox.latMin && b.latMax > REGION.bbox.latMax, 'the box must extend past the region');
  assert.ok(b.lonMin < REGION.bbox.lonMin && b.lonMax > REGION.bbox.lonMax);
  for (const layer of basemap.layers) {
    const slack = OVERSHOOT_DEG[layer.kind];
    let touches = 0;
    for (const shape of layer.shapes) {
      let inside = false;
      for (const [lon, lat] of shape) {
        assert.ok(Number.isFinite(lat) && Number.isFinite(lon), `${layer.id}: a point is not a number`);
        assert.ok(
          lat >= b.latMin - slack && lat <= b.latMax + slack,
          `${layer.id}: latitude ${lat} is more than ${slack} degrees outside the clip`,
        );
        assert.ok(
          lon >= b.lonMin - slack && lon <= b.lonMax + slack,
          `${layer.id}: longitude ${lon} is more than ${slack} degrees outside the clip`,
        );
        if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) inside = true;
      }
      if (inside) touches += 1;
    }
    // Every shape that survived the clip must have a reason to be here.
    assert.equal(touches, layer.shapes.length, `${layer.id}: ${layer.shapes.length - touches} shape(s) never enter the box at all`);
  }
});

test('the coastline actually crosses the region, rather than clipping to a stub', () => {
  // The failure this catches is a clip that keeps a handful of points near one
  // corner: the file would be valid, small, and draw a short line in the sea.
  const coast = basemap.layers.find((l) => l.id === 'coast');
  assert.ok(coast, 'no coastline layer');
  const lats = coast.shapes.flat().map(([, lat]) => lat);
  assert.ok(Math.max(...lats) - Math.min(...lats) > 3, 'the coastline spans less than three degrees of latitude');
});

test('coordinates are rounded to the declared precision and no further', () => {
  // Two more digits than the screen can resolve is a third of the file spent on
  // nothing; fewer would be a position this app did not measure.
  assert.equal(basemap.precision, 4);
  for (const layer of basemap.layers) {
    for (const [lon, lat] of layer.shapes[0]) {
      assert.equal(Math.round(lat * 1e4) / 1e4, lat, `${layer.id}: latitude carries more than 4 places`);
      assert.equal(Math.round(lon * 1e4) / 1e4, lon, `${layer.id}: longitude carries more than 4 places`);
    }
  }
});

test('the data manifest knows the basemap is here', () => {
  // The app asks the manifest BEFORE reaching for a bundle, so a perfectly good
  // file with no manifest entry is a file nothing ever reads.
  assert.equal(manifest.basemap.present, true);
  assert.equal(manifest.basemap.path, '/data/basemap.json');
  assert.match(manifest.basemap.detail, /Natural Earth/);
});

// ---------------------------------------------------------------------------
// What the page says it is showing
// ---------------------------------------------------------------------------

test('the description names the mode and the reference', () => {
  const plan = describeMap({ mode: 'plan', up: null, count: 3, rangeNm: 40 });
  assert.match(plan, /north up and centred/);
  const map = describeMap({ mode: 'map', up: { label: 'TRK UP', reason: null }, count: 3, rangeNm: 40 });
  assert.match(map, /trk up/);
});

test('a north-up fallback carries its reason into the description', () => {
  // A rotation means nothing to a reader who cannot see it, and on this desk
  // the answer is nearly always north-up — the interesting part is why.
  const said = describeMap({ mode: 'map', up: { label: 'NORTH UP', reason: 'the device is not moving' }, count: 0, rangeNm: 20 });
  assert.match(said, /not moving/);
});

test('A SWITCHED-OFF LAYER IS A FACT ABOUT THE PICTURE, and is said', () => {
  // Without this a reader using the panel by voice is told there are no
  // aircraft on a map whose traffic layer somebody turned off, which is a
  // different thing entirely.
  const said = describeMap({ mode: 'plan', up: null, count: 0, rangeNm: 40, off: ['TFC', 'GND'] });
  assert.match(said, /TFC, GND turned off/);
});

test('a missing ground map is stated, never quietly absent', () => {
  const said = describeMap({ mode: 'plan', up: null, count: 1, rangeNm: 10, basemapMissing: true });
  assert.match(said, /ground map is not loaded/);
  assert.match(said, /1 aircraft/, 'and it is still a map with traffic on it');
});

test('THE SPOKEN DESCRIPTION CARRIES THE GROUNDSPEED THE CORNER DRAWS', () => {
  /**
   * A reader who cannot see the canvas gets this sentence and nothing else, so
   * a number added to the glass and not to the sentence is a number they do not
   * have. Both go through `groundspeedReadout`, so they cannot come apart — the
   * defect `selectTape` was extracted to stop on the PFD, where the tape and its
   * description chose their speed independently.
   *
   * SPELLED OUT, because "GS 441" is read aloud as two letters and a number.
   */
  const said = describeMap({ mode: 'map', up: { label: 'TRK UP' }, count: 2, rangeNm: 40, groundspeed: { value: 441.4, provenance: 'LIVE' } });
  assert.match(said, /groundspeed 441 knots/);
  assert.doesNotMatch(said, /GS 441/, 'the abbreviation belongs on the glass, not in speech');
});

test('and says nothing at all when there is no speed to say', () => {
  // Not "groundspeed unavailable" — the corner draws nothing, so the sentence
  // claims nothing. A description of a picture describes the picture.
  const failed = describeMap({ mode: 'map', up: { label: 'TRK UP' }, count: 0, rangeNm: 40, groundspeed: { value: null, provenance: 'FAIL', reason: 'no fix yet' } });
  assert.doesNotMatch(failed, /groundspeed/i);
  assert.doesNotMatch(describeMap({ mode: 'map', up: { label: 'TRK UP' }, count: 0, rangeNm: 40 }), /groundspeed/i);
});

test('a stale speed says so in the sentence too', () => {
  const said = describeMap({ mode: 'map', up: { label: 'TRK UP' }, count: 0, rangeNm: 40, groundspeed: { value: 12, provenance: 'STALE' } });
  assert.match(said, /groundspeed 12 knots, stale/);
});

test('A TRUNCATED PICTURE SAYS SO', () => {
  // The range floors are the real declutter and are a stated policy; the count
  // cap behind them is a backstop, and a scope quietly showing a subset is the
  // defect the floors were added to fix.
  const said = describeMap({ mode: 'plan', up: null, count: 0, rangeNm: 80, runwaysDropped: 14 });
  assert.match(said, /14 more runways are in range than the map draws at once/);
  assert.doesNotMatch(describeMap({ mode: 'plan', up: null, count: 0, rangeNm: 80 }), /more runways/,
    'nothing dropped means no claim at all, not a zero');
});

test('every layer switch has a distinct label whose name OPENS with it', () => {
  // SC 2.5.3. These are flight-deck abbreviations, so "tap ARPT" only has an
  // answer if the spoken name contains the word on the button — and a name that
  // merely mentions it somewhere passes a substring check by accident.
  const labels = new Set();
  for (const l of MAP_LAYERS) {
    assert.ok(!labels.has(l.label), `two switches labelled ${l.label}`);
    labels.add(l.label);
    assert.ok(l.name.startsWith(l.label), `"${l.name}" does not open with "${l.label}"`);
  }
});
