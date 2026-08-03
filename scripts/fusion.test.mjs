import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyScreenAngle,
  attitudeFromGravity,
  attitudeFromMatrix,
  createFusion,
  DEFAULTS,
  matrixFromEuler,
  screenToDevice,
  detectAccelSign,
  applyMatrix3,
  transpose3,
  rotationAligning,
  mountFromReference,
  mountAnglesDeg,
  LEVEL_UP,
  turnRateFromRates,
  upVectorScreenFrame,
} from '../public/src/core/fusion.js';
import { G0 } from '../public/src/core/units.js';
import { resolveScreenAngle } from '../public/src/sensors/orientation.js';

/**
 * THE SIGN TEST, and it is the reason this file exists.
 *
 * There are two independent routes to pitch and roll: the orientation event's
 * Euler angles through a rotation matrix, and the accelerometer's gravity
 * vector. A transposed matrix or a flipped axis makes ONE of them mirror every
 * roll — and either one alone looks completely plausible on screen. Deriving
 * the gravity vector FROM the matrix and asserting both routes agree is what
 * pins the signs down; guessing them and eyeballing the horizon is not.
 */
const gravityFromMatrix = (R) => {
  // Earth-up is (0,0,1) in ENU. R maps device -> earth, so R^T maps earth ->
  // device, and (R^T · up) is the third ROW of R — not the third column, which
  // is the device's own z axis expressed in earth coordinates. Taking the
  // column instead is how the first version of this test accused correct code
  // of disagreeing with itself: when a result looks absurd, suspect the
  // instrument first.
  const up = [R[2][0], R[2][1], R[2][2]];
  return { x: up[0] * G0, y: up[1] * G0, z: up[2] * G0 };
};

test('matrix and gravity agree on pitch and roll, for every attitude tested', () => {
  for (const alpha of [0, 45, 200, 355]) {
    for (const beta of [-40, -10, 0, 15, 60]) {
      for (const gamma of [-50, -20, 0, 25, 70]) {
        const R = matrixFromEuler(alpha, beta, gamma);
        const fromMatrix = attitudeFromMatrix(R);
        const fromGravity = attitudeFromGravity(gravityFromMatrix(R), 0);

        assert.ok(fromGravity, `gravity solution missing for ${alpha}/${beta}/${gamma}`);
        assert.ok(
          Math.abs(fromMatrix.pitch - fromGravity.pitch) < 1e-6,
          `pitch disagrees at ${alpha}/${beta}/${gamma}: ${fromMatrix.pitch} vs ${fromGravity.pitch}`,
        );
        // Roll wraps, so compare the shortest way round.
        const dRoll = ((fromMatrix.roll - fromGravity.roll + 540) % 360) - 180;
        assert.ok(
          Math.abs(dRoll) < 1e-6,
          `roll disagrees at ${alpha}/${beta}/${gamma}: ${fromMatrix.roll} vs ${fromGravity.roll}`,
        );
      }
    }
  }
});

test('THE CONVENTION: right wing down is a POSITIVE roll, nose up a POSITIVE pitch', () => {
  // Self-consistency between two derivations is not the same as being right.
  // These two assertions pin the aviation convention itself, so a future
  // refactor that mirrors both routes together still fails here.
  //
  // Right wing down: earth-up leans toward the LEFT of the screen, so the
  // accelerometer's x component is negative.
  const rightWingDown = attitudeFromGravity({ x: -G0 * Math.sin(0.5), y: G0 * Math.cos(0.5), z: 0 }, 0);
  assert.ok(rightWingDown.roll > 0, `right wing down gave roll ${rightWingDown.roll}`);

  // Nose up: the panel tips back, so earth-up gains a component INTO the
  // screen, which is the negative z direction.
  const noseUp = attitudeFromGravity({ x: 0, y: G0 * Math.cos(0.3), z: -G0 * Math.sin(0.3) }, 0);
  assert.ok(noseUp.pitch > 0, `nose up gave pitch ${noseUp.pitch}`);
});

test('a level, north-facing panel reads zero pitch, zero roll, north', () => {
  // The panel is clamped vertical with the screen facing the pilot: beta 90.
  const R = matrixFromEuler(0, 90, 0);
  const a = attitudeFromMatrix(R);
  assert.ok(Math.abs(a.pitch) < 1e-9, `pitch ${a.pitch}`);
  assert.ok(Math.abs(a.roll) < 1e-9, `roll ${a.roll}`);
  assert.ok(Math.abs(a.heading) < 1e-9 || Math.abs(a.heading - 360) < 1e-9, `heading ${a.heading}`);
});

test('up-vector and gravity solutions are exact inverses', () => {
  for (const pitch of [-45, -8, 0, 12, 60]) {
    for (const roll of [-120, -30, 0, 25, 150]) {
      const up = upVectorScreenFrame(pitch, roll);
      const solved = attitudeFromGravity({ x: up.x * G0, y: up.y * G0, z: up.z * G0 }, 0);
      assert.ok(Math.abs(solved.pitch - pitch) < 1e-9, `pitch ${pitch} -> ${solved.pitch}`);
      const dRoll = ((solved.roll - roll + 540) % 360) - 180;
      assert.ok(Math.abs(dRoll) < 1e-9, `roll ${roll} -> ${solved.roll}`);
    }
  }
});

test('the screen-angle rotation round-trips', () => {
  const v = { x: 0.3, y: -0.7, z: 0.2 };
  for (const angle of [0, 90, 180, 270]) {
    const back = screenToDevice(v, angle);
    const forward = attitudeFromGravity({ x: back.x * G0, y: back.y * G0, z: back.z * G0 }, angle);
    const direct = attitudeFromGravity({ x: v.x * G0, y: v.y * G0, z: v.z * G0 }, 0);
    assert.ok(Math.abs(forward.pitch - direct.pitch) < 1e-9, `angle ${angle} pitch`);
  }
});

test('applyScreenAngle at zero degrees is the identity', () => {
  const R = matrixFromEuler(30, 20, 10);
  const S = applyScreenAngle(R, 0);
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) assert.ok(Math.abs(R[i][j] - S[i][j]) < 1e-12);
});

test('turn rate projects onto earth-up, not onto a fixed device axis', () => {
  // Panel mounted vertical: earth-up is the device +Y axis, so a pure yaw shows
  // up in rotationRate.gamma. The base spec's straight alpha mapping would read
  // ZERO here, which is the whole reason this projection exists.
  const gravity = { x: 0, y: G0, z: 0 };
  const rate = turnRateFromRates({ alpha: 0, beta: 0, gamma: 3 }, gravity);
  assert.equal(rate, 3);

  // Lying flat, earth-up is +Z and it reduces to exactly alpha, so nothing is
  // lost against the spec's mapping in the case that mapping was written for.
  const flat = turnRateFromRates({ alpha: 3, beta: 0, gamma: 0 }, { x: 0, y: 0, z: G0 });
  assert.equal(flat, 3);
});

test('turn rate refuses an incomplete rotation rate', () => {
  assert.equal(turnRateFromRates({ alpha: 1, beta: null, gamma: 2 }, { x: 0, y: G0, z: 0 }), null);
  assert.equal(turnRateFromRates(null, { x: 0, y: G0, z: 0 }), null);
  assert.equal(turnRateFromRates({ alpha: 1, beta: 1, gamma: 1 }, { x: 0, y: 0, z: 0 }), null);
});

test('a filter that has not converged reports FAIL and no attitude', () => {
  const fusion = createFusion();
  const read = fusion.read(0);
  assert.equal(read.converged, false);
  assert.equal(read.pitch, null);
  assert.ok(read.reason, 'an unconverged filter must say why');
});

test('the filter converges on steady level input and then reports it', () => {
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, level, t);
    fusion.updateAccel(level, 0, t);
  }
  const read = fusion.read(t);
  assert.equal(read.converged, true, `not converged: ${read.reason}`);
  assert.ok(Math.abs(read.pitch) < 0.5, `pitch drifted to ${read.pitch}`);
  assert.ok(Math.abs(read.roll) < 0.5, `roll drifted to ${read.roll}`);
  assert.equal(read.reason, null);
});

test('MANOEUVRING REJECTS THE ACCEL CORRECTION — the horizon does not tip in a turn', () => {
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, level, t);
    fusion.updateAccel(level, 0, t);
  }
  const before = fusion.read(t).roll;

  // 1.5 g pulled at 40 degrees of apparent bank: exactly the reading that makes
  // a naive filter roll the horizon over and be confidently wrong.
  const manoeuvre = { x: G0 * 1.5 * Math.sin(0.7), y: G0 * 1.5 * Math.cos(0.7), z: 0 };
  for (let i = 0; i < 20; i += 1) {
    t += 20;
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, manoeuvre, t);
    fusion.updateAccel(manoeuvre, 0, t);
  }
  const during = fusion.read(t);
  assert.equal(during.rejecting, true, 'the gate did not reject a 1.5 g sample');
  assert.ok(Math.abs(during.roll - before) < 0.01, `roll moved ${during.roll - before} degrees on rejected samples`);
  assert.match(during.reason ?? '', /manoeuvring/);
});

test('coasting too long without a gravity reference loses convergence', () => {
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    fusion.updateAccel(level, 0, t);
  }
  assert.equal(fusion.read(t).converged, true);
  // No further accepted samples for longer than maxCoastMs.
  assert.equal(fusion.read(t + 6000).converged, false);
  assert.ok(fusion.read(t + 6000).reason);
});

test('the gyro refuses to integrate across a backgrounding gap', () => {
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    fusion.updateAccel(level, 0, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, level, t);
  }
  const before = fusion.read(t).pitch;
  // A four-second gap with a 30 deg/s rate would slew the horizon 120 degrees
  // if it were integrated. It must not be.
  fusion.updateGyro({ alpha: 0, beta: 30, gamma: 0 }, level, t + 4000);
  assert.equal(fusion.read(t + 4000).pitch, before);
});

test('heading blends the short way round the 360/0 seam', () => {
  const fusion = createFusion();
  fusion.updateHeading(359, 0);
  fusion.updateHeading(1, 20);
  const h = fusion.read(20).heading;
  // The shortest path from 359 to 1 goes UP through 360, so a 2% blend lands
  // just above 359 — never down through 180.
  assert.ok(h > 359 || h < 1, `heading walked the long way: ${h}`);
});

test('reset clears everything, including convergence', () => {
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    fusion.updateAccel(level, 0, t);
  }
  assert.equal(fusion.read(t).converged, true);
  fusion.reset('backgrounded');
  const read = fusion.read(t);
  assert.equal(read.converged, false);
  assert.equal(read.pitch, null);
  assert.equal(read.reason, 'backgrounded');
});

/* ---------------------------------------------------------------------------
 * The tests below exist because the fifteen above ALL passed while the filter
 * could not converge on a real device. Every one of them fed a ZERO rotation
 * rate, so the gyro's sign was never exercised: the gyro contributed nothing,
 * the accelerometer alone was correct, and a sign error in the integration was
 * invisible. A test that never moves cannot find a bug about movement.
 * ------------------------------------------------------------------------- */

/** Fly a rotation where the gyro and the accelerometer are made CONSISTENT with
 *  each other, and see whether the filter tracks it. */
function flyRotation({ pitchRateDegS = 0, rollRateDegS = 0, seconds = 3, hz = 50, jitterDeg = 0 }) {
  const fusion = createFusion();
  const dt = 1 / hz;
  let t = 0;
  let pitch = 0;
  let roll = 0;
  // Deterministic pseudo-jitter: a real hand shakes, and Math.random is banned
  // from these scripts anyway.
  let seed = 1;
  const wobble = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return ((seed / 2147483648) * 2 - 1) * jitterDeg;
  };

  for (let i = 0; i < seconds * hz; i += 1) {
    t += dt * 1000;
    pitch += pitchRateDegS * dt;
    roll += rollRateDegS * dt;

    // Ground truth gravity for this attitude, plus any hand wobble.
    const up = upVectorScreenFrame(pitch + wobble(), roll + wobble());
    const accel = { x: up.x * G0, y: up.y * G0, z: up.z * G0 };

    // THE RATES THAT PRODUCE THAT ROTATION, from the derivation in fusion.js:
    // nose-up is POSITIVE beta, right-wing-down is NEGATIVE alpha.
    fusion.updateGyro({ alpha: -rollRateDegS, beta: pitchRateDegS, gamma: 0 }, accel, t, 0);
    fusion.updateAccel(accel, 0, t);
  }
  return { fusion, read: fusion.read(t), truePitch: pitch, trueRoll: roll };
}

test('THE GYRO AND THE ACCELEROMETER AGREE THROUGH A ROLL — they used to fight', () => {
  const { read, trueRoll } = flyRotation({ rollRateDegS: 10, seconds: 3 });
  assert.equal(read.converged, true, `never converged: ${read.reason}`);
  assert.ok(
    Math.abs(read.roll - trueRoll) < 2,
    `rolled to ${trueRoll} deg, filter says ${read.roll?.toFixed(1)} — the gyro is fighting the accelerometer`,
  );
});

test('the gyro and the accelerometer agree through a pitch change', () => {
  const { read, truePitch } = flyRotation({ pitchRateDegS: 8, seconds: 3 });
  assert.equal(read.converged, true, `never converged: ${read.reason}`);
  assert.ok(
    Math.abs(read.pitch - truePitch) < 2,
    `pitched to ${truePitch} deg, filter says ${read.pitch?.toFixed(1)}`,
  );
});

test('IT CONVERGES IN A SHAKY HAND — the old check measured hand-shake, not convergence', () => {
  // Four degrees of continuous wobble is roughly what holding a phone produces,
  // and it is what left Noah's device reporting "converging (residual 3.9 deg)"
  // thirteen minutes after boot.
  const { read } = flyRotation({ seconds: 4, jitterDeg: 4 });
  assert.equal(read.converged, true, `a hand-held device never converged: ${read.reason}`);
  assert.ok(Math.abs(read.pitch) < 3, `pitch wandered to ${read.pitch}`);
  assert.ok(Math.abs(read.roll) < 3, `roll wandered to ${read.roll}`);
});

test('a device rotated in landscape still converges — the screen angle reaches the gyro', () => {
  // The mounting this app is actually for. If the screen-angle transform is
  // missing from the gyro path, the two halves of the filter disagree by 90
  // degrees and this never settles.
  const fusion = createFusion();
  const dt = 1 / 50;
  let t = 0;
  let pitch = 0;
  for (let i = 0; i < 150; i += 1) {
    t += dt * 1000;
    pitch += 8 * dt;
    const up = upVectorScreenFrame(pitch, 0);
    // Screen rotated 90 degrees inside the hardware: the device-frame vector is
    // the screen-frame one rotated back.
    const dev = screenToDevice(up, 90);
    const accel = { x: dev.x * G0, y: dev.y * G0, z: dev.z * G0 };
    // A pitch rate about the SCREEN x axis appears on the device's y axis, and
    // NEGATED: at a quarter turn the screen x axis is the device's -y.
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: -8 }, accel, t, 90);
    fusion.updateAccel(accel, 90, t);
  }
  const read = fusion.read(t);
  assert.equal(read.converged, true, `landscape mount never converged: ${read.reason}`);
  assert.ok(Math.abs(read.pitch - pitch) < 2, `pitched to ${pitch}, filter says ${read.pitch?.toFixed(1)}`);
});

/* ---------------------------------------------------------------------------
 * THE UPSIDE-DOWN HORIZON.
 *
 * iOS Safari reports accelerationIncludingGravity NEGATED relative to the W3C
 * convention that Chrome follows. Unhandled, the artificial horizon renders
 * rotated 180 degrees — ground on top, sky underneath — which is exactly what
 * Noah's iPhone showed. Every test above used the W3C convention, so not one of
 * them could see it.
 * ------------------------------------------------------------------------- */

/** Fly the same attitude under a given platform convention. */
function flyUnderConvention(sign, { pitch = 0, roll = 0, seconds = 3, hz = 50 } = {}) {
  const fusion = createFusion();
  const dt = 1 / hz;
  let t = 0;
  const up = upVectorScreenFrame(pitch, roll);
  for (let i = 0; i < seconds * hz; i += 1) {
    t += dt * 1000;
    // The orientation event is platform-consistent, and reports the true tilt.
    const betaGamma = tiltFromUp(up);
    fusion.noteTilt(betaGamma.beta, betaGamma.gamma);
    const accel = { x: up.x * G0 * sign, y: up.y * G0 * sign, z: up.z * G0 * sign };
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, accel, t, 0);
    fusion.updateAccel(accel, 0, t);
  }
  return { read: fusion.read(t), sign: fusion.accelSign };
}

/** Inverse of upFromTilt, for building test fixtures. */
function tiltFromUp(up) {
  const beta = (Math.asin(Math.max(-1, Math.min(1, up.y))) * 180) / Math.PI;
  const gamma = (Math.atan2(-up.x, up.z) * 180) / Math.PI;
  return { beta, gamma };
}

test('THE W3C CONVENTION still reads the right way up', () => {
  const { read, sign } = flyUnderConvention(+1, { pitch: 6, roll: 12 });
  assert.equal(sign, 1, 'should have detected the W3C convention');
  assert.equal(read.converged, true, `did not converge: ${read.reason}`);
  assert.ok(Math.abs(read.pitch - 6) < 1.5, `pitch ${read.pitch}`);
  assert.ok(Math.abs(read.roll - 12) < 1.5, `roll ${read.roll}`);
});

test('AN iOS DEVICE IS NOT UPSIDE DOWN — the negated accelerometer is detected', () => {
  const { read, sign } = flyUnderConvention(-1, { pitch: 6, roll: 12 });
  assert.equal(sign, -1, 'should have detected the negated (iOS) convention');
  assert.equal(read.converged, true, `did not converge: ${read.reason}`);
  // Without the detection these come out as pitch -6, roll -168: the horizon
  // rotated 180 degrees, which is what shipped.
  assert.ok(Math.abs(read.pitch - 6) < 1.5, `pitch ${read.pitch}, expected about 6 — horizon is inverted`);
  assert.ok(Math.abs(read.roll - 12) < 1.5, `roll ${read.roll}, expected about 12 — horizon is inverted`);
});

test('an upright phone in portrait reads level under BOTH conventions', () => {
  // The exact case in the screenshot: held upright, portrait, screen facing the
  // user. Level, both ways.
  for (const sign of [1, -1]) {
    const { read } = flyUnderConvention(sign, { pitch: 0, roll: 0 });
    assert.ok(Math.abs(read.roll) < 1.5, `sign ${sign} gave roll ${read.roll} — 180 means ground on top`);
    assert.ok(Math.abs(read.pitch) < 1.5, `sign ${sign} gave pitch ${read.pitch}`);
  }
});

test('the sign is not latched from an ambiguous sample', () => {
  // Edge-on, where the accelerometer and the tilt vector are near perpendicular
  // and the comparison is noise. Guessing there would latch a coin toss.
  assert.equal(detectAccelSign({ x: G0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), null);
  assert.equal(detectAccelSign({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), null);
  assert.equal(detectAccelSign({ x: 0, y: G0, z: 0 }, null), null);
});

// --- static alignment, and the standoff that made the horizon a red X --------
//
// Every test above this line feeds a PERFECT gyro: a rotation rate of exactly
// zero when the device is not turning. No real gyroscope does that. They read a
// degree or two per second while sitting on a desk, and the filter integrates
// it. That single missing property is why twenty-three passing tests coexisted
// with a horizon that Noah watched stay crossed out.

/** Drive the filter with a level device whose gyro has a constant zero-offset.
 *  `biasDegS` is what the gyro reports while nothing is actually rotating. */
const runLevelWithGyroBias = (fusion, { biasDegS = 0, seconds = 20, stepMs = 20, screenAngle = 0 } = {}) => {
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  for (let i = 0; i < (seconds * 1000) / stepMs; i += 1) {
    t += stepMs;
    fusion.updateAccel(level, screenAngle, t);
    fusion.updateGyro({ alpha: biasDegS, beta: biasDegS, gamma: 0 }, level, t, screenAngle);
  }
  return t;
};

test('THE HORIZON EXISTS FROM THE FIRST GRAVITY SAMPLE — it does not wait to converge', () => {
  const fusion = createFusion();
  fusion.updateAccel({ x: 0, y: G0, z: 0 }, 0, 20);
  const read = fusion.read(20);

  // The panel has an attitude to draw immediately. Gravity IS a measurement of
  // which way is down; making the horizon wait on the gyro was conflating the
  // filter's steadiness with the existence of an answer.
  assert.equal(read.hasAttitude, true, 'no attitude after a good gravity sample');
  assert.ok(Math.abs(read.pitch) < 0.001, `pitch ${read.pitch}`);
  assert.ok(Math.abs(read.roll) < 0.001, `roll ${read.roll}`);

  // ...and it is honest about what it is: gravity alone, not yet gyro-backed.
  assert.equal(read.quality, 'COARSE');
  assert.equal(read.converged, false);
  assert.ok(read.reason, 'a coarse attitude must still say what it is');
});

test('REGRESSION: a gyro with a real zero-offset no longer holds the horizon crossed out', () => {
  // 3 deg/s is an ordinary, unremarkable phone gyro offset. Under the old
  // filter it produced a permanent standoff at residual = offset / (rate x
  // (1 - alpha)) = 3 degrees, which never fell under the 2-degree convergence
  // threshold — so `converged` stayed false for ever and every consumer
  // rendered FAIL. That is the defect this whole test exists for.
  const fusion = createFusion();
  const t = runLevelWithGyroBias(fusion, { biasDegS: 3, seconds: 20 });
  const read = fusion.read(t);

  assert.equal(read.hasAttitude, true, 'the horizon vanished under an ordinary gyro offset');
  assert.equal(read.converged, true, `never converged: ${read.reason}`);
  assert.equal(read.quality, 'ALIGNED');
  assert.ok(Math.abs(read.pitch) < 0.5, `pitch drifted to ${read.pitch} against a biased gyro`);
  assert.ok(Math.abs(read.roll) < 0.5, `roll drifted to ${read.roll} against a biased gyro`);
});

test('the gyro zero-offset is LEARNED, on the axes the gyro actually reports', () => {
  const fusion = createFusion();
  const t = runLevelWithGyroBias(fusion, { biasDegS: 3, seconds: 40 });
  const learned = fusion.gyroBias;

  assert.ok(learned, 'no offset was estimated at all');
  // The filter is told 3 deg/s on alpha and beta and 0 on gamma, and must
  // recover each separately — an estimate that smeared one axis into another
  // would still cancel the drift here while being wrong the moment the device
  // was clamped at a different angle.
  assert.ok(Math.abs(learned.alpha - 3) < 0.6, `alpha offset estimated at ${learned.alpha}, expected ~3`);
  assert.ok(Math.abs(learned.beta - 3) < 0.6, `beta offset estimated at ${learned.beta}, expected ~3`);
  assert.ok(Math.abs(learned.gamma) < 0.6, `gamma offset estimated at ${learned.gamma}, expected ~0`);
  assert.equal(fusion.read(t).converged, true);
});

test('the offset is learned in DEVICE axes, so a landscape clamp gets it right too', () => {
  // Screen angle 90: the screen's pitch axis is the device's gamma axis. An
  // estimate kept in screen coordinates would land on the wrong axis here and
  // the test above would not notice, because at angle 0 the two coincide.
  const fusion = createFusion();
  // The accelerometer reports in DEVICE axes, so a device level at a 90 degree
  // screen angle reads earth-up along +x: the screen's top edge is the device's
  // +x when the device is turned a quarter turn. Derived, not guessed — and it
  // changed sign when the screen rotation was corrected against Noah's iPad.
  const levelInLandscape = { x: G0, y: 0, z: 0 };
  let t = 0;
  for (let i = 0; i < 2000; i += 1) {
    t += 20;
    fusion.updateAccel(levelInLandscape, 90, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: -4 }, levelInLandscape, t, 90);
  }
  const learned = fusion.gyroBias;
  assert.ok(Math.abs(learned.gamma - -4) < 0.8, `gamma offset ${learned.gamma}, expected ~-4`);
  assert.ok(Math.abs(learned.beta) < 0.8, `beta offset ${learned.beta} should be ~0 at a 90 degree screen angle`);
  assert.ok(Math.abs(fusion.read(t).pitch) < 0.8, `pitch drifted to ${fusion.read(t).pitch}`);
});

test('a still device ALIGNS quickly rather than creeping toward the answer', () => {
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  // One second of a motionless device, which is how this panel spends most of
  // its life: clamped to a desk.
  for (let i = 0; i < 50; i += 1) {
    t += 20;
    fusion.updateAccel(level, 0, t);
    fusion.updateGyro({ alpha: 0.4, beta: -0.3, gamma: 0.2 }, level, t);
  }
  const read = fusion.read(t);
  assert.equal(read.still, true, 'a motionless device was not recognised as still');
  assert.equal(read.quality, 'ALIGNED', `quality ${read.quality} after a second at rest: ${read.reason}`);
  assert.equal(read.reason, null, 'an aligned filter at rest has nothing to report');
});

test('a device being waved about is NOT called still', () => {
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  let t = 0;
  for (let i = 0; i < 50; i += 1) {
    t += 20;
    fusion.updateAccel(level, 0, t);
    fusion.updateGyro({ alpha: 40, beta: 0, gamma: 0 }, level, t);
  }
  assert.equal(fusion.read(t).still, false, 'a 40 deg/s rotation was mistaken for a desk');
});

test('HONESTY IS NOT WEAKENED: losing gravity entirely still removes the attitude', () => {
  // The change above makes the horizon appear sooner. It must not make it
  // linger. A filter with no gravity reference for longer than the coast limit
  // has an attitude that is pure dead reckoning on a phone gyro, and that is
  // FAIL — not a coarse attitude, not a stale one.
  const fusion = createFusion();
  const t = runLevelWithGyroBias(fusion, { biasDegS: 0, seconds: 5 });
  assert.equal(fusion.read(t).hasAttitude, true);

  const later = t + 6000;
  const read = fusion.read(later);
  assert.equal(read.hasAttitude, false, 'attitude survived a six-second gravity outage');
  assert.equal(read.converged, false);
  assert.equal(read.quality, null);
  assert.match(read.reason ?? '', /no gravity reference/);
});

test('the compass fails SEPARATELY from the accelerometer', () => {
  // A device with a working magnetometer and a sulking accelerometer used to
  // cross out a heading it genuinely had, because heading rode on the
  // accelerometer's freshness. They are different sensors failing separately.
  const fusion = createFusion();
  fusion.updateHeading(120, 1000);
  const read = fusion.read(1000);
  assert.equal(read.hasHeading, true, 'a fresh compass reading was not reported');
  assert.equal(read.hasAttitude, false, 'no accelerometer has spoken, so there is no attitude');

  // And the heading ages out on its own clock.
  assert.equal(fusion.read(1000 + 6000).hasHeading, false);
});

// --- mounting offset (boresight calibration) ---------------------------------

/** The gravity vector a device reads at a given pitch and roll — the exact
 *  inverse of attitudeFromGravity, which is what makes these tests round-trip
 *  rather than restate the implementation. */
const gravityAt = (pitchDeg, rollDeg) => {
  const u = upVectorScreenFrame(pitchDeg, rollDeg);
  return { x: u.x * G0, y: u.y * G0, z: u.z * G0 };
};

test('a levelled mount reads ZERO at the attitude it was levelled in', () => {
  for (const [p, r] of [
    [18, 0],
    [0, 12],
    [22, -9],
    [-30, 25],
    [5, -40],
  ]) {
    const ref = upVectorScreenFrame(p, r);
    const mount = mountFromReference(ref);
    assert.ok(mount, `no mount for ${p}/${r}`);
    const solved = attitudeFromGravity(gravityAt(p, r), 0, mount);
    assert.ok(Math.abs(solved.pitch) < 1e-6, `pitch ${solved.pitch} at mount ${p}/${r}`);
    assert.ok(Math.abs(solved.roll) < 1e-6, `roll ${solved.roll} at mount ${p}/${r}`);
  }
});

test('THE REASON IT IS A ROTATION: subtracting the angles is wrong when BOTH are non-zero', () => {
  // A cradle 20 degrees nose-up and 15 degrees rolled — an ordinary car mount.
  const mountPitch = 20;
  const mountRoll = 15;
  const mount = mountFromReference(upVectorScreenFrame(mountPitch, mountRoll));

  // Now the car itself pitches up 10 and rolls right 8.
  // Compose the two rotations properly: the device sees the vehicle attitude
  // THROUGH its own mounting, so the true reading is the mount applied to the
  // vehicle's up vector.
  const vehicleUp = upVectorScreenFrame(10, 8);
  const measured = applyMatrix3(transpose3(mount), vehicleUp);
  const solved = attitudeFromGravity({ x: measured.x * G0, y: measured.y * G0, z: measured.z * G0 }, 0, mount);

  assert.ok(Math.abs(solved.pitch - 10) < 1e-6, `pitch ${solved.pitch}, expected 10`);
  assert.ok(Math.abs(solved.roll - 8) < 1e-6, `roll ${solved.roll}, expected 8`);

  // And the naive version — subtract the mount angles from the raw reading —
  // is measurably wrong on the very same input. This is the whole argument for
  // doing it in the rotation domain, so it is asserted rather than asserted-in-
  // a-comment.
  const raw = attitudeFromGravity({ x: measured.x * G0, y: measured.y * G0, z: measured.z * G0 }, 0);
  const naivePitch = raw.pitch - mountPitch;
  const naiveRoll = raw.roll - mountRoll;
  const naiveError = Math.max(Math.abs(naivePitch - 10), Math.abs(naiveRoll - 8));
  assert.ok(naiveError > 0.5, `subtracting angles was only ${naiveError.toFixed(3)} deg out — the test has stopped proving anything`);
});

test('levelling a mount that is ALREADY level is the identity, not a NaN', () => {
  const mount = mountFromReference(LEVEL_UP);
  assert.ok(mount);
  const solved = attitudeFromGravity(gravityAt(0, 0), 0, mount);
  assert.ok(Math.abs(solved.pitch) < 1e-9);
  assert.ok(Math.abs(solved.roll) < 1e-9);
  // A 7 degree pitch still reads 7 through an identity mount.
  assert.ok(Math.abs(attitudeFromGravity(gravityAt(7, 0), 0, mount).pitch - 7) < 1e-6);
});

test('an exactly inverted reference is refused rather than guessed at', () => {
  // Every axis perpendicular to the reference is an equally valid rotation, so
  // there is no minimal one to pick. Refusing is the honest answer.
  assert.equal(rotationAligning({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }), null);
  assert.equal(rotationAligning({ x: 0, y: 0, z: 0 }, LEVEL_UP), null);
});

test('the mount rotation is orthonormal — it cannot scale or shear the reading', () => {
  const mount = mountFromReference(upVectorScreenFrame(23, -17));
  // R * R^T = I, and a gravity vector keeps its magnitude through it.
  const RT = transpose3(mount);
  for (const v of [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0.3, y: -0.5, z: 0.81 },
  ]) {
    const round = applyMatrix3(RT, applyMatrix3(mount, v));
    assert.ok(Math.abs(round.x - v.x) < 1e-9 && Math.abs(round.y - v.y) < 1e-9 && Math.abs(round.z - v.z) < 1e-9);
    const before = Math.hypot(v.x, v.y, v.z);
    const after = applyMatrix3(mount, v);
    assert.ok(Math.abs(Math.hypot(after.x, after.y, after.z) - before) < 1e-9, 'the mount changed a vector magnitude');
  }
});

test('mountAnglesDeg reports the CRADLE angle, which is what a person can check', () => {
  const angles = mountAnglesDeg(upVectorScreenFrame(18, -4));
  assert.ok(Math.abs(angles.pitchDeg - 18) < 1e-6, `pitch ${angles.pitchDeg}`);
  assert.ok(Math.abs(angles.rollDeg - -4) < 1e-6, `roll ${angles.rollDeg}`);
});

test('setMount levels the filter, and clearMount gives the device back', () => {
  const fusion = createFusion();
  const cradle = { pitch: 18, roll: -4 };
  const inCradle = gravityAt(cradle.pitch, cradle.roll);

  // Uncalibrated, the horizon reads the CRADLE — which is the complaint.
  let t = 0;
  for (let i = 0; i < 60; i += 1) {
    t += 20;
    fusion.updateAccel(inCradle, 0, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, inCradle, t);
  }
  assert.ok(Math.abs(fusion.read(t).pitch - 18) < 0.5, `uncalibrated pitch ${fusion.read(t).pitch}`);

  // Level it.
  const applied = fusion.setMount(upVectorScreenFrame(cradle.pitch, cradle.roll), 0);
  assert.ok(Math.abs(applied.pitchDeg - 18) < 1e-6);
  assert.equal(fusion.read(t).hasAttitude, false, 'the old attitude must be dropped, not slewed');

  for (let i = 0; i < 60; i += 1) {
    t += 20;
    fusion.updateAccel(inCradle, 0, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, inCradle, t);
  }
  const levelled = fusion.read(t);
  assert.ok(Math.abs(levelled.pitch) < 0.5, `levelled pitch ${levelled.pitch}`);
  assert.ok(Math.abs(levelled.roll) < 0.5, `levelled roll ${levelled.roll}`);
  assert.ok(fusion.mountOffset, 'the offset must be reportable — an instrument whose zero moved has to say so');
  assert.ok(Math.abs(fusion.mountOffset.pitchDeg - 18) < 1e-6);

  // And giving it back returns the cradle reading.
  fusion.clearMount();
  for (let i = 0; i < 60; i += 1) {
    t += 20;
    fusion.updateAccel(inCradle, 0, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, inCradle, t);
  }
  assert.equal(fusion.mountOffset, null);
  assert.ok(Math.abs(fusion.read(t).pitch - 18) < 0.5, `after clearing, pitch ${fusion.read(t).pitch}`);
});

test('a levelled filter still tracks REAL motion, at the right sign and size', () => {
  const fusion = createFusion();
  const mountRef = upVectorScreenFrame(20, 0);
  fusion.setMount(mountRef, 0);
  const mount = fusion.mountMatrix;

  // The car pitches nose-up 6 and rolls right 11, seen through the cradle.
  const vehicleUp = upVectorScreenFrame(6, 11);
  const seen = applyMatrix3(transpose3(mount), vehicleUp);
  const measured = { x: seen.x * G0, y: seen.y * G0, z: seen.z * G0 };

  let t = 0;
  for (let i = 0; i < 120; i += 1) {
    t += 20;
    fusion.updateAccel(measured, 0, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, measured, t);
  }
  const read = fusion.read(t);
  assert.ok(Math.abs(read.pitch - 6) < 0.5, `pitch ${read.pitch}, expected 6`);
  assert.ok(Math.abs(read.roll - 11) < 0.5, `roll ${read.roll}, expected 11`);
});

test('the gyro is rotated by the mount too, or the two halves fight again', () => {
  // A cradle rolled 90 degrees makes the phone's pitch axis the vehicle's ROLL
  // axis. If only the accelerometer were corrected, the gyro would integrate a
  // yaw rate into pitch and the accelerometer would drag it back for ever —
  // the exact standoff the zero-offset work removed.
  const fusion = createFusion();
  fusion.setMount(upVectorScreenFrame(0, 90), 0);
  const mount = fusion.mountMatrix;

  const level = applyMatrix3(transpose3(mount), LEVEL_UP);
  const measured = { x: level.x * G0, y: level.y * G0, z: level.z * G0 };
  let t = 0;
  for (let i = 0; i < 400; i += 1) {
    t += 20;
    fusion.updateAccel(measured, 0, t);
    // A real 3 deg/s rate about the SCREEN x axis. Through a 90 degree roll
    // mount that is a vehicle ROLL rate, not a pitch rate.
    fusion.updateGyro({ alpha: 0, beta: 3, gamma: 0 }, measured, t);
  }
  const read = fusion.read(t);
  // Whatever the axes do, the filter must stay settled against gravity rather
  // than sitting at a permanent standoff.
  assert.ok(read.hasAttitude, 'the horizon vanished under a rotated mount');
  assert.ok(Math.abs(read.residualDeg ?? 0) < 2, `residual ${read.residualDeg} — the halves are fighting`);
});

// --- the screen angle, pinned to a REAL DEVICE -------------------------------
//
// The round-trip test near the top of this file could not see the bug these
// pin down, and it is worth being precise about why: `screenToDevice` is the
// exact inverse of the screen rotation inside `attitudeFromGravity`, so the two
// agreed with each other while both disagreed with the world. Self-consistency
// is not correctness — the same structural blindness as the degree-1 magnetic
// tests, which passed while the Schmidt normalisation was wrong at every degree
// above one.
//
// So these assert against MEASURED NUMBERS from Noah's iPad, taken from its own
// diagnostics report while it was held square in landscape.

test('NOAH’S IPAD: an iPad held square in landscape reads roll near zero', () => {
  // Raw accelerationIncludingGravity, after the iOS negation is undone —
  // exactly the vector in the report, and |g| 1.15 because he was holding it.
  const up = { x: 6.887, y: 0.351, z: 8.936 };

  // What the app used to do: believe screen.orientation.angle, which said 0.
  const believingTheLie = attitudeFromGravity(up, 0);
  assert.ok(
    Math.abs(believingTheLie.roll) > 80,
    `the old behaviour should reproduce the fault, got roll ${believingTheLie.roll}`,
  );

  // With the true angle AND the corrected rotation sign.
  const fixed = attitudeFromGravity(up, 90);
  assert.ok(Math.abs(fixed.roll) < 8, `roll ${fixed.roll} — an iPad held square is not banked`);
  // Reclined about fifty degrees, which is what its own gamma of -45 said.
  assert.ok(fixed.pitch < -40 && fixed.pitch > -65, `pitch ${fixed.pitch}`);
});

test('NOAH’S DEVICES: all five measured reports read near level once fixed', () => {
  // Five separate diagnostics reports, two devices, both orientations. The
  // angle is what `window.orientation` said, which is the source the fix
  // prefers. Kept as a table because the value of these numbers is that they
  // came off real hardware — nothing here was constructed to pass.
  const REPORTS = [
    { name: 'iPad portrait', accel: { x: -0.786, y: -8.233, z: -3.353 }, angle: 0, wasReported: -90.8 },
    { name: 'iPad landscape', accel: { x: -6.887, y: -0.351, z: -8.936 }, angle: 90, wasReported: -89.0 },
    { name: 'iPad landscape (2)', accel: { x: -7.997, y: -0.429, z: -5.904 }, angle: 90, wasReported: -88.6 },
    { name: 'iPhone portrait', accel: { x: 1.667, y: -9.833, z: -2.659 }, angle: 0, wasReported: -0.9 },
    { name: 'iPhone landscape', accel: { x: -9.662, y: -0.353, z: -2.481 }, angle: 90, wasReported: -145.5 },
  ];

  for (const r of REPORTS) {
    // iOS reports the negation; fusion.orient() undoes it before the filter
    // ever sees it, so the tests work on the corrected vector.
    const up = { x: -r.accel.x, y: -r.accel.y, z: -r.accel.z };
    const solved = attitudeFromGravity(up, r.angle);
    assert.ok(
      Math.abs(solved.roll) < 10,
      `${r.name}: roll ${solved.roll.toFixed(1)} — a hand-held device is not banked ninety degrees ` +
        `(it reported ${r.wasReported} before the fix)`,
    );
  }
});

test('THE ROTATION SIGN: a quarter turn moves earth-up to the screen axis it should', () => {
  // Device +x is the short edge, to the right in portrait. Turn the device a
  // quarter turn so that edge points UP, and the screen's +y — the top of what
  // the reader sees — must now be the device's +x.
  const solved = attitudeFromGravity({ x: G0, y: 0, z: 0 }, 90);
  assert.ok(Math.abs(solved.pitch) < 1e-9, `pitch ${solved.pitch}`);
  assert.ok(Math.abs(solved.roll) < 1e-9, `roll ${solved.roll} — a quarter turn was applied backwards`);

  // And the other way: at 270 the same device vector is upside down.
  const other = attitudeFromGravity({ x: G0, y: 0, z: 0 }, 270);
  assert.ok(Math.abs(Math.abs(other.roll) - 180) < 1e-6, `roll ${other.roll} at 270`);
});

test('screenToDevice is still the exact inverse after the sign flip', () => {
  for (const angle of [0, 90, 180, 270]) {
    for (const v of [
      { x: 0.3, y: -0.7, z: 0.2 },
      { x: -0.9, y: 0.1, z: 0.4 },
    ]) {
      const solved = attitudeFromGravity(screenToDevice(v, angle), angle);
      const direct = attitudeFromGravity(v, 0);
      assert.ok(Math.abs(solved.pitch - direct.pitch) < 1e-9, `angle ${angle} pitch`);
      const dRoll = ((solved.roll - direct.roll + 540) % 360) - 180;
      assert.ok(Math.abs(dRoll) < 1e-9, `angle ${angle} roll`);
    }
  }
});

test('NOAH’S IPAD: window.orientation wins where it exists, because iOS’s modern one lied', () => {
  // Verbatim from the report: angle says 0, window.orientation says 90, and the
  // device really was turned a quarter turn.
  const ipad = resolveScreenAngle({ orientationAngle: 0, windowOrientation: 90 });
  assert.equal(ipad.angle, 90);
  assert.match(ipad.source, /window\.orientation/);

  // Same iPad in portrait: both agree, and it stays 0.
  assert.equal(resolveScreenAngle({ orientationAngle: 0, windowOrientation: 0 }).angle, 0);

  // Upside-down landscape is preserved rather than flattened to 90.
  assert.equal(resolveScreenAngle({ orientationAngle: 0, windowOrientation: -90 }).angle, 270);
});

test('where window.orientation does not exist, the standard API is used', () => {
  // Android and desktop removed window.orientation years ago, and their
  // screen.orientation.angle is not in dispute.
  const android = resolveScreenAngle({ orientationAngle: 90, windowOrientation: undefined });
  assert.equal(android.angle, 90);
  assert.match(android.source, /screen\.orientation/);

  assert.equal(resolveScreenAngle({ orientationAngle: 270 }).angle, 270);
  assert.equal(resolveScreenAngle({ orientationAngle: 0 }).angle, 0);
});

test('with no orientation API at all, it assumes unrotated and SAYS so', () => {
  const none = resolveScreenAngle({});
  assert.equal(none.angle, 0);
  assert.match(none.source, /no orientation API/);
});

test('ANTI-WINDUP: a badly diverged filter does not learn a fake gyro offset', () => {
  // Noah's iPhone in landscape reported the alpha offset pegged at exactly
  // -10.00 deg/s — dead on the clamp. That is not a gyroscope's zero-offset,
  // which is a degree or two; it was the integrator eating a fifty-degree
  // residual caused by the mis-signed screen rotation.
  const fusion = createFusion();
  const level = { x: 0, y: G0, z: 0 };
  // Seed it level and settled.
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    fusion.updateAccel(level, 0, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, level, t);
  }

  // Now feed a gravity vector fifty degrees away from where the filter is, with
  // a PERFECT gyro. An ungated integrator reads that persistent residual as an
  // enormous constant offset and winds straight into its clamp.
  const wrong = upVectorScreenFrame(50, 0);
  const diverged = { x: wrong.x * G0, y: wrong.y * G0, z: wrong.z * G0 };
  for (let i = 0; i < 60; i += 1) {
    t += 20;
    fusion.updateAccel(diverged, 0, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, diverged, t);
  }

  const bias = fusion.gyroBias;
  const worst = Math.max(Math.abs(bias.alpha), Math.abs(bias.beta), Math.abs(bias.gamma));
  assert.ok(worst < 3, `the integrator wound up to ${worst.toFixed(2)} deg/s on a residual it could not explain`);
  assert.ok(worst < DEFAULTS.biasMaxDegS - 1, 'the offset reached the clamp, which is the exact failure this gates');
});

test('anti-windup does NOT stop a real offset being learned', () => {
  // The gate must not cost the thing it protects. A genuine 3 deg/s offset
  // produces a small residual, well inside the gate, and is still recovered.
  const fusion = createFusion();
  const t = runLevelWithGyroBias(fusion, { biasDegS: 3, seconds: 40 });
  assert.ok(Math.abs(fusion.gyroBias.alpha - 3) < 0.6, `alpha ${fusion.gyroBias.alpha}`);
  assert.equal(fusion.read(t).converged, true);
});

test('LEVELLING: the filter remembers the last still moment, so the press is not the measurement', () => {
  // Noah: "when I tap the button, it wiggles too much to work." Levelling read
  // stillness at the instant of the click, which is the one instant guaranteed
  // to be disturbed — the press IS the disturbance. On a hand-held tablet it
  // could never succeed.
  const fusion = createFusion();

  // Resting in its cradle: still, tilted back the way a real mount sits.
  const up = upVectorScreenFrame(25, 0);
  const cradle = { x: up.x * G0, y: up.y * G0, z: up.z * G0 };
  let t = 0;
  for (let i = 0; i < 200; i += 1) {
    t += 20;
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, cradle, t);
    fusion.updateAccel(cradle, 0, t);
  }
  const settled = fusion.lastStillAttitude;
  assert.ok(settled, 'a device resting in a cradle must record a still attitude');
  assert.ok(Math.abs(settled.pitch - 25) < 2, `the cradle tilt is real: pitch ${settled.pitch?.toFixed(1)}`);

  // Now the finger arrives: rates spike and the accelerometer leaves 1 g.
  const shoved = { x: 3, y: G0 + 2.5, z: -4 };
  for (let i = 0; i < 12; i += 1) {
    t += 20;
    fusion.updateGyro({ alpha: 45, beta: -38, gamma: 26 }, shoved, t);
    fusion.updateAccel(shoved, 0, t);
  }
  assert.equal(fusion.read(t).still, false, 'the press must genuinely register as motion');

  // THE POINT: the reading from before the touch survives, and it is the one
  // levelling uses — so the capture no longer depends on the calmest instant
  // being the instant of the press.
  const remembered = fusion.lastStillAttitude;
  assert.ok(remembered, 'the pre-touch reference must survive the press');
  assert.ok(remembered.at <= t, 'and it is from the past, not fabricated now');
  assert.ok(
    Math.abs(remembered.pitch - settled.pitch) < 2,
    `must be the settled reference, not the disturbed one ` +
      `(${remembered.pitch?.toFixed(1)} vs ${settled.pitch?.toFixed(1)})`,
  );
});

test('LEVELLING: a device that has never been still offers no reference to fake', () => {
  // The arm-and-wait path depends on this being null rather than a guess. A
  // reference invented here would be baked into every later reading and look
  // perfectly fine, which is the failure mode the whole procedure guards.
  const fusion = createFusion();
  let t = 0;
  for (let i = 0; i < 80; i += 1) {
    t += 20;
    const jerk = { x: 4 * Math.sin(i), y: G0 + 3 * Math.cos(i), z: 3 * Math.sin(i / 2) };
    fusion.updateGyro({ alpha: 55, beta: 44, gamma: -48 }, jerk, t);
    fusion.updateAccel(jerk, 0, t);
  }
  assert.equal(fusion.lastStillAttitude, null);
});

test('JITTER: an ALIGNED, still filter applies far less of each noisy sample', () => {
  // Noah: "Settle the horizon jitter." The static gain is a deliberately fast
  // pull toward gravity so a device set down levels in a fraction of a second —
  // but keeping it afterwards applies a quarter of EVERY accelerometer sample,
  // sixty times a second, which is a horizon that visibly trembles on a desk.
  // The accelerometer is exact at rest and noisy at rest; both are true.
  //
  // COMPARED AGAINST ITSELF, not against a threshold. An absolute bound was the
  // first version of this test and it passed with the fix REMOVED — the
  // synthetic noise simply never crossed it either way, so the test looked like
  // evidence and was not. Two filters differing only in `settledAlpha`, fed
  // identical samples, isolate exactly the thing that changed.
  const wander = (cfg) => {
    const fusion = createFusion(cfg);
    const level = { x: 0, y: G0, z: 0 };
    let t = 0;
    for (let i = 0; i < 200; i += 1) {
      t += 20;
      fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, level, t);
      fusion.updateAccel(level, 0, t);
    }
    assert.equal(fusion.read(t).converged, true, 'must be aligned before the comparison means anything');
    let worst = 0;
    for (let i = 0; i < 400; i += 1) {
      t += 20;
      const n = Math.sin(i * 2.3) * 0.12;
      const m = Math.cos(i * 1.7) * 0.12;
      fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, level, t);
      fusion.updateAccel({ x: n, y: G0, z: m }, 0, t);
      const r = fusion.read(t);
      worst = Math.max(worst, Math.abs(r.pitch ?? 0), Math.abs(r.roll ?? 0));
    }
    return worst;
  };

  const settled = wander({});
  const alignmentGain = wander({ settledAlpha: DEFAULTS.staticAlpha });
  assert.ok(
    settled < alignmentGain * 0.7,
    `settling made no difference: ${settled.toFixed(3)}° with it, ${alignmentGain.toFixed(3)}° on the alignment gain`,
  );
});

test('JITTER: settling does NOT stop it aligning quickly in the first place', () => {
  // The gentle gain must apply only AFTER alignment. If it applied before, a
  // device set down would take seconds to level, which is the defect the fast
  // static gain was added to fix in the first place.
  const fusion = createFusion();
  const tilted = upVectorScreenFrame(20, 0);
  const g = { x: tilted.x * G0, y: tilted.y * G0, z: tilted.z * G0 };
  let t = 0;
  for (let i = 0; i < 40; i += 1) {
    t += 20;
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 0 }, g, t);
    fusion.updateAccel(g, 0, t);
  }
  const r = fusion.read(t);
  assert.ok(r.hasAttitude, 'still no attitude after 800 ms of stillness');
  assert.ok(Math.abs(r.pitch - 20) < 3, `aligned to ${r.pitch?.toFixed(1)}° instead of 20° in 800 ms`);
});
