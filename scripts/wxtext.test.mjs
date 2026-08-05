/**
 * wxtext.test.mjs — the text reports: PIREPs, SIGMETs/AIRMETs and TAFs.
 *
 * THE RESPONSE SHAPE HAS NEVER BEEN SEEN. This sandbox cannot reach
 * aviationweather.gov — its proxy refuses CONNECT, exactly as it does for
 * adsb.lol — so no session has ever held one of these responses. That is why
 * the Function asks for `format=raw` rather than JSON: raw text is what a flight
 * deck shows anyway, so the honest choice and the safe one coincide, and there
 * is no field mapping to be wrong about.
 *
 * What remains checkable, and is checked here, is the ONE assumption that is
 * left — that the body is text which splits into reports — and the sentences the
 * page says about each block. The most important of those is the one nobody
 * would think to write: a quiet sky and a service that did not answer must never
 * produce the same words.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { KINDS, splitReports } from '../functions/api/wxtext.js';
import { WX_KINDS, createWxTextSource, wxBboxParam, wxSummary } from '../public/src/data/wxtext.js';
import { REGION } from '../public/src/core/region.js';

// ---------------------------------------------------------------------------
// Splitting the body into reports — the only shape assumption there is
// ---------------------------------------------------------------------------

test('one report per line, when there are no blank lines', () => {
  const body = 'KSMF 051553Z 20008KT 10SM CLR 21/09 A3011\nKSAC 051554Z 19006KT 10SM FEW040 22/08 A3010';
  assert.deepEqual(splitReports(body).reports, [
    'KSMF 051553Z 20008KT 10SM CLR 21/09 A3011',
    'KSAC 051554Z 19006KT 10SM FEW040 22/08 A3010',
  ]);
});

test('a BLANK LINE separates reports when there is one, so a wrapped AIRMET stays whole', () => {
  // An AIRMET runs to several lines and the blank line is what ends it. Split
  // per line instead and one advisory becomes four fragments, each of which
  // reads like a truncated warning.
  const body = [
    'SFOT WA 051445',
    'AIRMET TANGO FOR TURB VALID UNTIL 052100',
    '',
    'SFOS WA 051445',
    'AIRMET SIERRA FOR IFR VALID UNTIL 052100',
  ].join('\n');
  const { reports } = splitReports(body);
  assert.equal(reports.length, 2, 'two advisories, not five lines');
  assert.match(reports[0], /AIRMET TANGO/);
  assert.match(reports[0], /SFOT WA 051445/, 'and the wrapped lines are kept, joined');
  assert.match(reports[1], /AIRMET SIERRA/);
});

test('a document is REFUSED rather than shown as a report', () => {
  // A 200 carrying a web page is a question, not an answer — and this exact
  // shape has already fooled one adapter in this repo. Rendering it would put
  // "<!DOCTYPE html>" on the panel under the heading "Pilot reports".
  for (const body of ['<!DOCTYPE html><html><body>Service unavailable', '<html>', '  <?xml version="1.0"?>']) {
    const out = splitReports(body);
    assert.ok(out.error, `not refused: ${body.slice(0, 24)}`);
    assert.match(out.error, /document rather than reports/);
    assert.equal(out.reports, undefined, 'a refusal must carry no content at all');
  }
});

test('an empty body is NO REPORTS, which is a different thing from a failure', () => {
  // The quiet sky. It must not be an error, and it must not be nothing —
  // "no PIREPs in the last three hours" is a real answer.
  for (const body of ['', '   ', '\n\n']) {
    const out = splitReports(body);
    assert.equal(out.error, undefined);
    assert.deepEqual(out.reports, []);
  }
});

test('a body that is not text at all is refused, not coerced', () => {
  assert.match(splitReports(null).error, /not text/);
  assert.match(splitReports({ reports: [] }).error, /not text/);
  assert.match(splitReports(42).error, /not text/);
});

test('blank lines and trailing whitespace never become empty reports', () => {
  const { reports } = splitReports('KSMF 051553Z A3011\n\n\n\nKSAC 051554Z A3010\n\n');
  assert.deepEqual(reports, ['KSMF 051553Z A3011', 'KSAC 051554Z A3010']);
});

// ---------------------------------------------------------------------------
// Pacing — a declaration about somebody else's free service
// ---------------------------------------------------------------------------

test('each kind is held for as long as it is worth holding', () => {
  // From how often the thing is ISSUED, not from a preference. Caching a
  // forecast for five minutes asks a public service for the same unchanged
  // text ten times an hour.
  assert.ok(KINDS.pirep.cacheSeconds >= 60, 'pilot reports arrive continuously but not by the second');
  assert.ok(KINDS.taf.cacheSeconds > KINDS.airsigmet.cacheSeconds, 'a forecast changes less often than an advisory');
  assert.ok(KINDS.airsigmet.cacheSeconds > KINDS.pirep.cacheSeconds);
});

test('the client asks about the navdata region, not something larger', () => {
  // The Function refuses a box over twelve degrees a side, and asking a public
  // service to sweep half a continent is the shape §15.5 forbids.
  const [latMin, lonMin, latMax, lonMax] = wxBboxParam().split(',').map(Number);
  assert.equal(latMin, REGION.bbox.latMin);
  assert.equal(lonMax, REGION.bbox.lonMax);
  assert.ok(latMax - latMin < 12 && lonMax - lonMin < 12, 'the box must be inside what the Function will accept');
});

test('the three kinds the client asks for are the three the Function serves', () => {
  // Two lists of the same thing is how one of them ends up asking for a kind
  // that answers 400 — which counts against a rate limit.
  assert.deepEqual(WX_KINDS.map((k) => k.id).sort(), Object.keys(KINDS).sort());
});

// ---------------------------------------------------------------------------
// The sentence each block says about itself
// ---------------------------------------------------------------------------

const kind = WX_KINDS[0];

test('A QUIET SKY AND A REFUSED SERVICE NEVER SAY THE SAME THING', () => {
  // The whole reason this function exists. Both produce an empty block, and a
  // panel that showed the same words for both would be inventing an
  // observation — "no pilot reports" from a service that was never asked.
  const quiet = wxSummary(kind, { ok: true, count: 0, at: 1000 }, 1000);
  const refused = wxSummary(kind, { ok: false, reason: 'HTTP 503' }, 1000);
  assert.notEqual(quiet.text, refused.text);
  assert.equal(quiet.tone, 'empty');
  assert.equal(refused.tone, 'fail');
  assert.match(refused.text, /503/, 'and the refusal carries its own reason');
  assert.match(quiet.text, /No pilot reports/);
});

test('never asked is its own state, distinct from both', () => {
  const waiting = wxSummary(kind, null);
  assert.equal(waiting.tone, 'wait');
  assert.match(waiting.text, /Not asked yet/);
});

test('a block with reports says how many, and how old', () => {
  const now = 600_000;
  const fresh = wxSummary(kind, { ok: true, count: 4, at: now - 10_000 }, now);
  assert.match(fresh.text, /4 reports/);
  assert.match(fresh.text, /just now/);
  const old = wxSummary(kind, { ok: true, count: 1, at: now - 300_000 }, now);
  assert.match(old.text, /1 report\b/, 'one report, not "1 reports"');
  assert.match(old.text, /5 min ago/);
});

// ---------------------------------------------------------------------------
// The source, against a fake fetch
// ---------------------------------------------------------------------------

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('all three kinds are fetched, one after another rather than at once', async () => {
  // Three simultaneous requests to one free public service, from an address
  // shared with every other Cloudflare tenant, is the burst §15.3 asks us not
  // to send. Sequential ordering is what this asserts.
  let open = 0;
  let maxOpen = 0;
  const asked = [];
  const src = createWxTextSource({
    clock: () => 5,
    fetchImpl: async (url) => {
      open += 1;
      maxOpen = Math.max(maxOpen, open);
      asked.push(new URL(url, 'https://x').searchParams.get('kind'));
      await new Promise((r) => setTimeout(r, 1));
      open -= 1;
      return okResponse({ count: 1, reports: ['KSMF 051553Z A3011'] });
    },
  });
  await src.refresh();
  assert.equal(maxOpen, 1, 'the three requests overlapped');
  assert.deepEqual(asked, WX_KINDS.map((k) => k.id));
});

test('a failure on one kind does not take the others with it', async () => {
  const src = createWxTextSource({
    clock: () => 5,
    fetchImpl: async (url) => {
      const k = new URL(url, 'https://x').searchParams.get('kind');
      if (k === 'airsigmet') throw new Error('offline');
      return okResponse({ count: 2, reports: ['a', 'b'] });
    },
  });
  const all = await src.refresh();
  const by = Object.fromEntries(all.map((x) => [x.id, x.result]));
  assert.equal(by.pirep.ok, true);
  assert.equal(by.airsigmet.ok, false);
  assert.match(by.airsigmet.reason, /offline/);
  assert.equal(by.taf.ok, true);
});

test('a 200 carrying ok:false is a REFUSAL, not a success with nothing in it', async () => {
  // How the Function reports a refusal it wants the reader to see. The first
  // version of the client spread the body and then wrote `ok: true` over the
  // top of it, so a stated refusal arrived looking like a quiet sky.
  const src = createWxTextSource({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, reason: 'the service is not deployed here' }) }),
  });
  const all = await src.refresh();
  assert.equal(all[0].result.ok, false);
  assert.match(all[0].result.reason, /not deployed/);
  const said = wxSummary(all[0], all[0].result, 0);
  assert.equal(said.tone, 'fail', 'and it renders as amber, not as an empty block');
});

test('a refusal carries the reason the Function gave, not just a status', async () => {
  const src = createWxTextSource({
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({ reason: 'the service answered with a document rather than reports' }) }),
  });
  const all = await src.refresh();
  assert.match(all[0].result.reason, /document rather than reports/);
});

test('two refreshes at once share one flight', async () => {
  let calls = 0;
  const src = createWxTextSource({
    fetchImpl: async () => {
      calls += 1;
      return okResponse({ count: 0, reports: [] });
    },
  });
  await Promise.all([src.refresh(), src.refresh()]);
  assert.equal(calls, WX_KINDS.length, 'the second refresh asked again while the first was still going');
});
