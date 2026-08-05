/**
 * fromline.js — where a hazard advisory actually is.
 *
 * A SIGMET or AIRMET describes its area as a closed path of navaid names, with
 * optional offsets. Real lines, captured from a device on 2026-08-05:
 *
 *     FROM 30W PHX-60E PHX-40N TUS-80ESE BZA-70E BZA-30W
 *     FROM BUF-BDL-CRG-CEW-BNA-CLE-BUF
 *     AREA 3...FROM END-ARG-LIT-MCB-CEW-210S CEW-50SSE LEV-100ESE PSX-END
 *
 * This is the ONLY thing in the raw text carrying geography, and the service
 * does not narrow these to a bounding box — the identical parameter that
 * filters PIREPs and TAFs comes back nationwide here. Without this, a panel in
 * Sacramento lists Phoenix, Nebraska, Cleveland and Key West with no way to tell
 * which of them are overhead.
 *
 * ---------------------------------------------------------------------------
 * THE GRAMMAR, taken from real lines rather than from a specification
 * ---------------------------------------------------------------------------
 *
 * Points are separated by `-`, and a group of them by a space. A point is
 * either a bare ident (`PHX`, `BDL`) or an OFFSET from one: a distance in
 * nautical miles glued to a 16-point compass name, then the ident. The offset
 * and its ident are sometimes separated by a space (`30W PHX`) and sometimes by
 * the hyphen that also separates points (`PHX-60E PHX` — that is PHX, then 60
 * east of PHX). So the separators are ambiguous and the TOKENS are not: an
 * offset token can never be an ident, because it begins with a digit.
 *
 * That is why this tokenises on both separators and then reads left to right,
 * rather than trying to split the line into points first.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT REFUSES TO DO
 * ---------------------------------------------------------------------------
 *
 * A point it cannot resolve is NOT skipped and NOT guessed. The advisory comes
 * back with `complete: false` and the unresolved names, and the panel shows it
 * in its own group. An unresolved polygon means *we do not know where this is*,
 * which is not *it is not near you* — and hiding a hazard advisory because a
 * parser failed would be a worse defect than the one this fixes.
 *
 * Pure and free of any I/O, so every line it can meet is testable without a
 * browser or a feed.
 */

import { compassBearing, destinationPoint } from '../core/units.js';

/**
 * `FROM` through to the end of ITS OWN LINE, and no further.
 *
 * A bulletin has several — the advisory's own area and each OUTLOOK's and each
 * numbered AREA's — and every one is a real polygon on its own line. Every
 * captured line is one line; none wraps.
 *
 * THE LINE BOUND IS LOAD-BEARING. A clause allowed to run past the newline
 * swallows whatever prose follows — `MOD TURB BTN FL180 AND FL400` tokenises
 * into four ident-shaped words, none of which is a place, and an advisory whose
 * polygon resolved perfectly is then reported as unplaceable. Measured: without
 * this bound that exact line produced a five-word clause.
 */
const FROM_CLAUSE = /\bFROM\s+([^\n]+)/g;

/** Prose sometimes follows the polygon on the same line, after a full stop or a
 *  comma. Nothing before one of those has ever been anything but points. */
const CLAUSE_END = /[.,]/;

/** An offset token: digits, then a 16-point compass name, and nothing else. */
const OFFSET = /^(\d{1,3})(N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW)$/;

/** A plausible facility ident. Two to five letters or digits, at least one
 *  letter, so a bare distance can never be mistaken for one. */
const IDENT = /^(?=.*[A-Z])[A-Z0-9]{2,5}$/;

/**
 * Every `FROM` clause in a bulletin, as raw token strings.
 * Exported because "did we find the clause at all" is a different failure from
 * "we found it and could not resolve it", and the panel says which.
 */
export function fromClauses(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  for (const m of String(text).toUpperCase().matchAll(FROM_CLAUSE)) {
    const cut = m[1].search(CLAUSE_END);
    const body = (cut === -1 ? m[1] : m[1].slice(0, cut)).trim();
    if (body) out.push(body);
  }
  return out;
}

/**
 * Resolve one clause into positions.
 *
 * @param {string} clause the text after FROM
 * @param {(ident: string) => ({lat:number, lon:number}|null)} lookup
 * @returns {{points: {lat,lon}[], unresolved: string[]}}
 */
export function resolveClause(clause, lookup) {
  // BOTH SEPARATORS AT ONCE. `PHX-60E PHX` is three tokens — PHX, 60E, PHX —
  // and splitting on either one alone gets it wrong.
  const tokens = String(clause).toUpperCase().split(/[-\s]+/).filter(Boolean);
  const points = [];
  const unresolved = [];
  let pendingOffset = null;

  for (const token of tokens) {
    const off = OFFSET.exec(token);
    if (off) {
      // An offset applies to the ident that FOLLOWS it. Two in a row is not a
      // form that appears in real lines; the second replaces the first rather
      // than compounding, because compounding would invent a leg.
      pendingOffset = { token, nm: Number(off[1]), bearing: compassBearing(off[2]) };
      continue;
    }
    if (!IDENT.test(token)) {
      // Not an offset and not an ident — a word that got into the clause. It is
      // recorded, because silently ignoring a token in a hazard advisory is how
      // a polygon quietly becomes the wrong shape.
      unresolved.push(token);
      pendingOffset = null;
      continue;
    }
    const base = lookup(token);
    if (!base) {
      unresolved.push(token);
      pendingOffset = null;
      continue;
    }
    if (pendingOffset && Number.isFinite(pendingOffset.bearing)) {
      const p = destinationPoint(base, pendingOffset.bearing, pendingOffset.nm);
      if (p) points.push(p);
      else unresolved.push(token);
    } else {
      points.push({ lat: base.lat, lon: base.lon });
    }
    pendingOffset = null;
  }

  // A CLAUSE THAT ENDS ON AN OFFSET IS TRUNCATED, and that is evidence rather
  // than a guess: the text stopped in the middle of a point, so a vertex that
  // exists is missing. Every full line captured from the feed closes on the
  // facility it opened with — `RSK…PGS-RSK`, `BUF…CLE-BUF`, `END…PSX-END` —
  // and the one ending `BZA-30W` is an abbreviation of exactly that shape.
  //
  // Recording it is the whole difference between "this advisory is elsewhere"
  // and "we could not finish reading it". It was dropped silently in the first
  // version, which made a truncated Arizona polygon report itself as complete.
  if (pendingOffset) unresolved.push(pendingOffset.token);

  return { points, unresolved };
}

/**
 * Does a polygon touch a box?
 *
 * A bounding-box overlap of the polygon's own extent, which is deliberately
 * GENEROUS: the polygon's bounding box contains the polygon, so anything that
 * really intersects is caught, and a few things that do not are caught too.
 *
 * The asymmetry decides the design. An advisory is an AREA and the question is
 * "could this be over me", so a near miss answering yes costs the reader one
 * extra line, while a near miss answering no hides a hazard. Nothing sharper is
 * wanted here — a true point-in-polygon test would only ever REMOVE advisories
 * this returns, which is the direction that must not be taken on a guess.
 */
export function polygonTouchesBox(points, box) {
  if (!points?.length || !box) return false;
  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  for (const p of points) {
    latMin = Math.min(latMin, p.lat);
    latMax = Math.max(latMax, p.lat);
    lonMin = Math.min(lonMin, p.lon);
    lonMax = Math.max(lonMax, p.lon);
  }
  return !(latMax < box.latMin || latMin > box.latMax || lonMax < box.lonMin || lonMin > box.lonMax);
}

/**
 * Say WHY in the reader's terms, because the two failures are not the same one.
 *
 * `BZA` is a place this app has never heard of. `30W` is not a place at all —
 * it is half a point, left over because the text stopped mid-way through one.
 * Printing "30W could not be found" invites the reader to go looking for a
 * navaid called 30W, and the honest sentence is that the line ran out.
 */
function describeUnresolved(unresolved) {
  const names = unresolved.filter((t) => !OFFSET.test(t));
  const truncated = unresolved.length > names.length;
  const named = names.length
    ? `${names.slice(0, 3).join(', ')} ${names.length === 1 ? 'is not a place' : 'are not places'} this app can find`
    : null;
  const cut = truncated ? 'its area line stops part-way through a point' : null;
  return [named, cut].filter(Boolean).join(', and ');
}

/**
 * Where one advisory is, as far as this can tell.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THAT DECIDES A PARTIAL POLYGON, and it errs one way ON PURPOSE
 * ---------------------------------------------------------------------------
 *
 * A missing vertex can only ever make the real area BIGGER than what was
 * resolved. So:
 *
 *   · resolved points already touch the box  → it touches. Certain, because
 *     adding the missing vertex cannot take that away.
 *   · resolved points do NOT touch, and something was unresolved → UNKNOWN.
 *     The missing vertex might have reached you, and saying "elsewhere" would
 *     be a claim this cannot support.
 *   · resolved points do not touch and nothing was unresolved → elsewhere.
 *
 * The dangerous direction is a false "elsewhere" on a hazard that is overhead,
 * so the unknown case is grouped WITH the near ones rather than filed away.
 *
 * ---------------------------------------------------------------------------
 * EACH CLAUSE IS TESTED ON ITS OWN, and that is not a detail
 * ---------------------------------------------------------------------------
 *
 * One convective SIGMET bulletin carries several polygons — its own area, the
 * OUTLOOK's, and a numbered AREA for each cell. The captured bulletin has one
 * over Arizona and one running from Oklahoma to the Gulf. Pooling their
 * vertices and taking a single bounding box claims the whole of New Mexico and
 * west Texas, where the bulletin says nothing at all: measured, a box between
 * the two areas and inside neither came back `near`.
 *
 * So the advisory is near if ANY of its polygons is, which is both tighter and
 * still errs the safe way.
 *
 * @returns {{where: 'near'|'far'|'unknown', points, unresolved, reason}}
 */
export function placeAdvisory(text, box, lookup) {
  const clauses = fromClauses(text);
  if (!clauses.length) {
    return { where: 'unknown', points: [], unresolved: [], reason: 'no FROM line in this report' };
  }

  const points = [];
  const unresolved = [];
  let touches = false;
  for (const clause of clauses) {
    const r = resolveClause(clause, lookup);
    if (polygonTouchesBox(r.points, box)) touches = true;
    points.push(...r.points);
    unresolved.push(...r.unresolved);
  }

  if (!points.length) {
    return {
      where: 'unknown',
      points,
      unresolved,
      reason: unresolved.length
        ? describeUnresolved(unresolved)
        : 'the area line named no recognisable place',
    };
  }

  if (touches) {
    return { where: 'near', points, unresolved, reason: null };
  }
  if (unresolved.length) {
    return {
      where: 'unknown',
      points,
      unresolved,
      reason: `the part that could be placed is elsewhere, but ${describeUnresolved(unresolved)} — so it may reach further than this shows`,
    };
  }
  return { where: 'far', points, unresolved, reason: null };
}
