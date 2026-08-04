/**
 * upstream.test.mjs — what a failed upstream is allowed to say.
 *
 * This path cannot be exercised against the real service from here: the
 * sandbox proxy refuses CONNECT to adsb.fi entirely. So it is tested against
 * the response Noah's device actually received, captured from his diagnostics
 * report — which is the only real evidence available and is better evidence
 * than a live call would have been anyway, because it is the failing case.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { describeUpstreamFailure } from '../functions/api/traffic.js';

/** A minimal stand-in for a fetch Response. */
const res = (headers, body) => ({
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  text: async () => body,
});

/** The real shape of a Cloudflare block page, trimmed. */
const BLOCK_PAGE = `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<head><title>Access denied | opendata.adsb.fi used Cloudflare to restrict access</title></head>
<body><h2>Sorry, you have been blocked</h2>
<p>Error code: 1020</p><p>Ray ID: 9c2f1a2b3c4d5e6f</p></body></html>`;

test('UPSTREAM: a Cloudflare block names the CDN, the reason and the code', () => {
  return describeUpstreamFailure(
    res({ server: 'cloudflare', 'cf-ray': '9c2f1a2b3c4d5e6f' }, BLOCK_PAGE),
  ).then((out) => {
    assert.match(out, /server: cloudflare/);
    assert.match(out, /used Cloudflare to restrict access/);
    assert.match(out, /Cloudflare error 1020/, 'the numeric code decides what to do about it');
    assert.match(out, /ray 9c2f1a2b3c4d5e6f/);
  });
});

test('UPSTREAM: the raw HTML never reaches the gauge', async () => {
  // THE BUG THIS REPLACED. The first version pasted the first 160 characters
  // of the body, which is `<!DOCTYPE html> <!--[if lt IE 7]>...` — a paragraph
  // of conditional comments, cut off just before the only meaningful part.
  const out = await describeUpstreamFailure(res({ server: 'cloudflare' }, BLOCK_PAGE));
  assert.ok(!out.includes('<!DOCTYPE'), 'no doctype on the face of an instrument');
  assert.ok(!out.includes('ie6 oldie'), 'no conditional comments either');
  assert.ok(!/<[a-z]/i.test(out), `no markup at all: ${out}`);
});

test('UPSTREAM: rate limiting is distinguishable from a firewall rule', async () => {
  // 1015 is "you are going too fast" and 1020 is "a rule says no". They call
  // for opposite responses, so the number has to survive.
  const limited = await describeUpstreamFailure(
    res({ server: 'cloudflare' }, '<title>Rate limited</title><p>error code: 1015</p>'),
  );
  assert.match(limited, /Cloudflare error 1015/);
});

test('UPSTREAM: an ORIGIN failure is not dressed up as a CDN one', async () => {
  // No cloudflare headers means the API itself answered, which is a completely
  // different diagnosis and must not be blurred into the same sentence.
  const out = await describeUpstreamFailure(res({}, '{"error":"bad request"}'));
  assert.ok(!/cloudflare/i.test(out), out);
  assert.match(out, /bad request/);
});

test('UPSTREAM: an unreadable body still yields the headers', async () => {
  const out = await describeUpstreamFailure({
    headers: { get: (k) => (k.toLowerCase() === 'server' ? 'cloudflare' : null) },
    text: async () => {
      throw new Error('stream already consumed');
    },
  });
  assert.match(out, /server: cloudflare/);
});

test('UPSTREAM: nothing to say produces nothing, not an empty dash', async () => {
  const out = await describeUpstreamFailure(res({}, ''));
  assert.equal(out, '');
});

/* ---------------------------------------------------------------- providers */

import { TRAFFIC_PROVIDERS, cooldownSeconds, inCooldown, noteRefusal } from '../functions/api/_lib.js';

test('PROVIDERS: there is more than one, and adsb.lol is tried first', () => {
  // adsb.fi's edge refuses a Pages Function outright, so it cannot be the only
  // source. It stays in the list because the block may be theirs to lift.
  assert.ok(TRAFFIC_PROVIDERS.length >= 2, 'one refused provider is not a source');
  assert.equal(TRAFFIC_PROVIDERS[0].id, 'adsb.lol');
});

test('PROVIDERS: every one carries the citation its terms require', () => {
  // ODbL for adsb.lol, an explicit citation clause for adsb.fi. Both are
  // conditions of use, and the client renders these strings verbatim.
  for (const p of TRAFFIC_PROVIDERS) {
    assert.ok(p.attribution && p.attribution.length > 8, `${p.id} has no attribution`);
    assert.match(p.homeUrl, /^https:\/\//, `${p.id} has no home page to link`);
    assert.match(p.policyUrl, /^https:\/\//, `${p.id} has no published terms to point at`);
    assert.ok(p.attribution.includes(p.id), `${p.id}'s attribution must name ${p.id}`);
  }
});

test('PROVIDERS: each builds all three query paths', () => {
  for (const p of TRAFFIC_PROVIDERS) {
    assert.match(p.area('38.7000', '-121.0000', 40), /^\/v\d\/lat\/38\.7000\/lon\/-121\.0000\/dist\/40$/);
    assert.match(p.callsign('UAL328'), /^\/v\d\/callsign\/UAL328$/);
    assert.match(p.hex('a1b2c3'), /^\/v\d\/hex\/a1b2c3$/);
  }
});

test('PROVIDERS: no two share a base, or the fallback is not a fallback', () => {
  const bases = TRAFFIC_PROVIDERS.map((p) => p.base);
  assert.equal(new Set(bases).size, bases.length);
});

/**
 * THE PROVIDER COOLDOWN.
 *
 * adsb.fi's terms, from the page Noah sent on 2026-08-03: "Making excessive
 * invalid HTTP requests results in a temporary IP address restriction. Requests
 * returning a 400, 401, 403, 404, or 429 status code count toward the limit."
 *
 * Every adsb.fi attempt returns 403 — their firewall blocks a Pages Function
 * before their API sees it — so the failover was spending a strike on every
 * request, for a call that cannot succeed, from an address shared with every
 * other Cloudflare tenant.
 */
test('cooldown: a 403 stands off far longer than a 429', () => {
  // A firewall block is a decision about who we are and will not have changed
  // in thirty seconds. A rate limit is about how often, and lifts.
  assert.ok(cooldownSeconds(403) > cooldownSeconds(429));
  assert.ok(cooldownSeconds(429) > 0);
});

test('cooldown: the provider’s own Retry-After wins over our guess', () => {
  // Doctrine §15.3 — a 429 is an instruction, not a hint.
  assert.equal(cooldownSeconds(429, 300), 300);
  assert.equal(cooldownSeconds(403, 120), 120);
});

test('cooldown: it is bounded, so nothing can blind the panel for ever', () => {
  // A provider sending an absurd Retry-After must not take the radar out for
  // the rest of the day.
  assert.ok(cooldownSeconds(429, 86400) <= 900);
});

test('cooldown: a status that is not a refusal earns no stand-off', () => {
  // 200s and 404s must not silence a provider: a 404 from the callsign endpoint
  // is an ANSWER (that flight is not being heard), not a refusal.
  assert.equal(cooldownSeconds(200), 0);
  assert.equal(cooldownSeconds(404), 0);
  assert.equal(cooldownSeconds(500), 0);
});

test('cooldown: a recorded refusal is found again, and says why', async () => {
  const store = new Map();
  const cache = {
    put: async (req, res) => store.set(req.url, res),
    match: async (req) => store.get(req.url) ?? null,
  };
  const request = new Request('https://example.test/api/traffic?lat=1&lon=2&dist=40');

  assert.equal(await inCooldown(request, 'adsb.fi', cache), null, 'nothing recorded yet');
  await noteRefusal(request, 'adsb.fi', 600, 'refused us (HTTP 403)', cache);

  const back = await inCooldown(request, 'adsb.fi', cache);
  assert.equal(back.id, 'adsb.fi');
  assert.equal(back.seconds, 600);
  assert.match(back.reason, /403/);
  // One provider standing off must not silence the other.
  assert.equal(await inCooldown(request, 'adsb.lol', cache), null);
});

test('cooldown: a zero-second stand-off records nothing', async () => {
  const store = new Map();
  const cache = { put: async (r, v) => store.set(r.url, v), match: async (r) => store.get(r.url) ?? null };
  const request = new Request('https://example.test/api/traffic');
  assert.equal(await noteRefusal(request, 'adsb.lol', 0, 'fine', cache), false);
  assert.equal(store.size, 0);
});
