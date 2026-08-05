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
 */

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

/** The METAR box as the `bbox` query parameter the Pages Function expects. */
export const metarBboxParam = () => {
  const b = REGION.metarBbox;
  return `${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}`;
};
