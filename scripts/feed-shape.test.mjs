/**
 * feed-shape.test.mjs — what the provider actually sent, not what its docs say.
 *
 * Doctrine §7f: a sandbox cannot reach adsb.lol, so the check that answers
 * "does this provider broadcast the autopilot selections at all" is built into
 * the diagnostics report and run by a real device. This suite covers the part
 * that CAN be tested here — that the reporter counts honestly.
 *
 * The distinction it exists to protect: a key PRESENT with a null value is not
 * coverage. The autopilot readout was written from the documented field names
 * without a single observed payload, and "the key is there but always null"
 * and "we spelt the key wrong" look identical from the panel.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePayload } from '../functions/api/traffic.js';

test('coverage counts only usable values, not merely present keys', () => {
  const p = parsePayload({ ac: [
    { hex:'a', lat:1, lon:1, nav_altitude_mcp: 35000, nav_qnh: 1013, t:'B738', desc:'Boeing 737-800' },
    { hex:'b', lat:2, lon:2, nav_altitude_mcp: null, nav_heading: 270 },
    { hex:'c', lat:3, lon:3 },
  ]});
  assert.equal(p.observed.sampled, 3);
  assert.equal(p.observed.coverage.nav_altitude_mcp, 1, 'a null key must not count as coverage');
  assert.equal(p.observed.coverage.nav_heading, 1);
  assert.equal(p.observed.coverage.nav_qnh, 1);
  assert.equal(p.observed.coverage['t (type code)'], 1);
  assert.ok(p.observed.keys.includes('nav_altitude_mcp'));
  assert.ok(p.observed.keys.includes('hex'));
});

test('a field absent from every aircraft is simply absent from coverage', () => {
  const p = parsePayload({ ac: [{ hex:'a', lat:1, lon:1 }] });
  assert.equal(p.observed.coverage.nav_altitude_mcp, undefined);
  assert.equal(p.observed.sampled, 1);
});

test('keys are sorted so two reports can be diffed by eye', () => {
  const p = parsePayload({ ac: [{ z:1, a:2, m:3, lat:1, lon:1, hex:'x' }] });
  assert.deepEqual(p.observed.keys, [...p.observed.keys].sort());
});
