/**
 * geo.js — GPS position, groundspeed, track and geometric altitude.
 *
 * THE NULL-TRACK RULE, which is specified and is easy to get wrong: at zero
 * groundspeed `coords.heading` is null, because a stationary receiver has no
 * direction of travel to report. The instruction is to fall back to magnetic
 * heading and NOT to blank the display — so this module records the track as
 * unavailable-with-a-reason and the panel substitutes heading explicitly, with
 * the substitution visible. What must never happen is the last known track
 * freezing on screen as though it were current.
 *
 * Altitude is reported as GEOMETRIC altitude and labelled as such. It is not
 * silently treated as MSL: the platforms disagree about the datum, and that
 * disagreement is resolved in derive.js by an explicit geoid term, not here by
 * a hopeful assumption.
 */

import { mToFt, msToKt } from '../core/units.js';

export const GEO_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30000,
});

const POSITION_FIELDS = [
  'position.lat',
  'position.lon',
  'position.accuracy',
  'position.groundspeed',
  'position.track',
  'position.altitudeGeometric',
  'position.altitudeAccuracy',
];

/**
 * `owns` is the ownership gate. It answers "are MY readings the ones the panel
 * wants right now" — false while the panel is following another aircraft, whose
 * broadcast fills these very same fields.
 *
 * Without it both sources write continuously and the panel shows whichever
 * landed last: geolocation fires on its own schedule and the follow source
 * writes at 25 Hz, so the position, groundspeed and altitude would alternate
 * between a desk in Cameron Park and a 737 over the Sierra several times a
 * second. Exactly one source owns a field at a time; that is the contract.
 */
export function createGeoSensor({ state, vsi, onFix = () => {}, owns = () => true, clock = () => Date.now() }) {
  let watchId = null;
  let sawFix = false;
  let lastError = null;

  const onPosition = (position) => {
    // Use the fix's OWN timestamp, not the moment it was handed to us. A fix
    // replayed from the platform's cache is as old as the fix, and ageing it
    // from `now` would relabel stale data as live.
    const at = Number.isFinite(position.timestamp) ? position.timestamp : clock();
    const c = position.coords;
    sawFix = true;

    // The fix is still USED even when it is not written: `onFix` is what wakes
    // the weather feeds on the first fix, and the weather is about where the
    // reader is standing whatever aircraft the panel happens to be following.
    // Only the position FIELDS change hands.
    if (!owns()) {
      if (Number.isFinite(c.altitude)) vsi.updateAltitude(mToFt(c.altitude), at);
      onFix({ lat: c.latitude, lon: c.longitude, at });
      return;
    }
    state.write('position.lat', c.latitude, { at });
    state.write('position.lon', c.longitude, { at });
    state.write('position.accuracy', c.accuracy, { at });

    if (Number.isFinite(c.speed)) state.write('position.groundspeed', msToKt(c.speed), { at });
    else state.fail('position.groundspeed', 'this fix carried no speed (stationary, or the platform does not report it)');

    if (Number.isFinite(c.heading)) {
      state.write('position.track', c.heading, { at });
    } else {
      state.fail('position.track', 'no track over ground — GPS reports none at rest; magnetic heading is shown instead');
    }

    if (Number.isFinite(c.altitude)) {
      state.write('position.altitudeGeometric', mToFt(c.altitude), { at });
      vsi.updateAltitude(mToFt(c.altitude), at);
    } else {
      state.fail('position.altitudeGeometric', 'this fix carried no altitude');
    }

    if (Number.isFinite(c.altitudeAccuracy)) state.write('position.altitudeAccuracy', c.altitudeAccuracy, { at });
    else state.fail('position.altitudeAccuracy', 'this fix carried no altitude accuracy');

    onFix({ lat: c.latitude, lon: c.longitude, at });
  };

  const onError = (err) => {
    // PERMISSION_DENIED 1, POSITION_UNAVAILABLE 2, TIMEOUT 3. Each is a
    // different thing to tell a pilot, so each gets its own sentence.
    const why =
      err.code === 1
        ? 'location permission denied'
        : err.code === 2
          ? 'position unavailable (no GPS fix)'
          : err.code === 3
            ? 'position request timed out'
            : `geolocation error ${err.code}`;
    lastError = why;
    for (const p of POSITION_FIELDS) state.fail(p, why);
  };

  return {
    get sawFix() {
      return sawFix;
    },
    get lastError() {
      return lastError;
    },

    /**
     * Hand this sensor a GeolocationPosition directly.
     *
     * The seam the tests drive, and it is the SAME entry point the browser
     * calls — not a parallel path with its own copy of the logic, which would
     * test something the device never runs. Node has no geolocation, so
     * "a fix arrived while the panel was following an aircraft" is otherwise
     * unreachable, and that is precisely the case where the wrong answer is a
     * panel flickering between a desk and an aeroplane.
     */
    acceptFix(position) {
      onPosition(position);
    },

    start() {
      if (watchId !== null) return;
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        for (const p of POSITION_FIELDS) state.fail(p, 'Geolocation API not available in this browser');
        return;
      }
      try {
        watchId = navigator.geolocation.watchPosition(onPosition, onError, GEO_OPTIONS);
      } catch (err) {
        for (const p of POSITION_FIELDS) state.fail(p, `geolocation refused to start: ${err.message}`);
      }
    },

    stop() {
      if (watchId !== null && navigator?.geolocation) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
  };
}
