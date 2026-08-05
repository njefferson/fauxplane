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
import { UNFILTERED_NOTE, WX_KINDS, createWxTextSource, wxBboxParam, wxSummary } from '../public/src/data/wxtext.js';
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

/**
 * THE FIXTURE THAT COST A RELEASE. The first version of this test built a body
 * that MATCHED the heuristic it was checking — two short advisories separated by
 * one blank line — and passed, while the real feed sent something else entirely.
 *
 * Below is what a convective SIGMET bulletin actually looks like, reconstructed
 * from a response on the owner's device: ONE document, several paragraphs,
 * blank lines between them. The old rule tore it into five, so the panel
 * reported 66 "reports" that were fragments and showed an `AREA 3...FROM
 * END-ARG-LIT-MCB...` paragraph on its own with no header saying which SIGMET
 * or which hazard it belonged to — a truncated warning, which is precisely the
 * failure the rule claimed to prevent.
 */
const REAL_BULLETINS = [
  'Type: SIGMET Hazard: CONVECTIVE WSUS33 KKCI 051755',
  'SIGW CONVECTIVE SIGMET 17W',
  'VALID UNTIL 1955Z',
  'AZ',
  'FROM 30W PHX-60E PHX-40N TUS-80ESE BZA-70E BZA-30W',
  '',
  'OUTLOOK VALID 051955-052355',
  'FROM RSK-DMN-60SSE SSO-50S TUS-30SE BZA-50NNW PGS-RSK',
  'WST ISSUANCES POSS. REFER TO MOST RECENT ACUS01 KWNS',
  '',
  'AREA 3...FROM END-ARG-LIT-MCB-CEW-210S CEW-50SSE',
  'WST ISSUANCES EXPD.',
  'Type: AIRMET Hazard: TURB SFOT WA 051445',
  'AIRMET TANGO FOR TURB VALID UNTIL 052100',
].join('\n');

test('ONE BULLETIN IS ONE REPORT, however many paragraphs it has', () => {
  const { reports, strategy } = splitReports(REAL_BULLETINS);
  assert.equal(strategy, 'document-marker', 'the feed marks its own documents; use its marker');
  assert.equal(reports.length, 2, 'two advisories — not five paragraphs');
  assert.match(reports[0], /CONVECTIVE SIGMET 17W/);
  assert.match(reports[0], /AREA 3/, 'every paragraph stays with the bulletin that owns it');
  assert.match(reports[1], /AIRMET TANGO/);
});

test('no paragraph is ever left without the header that says what it is', () => {
  // The defect in its purest form: a lone "AREA 3...FROM END-ARG-LIT" reads
  // like a warning cut in half.
  const { reports } = splitReports(REAL_BULLETINS);
  for (const r of reports) {
    assert.match(r, /^Type:\s/, `a report begins mid-document: "${r.slice(0, 48)}…"`);
  }
});

test('a feed that marks nothing still splits, and says which guess it made', () => {
  // PIREPs and TAFs carry no marker. The old behaviour is right for them and is
  // recorded as a guess rather than as knowledge.
  const perLine = splitReports('STS UA /OV STS/TM 1655\nOAK UA /OV OAK100004/TM 1619');
  assert.equal(perLine.strategy, 'per-line');
  assert.equal(perLine.reports.length, 2);

  const blank = splitReports('AAAA 1111\nBBBB 2222\n\nCCCC 3333');
  assert.equal(blank.strategy, 'blank-line');
  assert.equal(blank.reports.length, 2);
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

test('A FEED THAT DOES NOT NARROW TO THE AREA SAYS SO, on the count line', () => {
  /**
   * The advisories come back covering the whole country while the identical
   * bbox is honoured by the other two kinds. There is no honest way to filter
   * them from the raw text — the issuing office is Kansas City for all of them,
   * and the west/central/east bulletin split still puts Arizona in ours — so
   * the choice is between hiding real advisories on a guess and telling the
   * reader what they are looking at. "66 reports" beside a local weather card
   * reads as sixty-six local advisories, which is the misreading this prevents.
   */
  const said = wxSummary(kind, { ok: true, count: 66, at: 0, area: 'unfiltered' }, 0);
  assert.match(said.text, /66 reports/);
  assert.ok(said.text.includes(UNFILTERED_NOTE), 'the caveat must be on the line carrying the number');

  const filtered = wxSummary(kind, { ok: true, count: 18, at: 0, area: 'filtered' }, 0);
  assert.ok(!filtered.text.includes(UNFILTERED_NOTE), 'a feed that IS narrowed must not carry the caveat');
});

test('the per-kind area state is declared, and matches what was observed', () => {
  // From real responses, not from hope: pirep and taf came back in-region,
  // airsigmet came back national.
  assert.equal(KINDS.pirep.area, 'filtered');
  assert.equal(KINDS.taf.area, 'filtered');
  assert.equal(KINDS.airsigmet.area, 'unfiltered');
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
