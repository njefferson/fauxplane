#!/usr/bin/env node
/**
 * build-geodata.mjs — emit the two geophysical data files the panel needs, and
 * the official test table that proves the magnetic model is right.
 *
 * Produces:
 *   public/data/wmm-cof.json        World Magnetic Model 2025 coefficients
 *   public/data/geoid-norcal.json   EGM96 geoid heights over the region
 *   scripts/fixtures/wmm-official-values.csv   NOAA's own WMM test values
 *   public/data/manifest.json       flipped to present for both bundles
 *
 * ---------------------------------------------------------------------------
 * SOURCES AND THEIR TERMS (Doctrine §8 — every ingest declares its source's
 * licence in its header and honours it structurally)
 *
 *   World Magnetic Model 2025
 *     Produced by NOAA NCEI and the British Geological Survey.
 *     https://www.ncei.noaa.gov/products/world-magnetic-model
 *     A US Government work, distributed without restriction on use.
 *     Obtained here from the `geomagnetism` npm package (Apache-2.0), which
 *     redistributes the coefficient set and NOAA's published test values.
 *
 *   EGM96 geoid
 *     Produced by the National Geospatial-Intelligence Agency (NGA) and NASA.
 *     A US Government work, in the public domain.
 *     Obtained here from the `egm96-universal` npm package (MIT), which embeds
 *     NGA's sample grid and is CI-tested against NGA's reference Fortran
 *     implementation.
 *
 *   HOW THESE TERMS WERE READ, precisely, because it matters (Doctrine §15.1):
 *   the primary sites (ncei.noaa.gov, earth-info.nga.mil) are BLOCKED by this
 *   sandbox's egress proxy and were not reachable. The statements above are
 *   read from each package's own LICENSE and README, plus the long-standing
 *   public-domain status of US Government works. That is weaker than reading
 *   the publisher's own page and is recorded as such rather than rounded up.
 *   The underlying data is government-produced and neither package asserts any
 *   restriction on it.
 *
 *   NEITHER PACKAGE BECOMES A DEPENDENCY. They are fetched, read once, and the
 *   extracted data is committed (Doctrine §15.6 — ingest once, ship the
 *   result). Nothing third-party executes in the deployed app, and the app
 *   still has zero runtime dependencies.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node scripts/build-geodata.mjs             # fetch from npm and emit
 *   node scripts/build-geodata.mjs --from DIR  # use already-unpacked packages
 *
 * Exits non-zero on any failure and never writes a partial file.
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { promisify } from 'node:util';

import { REGION } from '../public/src/core/region.js';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const DATA = path.join(REPO, 'public', 'data');
const FIXTURES = path.join(HERE, 'fixtures');

const PACKAGES = ['geomagnetism@0.2.0', 'egm96-universal@1.1.1'];


/**
 * The geoid grid. 0.25 degrees matches EGM96's own 15-arc-minute resolution
 * exactly, so the grid is a straight resample rather than a smoothing — and it
 * is deliberately a touch WIDER than the navdata region, because the sampler
 * refuses outside its own bounds rather than clamping, and a region edge that
 * fell outside the grid would read FAIL for no good reason.
 */
const GRID = {
  latMin: Math.floor(REGION.bbox.latMin * 4) / 4 - 0.25,
  latMax: Math.ceil(REGION.bbox.latMax * 4) / 4 + 0.25,
  lonMin: Math.floor(REGION.bbox.lonMin * 4) / 4 - 0.25,
  lonMax: Math.ceil(REGION.bbox.lonMax * 4) / 4 + 0.25,
  step: 0.25,
};

/**
 * Installed into .cache/, NOT into the repo's node_modules, and never saved to
 * package.json. The extracted data is what gets committed; neither package is
 * a dependency of anything (the egm96 bundle needs a base64 decoder of its own
 * at read time, which is the reason this is an install rather than a bare
 * tarball unpack).
 */
async function fetchPackages(cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  await run('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', cacheDir, ...PACKAGES], {
    cwd: REPO,
    maxBuffer: 32 * 1024 * 1024,
  });
  return path.join(cacheDir, 'node_modules');
}

const findDir = async (root, prefix) => {
  const direct = path.join(root, prefix);
  try {
    await readdir(direct);
    return direct;
  } catch {
    /* fall through to a prefix scan, for a --from directory of unpacked tarballs */
  }
  const entries = await readdir(root, { withFileTypes: true });
  const hit = entries.find((e) => e.isDirectory() && e.name.startsWith(prefix));
  if (!hit) throw new Error(`could not find ${prefix} under ${root}`);
  const nested = path.join(root, hit.name, 'package');
  try {
    await readdir(nested);
    return nested;
  } catch {
    return path.join(root, hit.name);
  }
};

/**
 * Convert the coefficient arrays to NOAA's COF text layout, which is what
 * src/data/wmm.js parses. Keeping the app's parser pointed at the PUBLISHED
 * format rather than at one package's JSON shape means a future session can
 * drop in a real WMM.COF from NOAA and change nothing else.
 */
function toCof(model) {
  if (!Number.isFinite(model.epoch) || !Number.isFinite(model.n_max)) {
    throw new Error('the WMM package did not carry an epoch and n_max');
  }
  const idx = (n, m) => (n * (n + 1)) / 2 + m;
  const lines = [`    ${model.epoch.toFixed(1)}            ${model.name}`];
  for (let n = 1; n <= model.n_max; n += 1) {
    for (let m = 0; m <= n; m += 1) {
      const i = idx(n, m);
      const g = model.main_field_coeff_g[i];
      const h = model.main_field_coeff_h[i];
      const dg = model.secular_var_coeff_g[i];
      const dh = model.secular_var_coeff_h[i];
      if (![g, h, dg, dh].every(Number.isFinite)) {
        throw new Error(`WMM coefficient (${n},${m}) is missing — the package layout has changed`);
      }
      lines.push(`  ${n}  ${m}  ${g}  ${h}  ${dg}  ${dh}`);
    }
  }
  lines.push('9999999999999999999999999999999999999999999999999999999999999999');
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({ options: { from: { type: 'string' } } });
  const source = values.from ? path.resolve(values.from) : await fetchPackages(path.join(REPO, '.cache', 'geodata'));

  await mkdir(DATA, { recursive: true });
  await mkdir(FIXTURES, { recursive: true });

  // --- World Magnetic Model ------------------------------------------------
  const geomagDir = await findDir(source, 'geomagnetism');
  const wmm = JSON.parse(await readFile(path.join(geomagDir, 'data', 'wmm-2025.json'), 'utf8'));
  const cof = toCof(wmm);

  await writeFile(
    path.join(DATA, 'wmm-cof.json'),
    `${JSON.stringify(
      {
        _source: 'World Magnetic Model 2025 — NOAA NCEI and the British Geological Survey',
        _sourceUrl: 'https://www.ncei.noaa.gov/products/world-magnetic-model',
        _licence: 'US Government work, distributed without restriction on use',
        _obtainedVia: 'the geomagnetism npm package (Apache-2.0), which redistributes the coefficient set',
        _termsReadFrom: "the package's own LICENSE and README — ncei.noaa.gov is blocked by this sandbox and was not reached",
        _validFrom: wmm.start_date ?? null,
        _validTo: wmm.end_date ?? null,
        _generator: 'scripts/build-geodata.mjs',
        epoch: wmm.epoch,
        nMax: wmm.n_max,
        cof,
      },
      null,
      0,
    )}\n`,
  );

  // NOAA's own test values, committed as a fixture so the model is checked
  // against the publisher's numbers rather than against our expectations.
  const officialCsv = await readFile(path.join(geomagDir, 'test', 'values.csv'), 'utf8');
  await writeFile(path.join(FIXTURES, 'wmm-official-values.csv'), officialCsv);

  // --- EGM96 geoid ---------------------------------------------------------
  const egmDir = await findDir(source, 'egm96-universal');
  const egm = await import(path.join(egmDir, 'dist', 'egm96-universal.esm.js'));
  const meanSeaLevel = egm.meanSeaLevel ?? egm.default?.meanSeaLevel;
  if (typeof meanSeaLevel !== 'function') throw new Error('egm96-universal did not export meanSeaLevel');

  const rows = Math.round((GRID.latMax - GRID.latMin) / GRID.step) + 1;
  const cols = Math.round((GRID.lonMax - GRID.lonMin) / GRID.step) + 1;
  const grid = [];
  for (let r = 0; r < rows; r += 1) {
    const lat = GRID.latMin + r * GRID.step;
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      const lon = GRID.lonMin + c * GRID.step;
      const n = meanSeaLevel(lat, lon);
      if (!Number.isFinite(n)) throw new Error(`EGM96 returned no value at ${lat},${lon}`);
      // Centimetre precision. The grid is metres; more digits than that is
      // false precision on a 15-arc-minute sample.
      row.push(Math.round(n * 100) / 100);
    }
    grid.push(row);
  }

  // A geoid height anywhere near this region is comfortably negative and of
  // order tens of metres. A grid that is all zeros, or wildly out of range, is
  // an extraction that went wrong and must not be committed.
  const flat = grid.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  if (lo === hi) throw new Error('the geoid grid is constant — the extraction failed');
  if (lo < -120 || hi > 120) throw new Error(`geoid heights ${lo}..${hi} m are outside any plausible range`);

  await writeFile(
    path.join(DATA, 'geoid-norcal.json'),
    `${JSON.stringify(
      {
        _source: 'EGM96 geoid — NGA and NASA',
        _sourceUrl: 'https://earth-info.nga.mil/',
        _licence: 'US Government work, public domain',
        _obtainedVia: 'the egm96-universal npm package (MIT), CI-tested against NGA reference Fortran implementation',
        _termsReadFrom: "the package's own LICENSE and README — earth-info.nga.mil is blocked by this sandbox and was not reached",
        _units: 'metres, geoid height above the WGS84 ellipsoid (negative in this region)',
        _generator: 'scripts/build-geodata.mjs',
        latMin: GRID.latMin,
        latMax: GRID.latMax,
        lonMin: GRID.lonMin,
        lonMax: GRID.lonMax,
        latStep: GRID.step,
        lonStep: GRID.step,
        values: grid,
      },
      null,
      0,
    )}\n`,
  );

  // --- manifest ------------------------------------------------------------
  const manifestPath = path.join(DATA, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.geoid = {
    present: true,
    path: '/data/geoid-norcal.json',
    reason: null,
    detail: `EGM96 geoid heights over the region, ${rows}x${cols} at ${GRID.step} degrees, ${lo} to ${hi} m. NGA/NASA, public domain.`,
  };
  manifest.wmm = {
    present: true,
    path: '/data/wmm-cof.json',
    reason: null,
    detail: `World Magnetic Model ${wmm.epoch}, degree ${wmm.n_max}, valid ${wmm.start_date ?? '?'} to ${wmm.end_date ?? '?'}. NOAA NCEI and BGS.`,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(
    `wrote public/data/wmm-cof.json       WMM ${wmm.epoch}, degree ${wmm.n_max}\n` +
      `wrote public/data/geoid-norcal.json  ${rows}x${cols} at ${GRID.step} deg, ${lo} to ${hi} m\n` +
      `wrote scripts/fixtures/wmm-official-values.csv  ${officialCsv.trim().split('\n').length - 1} official rows\n` +
      `updated public/data/manifest.json    geoid and wmm now present\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`build-geodata: ${err.message}\n`);
  process.exit(1);
});
