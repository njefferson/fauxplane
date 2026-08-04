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

import { ROUTE_SOURCE, onRequestGet, parseRoute } from '../functions/api/route.js';
import { inCooldown, noteRefusal } from '../functions/api/_lib.js';
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

/**
 * THE STANDOFF IS PER PROVIDER, AND THIS IS THE TEST THAT WOULD HAVE CAUGHT IT.
 *
 * 1.21.0 shipped with the route feed keying its cooldown as `adsb.lol:route`.
 * That reads like scoping and is the opposite: adsb.lol rate limit per IP
 * across their whole API, so a private cooldown for one endpoint is no cooldown
 * at all. Two failures, in opposite directions, from one wrong string:
 *
 *   · a 429 earned by a ROUTE request never told the TRAFFIC feed to back off
 *   · a traffic feed already standing off still got asked for routes
 *
 * And the symptom is not a missing route — it is an EMPTY SCOPE, because the
 * aircraft feed is the one that runs every ten seconds and loses the race for a
 * shared Cloudflare egress address.
 */
test('cooldown: a refusal on the route feed silences the aircraft feed too', async () => {
  const store = new Map();
  const cache = {
    put: async (req, res) => store.set(req.url, res),
    match: async (req) => store.get(req.url) ?? null,
  };
  const request = new Request('https://example.test/api/route?callsign=UAL328&lat=1&lon=2');

  // What route.js records when adsb.lol refuses it: the PROVIDER's id.
  await noteRefusal(request, ROUTE_SOURCE.id, 600, 'refused us (HTTP 429) on the route feed', cache);

  const seenByTraffic = await inCooldown(request, 'adsb.lol', cache);
  assert.ok(
    seenByTraffic,
    'a refusal earned on the route feed must be visible to the traffic feed — they share one IP and one allowance',
  );
  assert.equal(seenByTraffic.id, 'adsb.lol');

  // The endpoint-scoped key is what shipped, and it is what must never come back.
  assert.equal(
    await inCooldown(request, 'adsb.lol:route', cache),
    null,
    'the standoff must not be recorded under a per-endpoint key',
  );
});

test('cooldown: the route feed honours a standoff the aircraft feed earned', async () => {
  const store = new Map();
  const cache = { put: async (r, v) => store.set(r.url, v), match: async (r) => store.get(r.url) ?? null };
  const request = new Request('https://example.test/api/route?callsign=UAL328&lat=1&lon=2');

  // Traffic got a 429 first — the ordinary case, since it asks far more often.
  await noteRefusal(request, 'adsb.lol', 60, 'rate limited (HTTP 429)', cache);

  // route.js checks exactly this key before sending anything upstream.
  const seenByRoute = await inCooldown(request, ROUTE_SOURCE.id, cache);
  assert.ok(seenByRoute, 'the route feed must not ask a provider the traffic feed has just agreed to leave alone');
  assert.match(seenByRoute.reason, /429/);

  // A DIFFERENT provider is untouched: this is a standoff, not a mute button.
  assert.equal(await inCooldown(request, 'adsb.fi', cache), null);
});

/**
 * DRIVEN THROUGH `onRequestGet`, AND THAT IS THE WHOLE POINT OF THIS ONE.
 *
 * The two tests above call `noteRefusal` with the right id and assert the right
 * thing happens — and they would BOTH have passed while route.js was writing
 * `adsb.lol:route`, because they never went near route.js's call site. That is
 * hub LESSONS §42 exactly: a gate on the decision function cannot see the path
 * that never asks it. So this one makes the real handler run and reads what it
 * actually wrote.
 */
test('the route handler records its refusal against the PROVIDER, through the real path', async () => {
  const store = new Map();
  const fakeCache = {
    put: async (req, res) => store.set(typeof req === 'string' ? req : req.url, res),
    match: async (req) => store.get(typeof req === 'string' ? req : req.url) ?? null,
    delete: async () => true,
  };
  const realCaches = globalThis.caches;
  const realFetch = globalThis.fetch;
  globalThis.caches = { default: fakeCache };
  // adsb.lol turning us away, with no Retry-After, which is the common shape.
  globalThis.fetch = async () => new Response('{}', { status: 429, headers: { 'content-type': 'application/json' } });

  try {
    const request = new Request('https://example.test/api/route?callsign=UAL328&lat=38.7&lon=-121.0');
    await onRequestGet({ request });

    const keys = [...store.keys()];
    assert.ok(
      keys.some((k) => /adsb\.lol/.test(k) && !/adsb\.lol:route|adsb\.lol%3Aroute/.test(k)),
      `the standoff must be keyed on the provider; the handler wrote ${JSON.stringify(keys)}`,
    );
    assert.ok(
      !keys.some((k) => /adsb\.lol:route|adsb\.lol%3Aroute/.test(k)),
      `a per-endpoint standoff is not a standoff — the handler wrote ${JSON.stringify(keys)}`,
    );
  } finally {
    globalThis.caches = realCaches;
    globalThis.fetch = realFetch;
  }
});

/**
 * THE FIRST REAL PROBE CAME BACK 201, AND THE PROBE COULD NOT SAY WHAT THAT WAS.
 *
 * adsb.lol answered Noah's device with HTTP 201 — not the 422 a wrong request
 * shape produces, so the shape was ACCEPTED — and the report could only say
 * "the reply carried no readable keys". True, and useless: it cannot tell an
 * empty body from a non-JSON body from valid JSON of an unexpected shape, and
 * those need three different fixes.
 *
 * A probe that reports a status without the body is half a probe.
 */
test('probe: an empty 201 is distinguishable from unparseable JSON', async () => {
  const seen = [];
  const store = new Map();
  const cache = {
    put: async (r, v) => store.set(typeof r === 'string' ? r : r.url, v),
    match: async () => null,
    delete: async () => true,
  };
  const realCaches = globalThis.caches;
  const realFetch = globalThis.fetch;
  globalThis.caches = { default: cache };

  const run = async (body, status = 201, contentType = 'application/json') => {
    globalThis.fetch = async () => new Response(body, { status, headers: { 'content-type': contentType } });
    const request = new Request('https://example.test/api/route?callsign=UAL328&lat=38.7&lon=-121.0');
    const res = await onRequestGet({ request });
    const out = await res.json();
    seen.push(out.probe);
    return out.probe;
  };

  try {
    const empty = await run('');
    assert.equal(empty.status, 201);
    assert.equal(empty.bodyLength, 0, 'an empty body must report zero bytes, not null');
    assert.equal(empty.parsed, false);

    const garbage = await run('<!doctype html><html>nope</html>', 201, 'text/html');
    assert.ok(garbage.bodyLength > 0, 'a non-JSON body must report its real length');
    assert.equal(garbage.parsed, false);
    assert.match(garbage.bodyPrefix, /doctype/i, 'the raw text is the evidence — it must be carried');
    assert.match(garbage.contentType, /text\/html/);

    const good = await run(JSON.stringify([{ callsign: 'UAL328', airport_codes: 'KSFO-KJFK' }]));
    assert.equal(good.parsed, true);
    assert.ok(good.bodyLength > 0);

    // The three states must be TELLABLE APART, which is the entire point.
    assert.notDeepEqual(
      [empty.bodyLength, empty.parsed],
      [garbage.bodyLength, garbage.parsed],
      'empty and unparseable must not read identically',
    );
  } finally {
    globalThis.caches = realCaches;
    globalThis.fetch = realFetch;
  }
});

test('probe: the raw body is bounded so a huge reply cannot flood the report', async () => {
  const store = new Map();
  const realCaches = globalThis.caches;
  const realFetch = globalThis.fetch;
  globalThis.caches = { default: { put: async (r, v) => store.set(r.url ?? r, v), match: async () => null, delete: async () => true } };
  globalThis.fetch = async () => new Response('x'.repeat(50_000), { status: 201, headers: { 'content-type': 'text/plain' } });
  try {
    const res = await onRequestGet({ request: new Request('https://example.test/api/route?callsign=UAL328&lat=1&lon=2') });
    const { probe } = await res.json();
    assert.equal(probe.bodyLength, 50_000, 'the TRUE length is reported');
    assert.ok(probe.bodyPrefix.length <= 400, 'but only a bounded prefix travels');
  } finally {
    globalThis.caches = realCaches;
    globalThis.fetch = realFetch;
  }
});
