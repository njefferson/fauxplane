/**
 * derive.js — every computed value on the panel, and nothing else.
 *
 * These are the four derivations the spec names, implemented exactly, and each
 * one labelled DERIVED by construction. They are pure functions over fields, so
 * they can be tested without a browser, a sensor or a network — which is the
 * only way to prove that a missing input produces FAIL rather than a plausible
 * number.
 *
 * THE HOUSE RULE, in one line: if an input is missing, the output is FAIL and
 * it names the input. There is no branch anywhere in this file that supplies a
 * value the inputs did not contain.
 */

import { derived, fail, isUsable, makeField, worstOf } from './provenance.js';
import { G0, degToRad, msToFpm, mToFt, pressureAltitudeOffsetFt, radToDeg, tasToCas, wrap360 } from './units.js';

/** Below this groundspeed, angle of attack is not a meaningful quantity. */
export const AOA_MIN_GROUNDSPEED_KT = 20;

/**
 * Build the output field from the inputs' verdict.
 *
 * THE PROVENANCE IS CARRIED EXPLICITLY, not encoded in the timestamp. The first
 * version stamped every derived value with its OLDEST input's time, reasoning
 * that stamping it "now" would launder a stale input into a fresh-looking
 * output. That reasoning was wrong, and it broke the altimeter outright: a METAR
 * observation is always several minutes old, indicated altitude's freshness
 * window is 60 seconds, so indicated and pressure altitude aged out the instant
 * they were computed and could never be shown at all. Noah's first screenshot
 * said "no update for 806s (limit 60s)" — 806 seconds being exactly the age of
 * the observation it was derived from.
 *
 * Nothing is laundered by stamping the computation time, because each input is
 * ALREADY aged against its OWN window by the store, and worstOf propagates that
 * verdict here. A stale METAR makes this STALE through `provenance`, which the
 * store then honours via forcedStale. The timestamp now answers the question it
 * should: "is this derivation still running?"
 */
const mk = (value, meta, unit) => {
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit });
  return makeField({
    value,
    unit,
    provenance: meta.provenance === 'STALE' ? 'STALE' : 'DERIVED',
    at: meta.at,
    ageMs: 0,
    reason: meta.reason,
  });
};

/**
 * Mean-sea-level altitude from the GPS geometric altitude.
 *
 *   MSL = geometric altitude - geoid separation
 *
 * The geoid term is NOT optional and is NOT approximated. GPS reports height
 * above the WGS84 ellipsoid on some platforms and above the geoid on others,
 * and the separation in this region is around -100 ft — comfortably enough to
 * matter, and exactly the kind of "reasonable default" v1 forbids. Without a
 * real separation this returns FAIL and says why; it does not quietly assume
 * the platform already applied it.
 */
export function mslAltitude({ geometricFt, geoidSeparationFt }) {
  const meta = worstOf({ 'GPS altitude': geometricFt, 'geoid separation': geoidSeparationFt });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'ft' });
  return mk(geometricFt.value - geoidSeparationFt.value, meta, 'ft');
}

/**
 * Indicated altitude — what a barometric altimeter would read with the pilot's
 * Kollsman setting dialled in, standing in the pressure field the nearest
 * reporting station is measuring.
 *
 *   indicated = MSL + [offset(station setting) - offset(dialled setting)]
 *
 * With the dialled setting equal to the station's, that bracket is zero and the
 * altimeter indicates true MSL — which is the whole point of setting it. Dial
 * something else and the reading moves exactly as a real altimeter's would,
 * which is what makes the Kollsman window a real control rather than a label.
 *
 * Requires a station altimeter setting. Without one there is no pressure field
 * to indicate against, so this FAILs and the ATIS page's 29.92 fallback governs
 * the tape instead — flagged, with the reason shown.
 */
export function indicatedAltitude({ mslFt, kollsmanInHg, stationAltimeterInHg }) {
  const meta = worstOf({
    'MSL altitude': mslFt,
    'altimeter setting': kollsmanInHg,
    'station altimeter': stationAltimeterInHg,
  });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'ft' });

  const dialled = pressureAltitudeOffsetFt(kollsmanInHg.value);
  const station = pressureAltitudeOffsetFt(stationAltimeterInHg.value);
  if (dialled === null || station === null) return fail('altimeter setting is not a usable pressure', { unit: 'ft' });

  return mk(mslFt.value + (station - dialled), meta, 'ft');
}

/**
 * Pressure altitude — altitude in the standard atmosphere. Independent of what
 * the pilot has dialled: it is MSL corrected by the ACTUAL pressure field, which
 * is what the airspeed and density computations need.
 */
export function pressureAltitude({ mslFt, stationAltimeterInHg }) {
  const meta = worstOf({ 'MSL altitude': mslFt, 'station altimeter': stationAltimeterInHg });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'ft' });

  const offset = pressureAltitudeOffsetFt(stationAltimeterInHg.value);
  if (offset === null) return fail('altimeter setting is not a usable pressure', { unit: 'ft' });
  return mk(mslFt.value + offset, meta, 'ft');
}

/**
 * True airspeed — the GPS groundspeed vector minus the modelled wind vector at
 * the current altitude.
 *
 * Wind direction from a weather feed is the direction the wind blows FROM,
 * which is 180 degrees from the vector it contributes. Getting that backwards
 * doubles the wind instead of removing it, and the result still looks like an
 * airspeed.
 */
export function trueAirspeed({ groundspeedKt, trackDegTrue, windDirDegFrom, windSpeedKt }) {
  const meta = worstOf({
    groundspeed: groundspeedKt,
    track: trackDegTrue,
    'wind direction': windDirDegFrom,
    'wind speed': windSpeedKt,
  });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'kt' });

  const trackRad = degToRad(trackDegTrue.value);
  const gE = groundspeedKt.value * Math.sin(trackRad);
  const gN = groundspeedKt.value * Math.cos(trackRad);

  const towardRad = degToRad(wrap360(windDirDegFrom.value + 180));
  const wE = windSpeedKt.value * Math.sin(towardRad);
  const wN = windSpeedKt.value * Math.cos(towardRad);

  const aE = gE - wE;
  const aN = gN - wN;
  const tas = Math.hypot(aE, aN);
  const heading = wrap360(radToDeg(Math.atan2(aE, aN)));

  const field = mk(tas, meta, 'kt');
  // The air-mass heading falls out of the same subtraction and is worth
  // keeping: it is the only true-heading estimate this app has that does not
  // go through the magnetometer.
  return Object.freeze({ ...field, airHeadingDegTrue: field.provenance === 'FAIL' ? null : heading });
}

/** Calibrated airspeed, back-converted from TAS using pressure altitude and OAT. */
export function calibratedAirspeed({ tasKt, pressureAltFt, oatC }) {
  const meta = worstOf({ TAS: tasKt, 'pressure altitude': pressureAltFt, OAT: oatC });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'kt' });

  const cas = tasToCas(tasKt.value, { pressureAltFt: pressureAltFt.value, oatC: oatC.value });
  if (cas === null) return fail('airspeed conversion had no usable atmosphere', { unit: 'kt' });
  return mk(cas, meta, 'kt');
}

/**
 * Angle of attack — pitch minus the GPS flight-path angle.
 *
 * FORCED TO FAIL BELOW 20 KT GROUNDSPEED, as specified: the flight-path angle
 * is atan(vertical speed / groundspeed) and at a standstill that is a division
 * by nearly nothing, so the number becomes enormous and meaningless. This is
 * the one place in the app where a real computation is refused on purpose, and
 * the reason is shown rather than the gauge simply going quiet.
 */
export function angleOfAttack({ pitchDeg, groundspeedKt, verticalSpeedFpm }) {
  const meta = worstOf({ pitch: pitchDeg, groundspeed: groundspeedKt, 'vertical speed': verticalSpeedFpm });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'deg' });

  if (groundspeedKt.value < AOA_MIN_GROUNDSPEED_KT) {
    return fail(`groundspeed below ${AOA_MIN_GROUNDSPEED_KT} kt — flight path angle is undefined`, { unit: 'deg' });
  }

  // Both legs in the same units: feet per minute. One knot is 6076.115 ft/h,
  // so 101.27 ft/min — the conversion is written out because getting it wrong
  // scales the flight-path angle by 60 and still produces a believable number.
  const groundFpm = (groundspeedKt.value * 6076.115) / 60;
  const fpaDeg = radToDeg(Math.atan2(verticalSpeedFpm.value, groundFpm));
  return mk(pitchDeg.value - fpaDeg, meta, 'deg');
}

/**
 * BANK ANGLE FROM A TURN — the one attitude ADS-B lets us honestly recover.
 *
 * ADS-B broadcasts no attitude at all. But an aircraft in a COORDINATED turn is
 * doing textbook physics: the horizontal component of lift supplies the
 * centripetal force, so
 *
 *     tan(bank) = V x omega / g
 *
 * with V the true velocity and omega the rate of turn in radians per second.
 * Both are measured — the velocity is broadcast, and omega is the rate of
 * change of the broadcast track. Nothing is assumed except coordination, and
 * airliners are coordinated: an autopilot holds the ball centred far better
 * than a person does.
 *
 * PITCH IS NOT RECOVERABLE THIS WAY AND MUST NOT BE FAKED. What vertical rate
 * and groundspeed give is FLIGHT PATH ANGLE, which is a different quantity —
 * an aircraft at 5 degrees nose-up in level flight has a flight path angle of
 * zero. `angleOfAttack` above is precisely the difference between them, which
 * is the clearest possible statement that they are not interchangeable.
 *
 * The coordination assumption is stated on the field so it reaches the screen
 * rather than living only here.
 */
export function bankAngle({ groundspeedKt, turnRateDegPerSec }) {
  const meta = worstOf({ groundspeed: groundspeedKt, 'turn rate': turnRateDegPerSec });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'deg' });

  // Below a walking pace the formula divides a real turn rate by nearly no
  // velocity and returns an enormous bank for an aircraft on a taxiway.
  if (groundspeedKt.value < AOA_MIN_GROUNDSPEED_KT) {
    return fail(`groundspeed below ${AOA_MIN_GROUNDSPEED_KT} kt — bank cannot be inferred from a ground track`, {
      unit: 'deg',
    });
  }

  const vMs = (groundspeedKt.value * 1852) / 3600;
  const omega = degToRad(turnRateDegPerSec.value);
  const bank = radToDeg(Math.atan2(vMs * omega, G0));
  const field = mk(bank, meta, 'deg');
  return makeField({
    ...field,
    reason: field.reason ?? 'inferred from the rate of turn, assuming coordinated flight',
  });
}

/**
 * Load factor in a coordinated turn: n = 1 / cos(bank).
 *
 * The same physics as above, read the other way round, and the same single
 * assumption. Worth having because a G-meter driven by the DEVICE's
 * accelerometer while the panel is following a distant aircraft would be
 * showing the desk it is sitting on.
 */
export function loadFactorFromBank({ bankDeg }) {
  const meta = worstOf({ bank: bankDeg });
  if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'g' });
  const c = Math.cos(degToRad(bankDeg.value));
  // Past 90 degrees of bank the expression flips sign and then diverges. An
  // airliner does not do this; a corrupt broadcast might.
  if (!(Math.abs(c) > 0.02)) return fail('bank past 88 degrees — load factor is not meaningful', { unit: 'g' });
  const field = mk(1 / Math.abs(c), meta, 'g');
  return makeField({ ...field, reason: field.reason ?? 'from the inferred bank, assuming coordinated flight' });
}

/**
 * Rate of turn from two successive track readings, degrees per second.
 *
 * Kept as a factory holding the previous sample, exactly like the VSI, because
 * a rate needs two observations and the second one has to remember the first.
 */
export function createTurnRate({ maxGapMs = 30_000, minGapMs = 900 } = {}) {
  let lastTrack = null;
  let lastAt = null;

  return {
    reset() {
      lastTrack = null;
      lastAt = null;
    },
    /** @param trackField a DEGREES-TRUE track field; @param at its timestamp */
    read(trackField, at) {
      if (!isUsable(trackField)) {
        lastTrack = null;
        lastAt = null;
        return fail(trackField?.reason ?? 'no track', { unit: 'deg/s' });
      }
      const track = trackField.value;
      if (lastAt === null) {
        lastTrack = track;
        lastAt = at;
        return fail('waiting for a second track reading to measure a rate', { unit: 'deg/s' });
      }
      const dt = (at - lastAt) / 1000;
      // Too soon and the quotient is dominated by the broadcast's own rounding;
      // too late and we would be averaging across a manoeuvre we cannot see.
      if (dt * 1000 < minGapMs) return fail('waiting for a second track reading to measure a rate', { unit: 'deg/s' });
      if (dt * 1000 > maxGapMs) {
        lastTrack = track;
        lastAt = at;
        return fail(`no track for ${Math.round(dt)}s — the rate of turn would span the gap`, { unit: 'deg/s' });
      }

      // The SHORT way round the compass. Differencing raw degrees turns a
      // 359 -> 001 crossing into a 358 deg/s rate and a 90 degree bank.
      const delta = ((track - lastTrack + 540) % 360) - 180;
      lastTrack = track;
      lastAt = at;
      return derived(delta / dt, { unit: 'deg/s', at });
    },
  };
}

/**
 * Vertical speed — a complementary filter of differentiated GPS altitude
 * against integrated vertical acceleration. NEITHER ALONE, as specified:
 *
 *   - Differentiated GPS altitude is honest but lags 2-5 seconds, so on its own
 *     the needle reports the climb you were in, not the one you are in.
 *   - Integrated vertical acceleration is instant and drifts without bound, so
 *     on its own it reads a steady climb while sitting on the ramp.
 *
 * Requires BOTH. If either is missing the result is FAIL, because a VSI running
 * on one of them is a different and worse instrument wearing this one's label.
 */
/**
 * Past this, a vertical speed is not a reading — it is a broken integrator.
 *
 * Noah's iPad reported 344,570 fpm. The cause was upstream (a horizon ninety
 * degrees over made the "vertical" projection read a horizontal axis, so
 * gravity leaked into the integrator at 9.8 m/s^2 and it ran away) and that
 * cause is fixed — but an instrument that CAN display three hundred thousand
 * feet per minute should not, whatever is feeding it. Twenty thousand is far
 * beyond an airliner's four and this app's six-thousand full scale, so nothing
 * real is refused; it catches only runaway.
 */
export const VSI_ABSURD_FPM = 20_000;

export function createVsi({ tau = 3, maxGapMs = 5000 } = {}) {
  let rateFpm = null;
  let lastAltFt = null;
  let lastAltAt = null;
  let lastAccelAt = null;
  let stationaryAt = null;
  let reason = 'no altitude samples yet';

  const reset = (why = 'vertical speed filter reset') => {
    rateFpm = null;
    lastAltFt = null;
    lastAltAt = null;
    lastAccelAt = null;
    stationaryAt = null;
    reason = why;
  };

  return {
    reset,
    /**
     * ZERO-VELOCITY UPDATE (ZUPT), which is what every inertial system does
     * about exactly this and what this filter was missing.
     *
     * A wiggle is bounded oscillation with no net displacement, but an
     * integrator cannot tell it from the start of a climb — so a shaken desk
     * accrued vertical speed and the instrument crossed itself out. The
     * standard answer is not a better integrator: it is to USE the independent
     * evidence that the device is not translating. The attitude filter already
     * detects stillness from gyro rate and gravity magnitude, so when it says
     * still, the vertical velocity IS zero and the integrator is told so.
     *
     * This is the same correction a pedestrian dead-reckoning system applies at
     * every footfall. It is not a special case for a desk — a parked aeroplane
     * gets it too, and correctly reads zero rather than drifting.
     */
    setStationary(isStationary, at) {
      if (!isStationary) {
        stationaryAt = null;
        return;
      }
      rateFpm = 0;
      lastAccelAt = at;
      reason = null;
      stationaryAt = at;
    },

    /** Integrate the vertical accelerometer forward. Fast, drifts. */
    updateAccel(verticalAccelMs2, at) {
      if (!Number.isFinite(verticalAccelMs2)) return;
      if (lastAccelAt === null) {
        lastAccelAt = at;
        return;
      }
      const dt = (at - lastAccelAt) / 1000;
      lastAccelAt = at;
      if (!(dt > 0) || dt > 0.5) return;
      if (rateFpm === null) return;
      rateFpm += msToFpm(verticalAccelMs2 * dt);
    },

    /** Correct toward the differentiated GPS altitude. Slow, honest. */
    updateAltitude(altitudeFt, at) {
      if (!Number.isFinite(altitudeFt)) return;
      if (lastAltFt === null || lastAltAt === null) {
        lastAltFt = altitudeFt;
        lastAltAt = at;
        reason = 'converging';
        return;
      }
      const dt = (at - lastAltAt) / 1000;
      if (!(dt > 0)) return;
      if (at - lastAltAt > maxGapMs) {
        // A gap this long means the fix stopped arriving. Differencing across
        // it produces a spike that reads as a 6000 fpm dive.
        lastAltFt = altitudeFt;
        lastAltAt = at;
        reason = 'position fix gap — filter restarted';
        rateFpm = null;
        return;
      }

      const gpsRate = ((altitudeFt - lastAltFt) / dt) * 60;
      lastAltFt = altitudeFt;
      lastAltAt = at;

      if (rateFpm === null) {
        rateFpm = gpsRate;
        reason = null;
        return;
      }
      const k = Math.min(1, dt / tau);
      rateFpm += k * (gpsRate - rateFpm);
      reason = null;
    },

    read({ altitudeField, verticalAccelField }) {
      // STATIONARY SHORT-CIRCUIT, and it deliberately does NOT consult GPS
      // altitude. When the motion sensors say the device is not translating,
      // they are the evidence for zero — a fix that stopped arriving cannot
      // make a stationary device's vertical speed unknown, and inheriting that
      // fix's provenance is what crossed this instrument out on a desk.
      if (stationaryAt !== null) {
        const still = worstOf({ 'vertical acceleration': verticalAccelField });
        if (still.provenance !== 'FAIL') {
          return mk(0, { ...still, reason: 'stationary — the device is not moving vertically' }, 'fpm');
        }
      }
      const meta = worstOf({ 'GPS altitude': altitudeField, 'vertical acceleration': verticalAccelField });
      if (meta.provenance === 'FAIL') return fail(meta.reason, { unit: 'fpm' });
      if (rateFpm === null) return fail(reason ?? 'vertical speed filter has not converged', { unit: 'fpm' });
      if (Math.abs(rateFpm) > VSI_ABSURD_FPM) {
        // Reset as well as refuse: leaving the integrator at a runaway value
        // means it stays there, and the instrument is crossed out for ever
        // rather than recovering once the vertical reference comes back.
        const runaway = rateFpm;
        rateFpm = null;
        lastAltFt = null;
        lastAltAt = null;
        reason = 'vertical speed ran away — the vertical reference was wrong; re-converging';
        return fail(
          `vertical speed reached ${Math.round(runaway).toLocaleString()} fpm, which is not a real climb — the filter has been reset`,
          { unit: 'fpm' },
        );
      }
      return mk(rateFpm, meta, 'fpm');
    },
  };
}

/** Convenience for the panels: is this field showing a number right now? */
export { isUsable, mToFt };

/**
 * ZERO IS A MEASUREMENT, AND THIS SECTION EXISTS BECAUSE IT WAS TREATED AS A GAP.
 *
 * `coords.speed` is null on a stationary iOS receiver, and the panel crossed
 * groundspeed out with the reason "stationary, OR the platform does not report
 * it". That reason names its own defect: it could not tell the two apart, and
 * did not try — while holding two position fixes and a clock, which is all a
 * groundspeed has ever needed.
 *
 * A receiver that is not moving HAS a groundspeed. It is zero, it traces
 * entirely to the sensor, and refusing to say so is not honesty — it is a panel
 * declining to report a measurement it is holding. The doctrine's rule is
 * against values that come from NEITHER a sensor nor a feed. A difference of
 * two fixes comes from the sensor.
 */

/** WGS-84 mean radius, metres. */
const EARTH_R_M = 6_371_008.8;

/**
 * Metres between two fixes.
 *
 * Equirectangular rather than haversine on purpose: over the metres-to-hundreds
 * of metres a fix moves between samples the two agree far inside the receiver's
 * own accuracy, and this one cannot lose precision to catastrophic cancellation
 * the way haversine does at short range.
 */
export function metresBetween(a, b) {
  const dLat = degToRad(b.lat - a.lat);
  const dLon = degToRad(b.lon - a.lon) * Math.cos(degToRad((a.lat + b.lat) / 2));
  return Math.hypot(dLat, dLon) * EARTH_R_M;
}

/**
 * Groundspeed differenced from two consecutive fixes, with the resolution that
 * differencing can actually claim.
 *
 * THE FLOOR IS THE HONEST PART. Each fix carries its own accuracy, so their
 * difference carries both added in quadrature; divided by the interval that is
 * the smallest speed distinguishable from the receiver standing still. Below
 * it, the measurement is zero — not "unknown", and not the noise value, which
 * would be a number invented by jitter.
 */
export function groundspeedFromFixes(prev, next, { maxGapS = 30 } = {}) {
  if (!prev || !next) return null;
  const dt = (next.at - prev.at) / 1000;
  if (!(dt > 0)) return null;
  // Differencing across a long gap is the same error the VSI makes across a
  // dropped fix: the aircraft may have gone anywhere in between, and a straight
  // line between the endpoints is not the path it took. Returning null crosses
  // the instrument out honestly rather than averaging over a hole.
  if (dt > maxGapS) return null;
  const speedMs = metresBetween(prev, next) / dt;
  const floorMs = Math.hypot(prev.accuracy ?? 0, next.accuracy ?? 0) / dt;
  return { speedMs, floorMs, dt, moving: speedMs > floorMs };
}
