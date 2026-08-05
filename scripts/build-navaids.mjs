#!/usr/bin/env node
/**
 * build-navaids.mjs — the nationwide ident → position table, so a hazard
 * advisory can be placed on the map instead of merely listed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM `build-navdata.mjs`
 * ---------------------------------------------------------------------------
 *
 * SIGMETs and AIRMETs describe their area as a closed path of navaid names:
 *
 *     FROM 30W PHX-60E PHX-40N TUS-80ESE BZA-70E BZA-30W
 *     FROM BUF-BDL-CRG-CEW-BNA-CLE-BUF
 *
 * That `FROM` line is the ONLY thing in the raw text carrying real geography.
 * The service does not narrow these to a bounding box — the identical parameter
 * that filters PIREPs and TAFs comes back nationwide here — so a panel in
 * Sacramento was being shown Phoenix, Nebraska, Cleveland and Key West, and had
 * no way to tell which of them were over the reader.
 *
 * `navdata.json` cannot answer it. Its 44 navaids are **bbox-clipped to the
 * region** by `inBox` in `build-navdata.mjs`, which is exactly right for the
 * centre picker and useless here: a nationwide advisory names PHX, BUF, MIA,
 * and none of those is in it. This table is deliberately the opposite shape —
 * the whole country, and nothing but a position.
 *
 * IT IS SMALL, which is the reason this is worth doing at all. Positions only,
 * four decimal places, US VOR-class navaids plus the airports that carry an
 * IATA code: about fifty kilobytes, against the 324 KB airport bundle already
 * shipped. The heavy file is airports, not navaids.
 *
 * ---------------------------------------------------------------------------
 * SOURCE AND LICENCE (Doctrine §8, §15.1)
 * ---------------------------------------------------------------------------
 *
 *   Source : OurAirports bulk data — navaids.csv and airports.csv
 *   Terms  : SETTLED 2026-08-03 and unchanged here. The publisher commits an
 *            **Unlicense** — a public-domain dedication — to the data
 *            repository the CSVs come from, which is a licence grant on the
 *            artifact rather than a README describing the files. The reasoning
 *            is in NOTES.md and in `build-navdata.mjs`; this reads the SAME
 *            files under the SAME grant and adds no new question.
 *
 * The CSVs are never committed. They are fetched into `.cache/ourairports/` —
 * shared with `build-navdata.mjs`, which is why running that first makes this
 * free — or supplied with `--from <dir>`.
 *
 * ---------------------------------------------------------------------------
 * THE COLLISION POLICY, and it refuses rather than guesses
 * ---------------------------------------------------------------------------
 *
 * 157 US idents appear more than once, mostly an NDB sharing an ident with a
 * VOR. An advisory naming one of them means exactly one place, and this file
 * cannot know which.
 *
 * So: rank by type, keep the clear winner, and **drop any ident where two
 * entries tie at the top rank**. A dropped ident resolves to "could not place",
 * which the panel shows as its own group — a stated unknown. Keeping a coin
 * flip would put an advisory on the map at a position nobody measured, which is
 * the one thing this app does not do.
 *
 * Usage:
 *   node scripts/build-navaids.mjs                 # cache or fetch
 *   node scripts/build-navaids.mjs --from ./csvs   # local files, no network
 *   node scripts/build-navaids.mjs --out path.json # override the output
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const CACHE = path.join(REPO, '.cache', 'ourairports');

/** The publisher's own repository, which is what `raw.githubusercontent.com`
 *  serves. `ourairports.com` itself has never been reachable from this sandbox;
 *  `build-navdata.mjs` records the same thing. */
const MIRROR = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main';

/**
 * WHICH NAVAIDS A `FROM` LINE ACTUALLY NAMES, in preference order.
 *
 * En-route advisories are drawn between VOR-class facilities — that is what the
 * airway system is built on. NDBs are deliberately EXCLUDED: they roughly treble
 * the file, they are the source of nearly every ident collision, and a `FROM`
 * line does not use them. Excluding them makes the table smaller AND less
 * ambiguous, which is an unusual pair.
 *
 * The order is the tie-break: a VORTAC beats a plain VOR of the same name.
 */
const NAVAID_RANK = ['VORTAC', 'VOR-DME', 'VOR', 'TACAN', 'DME'];

/** Airports worth carrying as a fallback. PHX, MIA and CLE are not navaids at
 *  all — they are airport codes — so without this those advisories are
 *  unplaceable. Small and medium only; a grass strip is never named in a
 *  SIGMET and 60,000 of them would dwarf the file. */
const AIRPORT_TYPES = new Set(['large_airport', 'medium_airport']);

const PRECISION = 4;
const round = (n) => Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;

/** A CSV reader that handles quoted fields with commas in them. The OurAirports
 *  files are full of `"Sacramento, CA"`. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(rows) {
  const [header, ...body] = rows;
  return body.filter((r) => r.length >= header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function load(name, fromDir) {
  if (fromDir) return readFile(path.join(fromDir, name), 'utf8');
  const cached = path.join(CACHE, name);
  try {
    return await readFile(cached, 'utf8');
  } catch {
    /* not cached — fetch below */
  }
  process.stdout.write(`  fetching ${name} …\n`);
  const res = await fetch(`${MIRROR}/${name}`, {
    headers: { 'user-agent': 'fauxplane build-navaids (+https://github.com/njefferson/fauxplane)' },
  });
  if (!res.ok) throw new Error(`${name} returned HTTP ${res.status}`);
  const body = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, body);
  return body;
}

/**
 * Reduce a set of rows to `ident → [lat, lon]`, dropping any ident that two
 * rows tie for. Exported for the test, which checks the refusal rather than
 * trusting it.
 */
export function collapseByIdent(rows, rankOf) {
  const best = new Map();
  for (const r of rows) {
    const rank = rankOf(r);
    if (rank < 0) continue;
    const cur = best.get(r.ident);
    if (!cur) best.set(r.ident, { rank, lat: r.lat, lon: r.lon, tied: false });
    else if (rank < cur.rank) best.set(r.ident, { rank, lat: r.lat, lon: r.lon, tied: false });
    else if (rank === cur.rank) cur.tied = true;
  }
  const out = {};
  const ambiguous = [];
  for (const [ident, v] of best) {
    // A TIE IS AN UNKNOWN, NOT A CHOICE. Two facilities with one name and no way
    // to tell which an advisory meant: refuse, and let it show as unplaced.
    if (v.tied) { ambiguous.push(ident); continue; }
    out[ident] = [round(v.lat), round(v.lon)];
  }
  return { table: out, ambiguous: ambiguous.sort() };
}

async function main() {
  const { values } = parseArgs({ options: { from: { type: 'string' }, out: { type: 'string' } }, allowPositionals: false });
  const fromDir = values.from ? path.resolve(values.from) : null;
  const outPath = path.resolve(REPO, values.out ?? 'public/data/navaids-us.json');

  const navaidsCsv = await load('navaids.csv', fromDir);
  const airportsCsv = await load('airports.csv', fromDir);

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const navRows = toObjects(parseCsv(navaidsCsv))
    .filter((r) => r.iso_country === 'US' && r.ident && num(r.latitude_deg) !== null && num(r.longitude_deg) !== null)
    .map((r) => ({ ident: r.ident, type: r.type, lat: num(r.latitude_deg), lon: num(r.longitude_deg) }));

  const navaids = collapseByIdent(navRows, (r) => NAVAID_RANK.indexOf(r.type));

  const aptRows = toObjects(parseCsv(airportsCsv))
    .filter((r) => r.iso_country === 'US' && AIRPORT_TYPES.has(r.type) && r.iata_code
      && num(r.latitude_deg) !== null && num(r.longitude_deg) !== null)
    .map((r) => ({ ident: r.iata_code, type: r.type, lat: num(r.latitude_deg), lon: num(r.longitude_deg) }));

  const airports = collapseByIdent(aptRows, (r) => (r.type === 'large_airport' ? 0 : 1));

  if (Object.keys(navaids.table).length < 500) {
    throw new Error(`only ${Object.keys(navaids.table).length} navaids resolved — refusing to write a table that cannot place a nationwide advisory`);
  }

  const payload = {
    source: {
      name: 'OurAirports',
      url: 'https://ourairports.com/data/',
      licence: 'Unlicense (public domain dedication)',
      licenceUrl: 'https://github.com/davidmegginson/ourairports-data/blob/main/LICENSE',
      mirror: MIRROR,
      sha256: {
        navaids: createHash('sha256').update(navaidsCsv).digest('hex'),
        airports: createHash('sha256').update(airportsCsv).digest('hex'),
      },
    },
    country: 'US',
    precision: PRECISION,
    /** VOR-class only, and why: see NAVAID_RANK. */
    navaidTypes: NAVAID_RANK,
    /** Idents this file REFUSES to resolve because two facilities share them.
     *  Carried rather than dropped silently — an advisory naming one of these
     *  shows as unplaced, and the reader can see why. */
    ambiguous: [...navaids.ambiguous, ...airports.ambiguous].sort(),
    navaids: navaids.table,
    airports: airports.table,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload)}\n`);

  const bytes = Buffer.byteLength(JSON.stringify(payload));

  // FLIP THE DATA MANIFEST, for the same reason `build-navdata.mjs` does: the
  // app asks the manifest BEFORE fetching a bundle, so writing the file without
  // this ships a table the app will keep reporting as absent. The reason string
  // is short because an instrument flag shows it; the detail is long because
  // BITE has room.
  const manifestPath = path.join(REPO, 'public', 'data', 'manifest.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.navaids = {
      present: true,
      path: `/${path.relative(path.join(REPO, 'public'), outPath).split(path.sep).join('/')}`,
      reason: null,
      detail: `${Object.keys(payload.navaids).length} US navaids and ${Object.keys(payload.airports).length} airports, positions only, `
        + `for placing hazard advisories from their FROM line. ${payload.ambiguous.length} idents refused as ambiguous. OurAirports, Unlicense.`,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write('  manifest public/data/manifest.json updated: navaids present\n');
  } catch (err) {
    process.stderr.write(`build-navaids: could not update the data manifest (${err.message}); the table will still read as absent\n`);
  }

  process.stdout.write(
    `wrote ${path.relative(REPO, outPath)}\n`
      + `  navaids   ${Object.keys(payload.navaids).length} (${NAVAID_RANK.join(', ')})\n`
      + `  airports  ${Object.keys(payload.airports).length} (large and medium, with an IATA code)\n`
      + `  ambiguous ${payload.ambiguous.length} ident(s) refused rather than guessed\n`
      + `  ${(bytes / 1024).toFixed(0)} KB\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`build-navaids: ${err.message}\n`);
    process.exit(1);
  });
}
