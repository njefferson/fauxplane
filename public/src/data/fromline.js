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

/** Every `FROM`, wherever it sits. A bulletin has several — its own area, each
 *  OUTLOOK's, and each numbered `AREA n...FROM`. */
const FROM_WORD = /\bFROM\b/g;

/** One word of the raw text. Points and prose are both made of these. */
const TOKEN = /[A-Z0-9]+/g;

/** A polygon needs at least this many points, and at least one HYPHEN joining
 *  two of them. Both exist to reject the phrase "…ACUS01 KWNS FROM STORM
 *  PREDICTION CENTER FOR SYNOPSIS…", which is real text from a real bulletin and
 *  contains the word FROM in prose. It has no hyphen anywhere and reads as one
 *  ident followed by words. See `readClause`. */
const MIN_POINTS = 3;

/** An offset token: digits, then a 16-point compass name, and nothing else. */
const OFFSET = /^(\d{1,3})(N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW)$/;

/** A plausible facility ident. Two to five letters or digits, at least one
 *  letter, so a bare distance can never be mistaken for one. */
const IDENT = /^(?=.*[A-Z])[A-Z0-9]{2,5}$/;

/**
 * Read ONE clause, starting just after a `FROM`.
 *
 * ---------------------------------------------------------------------------
 * THE CLAUSE ENDS WHERE THE POLYGON CLOSES, and that is an observation
 * ---------------------------------------------------------------------------
 *
 * Every real area line captured so far closes on the point it opened with:
 *
 *     RSK-DMN-60SSE SSO-50S TUS-30SE BZA-50NNW PGS-RSK
 *     BUF-BDL-CRG-CEW-BNA-CLE-BUF
 *     END-ARG-LIT-MCB-CEW-210S CEW-50SSE LEV-100ESE PSX-END
 *     60S FTI-60SSW CME-10ENE DMN-40SW ABQ-60S FTI      <- offset repeats too
 *     30ESE HLC-40SW ICT-…-30ESE HLC
 *     40W PMM-BVT-70NNW ARG-40N END-40ESE HLC-40W PMM
 *
 * Six of six, and the seventh — `30W PHX-…-BZA-30W` — is a capture that stops
 * mid-point, which is what makes the exception meaningful rather than awkward.
 *
 * THIS REPLACED A BOUND AT THE NEWLINE, WHICH THE REAL FEED DOES NOT HAVE. The
 * fixture this was built from was a reconstruction with line breaks added; an
 * actual bulletin arrives as ONE continuous line, so that bound did nothing and
 * every clause ran on into the prose after it. `…ABQ-60S FTI AREA TS MOV LTL`
 * put AREA and TS into the polygon, neither is a place, and sixteen advisories
 * out of sixteen reported themselves unplaceable while every one of their
 * vertices was resolvable. Worse, the greedy match consumed the whole bulletin,
 * so the OUTLOOK's area and `AREA 2` were never even looked for.
 *
 * WHY NOT JUST STOP AT THE FIRST WORD THAT IS NOT A PLACE? Because `WST` — the
 * first word of `WST ISSUANCES EXPD`, which follows two of the areas above — is
 * an airport in the shipped table and resolves. A terminator built on the lookup
 * would swallow it as a vertex and move the polygon. The closure stops first.
 *
 * @returns {string|null} the clause text, or null if this `FROM` was prose
 */
function readClause(upper, from) {
  TOKEN.lastIndex = from;
  const points = [];
  let pending = null;
  let hyphen = false;
  let prevEnd = from;
  /** End of the last token that belongs to the polygon. A prose word that stops
   *  the scan is NOT part of it; a dangling offset at the very end of the input
   *  IS, because it is half of a point the text was cut through. */
  let end = from;
  let m;

  while ((m = TOKEN.exec(upper)) !== null) {
    const token = m[0];
    const gap = upper.slice(prevEnd, m.index);
    if (gap.includes('-')) hyphen = true;
    prevEnd = m.index + token.length;

    // A NEW CLAUSE STARTS HERE, so this one is over. `FROM` is four letters and
    // therefore ident-shaped: without this the scan walked out of one polygon
    // and into the next, merging an Arizona area with a Gulf one into a single
    // shape covering everything between them.
    if (token === 'FROM') break;

    if (OFFSET.test(token)) {
      pending = token;
      end = prevEnd; // provisional: real if the input ends here
      continue;
    }
    if (!IDENT.test(token)) break; // prose — the polygon ended before this word

    // AN OFFSET AND ITS IDENT ARE ONE POINT AND ARE NEVER WRITTEN APART. Where a
    // line break falls between them the text was cut, and pairing across it
    // INVENTS a vertex: `…CEW-50SSE` followed by `WST ISSUANCES EXPD` reads as
    // 50 nm south-south-east of Westerly, Rhode Island, which drags a polygon
    // over Oklahoma and the Gulf into New England. The offset stays dangling,
    // which is what says the line was truncated.
    if (pending && gap.includes('\n')) break;

    const point = pending ? `${pending} ${token}` : token;
    pending = null;
    points.push(point);
    end = prevEnd;

    // CLOSED. Everything after this is the bulletin's prose.
    if (points.length >= MIN_POINTS && point === points[0]) break;
  }

  if (points.length < MIN_POINTS || !hyphen) return null;
  return upper.slice(from, end).trim();
}

/**
 * Every `FROM` clause in a bulletin, as raw token strings.
 * Exported because "did we find the clause at all" is a different failure from
 * "we found it and could not resolve it", and the panel says which.
 */
export function fromClauses(text) {
  if (typeof text !== 'string') return [];
  const upper = String(text).toUpperCase();
  const out = [];
  FROM_WORD.lastIndex = 0;
  let m;
  while ((m = FROM_WORD.exec(upper)) !== null) {
    const clause = readClause(upper, m.index + m[0].length);
    if (clause) out.push(clause);
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
  let open = false;
  for (const clause of clauses) {
    const r = resolveClause(clause, lookup);
    if (polygonTouchesBox(r.points, box)) touches = true;
    // A POLYGON THAT DOES NOT CLOSE MAY BE MISSING A VERTEX. Every area line
    // seen in full returns to the point it opened with, so one that does not is
    // either cut short or is a shape this parser has never met — and both of
    // those are "we are not sure how far this reaches", never "it is elsewhere".
    const first = r.points[0];
    const last = r.points.at(-1);
    if (!first || !last || first.lat !== last.lat || first.lon !== last.lon) open = true;
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
  if (open) {
    return {
      where: 'unknown',
      points,
      unresolved,
      reason: 'the part that could be placed is elsewhere, but its area does not close, so it may reach further than this shows',
    };
  }
  return { where: 'far', points, unresolved, reason: null };
}
