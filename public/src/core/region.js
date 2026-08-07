/**
 * region.js — the region constants, in ONE place.
 *
 * These were previously declared inside scripts/build-navdata.mjs, which was
 * the only thing that needed them. The app needs them too — the home reference
 * is the position surrogate before the first GPS fix, and the METAR box and the
 * cold-start traffic box are both settled constants — so the declaration moved
 * here and the build script imports it.
 *
 * A hand-written carry list is a bug with a delay fuse. Anything needing the
 * home reference, the navdata bbox, the METAR box or the traffic cold-start box
 * imports it from here and never retypes it.
 *
 * Settled by the owner, 2026-08-02 (see NOTES.md).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS NO LONGER, from 2.0.0
 * ---------------------------------------------------------------------------
 *
 * `REGION` used to be where the app looked to answer "where is the reader".
 * It is not that and never was — it is where the BUNDLED DATA is, which is a
 * different question with the same answer only for one person. Every feed box
 * now derives from the live position (`queryBox`, below), and `REGION` is the
 * stated fallback for a panel that has no position yet.
 *
 * The bundled ground data really is clipped to this region, and that stays
 * true. What changed is that the app says so instead of drawing empty scope.
 */

import { bboxAround } from './units.js';

export const REGION = Object.freeze({
  id: 'norcal',
  kvKey: 'navdata:norcal',

  /** Home reference: Cameron Park, CA. Default map centre, HSI home waypoint,
   *  and the position surrogate used before the first GPS fix. */
  home: Object.freeze({ name: 'Cameron Park, CA', lat: 38.68, lon: -121.0 }),

  /** Navdata bounding box — roughly a 100 nm radius around home. It reaches
   *  past the Sierra to Reno, which is easy to assume otherwise. */
  bbox: Object.freeze({ latMin: 37.0, latMax: 40.4, lonMin: -123.2, lonMax: -118.8 }),

  /** METAR query box. Smaller than the navdata region on purpose: the point is
   *  to find the nearest reporting station, not to sweep the state. */
  metarBbox: Object.freeze({ latMin: 38.2, lonMin: -121.9, latMax: 39.2, lonMax: -120.2 }),

  /** OpenSky cold-start box, used only until the first GPS fix exists. */
  trafficColdStart: Object.freeze({ lamin: 38.1, lomin: -121.85, lamax: 39.25, lomax: -120.15 }),

  /** Traffic bbox half-width once a fix exists, nautical miles. */
  trafficHalfWidthNm: 40,
});

// ---------------------------------------------------------------------------
// TURNING A POSITION INTO A QUERY BOX
// ---------------------------------------------------------------------------

/**
 * How wide each feed's query box is, in nautical miles from the centre.
 *
 * These reproduce the boxes the app has always asked for; they are not a change
 * of coverage. The old `REGION.metarBbox` is 1.0° x 1.7° — about 30 x 40 nm —
 * and `REGION.bbox` is 3.4° x 4.4°, which at this latitude is about 102 nm each
 * way.
 *
 * METAR is the smaller ON PURPOSE and always was: it is looking for the NEAREST
 * reporting station and one station is enough. The text reports need the larger
 * one because a pilot report forty miles away is worth reading and a SIGMET's
 * whole point is that it covers an area.
 */
export const QUERY_HALF_WIDTH_NM = Object.freeze({ metar: 35, wxtext: 100 });

/**
 * The centre is SNAPPED to this grid before a box is built, and both reasons
 * are the ones `functions/api/traffic.js` already states for the same quantum.
 *
 * PRIVACY: the outbound query stops carrying a precise position. A tenth of a
 * degree is about six nautical miles, against a box thirty to a hundred miles
 * across — nothing here needs a doorstep.
 *
 * CACHING, which is the one that would bite silently: `cached()` in
 * `functions/api/_lib.js` keys on the URL. A box that moved with GPS jitter
 * would miss the edge cache on every single refresh, which turns "never ask
 * twice for what we already have" into one fresh upstream query per reader
 * every few minutes — exactly the shape Doctrine §15.4 and §15.6 forbid.
 * A stationary phone snaps to the same cell all day.
 */
export const QUERY_QUANTUM_DEG = 0.1;

/**
 * The Function refuses a box larger than this on a side (`parseBbox`), and a
 * 400 counts against a rate limit — so the box is clamped here rather than
 * discovered up there.
 */
export const MAX_QUERY_SPAN_DEG = 12;

const snap = (v) => Math.round(v / QUERY_QUANTUM_DEG) * QUERY_QUANTUM_DEG;

/**
 * A query box around a centre, as the `bbox` parameter the Pages Functions
 * expect, plus what had to be done to it.
 *
 * Returns null for a centre that is not a coordinate — a caller with no
 * position must say so rather than be handed a box over the middle of nowhere.
 *
 * TWO CLAMPS, and neither is theoretical enough to skip:
 *
 *   · THE SPAN. A degree of longitude shrinks toward the poles, so a 100 nm
 *     half-width crosses the Function's twelve-degree cap above about 74°
 *     latitude. Rare, but the failure is a 400 charged to a rate limit on
 *     every refresh rather than a visible error.
 *
 *   · THE ANTIMERIDIAN. `bboxAround` does not wrap, and `parseBbox` rejects a
 *     longitude outside ±180 — so a reader near the dateline would burn that
 *     same 400 forever. Clamped to the meridian: a narrower box than asked for
 *     is honest, because nothing claims the box is symmetric.
 */
export function queryBox(centre, halfWidthNm) {
  if (!centre || !Number.isFinite(centre.lat) || !Number.isFinite(centre.lon)) return null;
  if (!Number.isFinite(halfWidthNm) || halfWidthNm <= 0) return null;

  const lat = Math.max(-90, Math.min(90, snap(centre.lat)));
  const lon = Math.max(-180, Math.min(180, snap(centre.lon)));

  const box = bboxAround({ lat, lon }, halfWidthNm);
  if (!box) return null;

  /**
   * A MARGIN INSIDE THE CAP, AND FLOATING POINT IS THE WHOLE REASON.
   *
   * `parseBbox` refuses a span STRICTLY GREATER than twelve degrees. Clamping
   * to exactly twelve produced 12.000000000000007 at 82°N — refused, as a 400,
   * on every refresh, for a reader in Alert or Longyearbyen. Caught by asking
   * the real validator rather than by restating its rule in a test.
   *
   * A hundredth of a degree is about half a nautical mile off a box a hundred
   * miles across, and it buys certainty at the only edge that matters.
   */
  const half = (MAX_QUERY_SPAN_DEG - 0.01) / 2;
  // Rounded to four decimals — about eleven metres, far finer than the tenth of
  // a degree the centre is already snapped to, so it changes no coverage. It
  // keeps the query URL short and identical between refreshes, which is the
  // whole point of snapping in the first place.
  const round = (v) => Math.round(v * 1e4) / 1e4;
  const latMin = round(Math.max(-90, Math.max(box.latMin, lat - half)));
  const latMax = round(Math.min(90, Math.min(box.latMax, lat + half)));
  const lonMin = round(Math.max(-180, Math.max(box.lonMin, lon - half)));
  const lonMax = round(Math.min(180, Math.min(box.lonMax, lon + half)));

  // A centre snapped onto a pole or the meridian itself would collapse a side
  // to zero, and `parseBbox` requires min < max. Nothing usable is left to ask
  // about, so this refuses rather than sending a degenerate box.
  if (!(latMin < latMax) || !(lonMin < lonMax)) return null;

  return {
    bbox: { latMin, lonMin, latMax, lonMax },
    param: `${latMin},${lonMin},${latMax},${lonMax}`,
    centre: { lat, lon },
  };
}

/**
 * The METAR box as the `bbox` query parameter the Pages Function expects.
 *
 * IT TAKES A CENTRE NOW. Before 2.0.0 this was a constant, so every reader on
 * earth asked about a rectangle over Sacramento — the distance to the chosen
 * station followed the live fix while the station itself could not, and a
 * reader in Denver was told how far they were from a California field.
 *
 * `REGION.metarBbox` survives as the stated fallback for a panel with no
 * position at all, which is a real state and says so.
 */
export const metarBboxParam = (centre = null) => {
  const box = queryBox(centre, QUERY_HALF_WIDTH_NM.metar);
  if (box) return box.param;
  const b = REGION.metarBbox;
  return `${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}`;
};
