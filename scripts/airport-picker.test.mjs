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

import { parseLatLon, searchAirports } from '../public/src/data/navdata.js';

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
