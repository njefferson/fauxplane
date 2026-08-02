/**
 * magnetometer.js — the magnetic side of heading: the raw sensor where one is
 * exposed, and the true/magnetic conversion.
 *
 * A compass reads MAGNETIC north. A GPS track is referenced to TRUE north.
 * Putting both on one heading tape without the declination between them puts
 * the track bug about 13 degrees off in this region — a difference small enough
 * to look like instrument error and large enough to matter.
 *
 * So the conversion is a real derivation with a real input, and where that
 * input is missing (no WMM coefficients bundled — see data/wmm.js) it FAILS
 * rather than assuming zero declination. Assuming zero is assuming you are
 * somewhere in a band through the middle of the Pacific.
 */

import { DEGRADED, FAILED, PASS } from '../core/capability.js';
import { wrap360 } from '../core/units.js';

/** True heading from a magnetic heading and the local declination (east +). */
export function magneticToTrue(headingMagnetic, declinationDeg) {
  if (!Number.isFinite(headingMagnetic) || !Number.isFinite(declinationDeg)) return null;
  return wrap360(headingMagnetic + declinationDeg);
}

/** Magnetic heading from a true heading and the local declination (east +). */
export function trueToMagnetic(headingTrue, declinationDeg) {
  if (!Number.isFinite(headingTrue) || !Number.isFinite(declinationDeg)) return null;
  return wrap360(headingTrue - declinationDeg);
}

/**
 * Probe the raw Magnetometer sensor. This is NOT the heading source — the
 * heading comes from orientation.js, which uses whichever earth-referenced
 * mechanism the platform has. This probe exists so BITE can tell a pilot
 * whether there is a magnetometer at all, which is the difference between
 * "your compass is wrong" and "this device has no compass".
 */
export function probeMagnetometer() {
  if (typeof window === 'undefined') return { status: FAILED, reason: 'no window' };
  if (typeof window.Magnetometer === 'function') {
    return { status: PASS, reason: 'Magnetometer (Generic Sensor API) present' };
  }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    return { status: PASS, reason: 'no raw Magnetometer API; iOS exposes the compass through webkitCompassHeading' };
  }
  if ('ondeviceorientationabsolute' in window) {
    return { status: PASS, reason: 'no raw Magnetometer API; heading comes from deviceorientationabsolute' };
  }
  return { status: DEGRADED, reason: 'no magnetometer and no earth-referenced orientation — heading will read FAIL' };
}
