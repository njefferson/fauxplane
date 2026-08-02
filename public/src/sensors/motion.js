/**
 * motion.js — the G-meter, the slip/skid ball, the turn needle, and the
 * accelerometer half of both the attitude filter and the VSI.
 *
 * `accelerationIncludingGravity` is PROPER acceleration: at rest it reads
 * one g pointing up in the device frame. That is why it can serve as both a
 * gravity reference (for attitude) and a load reference (for the G-meter) —
 * they are the same measurement asked two different questions.
 *
 * iOS requires DeviceMotionEvent.requestPermission() from a user gesture, and
 * that gesture is PANEL POWER. Without it the events never fire at all, and the
 * honest rendering is FAIL with that reason rather than a G-meter resting at
 * 1.0 as though the aircraft were parked.
 */

import { needsMotionPermission } from '../core/capability.js';
import { applyMatrix3, screenToDevice, transpose3, turnRateFromRates, upVectorScreenFrame } from '../core/fusion.js';
import { G0 } from '../core/units.js';

/** `owns` — see the note in sensors/geo.js. False while the panel is following
 *  another aircraft, whose broadcast fills the load factor and the turn rate.
 *  The FILTER is still fed either way: it costs nothing, and it means the
 *  horizon is already aligned when the reader stops following. */
export function createMotionSensor({ state, fusion, vsi, screenAngle, owns = () => true, clock = () => Date.now() }) {
  let listening = false;
  let sawEvent = false;
  let handler = null;
  /** The last RAW event, kept solely so the diagnostics report can print the
   *  actual axes. Diagnosing an axis convention from a photograph of a horizon
   *  is guesswork; diagnosing it from the three numbers is arithmetic. */
  let lastRaw = null;

  const onMotion = (event) => {
    const at = clock();
    const raw = event.accelerationIncludingGravity;
    const r = event.rotationRate;

    if (raw && [raw.x, raw.y, raw.z].every((v) => Number.isFinite(v))) {
      lastRaw = { x: raw.x, y: raw.y, z: raw.z, rotation: r ? { alpha: r.alpha, beta: r.beta, gamma: r.gamma } : null };
      // ONE conversion, at the source. The slip ball, the vertical
      // accelerometer and the turn needle all read the same vector as the
      // horizon does, so a platform that negates it cannot flip one of them
      // and not the others.
      const a = fusion.orient(raw);
      sawEvent = true;
      const angle = screenAngle();

      // Total load factor. The G-meter reads the MAGNITUDE of proper
      // acceleration, which is what a pilot and a g-meter both mean by "g".
      const magnitudeG = Math.hypot(a.x, a.y, a.z) / G0;
      const mine = owns();
      if (mine) state.write('motion.gLoad', magnitudeG, { at });

      // Slip/skid: lateral acceleration in the aircraft frame, over g. The ball
      // sits where the resultant points, so this is signed and small.
      const t = (angle * Math.PI) / 180;
      const lateral = (a.x * Math.cos(t) + a.y * Math.sin(t)) / G0;
      if (mine) state.write('motion.lateralG', lateral, { at });

      // The filter must see this sample BEFORE the vertical component is taken
      // out of it, because separating gravity needs an attitude and the filter
      // is what holds one.
      fusion.updateAccel(raw, angle, at);

      // Vertical acceleration for the VSI: the component along earth-up, with
      // gravity removed. At rest this is zero, which is what the integrator
      // needs — feeding it the raw 9.81 makes the VSI climb for ever.
      //
      // Until the filter has converged there is no trustworthy "up", so there
      // is no vertical acceleration either. That is a FAIL, not a zero.
      const att = fusion.read(at);
      let upScreen = att.converged ? upVectorScreenFrame(att.pitch, att.roll) : null;
      // THE MOUNT HAS TO BE UNDONE HERE. The filter's pitch and roll are in the
      // VEHICLE's frame once a mount offset is set, so the up vector they
      // produce is too — but this projection is about to dot it against a raw
      // accelerometer reading, which is in the DEVICE's. Skipping the inverse
      // rotation would measure the vertical acceleration along an axis the
      // phone is not pointing down, and the VSI would read a component of the
      // car's braking as a climb.
      if (upScreen && fusion.mountMatrix) upScreen = applyMatrix3(transpose3(fusion.mountMatrix), upScreen);
      if (upScreen) {
        const up = screenToDevice(upScreen, angle);
        const alongUp = a.x * up.x + a.y * up.y + a.z * up.z;
        if (mine) state.write('motion.verticalAccel', alongUp - G0, { at });
        vsi.updateAccel(alongUp - G0, at);
      } else if (mine) {
        state.fail('motion.verticalAccel', `attitude not converged — no vertical reference (${att.reason ?? 'converging'})`);
      }

      if (r) {
        fusion.updateGyro(r, a, at, angle);
        const turn = turnRateFromRates(r, a);
        if (!mine) {
          /* the followed aircraft owns the turn needle */
        } else if (turn !== null) state.write('attitude.turnRate', turn, { at });
        else state.fail('attitude.turnRate', 'rotationRate carried no usable axes');
      } else if (mine) {
        state.fail('attitude.turnRate', 'this device reports no rotation rate (no gyroscope)');
      }
    }
  };

  return {
    async requestPermission() {
      if (!needsMotionPermission()) return 'granted';
      try {
        return await DeviceMotionEvent.requestPermission();
      } catch (err) {
        return `error: ${err.message}`;
      }
    },

    get sawEvent() {
      return sawEvent;
    },

    /** Raw accelerometer axes, exactly as the platform delivered them. */
    get lastRaw() {
      return lastRaw;
    },

    start() {
      if (listening) return;
      if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') {
        const why = 'DeviceMotionEvent not implemented by this browser';
        for (const p of ['motion.gLoad', 'motion.lateralG', 'motion.verticalAccel', 'attitude.turnRate']) state.fail(p, why);
        return;
      }
      listening = true;
      handler = onMotion;
      window.addEventListener('devicemotion', handler);

      // A granted permission that delivers nothing is a real and common
      // outcome — a desktop browser with no accelerometer answers "granted"
      // and then stays silent for ever. Say so instead of waiting quietly.
      setTimeout(() => {
        if (!sawEvent) {
          const why = 'permission granted but no motion events arrived — this device may have no accelerometer';
          for (const p of ['motion.gLoad', 'motion.lateralG', 'motion.verticalAccel', 'attitude.turnRate']) state.fail(p, why);
        }
      }, 3000);
    },

    stop() {
      listening = false;
      if (handler && typeof window !== 'undefined') window.removeEventListener('devicemotion', handler);
      handler = null;
    },
  };
}
