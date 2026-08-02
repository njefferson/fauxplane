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

const wrapAngle = (deg) => (((Math.round(deg / 90) * 90) % 360) + 360) % 360;

/**
 * WHICH WAY IS THE SCREEN ROTATED — AND WHY THE MODERN API IS NOT TRUSTED ON
 * iOS.
 *
 * Noah's iPad, Safari 26.5, held in landscape, reported ALL of this at once,
 * from its own diagnostics report:
 *
 *     screen.orientation.angle   0                   "not rotated"
 *     screen.orientation.type    landscape-primary
 *     window.orientation         90                  "rotated a quarter turn"
 *     screen                     820 x 1180          natural shape is PORTRAIT
 *     viewport                   1180 x 688          currently LANDSCAPE
 *
 * The accelerometer axes on that device are portrait-referenced — `screen` says
 * so and the raw vector confirms it — so the honest angle is 90, and
 * `screen.orientation.angle` reporting 0 is simply wrong. The app believed it,
 * applied no rotation, and the horizon sat ninety degrees over.
 *
 * THE RULE, and it is deliberately narrow: where `window.orientation` exists,
 * prefer it. That property is iOS-only — Android Chrome and every desktop
 * removed it years ago — so this reads as "on iOS use the iOS answer, and use
 * the standard one everywhere else", which is exactly the evidence available.
 *
 * WHAT WAS TRIED AND DISCARDED. Deriving the angle by comparing the viewport
 * against `screen`'s natural shape looks more principled and is not: iOS keeps
 * `screen` at the natural dimensions while Android swaps it with the current
 * orientation, so the same comparison means opposite things on the two
 * platforms. Inventing a cross-platform theory from one device's report would
 * be the guess this whole exercise was about avoiding. If an Android or a
 * desktop ever reads ninety out, its report will say so and the rule can widen
 * on evidence.
 *
 * Returns { angle, source } so the diagnostics report can say which one won —
 * a fix nobody can see the working of is a fix nobody can check.
 */
export function resolveScreenAngle({ orientationAngle, windowOrientation } = {}) {
  if (Number.isFinite(windowOrientation)) {
    return { angle: wrapAngle(windowOrientation), source: 'window.orientation (iOS)' };
  }
  if (Number.isFinite(orientationAngle)) {
    return { angle: wrapAngle(orientationAngle), source: 'screen.orientation.angle' };
  }
  return { angle: 0, source: 'no orientation API — assuming unrotated' };
}

const resolveNow = () =>
  resolveScreenAngle({
    orientationAngle: typeof screen !== 'undefined' ? screen.orientation?.angle : undefined,
    windowOrientation: typeof window !== 'undefined' ? window.orientation : undefined,
  });

const screenAngle = () => resolveNow().angle;

export function createOrientationSensor({ state, fusion, clock = () => Date.now() }) {
  let listening = false;
  /** The last RAW orientation event, for the diagnostics report. */
  let lastRaw = null;
  let absoluteSensor = null;
  let headingMechanism = null;
  let teardown = [];

  const onOrientation = (event) => {
    const at = clock();
    const { beta, gamma, alpha } = event;
    lastRaw = { alpha, beta, gamma, webkitCompassHeading: event.webkitCompassHeading ?? null, absolute: event.absolute ?? null };

    if (Number.isFinite(beta)) state.write('orientation.beta', beta, { at });
    else state.fail('orientation.beta', 'orientation event carried no beta');

    // The second opinion that resolves the accelerometer's sign convention.
    // See detectAccelSign in core/fusion.js.
    fusion.noteTilt(beta, gamma);

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

    /** Raw orientation angles, exactly as the platform delivered them. */
    get lastRaw() {
      return lastRaw;
    },

    /** Which platform reading the screen angle came from, for the report. */
    get screenAngleSource() {
      return resolveNow().source;
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
