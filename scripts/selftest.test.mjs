/**
 * selftest.test.mjs — the checks the self test makes, checked.
 *
 * Noah, 2026-08-04: *"You could build a simple test that I run, like the debug
 * sheet, instead of redoing the whole app every fucking time."*
 *
 * The self test exists to answer questions this sandbox cannot — the real feeds,
 * iOS, the service worker. That does NOT excuse it from being tested itself: a
 * diagnostic that lies is worse than no diagnostic, because it is believed.
 * Every source of truth it reads is injectable for exactly this reason.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { feedProbes, formatSelfTest, platformFacts, runSelfTest, sensorFacts } from '../public/src/panels/selftest.js';

const fakeWin = (over = {}) => ({
  navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5, geolocation: {}, ...(over.navigator ?? {}) },
  matchMedia: () => ({ matches: false }),
  innerWidth: 1180,
  innerHeight: 788,
  orientation: 90,
  screen: { orientation: { angle: 0, type: 'landscape-primary' } },
  ...over,
});

test('platform: an iPad claiming to be a Mac is called an iPad', () => {
  // iPadOS Safari reports itself as Macintosh. maxTouchPoints is the only thing
  // that tells them apart, and reading the browser string alone has already
  // cost this project a wrong diagnosis.
  const [device] = platformFacts(fakeWin());
  assert.match(device.detail, /iPad/);
  assert.match(device.detail, /maxTouchPoints 5/);
});

test('platform: a real Mac is not called an iPad', () => {
  const [device] = platformFacts(fakeWin({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 } }));
  assert.doesNotMatch(device.detail, /iPad/);
});

test('sensors: an absent API is reported as absent, with what it costs', () => {
  const rows = sensorFacts(fakeWin());
  const orient = rows.find((r) => r.name === 'DeviceOrientationEvent');
  assert.equal(orient.state, 'fail');
  assert.match(orient.detail, /no horizon/, 'an absent sensor must say what it costs the reader');
});

test('feeds: without a position, the checks that need one are SKIPPED not failed', async () => {
  // "We did not ask" and "it did not answer" are different facts, and calling
  // the first a failure would send someone chasing a feed that is fine.
  const rows = await feedProbes({ fetchImpl: async () => new Response('{}', { status: 200 }) });
  const traffic = rows.find((r) => r.name === '/api/traffic');
  assert.equal(traffic.state, 'skipped');
  assert.match(traffic.detail, /no position/);
});

test('feeds: without a followed flight, the route check does not invent a callsign', async () => {
  // Asking about a made-up aeroplane is the synthetic-input version of the rule
  // this whole app is built on.
  const rows = await feedProbes({ lat: 38.6, lon: -121, fetchImpl: async () => new Response('{}', { status: 200 }) });
  const route = rows.find((r) => r.name === '/api/route');
  assert.equal(route.state, 'skipped');
  assert.match(route.detail, /follow a flight first/);
});

test('feeds: a probe records the shape of the reply, not just that it failed', async () => {
  // The whole reason the route question took three releases: a probe that
  // reports a status without the body cannot tell empty from unparseable.
  const rows = await feedProbes({
    lat: 38.6,
    lon: -121,
    callsign: 'N460DF',
    clock: () => 1000,
    fetchImpl: async () => new Response('', { status: 201, headers: { 'content-type': 'text/html' } }),
  });
  const route = rows.find((r) => r.name === '/api/route');
  assert.equal(route.status, 201);
  assert.equal(route.bytes, 0);
  assert.equal(route.json, false);
  assert.match(route.contentType, /text\/html/);
});

test('feeds: a thrown request is a failure that says so, not a crash', async () => {
  const rows = await feedProbes({ lat: 1, lon: 2, fetchImpl: async () => { throw new Error('offline'); } });
  const metar = rows.find((r) => r.name === '/api/metar');
  assert.equal(metar.state, 'fail');
  assert.match(metar.detail, /offline/);
});

test('format: the whole run is one pasteable block naming every check', async () => {
  const result = await runSelfTest({
    win: fakeWin(),
    lat: 38.6,
    lon: -121,
    clock: () => 1_700_000_000_000,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, source: 'adsb.lol' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const text = formatSelfTest(result);
  for (const expected of ['SELF TEST', 'DEVICE', 'SENSORS AVAILABLE', 'OFFLINE SHELL', 'FEEDS', '/api/metar', '/api/route']) {
    assert.ok(text.includes(expected), `the pasted block is missing "${expected}"`);
  }
  assert.ok(!/undefined|NaN|\[object/.test(text), `the block contains a formatting artefact:\n${text}`);
});

test('format: nothing is claimed when the run could not determine it', () => {
  const text = formatSelfTest({ at: 0, tookMs: 1, groups: [{ title: 'X', rows: [{ name: 'caches', state: 'unknown', detail: 'could not be read' }] }] });
  assert.match(text, /\?\?\?\?/, 'an undetermined check must be visibly undetermined, not silently fine');
});
