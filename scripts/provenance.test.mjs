/**
 * provenance.test.mjs — a failure reason must read as ONE sentence.
 *
 * `worstOf` quotes its first failing input's reason, and that reason is often
 * itself a `worstOf` composition, so the quoting nests. On a real panel, three
 * levels deep:
 *
 *   MSL altitude, altimeter setting, station altimeter unavailable (MSL
 *   altitude: GPS altitude, geoid separation unavailable (GPS altitude: not yet
 *   initialised))
 *
 * Every layer of that is true. The whole is unreadable, and it was fixed once
 * as a one-off in motion.js before anyone noticed the shape repeats wherever
 * derived values are chained.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { rootCause, worstOf } from '../public/src/core/provenance.js';

const failed = (reason) => ({ provenance: 'FAIL', reason, at: null });

test('ROOT CAUSE: one wrapping is unwrapped', () => {
  assert.equal(
    rootCause('GPS altitude, geoid separation unavailable (GPS altitude: not yet initialised)'),
    'GPS altitude: not yet initialised',
  );
});

test('ROOT CAUSE: a plain reason is returned untouched', () => {
  assert.equal(rootCause('GPS reports none at rest'), 'GPS reports none at rest');
  assert.equal(rootCause(''), '');
  assert.equal(rootCause(null), '');
});

test('ROOT CAUSE: arbitrarily deep chains collapse to the fact underneath', () => {
  const deep = 'a unavailable (b unavailable (c unavailable (d: the actual cause)))';
  assert.equal(rootCause(deep), 'd: the actual cause');
});

test('ROOT CAUSE: a chain deeper than anything real still collapses fully', () => {
  // Real chains are two to four. Six is already past anything this app builds,
  // and it must come out clean rather than partly unwrapped — a half-stripped
  // reason is worse than the original, because it looks deliberate.
  let s = 'GPS altitude: not yet initialised';
  for (let i = 0; i < 6; i += 1) s = `layer${i} unavailable (${s})`;
  assert.equal(rootCause(s), 'GPS altitude: not yet initialised');
});

test('ROOT CAUSE: a malformed reason terminates rather than spinning', () => {
  // The cap exists for this and only this. An error path that hangs is worse
  // than the error it was describing.
  let s = 'x: root';
  for (let i = 0; i < 200; i += 1) s = `layer${i} unavailable (${s})`;
  const out = rootCause(s);
  assert.ok(out.length < s.length, 'it must make progress');
  assert.ok(typeof out === 'string' && out.length > 0);
});

test('THE REAL CASE: the altitude chain reads as one sentence', () => {
  const msl = 'GPS altitude, geoid separation unavailable (GPS altitude: not yet initialised)';
  const meta = worstOf({
    'MSL altitude': failed(msl),
    'altimeter setting': failed('no METAR'),
    'station altimeter': failed('no METAR'),
  });
  assert.equal(
    meta.reason,
    'MSL altitude, altimeter setting, station altimeter unavailable (GPS altitude: not yet initialised)',
  );
  // The specific defects, named so a regression says which one came back.
  assert.ok(!/\(.*\(/.test(meta.reason), `no nested parenthesis: ${meta.reason}`);
  assert.ok(!/: [^,]*: /.test(meta.reason), `no doubled name prefix: ${meta.reason}`);
});

test('A SINGLE failing input still names itself', () => {
  // The name is the useful half when there is only one, and nothing to unwrap.
  assert.equal(worstOf({ 'vertical acceleration': failed('gyro settling') }).reason, 'vertical acceleration: gyro settling');
});

test('A missing field is a failure, not a crash', () => {
  const meta = worstOf({ 'GPS altitude': undefined });
  assert.equal(meta.provenance, 'FAIL');
  assert.ok(meta.reason.includes('GPS altitude'));
});

test('AGE comes from the OLDEST input, never from the moment of computing', () => {
  // Stamping a derived value "now" launders a stale input into a fresh-looking
  // output — a lie that computes correctly.
  const meta = worstOf({ a: { provenance: 'LIVE', reason: null, at: 500 }, b: { provenance: 'LIVE', reason: null, at: 100 } });
  assert.equal(meta.at, 100);
  assert.equal(meta.provenance, 'DERIVED');
});
