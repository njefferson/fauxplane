/**
 * navaids.js — the nationwide ident → position table, read once.
 *
 * SEPARATE FROM `navdata.js` ON PURPOSE, and the two are not interchangeable.
 * `navdata.json` is the REGION: airports, runways and 44 navaids clipped to a
 * box around Northern California, which is exactly right for the centre picker
 * and cannot place a hazard advisory. This one is the opposite shape — the
 * whole country, positions and nothing else, about fifty kilobytes.
 *
 * A `FROM` line names PHX, BUF, MIA, CLE. None of those is in the region
 * bundle, so without this the advisory block was a nationwide list with no way
 * to tell which of it was overhead.
 *
 * Absent is a real answer, not an error: `manifest.js` is asked first, the
 * failure carries a sentence somebody wrote, and the advisory block falls back
 * to saying it could not narrow the list. It never falls back to a small
 * built-in table, which would be a synthetic navdata path wearing a helpful
 * face.
 */

import { bundleStatus } from './manifest.js';

export const NAVAIDS_URL = '/data/navaids-us.json';

let cached = null;

/**
 * Load the table. Cached, because every advisory in a bulletin asks for it and
 * the answer cannot change within a session.
 */
export async function loadNavaids(fetchImpl = fetch) {
  if (cached) return cached;
  const status = await bundleStatus('navaids', fetchImpl);
  if (!status.present) {
    cached = { ok: false, reason: status.reason ?? 'the navaid table is not in this build', detail: status.detail ?? null };
    return cached;
  }
  try {
    const res = await fetchImpl(status.path ?? NAVAIDS_URL, { cache: 'force-cache' });
    if (!res.ok) {
      cached = { ok: false, reason: `the data manifest says the navaid table is present but ${status.path ?? NAVAIDS_URL} returned HTTP ${res.status}` };
      return cached;
    }
    const body = await res.json();
    if (!body?.navaids || !body?.airports) {
      cached = { ok: false, reason: 'the navaid table is present but malformed (no navaids/airports)' };
      return cached;
    }
    cached = {
      ok: true,
      source: body.source ?? null,
      counts: { navaids: Object.keys(body.navaids).length, airports: Object.keys(body.airports).length },
      ambiguous: body.ambiguous ?? [],
      lookup: makeLookup(body),
    };
    return cached;
  } catch (err) {
    cached = { ok: false, reason: `the navaid table is unreadable: ${err.message}` };
    return cached;
  }
}

/**
 * Resolution order: VOR-class navaid, then airport.
 *
 * NAVAIDS FIRST BECAUSE THAT IS WHAT A `FROM` LINE MEANS. The airway system is
 * built on VORs, and an advisory naming CEW means the Crestview VOR. Where an
 * ident is both — and several are — the navaid is the one the meteorologist
 * plotted. The airports are here for PHX, MIA and CLE, which are airport codes
 * and not navaids at all.
 *
 * Exported so a test can drive it without a fetch.
 */
export function makeLookup(body) {
  const { navaids = {}, airports = {} } = body ?? {};
  return (ident) => {
    const hit = navaids[ident] ?? airports[ident];
    return hit ? { lat: hit[0], lon: hit[1] } : null;
  };
}

/** Test seam: forget what was read, so a test can supply a different table. */
export function resetNavaids() {
  cached = null;
}
