/**
 * orientation.js — device attitude and the earth-referenced heading.
 *
 * HEADING IS PLATFORM-BRANCHED, BY MECHANISM. Three different platforms expose
 * an absolute heading three different ways and none of them is detectable from
 * a user-agent string:
 *
 *   iOS      `webkitCompassHeading` on a plain `deviceorientation` event
 *   Android  `deviceorientationabsolute`, whose alpha is earth-referenced
 *   Chromium `AbsoluteOrientationSensor` from the Generic Sensor API
 *
 * A plain `deviceorientation` alpha is NOT a compass anywhere: it is relative
 * to wherever the device happened to be when listening started. Treating it as
 * a heading gives a needle that is smooth, responsive and wrong, which is worse
 * than no needle at all. If none of the three mechanisms is present, heading is
 * FAIL and BITE says which of them was missing.
 */

import { needsOrientationPermission } from '../core/capability.js';

const screenAngle = () => {
  if (typeof screen !== 'undefined' && screen.orientation && Number.isFinite(screen.orientation.angle)) {
    return screen.orientation.angle;
  }
  if (typeof window !== 'undefined' && Number.isFinite(window.orientation)) return window.orientation;
  return 0;
};

export function createOrientationSensor({ state, fusion, clock = () => Date.now() }) {
  let listening = false;
  let absoluteSensor = null;
  let headingMechanism = null;
  let teardown = [];

  const onOrientation = (event) => {
    const at = clock();
    const { beta, gamma, alpha } = event;

    if (Number.isFinite(beta)) state.write('orientation.beta', beta, { at });
    else state.fail('orientation.beta', 'orientation event carried no beta');

    if (Number.isFinite(gamma)) state.write('orientation.gamma', gamma, { at });
    else state.fail('orientation.gamma', 'orientation event carried no gamma');

    // iOS: webkitCompassHeading is degrees clockwise from MAGNETIC north and is
    // the only earth-referenced value in this event on that platform.
    if (Number.isFinite(event.webkitCompassHeading)) {
      headingMechanism = 'iOS webkitCompassHeading';
      state.write('orientation.compass', event.webkitCompassHeading, { at });
      fusion.updateHeading(event.webkitCompassHeading, at);
      return;
    }

    // Android/Chromium: only the `absolute` event's alpha is earth-referenced.
    // alpha counts anticlockwise from east-of-north, so the compass heading is
    // 360 - alpha; using alpha directly gives a needle that turns the wrong way.
    if (event.absolute === true && Number.isFinite(alpha)) {
      headingMechanism = 'deviceorientationabsolute alpha';
      const heading = (360 - alpha) % 360;
      state.write('orientation.compass', heading, { at });
      fusion.updateHeading(heading, at);
    }
  };

  const onAbsolute = (event) => {
    // Delivered with absolute === true; share the one handler so the two paths
    // cannot drift apart.
    onOrientation(event);
  };

  const startAbsoluteSensor = () => {
    if (typeof window === 'undefined' || typeof window.AbsoluteOrientationSensor !== 'function') return false;
    try {
      absoluteSensor = new window.AbsoluteOrientationSensor({ frequency: 30, referenceFrame: 'device' });
      absoluteSensor.addEventListener('reading', () => {
        const q = absoluteSensor.quaternion;
        if (!q) return;
        const at = clock();
        // Quaternion -> yaw about the earth vertical.
        const [x, y, z, w] = q;
        const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
        const heading = (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
        headingMechanism = 'AbsoluteOrientationSensor';
        state.write('orientation.compass', heading, { at });
        fusion.updateHeading(heading, at);
      });
      absoluteSensor.addEventListener('error', (e) => {
        state.fail('orientation.compass', `AbsoluteOrientationSensor: ${e.error?.name ?? 'error'}`);
      });
      absoluteSensor.start();
      teardown.push(() => absoluteSensor?.stop());
      return true;
    } catch (err) {
      // Permissions-Policy or a missing sensor throws on construction. That is
      // a real answer, not an exception to swallow.
      state.fail('orientation.compass', `AbsoluteOrientationSensor unavailable: ${err.message}`);
      return false;
    }
  };

  return {
    get mechanism() {
      return headingMechanism;
    },

    /**
     * Ask for permission where the platform requires it. MUST be called from a
     * user gesture on iOS — the PANEL POWER control is that gesture.
     */
    async requestPermission() {
      if (!needsOrientationPermission()) return 'granted';
      try {
        return await DeviceOrientationEvent.requestPermission();
      } catch (err) {
        return `error: ${err.message}`;
      }
    },

    start() {
      if (listening) return;
      if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
        state.fail('orientation.beta', 'DeviceOrientationEvent not implemented by this browser');
        state.fail('orientation.gamma', 'DeviceOrientationEvent not implemented by this browser');
        state.fail('orientation.compass', 'DeviceOrientationEvent not implemented by this browser');
        return;
      }
      listening = true;

      window.addEventListener('deviceorientation', onOrientation, true);
      teardown.push(() => window.removeEventListener('deviceorientation', onOrientation, true));

      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', onAbsolute, true);
        teardown.push(() => window.removeEventListener('deviceorientationabsolute', onAbsolute, true));
      } else if (!startAbsoluteSensor()) {
        // Neither absolute mechanism exists. iOS still supplies
        // webkitCompassHeading through the plain event, so we wait for one
        // before declaring failure — but we do not wait forever.
        setTimeout(() => {
          if (!headingMechanism) {
            state.fail(
              'orientation.compass',
              'no earth-referenced heading: no webkitCompassHeading, no deviceorientationabsolute, no AbsoluteOrientationSensor',
            );
          }
        }, 3000);
      }
    },

    /** Screen orientation angle, needed to map sensor axes onto what the pilot
     *  sees. Read live rather than captured once: a device rotated after boot
     *  otherwise reports an attitude rotated by 90 degrees for ever. */
    screenAngle,

    stop() {
      listening = false;
      for (const fn of teardown.splice(0)) {
        try {
          fn();
        } catch {
          /* a listener that was never attached is not an error worth raising */
        }
      }
      absoluteSensor = null;
    },
  };
}
