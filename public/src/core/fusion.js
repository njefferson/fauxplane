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

  // --- static alignment -----------------------------------------------------
  // A device sitting still is the EASIEST case for an attitude reference, not
  // the hardest: gravity alone gives pitch and roll outright. Every real AHRS
  // has a static-alignment step for exactly this, and this app's design case is
  // a panel CLAMPED ON A DESK — so the still case is the common one, not an
  // edge.

  /** Rotation-rate magnitude below which the device counts as STILL, deg/s.
   *  Generous on purpose: it is compared against a rate that still carries the
   *  gyro's own bias, which is the thing being estimated. Deliberate motion is
   *  an order of magnitude above it. */
  stillRateDegS: 4,
  /** Deviation from 1 g below which the device counts as STILL. */
  stillAccelG: 0.05,
  /** How long stillness must hold before the filter aligns to gravity. */
  alignHoldMs: 400,
  /** Correction weight while still. At rest gravity IS the attitude, so the
   *  filter is pulled onto it rather than creeping toward it at 2% a sample. */
  staticAlpha: 0.75,
  /**
   * INTEGRAL GAIN ON THE GYRO ZERO-OFFSET, per accepted sample.
   *
   * This is the I of a PI complementary filter (Mahony). The accelerometer
   * residual is not only a correction to apply to the ANGLE, it is evidence
   * about the RATE: a filter that is persistently below gravity is being
   * pushed down by a gyro reading that is too low, and integrating that
   * evidence recovers the offset itself.
   *
   * Chosen for a critically damped loop at the sample rates phones deliver.
   * With the proportional term at (1 - alpha) = 0.02 per sample, 50 Hz gives
   * Kp·f = 1.0/s and Ki·f = 0.25/s, so the damping ratio is 1.0 and the offset
   * settles in about six seconds without overshoot. At 60 Hz it is 1.1 — still
   * damped, which is what makes this safe to run at whatever rate arrives.
   */
  biasKi: 0.005,
  /** A "bias" past this is a device that is moving, not a gyro that is off.
   *  Clamped so a sustained linear acceleration cannot walk it away. */
  biasMaxDegS: 10,
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
  // Screen -> device, applied on the right, so R (device -> earth) composes
  // into screen -> earth. Flipped with attitudeFromGravity; see the note there.
  const S = [
    [c, s, 0],
    [-s, c, 0],
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
export function attitudeFromGravity({ x, y, z }, screenAngleDeg = 0, mount = null) {
  const m = Math.hypot(x, y, z);
  if (!Number.isFinite(m) || m < 1e-6) return null;

  // Into SCREEN coordinates, matching the mounting the pitch/roll formulas
  // below assume.
  //
  // THE SIGN HERE WAS WRONG FOR TWO RELEASES AND NOTHING COULD SEE IT. Every
  // device tested was in PORTRAIT, where the screen angle is zero and the
  // rotation is the identity whichever way round it goes. The round-trip test
  // above it could not see it either: screenToDevice was the exact inverse of
  // this, so the pair agreed with each other while both disagreed with the
  // world — the same structural blindness as the degree-1 magnetic tests.
  //
  // Derived from Noah's iPad, held square in landscape, from the raw axes in
  // its own diagnostics report: earth-up in device coords (0.610, 0.031, 0.792)
  // at a reported angle of 90. Rz(-90) gives roll -177; Rz(+90) gives roll
  // +2.9, which is what an iPad held square actually is.
  const t = degToRad(screenAngleDeg ?? 0);
  const c = Math.cos(t);
  const s = Math.sin(t);
  let sx = (x * c - y * s) / m;
  let sy = (x * s + y * c) / m;
  let sz = z / m;

  // THE MOUNT OFFSET, applied here and nowhere else. It rotates the measured
  // "down" into the frame of whatever the device is clamped to, so a phone
  // wedged in a car holder at eighteen degrees nose-up reads level. See
  // rotationAligning() for why this is a ROTATION and not a subtraction.
  if (mount) {
    const r = applyMatrix3(mount, { x: sx, y: sy, z: sz });
    sx = r.x;
    sy = r.y;
    sz = r.z;
  }

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

// --- mounting offset ---------------------------------------------------------
//
// THIS IS BORESIGHT CALIBRATION, and it is what every installed attitude
// reference does. A Garmin G5 calls it Pitch/Roll Offset, a Dynon calls it
// Level Calibration, and the procedure is identical in all of them: put the
// vehicle in a known-level attitude, press a button, and the unit records the
// rotation between its own case and the airframe. Nothing is invented by it —
// the measurement is still entirely the accelerometer's. What changes is which
// direction the instrument has been told to call "level".
//
// A phone in a car cradle is the same problem with a worse mount: cradles sit
// the phone back ten to thirty degrees and rarely square.

/** Multiply a 3x3 matrix by a vector. */
export function applyMatrix3(R, { x, y, z }) {
  return {
    x: R[0][0] * x + R[0][1] * y + R[0][2] * z,
    y: R[1][0] * x + R[1][1] * y + R[1][2] * z,
    z: R[2][0] * x + R[2][1] * y + R[2][2] * z,
  };
}

/** Transpose a 3x3 matrix. For a rotation this is also its inverse. */
export function transpose3(R) {
  return [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]],
  ];
}

/**
 * The minimal rotation carrying unit vector `from` onto unit vector `to`.
 *
 * WHY A ROTATION AND NOT A SUBTRACTION, because subtracting the offending
 * pitch and roll is the obvious thing and it is wrong. Euler angles do not
 * compose additively once more than one of them is non-zero: a mount that is
 * 20 degrees nose-up AND 15 degrees rolled is not "subtract 20 from pitch,
 * subtract 15 from roll". Doing that is exact only when one of the two is zero
 * and drifts badly as both grow — and a phone cradle is precisely the case
 * where both are non-zero. Rodrigues' formula composes correctly at every
 * attitude.
 *
 * The rotation is MINIMAL — about the axis perpendicular to both vectors —
 * because aligning one vector to another leaves one degree of freedom
 * (rotation about the vector itself) genuinely unconstrained. Gravity says
 * which way is down and says nothing whatever about which way is forward, so
 * inventing a yaw here would be inventing data. The consequence is stated
 * plainly on the setup page: levelling fixes pitch and roll, and if the phone
 * sits twisted in its cradle the pitch and roll axes stay twisted with it.
 */
export function rotationAligning(from, to) {
  const fm = Math.hypot(from.x, from.y, from.z);
  const tm = Math.hypot(to.x, to.y, to.z);
  if (!Number.isFinite(fm) || !Number.isFinite(tm) || fm < 1e-9 || tm < 1e-9) return null;

  const a = { x: from.x / fm, y: from.y / fm, z: from.z / fm };
  const b = { x: to.x / tm, y: to.y / tm, z: to.z / tm };

  // v = a x b, c = a . b
  const v = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  const c = a.x * b.x + a.y * b.y + a.z * b.z;
  const s = Math.hypot(v.x, v.y, v.z);

  // Already aligned: the identity, not a degenerate matrix full of NaN.
  if (s < 1e-9) {
    if (c > 0) {
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
    }
    // Exactly opposed. A phone mounted upside down relative to level is not a
    // calibration, it is a different mounting, and there is no minimal
    // rotation to pick — every axis perpendicular to `a` is equally valid.
    return null;
  }

  // Rodrigues: R = I + [v]x + [v]x^2 * (1 - c) / s^2
  const k = (1 - c) / (s * s);
  const { x: vx, y: vy, z: vz } = v;
  return [
    [1 + k * (-vz * vz - vy * vy), -vz + k * vx * vy, vy + k * vx * vz],
    [vz + k * vx * vy, 1 + k * (-vz * vz - vx * vx), -vx + k * vy * vz],
    [-vy + k * vx * vz, vx + k * vy * vz, 1 + k * (-vy * vy - vx * vx)],
  ];
}

/**
 * The mount rotation for a reference "down" measured in SCREEN coordinates.
 *
 * Level, for this app's mounting, means earth-up lies along the screen's own
 * +Y — that is exactly the condition attitudeFromGravity turns into pitch 0,
 * roll 0. So the mount rotation is whatever carries the measured reference
 * onto (0, 1, 0).
 */
export const LEVEL_UP = Object.freeze({ x: 0, y: 1, z: 0 });
export const mountFromReference = (referenceUpScreenFrame) => rotationAligning(referenceUpScreenFrame, LEVEL_UP);

/** The pitch and roll a mount reference corresponds to, for display. This is
 *  how far off level the CRADLE is, which is the number a person can sanity
 *  check against the thing they can see. */
export function mountAnglesDeg(referenceUpScreenFrame) {
  const solved = attitudeFromGravity(
    { x: referenceUpScreenFrame.x, y: referenceUpScreenFrame.y, z: referenceUpScreenFrame.z },
    0,
  );
  return solved ? { pitchDeg: solved.pitch, rollDeg: solved.roll } : null;
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

/** Rotate a screen-frame vector back into the hardware (device) frame. The
 *  exact inverse of the screen rotation in attitudeFromGravity, and it flipped
 *  with it — see the note there. */
export function screenToDevice({ x, y, z }, screenAngleDeg = 0) {
  const t = degToRad(screenAngleDeg ?? 0);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: x * c + y * s, y: -x * s + y * c, z };
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

/**
 * The earth-up unit vector in DEVICE coordinates, from the orientation event's
 * beta and gamma alone.
 *
 * Independent of alpha, which matters: alpha is a compass heading on one
 * platform and an arbitrary reference on another, but beta and gamma are
 * gravity-referenced and consistent everywhere. That makes this an unambiguous
 * second opinion about which way is down.
 */
export function upFromTilt(betaDeg, gammaDeg) {
  if (!Number.isFinite(betaDeg) || !Number.isFinite(gammaDeg)) return null;
  const b = degToRad(betaDeg);
  const g = degToRad(gammaDeg);
  return { x: -Math.cos(b) * Math.sin(g), y: Math.sin(b), z: Math.cos(b) * Math.cos(g) };
}

/**
 * WHICH WAY DOES accelerationIncludingGravity POINT? THE PLATFORMS DISAGREE.
 *
 * The W3C convention (and Chrome) is PROPER acceleration: at rest the vector
 * points UP, away from the ground, magnitude g. iOS Safari reports the
 * NEGATION of that. It is a long-standing, well-known divergence and it is not
 * detectable from a feature test.
 *
 * Unhandled, it rotates the artificial horizon by 180 degrees: ground on top,
 * sky underneath, roll pointer at the bottom. That is precisely what Noah's
 * iPhone showed — an upright phone in portrait reporting roll = -180.
 *
 * DETECTED FROM DATA, NOT FROM THE USER AGENT. The orientation event's beta and
 * gamma give an independent, platform-consistent answer for which way is down;
 * if the accelerometer disagrees with it by more than a right angle, the
 * accelerometer is negated. Sniffing the user agent would be a guess that
 * breaks on the next browser; this is a measurement, and it is reported on the
 * BITE page so nobody has to wonder which one is in force.
 */
export function detectAccelSign(accel, tiltUp) {
  if (!accel || !tiltUp) return null;
  const m = Math.hypot(accel.x, accel.y, accel.z);
  if (!Number.isFinite(m) || m < 1e-6) return null;
  const dot = (accel.x * tiltUp.x + accel.y * tiltUp.y + accel.z * tiltUp.z) / m;
  // Near a right angle the comparison is noise; wait for a clearer sample
  // rather than latch a coin toss.
  if (Math.abs(dot) < 0.35) return null;
  return dot > 0 ? 1 : -1;
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
  let tiltUp = null;
  let accelSign = null;
  let dPitchEma = null;
  let dRollEma = null;
  let rejecting = false;
  let reason = 'filter has not started';

  /** Estimated gyro zero-offset, in the device's own axes, deg/s. A phone gyro
   *  reads a degree or two per second while dead still; integrated, that is the
   *  drift the accelerometer then has to keep dragging back, and the standoff
   *  between the two is what the residual was measuring. */
  let bias = { alpha: 0, beta: 0, gamma: 0 };
  let biasSamples = 0;
  let lastRateMag = null;
  let stillSince = null;
  let aligned = false;
  let lastHeadingAt = null;

  /**
   * The mounting offset, applied at the INPUT so the whole filter runs in the
   * VEHICLE's frame rather than the phone's. Correcting the output instead
   * would leave the gyro integrating in one frame and the accelerometer
   * correcting in another, and the two would fight exactly as they did over the
   * zero-offset.
   */
  let mount = null;
  let mountRef = null;
  let mountAngle = null;

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
    dPitchEma = null;
    dRollEma = null;
    rejecting = false;
    stillSince = null;
    aligned = false;
    lastHeadingAt = null;
    // The bias estimate is NOT cleared. It is a property of the hardware, not
    // of this run of the filter, and throwing it away on every backgrounding
    // means re-earning it every time the app comes back.
    reason = why;
  };

  /**
   * Integrate the body rates forward. Short-term truth, drifts over minutes.
   *
   * THE SIGNS, DERIVED RATHER THAN GUESSED, because guessing them is what put a
   * persistent 3.9-degree residual on Noah's device and stopped the filter ever
   * converging — the gyro was pushing one way while the accelerometer dragged
   * it back, for ever.
   *
   * Device frame: +X right, +Y up the screen, +Z out of the screen toward the
   * pilot. The aircraft's nose is -Z, its right wing +X.
   *
   * PITCH, about +X. The rotation Rx(+θ) maps -Z toward +Y, i.e. it swings the
   * nose UP — and equivalently tips the top of the panel back toward the pilot,
   * which is what a real panel does in a climb. So nose-up is POSITIVE beta and
   * pitch ADDS. (This one was already right.)
   *
   * ROLL, about +Z. The rotation Rz(+θ) maps +X toward +Y, i.e. it lifts the
   * RIGHT wing. Our convention is right-wing-DOWN positive, so roll SUBTRACTS.
   * This was adding, and it is the bug.
   *
   * The rates are also rotated by the screen angle, exactly as the accelerometer
   * vector is. Without that the two halves of the filter disagree by 90 degrees
   * on any phone clamped in landscape — which is the mounting this app is for.
   */
  const updateGyro = (rotationRate, gravity, at, screenAngleDeg = 0) => {
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

    // THE ZERO-OFFSET COMES OFF FIRST. Everything below integrates, so a
    // constant offset here becomes an unbounded angle — and the accelerometer
    // correction then has to pull against it for ever. That standoff is what a
    // "residual" of 14.8 degrees on a motionless phone actually was.
    const ca = alpha - bias.alpha;
    const cb = beta - bias.beta;
    const cg = gamma - bias.gamma;
    lastRateMag = Math.hypot(ca, cb, cg);

    // Into SCREEN coordinates first, matching attitudeFromGravity.
    const t = degToRad(screenAngleDeg ?? 0);
    const c = Math.cos(t);
    const sn = Math.sin(t);
    // The full rate vector in SCREEN coordinates, so the mount rotation can be
    // applied to it as a vector. Taking the two components first and rotating
    // them afterwards would be rotating scalars, which is not a thing.
    let omega = { x: cb * c - cg * sn, y: cb * sn + cg * c, z: ca };
    if (mount) omega = applyMatrix3(mount, omega);
    const pitchRate = omega.x;
    const rollRate = omega.z; // about the screen normal; unaffected by screen angle

    pitch += pitchRate * dt;
    roll -= rollRate * dt;
    const yawRate = turnRateFromRates(rotationRate, gravity);
    if (heading !== null && yawRate !== null) heading = wrap360(heading + yawRate * dt);

    pitch = Math.max(-90, Math.min(90, pitch));
    roll = wrap180(roll);
  };

  /** The orientation event's tilt, kept as the second opinion that resolves the
   *  accelerometer's sign convention. */
  const noteTilt = (betaDeg, gammaDeg) => {
    const up = upFromTilt(betaDeg, gammaDeg);
    if (up) tiltUp = up;
  };

  /** Correct toward gravity, unless the aircraft is manoeuvring. */
  const updateAccel = (rawAccel, screenAngleDeg, at) => {
    if (accelSign === null && tiltUp) {
      const detected = detectAccelSign(rawAccel, tiltUp);
      if (detected !== null) {
        accelSign = detected;
        // Everything integrated before the sign was known was built on the
        // wrong half of the sky. Start again rather than slew through it.
        if (detected === -1) {
          pitch = null;
          roll = null;
          converged = false;
          settledSince = null;
          dPitchEma = null;
          dRollEma = null;
          reason = 'accelerometer sign resolved — reconverging';
        }
      }
    }
    const sign = accelSign ?? 1;
    const accel = sign === 1 ? rawAccel : { x: -rawAccel.x, y: -rawAccel.y, z: -rawAccel.z };
    const solved = attitudeFromGravity(accel, screenAngleDeg, mount);
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

    // IS THE DEVICE STILL? Two independent tests, and both are needed. The gyro
    // must see no rotation AND the accelerometer must see exactly one g: a
    // device in a steady coordinated turn also reads a constant magnitude, and
    // one in freefall also reads no rotation. Together they mean "sitting on
    // the desk", which for this app is not an edge case but the design case.
    const still =
      lastRateMag !== null && lastRateMag < cfg.stillRateDegS && Math.abs(solved.magnitudeG - 1) < cfg.stillAccelG;

    if (still) {
      if (stillSince === null) stillSince = at;
    } else {
      stillSince = null;
    }

    if (pitch === null || roll === null) {
      // First good sample seeds the filter outright — blending from a null is
      // how a filter spends its first seconds pointing at zero and calling it
      // level.
      pitch = solved.pitch;
      roll = solved.roll;
      lastAccepted = at;
      acceptedSamples = 1;
      reason = 'levelling on the gravity reference';
      return;
    }

    const dPitch = solved.pitch - pitch;
    const dRoll = wrap180(solved.roll - roll);

    // A STILL DEVICE IS CORRECTED HARD. The complementary weight exists to stop
    // the accelerometer's every bump reaching the horizon while the aircraft is
    // moving; with nothing moving there is no bump to reject and nothing for the
    // gyro to contribute, so creeping toward the answer at two percent a sample
    // is just a slow horizon for no benefit.
    const gain = still ? 1 - cfg.staticAlpha : 1 - cfg.alpha;
    pitch += gain * dPitch;
    roll = wrap180(roll + gain * dRoll);

    // THE INTEGRAL TERM — where the gyro's zero-offset is actually learned.
    //
    // The residual is evidence about the RATE, not only about the angle. A
    // filter sitting persistently BELOW gravity in pitch has been integrating a
    // rate that is too low, so the offset being subtracted from that rate is
    // too high. Accumulating that evidence recovers the offset within seconds
    // — and it does so whether the device is moving or not, which is the whole
    // reason it is done here rather than from a stillness window. Gating the
    // estimate on the gyro's own reading would be circular: a large enough
    // offset would keep the device from ever looking still, and so would lock
    // the filter out of ever learning the thing making it look that way.
    //
    // Without this the two halves of the filter fight to a standoff at
    // residual = offset / (rate x (1 - alpha)) and simply stay there. That is
    // what Noah's phone was reporting as "converging (residual 14.8 deg)".
    //
    // Projected back onto the DEVICE axes the gyro actually reports, using the
    // same screen angle the rates were rotated by — an offset learned in screen
    // coordinates would be wrong the moment the panel was re-clamped.
    // Ki RIDES THE PROPORTIONAL GAIN, so the loop keeps its shape under both.
    //
    // The hard static correction collapses the residual almost immediately —
    // which is the point of it, but the residual is also the only evidence the
    // integrator has, so a fixed Ki would starve exactly when the device is
    // MOST observable: at rest, where the true rotation rate is known to be
    // zero. Scaling the two together holds the ratio, and with it the settling
    // time, constant across both regimes. Measured: a fixed Ki reached 57% of a
    // 3 deg/s offset after forty seconds on a desk; this reaches it in about
    // four.
    const ts = degToRad(screenAngleDeg ?? 0);
    const ki = cfg.biasKi * (gain / (1 - cfg.alpha));
    const dPitchBias = -ki * dPitch;
    const dRollBias = ki * dRoll;
    const clampBias = (v) => Math.max(-cfg.biasMaxDegS, Math.min(cfg.biasMaxDegS, v));
    // Projected back through the SAME transform the rates were rotated by. The
    // screen pitch rate is (beta·cos t − gamma·sin t), so an increment to the
    // screen-frame bias lands on beta as +cos and on gamma as −sin. This sign
    // flipped with the rotation above; leaving it would put the learned offset
    // on the wrong axis at every angle except zero.
    bias.beta = clampBias(bias.beta + dPitchBias * Math.cos(ts));
    bias.gamma = clampBias(bias.gamma - dPitchBias * Math.sin(ts));
    bias.alpha = clampBias(bias.alpha + dRollBias);
    biasSamples += 1;

    // CONVERGENCE IS THE SMOOTHED *SIGNED* RESIDUAL — the filter's BIAS against
    // gravity, not its noise and not its rate of turn.
    //
    // Two wrong versions came before this one, and both are worth keeping in
    // view because each measured something adjacent to the claim:
    //
    //   1. The INSTANTANEOUS residual. Held in a hand, the accelerometer
    //      solution jitters several degrees continuously, so this never fell
    //      below the threshold and the horizon stayed crossed out for ever. It
    //      was measuring hand-shake. Noah's device reported "converging
    //      (residual 3.9 deg)" thirteen minutes after boot.
    //   2. The filter against a SMOOTHED gravity reference. That fixed the
    //      jitter and broke rotation: a smoothed reference lags a turning
    //      device, so a filter tracking a steady roll perfectly was scored as
    //      3.8 degrees out. It was measuring rate of turn.
    //
    // Smoothing the SIGNED difference separates the two. Jitter is zero-mean
    // and cancels. A steady, correctly-tracked rotation leaves only the
    // filter's small tracking lag. A systematic error — a mis-signed gyro axis,
    // a drifting integration — is a persistent bias and does not cancel, which
    // is exactly what should hold convergence off.
    const k = 0.05;
    dPitchEma = dPitchEma === null ? dPitch : dPitchEma + k * (dPitch - dPitchEma);
    dRollEma = dRollEma === null ? dRoll : dRollEma + k * (dRoll - dRollEma);
    lastResidual = Math.max(Math.abs(dPitchEma), Math.abs(dRollEma));

    lastAccepted = at;
    acceptedSamples += 1;

    // STATIC ALIGNMENT. Held still long enough, with gravity steady at one g,
    // the filter is not "hoping to converge" — it is aligned, by exactly the
    // argument every AHRS uses sitting on the ramp. Declaring it here is what
    // stops the horizon waiting on a residual that needs MOTION to shrink.
    if (still && at - stillSince >= cfg.alignHoldMs) {
      aligned = true;
      converged = true;
      reason = null;
    }

    if (lastResidual <= cfg.convergeDeg) {
      if (settledSince === null) settledSince = at;
      if (!converged && at - settledSince >= cfg.convergeHoldMs && acceptedSamples >= cfg.convergeMinSamples) {
        converged = true;
        reason = null;
      }
    } else {
      settledSince = null;
      // Aligned once is not aligned for ever. If the gyro and gravity drift
      // properly apart the badge is given back, rather than kept on the
      // strength of a minute that has passed.
      if (aligned && lastResidual > cfg.convergeDeg * 4) {
        aligned = false;
        converged = false;
      }
      // Leading with what the reader can act on. This string is printed across
      // the face of the horizon, so it says what the instrument IS before it
      // says what it is waiting for.
      if (!converged) reason = `gravity reference only — gyro settling (${lastResidual.toFixed(1)}°)`;
    }
  };

  /** Correct heading toward an earth-referenced compass reading. */
  const updateHeading = (headingDeg, at) => {
    if (!Number.isFinite(headingDeg)) return;
    const target = wrap360(headingDeg);
    // THE COMPASS KEEPS ITS OWN CLOCK. Heading used to share the accelerometer's
    // freshness, so a device with a working magnetometer and a sulking
    // accelerometer crossed out a heading it actually had. They are different
    // sensors answering different questions and they fail separately.
    lastHeadingAt = at;
    if (heading === null) {
      heading = target;
      return;
    }
    // Blend the SHORTEST way round. Blending the raw difference walks the
    // needle the long way through 359 -> 1 and looks like a spin.
    heading = wrap360(heading + (1 - cfg.alpha) * wrap180(target - heading));
  };

  return {
    cfg,
    reset,
    noteTilt,
    updateGyro,
    updateAccel,
    updateHeading,
    /** +1 = W3C/Chrome (points up), -1 = iOS Safari (negated), null = not yet
     *  determined. Reported on the BITE page. */
    get accelSign() {
      return accelSign;
    },
    /** Apply the detected convention to a raw vector, so the G-meter, the
     *  slip ball and the vertical accelerometer all agree with the horizon. */
    orient(a) {
      const sign = accelSign ?? 1;
      return sign === 1 ? a : { x: -a.x, y: -a.y, z: -a.z };
    },
    /**
     * The filter's opinion, including whether it has one yet. `converged` false
     * means every consumer must render FAIL — not a plausible zero.
     */
    /**
     * Record the current attitude as level — boresight calibration.
     *
     * `referenceUp` is the measured earth-up unit vector in SCREEN coordinates
     * at the moment of capture; `screenAngleDeg` is the orientation it was
     * captured in, kept because a calibration taken in portrait says nothing
     * about the same phone lying in a landscape cradle.
     *
     * Returns the mount angles, or null if the reference is unusable.
     */
    setMount(referenceUp, screenAngleDeg) {
      if (!referenceUp) {
        mount = null;
        mountRef = null;
        mountAngle = null;
        return null;
      }
      const R = mountFromReference(referenceUp);
      if (!R) return null;
      mount = R;
      mountRef = { ...referenceUp };
      mountAngle = screenAngleDeg ?? 0;
      // The attitude held right now was solved in the OLD frame. Keeping it
      // would make the horizon swing from the old zero to the new one over
      // several seconds; dropping it re-seeds from the very next sample.
      pitch = null;
      roll = null;
      converged = false;
      aligned = false;
      settledSince = null;
      dPitchEma = null;
      dRollEma = null;
      reason = 'levelled to the mount — reconverging';
      return mountAnglesDeg(referenceUp);
    },

    clearMount() {
      mount = null;
      mountRef = null;
      mountAngle = null;
      pitch = null;
      roll = null;
      converged = false;
      aligned = false;
      reason = 'mount offset cleared — reconverging';
    },

    /** The offset in effect, for the panel and the diagnostics report. Null
     *  when the horizon is reading the device itself. */
    get mountOffset() {
      if (!mountRef) return null;
      return { ...mountAnglesDeg(mountRef), capturedAtScreenAngle: mountAngle, reference: { ...mountRef } };
    },

    /** The rotation itself, so the vertical-accelerometer projection can undo
     *  it. Everything else should use `mountOffset`. */
    get mountMatrix() {
      return mount;
    },

    /** The learned gyro zero-offset, or null before any still sample. BITE
     *  prints it: it is invisible otherwise, and it is the difference between a
     *  horizon that settles and one that argues with itself. */
    get gyroBias() {
      return biasSamples > 0 ? { ...bias, samples: biasSamples } : null;
    },
    read(at) {
      const coastingMs = lastAccepted === null ? null : at - lastAccepted;
      const stale = coastingMs !== null && coastingMs > cfg.maxCoastMs;

      // ATTITUDE EXISTS AS SOON AS GRAVITY HAS BEEN SEEN.
      //
      // It does not wait for the gyro to settle. Gravity on its own is a real
      // measurement of which way is down — that is the entire basis of a
      // pendulous attitude reference, and on a device sitting still it is not
      // an approximation, it is exact. What fusion adds is steadiness THROUGH
      // MOTION. That is a question of QUALITY, not of existence.
      //
      // Conflating the two put a permanent red cross over the horizon on Noah's
      // phone: the smoothed residual never fell under two degrees, so a panel
      // that knew its own attitude to a fraction of a degree refused to draw
      // it, and said "converging" for as long as anyone cared to watch.
      const hasAttitude = pitch !== null && roll !== null && !stale;
      const trusted = converged && !stale;
      const headingStale = lastHeadingAt === null || at - lastHeadingAt > cfg.maxCoastMs;

      return {
        pitch,
        roll,
        heading,
        hasAttitude,
        hasHeading: heading !== null && !headingStale,
        /**
         * 'ALIGNED' — gyro-stabilised and bias-corrected; good through motion.
         * 'COARSE'  — the gravity reference alone. Exact at rest, disturbed by
         *             linear acceleration, and it says so on the face of the
         *             instrument rather than in a log.
         */
        quality: !hasAttitude ? null : trusted ? 'ALIGNED' : 'COARSE',
        converged: trusted,
        aligned,
        still: stillSince !== null,
        rejecting,
        acceptedSamples,
        residualDeg: lastResidual,
        coastingMs,
        // A trusted filter normally has nothing to say. But while it is
        // REJECTING accelerometer corrections it is coasting on the gyro, and
        // that is worth saying even though the attitude is still trustworthy —
        // BITE prints it, and "why did the horizon stop responding" has to be
        // answerable. Found by a test that asserted the reason and got silence.
        reason: stale
          ? `no gravity reference for ${Math.round(coastingMs / 1000)}s`
          : trusted
            ? rejecting
              ? reason
              : null
            : hasAttitude
              ? (reason ?? 'gravity reference only — the gyro has not settled')
              : (reason ?? 'no gravity reference yet'),
      };
    },
  };
}
