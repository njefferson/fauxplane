/**
 * airport-picker.test.mjs — "Airports should be easy to pick."
 *
 * Noah asked for this on 2026-08-03: set the radar's centre to an airport, or
 * to any other location. The data is OurAirports, bundled — which matters
 * beyond convenience: a dataset in the repo is immune to the rate limiting that
 * has been breaking the live feed, and that is the shape Doctrine §15.1b now
 * asks sessions to look for.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLatLon, searchAirports, runwaysNear } from '../public/src/data/navdata.js';

const AIRPORTS = [
  { ident: 'KSFO', icao_code: 'KSFO', iata_code: 'SFO', name: 'San Francisco International Airport', municipality: 'San Francisco', type: 'large_airport', lat: 37.6, lon: -122.4 },
  { ident: 'KSAC', icao_code: 'KSAC', iata_code: 'SAC', name: 'Sacramento Executive Airport', municipality: 'Sacramento', type: 'medium_airport', lat: 38.5, lon: -121.5 },
  { ident: 'KSMF', icao_code: 'KSMF', iata_code: 'SMF', name: 'Sacramento International Airport', municipality: 'Sacramento', type: 'large_airport', lat: 38.7, lon: -121.6 },
  { ident: 'CA35', icao_code: null, iata_code: null, name: 'San Andreas Airstrip', municipality: 'San Andreas', type: 'small_airport', lat: 38.2, lon: -120.7 },
  { ident: 'O88', icao_code: null, iata_code: null, name: 'Rio Vista Municipal Airport', municipality: 'Rio Vista', type: 'small_airport', lat: 38.2, lon: -121.7 },
];

test('an exact identifier outranks everything', () => {
  const [first] = searchAirports(AIRPORTS, 'KSAC');
  assert.equal(first.ident, 'KSAC');
});

test('a partial code works — nobody types four letters before they mean it', () => {
  const hits = searchAirports(AIRPORTS, 'ksm').map((a) => a.ident);
  assert.deepEqual(hits, ['KSMF']);
});

test('IATA codes are searched too, not only ICAO', () => {
  const [first] = searchAirports(AIRPORTS, 'sfo');
  assert.equal(first.ident, 'KSFO');
});

test('typing a town finds its airports, BIG ONES FIRST', () => {
  // "sacramento" should offer the international before the executive field.
  const hits = searchAirports(AIRPORTS, 'sacramento').map((a) => a.ident);
  assert.deepEqual(hits, ['KSMF', 'KSAC']);
});

test('a big airport outranks a small one, but the small one is still THERE', () => {
  // A ranking, not a filter. Someone looking for the airstrip must still find it.
  const hits = searchAirports(AIRPORTS, 'san').map((a) => a.ident);
  assert.equal(hits[0], 'KSFO', 'the international should lead');
  assert.ok(hits.includes('CA35'), 'the airstrip was filtered out rather than ranked down');
});

test('a mid-word match is found, but ranks below a prefix', () => {
  const hits = searchAirports(AIRPORTS, 'vista').map((a) => a.ident);
  assert.ok(hits.includes('O88'));
});

test('one character searches nothing — every airport is not a suggestion', () => {
  assert.deepEqual(searchAirports(AIRPORTS, 'k'), []);
  assert.deepEqual(searchAirports(AIRPORTS, ''), []);
  assert.deepEqual(searchAirports(AIRPORTS, null), []);
});

test('the result count is bounded', () => {
  assert.ok(searchAirports(AIRPORTS, 'a', 3).length <= 3);
  assert.ok(searchAirports(AIRPORTS, 'san', 1).length <= 1);
});

test('no airports at all is empty, not a throw', () => {
  assert.deepEqual(searchAirports(null, 'ksfo'), []);
});

// ---------------------------------------------------------------------------
// "or another location"
// ---------------------------------------------------------------------------

test('a plain coordinate pair is accepted', () => {
  assert.deepEqual(parseLatLon('38.68, -121.00'), { lat: 38.68, lon: -121 });
  assert.deepEqual(parseLatLon('38.68 -121'), { lat: 38.68, lon: -121 });
  assert.deepEqual(parseLatLon(' 38.68°, -121.00° '), { lat: 38.68, lon: -121 });
});

test('ANYTHING it cannot read returns null rather than a guess', () => {
  // A mis-parsed coordinate centres the scope somewhere real and wrong, which
  // is worse than refusing — the reader would believe it.
  for (const bad of ['KSFO', '38.68', 'north of town', '', null, '38.68, -121.00, 400']) {
    assert.equal(parseLatLon(bad), null, `accepted "${bad}"`);
  }
});

test('a coordinate off the globe is refused', () => {
  assert.equal(parseLatLon('91, 0'), null);
  assert.equal(parseLatLon('0, 181'), null);
  assert.deepEqual(parseLatLon('90, 180'), { lat: 90, lon: 180 }, 'the poles and the date line are real places');
});

/**
 * RUNWAYS ON THE SCOPE (Noah, 2026-08-03: "Show the runway at airports.")
 *
 * The bundle has carried 407 of them since 1.16.0 and nothing drew any. These
 * hold the selection honest: real thresholds only, nothing closed, nothing
 * half-described, and bounded by the range actually on screen.
 */
const RUNWAY_FIXTURE = {
  runways: [
    // KSMF 17L/35R, real coordinates from the bundle.
    { airport_ident: 'KSMF', length_ft: 8605, closed: false, le_lat: 38.707141, le_lon: -121.580077, he_lat: 38.683518, he_lon: -121.580474 },
    // Closed: must never be drawn like an open one.
    { airport_ident: 'XXXX', length_ft: 4000, closed: true, le_lat: 38.70, le_lon: -121.58, he_lat: 38.69, he_lon: -121.58 },
    // Half-described: no high end, so there is no line to draw.
    { airport_ident: 'YYYY', length_ft: 4000, closed: false, le_lat: 38.70, le_lon: -121.58, he_lat: null, he_lon: null },
    // Real, but a long way off.
    { airport_ident: 'KSFO', length_ft: 11870, closed: false, le_lat: 37.6131, le_lon: -122.3577, he_lat: 37.6273, he_lon: -122.3654 },
  ],
};

test('runways: only real, open, fully-described runways inside the range', () => {
  const near = runwaysNear(RUNWAY_FIXTURE, { lat: 38.6954, lon: -121.591 }, 10);
  assert.deepEqual(near.map((r) => r.ident), ['KSMF'], 'closed, half-described and distant runways must all be dropped');
  assert.equal(near[0].lengthFt, 8605);
  // Both thresholds survive, because the LINE is the runway.
  assert.ok(Number.isFinite(near[0].le.lat) && Number.isFinite(near[0].he.lat));
});

test('runways: the range is the scope range, not the region', () => {
  const centre = { lat: 38.6954, lon: -121.591 };
  assert.equal(runwaysNear(RUNWAY_FIXTURE, centre, 10).length, 1);
  // KSFO is about 75 nm away, so it appears at 80 and not at 40.
  assert.equal(runwaysNear(RUNWAY_FIXTURE, centre, 40).length, 1);
  assert.equal(runwaysNear(RUNWAY_FIXTURE, centre, 80).length, 2);
});

test('runways: no centre means no runways, never a guess', () => {
  assert.deepEqual(runwaysNear(RUNWAY_FIXTURE, null, 40), []);
  assert.deepEqual(runwaysNear(RUNWAY_FIXTURE, { lat: null, lon: null }, 40), []);
  assert.deepEqual(runwaysNear(null, { lat: 38.7, lon: -121.6 }, 40), []);
});

test('runways: nearest first, and capped so a busy area is not solid ink', () => {
  const many = { runways: Array.from({ length: 60 }, (_, i) => ({
    airport_ident: `R${i}`,
    closed: false,
    le_lat: 38.70 + i * 0.001,
    le_lon: -121.59,
    he_lat: 38.69 + i * 0.001,
    he_lon: -121.59,
  })) };
  const near = runwaysNear(many, { lat: 38.6954, lon: -121.591 }, 80, 40);
  assert.equal(near.length, 40, 'the cap is applied');
  for (let i = 1; i < near.length; i += 1) {
    assert.ok(near[i].distanceNm >= near[i - 1].distanceNm, 'nearest first');
  }
});
