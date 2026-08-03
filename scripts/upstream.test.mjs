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
