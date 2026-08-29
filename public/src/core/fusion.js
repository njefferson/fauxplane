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
  /** Reject accel corrections whose implied attitude departs this far, in
   *  degrees, from the gyro-propagated one. The magnitude gate above cannot
   *  see a ROTATED vector — leaning a hand-held phone swings the measured
   *  direction while its length stays near one g — so this is the direction
   *  half of the same gate. Kin to biasGateDeg: a residual this large is not
   *  evidence about attitude either. */
  accelGateDeg: 10,
  /**
   * How long direction-rejected samples may keep the filter coasting before the
   * accelerometer wins anyway. Deliberately under maxCoastMs, so this gate
   * alone can never cross the horizon out.
   *
   * HALVED FROM 4000 ON 2026-08-03. ,
   * photographed at `gravity 51° from the gyro — coasting on gyro`. The budget
   * is a bound on how far a phone gyro is trusted with no absolute reference,
   * and four seconds was too generous for one: measured on a filter driven into
   * divergence, four seconds lets the state reach 53° and two seconds stops it
   * at 32°, which then recovers inside half a second instead of four. The error
   * a reader sees is roughly linear in this number, because that is exactly
   * what it bounds.
   *
   * It still comfortably covers the case it exists for. The hand-held lean that
   * produced it is about a second long, and both ROCKET tests hold at 2000.
   */
  disagreeCoastMs: 2000,
  /**
   * Ceiling on tan θ in the roll kinematics — 5 is a pitch of about 79°.
   * Beyond it Euler roll is undefined rather than merely large, so the term is
   * clamped instead of allowed to run away. See the propagation for why this
   * filter is Euler rather than quaternion.
   */
  tanPitchClamp: 5,
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
   * The gain once the filter is ALIGNED and still, as distinct from the gain it
   * uses getting there.
   *
   * `staticAlpha` is a deliberately fast pull toward gravity so a device set
   * down levels in a fraction of a second. Keeping that gain afterwards applies
   * a QUARTER of every accelerometer sample, at sixty samples a second, for as
   * long as the panel is on — which is a horizon that visibly trembles while
   * sitting on a desk. The accelerometer is exact at rest and NOISY at rest;
   * those are not in conflict.
   *
   * Alignment is a transient. Once it is done there is only slow drift left to
   * track, so the gain drops to a tenth: about a 280 ms time constant instead of
   * 67 ms, still four times quicker than the in-motion gain, and quick enough
   * that a mount which shifts is followed within a second.
   */
  settledAlpha: 0.94,
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
  /**
   * ANTI-WINDUP: the residual above which the integrator stops learning.
   *
   * An integrator must not learn from an error it cannot explain. While the
   * filter was badly diverged — the mis-signed screen rotation put it fifty
   * degrees out — the residual was enormous and PERSISTENT, which is exactly
   * the input an ungated integrator reads as "an enormous constant offset".
   * a real phone reported the alpha offset pegged at -10.00 deg/s, dead on the
   * clamp. That is not a gyroscope's zero-offset, which is a degree or two; it
   * is the loop eating its own error.
   *
   * Ten degrees is generous — a real offset shows as a standing residual well
   * under one — and it costs nothing, because the proportional term pulls a
   * diverged filter back inside this within about a second and the integrator
   * then starts from a residual it CAN explain.
   */
  biasGateDeg: 10,
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
  // Derived from a real tablet, held square in landscape, from the raw axes in
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
 * sky underneath, roll pointer at the bottom. That is precisely what a real
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
  /** The most recent attitude solved while the device was still. See read(). */
  let lastStillAttitude = null;
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
  /** When the standing accel-vs-gyro disagreement began. See the direction gate. */
  let disagreeSince = null;
  /** True once the coast budget for the CURRENT disagreement is spent — a
   *  latch, because acceptance refreshes lastAccepted and a per-sample check
   *  would re-arm the rejection one corrected sample per window. Cleared only
   *  when the disagreement itself clears. */
  let disagreeSpent = false;
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
    disagreeSince = null;
    disagreeSpent = false;
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
   * persistent 3.9-degree residual on a real device and stopped the filter ever
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

    /**
     * THE FULL EULER KINEMATICS, AND THIS IS THE ROOT CAUSE OF "GENTLE ROTATION
     * ERRORS THE HORIZON" (reported 2026-08-03).
     *
     * This used to be `pitch += omega.x·dt` and `roll -= omega.z·dt`: the
     * textbook small-angle shortcut, φ̇ = p and θ̇ = q. It is exact at wings-level
     * and nose-level and WRONG EVERYWHERE ELSE, and the error is not subtle —
     * it is a tan θ.
     *
     *   φ̇ = p + (q sinφ + r cosφ) tanθ
     *   θ̇ = q cosφ − r sinφ
     *
     * MEASURED, for a device turned gently about TRUE VERTICAL at 20°/s for
     * three seconds — a gesture during which the true pitch and roll do not
     * change at all:
     *
     *   tilt   −10°  →  the old code integrated −10.4° of roll that was not
     *   tilt   −30°  →  −30.0°           happening; the full relations give
     *   tilt   −45°  →  −42.4°           0.0° at every one of them.
     *   tilt   −60°  →  −52.0°
     *
     * The owner's ADI read `gravity 51° from the gyro`. That is this, at about sixty
     * degrees of tilt — a phone in a cradle, on a desk, or in a hand. Gravity
     * was correct throughout; the gyro invented the roll, and the direction
     * gate then rejected the only instrument telling the truth.
     *
     * WHY IT HID FOR SO LONG. The diagnostic capture of a HEALTHY panel has
     * pitch −4.2°, where tanθ is 0.07 and the missing term is worth a fraction
     * of a degree. Every report that looked fine was taken near upright, and
     * the failure needed a tilt nobody thought to record.
     *
     * IT ALSO UNBLOCKS A BIAS. At screen angle 0 the old form used omega.x and
     * omega.z and never touched omega.y, so gamma's zero-offset could not be
     * estimated — the report shows `gamma 0.00 deg/s` after 207 samples beside
     * two siblings that had both learned one. `r` uses it now.
     */
    const p = -omega.z; // roll rate, about the nose
    const q = omega.x; //  pitch rate, about the right wing
    const r = -omega.y; // yaw rate, about the belly

    const phi = degToRad(roll);
    const theta = degToRad(pitch);
    /**
     * tan θ is unbounded at ±90°, where Euler roll is not merely large but
     * UNDEFINED — a nose-vertical attitude has no roll angle to speak of. Every
     * Euler-based AHRS clamps here; the alternative is a quaternion state, which
     * is the right answer and is not a change to make on a filter this app's
     * whole horizon depends on without hardware to test it against.
     *
     * At the clamp the propagation stops being trustworthy, which is exactly
     * when the accelerometer should be believed instead — and it is, because a
     * device held nose-up is not accelerating and the static path takes over.
     */
    const tanTheta = Math.max(-cfg.tanPitchClamp, Math.min(cfg.tanPitchClamp, Math.tan(theta)));

    pitch += (q * Math.cos(phi) - r * Math.sin(phi)) * dt;
    roll += (p + (q * Math.sin(phi) + r * Math.cos(phi)) * tanTheta) * dt;
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
          // The state being discarded is the state `aligned` vouched for, and
          // the NEXT sample re-seeds the filter outright — one accelerometer
          // reading, validated by nothing. Leaving `aligned` set had the
          // direction gate defending that seed as a gyro reference for a full
          // window, rejecting TRUE gravity the whole time. Every other path
          // that nulls the state clears the flag; this one now does too.
          aligned = false;
          disagreeSince = null;
          disagreeSpent = false;
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
      // A SAMPLE VIOLENT ENOUGH TO BE REJECTED IS NOT A STILL DEVICE.
      //
      // This path returned before stillness was recomputed, so `stillSince`
      // kept whatever it last held and `still` stayed TRUE right through a
      // manoeuvre — the filter was rejecting samples for being too violent
      // while simultaneously reporting the device was sitting on a desk.
      //
      // That is much worse than it sounds now that the vertical-speed
      // integrator keys its ZERO-VELOCITY UPDATE off this flag: a real climb
      // rough enough to reject samples would have been told its vertical speed
      // was zero. A ZUPT firing during a manoeuvre is the one thing a ZUPT must
      // never do.
      stillSince = null;
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

    // THE DIRECTION GATE, and why magnitude alone was the wrong discriminator.
    //
    // An accelerometer measures SPECIFIC FORCE: gravity plus every linear
    // acceleration of the hand holding it. Lean a phone back and forth and the
    // measured vector SWINGS while its magnitude stays near one g — the
    // corruption rotates the vector, it does not stretch it. Hand-held, tipping
    // the device fore and aft threw the horizon like a launch: measured at
    // 1.01 g beside a 26.7° residual, so the magnitude gate
    // above never fired while the direction was badly wrong.
    //
    // The instrument that CAN see it is the gyro: over seconds it is the more
    // trustworthy of the two. When the gravity solution departs from the
    // gyro-propagated attitude by more than accelGateDeg, the sample is
    // rejected and the filter coasts — the same innovation gating a Kalman
    // AHRS applies to its accelerometer measurements.
    //
    // Three clauses keep this from re-creating the standoffs this filter has
    // already had (NOTES 0.3.0, 0.4.3), and each has a test:
    //   aligned — before the first static alignment the gyro state is not a
    //     reference, so there is nothing to disagree WITH;
    //   !still — a still device cannot be accelerating: a steady rate under
    //     the floor AND a steady one g leave no room for linear acceleration,
    //     so a large residual while STILL means the STATE is wrong and gravity
    //     must win. That is ramp alignment — the recovery path — and gating it
    //     away would lock a diverged filter out for ever;
    //   the window — the gyro's trust is bounded. Past disagreeCoastMs the
    //     accelerometer is the only absolute reference left, so it wins even
    //     though it disagrees, which forecloses the permanent standoff.
    const disagreeDeg = Math.max(Math.abs(dPitch), Math.abs(dRoll));
    // Stillness the gate can trust is stillness that has LASTED. The
    // instantaneous flag above is one gyro sample beside one accel sample —
    // and rhythmic leaning crosses zero rate at every
    // reversal, which is precisely where the translational corruption peaks.
    // The corrupted sample presents as "still" for that instant and would
    // bypass the gate at the settled gain, three times the in-motion one.
    // Held for alignHoldMs it is a different fact: sustained low rate beside a
    // sustained one g leaves no room for linear acceleration.
    const stillHeld = stillSince !== null && at - stillSince >= cfg.alignHoldMs;
    if (aligned && !stillHeld && disagreeDeg > cfg.accelGateDeg) {
      if (disagreeSince === null) disagreeSince = at;
      // BOTH clocks, because staleness runs on lastAccepted. Bounding only the
      // private window let a magnitude-gated coast and a direction-gated one
      // STACK past maxCoastMs and cross the horizon out — a regression the
      // ungated filter did not have. The gyro's trust is one budget, whichever
      // gate is spending it, so the window closes when either clock expires.
      // SPENT IS A LATCH. The first version checked both clocks per sample —
      // and the budget-escape ACCEPTANCE refreshes lastAccepted, which re-armed
      // the rejection at one corrected sample per window: the standoff again,
      // rebuilt out of its own cure. Caught by the ONE TRUST BUDGET test, whose
      // filter ended 0.6° into a 30° correction — exactly one sample's worth.
      if (at - disagreeSince > cfg.disagreeCoastMs || at - lastAccepted > cfg.disagreeCoastMs) {
        disagreeSpent = true;
      }
      if (!disagreeSpent) {
        rejecting = true;
        // The MEASUREMENT, not a diagnosis. "Accelerating" was the first
        // wording, and it asserts a cause the gate cannot verify — a diverged
        // state during smooth motion produces the same signature with no
        // acceleration at all. The groundspeed reason that could not tell two
        // causes apart is already recorded in this repo as a defect; the
        // number is the honest part.
        reason = `gravity ${Math.round(disagreeDeg)}° from the gyro — coasting on gyro`;
        return;
      }
      // Window expired: fall through and ACCEPT. disagreeSince stays set on
      // purpose — acceptance continues until the disagreement itself has been
      // corrected away. Re-arming per accepted sample would readmit the
      // standoff at a rate of one corrected sample per window.
    } else {
      disagreeSince = null;
      disagreeSpent = false;
    }
    /**
     * ONCE THE GATE HAS CONCEDED, IT CONCEDES PROPERLY.
     *
     * The failure it was written for: the ADI reading
     * `gravity 51° from the gyro — coasting on gyro` while the horizon sat
     * dozens of degrees over.
     *
     * `disagreeSpent` is the filter CONCLUDING that its own propagated state is
     * the wrong one — the gyro's trust is bounded and has run out. Having
     * concluded that, it went on correcting at the in-motion gain of two
     * percent a sample, which from fifty degrees is another four seconds of a
     * horizon that is visibly wrong and that the filter already knows is wrong.
     * Four seconds of coasting plus four of creeping is the eight-second window
     * that was photographed.
     *
     * A DELIBERATE ASYMMETRY, not a general speed-up. Inside the window nothing
     * changes: a hand-held lean still tracks the gyro, which is the whole point
     * of the gate and is what the ROCKET tests hold. This only applies after
     * the filter has stopped believing itself.
     */
    const conceded = disagreeSpent;

    // A STILL DEVICE IS CORRECTED HARD. The complementary weight exists to stop
    // the accelerometer's every bump reaching the horizon while the aircraft is
    // moving; with nothing moving there is no bump to reject and nothing for the
    // gyro to contribute, so creeping toward the answer at two percent a sample
    // is just a slow horizon for no benefit.
    // Fast to ALIGN, gentle once aligned, slow while moving. See settledAlpha.
    const gain = conceded
      ? 1 - cfg.staticAlpha
      : still
        ? aligned
          ? 1 - cfg.settledAlpha
          : 1 - cfg.staticAlpha
        : 1 - cfg.alpha;
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
    // what a real phone was reporting as "converging (residual 14.8 deg)".
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
    // ANTI-WINDUP, and it is why `alpha -10.00` will not happen again. See
    // biasGateDeg. A residual this large is not evidence about the gyro.
    const explainable = Math.max(Math.abs(dPitch), Math.abs(dRoll)) <= cfg.biasGateDeg;
    const ts = degToRad(screenAngleDeg ?? 0);
    const ki = explainable ? cfg.biasKi * (gain / (1 - cfg.alpha)) : 0;
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
    //      was measuring hand-shake. a real device reported "converging
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

      // THE LAST MOMENT THIS THING WAS STILL, remembered as it happens.
      //
      // Levelling used to read stillness at the instant the button was pressed,
      // which is the one instant guaranteed to be disturbed — the press IS the
      // disturbance. On a tablet it never succeeded — tapping the button wiggles
      // the device too much for the capture to work. A cradled device is still right
      // up until a finger reaches it, so the reference worth capturing is the
      // one from just BEFORE the touch.
      //
      // Recorded HERE, in the update path, and deliberately not in read(): a
      // filter must know when it was last still whether or not anything has
      // asked it. Recording on read made it depend on somebody polling, which
      // is true in the app by accident and was false the moment a test drove
      // the filter directly.
      lastStillAttitude = { pitch: solved.pitch, roll: solved.roll, at };
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
    /**
     * The most recent attitude solved while the device was genuinely still,
     * with the time it was taken. Levelling reads THIS rather than the instant
     * of the button press, because the press is itself the disturbance.
     * Null until the device has been still at least once.
     */
    get lastStillAttitude() {
      return lastStillAttitude;
    },

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
      // Conflating the two put a permanent red cross over the horizon on a real
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
         * WHY THERE IS NO HEADING, AND THE TWO ANSWERS ARE NOT THE SAME FACT.
         *
         * `hasHeading` goes false for two unrelated reasons and the panel used
         * one sentence for both: "this device reports no magnetic heading".
         *
         * On a real phone that sentence was FALSE. The diagnostic report
         * carried `webkitCompassHeading 278.3` in the raw block and `heading
         * 279.5` in this filter, three lines above the panel asserting the
         * phone had no compass. The compass had simply stopped sending updates
         * — the page had been in the background — and a claim about the
         * HARDWARE was manufactured from a claim about the last five seconds.
         *
         * A reason string is a value like any other on this panel. Inventing
         * one is the same defect as inventing a number, and it is worse in one
         * respect: a wrong number looks wrong, and a confident wrong sentence
         * sends the reader off to replace a sensor that works.
         */
        headingReason:
          heading === null
            ? 'this device reports no magnetic heading'
            : `the compass stopped updating ${Math.round((at - lastHeadingAt) / 1000)}s ago — the reading it last gave was ${heading.toFixed(0)}°`,
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
