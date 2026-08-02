#!/usr/bin/env node
/**
 * build-navdata.mjs — regenerate public/data/navdata.json from the OurAirports
 * bulk CSVs, filtered to the NorCal region defined in NOTES.md.
 *
 * The raw CSVs are NEVER committed (see .gitignore). They are fetched into
 * .cache/ourairports/ or supplied with --from <dir>, and only the filtered
 * JSON is written into public/.
 *
 * ---------------------------------------------------------------------------
 * SOURCE AND ITS LICENSE (Doctrine §8 — every ingest adapter declares its
 * source's license in its header and honours it structurally)
 *
 *   Source : OurAirports bulk data — https://ourairports.com/data/
 *   Files  : airports.csv, runways.csv, navaids.csv
 *   Terms  : OurAirports publishes these files as public-domain data.
 *
 *   NOT RE-READ THIS SESSION. The egress proxy denied the host (403 to
 *   CONNECT), so the published terms could not be fetched and confirmed.
 *   SOURCE_POLICY.policyReadOn is therefore null and this adapter refuses to
 *   fetch until it is filled in — see the check in assertPolicyReadable().
 *   Supplying the CSVs with --from bypasses the network entirely and is the
 *   supported route while the host is blocked.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node scripts/build-navdata.mjs                 # fetch (needs egress + policy date)
 *   node scripts/build-navdata.mjs --from ./csvs   # use local CSVs, no network
 *   node scripts/build-navdata.mjs --out path.json # override output path
 *
 * Exits non-zero on any failure. It never emits a partial or invented file:
 * v1 has no synthetic data path, so a build that cannot prove its input is a
 * build that produces nothing.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// --- Region -----------------------------------------------------------------
// The single source of truth for the region constants MOVED to
// public/src/core/region.js when the app was built, because the app needs the
// same numbers — the home reference is its position surrogate before the first
// GPS fix. It is imported, never retyped ("a hand-written carry list is a bug
// with a delay fuse"), and re-exported here so this module's existing callers
// and tests are unaffected.

import { REGION } from '../public/src/core/region.js';

export { REGION };

// --- Source policy (Doctrine §15) -------------------------------------------
// Declared, not implied. A CI etiquette gate reads this block; see NOTES.md
// for why that gate does not exist yet and must not be described as if it does.

const VERSION = '0.0.0';
export const SOURCE_POLICY = {
  source: 'OurAirports bulk CSV',
  policyUrl: 'https://ourairports.com/data/',
  // ISO date the published terms were last actually read by a human or a
  // session that could reach them. null blocks every network path below.
  policyReadOn: null,
  maxConcurrency: 1,
  minIntervalMs: 1000,
  honoursRetryAfter: true,
  userAgent: `fauxplane-navdata/${VERSION} (+https://github.com/njefferson/fauxplane)`,
};

const SOURCE_FILES = {
  airports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  runways: 'https://davidmegginson.github.io/ourairports-data/runways.csv',
  navaids: 'https://davidmegginson.github.io/ourairports-data/navaids.csv',
};

// --- CSV ---------------------------------------------------------------------
// RFC 4180. OurAirports names carry commas ("Bell's Field, Number Two") and
// escaped quotes, so splitting on ',' silently shifts every later column and
// produces a file that looks plausible and is wrong.

export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // Ignore the trailing blank line every CSV ends with.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      endField();
      i += 1;
      continue;
    }
    if (c === '\r') {
      if (src[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (c === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  if (quoted) throw new Error('CSV ended inside a quoted field — file is truncated');
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Index rows by HEADER NAME, never by position. OurAirports has reordered
 * columns before (icao_code was inserted ahead of gps_code), and a positional
 * reader survives that change by writing the wrong values into the right keys.
 */
export function toObjects(rows, { required = [], label = 'csv' } = {}) {
  if (rows.length === 0) throw new Error(`${label}: empty file`);
  const header = rows[0].map((h) => h.trim());
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new Error(
      `${label}: source schema changed — missing column(s) ${missing.join(', ')}. ` +
        `Saw: ${header.join(', ')}`,
    );
  }
  const idx = new Map(header.map((h, n) => [h, n]));
  return rows.slice(1).map((r) => {
    const o = {};
    for (const [name, n] of idx) o[name] = r[n] ?? '';
    return o;
  });
}

// --- Field helpers -----------------------------------------------------------
// An absent number is null, never 0. A field elevation of 0 ft and an unknown
// field elevation are different facts, and an altimeter page that cannot tell
// them apart is the synthetic-data defect wearing a plausible number.

const num = (v) => {
  const s = (v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v) => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

export function inBox(lat, lon, bbox = REGION.bbox) {
  if (lat === null || lon === null) return false;
  return lat >= bbox.latMin && lat <= bbox.latMax && lon >= bbox.lonMin && lon <= bbox.lonMax;
}

// --- Filter ------------------------------------------------------------------

export function buildNavdata({ airportsCsv, runwaysCsv, navaidsCsv }, bbox = REGION.bbox) {
  const airportRows = toObjects(parseCsv(airportsCsv), {
    label: 'airports.csv',
    required: ['id', 'ident', 'type', 'name', 'latitude_deg', 'longitude_deg'],
  });
  const runwayRows = toObjects(parseCsv(runwaysCsv), {
    label: 'runways.csv',
    required: ['airport_ref', 'airport_ident', 'le_ident', 'he_ident'],
  });
  const navaidRows = toObjects(parseCsv(navaidsCsv), {
    label: 'navaids.csv',
    required: ['ident', 'name', 'type', 'latitude_deg', 'longitude_deg'],
  });

  const airports = [];
  const keptIds = new Set();
  const keptIdents = new Set();

  for (const r of airportRows) {
    const lat = num(r.latitude_deg);
    const lon = num(r.longitude_deg);
    if (!inBox(lat, lon, bbox)) continue;
    keptIds.add(r.id);
    keptIdents.add(r.ident);
    airports.push({
      id: r.id,
      ident: r.ident,
      // 'type' still carries "closed" — the region filter is a bbox filter and
      // nothing else. Deciding which types the panels draw is the app's call,
      // and it can only make it if the data keeps the distinction.
      type: str(r.type),
      name: str(r.name),
      lat,
      lon,
      elevation_ft: num(r.elevation_ft),
      iso_region: str(r.iso_region),
      municipality: str(r.municipality),
      icao_code: str(r.icao_code),
      iata_code: str(r.iata_code),
      gps_code: str(r.gps_code),
      local_code: str(r.local_code),
    });
  }

  // A runway row has no dependable coordinates of its own (le_/he_ lat/lon are
  // frequently blank), so runways come in by JOIN on their parent airport, not
  // by bbox. Filtering runways geographically would silently drop most of them.
  const runways = [];
  for (const r of runwayRows) {
    if (!keptIds.has(r.airport_ref) && !keptIdents.has(r.airport_ident)) continue;
    runways.push({
      airport_ref: r.airport_ref,
      airport_ident: r.airport_ident,
      length_ft: num(r.length_ft),
      width_ft: num(r.width_ft),
      surface: str(r.surface),
      lighted: r.lighted === '1',
      closed: r.closed === '1',
      le_ident: str(r.le_ident),
      le_lat: num(r.le_latitude_deg),
      le_lon: num(r.le_longitude_deg),
      le_elevation_ft: num(r.le_elevation_ft),
      le_heading_degT: num(r.le_heading_degT),
      he_ident: str(r.he_ident),
      he_lat: num(r.he_latitude_deg),
      he_lon: num(r.he_longitude_deg),
      he_elevation_ft: num(r.he_elevation_ft),
      he_heading_degT: num(r.he_heading_degT),
    });
  }

  const navaids = [];
  for (const r of navaidRows) {
    const lat = num(r.latitude_deg);
    const lon = num(r.longitude_deg);
    if (!inBox(lat, lon, bbox)) continue;
    navaids.push({
      ident: r.ident,
      name: str(r.name),
      type: str(r.type),
      frequency_khz: num(r.frequency_khz),
      lat,
      lon,
      elevation_ft: num(r.elevation_ft),
      dme_channel: str(r.dme_channel),
      magnetic_variation_deg: num(r.magnetic_variation_deg),
      usageType: str(r.usageType),
      associated_airport: str(r.associated_airport),
    });
  }

  // Empty output means the schema moved or the wrong file was handed in — the
  // region demonstrably contains airports and navaids. Fail rather than commit
  // a plausible-looking empty database.
  if (airports.length === 0) throw new Error('no airports inside the region — check the input files');
  if (navaids.length === 0) throw new Error('no navaids inside the region — check the input files');

  const byIdent = (a, b) => (a.ident ?? '').localeCompare(b.ident ?? '');
  airports.sort(byIdent);
  navaids.sort(byIdent);
  runways.sort(
    (a, b) =>
      (a.airport_ident ?? '').localeCompare(b.airport_ident ?? '') ||
      (a.le_ident ?? '').localeCompare(b.le_ident ?? ''),
  );

  return { airports, runways, navaids };
}

// --- Fetch (Doctrine §15) ----------------------------------------------------

function assertPolicyReadable() {
  if (!SOURCE_POLICY.policyReadOn) {
    throw new Error(
      `${SOURCE_POLICY.source}: published terms at ${SOURCE_POLICY.policyUrl} have not been ` +
        'read. Read them, set SOURCE_POLICY.policyReadOn, or run with --from <dir> to use ' +
        'local CSVs and skip the network.',
    );
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPolitely(url, { attempt = 0 } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': SOURCE_POLICY.userAgent } });

  if (res.status === 429 || res.status === 503) {
    // A 429 is an instruction. Honour Retry-After exactly; never retry harder,
    // never widen concurrency, never hop to a mirror to evade it.
    const retryAfter = Number(res.headers.get('retry-after'));
    if (attempt >= 2 || !Number.isFinite(retryAfter)) {
      throw new Error(`${url}: ${res.status} and no usable Retry-After — stopping, not retrying harder`);
    }
    await sleep(retryAfter * 1000);
    return fetchPolitely(url, { attempt: attempt + 1 });
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function loadSources({ from }) {
  const out = {};
  if (from) {
    for (const [name] of Object.entries(SOURCE_FILES)) {
      out[name] = await readFile(path.resolve(from, `${name}.csv`), 'utf8');
    }
    return { csv: out, origin: path.resolve(from) };
  }

  assertPolicyReadable();
  const cacheDir = path.join(REPO, '.cache', 'ourairports');
  await mkdir(cacheDir, { recursive: true });

  let first = true;
  for (const [name, url] of Object.entries(SOURCE_FILES)) {
    // Sequential, with the declared minimum gap: maxConcurrency is 1.
    if (!first) await sleep(SOURCE_POLICY.minIntervalMs);
    first = false;
    const text = await fetchPolitely(url);
    await writeFile(path.join(cacheDir, `${name}.csv`), text);
    out[name] = text;
  }
  return { csv: out, origin: SOURCE_POLICY.policyUrl };
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Mark the navdata bundle present, keeping every other entry untouched. */
async function updateManifest(outPath, data) {
  const manifestPath = path.join(REPO, 'public', 'data', 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`build-navdata: could not read the data manifest (${err.message}); navdata will still read as absent\n`);
    return;
  }
  manifest.navdata = {
    present: true,
    path: `/${path.relative(path.join(REPO, 'public'), outPath).split(path.sep).join('/')}`,
    reason: null,
    detail: `${data.airports.length} airports, ${data.runways.length} runways, ${data.navaids.length} navaids for ${REGION.id}.`,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write('  manifest public/data/manifest.json updated: navdata present\n');
}

// --- Main --------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      out: { type: 'string' },
    },
  });

  const outPath = path.resolve(REPO, values.out ?? 'public/data/navdata.json');
  const { csv, origin } = await loadSources({ from: values.from });
  const data = buildNavdata(
    { airportsCsv: csv.airports, runwaysCsv: csv.runways, navaidsCsv: csv.navaids },
    REGION.bbox,
  );

  const payload = {
    meta: {
      region: REGION.id,
      kvKey: REGION.kvKey,
      home: REGION.home,
      bbox: REGION.bbox,
      source: SOURCE_POLICY.source,
      sourceUrl: SOURCE_POLICY.policyUrl,
      sourceLicense: 'public domain (OurAirports)',
      sourceTermsReadOn: SOURCE_POLICY.policyReadOn,
      origin,
      generator: `scripts/build-navdata.mjs ${VERSION}`,
      // Provenance of the exact bytes this file was built from, so a later
      // session can tell whether a rebuild would change anything.
      sourceSha256: {
        airports: sha256(csv.airports),
        runways: sha256(csv.runways),
        navaids: sha256(csv.navaids),
      },
      counts: {
        airports: data.airports.length,
        runways: data.runways.length,
        navaids: data.navaids.length,
      },
    },
    ...data,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 0)}\n`);

  // Flip the data manifest, so the app stops reporting the bundle as absent.
  // The app asks the manifest BEFORE fetching a bundle (public/data/manifest.json
  // explains why), so writing the file without updating the manifest would
  // leave a perfectly good navdata database that nothing ever reads.
  await updateManifest(outPath, data);

  const rel = path.relative(REPO, outPath);
  process.stdout.write(
    `wrote ${rel}\n` +
      `  airports ${data.airports.length}  runways ${data.runways.length}  navaids ${data.navaids.length}\n` +
      `  region   ${REGION.bbox.latMin}..${REGION.bbox.latMax} lat, ` +
      `${REGION.bbox.lonMin}..${REGION.bbox.lonMax} lon\n` +
      `  KV copy  wrangler kv key put --binding=NAVDATA '${REGION.kvKey}' --path ${rel}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`build-navdata: ${err.message}\n`);
    process.exit(1);
  });
}
