/**
 * traffic.js — client for /api/traffic, and the FOLLOW source.
 *
 * TWO JOBS, AND THE SECOND ONE IS NEW IN v2.
 *
 * 1. The radar page's plan view: what is flying near here, right now.
 * 2. FOLLOW — one selected aircraft's broadcast becomes the panel's source, so
 *    the tapes show a real 747 somewhere over the Pacific instead of a red X
 *    over a phone on a desk.
 *
 * WHY FOLLOW IS NOT A SYNTHETIC DATA PATH, which is the first question it
 * should have to answer. Every value it writes came off a real aircraft's
 * ADS-B transponder, was received by a real ground station, and arrived through
 * a fetch — the same category as a METAR, and traceable to a named source with
 * a timestamp. What v1 forbids is a value produced from NEITHER a sensor nor a
 * feed. This is a feed. It is not a simulation of an aircraft; it is an
 * observation of one.
 *
 * WHAT IT REFUSES TO WRITE, which matters more than what it writes:
 *
 *   PITCH          ADS-B carries no attitude. Flight path angle is not pitch
 *                  (an aircraft at 5 degrees nose-up in level flight has a
 *                  flight path angle of zero), so the ladder stays crossed out.
 *   SLIP / SKID    Not broadcast, and not derivable. Coordinated flight is the
 *                  ASSUMPTION the bank derivation rests on, so reading a
 *                  centred ball back out of it would be circular.
 *   TAS / CAS      They need winds aloft and a station altimeter, and ours are
 *                  for wherever the phone is — which in follow mode is not
 *                  where the aircraft is. A number computed from the wrong
 *                  place's weather is worse than no number.
 *   INDICATED ALT  Same mismatch: the Kollsman setting is a local station's.
 *
 * Every one of those FAILs with that sentence attached, so the panel explains
 * the difference rather than quietly having fewer instruments.
 */

import { REGION } from '../core/region.js';
import { bankAngle, createTurnRate, loadFactorFromBank } from '../core/derive.js';
import { bearingDeg, greatCircleNm } from '../core/units.js';

/** How far the plan view looks. The Function caps this; asking for more is a
 *  400 that would count against adsb.fi's rate limit, so it is clamped here. */
/**
 * REAL BOEING RANGE STEPS. An EFIS control panel offers 10, 20, 40, 80, 160,
 * 320 and 640 nm — never 25, which is what this had.
 *
 * It stops at 80 because the Function caps a query at 120 nm (§15.5 — a plan
 * view of half a state is not a panel instrument), and one fetch covers every
 * step. The larger real steps exist for a route display, which this is not.
 */
export const RADAR_RANGE_NM = [10, 20, 40, 80];

/**
 * TCAS ALTITUDE BANDS, in feet relative to own altitude.
 *
 * THE REAL DE-CLUTTER, and the thing this scope was missing entirely. A flight
 * deck does not show every aircraft it can hear: the crew select a band, and
 * everything outside it is simply not displayed. A busy scope carries 56
 * aircraft; most of them would not be on a real ND at all.
 *
 * The names and the numbers are the real ones. NORM is what a crew fly with,
 * ABOVE is selected before a climb, BELOW before a descent.
 *
 * ALL IS NOT A REAL TCAS SETTING and is marked as ours. It exists because this
 * panel spends most of its life on a desk at a few hundred feet, where NORM
 * would correctly hide every airliner overhead — realistic, and useless for
 * someone who wants to see what is up there. The honest thing is to offer the
 * real bands, default to the one that serves the reader, and say which is which.
 */
export const ALTITUDE_BANDS = [
  { id: 'NORM', label: 'NORM', above: 2700, below: 2700, real: true },
  { id: 'ABOVE', label: 'ABOVE', above: 9900, below: 2700, real: true },
  { id: 'BELOW', label: 'BELOW', above: 2700, below: 9900, real: true },
  { id: 'ALL', label: 'ALL', above: Infinity, below: Infinity, real: false },
];

/**
 * Own altitude, for the relative readouts and the band filter.
 *
 * Geometric altitude, matching what the aircraft themselves broadcast — mixing
 * a barometric own-altitude with geometric traffic would put a real error into
 * every relative number on the scope.
 */
export function ownAltitudeFt(fields, followed = null) {
  if (followed && Number.isFinite(followed.altGeomFt)) return followed.altGeomFt;
  if (followed && Number.isFinite(followed.altBaroFt)) return followed.altBaroFt;
  const f = fields?.['position.altitudeGeometric'];
  return f && f.provenance !== 'FAIL' && Number.isFinite(f.value) ? f.value : null;
}

/**
 * Aircraft inside the selected altitude band.
 *
 * WITH NO OWN ALTITUDE THERE IS NO BAND. "Relative to what?" has no answer, and
 * filtering against an assumed zero would silently hide aircraft using a number
 * nobody measured. Everything is shown, and the caller says why.
 */
export function withinBand(aircraft, ownAltFt, bandId) {
  const band = ALTITUDE_BANDS.find((b) => b.id === bandId) ?? ALTITUDE_BANDS[0];
  if (band.id === 'ALL') return aircraft ?? [];

  /**
   * AN AIRCRAFT ON THE GROUND IS NOT TRAFFIC, and a real TCAS does not display
   * one.
   *
   * It was right arithmetically and wrong as an instrument. This panel sits at
   * a few hundred feet on a desk; an airliner parked at an airport 700 ft lower
   * is genuinely "below" by the subtraction, and TCAS still would not draw it,
   * because the question a traffic display answers is what might come near you
   * in the air. Sacramento's ramp filled his BELOW band with parked aeroplanes.
   *
   * Suppressed in the REAL bands only. ALL is marked as ours rather than a
   * flight-deck setting, and it is the one that still shows everything the feed
   * heard — which is what someone watching an airport actually wants.
   */
  const flying = (aircraft ?? []).filter((a) => !a.onGround);
  if (!Number.isFinite(ownAltFt)) return flying;
  return flying.filter((a) => {
    const ft = Number.isFinite(a.altGeomFt) ? a.altGeomFt : a.altBaroFt;
    // An aircraft broadcasting no altitude is KEPT. It is really there, and the
    // band cannot judge it — dropping it would hide a real aircraft on the
    // strength of a measurement that does not exist.
    if (!Number.isFinite(ft)) return true;
    const delta = ft - ownAltFt;
    return delta >= 0 ? delta <= band.above : -delta <= band.below;
  });
}

/** Fields FOLLOW takes ownership of. Listed once, so releasing them on unfollow
 *  cannot drift from claiming them. */
/**
 * HOW OFTEN THE FOLLOWED AIRCRAFT IS ASKED, and how long its answer lives.
 *
 * THESE TWO BELONG TOGETHER AND USED NOT TO BE. The poll was in `app.js` and
 * the freshness windows were the field registry's — chosen from how fast each
 * quantity CHANGES, which is the right rule for a sensor this device reads at
 * 25 Hz and the wrong one for the same field when a ten-second poll owns it.
 *
 * Heading is the case that proved it: the registry gives `attitude.heading` a
 * 5 s staleMs, and following an aircraft fills that field from THIS poll. The
 * limit was half the cadence, so HDG could not be anything but FAIL — the panel
 * declared its own freshest possible data dead. The owner photographed the result:
 * every instrument crossed out, on a feed that was working, with PWR ON.
 *
 * `traffic-pacing.test.mjs` holds the relationship rather than the numbers, so
 * changing the poll cannot quietly re-create the defect.
 */
export const FOLLOW_POLL_MS = 10_000;

/**
 * One missed poll is nothing; six is a feed that has stopped. LIVE spans two
 * polls, FAIL waits for nine — the same shape the registry already chose for
 * the other ADS-B fields (`nav.selectedAltitude` and friends, 20 s / 90 s), so
 * this is matching a precedent rather than inventing a threshold.
 */
export const FOLLOW_WINDOWS = Object.freeze({ freshMs: 2 * FOLLOW_POLL_MS, staleMs: 9 * FOLLOW_POLL_MS });

/**
 * WHAT STATE THE SCOPE IS IN, AND WHETHER A TAP WOULD DO ANYTHING.
 *
 * He asked because he could not tell a scope that was still filling from
 * one that was finished, and could not tell either from one whose aircraft were
 * drawn but not yet tappable.
 *
 * ONE FUNCTION, READ BY BOTH THE INDICATOR AND THE TAP HANDLER, and that is the
 * whole design rather than a tidiness preference. An indicator computing "ready
 * to tap" separately from the code that handles the tap is two opinions about
 * one fact, and they drift — hub LESSONS §42 is exactly this shape. `tappable`
 * here IS the tap handler's precondition.
 *
 * Pure, so every sentence it can produce is testable without a browser.
 */
export function radarReadiness({ result, aircraft = [], nearbyAt = null, now = 0, following = null, nextAttemptInS = null }) {
  /**
   * THE COUNTDOWN, AND IT IS ABOUT THE ATTEMPT — NEVER ABOUT THE RESULT.
   *
   * He was looking at
   * NO CONTACT above the sentence "Standing off from the aircraft feeds for a
   * moment", and "a moment" is not a number.
   *
   * The app has always known this exactly — `trafficAllowedAt` in app.js is the
   * client's own backoff clock — and simply never said it out loud.
   *
   * "RETRY 12s" means WE WILL ASK in twelve seconds. It does not mean the
   * radar will work in twelve seconds, because the answer may be another
   * refusal, and a countdown that implied otherwise would be a promise this
   * app cannot keep. A panel that will not invent a groundspeed does not get
   * to invent an ETA either.
   */
  const retry = Number.isFinite(nextAttemptInS) && nextAttemptInS > 0 ? `RETRY ${Math.ceil(nextAttemptInS)}s` : null;
  const withRetry = (label) => (retry ? `${label} · ${retry}` : label);
  const retrySentence = retry ? ` Asking again in ${Math.ceil(nextAttemptInS)}s.` : '';
  const count = aircraft.length;
  /**
   * THE TAP'S REAL PRECONDITION: a centre to measure bearings from, and at
   * least one aircraft currently drawn. Without the centre the hit test has no
   * geometry; without an aircraft there is nothing under the finger. Both are
   * what `radar.js` checks before it hit-tests, and it now asks THIS.
   */
  const tappable = !!result?.centre && count > 0;
  const ageS = nearbyAt === null ? null : Math.max(0, Math.round((now - nearbyAt) / 1000));

  if (following) {
    return { state: 'following', tappable, label: `FOLLOWING ${following}`, detail: 'The panel is showing that aircraft. Tap another to switch.' };
  }
  if (!result) {
    return { state: 'listening', tappable: false, label: 'LISTENING', detail: 'Waiting for the first sweep — nothing to tap yet.' };
  }
  if (!result.ok) {
    // REFUSED, BUT NOT NECESSARILY EMPTY. Aircraft heard before the refusal are
    // real observations that stay on the scope and stay tappable; saying
    // otherwise would be as wrong as pretending the feed is healthy.
    return count
      ? {
          state: 'ageing',
          tappable,
          label: withRetry(`AGEING · ${count}`),
          detail:
            `The feed is not answering. ${count === 1 ? 'This is the last aircraft' : `These are the last ${count} aircraft`}`
            + ` actually heard${ageS === null ? '' : `, ${ageS}s ago`} — still tappable.${retrySentence}`,
        }
      : {
          state: 'refused',
          tappable: false,
          label: withRetry('NO CONTACT'),
          detail: `The feed is not answering and nothing has been heard yet.${retrySentence}`,
        };
  }
  if (!count) {
    return { state: 'empty', tappable: false, label: 'NO CONTACT', detail: 'The sweep worked and nothing is in range. Try a wider range or another band.' };
  }
  return {
    state: 'contact',
    // THE COMPUTED ONE, not a literal. This branch said `true` outright and a
    // test caught it: a healthy sweep with no centre yet would have advertised
    // "tap one to follow it" over a scope whose hit test returns immediately.
    // That is the very drift this function exists to prevent, committed inside
    // the function itself.
    tappable,
    label: `CONTACT · ${count}`,
    detail: `${count === 1 ? 'One aircraft' : `${count} aircraft`} on the scope${ageS === null ? '' : `, heard ${ageS}s ago`} — tap one to follow it.`,
  };
}

/**
 * WHAT THE FOLLOW BANNER SAYS, AND IT MUST NOT CLAIM DATA IT DOES NOT HAVE.
 *
 * The banner read "this panel is showing that aircraft's broadcast, not this
 * device" from the instant FOLLOW was pressed. The owner's 1.21.1 diagnostics report
 * shows what that meant when the feed was rate limited: every followed field
 * reading "waiting for the first report from PXT466", under a banner asserting
 * their broadcast was on screen. Nothing was.
 *
 * That sentence sat at the top of a panel of red crosses, which is exactly why
 * it "looks broken without any data" — the app was telling him it HAD data. A
 * false sentence in the one element whose job is to say what the panel is
 * showing is the same defect as a fabricated number, and this app has no room
 * for either.
 *
 * Pure, so both branches are testable without a browser or a feed.
 */
/**
 * ONE LINE. It is a standing indicator, not a paragraph.
 *
 * It used to read `LXJ576 — no broadcast received yet. The panel stays crossed
 * out until one arrives.`, which wrapped to three lines and, with the badge and
 * the exit button, took roughly a fifth of a phone's PFD before a single
 * instrument. The second sentence explained something the crossed-out panel
 * behind it was already demonstrating, and the HDG row says the same again in
 * its own reason string.
 *
 * WHAT IT MAY NOT LOSE: which aircraft, and whether anything has arrived from
 * it. A reader whose panel is showing somebody else's aeroplane must be able to
 * tell that from a panel that is merely broken — Doctrine §3 — and "no
 * broadcast yet" is the whole of that distinction. An error, when there is one,
 * still replaces the short form rather than being dropped: it is the only place
 * a refusal reaches the PFD at all.
 */
export function followBannerText(label, { followed = null, followError = null } = {}) {
  if (!label) return '';
  if (followed) return `${label} — showing its broadcast`;
  return followError ? `${label} — ${followError}` : `${label} — no broadcast yet`;
}

export const FOLLOW_WRITES = [
  'nav.selectedAltitude',
  'nav.selectedHeading',
  'nav.crewQnh',
  'position.lat',
  'position.lon',
  'position.groundspeed',
  'position.track',
  'position.altitudeGeometric',
  'vsi.rate',
  'attitude.roll',
  'attitude.turnRate',
  'motion.gLoad',
];

/** Fields FOLLOW explicitly crosses out, each with the reason ADS-B cannot
 *  answer it. Not silence — a stated limit. */
export const FOLLOW_FAILS = {
  'attitude.pitch': 'ADS-B carries no attitude — pitch is not broadcast and cannot be derived from a ground track',
  'motion.lateralG': 'ADS-B carries no slip information, and coordinated flight is what the bank was inferred FROM',
  'motion.verticalAccel': 'not broadcast — this panel is following an aircraft, not riding in it',
  'speed.tas': 'true airspeed needs winds aloft where the AIRCRAFT is, not where this device is',
  'speed.cas': 'calibrated airspeed needs a pressure altitude from the aircraft position',
  'altitude.indicated': 'the Kollsman setting is from a station near this device, not near the aircraft',
  'altitude.pressure': 'pressure altitude needs an altimeter setting from the aircraft position',
  'aoa.angle': 'angle of attack needs pitch, and ADS-B does not broadcast it',
};

const clampRange = (nm) => {
  const allowed = RADAR_RANGE_NM;
  return allowed.includes(nm) ? nm : allowed[2];
};

/**
 * ONE RADIUS IS EVER FETCHED, and it is the widest the panel offers.
 *
 * `dist` is part of the Function's cache key, so four range buttons meant four
 * cache entries and four upstream requests for THE SAME SKY. Tapping through
 * the ranges — which is the obvious thing to do with four buttons — quadrupled
 * what a volunteer network was asked for, and the old code knew it: the comment
 * on the failure path said so and then worked around the symptom.
 *
 * The 80 nm response already contains every aircraft a 10 nm view can show, and
 * the renderer clips to the drawn circle regardless. So the wider fetch is not
 * extra data, it is the same data asked for once instead of four times, and
 * changing range becomes free and instant rather than a network round trip.
 */
export const FETCH_RANGE_NM = RADAR_RANGE_NM[RADAR_RANGE_NM.length - 1];

/**
 * Aircraft inside a display range. The fetch is wider; the scope is not.
 *
 * Reads `distanceNm`, the field `withRangeAndBearing` actually writes. The
 * first version of this invented `rangeNm` and silently filtered EVERY aircraft
 * away — and its unit test passed, because the fixtures were written from the
 * same wrong name. Only the radar's own test caught it. That is why the test
 * for this now runs real aircraft through `withRangeAndBearing` first.
 *
 * An aircraft with no computed distance is DROPPED, not treated as zero: a
 * missing measurement placed at the centre would sit on top of the reader.
 */
export function withinRange(aircraft, rangeNm) {
  return (aircraft ?? []).filter((a) => Number.isFinite(a.distanceNm) && a.distanceNm <= rangeNm);
}

/**
 * The id used for aircraft that broadcast no type.
 *
 * A SEPARATE BUCKET, never folded into a real type and never dropped. An
 * aircraft whose type is not being received is a real aircraft — hiding it
 * would make the counts disagree with the scope, and filing it under some
 * other airframe would be an invention. ICAO type designators are at most four
 * characters, so this string cannot collide with one.
 */
export const UNTYPED = 'UNTYPED';

/**
 * Which airframes are up there RIGHT NOW, with how many of each.
 *
 * Built from the aircraft actually in range at this moment (
 * ) — not accumulated, so a type that has flown out of
 * range stops being offered rather than becoming a button that finds nothing.
 *
 * The LABEL prefers the broadcast description over the code, because "Boeing
 * 737-800" is the thing worth reading and "B738" is not. Aircraft of one type
 * can carry slightly different description strings, so the most common one wins
 * and ties break alphabetically — deterministic, so the button does not flicker
 * between two spellings as aircraft come and go.
 */
export function airframeGroups(aircraft) {
  const groups = new Map();

  for (const a of aircraft ?? []) {
    const code = typeof a.type === 'string' && a.type.trim() ? a.type.trim().toUpperCase() : null;
    const id = code ?? UNTYPED;
    let g = groups.get(id);
    if (!g) {
      g = { id, code, count: 0, descriptions: new Map() };
      groups.set(id, g);
    }
    g.count += 1;
    const d = typeof a.description === 'string' && a.description.trim() ? a.description.trim() : null;
    if (d) g.descriptions.set(d, (g.descriptions.get(d) ?? 0) + 1);
  }

  const out = [...groups.values()].map((g) => {
    const best = [...g.descriptions.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
    return {
      id: g.id,
      code: g.code,
      count: g.count,
      label: best ? best[0] : g.code ?? 'Type not broadcast',
    };
  });

  // Most numerous first — what is most of overhead is the most interesting
  // thing to look at. The untyped bucket sorts LAST whatever its count, because
  // it is an absence of information rather than an airframe.
  return out.sort((a, b) => {
    if (a.id === UNTYPED) return 1;
    if (b.id === UNTYPED) return -1;
    return b.count - a.count || a.label.localeCompare(b.label);
  });
}

/** Aircraft of one airframe id. A null id means every aircraft, unfiltered. */
export function filterByAirframe(aircraft, id) {
  if (id === null || id === undefined) return aircraft ?? [];
  return (aircraft ?? []).filter((a) => {
    const code = typeof a.type === 'string' && a.type.trim() ? a.type.trim().toUpperCase() : null;
    return (code ?? UNTYPED) === id;
  });
}

/** Position to search around: the live fix if there is one, else home. */
/**
 * The path a followed aircraft has actually flown, as observed.
 *
 * EVERY POINT ON THIS TRAIL IS A POSITION THIS PANEL WAS TOLD, at a time it was
 * told it. Nothing is interpolated between them and nothing is extrapolated
 * ahead — a smooth curve drawn through sparse observations is a drawing of a
 * flight path rather than a record of one, and the gaps are information: a
 * receiver dropout looks like a gap because it WAS one.
 *
 * Not to be confused with a flight PLAN, which is a different thing entirely
 * and is not in an ADS-B broadcast. This is where it has been, not where it
 * intends to go.
 *
 * Bounded by both age and count so a long follow cannot grow without limit.
 */
export function appendTrail(trail, point, { maxPoints = 240, maxAgeMs = 45 * 60_000 } = {}) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !Number.isFinite(point.at)) return trail;
  const last = trail[trail.length - 1];
  // The followed aircraft is polled harder than it broadcasts, so the same
  // position arrives repeatedly. Storing it again would weight a stationary
  // aircraft's trail by how often we asked rather than by where it went.
  if (last && last.lat === point.lat && last.lon === point.lon) return trail;
  const cutoff = point.at - maxAgeMs;
  const next = [...trail.filter((p) => p.at >= cutoff), point];
  return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
}

/**
 * What the scope is centred on.
 *
 * FOLLOWING AN AIRCRAFT MOVES THE CENTRE TO IT, EXPLICITLY.
 * — and he is
 * right, because by then every other instrument has already switched: the
 * horizon, the tapes, the altitude and the speed are all that aircraft's. The
 * scope was the last thing still showing the desk, which made the panel show
 * two aircraft at once — the exact failure FOLLOW was designed to avoid.
 *
 * It USED to arrive at the right answer by accident: FOLLOW overwrites
 * `position.lat`/`position.lon`, so a centre read from those fields drifted to
 * the aircraft on the next successful fetch. That is emergent, not stated —
 * and it broke exactly when the traffic feed was rate limited, because the
 * centre is only recomputed on a fetch. Passing the followed aircraft in makes
 * it a decision instead of a side effect, and one that holds even when no
 * request has succeeded for a minute.
 *
 * `centredOn` NAMES it, because "56 aircraft within 40 nm of this device" is a
 * false sentence when the scope is centred on a 737 over the Sierra.
 *
 * `short` is the same fact in the few characters that fit UNDER THE CROSSHAIR,
 * and it lives here rather than at each drawing site because there are two of
 * them. The RADAR page worked out its own label and the PFD's navigation
 * display did not, so following a flight put the aircraft's callsign under one
 * scope's centre and the word HOME under the other — the same crosshair, two
 * answers. One function decides, both draw what it says.
 */
export function radarCentre(fields, followed = null, chosen = null) {
  // PRECEDENCE, and it is deliberate. A followed aircraft outranks a chosen
  // place because the whole panel has become that aircraft; a chosen place
  // outranks the device's own fix because choosing it was a deliberate act and
  // a GPS fix arriving must not silently undo it.
  if (followed && Number.isFinite(followed.lat) && Number.isFinite(followed.lon)) {
    return {
      lat: followed.lat,
      lon: followed.lon,
      fromFix: false,
      followed: true,
      centredOn: followed.callsign ?? followed.hex?.toUpperCase() ?? 'the followed aircraft',
      short: followed.callsign ?? followed.hex?.toUpperCase() ?? 'FOLLOWED',
    };
  }
  if (chosen && Number.isFinite(chosen.lat) && Number.isFinite(chosen.lon)) {
    return {
      lat: chosen.lat,
      lon: chosen.lon,
      fromFix: false,
      followed: false,
      chosen: true,
      centredOn: chosen.label ?? 'the chosen place',
      short: chosen.short ?? chosen.label ?? 'CHOSEN',
    };
  }
  const lat = fields?.['position.lat'];
  const lon = fields?.['position.lon'];
  if (lat && lon && lat.provenance !== 'FAIL' && lon.provenance !== 'FAIL') {
    return { lat: lat.value, lon: lon.value, fromFix: true, followed: false, centredOn: 'this device', short: 'YOU' };
  }
  /**
   * THE LAST PLACE THIS DEVICE ACTUALLY WAS, ahead of the built-in constant.
   *
   * The constant is Cameron Park because that is where the
   * app was written, and it exists for a real reason — the panel must come up
   * and be useful with every permission denied, so SOMETHING has to be the
   * centre before a fix exists. What was wrong is that it never learned. A
   * reader in Denver was anchored to a town in California for ever, on every
   * cold start, no matter how many fixes their device had given us.
   *
   * A remembered fix is a MEASUREMENT this device made, so it outranks a
   * constant nobody measured. It is stored coarsely — see `rememberFix` — and
   * it is still not a fix: `fromFix` stays false and the label says it is the
   * last known position, because a panel that calls a stale position a live one
   * is the lie this app is built around not telling.
   */
  const last = lastKnownFix();
  if (last) {
    return {
      lat: last.lat,
      lon: last.lon,
      fromFix: false,
      followed: false,
      centredOn: 'the last position this device reported',
      short: 'LAST',
    };
  }
  return {
    lat: REGION.home.lat,
    lon: REGION.home.lon,
    fromFix: false,
    followed: false,
    centredOn: 'the home reference',
    short: 'HOME',
  };
}

/** Where the coarse last-known fix is kept. */
const LAST_FIX_KEY = 'fauxplane:last-fix';

/**
 * Remember roughly where this device was, for the next cold start.
 *
 * ROUNDED TO TWO DECIMALS, about 1 km, and that is a privacy decision rather
 * than a storage one. Nothing here needs a doorstep: this is a map centre and a
 * feed query box tens of miles across. The diagnostics report already coarsens
 * position for the same reason, and storing a precise home address in
 * localStorage so a scope can be centred is a trade nobody asked for.
 */
export function rememberFix(lat, lon, storage = globalThis.localStorage) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  try {
    storage?.setItem(LAST_FIX_KEY, JSON.stringify({ lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) }));
    return true;
  } catch {
    return false;
  }
}

export function lastKnownFix(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(LAST_FIX_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    // A stored value that is not a usable coordinate is DISCARDED rather than
    // clamped. Centring the scope on a corrupted entry would put it somewhere
    // real and wrong, which is worse than falling back to the constant.
    if (!Number.isFinite(v?.lat) || !Number.isFinite(v?.lon)) return null;
    if (Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) return null;
    return { lat: v.lat, lon: v.lon };
  } catch {
    return null;
  }
}

/**
 * Range and bearing are computed HERE, on the device, from the device's own
 * precise position — never from the coarse centre the request carried. The
 * Function deliberately quantises the outbound position to about six nautical
 * miles, so a distance calculated up there would inherit that error.
 */
export function withRangeAndBearing(aircraft, centre) {
  return aircraft
    .map((a) => {
      const distanceNm = greatCircleNm(centre, { lat: a.lat, lon: a.lon });
      return { ...a, distanceNm, bearingDeg: bearingDeg(centre, { lat: a.lat, lon: a.lon }) };
    })
    .sort((a, b) => (a.distanceNm ?? Infinity) - (b.distanceNm ?? Infinity));
}

export function createTrafficSource({ state, clock = () => Date.now(), fetchImpl = null }) {
  const doFetch = (...args) => (fetchImpl ?? fetch)(...args);

  let nearby = [];
  /** Every aircraft the last successful fetch returned, out to FETCH_RANGE_NM.
   *  `nearby` is this filtered to the display range — kept separately so that
   *  changing range is a filter over data already in hand, not a request. */
  let allNearby = [];
  let displayRangeNm = RADAR_RANGE_NM[2];
  /** When `nearby` last actually CHANGED — a successful fetch. Null until one. */
  let nearbyAt = null;
  let lastResult = null;
  let followKey = null; // { by: 'callsign' | 'hex', value }
  let followed = null; // the last aircraft object seen for followKey
  /** The provider that answered the last followed query, for the reason strings.
   *  Null until one has. */
  let followedSource = null;
  /** An airport or coordinate the reader picked as the scope centre. */
  let chosenPlace = null;
  /** Observed positions of the followed aircraft, oldest first. Cleared with
   *  the follow itself — a trail belonging to a different aircraft is worse
   *  than no trail. */
  let trail = [];
  let followError = null;
  let followSince = null;
  const turn = createTurnRate();

  /**
   * The derivations are computed ONCE PER REPORT, not once per frame.
   *
   * The store publishes at 25 Hz; a followed aircraft reports every few
   * seconds. Recomputing a RATE at 25 Hz against a source that changes at 0.2 Hz
   * means twenty-four of every twenty-five calls have no new observation to
   * difference — and `createTurnRate` correctly refuses those, which would have
   * made the turn needle and the bank angle flicker to FAIL and back
   * continuously. Anchoring to the report is what makes the rate a rate.
   */
  let reportAt = null; // source time of the current report, stable between fetches
  let lastDerivedAt = null;
  let derivedTurn = null;
  let derivedBank = null;
  let derivedG = null;

  const query = async (search) => {
    try {
      const res = await doFetch(`/api/traffic?${search}`, { cache: 'no-store' });
      let body = null;
      try {
        body = await res.json();
      } catch {
        /* handled below by the status check */
      }
      if (!res.ok) {
        return { ok: false, reason: body?.reason ?? `HTTP ${res.status}`, status: res.status };
      }
      if (!body?.ok) return { ok: false, reason: body?.reason ?? 'the traffic service returned no payload' };
      return { ok: true, ...body };
    } catch (err) {
      return { ok: false, reason: `traffic request failed: ${err.message}` };
    }
  };

  return {
    get nearby() {
      return nearby;
    },

    /**
     * Change the display range with NO network request.
     *
     * The aircraft for every range are already here — one fetch covers the
     * widest scope, and a narrower one is a filter over it. This is also why
     * the scope emptying on a range change is gone at the root rather than
     * patched: there is no request to fail.
     *
     * Returns the aircraft now shown, so a caller can redraw immediately.
     */
    setDisplayRange(rangeNm) {
      displayRangeNm = clampRange(rangeNm);
      nearby = withinRange(allNearby, displayRangeNm);
      if (lastResult) lastResult.rangeNm = displayRangeNm;
      return nearby;
    },
    get last() {
      return lastResult;
    },
    get followed() {
      return followed;
    },
    /** The observed path of the followed aircraft, oldest first. */
    get trail() {
      return trail;
    },
    get followError() {
      return followError;
    },
    get isFollowing() {
      return followKey !== null;
    },
    /** What the standing FOLLOW banner says. Null when not following. */
    get followLabel() {
      if (!followKey) return null;
      return followed?.callsign ?? followed?.registration ?? followKey.value;
    },

    /** The plan view: everything within `rangeNm` of the centre. */
    /** A place the reader chose, or null for "wherever I am". */
    setCentre(place) {
      chosenPlace = place;
    },
    get chosenPlace() {
      return chosenPlace;
    },

    async refreshNearby(fields, rangeNm) {
      // The followed aircraft, if any, decides the centre — so the scope keeps
      // pointing at it even while the feed is refusing us and no new fix has
      // arrived for either. A chosen place comes next, ahead of the fix.
      const centre = radarCentre(fields, followed, chosenPlace);
      // The DISPLAY range, which is what the scope and every count describe.
      const display = clampRange(rangeNm);
      // The FETCH range, always the widest, so all four buttons share one cache
      // entry upstream instead of issuing four requests for the same sky.
      const result = await query(
        `lat=${centre.lat.toFixed(4)}&lon=${centre.lon.toFixed(4)}&dist=${FETCH_RANGE_NM}`,
      );
      lastResult = { ...result, centre, rangeNm: display, fetchedRangeNm: FETCH_RANGE_NM, at: clock() };
      // A FAILED REFRESH IS NOT AN EMPTY SKY, and this cleared the plan view on
      // any failure at all. Changing range is the way to hit it: each range is a
      // different cache key upstream, so tapping through them issues real
      // requests, and one rate-limited reply wiped every aircraft off the
      // screen. The reader sees "no traffic" and believes it.
      //
      // The aircraft already on the display are real observations that did not
      // stop being true because the NEXT request failed. They stay, they carry
      // their own age, and the failure is reported beside them — the same
      // contract every other field in this app keeps. `sw.js` refuses to invent
      // an empty sky for exactly this reason and this path was doing it anyway.
      if (result.ok) {
        // Everything the fetch returned, kept whole so a range change can be
        // answered from memory. `nearby` is the filtered view of it.
        allNearby = withRangeAndBearing(result.aircraft ?? [], centre);
        displayRangeNm = display;
        nearby = withinRange(allNearby, display);
        // STAMPED WHEN THE DATA ARRIVED, not when the attempt was made. `at`
        // above marks the attempt; using it for the display age would let kept
        // aircraft claim to be fresh the moment a refresh failed, which is a
        // worse lie than blanking them — it is stale data wearing a new
        // timestamp.
        nearbyAt = clock();
      }
      lastResult.nearbyAt = nearbyAt;
      return lastResult;
    },

    follow({ callsign = null, hex = null } = {}) {
      const next = callsign ? { by: 'callsign', value: callsign.trim().toUpperCase() } : hex ? { by: 'hex', value: hex.trim().toLowerCase() } : null;
      if (!next) return null;
      followKey = next;
      followed = null;
      trail = [];
      followError = null;
      followSince = clock();
      reportAt = null;
      lastDerivedAt = null;
      derivedTurn = derivedBank = derivedG = null;
      // A rate needs two observations, and the first one after a switch belongs
      // to a different aircraft. Forgetting it is what stops one aircraft's
      // track being differenced against another's.
      turn.reset();
      return followKey;
    },

    unfollow() {
      followKey = null;
      followed = null;
      trail = [];
      followError = null;
      followSince = null;
      reportAt = null;
      lastDerivedAt = null;
      derivedTurn = derivedBank = derivedG = null;
      turn.reset();
      // Hand the fields back. They go to FAIL rather than to a stale last
      // value: the aircraft is no longer being watched, so there is no reading,
      // and the device's own sensors will overwrite whichever of them they own
      // on the very next publish.
      for (const path of FOLLOW_WRITES) state.fail(path, 'no longer following an aircraft');
    },

    /** Poll the followed aircraft and write its broadcast into the store. */
    async refreshFollowed() {
      if (!followKey) return null;
      const result = await query(
        followKey.by === 'callsign' ? `callsign=${encodeURIComponent(followKey.value)}` : `hex=${encodeURIComponent(followKey.value)}`,
      );
      if (!result.ok) {
        followError = result.reason;
        return result;
      }
      const list = result.aircraft ?? [];
      if (!list.length) {
        // Not an error. adsb.fi answered; no receiver is currently hearing this
        // aircraft. That is a real fact about the world and the panel says so,
        // while the fields age out on their own through the store.
        followError = result.notHeard
          ? `${followKey.value} is not being heard by any receiver right now — it may be on the ground, out of range, or over an ocean`
          : `${followKey.value} returned no aircraft`;
        return result;
      }
      /**
       * THE ANSWER MUST BE ABOUT THE AIRCRAFT WE ASKED ABOUT.
       *
       * This was `followed = list[0]` — whatever came back, adopted as the
       * followed aircraft without checking. Found by the first run of the
       * invariant test in `invariants.test.mjs`, which walks a follow, a
       * switch, and a refresh and asserts no field names an aircraft the panel
       * is not following. Ten fields did.
       *
       * Every value on this panel has to trace to what it claims to be. A
       * broadcast adopted under the wrong name is that rule broken at the
       * source, and it would be INVISIBLE: real numbers, real provenance, real
       * timestamps, wrong aeroplane. Callsigns are reused, a callsign query can
       * match more than one airframe, and a cache can outlive a switch — this
       * costs one comparison and closes all of it.
       */
      const want = followKey.value.trim().toUpperCase();
      const got = followKey.by === 'callsign'
        ? String(list[0]?.callsign ?? '').trim().toUpperCase()
        : String(list[0]?.hex ?? '').trim().toUpperCase();
      if (got !== want) {
        followError = `the feed answered about ${got || 'an unnamed aircraft'} when asked about ${want} — not showing it`;
        return result;
      }
      followed = list[0];
      followError = null;
      // Which provider answered THIS query. The followed aircraft is fetched
      // separately from the nearby sweep, so the two can legitimately come from
      // different providers and the reason strings must name the right one.
      followedSource = result.source ?? null;
      // The observed path. Appended here, where a fresh broadcast arrives, so
      // it records what was HEARD rather than what was rendered.
      trail = appendTrail(trail, {
        lat: followed.lat,
        lon: followed.lon,
        at: clock(),
        altFt: followed.altBaroFt ?? followed.altGeomFt ?? null,
      });
      // STAMPED WITH WHEN IT WAS HEARD, once, here. `seen_pos` is how many
      // seconds ago the position last arrived, so subtracting it hands the
      // store a real source time — and the store's own ageing then turns a
      // receiver gap into STALE and then FAIL with a visible age, with no
      // special case anywhere. Computing it here rather than on every publish
      // keeps it STABLE between fetches, which is what the rate below needs.
      reportAt = clock() - Math.max(0, (followed.seenPosS ?? 0) * 1000);
      return result;
    },

    /** Write the followed aircraft's broadcast into the store. */
    apply() {
      if (!followKey) return;
      const a = followed;
      if (!a || reportAt === null) {
        const why = followError ?? `waiting for the first report from ${followKey.value}`;
        for (const path of FOLLOW_WRITES) state.fail(path, why);
        for (const [path, reason] of Object.entries(FOLLOW_FAILS)) state.fail(path, reason);
        /**
         * HEADING TOO, AND IT WAS BEING LEFT BEHIND.
         *
         * It is written outside FOLLOW_WRITES because it has its own two-case
         * message — the aircraft broadcasts a heading or it does not — and that
         * write only happens in the branch below, where a report exists. So on
         * switching aircraft before the first report arrives, this field kept
         * the PREVIOUS aircraft's sentence.
         *
         * The owner's 1.23.1 report caught it exactly: following N81AB, with every
         * other field reading "waiting for the first report from N81AB", while
         * heading still read "N460DF is not broadcasting a heading". The panel
         * was naming an aircraft it was no longer following.
         */
        state.fail('attitude.heading', why);
        return;
      }

      const at = reportAt;
      // CREDIT WHOEVER ANSWERED. This said "via adsb.fi" unconditionally, so
      // every followed field's provenance named a provider that may not have
      // supplied it — the same false-citation bug the radar page's link had,
      // surviving in a reason string where no gate was looking. The source
      // comes from the response now.
      const via = followedSource ?? lastResult?.source ?? 'the traffic service';
      const from = `broadcast by ${a.callsign ?? a.hex} via ${via}`;
      const put = (path, value) => {
        if (value === null || value === undefined) return false;
        // THE FEED'S WINDOW, NOT THE REGISTRY'S — see FOLLOW_WINDOWS. These
        // fields are normally this device's own sensors at 25 Hz; while an
        // aircraft owns them they arrive once per FOLLOW_POLL_MS, and holding
        // them to a sensor's limits crossed the whole panel out.
        state.write(path, value, { at, reason: from, windows: FOLLOW_WINDOWS });
        return true;
      };

      put('position.lat', a.lat);
      put('position.lon', a.lon);
      if (!put('position.groundspeed', a.groundspeedKt)) {
        state.fail('position.groundspeed', `${a.callsign ?? a.hex} is not broadcasting a groundspeed`);
      }
      if (!put('position.track', a.trackDeg)) {
        state.fail('position.track', `${a.callsign ?? a.hex} is not broadcasting a ground track`);
      }
      // Geometric altitude is height above the ellipsoid, exactly like a GPS
      // fix, so it lands on the same field and the existing geoid chain turns
      // it into MSL for free. Barometric altitude is a DIFFERENT quantity and
      // is deliberately not substituted for it.
      if (!put('position.altitudeGeometric', a.altGeomFt)) {
        state.fail(
          'position.altitudeGeometric',
          a.altBaroFt !== null
            ? `${a.callsign ?? a.hex} broadcasts only a barometric altitude (${Math.round(a.altBaroFt)} ft), which is not a geometric one`
            : `${a.callsign ?? a.hex} is not broadcasting an altitude`,
        );
      }
      if (!put('vsi.rate', a.verticalRateFpm)) {
        state.fail('vsi.rate', `${a.callsign ?? a.hex} is not broadcasting a vertical rate`);
      }

      // --- what the CREW has selected ---------------------------------------
      // Intent rather than state, and the closest thing to sitting behind them.
      // Most aircraft broadcast none of it; each absence says so by name.
      const who = a.callsign ?? a.hex;
      if (!put('nav.selectedAltitude', a.navSelectedAltitudeFt)) {
        state.fail('nav.selectedAltitude', `${who} is not broadcasting the altitude selected on the autopilot`);
      }
      if (!put('nav.selectedHeading', a.navSelectedHeadingDeg)) {
        state.fail('nav.selectedHeading', `${who} is not broadcasting a selected heading`);
      }
      if (!put('nav.crewQnh', a.navQnhHpa)) {
        state.fail('nav.crewQnh', `${who} is not broadcasting the altimeter setting its crew is using`);
      }

      // --- the two derivations ADS-B honestly supports ------------------------
      // Recomputed only when the report itself moved on. `peek` rather than the
      // published snapshot, because the writes above landed this instant and
      // the snapshot is still a frame behind.
      if (at !== lastDerivedAt) {
        lastDerivedAt = at;
        derivedTurn = turn.read(state.peek('position.track'), at);
        derivedBank = bankAngle({ groundspeedKt: state.peek('position.groundspeed'), turnRateDegPerSec: derivedTurn });
        derivedG = loadFactorFromBank({ bankDeg: derivedBank });
      }
      // Computed FROM the broadcast, so they age with it. Left on the sensor
      // windows these crossed out between polls while the numbers they were
      // computed from were still LIVE — a derived value expiring before its
      // own input.
      writeDerived(state, 'attitude.turnRate', derivedTurn, at, FOLLOW_WINDOWS);
      writeDerived(state, 'attitude.roll', derivedBank, at, FOLLOW_WINDOWS);
      writeDerived(state, 'motion.gLoad', derivedG, at, FOLLOW_WINDOWS);

      // --- and the ones it does not -----------------------------------------
      for (const [path, reason] of Object.entries(FOLLOW_FAILS)) state.fail(path, reason);

      // Magnetic heading only if the aircraft actually broadcasts one. Deriving
      // it from the ground track would be asserting there is no wind, which for
      // an airliner at altitude is the one thing certainly untrue.
      if (a.headingDeg !== null && a.headingDeg !== undefined) {
        state.write('attitude.heading', a.headingDeg, { at, reason: from, windows: FOLLOW_WINDOWS });
      } else {
        state.fail(
          'attitude.heading',
          `${a.callsign ?? a.hex} is not broadcasting a heading — the tape is showing its ground TRACK instead`,
        );
      }
    },

    get followSince() {
      return followSince;
    },
  };
}

/** Copy a computed field in, preserving provenance and reason. Mirrors the
 *  writeField helper in app.js; kept local so this module has no import from
 *  the app layer. */
function writeDerived(state, path, field, at, windows = null) {
  if (!field || field.provenance === 'FAIL') {
    state.fail(path, field?.reason ?? 'not computable');
    return;
  }
  // `derived: true` because these ARE computed, whatever the field registry
  // calls the slot. Without it the turn rate published LIVE while the bank
  // angle derived from it published DERIVED.
  state.write(path, field.value, { at, reason: field.reason, stale: field.provenance === 'STALE', derived: true, windows });
}

/**
 * Turn a chain of upstream refusals into a sentence for the READER.
 *
 * What was on the owner's phone, on the face of a gauge:
 *
 *   No traffic: adsb.lol rate limited us (HTTP 429; cf-ray a258e8a82ff1fa4e-SJC)
 *   | adsb.fi returned HTTP 403 — server: cloudflare; ray a258e8a9483dfa4e-SJC;
 *   Attention Required! | Cloudflare
 *
 * Every word of that is true and it is written for whoever is debugging the
 * Function. A Cloudflare ray ID is not a thing the reader can do anything with,
 * and this panel is for someone building a 747 cockpit in his house.
 *
 * NOTHING IS THROWN AWAY. The full chain still goes to the diagnostics report
 * (§7f) and onto the element's `title`, which is where technical detail belongs
 * — the report is the thing this app asks to be sent instead of a photograph.
 * This is a summary layer, not a replacement, and the distinction matters: a
 * panel that SIMPLIFIES an error is helping, a panel that HIDES one is lying.
 *
 * The cause is stated because it is structural and settled (NOTES, Open §0):
 * the panel reaches these services through Cloudflare, whose egress address is
 * shared with an enormous number of unrelated sites, so the per-address
 * allowance can be spent by traffic that has nothing to do with this app. The owner
 * decided on 2026-08-04 not to run a receiver, which is the only thing that
 * would fix it — so this is now a permanent condition the panel lives with
 * rather than a fault it is waiting to have fixed.
 */
export function explainTrafficRefusal(reason, { heard = 0 } = {}) {
  const raw = String(reason ?? '');
  const has = (re) => re.test(raw);

  let what;
  if (!raw) what = 'The aircraft feed did not answer.';
  else if (has(/not asked/i)) what = 'Standing off from the aircraft feeds for a moment, so we do not keep knocking.';
  else if (has(/429|rate limit/i)) what = 'The aircraft feed is rate limiting us.';
  else if (has(/403|refus|forbidden/i)) what = 'The aircraft feed is refusing us.';
  else if (has(/unreachable|network|fetch failed|timed? ?out/i)) what = 'Cannot reach the aircraft feed.';
  else what = 'The aircraft feed did not answer.';

  /**
   * WHY, but only for the case where the cause is actually known. A rate limit
   * on a shared address is a settled diagnosis; a 403 from a firewall or a dead
   * network is not, and guessing would be the same error the groundspeed reason
   * once made when it could not tell two causes apart.
   */
  const why = has(/429|rate limit/i)
    ? ' We share an address with a great many other sites, so the allowance can be spent by traffic that is nothing to do with you.'
    : '';

  // WHAT IS STILL TRUE ON SCREEN. The aircraft already drawn are real
  // observations that did not stop being true because the next request failed,
  // and saying so is the difference between a stale scope and an empty sky.
  /**
   * "THE SCOPE IS EMPTY" WAS FALSE, and visibly so.
   *
   * At 40 or 80 nm the plan view draws every bundled airport as the small
   * circle an aeronautical chart uses — dozens of them, from data that cannot
   * be rate limited and is always there. So a reader looking at fifty symbols
   * was told the scope was empty, which is the panel arguing with itself in the
   * one way this app is not allowed to.
   *
   * The sentence has to be about AIRCRAFT, which is the only thing the feed
   * governs. What is on the scope besides them was never the feed's to claim.
   */
  const still =
    heard > 0
      ? ` The ${heard} aircraft on the scope are the last ones actually heard, and they are ageing.`
      : ' No aircraft have been heard yet — anything on the scope is bundled airport data, not traffic.';

  return `${what}${why}${still}`;
}
