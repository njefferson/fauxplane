/**
 * position.js — WHERE THE READER IS, answered once.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT THREE
 * ---------------------------------------------------------------------------
 *
 * Three feeds needed this answer and two of them had never asked. Traffic and
 * winds aloft already read the live fix; METAR asked about a rectangle over
 * Sacramento while measuring the distance to the station it picked from the
 * reader's real position, and the text reports were nailed to the region
 * outright — so "Over your area" meant "over Northern California" for everyone
 * who was not standing in it.
 *
 * Two functions answering "where is the reader" is how they come to disagree,
 * and that had already happened inside `metar.js` alone. So there is one, and
 * every caller gets the same ladder in the same order.
 *
 * ---------------------------------------------------------------------------
 * THE LADDER, AND WHY EACH RUNG NAMES ITSELF
 * ---------------------------------------------------------------------------
 *
 *   1. `fix`   the live GPS reading
 *   2. `last`  the coarse last-known fix this device remembered
 *   3. `home`  the region constant — a FALLBACK, never a fact
 *
 * Rung 3 is a position nobody measured, so anything that shows a number derived
 * from it has to be able to say which rung it is on. That is what `kind` is
 * for, and it is why this returns an object rather than a bare coordinate.
 *
 * Rung 2 is what makes a cold start anywhere but home work at all: it is a
 * measurement THIS DEVICE made, so it outranks a constant. It is stored to two
 * decimals — see `rememberFix` — which is about a kilometre, and coarser than
 * anything asked of it here.
 *
 * ---------------------------------------------------------------------------
 * FOLLOW MODE NEEDS NO SPECIAL CASE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * Following an aircraft moves ownership of `position.*` wholesale in
 * `traffic.js`. Reading those fields therefore follows the aircraft with no
 * branch here at all — which is the whole reason the store owns provenance.
 * A second opinion about which position is in force is exactly the two-pictures
 * -of-one-truth failure the ND comments warn about.
 *
 * This lives in `data/` rather than `core/` because it reaches
 * `data/traffic.js` for the remembered fix. `core/region.js` cannot import that
 * without a cycle, and moving `lastKnownFix` to break one would be churn for a
 * layering diagram nobody reads.
 */

import { REGION } from '../core/region.js';
import { lastKnownFix } from './traffic.js';

/**
 * Where to centre a feed query, and which rung of the ladder that came from.
 *
 * Always returns a usable coordinate — the bottom rung is a constant — so a
 * caller never has to handle null. What a caller DOES have to handle is
 * `kind !== 'fix'`, because a box centred on a remembered position or on a
 * constant is not centred on the reader and nothing may imply that it is.
 */
export function queryCentre(fields = {}, storage = globalThis.localStorage) {
  const lat = fields['position.lat'];
  const lon = fields['position.lon'];
  if (lat && lon && lat.provenance !== 'FAIL' && lon.provenance !== 'FAIL'
    && Number.isFinite(lat.value) && Number.isFinite(lon.value)) {
    return { lat: lat.value, lon: lon.value, kind: 'fix', isFix: true, label: 'your position' };
  }

  const last = lastKnownFix(storage);
  if (last) {
    return {
      lat: last.lat,
      lon: last.lon,
      kind: 'last',
      isFix: false,
      label: 'the last position this device reported',
    };
  }

  return {
    lat: REGION.home.lat,
    lon: REGION.home.lon,
    kind: 'home',
    isFix: false,
    label: `${REGION.home.name}, the reference this panel starts from`,
  };
}

/**
 * Is a position inside a bundle's declared extent?
 *
 * The basemap and the navdata each carry their own `bbox`, so this asks the
 * bundle rather than assuming the region constant describes it — they are two
 * different rectangles and one is noticeably larger than the other.
 *
 * A MISSING BOX IS `null`, NOT `false`. "The reader is outside the bundle" and
 * "nobody knows whether they are" are different claims, and a panel that made
 * the second sound like the first would tell someone standing in Sacramento
 * that their map does not cover them.
 */
export function insideBundle(centre, bbox) {
  if (!centre || !Number.isFinite(centre.lat) || !Number.isFinite(centre.lon)) return null;
  if (!bbox || !Number.isFinite(bbox.latMin) || !Number.isFinite(bbox.lonMin)
    || !Number.isFinite(bbox.latMax) || !Number.isFinite(bbox.lonMax)) return null;
  return centre.lat >= bbox.latMin && centre.lat <= bbox.latMax
    && centre.lon >= bbox.lonMin && centre.lon <= bbox.lonMax;
}
