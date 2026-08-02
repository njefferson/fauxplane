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

/** Position to search around: the live fix if there is one, else home. */
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
  let lastResult = null;
  let followKey = null; // { by: 'callsign' | 'hex', value }
  let followed = null; // the last aircraft object seen for followKey
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
    get last() {
      return lastResult;
    },
    get followed() {
      return followed;
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
      const dist = clampRange(rangeNm);
      const result = await query(`lat=${centre.lat.toFixed(4)}&lon=${centre.lon.toFixed(4)}&dist=${dist}`);
      lastResult = { ...result, centre, rangeNm: dist, at: clock() };
      nearby = result.ok ? withRangeAndBearing(result.aircraft ?? [], centre) : [];
      return lastResult;
    },

    follow({ callsign = null, hex = null } = {}) {
      const next = callsign ? { by: 'callsign', value: callsign.trim().toUpperCase() } : hex ? { by: 'hex', value: hex.trim().toLowerCase() } : null;
      if (!next) return null;
      followKey = next;
      followed = null;
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
  state.write(path, field.value, { at, reason: field.reason, stale: field.provenance === 'STALE' });
}
