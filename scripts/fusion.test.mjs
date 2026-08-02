import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyScreenAngle,
  attitudeFromGravity,
  attitudeFromMatrix,
  createFusion,
  matrixFromEuler,
  screenToDevice,
  detectAccelSign,
  turnRateFromRates,
  upVectorScreenFrame,
} from '../public/src/core/fusion.js';
import { G0 } from '../public/src/core/units.js';

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
    // A pitch rate about the SCREEN x axis appears on the device's y axis.
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 8 }, accel, t, 90);
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
  // screen angle reads earth-up along -x. Deriving it rather than guessing:
  // attitudeFromGravity rotates by -90, and only -x maps to screen +y. The
  // first version of this test used +x, which is the same device rotated 180
  // degrees — level, but inverted, and it read roll = 180.
  const levelInLandscape = { x: -G0, y: 0, z: 0 };
  let t = 0;
  for (let i = 0; i < 2000; i += 1) {
    t += 20;
    fusion.updateAccel(levelInLandscape, 90, t);
    fusion.updateGyro({ alpha: 0, beta: 0, gamma: 4 }, levelInLandscape, t, 90);
  }
  const learned = fusion.gyroBias;
  assert.ok(Math.abs(learned.gamma - 4) < 0.8, `gamma offset ${learned.gamma}, expected ~4`);
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
