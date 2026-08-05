#!/usr/bin/env node
/**
 * build-basemap.mjs — regenerate public/data/basemap.json from Natural Earth,
 * clipped to the NorCal region in public/src/core/region.js.
 *
 * The world-wide source files are NEVER committed. They are fetched into
 * .cache/naturalearth/ or supplied with --from <dir>, and only the clipped
 * result is written into public/.
 *
 * ---------------------------------------------------------------------------
 * SOURCE AND ITS LICENCE (Doctrine §8, §15.1 — every ingest adapter declares
 * its source's licence in its header, from the publisher's own words)
 *
 *   Source : Natural Earth vector data
 *   Files  : ne_10m_coastline, ne_10m_lakes, ne_10m_rivers_lake_centerlines,
 *            ne_10m_urban_areas — the GeoJSON builds in the publisher's own
 *            repository, github.com/nvkelso/natural-earth-vector.
 *   Terms  : PUBLIC DOMAIN, read 2026-08-05 from LICENSE.md in that repository
 *            rather than from a description of it:
 *
 *              "Everything here is public domain. ... All versions of Natural
 *               Earth raster + vector map data found on this website are in the
 *               public domain. You may use the maps in any manner, including
 *               modifying the content and design, electronic dissemination, and
 *               offset printing. ... No permission is needed to use Natural
 *               Earth. Crediting the authors is unnecessary."
 *
 *            A LICENCE GRANT ON THE ARTIFACT, in the repository the files come
 *            from — the same standard the OurAirports question was finally
 *            settled on, and the same reason it counts: a README calling data
 *            "free" is a description, a committed LICENCE is a grant.
 *
 *   THE CREDIT IS GIVEN ANYWAY. They say it is unnecessary and offer wording
 *   for anyone who wants it; the app uses theirs. A source that asks for
 *   nothing still gets named, because a panel whose entire contract is that
 *   values trace to a source does not get to leave one anonymous.
 *
 * WHY 1:10m AND NOT 1:50m. This scope runs from 10 to 80 nautical miles. The
 * 1:50m build is generalised for looking at continents: drawn across a 10 nm
 * display its coastline is a handful of straight lines through the water, which
 * is not a coarse map but a WRONG one. 1:10m is a much larger download and the
 * difference does not reach the app, because what ships is the clip.
 *
 * WHY BUNDLED AND NOT TILED. Exactly the OurAirports reasoning: a dataset in
 * the repository cannot be rate limited, works with the radio off, and does not
 * put this app's load on somebody else's tile server (§15.5, §15.6). The region
 * is small enough that the whole basemap is smaller than the airport database.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node scripts/build-basemap.mjs                 # fetch from the mirror
 *   node scripts/build-basemap.mjs --from ./geo    # local files, no network
 *   node scripts/build-basemap.mjs --out path.json # override the output
 *
 * Exits non-zero on any failure and never writes a partial file. There is no
 * synthetic data path here either: a build that cannot prove its input produces
 * nothing at all.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { REGION } from '../public/src/core/region.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const CACHE = path.join(REPO, '.cache', 'naturalearth');

/**
 * The publisher's own repository, which is what `raw.githubusercontent.com`
 * serves. naturalearthdata.com's own download host has never been reachable
 * from this sandbox; recorded so nobody rediscovers it, exactly as the navdata
 * generator records the same thing about OurAirports.
 */
const MIRROR = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

/**
 * WHAT GETS DRAWN, AND IN WHAT ORDER — bottom first, so the list IS the paint
 * order and there is no second place that decides it.
 *
 * `kind` is what the renderer needs to know: a `line` is stroked open, an
 * `area` is a closed shape. Nothing here carries a colour; the palette decides
 * that, and a colour committed into a data file would be a token that no
 * palette check can see.
 */
const LAYERS = [
  { id: 'urban', file: 'ne_10m_urban_areas', kind: 'area', label: 'Built-up areas' },
  { id: 'lakes', file: 'ne_10m_lakes', kind: 'area', label: 'Lakes' },
  { id: 'rivers', file: 'ne_10m_rivers_lake_centerlines', kind: 'line', label: 'Rivers' },
  { id: 'coast', file: 'ne_10m_coastline', kind: 'line', label: 'Coastline' },
];

/**
 * A MARGIN AROUND THE REGION, because the scope can be centred on any airport
 * in the navdata and then look 80 nm further out. One degree of latitude is
 * 60 nm, so 1.5 degrees covers a scope centred on the very edge of the region
 * looking outward at the widest range.
 */
const MARGIN_DEG = 1.5;
const BOX = {
  latMin: REGION.bbox.latMin - MARGIN_DEG,
  latMax: REGION.bbox.latMax + MARGIN_DEG,
  lonMin: REGION.bbox.lonMin - MARGIN_DEG,
  lonMax: REGION.bbox.lonMax + MARGIN_DEG,
};

/**
 * FOUR DECIMAL PLACES IS ELEVEN METRES, and this display's finest scale is
 * 10 nm across a few hundred pixels — about 40 metres per pixel. Two more
 * digits than the screen can resolve is a third of the file size spent on
 * nothing. Rounding is applied ONCE, here, so what ships is what was measured
 * rather than a renderer quietly truncating at draw time.
 */
const PRECISION = 4;
const round = (n) => Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;

const inBox = ([lon, lat]) => lon >= BOX.lonMin && lon <= BOX.lonMax && lat >= BOX.latMin && lat <= BOX.latMax;

/**
 * Keep only the parts of a line that are near the region, and SPLIT it wherever
 * it leaves — a coastline that runs from Alaska to Panama must not become one
 * straight segment across the map because both ends were dropped.
 *
 * One point of slack on each side of the boundary is kept deliberately, so a
 * line entering the box is drawn from outside the edge rather than starting
 * abruptly just inside it.
 */
function clipLine(coords) {
  const out = [];
  let run = [];
  for (let i = 0; i < coords.length; i += 1) {
    const near = inBox(coords[i]) || (i > 0 && inBox(coords[i - 1])) || (i + 1 < coords.length && inBox(coords[i + 1]));
    if (near) {
      run.push([round(coords[i][0]), round(coords[i][1])]);
    } else if (run.length > 1) {
      out.push(run);
      run = [];
    } else {
      run = [];
    }
  }
  if (run.length > 1) out.push(run);
  return out;
}

/**
 * Areas are kept WHOLE or dropped, and that is the honest choice at this scale.
 * Clipping a polygon properly means cutting it against the box and closing the
 * cut edge, and a lake closed along an invented straight edge is a shoreline
 * this app did not measure. At 1:10m the areas near this region — lakes,
 * suburbs — are small enough that keeping the whole of any that touches the box
 * costs little and invents nothing.
 */
const ringTouchesBox = (ring) => ring.some(inBox);

function clipArea(rings) {
  const kept = rings.filter(ringTouchesBox);
  return kept.length ? kept.map((r) => r.map(([lon, lat]) => [round(lon), round(lat)])) : null;
}

function extract(geojson, kind) {
  const shapes = [];
  for (const feature of geojson.features ?? []) {
    const g = feature.geometry;
    if (!g) continue;
    if (kind === 'line') {
      const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const line of lines) shapes.push(...clipLine(line));
    } else {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poly of polys) {
        const clipped = clipArea(poly);
        if (clipped) shapes.push(...clipped);
      }
    }
  }
  return shapes;
}

async function load(layer, fromDir) {
  const name = `${layer.file}.geojson`;
  if (fromDir) return JSON.parse(await readFile(path.join(fromDir, name), 'utf8'));

  const cached = path.join(CACHE, name);
  try {
    return JSON.parse(await readFile(cached, 'utf8'));
  } catch {
    /* not cached yet — fetch it below */
  }

  const url = `${MIRROR}/${name}`;
  process.stdout.write(`  fetching ${name} …\n`);
  const res = await fetch(url, { headers: { 'user-agent': 'fauxplane build-basemap (+https://github.com/njefferson/fauxplane)' } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const body = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, body);
  return JSON.parse(body);
}

async function main() {
  const { values } = parseArgs({
    options: { from: { type: 'string' }, out: { type: 'string' } },
    allowPositionals: false,
  });

  const outPath = path.resolve(REPO, values.out ?? 'public/data/basemap.json');
  const layers = [];
  let points = 0;

  for (const layer of LAYERS) {
    const geo = await load(layer, values.from ? path.resolve(values.from) : null);
    const shapes = extract(geo, layer.kind);
    if (!shapes.length) throw new Error(`${layer.file} produced nothing inside the region — refusing to write an empty layer`);
    points += shapes.reduce((n, s) => n + s.length, 0);
    layers.push({ id: layer.id, kind: layer.kind, label: layer.label, shapes });
  }

  const payload = {
    source: {
      name: 'Natural Earth',
      scale: '1:10m',
      url: 'https://www.naturalearthdata.com/',
      licence: 'public domain',
      // THEIR OWN WORDING, offered in LICENSE.md for anyone who wants to cite
      // them. Using ours instead would be a citation we wrote about somebody
      // else's terms — see the traffic providers, where that was a real defect.
      credit: 'Made with Natural Earth.',
      mirror: MIRROR,
    },
    region: REGION.id,
    bbox: BOX,
    precision: PRECISION,
    layers,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload)}\n`);

  const bytes = Buffer.byteLength(JSON.stringify(payload));
  const rel = path.relative(REPO, outPath);
  process.stdout.write(
    `wrote ${rel}\n` +
      layers.map((l) => `  ${l.id.padEnd(8)} ${String(l.shapes.length).padStart(5)} shapes\n`).join('') +
      `  ${points} points, ${(bytes / 1024).toFixed(0)} KB\n` +
      `  region   ${BOX.latMin}..${BOX.latMax} lat, ${BOX.lonMin}..${BOX.lonMax} lon\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`build-basemap: ${err.message}\n`);
    process.exit(1);
  });
}
