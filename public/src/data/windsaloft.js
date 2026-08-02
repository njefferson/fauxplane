/**
 * windsaloft.js — the modelled wind and temperature at the aircraft's altitude.
 *
 * Open-Meteo reports on PRESSURE levels; an aircraft flies at an ALTITUDE. The
 * bridge is the geopotential height of each level, which the Pages Function
 * fetches alongside the wind, so the interpolation runs against today's
 * atmosphere rather than a standard-atmosphere table.
 *
 * WIND IS INTERPOLATED AS A VECTOR, not as a direction and a speed. Averaging
 * 350 degrees and 10 degrees gives 180 — a wind from the south, between two
 * winds from the north. The vector form has no seam, and this is the exact bug
 * that makes a headwind read as a tailwind on one flight in twenty.
 *
 * OUT OF RANGE IS FAIL, NOT CLAMPED. An aircraft above the highest level
 * returned has no wind data, and saying so is the whole discipline here. A
 * clamped value is a synthetic reading wearing the top level's clothes.
 */

import { degToRad, mToFt, radToDeg, wrap360 } from '../core/units.js';

const WIND_FIELDS = ['winds.vector', 'winds.oat'];

/**
 * Interpolate the wind vector and temperature onto an altitude.
 * Pure and exported so the seam behaviour can be tested directly.
 */
export function interpolateLevels(levels, altitudeFt) {
  if (!Array.isArray(levels) || levels.length === 0) return { reason: 'no pressure levels available' };
  if (!Number.isFinite(altitudeFt)) return { reason: 'no altitude to interpolate onto' };

  const usable = levels
    .filter(
      (l) =>
        Number.isFinite(l.geopotentialHeightM) &&
        Number.isFinite(l.windSpeedKt) &&
        Number.isFinite(l.windDirDeg) &&
        Number.isFinite(l.temperatureC),
    )
    .map((l) => ({ ...l, heightFt: mToFt(l.geopotentialHeightM) }))
    .sort((a, b) => a.heightFt - b.heightFt);

  if (usable.length === 0) return { reason: 'no pressure level carried a complete wind and temperature' };

  const lo = usable[0];
  const hi = usable[usable.length - 1];
  if (altitudeFt < lo.heightFt - 1500) {
    return { reason: `altitude ${Math.round(altitudeFt)} ft is below the lowest reported level (${Math.round(lo.heightFt)} ft)` };
  }
  if (altitudeFt > hi.heightFt) {
    return { reason: `altitude ${Math.round(altitudeFt)} ft is above the highest reported level (${Math.round(hi.heightFt)} ft)` };
  }

  // Below the lowest level but within 1500 ft of it, the lowest level IS the
  // answer — that band is inside the surface layer the 1000 hPa level
  // describes. Beyond it, the refusal above applies.
  if (altitudeFt <= lo.heightFt) {
    return toVector(lo, lo, 0, altitudeFt);
  }

  let a = usable[0];
  let b = usable[usable.length - 1];
  for (let i = 0; i < usable.length - 1; i += 1) {
    if (altitudeFt >= usable[i].heightFt && altitudeFt <= usable[i + 1].heightFt) {
      a = usable[i];
      b = usable[i + 1];
      break;
    }
  }
  const span = b.heightFt - a.heightFt;
  const t = span > 0 ? (altitudeFt - a.heightFt) / span : 0;
  return toVector(a, b, t, altitudeFt);
}

function toVector(a, b, t, altitudeFt) {
  const comp = (l) => {
    // Meteorological direction is where the wind comes FROM; the vector points
    // the other way. Both endpoints are converted the same way, so the
    // interpolation happens in a space with no 360/0 seam in it.
    const toward = degToRad(wrap360(l.windDirDeg + 180));
    return { e: l.windSpeedKt * Math.sin(toward), n: l.windSpeedKt * Math.cos(toward) };
  };
  const va = comp(a);
  const vb = comp(b);
  const e = va.e + (vb.e - va.e) * t;
  const n = va.n + (vb.n - va.n) * t;

  const speedKt = Math.hypot(e, n);
  // Back to a "from" direction for display.
  const dirDeg = wrap360(radToDeg(Math.atan2(e, n)) + 180);
  const temperatureC = a.temperatureC + (b.temperatureC - a.temperatureC) * t;

  return {
    altitudeFt,
    speedKt,
    dirDeg,
    temperatureC,
    between: [a.pressureHpa, b.pressureHpa],
  };
}

export function createWindsSource({ state, fetchImpl = fetch, clock = () => Date.now() }) {
  let payload = null;
  let inFlight = null;
  let lastReason = 'not fetched yet';

  return {
    get last() {
      return payload;
    },
    get reason() {
      return lastReason;
    },

    async refresh(fields) {
      const lat = fields?.['position.lat'];
      const lon = fields?.['position.lon'];
      if (!lat || !lon || lat.provenance === 'FAIL' || lon.provenance === 'FAIL') {
        // Winds aloft are asked for AT A POSITION. Without a fix there is no
        // question to ask — and asking at the home reference would return a
        // real wind for somewhere the aircraft is not.
        lastReason = 'no position fix — winds aloft are position-specific and are not fetched for a surrogate';
        for (const p of WIND_FIELDS) state.fail(p, lastReason);
        return null;
      }
      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          const res = await fetchImpl(`/api/winds?lat=${lat.value.toFixed(3)}&lon=${lon.value.toFixed(3)}`, {
            cache: 'no-store',
          });
          if (!res.ok) {
            let detail = `HTTP ${res.status}`;
            try {
              const body = await res.json();
              if (body?.reason) detail = body.reason;
            } catch {
              /* status alone is still worth reporting */
            }
            lastReason = `winds aloft unavailable: ${detail}`;
            return null;
          }
          payload = await res.json();
          lastReason = null;
          return payload;
        } catch (err) {
          lastReason = `winds aloft fetch failed: ${err.message}`;
          return null;
        }
      })().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },

    /** Push the wind at the current altitude into the store. Called on each
     *  altitude update, so the interpolation follows the aircraft rather than
     *  being frozen at whatever altitude the fetch happened at. */
    apply(fields) {
      if (!payload?.levels) {
        for (const p of WIND_FIELDS) state.fail(p, lastReason ?? 'no winds aloft data');
        return;
      }
      const alt = fields['position.altitudeGeometric'];
      if (!alt || alt.provenance === 'FAIL') {
        for (const p of WIND_FIELDS) state.fail(p, 'no altitude — cannot choose a wind level');
        return;
      }

      const solved = interpolateLevels(payload.levels, alt.value);
      if (solved.reason) {
        for (const p of WIND_FIELDS) state.fail(p, solved.reason);
        return;
      }

      // Stamp with the forecast's VALID time, not the fetch time. A one-hour
      // forecast fetched a minute ago is an hour old as data.
      const validAt = payload.validAt ? Date.parse(payload.validAt) : NaN;
      const at = Number.isFinite(validAt) ? validAt : clock();

      state.write('winds.vector', { dirDeg: solved.dirDeg, speedKt: solved.speedKt, betweenHpa: solved.between }, { at });
      state.write('winds.oat', solved.temperatureC, { at });
    },
  };
}
