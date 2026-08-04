/**
 * route.test.mjs — the plausible-route parser.
 *
 * THE SHAPE IS NOT CONFIRMED, which is exactly why this exists. adsb.lol's
 * OpenAPI page names `PlaneList` and `PlaneInstance` and the captures of it we
 * have do not expand them, and this sandbox cannot reach api.adsb.lol. So the
 * parser is built to read the shapes the tar1090 family uses, in both the rich
 * and terse forms, and to REFUSE rather than guess when it cannot find a route.
 *
 * Every assertion below is about that refusal being reliable. A parser that
 * invents an origin from a partial answer would be a synthetic data path in a
 * repo whose first rule is that there is not one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRoute } from '../functions/api/route.js';
import { createRouteSource, routeCaveat, routeLine } from '../public/src/data/route.js';

test('route: the rich form, with names and positions', () => {
  const r = parseRoute(
    {
      routes: [
        {
          callsign: 'UAL328',
          airport_codes: 'KSFO-KJFK',
          _airports: [
            { icao: 'KSFO', name: 'San Francisco International', lat: 37.6188, lon: -122.3754 },
            { icao: 'KJFK', name: 'John F Kennedy International', lat: 40.6398, lon: -73.7789 },
          ],
        },
      ],
    },
    'UAL328',
  );
  assert.equal(r.ok, true);
  assert.equal(r.origin.code, 'KSFO');
  assert.equal(r.origin.name, 'San Francisco International');
  assert.equal(r.destination.code, 'KJFK');
  assert.deepEqual(r.via, []);
});

test('route: the terse form, codes only', () => {
  // A code with no name is still a route. A code with an INVENTED name is not.
  const r = parseRoute([{ callsign: 'SWA1509', airport_codes: 'KLAS-KOAK' }], 'SWA1509');
  assert.equal(r.ok, true);
  assert.equal(r.origin.code, 'KLAS');
  assert.equal(r.destination.code, 'KOAK');
  assert.equal(r.origin.name, null, 'a name that was not sent must stay null');
  assert.equal(r.origin.lat, null, 'a position that was not sent must stay null');
});

test('route: a multi-leg route is not reported as a direct one', () => {
  const r = parseRoute([{ callsign: 'AAL1', airport_codes: 'KJFK-KORD-KLAX' }], 'AAL1');
  assert.equal(r.origin.code, 'KJFK');
  assert.equal(r.destination.code, 'KLAX');
  assert.deepEqual(r.via.map((v) => v.code), ['KORD'], 'the stop in the middle must survive');
});

test('route: the entry matching the callsign wins, not the first one', () => {
  // The endpoint takes a SET of aircraft, so the reply can carry several.
  const r = parseRoute(
    { planes: [{ callsign: 'DAL55', airport_codes: 'KATL-EGLL' }, { callsign: 'UAL328', airport_codes: 'KSFO-KJFK' }] },
    'UAL328',
  );
  assert.equal(r.origin.code, 'KSFO');
});

test('route: ONE airport is not a route, and says so', () => {
  const r = parseRoute([{ callsign: 'N172SP', airport_codes: 'KSAC' }], 'N172SP');
  assert.equal(r.ok, false);
  assert.match(r.reason, /one airport/);
});

test('route: an unknown callsign refuses rather than inventing', () => {
  for (const payload of [[], {}, { routes: [] }, null, { detail: [{ loc: ['body'], msg: 'field required' }] }]) {
    const r = parseRoute(payload, 'UAL328');
    assert.equal(r.ok, false, `${JSON.stringify(payload)} should not have produced a route`);
    assert.ok(r.reason && r.reason.length > 10, 'a refusal must explain itself');
  }
});

test('route: PLAUSIBLE is carried from the feed, never asserted by us', () => {
  // adsb.lol's own word. If they ever say a route is confirmed, the panel must
  // say confirmed BECAUSE THEY DID, not because the parser decided.
  assert.equal(parseRoute([{ callsign: 'A', airport_codes: 'K1-K2' }], 'A').plausible, true);
  assert.equal(parseRoute([{ callsign: 'A', airport_codes: 'K1-K2', plausible: false }], 'A').plausible, false);
});

test('route: a position is only reported when the feed sent one', () => {
  // `lng` and `lon` are both in use across this family of APIs; neither may be
  // conjured when absent.
  const withLng = parseRoute([{ callsign: 'A', _airports: [{ icao: 'K1', lat: 1, lng: 2 }, { icao: 'K2' }] }], 'A');
  assert.equal(withLng.origin.lon, 2, 'lng must be read as a longitude');
  assert.equal(withLng.destination.lat, null);
  assert.equal(withLng.destination.lon, null);
});

/**
 * THE CLIENT SIDE — the wording, which is the part a reader actually meets.
 *
 * `routeLine` and `routeCaveat` are pure for exactly this reason. The panel's
 * whole contract is that a value carries where it came from, and here that
 * means a reader who is not a pilot has to be able to tell three states apart:
 * we have not asked yet, there is no route, and here is a route that is a
 * GUESS. Prose is the implementation, so prose is what is tested.
 */
test('route line: nothing is claimed before an answer arrives', () => {
  assert.equal(routeLine(null), null);
  assert.equal(routeLine({ state: 'unknown', reason: 'waiting for the aircraft’s position' }), null);
  assert.equal(routeLine({ state: 'none', reason: 'the route feed had no answer' }), null);
});

test('route line: origin to destination, and every leg between', () => {
  assert.equal(routeLine({ state: 'known', origin: { code: 'KSFO' }, destination: { code: 'KJFK' }, via: [] }), 'KSFO → KJFK');
  assert.equal(
    routeLine({ state: 'known', origin: { code: 'KSFO' }, destination: { code: 'KJFK' }, via: [{ code: 'KDEN' }] }),
    'KSFO → KJFK via KDEN',
  );
});

test('route line: half a route is not a route', () => {
  // A destination with no origin would render as "→ KJFK", which reads like a
  // fact and is a missing field.
  assert.equal(routeLine({ state: 'known', origin: null, destination: { code: 'KJFK' }, via: [] }), null);
  assert.equal(routeLine({ state: 'known', origin: { code: 'KSFO' }, destination: {}, via: [] }), null);
});

test('route caveat: it exists whenever a route does, and says PLAUSIBLE', () => {
  const caveat = routeCaveat({ state: 'known', plausible: true });
  assert.match(caveat, /plausible/i, 'adsb.lol’s own word must be the one on screen');
  assert.match(caveat, /callsign/i, 'the method is what makes it a guess');
  assert.match(caveat, /not a filed flight plan/i, 'the sentence that stops it being read as a clearance');
});

test('route caveat: never present without a route, never absent with one', () => {
  assert.equal(routeCaveat(null), null);
  assert.equal(routeCaveat({ state: 'unknown' }), null);
  assert.equal(routeCaveat({ state: 'none', reason: 'no answer' }), null);
  assert.ok(routeCaveat({ state: 'known', plausible: true }));
  assert.ok(routeCaveat({ state: 'known', plausible: false }));
});

test('route source: no callsign and no position are asked about, ever', async () => {
  let calls = 0;
  const src = createRouteSource({
    fetchImpl: async () => {
      calls += 1;
      return { json: async () => ({ ok: true }) };
    },
    clock: () => 0,
  });

  assert.equal((await src.forFlight('', { lat: 1, lon: 2 })).state, 'unknown');
  assert.equal(calls, 0, 'a blank callsign must not cost an upstream request');

  // NO POSITION IS NOT A REASON TO INVENT ONE. The feed disambiguates a reused
  // callsign by where the aircraft is; a made-up point would be a synthetic
  // input in a repo whose first rule is that there is not one.
  const noPos = await src.forFlight('UAL328', null);
  assert.equal(noPos.state, 'unknown');
  assert.match(noPos.reason, /position/);
  assert.equal(calls, 0, 'a missing position must not cost an upstream request either');
});

test('route source: one request per flight, not one per sweep', async () => {
  let calls = 0;
  const src = createRouteSource({
    fetchImpl: async () => {
      calls += 1;
      return {
        json: async () => ({ ok: true, origin: { code: 'KSFO' }, destination: { code: 'KJFK' }, via: [], plausible: true }),
      };
    },
    clock: () => 0,
  });

  const at = { lat: 37.6, lon: -122.4 };
  for (let i = 0; i < 20; i += 1) await src.forFlight('UAL328', at);
  assert.equal(calls, 1, 'twenty sweeps of the same flight must cost one request');

  await src.forFlight('SWA100', at);
  assert.equal(calls, 2, 'a different flight is a different question');
});

test('route source: a feed that fails says so instead of going quiet', async () => {
  const src = createRouteSource({
    fetchImpl: async () => {
      throw new Error('network down');
    },
    clock: () => 0,
  });
  const r = await src.forFlight('UAL328', { lat: 1, lon: 2 });
  assert.equal(r.state, 'none');
  assert.match(r.reason, /unreachable/);
  assert.equal(routeLine(r), null, 'a failed fetch must never render as a route');
});
