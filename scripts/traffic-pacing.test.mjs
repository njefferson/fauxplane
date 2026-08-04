import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { POLICIES, standoffPhrase } from '../functions/api/_lib.js';
import {
  FETCH_RANGE_NM,
  FOLLOW_POLL_MS,
  FOLLOW_WINDOWS,
  RADAR_RANGE_NM,
  createTrafficSource,
  followBannerText,
  radarReadiness,
  withRangeAndBearing,
  withinRange,
  explainTrafficRefusal,
} from '../public/src/data/traffic.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * TRAFFIC's interval is still a plain constant in app.js, which imports the
 * whole browser world and cannot be loaded here, so it is read as text — that
 * fails loudly if it is renamed, which is the only way this check could
 * silently stop measuring anything.
 *
 * FOLLOW's is IMPORTED, because it moved. It now lives beside the freshness
 * windows the followed fields are aged against, in traffic.js, and the two have
 * to agree: the poll was 10 s while heading's staleness limit was 5 s, so HDG
 * was structurally incapable of being anything but FAIL and the panel crossed
 * itself out on a working feed. Importing the real value is strictly better
 * than scraping a copy of it.
 */
async function clientIntervals() {
  const src = await readFile(path.join(repo, 'public', 'src', 'app.js'), 'utf8');
  const m = src.match(/const TRAFFIC_INTERVAL_MS = ([0-9_]+);/);
  assert.ok(m, 'TRAFFIC_INTERVAL_MS not found in app.js — this test has stopped measuring anything');
  assert.match(
    src,
    /const FOLLOW_INTERVAL_MS = FOLLOW_POLL_MS;/,
    'app.js must take the follow interval from traffic.js, not declare its own copy',
  );
  return { traffic: Number(m[1].replace(/_/g, '')), follow: FOLLOW_POLL_MS };
}

test('the followed aircraft outlives its own poll, or the panel crosses itself out', () => {
  // NOAH PHOTOGRAPHED THIS. Following DAL2229: GS, LOAD G, ATT, GPS ALT, VS,
  // HDG and TURN all crossed out at once, PWR ON, banner saying FOLLOWING —
  // "makes the whole display look broken without any data".
  //
  // The cause was arithmetic. The poll is every FOLLOW_POLL_MS; the registry
  // gave `attitude.heading` a 5 s staleMs because a magnetometer updates many
  // times a second. A field cannot survive a limit shorter than the cadence
  // that fills it, so HDG read "no update for 5s (limit 5s)" forever.
  //
  // The RELATIONSHIP is what is asserted, never the numbers — changing the poll
  // must not be able to quietly re-create this.
  assert.ok(
    FOLLOW_WINDOWS.freshMs >= 2 * FOLLOW_POLL_MS,
    `a followed field must stay LIVE across a missed poll: freshMs ${FOLLOW_WINDOWS.freshMs} vs poll ${FOLLOW_POLL_MS}`,
  );
  assert.ok(
    FOLLOW_WINDOWS.staleMs >= 6 * FOLLOW_POLL_MS,
    `a followed field must not FAIL until the feed has genuinely stopped: staleMs ${FOLLOW_WINDOWS.staleMs} vs poll ${FOLLOW_POLL_MS}`,
  );
  assert.ok(FOLLOW_WINDOWS.staleMs > FOLLOW_WINDOWS.freshMs, 'FAIL must come after STALE, not before it');
});

test('every field the followed aircraft owns is aged on the FEED’s window', async () => {
  // DRIVEN THROUGH THE REAL apply(), not asserted about a constant. The window
  // has to reach EVERY field the broadcast writes; one left on the registry's
  // sensor limits is the same defect wearing a different label, and asserting
  // that FOLLOW_WINDOWS has sensible numbers would not notice.
  const writes = [];
  const store = {
    write: (path, value, opts = {}) => writes.push({ path, value, windows: opts.windows ?? null }),
    fail: () => {},
    peek: () => null,
  };

  const traffic = createTrafficSource({
    state: store,
    clock: () => 1_000_000,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        source: 'adsb.lol',
        count: 1,
        aircraft: [
          {
            hex: 'a1b2c3',
            callsign: 'DAL2229',
            lat: 38.9,
            lon: -121.15,
            altBaroFt: 34000,
            altGeomFt: 34350,
            onGround: false,
            groundspeedKt: 452,
            trackDeg: 118,
            headingDeg: 121,
            verticalRateFpm: -1216,
            seenPosS: 1.2,
          },
        ],
      }),
    }),
  });

  traffic.follow({ callsign: 'DAL2229' });
  await traffic.refreshFollowed();
  traffic.apply();

  assert.ok(writes.length, 'the followed aircraft wrote nothing at all — this test is measuring nothing');
  const bare = writes.filter((w) => !w.windows);
  assert.deepEqual(
    bare.map((w) => w.path),
    [],
    'these fields are written by the followed aircraft but aged on the registry’s sensor windows',
  );
  for (const w of writes) assert.deepEqual(w.windows, FOLLOW_WINDOWS, `${w.path} carries the wrong window`);
});

test('the edge cache outlives the poll interval, or it does nothing', async () => {
  // THE DEFECT THIS EXISTS FOR. The TTLs were 8 s and 5 s against polls of 10 s
  // and 5 s: every entry expired just before the poll that would have used it,
  // so every request went upstream and Noah was rate limited off the radar
  // repeatedly. Both files' comments claimed the caching worked. Prose did not
  // catch it; arithmetic does.
  const { traffic, follow } = await clientIntervals();

  assert.ok(
    POLICIES.traffic.cacheSeconds * 1000 > traffic,
    `nearby cache ${POLICIES.traffic.cacheSeconds}s does not outlive the ${traffic / 1000}s poll — every poll would miss`,
  );
  assert.ok(
    POLICIES.traffic.callsignCacheSeconds * 1000 > follow,
    `followed cache ${POLICIES.traffic.callsignCacheSeconds}s does not outlive the ${follow / 1000}s poll — every poll would miss`,
  );
});

test('each cache TTL is at least twice its poll, so most polls never leave the edge', async () => {
  // Merely "greater than" leaves a one-second margin that clock skew erases.
  const { traffic, follow } = await clientIntervals();
  assert.ok(POLICIES.traffic.cacheSeconds * 1000 >= traffic * 2, 'nearby cache is under 2x its poll');
  assert.ok(POLICIES.traffic.callsignCacheSeconds * 1000 >= follow * 2, 'followed cache is under 2x its poll');
});

test('the panel never polls faster than the tightest published limit', async () => {
  // adsb.fi publishes 1 req/s and counts invalid requests against it. This is
  // about our own restraint, not their ceiling — but the ceiling is still a
  // ceiling (Doctrine §15.6).
  const { traffic, follow } = await clientIntervals();
  assert.ok(traffic >= 1000 && follow >= 1000);
});

test('one radius is fetched, and it is the widest the panel offers', () => {
  // `dist` is part of the Function's cache key, so a per-range fetch meant four
  // cache entries and four upstream requests for the same sky — and tapping
  // through four range buttons is the obvious thing to do with four buttons.
  assert.equal(FETCH_RANGE_NM, Math.max(...RADAR_RANGE_NM));
});

test('a narrower range is a filter over what was already fetched', () => {
  // DRIVEN THROUGH THE REAL PRODUCER, not through hand-written distances. The
  // first version of this test invented a field name, `withinRange` read the
  // same invented name, and the pair agreed with each other while filtering
  // every real aircraft away. A fixture written from the same assumption as the
  // code under test proves the assumption is self-consistent and nothing else.
  const centre = { lat: 38.68, lon: -121.0 };
  const withDistance = withRangeAndBearing(
    [
      { hex: 'close', lat: 38.75, lon: -121.0 }, // ~4 nm
      { hex: 'mid', lat: 39.0, lon: -121.0 }, // ~19 nm
      { hex: 'far', lat: 39.55, lon: -121.0 }, // ~52 nm
    ],
    centre,
  );

  // The producer's own numbers, so a rename breaks this loudly rather than
  // quietly emptying the sky.
  for (const a of withDistance) assert.ok(Number.isFinite(a.distanceNm), `${a.hex} has no distance`);

  assert.deepEqual(withinRange(withDistance, 10).map((a) => a.hex), ['close']);
  assert.deepEqual(withinRange(withDistance, 25).map((a) => a.hex), ['close', 'mid']);
  assert.deepEqual(withinRange(withDistance, 80).map((a) => a.hex), ['close', 'mid', 'far']);
});

test('an aircraft with no computed distance is dropped, not drawn at the centre', () => {
  // A missing distance is a missing measurement. Treating it as zero would put
  // an unknown-position aircraft on top of the reader.
  const aircraft = [{ hex: 'x', distanceNm: null }, { hex: 'y' }, { hex: 'z', distanceNm: 3 }];
  assert.deepEqual(withinRange(aircraft, 40).map((a) => a.hex), ['z']);
});

test('every provider is asked for a radius the Function will accept', async () => {
  // An out-of-range dist is a 400, and adsb.fi counts invalid requests against
  // the rate limit — so an over-wide fetch would spend the budget on nothing.
  const src = await readFile(path.join(repo, 'functions', 'api', 'traffic.js'), 'utf8');
  const m = src.match(/MAX_DIST_NM\s*=\s*(\d+)/);
  assert.ok(m, 'MAX_DIST_NM not found');
  assert.ok(FETCH_RANGE_NM <= Number(m[1]), `fetch radius ${FETCH_RANGE_NM} exceeds the Function's cap ${m[1]}`);
});

/**
 * THE REFUSAL, IN WORDS THE READER CAN USE.
 *
 * What was on Noah's phone: "No traffic: adsb.lol rate limited us (HTTP 429;
 * cf-ray a258e8a82ff1fa4e-SJC) | adsb.fi returned HTTP 403 — server:
 * cloudflare; ray a258e8a9483dfa4e-SJC; Attention Required! | Cloudflare".
 * True, and written for whoever is debugging the Pages Function.
 */
test('refusal: a rate limit is named as one, and the cause is given', () => {
  const out = explainTrafficRefusal('adsb.lol rate limited us (HTTP 429; cf-ray abc-SJC)', { heard: 9 });
  assert.match(out, /rate limiting us/);
  // The cause is settled (a shared egress address), so it is stated.
  assert.match(out, /share an address/);
  // No ray IDs, no status codes, no pipes.
  assert.doesNotMatch(out, /cf-ray|HTTP \d|\|/);
});

test('refusal: a cause that is NOT settled is not guessed at', () => {
  // A firewall 403 and a dead network have the same shape and different causes.
  // The groundspeed reason that could not tell two causes apart is already
  // recorded in this repo as a defect; this must not repeat it.
  for (const raw of ['adsb.fi returned HTTP 403 — server: cloudflare', 'adsb.lol unreachable: fetch failed']) {
    const out = explainTrafficRefusal(raw, { heard: 0 });
    assert.doesNotMatch(out, /share an address/, `guessed a cause for "${raw}"`);
  }
});

test('refusal: what is still on screen is stated, because it is still true', () => {
  // The aircraft already drawn are real observations that did not stop being
  // true because the NEXT request failed. An empty scope and a stale one mean
  // completely different things.
  assert.match(explainTrafficRefusal('HTTP 429', { heard: 12 }), /12 aircraft on the scope are the last ones actually heard/);
  assert.match(explainTrafficRefusal('HTTP 429', { heard: 0 }), /Nothing has been heard yet/);
});

test('refusal: a stand-off says we chose not to ask', () => {
  // Being turned away and declining to ask are different facts.
  const out = explainTrafficRefusal('adsb.fi not asked — refused us (HTTP 403), standing off for up to 600s', { heard: 3 });
  assert.match(out, /Standing off/);
  assert.doesNotMatch(out, /refusing us/);
});

test('refusal: an empty or unknown reason still produces a sentence', () => {
  // A blank status line is the one outcome that tells the reader nothing.
  for (const raw of ['', null, undefined, 'something nobody anticipated']) {
    const out = explainTrafficRefusal(raw, { heard: 0 });
    assert.ok(out.length > 20, `"${raw}" produced "${out}"`);
    assert.match(out, /aircraft feed/);
  }
});

/**
 * THE SCOPE'S STATE, IN WORDS (Noah, 2026-08-04).
 *
 * *"It would be nice to have an indicator that shows when the radar is
 * populated and another for any other states like being ready to tap."*
 *
 * Every branch below is a DIFFERENT FACT about the sky and the feed, and the
 * reader has to be able to tell them apart: nothing swept yet, swept and empty,
 * refused with nothing heard, refused but still showing real aircraft, and
 * healthy. Two of those show no aircraft and mean opposite things.
 */
test('readiness: nothing has swept yet, and it does not pretend otherwise', () => {
  const r = radarReadiness({ result: null });
  assert.equal(r.state, 'listening');
  assert.equal(r.tappable, false, 'there is nothing on the scope to tap');
});

test('readiness: a working sweep with an empty sky is NOT a failure', () => {
  // The distinction the reader most needs and the one a naive indicator loses:
  // "we asked and there is nothing there" against "we could not ask".
  const empty = radarReadiness({ result: { ok: true, centre: { lat: 1, lon: 2 } }, aircraft: [] });
  const refused = radarReadiness({ result: { ok: false, centre: { lat: 1, lon: 2 } }, aircraft: [] });
  assert.equal(empty.state, 'empty');
  assert.equal(refused.state, 'refused');
  assert.notEqual(empty.detail, refused.detail, 'an empty sky and a refused feed must not read identically');
  assert.match(empty.detail, /nothing is in range/);
  assert.match(refused.detail, /not answering/);
});

test('readiness: a refused feed still showing real aircraft says they are TAPPABLE', () => {
  // 1.20.0 established that a failed refresh is not an empty sky — the aircraft
  // already drawn are real observations that did not stop being true. The
  // indicator has to agree with the scope, or it tells the reader not to try
  // something that works.
  const r = radarReadiness({
    result: { ok: false, centre: { lat: 1, lon: 2 } },
    aircraft: [{}, {}],
    nearbyAt: 0,
    now: 45_000,
  });
  assert.equal(r.state, 'ageing');
  assert.equal(r.tappable, true);
  assert.match(r.detail, /still tappable/);
  assert.match(r.detail, /45s ago/, 'an ageing scope must say how old it is');
});

test('readiness: a healthy scope invites the tap, and counts what is on it', () => {
  const r = radarReadiness({
    result: { ok: true, centre: { lat: 1, lon: 2 } },
    aircraft: [{}, {}, {}],
    nearbyAt: 0,
    now: 3_000,
  });
  assert.equal(r.state, 'contact');
  assert.equal(r.tappable, true);
  assert.match(r.label, /CONTACT · 3/);
  assert.match(r.detail, /tap one to follow/);
});

test('readiness: one aircraft is described in the singular', () => {
  // Written because the first draft produced "These is the last aircraft".
  const ageing = radarReadiness({ result: { ok: false, centre: {} }, aircraft: [{}], nearbyAt: 0, now: 1000 });
  const contact = radarReadiness({ result: { ok: true, centre: {} }, aircraft: [{}], nearbyAt: 0, now: 1000 });
  assert.match(ageing.detail, /This is the last aircraft/);
  assert.doesNotMatch(ageing.detail, /These is/);
  assert.match(contact.detail, /One aircraft/);
});

test('readiness: no centre means no geometry, so nothing is tappable', () => {
  // The tap handler hit-tests bearings from the centre. Claiming "tap one to
  // follow" without one would advertise a control that cannot work.
  const r = radarReadiness({ result: { ok: true, centre: null }, aircraft: [{}, {}] });
  assert.equal(r.tappable, false);
});

test('readiness: while following, the chip says whose aircraft the panel is showing', () => {
  const r = radarReadiness({ result: { ok: true, centre: { lat: 1, lon: 2 } }, aircraft: [{}], following: 'DAL2229' });
  assert.equal(r.state, 'following');
  assert.match(r.label, /DAL2229/);
  assert.match(r.detail, /Tap another to switch/);
});

/**
 * THE FOLLOW BANNER MUST NOT CLAIM DATA IT DOES NOT HAVE.
 *
 * From Noah's 1.21.1 report: following PXT466 with the traffic feed rate
 * limited, every followed field reading "waiting for the first report from
 * PXT466" — under a banner saying "this panel is showing that aircraft's
 * broadcast, not this device". It was showing nothing at all.
 *
 * That sentence sits at the top of a panel of red crosses, which is precisely
 * why the display "looks broken without any data": the app was insisting it had
 * data. A false sentence in the element whose whole job is to say what the
 * panel is showing is the same defect as a fabricated number.
 */
test('follow banner: nothing is claimed before the first broadcast arrives', () => {
  const waiting = followBannerText('PXT466', { followed: null });
  assert.doesNotMatch(
    waiting,
    /is showing that aircraft/,
    'the banner must not claim to be showing a broadcast that has never arrived',
  );
  assert.match(waiting, /PXT466/, 'it still names the aircraft being followed');
  assert.match(waiting, /no broadcast received yet/);
});

test('follow banner: the feed’s own reason is carried when there is one', () => {
  const withReason = followBannerText('PXT466', { followed: null, followError: 'the feed is rate limiting us' });
  assert.match(withReason, /rate limiting us/, 'a known reason beats a generic one');

  const without = followBannerText('PXT466', { followed: null });
  assert.match(without, /crossed out until one arrives/, 'with no reason it still says what to expect');
});

test('follow banner: once the broadcast arrives it says so, and says whose', () => {
  const live = followBannerText('PXT466', { followed: { hex: 'a1b2c3', callsign: 'PXT466' } });
  assert.match(live, /is showing that aircraft's broadcast, not this device/);
  assert.match(live, /PXT466/);
});

test('follow banner: not following says nothing at all', () => {
  assert.equal(followBannerText(null, {}), '');
  assert.equal(followBannerText('', {}), '');
});

/**
 * THE COUNTDOWN (Noah, 2026-08-04).
 *
 * *"No indication of how long I'll wait before the radar will work…like the
 * delay countdown, maybe?…. Just looks broken."* He was looking at NO CONTACT
 * above the words "Standing off from the aircraft feeds for a moment". "A
 * moment" is not a number, and a wait with no number is indistinguishable from
 * a hang.
 *
 * THE COUNTDOWN IS ABOUT THE ATTEMPT, NEVER THE RESULT. We can promise when we
 * will ASK. We cannot promise the answer, because it may be another refusal —
 * and a panel that will not invent a groundspeed does not get to invent an ETA.
 */
test('countdown: a refused scope says when it will ask again', () => {
  const r = radarReadiness({ result: { ok: false, centre: {} }, aircraft: [], nextAttemptInS: 12 });
  assert.match(r.label, /RETRY 12s/, 'the chip carries the number');
  assert.match(r.detail, /Asking again in 12s/);
});

test('countdown: it never claims the radar will WORK by then', () => {
  const r = radarReadiness({ result: { ok: false, centre: {} }, aircraft: [], nextAttemptInS: 30 });
  const said = `${r.label} ${r.detail}`;
  // The next answer may be another refusal. Anything promising a working scope
  // at a stated time is a promise this app cannot keep.
  assert.doesNotMatch(said, /will work|working in|back in \d+s|ready in/i);
  assert.match(said, /Asking again/, 'it commits to the request, which is the part we control');
});

test('countdown: an ageing scope counts down too, and stays tappable', () => {
  const r = radarReadiness({
    result: { ok: false, centre: { lat: 1, lon: 2 } },
    aircraft: [{}, {}],
    nearbyAt: 0,
    now: 45_000,
    nextAttemptInS: 7,
  });
  assert.match(r.label, /AGEING · 2 · RETRY 7s/);
  assert.equal(r.tappable, true, 'a countdown must not imply the aircraft shown stopped being tappable');
});

test('countdown: no schedule means no number, not a zero', () => {
  // Zero would read as "asking right now", which is an instruction rather than
  // an admission of not knowing.
  for (const v of [null, undefined, 0, -3, Number.NaN]) {
    const r = radarReadiness({ result: { ok: false, centre: {} }, aircraft: [], nextAttemptInS: v });
    assert.doesNotMatch(r.label, /RETRY/, `nextAttemptInS ${v} must not produce a countdown`);
    assert.doesNotMatch(r.detail, /Asking again/);
  }
});

test('countdown: a healthy scope is not cluttered with one', () => {
  // Nothing is being waited for, so a retry number would be noise on the one
  // state that is working.
  const r = radarReadiness({ result: { ok: true, centre: { lat: 1, lon: 2 } }, aircraft: [{}], nextAttemptInS: 9 });
  assert.doesNotMatch(r.label, /RETRY/);
});

/**
 * The SERVER side of the same complaint. "standing off for up to 600s" is the
 * length of the stand-off as recorded — it never shrinks, so nine minutes into
 * a ten-minute wait it still said 600s.
 */
test('standoff: the phrase reports what is LEFT, not what was recorded', () => {
  assert.match(standoffPhrase({ seconds: 600, remainingS: 45 }), /45s/);
  assert.doesNotMatch(standoffPhrase({ seconds: 600, remainingS: 45 }), /600/);
  assert.match(standoffPhrase({ seconds: 600, remainingS: 425 }), /7m 5s/);
  assert.match(standoffPhrase({ seconds: 600, remainingS: 120 }), /2m$/);
});

test('standoff: a record with no expiry says so rather than guessing zero', () => {
  // Zero means "ask now". An unknown remaining time is not that.
  const said = standoffPhrase({ seconds: 600, remainingS: null });
  assert.match(said, /no expiry recorded/);
  assert.doesNotMatch(said, /\b0s\b/);
});
