/**
 * fusion.js — attitude fusion. A complementary filter, and the geometry that
 * turns a phone's axes into an aircraft's.
 *
 * Short term the gyro is trusted (it integrates smoothly but drifts). Long term
 * the accelerometer is trusted (it does not drift but reads every bump). The
 * filter integrates rotationRate and corrects toward the accel-derived attitude
 * with alpha = 0.98, and toward the magnetometer heading the same way.
 *
 * THE MANEUVERING GATE: an accelerometer measures gravity plus whatever the
 * aircraft is doing. In a turn, "down" is not down. When the measured
 * acceleration magnitude differs from g by more than 0.15 g, the correction is
 * REJECTED and the gyro coasts — which is exactly the case where a naive filter
 * pitches the horizon over and lies confidently.
 *
 * CONVERGENCE IS REPORTED, NOT ASSUMED. The filter starts unconverged and says
 * so; every consumer renders FAIL until it settles. A horizon that is wrong for
 * the first two seconds is worse than a horizon that admits it is not ready.
 */

import { G0, degToRad, radToDeg, wrap180, wrap360 } from './units.js';

export const DEFAULTS = Object.freeze({
  /** Complementary filter weight on the integrated gyro. */
  alpha: 0.98,
  /** Reject accel correction beyond this deviation from g, in g. */
  accelGateG: 0.15,
  /** Residual below which the filter counts as settled, degrees. */
  convergeDeg: 2,
  /** How long the residual must stay settled, ms. */
  convergeHoldMs: 1500,
  /** Minimum accepted accel corrections before convergence can be declared. */
  convergeMinSamples: 20,
  /** Coasting longer than this without an accepted accel correction is not
   *  attitude any more, it is dead reckoning on a phone gyro. */
  maxCoastMs: 5000,
});

// --- geometry ---------------------------------------------------------------

/**
 * Rotation matrix from the W3C device-orientation Euler angles.
 *
 * The spec defines the sequence as intrinsic Z-X'-Y'' (alpha about z, then beta
 * about the new x, then gamma about the new y). The matrix maps DEVICE
 * coordinates into EARTH coordinates (x East, y North, z Up).
 *
 * Written out rather than composed from three multiplications because the
 * composition order is the single easiest thing to get backwards here, and a
 * transposed matrix produces an attitude that looks plausible and mirrors every
 * roll.
 */
export function matrixFromEuler(alphaDeg, betaDeg, gammaDeg) {
  const a = degToRad(alphaDeg ?? 0);
  const b = degToRad(betaDeg ?? 0);
  const g = degToRad(gammaDeg ?? 0);

  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);

  return [
    [cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB],
    [cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB],
    [-cB * sG, sB, cB * cG],
  ];
}

/**
 * Rotate a device-frame matrix by the screen orientation angle.
 *
 * The sensor axes are fixed to the HARDWARE; the screen rotates inside them.
 * A panel clamped in landscape on a phone whose natural orientation is portrait
 * is reading axes that are 90 degrees from what the pilot sees. Skipping this
 * swaps pitch and roll on every phone and on no iPad, which is the worst kind
 * of bug to find on someone else's device.
 */
export function applyScreenAngle(R, angleDeg) {
  const t = degToRad(angleDeg ?? 0);
  const c = Math.cos(t);
  const s = Math.sin(t);
  // Rotation about the device z axis, applied on the right (device -> screen).
  const S = [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      out[i][j] = R[i][0] * S[0][j] + R[i][1] * S[1][j] + R[i][2] * S[2][j];
    }
  }
  return out;
}

/**
 * Aircraft attitude from a device->earth rotation matrix, for a device mounted
 * as a PANEL: screen facing the pilot, so the aircraft's nose is along the
 * device's -Z axis, the right wing along +X, and the cabin roof along +Y.
 */
export function attitudeFromMatrix(R) {
  // Columns of R are the device axes expressed in earth (ENU) coordinates.
  const right = [R[0][0], R[1][0], R[2][0]];
  const up = [R[0][1], R[1][1], R[2][1]];
  const forward = [-R[0][2], -R[1][2], -R[2][2]];

  const pitch = radToDeg(Math.asin(Math.max(-1, Math.min(1, forward[2]))));
  const roll = radToDeg(Math.atan2(-right[2], up[2]));
  // Heading is measured clockwise from north, which is atan2(East, North).
  const heading = wrap360(radToDeg(Math.atan2(forward[0], forward[1])));
  return { pitch, roll, heading };
}

/**
 * Aircraft pitch and roll from the gravity vector alone.
 *
 * `accelerationIncludingGravity` is proper acceleration: at rest it points UP
 * in the device frame with magnitude g. Normalising it gives the earth's up
 * direction expressed in device coordinates, which is all pitch and roll need.
 * It says nothing about heading — gravity has no yaw information, which is why
 * the magnetometer is a separate correction and not a nicety.
 */
export function attitudeFromGravity({ x, y, z }, screenAngleDeg = 0) {
  const m = Math.hypot(x, y, z);
  if (!Number.isFinite(m) || m < 1e-6) return null;

  // Undo the screen rotation so the vector is in SCREEN coordinates, matching
  // the mounting the pitch/roll formulas below assume.
  const t = degToRad(screenAngleDeg ?? 0);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const sx = (x * c + y * s) / m;
  const sy = (-x * s + y * c) / m;
  const sz = z / m;

  return {
    pitch: radToDeg(Math.asin(Math.max(-1, Math.min(1, -sz)))),
    // ROLL IS POSITIVE WITH THE RIGHT WING DOWN, the aviation convention.
    //
    // The minus sign is load-bearing and was missing. `sx` is how much of
    // earth-up points along the aircraft's RIGHT axis, so a positive sx means
    // up is toward the right wing — which is the right wing HIGH, a LEFT bank.
    // Without the negation this function returned +30 for a 30 degree left
    // bank, disagreeing with attitudeFromMatrix by exactly a sign and
    // mirroring every roll on the horizon. Caught by deriving the gravity
    // vector from the matrix and asserting the two routes agree; neither route
    // looks wrong on its own.
    roll: radToDeg(Math.atan2(-sx, sy)),
    magnitudeG: m / G0,
  };
}

/**
 * The earth-up unit vector expressed in SCREEN coordinates, given an attitude.
 *
 * This is the exact inverse of attitudeFromGravity, and it is what lets the
 * vertical accelerometer be separated from gravity: knowing which way is up is
 * the whole problem, and the filter is the thing that knows. Deriving "up" from
 * the instantaneous acceleration instead is circular — it defines away the very
 * acceleration you are trying to measure, and reads zero in a climb.
 */
export function upVectorScreenFrame(pitchDeg, rollDeg) {
  if (!Number.isFinite(pitchDeg) || !Number.isFinite(rollDeg)) return null;
  const p = degToRad(pitchDeg);
  const r = degToRad(rollDeg);
  const cosP = Math.cos(p);
  // Exact inverse of attitudeFromGravity, INCLUDING its roll sign: a positive
  // (right-wing-down) roll puts earth-up on the negative x side of the screen.
  return { x: -Math.sin(r) * cosP, y: Math.cos(r) * cosP, z: -Math.sin(p) };
}

/** Rotate a screen-frame vector back into the hardware (device) frame. */
export function screenToDevice({ x, y, z }, screenAngleDeg = 0) {
  const t = degToRad(screenAngleDeg ?? 0);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: x * c - y * s, y: x * s + y * c, z };
}

/**
 * Turn rate: the component of the body rotation rate about the EARTH VERTICAL.
 *
 * The base spec maps rotationRate.alpha straight to the turn needle, which is
 * right for a device lying flat and wrong for the mounting this app specifies —
 * clamped vertical as a panel, alpha is rotation about the screen normal, which
 * is the aircraft's ROLL axis. Projecting the full rate vector onto the current
 * up direction is what that mapping means; it reduces to alpha exactly when the
 * device is flat, so nothing is lost and the panel case stops being wrong.
 */
export function turnRateFromRates(rotationRate, gravityDeviceFrame) {
  if (!rotationRate || !gravityDeviceFrame) return null;
  const { alpha, beta, gamma } = rotationRate;
  if (![alpha, beta, gamma].every((v) => Number.isFinite(v))) return null;

  const { x, y, z } = gravityDeviceFrame;
  const m = Math.hypot(x, y, z);
  if (!Number.isFinite(m) || m < 1e-6) return null;

  // rotationRate: beta about device x, gamma about device y, alpha about z.
  const omega = [beta, gamma, alpha];
  const upHat = [x / m, y / m, z / m];
  return omega[0] * upHat[0] + omega[1] * upHat[1] + omega[2] * upHat[2];
}

// --- the filter --------------------------------------------------------------

export function createFusion(options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  let pitch = null;
  let roll = null;
  let heading = null;
  let converged = false;
  let acceptedSamples = 0;
  let settledSince = null;
  let lastAccepted = null;
  let lastGyroAt = null;
  let lastResidual = null;
  let rejecting = false;
  let reason = 'filter has not started';

  const reset = (why = 'filter reset') => {
    pitch = null;
    roll = null;
    heading = null;
    converged = false;
    acceptedSamples = 0;
    settledSince = null;
    lastAccepted = null;
    lastGyroAt = null;
    lastResidual = null;
    rejecting = false;
    reason = why;
  };

  /** Integrate the body rates forward. Short-term truth, drifts over minutes. */
  const updateGyro = (rotationRate, gravity, at) => {
    if (lastGyroAt === null) {
      lastGyroAt = at;
      return;
    }
    const dt = (at - lastGyroAt) / 1000;
    lastGyroAt = at;
    // A tab that was backgrounded returns with a gap of seconds. Integrating
    // across it would slew the horizon to somewhere invented.
    if (!(dt > 0) || dt > 0.5) return;
    if (pitch === null || roll === null) return;

    const { alpha, beta, gamma } = rotationRate ?? {};
    if (![alpha, beta, gamma].every((v) => Number.isFinite(v))) return;

    // Body rates about the panel-mounted aircraft axes: pitch rate is about the
    // device x axis, roll rate about the device z axis (the screen normal).
    pitch += beta * dt;
    roll += alpha * dt;
    const yawRate = turnRateFromRates(rotationRate, gravity);
    if (heading !== null && yawRate !== null) heading = wrap360(heading + yawRate * dt);

    pitch = Math.max(-90, Math.min(90, pitch));
    roll = wrap180(roll);
  };

  /** Correct toward gravity, unless the aircraft is manoeuvring. */
  const updateAccel = (accel, screenAngleDeg, at) => {
    const solved = attitudeFromGravity(accel, screenAngleDeg);
    if (!solved) {
      reason = 'accelerometer produced no usable vector';
      return;
    }

    if (Math.abs(solved.magnitudeG - 1) > cfg.accelGateG) {
      // Manoeuvring. Coast on the gyro and SAY we are coasting.
      rejecting = true;
      reason = `manoeuvring (${solved.magnitudeG.toFixed(2)} g) — coasting on gyro`;
      if (lastAccepted !== null && at - lastAccepted > cfg.maxCoastMs) {
        converged = false;
        settledSince = null;
        reason = `no gravity reference for ${Math.round((at - lastAccepted) / 1000)}s`;
      }
      return;
    }

    rejecting = false;
    if (pitch === null || roll === null) {
      // First good sample seeds the filter outright — blending from a null is
      // how a filter spends its first seconds pointing at zero and calling it
      // level.
      pitch = solved.pitch;
      roll = solved.roll;
      lastAccepted = at;
      acceptedSamples = 1;
      reason = 'converging';
      return;
    }

    const dPitch = solved.pitch - pitch;
    const dRoll = wrap180(solved.roll - roll);
    lastResidual = Math.max(Math.abs(dPitch), Math.abs(dRoll));

    pitch += (1 - cfg.alpha) * dPitch;
    roll = wrap180(roll + (1 - cfg.alpha) * dRoll);

    lastAccepted = at;
    acceptedSamples += 1;

    if (lastResidual <= cfg.convergeDeg) {
      if (settledSince === null) settledSince = at;
      if (!converged && at - settledSince >= cfg.convergeHoldMs && acceptedSamples >= cfg.convergeMinSamples) {
        converged = true;
        reason = null;
      }
    } else {
      settledSince = null;
      if (!converged) reason = `converging (residual ${lastResidual.toFixed(1)} deg)`;
    }
  };

  /** Correct heading toward an earth-referenced compass reading. */
  const updateHeading = (headingDeg, at) => {
    if (!Number.isFinite(headingDeg)) return;
    const target = wrap360(headingDeg);
    if (heading === null) {
      heading = target;
      return;
    }
    // Blend the SHORTEST way round. Blending the raw difference walks the
    // needle the long way through 359 -> 1 and looks like a spin.
    heading = wrap360(heading + (1 - cfg.alpha) * wrap180(target - heading));
    lastAccepted = lastAccepted ?? at;
  };

  return {
    cfg,
    reset,
    updateGyro,
    updateAccel,
    updateHeading,
    /**
     * The filter's opinion, including whether it has one yet. `converged` false
     * means every consumer must render FAIL — not a plausible zero.
     */
    read(at) {
      const coastingMs = lastAccepted === null ? null : at - lastAccepted;
      const stale = coastingMs !== null && coastingMs > cfg.maxCoastMs;
      return {
        pitch,
        roll,
        heading,
        converged: converged && !stale,
        rejecting,
        acceptedSamples,
        residualDeg: lastResidual,
        coastingMs,
        // A converged filter normally has nothing to say. But while it is
        // REJECTING accelerometer corrections it is coasting on the gyro, and
        // that is worth saying even though the attitude is still trustworthy —
        // BITE prints it, and "why did the horizon stop responding" has to be
        // answerable. Found by a test that asserted the reason and got silence.
        reason: converged && !stale ? (rejecting ? reason : null) : (reason ?? 'filter has not converged'),
      };
    },
  };
}
