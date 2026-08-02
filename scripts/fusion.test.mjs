import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyScreenAngle,
  attitudeFromGravity,
  attitudeFromMatrix,
  createFusion,
  matrixFromEuler,
  screenToDevice,
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
