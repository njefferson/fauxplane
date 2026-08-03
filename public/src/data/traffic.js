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
export const RADAR_RANGE_NM = [10, 25, 40, 80];

/** Fields FOLLOW takes ownership of. Listed once, so releasing them on unfollow
 *  cannot drift from claiming them. */
export const FOLLOW_WRITES = [
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
 * Built from the aircraft actually in range at this moment (Noah: "types
 * currently in range only") — not accumulated, so a type that has flown out of
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

export function radarCentre(fields) {
  const lat = fields?.['position.lat'];
  const lon = fields?.['position.lon'];
  if (lat && lon && lat.provenance !== 'FAIL' && lon.provenance !== 'FAIL') {
    return { lat: lat.value, lon: lon.value, fromFix: true };
  }
  return { lat: REGION.home.lat, lon: REGION.home.lon, fromFix: false };
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
     * "the radar loses everything when you change range" is gone at the root
     * rather than patched: there is no request to fail.
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
    async refreshNearby(fields, rangeNm) {
      const centre = radarCentre(fields);
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
      followed = list[0];
      followError = null;
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
        return;
      }

      const at = reportAt;
      const from = `broadcast by ${a.callsign ?? a.hex} via adsb.fi`;
      const put = (path, value) => {
        if (value === null || value === undefined) return false;
        state.write(path, value, { at, reason: from });
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
      writeDerived(state, 'attitude.turnRate', derivedTurn, at);
      writeDerived(state, 'attitude.roll', derivedBank, at);
      writeDerived(state, 'motion.gLoad', derivedG, at);

      // --- and the ones it does not -----------------------------------------
      for (const [path, reason] of Object.entries(FOLLOW_FAILS)) state.fail(path, reason);

      // Magnetic heading only if the aircraft actually broadcasts one. Deriving
      // it from the ground track would be asserting there is no wind, which for
      // an airliner at altitude is the one thing certainly untrue.
      if (a.headingDeg !== null && a.headingDeg !== undefined) {
        state.write('attitude.heading', a.headingDeg, { at, reason: from });
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
function writeDerived(state, path, field, at) {
  if (!field || field.provenance === 'FAIL') {
    state.fail(path, field?.reason ?? 'not computable');
    return;
  }
  // `derived: true` because these ARE computed, whatever the field registry
  // calls the slot. Without it the turn rate published LIVE while the bank
  // angle derived from it published DERIVED.
  state.write(path, field.value, { at, reason: field.reason, stale: field.provenance === 'STALE', derived: true });
}
