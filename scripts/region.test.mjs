/**
 * region.test.mjs — the app stops being a Northern California panel.
 *
 * WHAT THIS IS ACTUALLY GUARDING. Three feeds were nailed to a constant, and
 * the worst of them was the advisory placement: "Over your area" meant "over
 * Northern California" for every reader who was not standing in it. That is not
 * an inconvenience, it is the panel making a claim about the reader that is not
 * about the reader — the one thing this app spends all its effort not doing.
 *
 * None of it is visible from a screenshot taken at home, where every one of
 * these functions returns exactly what it used to. So it is measured here.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_QUERY_SPAN_DEG,
  QUERY_HALF_WIDTH_NM,
  QUERY_QUANTUM_DEG,
  REGION,
  metarBboxParam,
  queryBox,
} from '../public/src/core/region.js';
import { insideBundle, queryCentre } from '../public/src/data/position.js';
import { wxBbox, wxBboxParam } from '../public/src/data/wxtext.js';
// THE REAL VALIDATOR, imported rather than described. A test that re-stated the
// Function's rules would pass while the Function refused every box we sent —
// and a refusal counts against a rate limit, so nobody would see an error, only
// a feed that had quietly stopped answering.
import { parseBbox } from '../functions/api/_lib.js';

const fix = (lat, lon) => ({
  'position.lat': { value: lat, provenance: 'LIVE' },
  'position.lon': { value: lon, provenance: 'LIVE' },
});
const store = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const remembered = (lat, lon) => store({ 'fauxplane:last-fix': JSON.stringify({ lat, lon }) });

const DENVER = { lat: 39.7392, lon: -104.9903 };

// ---------------------------------------------------------------------------
// Where the reader is: one ladder, and every rung names itself
// ---------------------------------------------------------------------------

test('THE LIVE FIX WINS, and says it is a fix', () => {
  const at = queryCentre(fix(DENVER.lat, DENVER.lon), remembered(51.5, -0.12));
  assert.equal(at.kind, 'fix');
  assert.equal(at.isFix, true);
  assert.equal(at.lat, DENVER.lat);
  // The remembered fix is present and is CORRECTLY ignored — a measurement from
  // this second outranks one from last week.
  assert.notEqual(at.lon, -0.12);
});

test('a FAILED position falls to the remembered one, and stops claiming to be a fix', () => {
  const failed = {
    'position.lat': { value: null, provenance: 'FAIL', reason: 'no fix yet' },
    'position.lon': { value: null, provenance: 'FAIL', reason: 'no fix yet' },
  };
  const at = queryCentre(failed, remembered(DENVER.lat, DENVER.lon));
  assert.equal(at.kind, 'last');
  assert.equal(at.isFix, false);
  assert.equal(at.lat, DENVER.lat);
  assert.match(at.label, /last position/i);
});

test('AND WITH NOTHING AT ALL IT IS THE REGION, named as the fallback it is', () => {
  // A position nobody measured. Anything that shows a number derived from this
  // has to be able to say so, which is what `kind` and `label` are for.
  const at = queryCentre({}, store());
  assert.equal(at.kind, 'home');
  assert.equal(at.isFix, false);
  assert.equal(at.lat, REGION.home.lat);
  assert.match(at.label, /reference this panel starts from/i);
});

test('a LIVE provenance with no number is not a position', () => {
  // The store's own failure mode, and the one a truthiness guard would miss.
  const at = queryCentre({
    'position.lat': { value: null, provenance: 'LIVE' },
    'position.lon': { value: null, provenance: 'LIVE' },
  }, store());
  assert.equal(at.kind, 'home');
});

test('STALE IS STILL A POSITION', () => {
  // It is the last thing actually measured, and it is metres from where the
  // reader is. Falling back to a constant a thousand miles away because a fix
  // aged past a threshold would be worse in every case.
  const at = queryCentre({
    'position.lat': { value: DENVER.lat, provenance: 'STALE' },
    'position.lon': { value: DENVER.lon, provenance: 'STALE' },
  }, store());
  assert.equal(at.kind, 'fix');
  assert.equal(at.lat, DENVER.lat);
});

test('storage that throws is not an error the reader has to see', () => {
  const at = queryCentre({}, { getItem() { throw new Error('SecurityError'); } });
  assert.equal(at.kind, 'home');
});

// ---------------------------------------------------------------------------
// Turning that into a box
// ---------------------------------------------------------------------------

test('the box covers roughly what the old constants covered, from home', () => {
  // The half-widths were chosen to REPRODUCE today's coverage, not to change
  // it. If these drift the app is quietly asking about a different area than
  // the one every prior release was tuned against.
  const metar = queryBox(REGION.home, QUERY_HALF_WIDTH_NM.metar).bbox;
  const old = REGION.metarBbox;
  assert.ok(Math.abs((metar.latMax - metar.latMin) - (old.latMax - old.latMin)) < 0.4,
    'the METAR box changed height');
  assert.ok(Math.abs((metar.lonMax - metar.lonMin) - (old.lonMax - old.lonMin)) < 0.4,
    'the METAR box changed width');

  const wx = queryBox(REGION.home, QUERY_HALF_WIDTH_NM.wxtext).bbox;
  assert.ok(Math.abs((wx.latMax - wx.latMin) - (REGION.bbox.latMax - REGION.bbox.latMin)) < 0.5);
  assert.ok(Math.abs((wx.lonMax - wx.lonMin) - (REGION.bbox.lonMax - REGION.bbox.lonMin)) < 0.5);
});

test('THE CENTRE IS SNAPPED, so a stationary reader asks the same question all day', () => {
  /**
   * THIS IS THE ONE THAT WOULD HAVE BITTEN SILENTLY. `cached()` keys on the
   * URL, so a box that moved with GPS jitter would miss the edge cache on every
   * refresh — one fresh query to a free public service per reader every few
   * minutes, which is the shape §15.4 and §15.6 forbid. Nothing on screen would
   * look any different.
   */
  const a = queryBox({ lat: 39.7392, lon: -104.9903 }, 35).param;
  const b = queryBox({ lat: 39.7411, lon: -104.9887 }, 35).param;
  assert.equal(a, b, 'two fixes a few hundred metres apart produced different query URLs');

  // And it really does move when the reader does.
  const far = queryBox({ lat: 39.9, lon: -104.9903 }, 35).param;
  assert.notEqual(a, far, 'the box is not moving at all');
});

test('the snap is the same quantum the traffic Function already uses', () => {
  // One coarsening rule, stated once. Two would be two privacy decisions.
  assert.equal(QUERY_QUANTUM_DEG, 0.1);
  const at = queryBox({ lat: 39.7392, lon: -104.9903 }, 35).centre;
  assert.ok(Math.abs(at.lat - 39.7) < 1e-9);
  assert.ok(Math.abs(at.lon - -105.0) < 1e-9);
});

test('no position means NO BOX, never a box over the middle of nowhere', () => {
  assert.equal(queryBox(null, 35), null);
  assert.equal(queryBox({ lat: null, lon: -105 }, 35), null);
  assert.equal(queryBox({ lat: Number.NaN, lon: -105 }, 35), null);
  assert.equal(queryBox({ lat: 39, lon: -105 }, 0), null, 'a zero-width box asks about nothing');
  assert.equal(queryBox({ lat: 39, lon: -105 }, Number.NaN), null);
});

// ---------------------------------------------------------------------------
// The two clamps, held against the REAL validator
// ---------------------------------------------------------------------------

test('EVERY BOX THE APP CAN BUILD IS ONE THE FUNCTION ACCEPTS', () => {
  /**
   * A refused box is a 400, and adsb.fi's terms say a 400 counts toward a
   * temporary IP restriction charged to an egress address shared with every
   * other Cloudflare tenant. So this is not a tidiness check: an unclamped box
   * is a feed that stops answering for reasons nobody can see.
   *
   * The places that break it are real ones — northern Norway, Alaska, Fiji,
   * the Chathams — and the app has family users, which is the entire reason
   * this release exists.
   */
  const places = [
    ['home', REGION.home.lat, REGION.home.lon],
    ['Denver', 39.7392, -104.9903],
    ['London', 51.5072, -0.1276],
    ['Auckland', -36.8485, 174.7633],
    ['Suva, near the antimeridian', -18.1416, 178.4419],
    ['Chatham Islands, the other side of it', -43.9535, -176.5597],
    ['Tromsø', 69.6492, 18.9553],
    ['Longyearbyen, 78°N', 78.2232, 15.6469],
    ['Alert, 82°N', 82.5018, -62.3481],
    ['McMurdo', -77.8419, 166.6863],
    ['the South Pole', -89.99, 0],
  ];
  for (const [name, lat, lon] of places) {
    for (const [feed, halfWidth] of Object.entries(QUERY_HALF_WIDTH_NM)) {
      const box = queryBox({ lat, lon }, halfWidth);
      assert.ok(box, `${name}: ${feed} produced no box at all`);
      const verdict = parseBbox(box.param);
      assert.equal(verdict.error, undefined, `${name}: ${feed} — the Function refuses this box: ${verdict.error}`);
    }
  }
});

test('the span clamp bites where it has to and nowhere else', () => {
  // A degree of longitude shrinks toward the poles, so the 100 nm box crosses
  // the cap above about 74 degrees. Below that nothing is clamped, and a clamp
  // that fired at home would be silently shrinking every ordinary query.
  const polar = queryBox({ lat: 80, lon: 0 }, QUERY_HALF_WIDTH_NM.wxtext).bbox;
  assert.ok(polar.lonMax - polar.lonMin <= MAX_QUERY_SPAN_DEG + 1e-9);

  const home = queryBox(REGION.home, QUERY_HALF_WIDTH_NM.wxtext).bbox;
  assert.ok(home.lonMax - home.lonMin < MAX_QUERY_SPAN_DEG - 6, 'the ordinary case is nowhere near the cap');
});

test('longitude never leaves the meridian, because parseBbox refuses one that does', () => {
  for (const lon of [179.95, -179.95, 180, -180]) {
    const box = queryBox({ lat: 0, lon }, QUERY_HALF_WIDTH_NM.wxtext);
    if (!box) continue; // exactly on the meridian collapses a side, and refusing is right
    assert.ok(box.bbox.lonMin >= -180 && box.bbox.lonMax <= 180, `lon ${lon} escaped the meridian`);
    assert.equal(parseBbox(box.param).error, undefined);
  }
});

// ---------------------------------------------------------------------------
// The two feeds actually follow it
// ---------------------------------------------------------------------------

test('THE METAR BOX FOLLOWS THE READER, and falls back to the region only with no position', () => {
  const away = metarBboxParam(DENVER);
  const [latMin, lonMin, latMax, lonMax] = away.split(',').map(Number);
  assert.ok(latMin < DENVER.lat && DENVER.lat < latMax, 'Denver is not inside the box asked about for Denver');
  assert.ok(lonMin < DENVER.lon && DENVER.lon < lonMax);
  assert.notEqual(away, metarBboxParam(null));

  // The fallback is the old constant, unchanged, and it is a real state: a
  // panel that has just come up has no position at all.
  const b = REGION.metarBbox;
  assert.equal(metarBboxParam(null), `${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}`);
});

test('the text-report box follows the reader too, and stays inside what the Function allows', () => {
  const param = wxBboxParam(DENVER);
  const [latMin, lonMin, latMax, lonMax] = param.split(',').map(Number);
  assert.ok(latMin < DENVER.lat && DENVER.lat < latMax);
  assert.ok(lonMin < DENVER.lon && DENVER.lon < lonMax);
  assert.equal(parseBbox(param).error, undefined);
});

test('THE BOX ASKED ABOUT AND THE BOX SORTED AGAINST ARE THE SAME BOX', () => {
  /**
   * The ATIS page groups advisories into "Over your area" and "Elsewhere"
   * against a rectangle. If that is not the rectangle the reports were fetched
   * for, an advisory genuinely overhead can be filed under Elsewhere — the
   * failure is a hazard being hidden, and it looks like nothing at all.
   */
  const param = wxBboxParam(DENVER);
  const box = wxBbox(DENVER);
  assert.equal(`${box.latMin},${box.lonMin},${box.latMax},${box.lonMax}`, param);
});

// ---------------------------------------------------------------------------
// Saying when the reader is outside the bundle
// ---------------------------------------------------------------------------

test('inside, outside, and NOBODY KNOWS are three answers, not two', () => {
  const bbox = { latMin: 37, latMax: 40.4, lonMin: -123.2, lonMax: -118.8 };
  assert.equal(insideBundle({ lat: 38.68, lon: -121 }, bbox), true);
  assert.equal(insideBundle(DENVER, bbox), false);
  /**
   * NULL IS NOT FALSE, and the distinction is the whole reason this returns
   * three things. Before the bundle loads nobody can tell, and a panel that
   * guessed would tell a reader standing in Sacramento that their map does not
   * cover them — which is both wrong and the exact opposite of reassuring.
   */
  assert.equal(insideBundle({ lat: 38.68, lon: -121 }, null), null, 'no bundle yet');
  assert.equal(insideBundle(null, bbox), null, 'no position yet');
  assert.equal(insideBundle({ lat: 38.68, lon: -121 }, { latMin: 37 }), null, 'a half-described box');
});

test('the edges belong to the region', () => {
  const bbox = { latMin: 37, latMax: 40.4, lonMin: -123.2, lonMax: -118.8 };
  assert.equal(insideBundle({ lat: 37, lon: -123.2 }, bbox), true);
  assert.equal(insideBundle({ lat: 40.4, lon: -118.8 }, bbox), true);
  assert.equal(insideBundle({ lat: 40.5, lon: -118.8 }, bbox), false);
});

// ---------------------------------------------------------------------------
// The wiring, which is where this kind of change actually fails
// ---------------------------------------------------------------------------

test('EVERY FEED CALL SITE PASSES A CENTRE — the helper is not enough', () => {
  /**
   * A HELPER CAN BE PERFECT AND UNUSED, and this release is exactly the shape
   * where that happens: `queryBox` and `queryCentre` can be flawless while a
   * single call site still passes nothing, and everything falls back to the
   * region with no error anywhere. At home the app would look identical, and
   * the person who found it would be somebody's family in another state.
   *
   * These are DOM and network call sites, so the source is the reach there is
   * — the same argument `plan.test.mjs` makes about the airport idents, which
   * shipped unnoticed for four releases behind a perfect helper.
   */
  const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

  assert.match(src('../public/src/data/metar.js'), /metarBboxParam\(from\)/,
    'the METAR query stopped following the reader');
  assert.match(src('../public/src/data/metar.js'), /queryCentre\(fields/,
    'METAR is measuring distance from something other than the shared ladder');

  assert.match(src('../public/src/data/wxtext.js'), /wxBboxParam\(centre\)/,
    'the text-report query stopped following the reader');

  assert.match(src('../public/src/app.js'), /wxText\.refresh\(queryCentre\(state\.snapshot\.fields\)\)/,
    'app.js stopped handing the text reports a centre');

  assert.match(src('../public/src/panels/atis.js'), /wxText\?\.area/,
    'the ATIS page went back to sorting advisories against a box of its own');

  assert.match(src('../public/src/panels/selftest.js'), /metarBboxParam\(at\)/,
    'the self test probes a different box than the app uses, which is how it once accused a working feed');
});

test('AND THE FALLBACK IS NOT LEFT AS THE ANSWER ANYWHERE', () => {
  // `REGION.bbox` and `REGION.metarBbox` may only appear as the stated no-fix
  // fallback. A panel reading them to decide what to ask about is the defect
  // this release exists to remove, and it reads as perfectly ordinary code.
  const atis = readFileSync(new URL('../public/src/panels/atis.js', import.meta.url), 'utf8');
  assert.doesNotMatch(atis, /placeReports\(reports, REGION\.bbox/,
    'advisories are being placed against the region again');
});
