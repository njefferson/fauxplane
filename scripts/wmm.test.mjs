import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { magneticField, parseCof } from '../public/src/data/wmm.js';
import { sampleGrid } from '../public/src/data/geoid.js';
import { REGION } from '../public/src/core/region.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/**
 * THE MODEL IS CHECKED AGAINST THE PUBLISHER'S OWN NUMBERS, not against ours.
 *
 * This file exists because the synthetic tests in derive.test.mjs could not
 * catch what was wrong. Those use a pure axial dipole and a tilted dipole —
 * both degree 1 — and every Schmidt normalisation factor at degree 1 happens to
 * be exactly 1. So a bug in the normalisation of degrees 2 through 12 was
 * completely invisible to them, and the implementation reported declinations
 * three to five degrees out while its total intensity and inclination looked
 * fine (the dipole dominates both).
 *
 * The lesson generalises past this app: a test built from a degenerate case
 * validates the degenerate case. When a published model has published test
 * values, those are the test.
 *
 * Source: NOAA/BGS WMM test values, redistributed by the geomagnetism package
 * and committed at scripts/fixtures/wmm-official-values.csv by
 * scripts/build-geodata.mjs.
 */

const cofFile = JSON.parse(await readFile(path.join(REPO, 'public', 'data', 'wmm-cof.json'), 'utf8'));
const model = parseCof(cofFile.cof);

const csv = await readFile(path.join(HERE, 'fixtures', 'wmm-official-values.csv'), 'utf8');
const [header, ...lines] = csv.trim().split(/\r?\n/);
const cols = header.split(',');
const rows = lines
  .map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], Number(v)])))
  // Only the rows inside THIS model's validity window. The file also carries
  // test values for WMM2015 and WMM2020, which these coefficients are not.
  .filter((r) => r.date >= 2025 && r.date < 2030);

/** Decimal year -> Date, inverting the same convention wmm.js reads back. */
function dateFromDecimalYear(dy) {
  const year = Math.floor(dy);
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return new Date(start + (dy - year) * (end - start));
}

test('the official test table is actually present and non-trivial', () => {
  // Assert the FIXTURE, not just the result. A check whose setup silently has
  // nothing in it proves nothing and says so in the same words as a real pass.
  assert.ok(rows.length >= 20, `only ${rows.length} rows inside the WMM2025 window — the fixture is wrong`);
  assert.equal(model.nMax, 12, `model degree is ${model.nMax}, expected 12`);
  assert.ok(
    rows.some((r) => Math.abs(r.lat) > 85),
    'the fixture has no polar rows, so the polar branch of the east component is untested',
  );
  assert.ok(rows.some((r) => r.alt > 50), 'the fixture has no high-altitude rows');
});

test('declination matches NOAA to within 0.05 degrees at every official point', () => {
  const errors = [];
  for (const r of rows) {
    const f = magneticField(model, {
      latDeg: r.lat,
      lonDeg: r.lon,
      heightM: r.alt * 1000,
      date: dateFromDecimalYear(r.date),
    });
    assert.ok(f, `no field returned at ${r.lat},${r.lon}`);
    // Declination wraps; compare the short way round.
    const d = ((f.declinationDeg - r.decl + 540) % 360) - 180;
    if (Math.abs(d) > 0.05) errors.push(`${r.date} ${r.lat},${r.lon} alt ${r.alt}km: got ${f.declinationDeg.toFixed(2)}, official ${r.decl} (off by ${d.toFixed(3)})`);
  }
  assert.equal(errors.length, 0, `${errors.length}/${rows.length} points disagree:\n  ${errors.slice(0, 8).join('\n  ')}`);
});

test('inclination and total intensity match NOAA too', () => {
  const errors = [];
  for (const r of rows) {
    const f = magneticField(model, {
      latDeg: r.lat,
      lonDeg: r.lon,
      heightM: r.alt * 1000,
      date: dateFromDecimalYear(r.date),
    });
    if (Math.abs(f.inclinationDeg - r.incl) > 0.05) {
      errors.push(`${r.lat},${r.lon} incl got ${f.inclinationDeg.toFixed(2)}, official ${r.incl}`);
    }
    // A few nT on a field of ~50 000 nT is one part in ten thousand.
    if (Math.abs(f.intensityNt - r.f) > 5) {
      errors.push(`${r.lat},${r.lon} |F| got ${f.intensityNt.toFixed(1)}, official ${r.f}`);
    }
  }
  assert.equal(errors.length, 0, `${errors.length} disagreements:\n  ${errors.slice(0, 8).join('\n  ')}`);
});

test('declination at the home reference is the value a local chart would show', () => {
  // A sanity check in the units a pilot thinks in, at the one place this app
  // is actually for. Cameron Park sits around 13 degrees east.
  const f = magneticField(model, {
    latDeg: 38.68,
    lonDeg: -121.0,
    heightM: 0,
    date: new Date('2026-08-02T00:00:00Z'),
  });
  assert.ok(f.declinationDeg > 12 && f.declinationDeg < 14, `declination at home is ${f.declinationDeg.toFixed(2)}, expected about 13 east`);
});

/* --------------------------------------------------------------- the geoid */

const geoid = JSON.parse(await readFile(path.join(REPO, 'public', 'data', 'geoid-norcal.json'), 'utf8'));

test('the geoid grid covers the whole region it claims to', () => {
  assert.ok(geoid.latMin <= REGION.bbox.latMin, `grid starts at ${geoid.latMin}, region at ${REGION.bbox.latMin}`);
  assert.ok(geoid.latMax >= REGION.bbox.latMax, `grid ends at ${geoid.latMax}, region at ${REGION.bbox.latMax}`);
  assert.ok(geoid.lonMin <= REGION.bbox.lonMin, `grid starts at ${geoid.lonMin}, region at ${REGION.bbox.lonMin}`);
  assert.ok(geoid.lonMax >= REGION.bbox.lonMax, `grid ends at ${geoid.lonMax}, region at ${REGION.bbox.lonMax}`);

  // Every corner of the REGION must sample, or the sampler's refuse-outside
  // behaviour turns into a FAIL for a position the app is meant to serve.
  for (const lat of [REGION.bbox.latMin, REGION.bbox.latMax]) {
    for (const lon of [REGION.bbox.lonMin, REGION.bbox.lonMax]) {
      assert.ok(Number.isFinite(sampleGrid(geoid, lat, lon)), `region corner ${lat},${lon} does not sample`);
    }
  }
});

test('geoid heights are in the range NorCal actually has', () => {
  const flat = geoid.values.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  // Northern California sits roughly 20 to 40 m BELOW the ellipsoid. A positive
  // value, or a zero, means the sign convention or the extraction is wrong —
  // and either would put the altimeter out by about a hundred feet while
  // looking entirely reasonable on screen.
  assert.ok(lo > -60 && hi < -10, `geoid heights span ${lo} to ${hi} m, which is not this region`);
  assert.ok(hi - lo > 5, `the grid only varies by ${(hi - lo).toFixed(1)} m — suspiciously flat`);
});

test('the geoid at the home reference is about -32 metres', () => {
  const n = sampleGrid(geoid, 38.68, -121.0);
  assert.ok(n > -40 && n < -24, `geoid height at home is ${n} m, expected about -32`);
  // And in the units the altimeter chain uses: about -105 ft.
  const ft = n / 0.3048;
  assert.ok(ft > -130 && ft < -78, `that is ${ft.toFixed(0)} ft, which is not the correction this region needs`);
});
