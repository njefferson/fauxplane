/**
 * ambient.js — panel dimming, with the two declared fallbacks.
 *
 *   1. AmbientLightSensor          (Chromium on Android, behind a permission)
 *   2. camera frame luminance      (anywhere with getUserMedia — OPT IN ONLY)
 *   3. computed solar elevation    (anywhere, from position and clock)
 *
 * The camera fallback is deliberately NOT started automatically. Turning on a
 * camera to read the brightness of a room is a surprising thing for a panel to
 * do, and Doctrine §1 makes "nothing leaves the device, nothing starts without
 * asking" the product's identity rather than a setting. It is offered on the
 * BITE page as an explicit control.
 *
 * The solar-elevation fallback is a COMPUTATION over the position fix and the
 * clock, both of which are real inputs, so it is DERIVED and not synthetic. It
 * is not a light reading and never claims to be — it drives dimming only, and
 * dimming is the one place on this panel where being approximately right is
 * the whole requirement.
 */

import { degToRad, radToDeg } from '../core/units.js';

/**
 * Solar elevation in degrees, from the NOAA low-precision equations.
 * Accurate to a fraction of a degree — far beyond what dimming needs, and it
 * costs nothing over a cruder model.
 */
export function solarElevationDeg({ lat, lon, date }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(date instanceof Date)) return null;

  const julian = date.getTime() / 86400000 + 2440587.5;
  const n = julian - 2451545.0;
  const meanLong = (280.46 + 0.9856474 * n) % 360;
  const meanAnom = degToRad((357.528 + 0.9856003 * n) % 360);
  const eclipticLong = degToRad(meanLong + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom));
  const obliquity = degToRad(23.439 - 0.0000004 * n);

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLong));
  let rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLong), Math.cos(eclipticLong));

  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lmstDeg = (gmst * 15 + lon + 360) % 360;
  const hourAngle = degToRad(((lmstDeg - radToDeg(rightAscension)) % 360 + 540) % 360 - 180);

  const latRad = degToRad(lat);
  const sinEl =
    Math.sin(latRad) * Math.sin(declination) + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  return radToDeg(Math.asin(Math.max(-1, Math.min(1, sinEl))));
}

/**
 * Map a light level to a panel brightness multiplier.
 *
 * Floored at 0.45 rather than at zero. A cockpit panel that can dim itself to
 * unreadable in the dark has failed at the only job dimming has, and the floor
 * is what keeps every contrast pair the accessibility gate measured still valid
 * at the dimmest setting. This floor is asserted in the gate, not just here.
 */
export const DIM_FLOOR = 0.45;

export function brightnessFromLux(lux) {
  if (!Number.isFinite(lux)) return null;
  const t = Math.log10(Math.max(1, lux)) / 4; // 1 lx -> 0, 10 000 lx -> 1
  return DIM_FLOOR + (1 - DIM_FLOOR) * Math.max(0, Math.min(1, t));
}

export function brightnessFromSolarElevation(deg) {
  if (!Number.isFinite(deg)) return null;
  // -6 deg is civil twilight; +10 and above is unambiguous daylight.
  const t = (deg + 6) / 16;
  return DIM_FLOOR + (1 - DIM_FLOOR) * Math.max(0, Math.min(1, t));
}

export function createAmbientSensor({ state, clock = () => Date.now() }) {
  let sensor = null;
  let mechanism = null;

  return {
    get mechanism() {
      return mechanism;
    },

    start() {
      if (typeof window !== 'undefined' && typeof window.AmbientLightSensor === 'function') {
        try {
          sensor = new window.AmbientLightSensor({ frequency: 1 });
          sensor.addEventListener('reading', () => {
            mechanism = 'AmbientLightSensor';
            state.write('ambient.lux', sensor.illuminance, { at: clock() });
          });
          sensor.addEventListener('error', (e) => {
            state.fail('ambient.lux', `AmbientLightSensor: ${e.error?.name ?? 'error'}`);
          });
          sensor.start();
          return;
        } catch (err) {
          state.fail('ambient.lux', `AmbientLightSensor unavailable: ${err.message}`);
        }
      } else {
        state.fail('ambient.lux', 'no AmbientLightSensor on this platform — dimming falls back to solar elevation');
      }
    },

    /**
     * Brightness for the panel right now, and where the number came from. The
     * caller shows the mechanism, because "why did my panel just dim" must be
     * answerable.
     */
    brightness(fields) {
      const lux = fields['ambient.lux'];
      if (lux && lux.provenance !== 'FAIL') {
        const b = brightnessFromLux(lux.value);
        if (b !== null) return { value: b, from: 'ambient light sensor' };
      }
      const lat = fields['position.lat'];
      const lon = fields['position.lon'];
      if (lat?.provenance !== 'FAIL' && lon?.provenance !== 'FAIL' && lat && lon) {
        const el = solarElevationDeg({ lat: lat.value, lon: lon.value, date: new Date(clock()) });
        const b = brightnessFromSolarElevation(el);
        if (b !== null) return { value: b, from: 'computed solar elevation' };
      }
      // No light sensor and no position. Full brightness is not a reading and
      // is not claimed to be one — it is the safe state for an instrument
      // panel, and the caller labels it.
      return { value: 1, from: null };
    },

    stop() {
      try {
        sensor?.stop();
      } catch {
        /* stopping a sensor that never started is not a failure */
      }
      sensor = null;
    },
  };
}
