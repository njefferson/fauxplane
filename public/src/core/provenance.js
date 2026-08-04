/**
 * provenance.js — the four states every value on this panel carries, and the
 * only constructors allowed to make one.
 *
 * THE RULE THAT SHAPES v1: every value traces to a device sensor or a fetched
 * feed. There is no synthetic path. This module is where that stops being a
 * promise and becomes a type: a field cannot be built without saying where it
 * came from and when, and a FAIL field cannot carry a value at all.
 *
 *   LIVE    — direct sensor or fetch, within its freshness window
 *   DERIVED — computed from other signals, all of which are themselves usable
 *   STALE   — last known good, past the freshness window; the age is displayed
 *   FAIL    — unavailable, denied, or an input it needs is unusable
 *
 * A field is { value, unit, provenance, ageMs } exactly as specified, plus a
 * `reason` that FAIL and STALE use to explain themselves — the BITE page and
 * the instrument flags both need it, and "every failure explains itself" is
 * Doctrine §5. `at` is the source timestamp the ageing machine works from.
 */

export const LIVE = 'LIVE';
export const DERIVED = 'DERIVED';
export const STALE = 'STALE';
export const FAIL = 'FAIL';

export const PROVENANCE = [LIVE, DERIVED, STALE, FAIL];

/** True when a field carries a number a pilot could act on. */
export const isUsable = (f) => !!f && f.provenance !== FAIL && f.value !== null && f.value !== undefined;

/**
 * Non-hue channel for every provenance state (Doctrine §4 — stated BEFORE the
 * code that draws it). Meaning must survive a grayscale render, so each state
 * carries a distinct GLYPH and a distinct WORD; colour only reinforces them.
 *
 * FAIL additionally removes the digits — the strongest non-hue signal there is,
 * and the one that makes "never freeze a gauge at its last value" visible
 * rather than merely true.
 */
export const MARK = {
  [LIVE]: { glyph: '●', word: 'LIVE', tone: 'live' }, // filled disc
  [DERIVED]: { glyph: '◇', word: 'DERIVED', tone: 'derived' }, // open diamond
  [STALE]: { glyph: '◐', word: 'STALE', tone: 'stale' }, // half-filled disc
  [FAIL]: { glyph: '✕', word: 'FAIL', tone: 'fail' }, // cross
};

/**
 * The one constructor. Everything else in the app funnels through it.
 *
 * Throws rather than repairing a contradiction: a FAIL that carries a number,
 * or a value with no source timestamp, is the exact defect v1 forbids, and it
 * must fail loudly at the point it is written rather than render plausibly.
 */
export function makeField({
  value = null,
  unit = null,
  provenance,
  at = null,
  ageMs = null,
  reason = null,
  forcedStale = false,
  forcedDerived = false,
  windows = null,
}) {
  if (!PROVENANCE.includes(provenance)) {
    throw new Error(`provenance must be one of ${PROVENANCE.join('/')}, got ${JSON.stringify(provenance)}`);
  }
  if (provenance === FAIL && value !== null) {
    throw new Error('a FAIL field cannot carry a value — that is the synthetic-data defect');
  }
  if (provenance !== FAIL && (value === null || value === undefined)) {
    throw new Error(`a ${provenance} field must carry a value; use fail(reason) instead`);
  }
  if (provenance !== FAIL && at === null) {
    throw new Error(`a ${provenance} field must say WHEN it was sourced`);
  }
  if (provenance === FAIL && !reason) {
    throw new Error('a FAIL field must explain itself — BITE and the flags both print the reason');
  }
  return Object.freeze({ value, unit, provenance, ageMs, reason, at, forcedStale, forcedDerived, windows });
}

/** A reading straight off a sensor or a feed. Ageing decides LIVE vs STALE. */
export const reading = (value, { unit = null, at }) => makeField({ value, unit, provenance: LIVE, at, ageMs: 0 });

/** A value computed from other signals. Ageing decides DERIVED vs STALE. */
export const derived = (value, { unit = null, at, reason = null }) =>
  makeField({ value, unit, provenance: DERIVED, at, ageMs: 0, reason });

/** No usable value, and why. The only way to express absence. */
export const fail = (reason, { unit = null } = {}) => makeField({ provenance: FAIL, unit, reason });

/**
 * Re-derive a field's provenance from its age. The state store calls this on
 * every publish, which is what makes "the network died" show up as STALE and
 * then FAIL without a single instrument having to implement it.
 *
 * `kind` is 'sensor' | 'feed' | 'derived' and only decides what a FRESH field
 * is called; past the freshness window every kind ages the same way.
 */
export function age(field, { now, freshMs, staleMs, kind }) {
  if (!field) return null;
  if (field.provenance === FAIL) return field;

  const ageMs = Math.max(0, now - field.at);
  if (ageMs > staleMs) {
    return makeField({
      provenance: FAIL,
      unit: field.unit,
      reason: `no update for ${Math.round(ageMs / 1000)}s (limit ${Math.round(staleMs / 1000)}s)`,
    });
  }
  // A field FORCED stale stays stale until a genuinely new reading replaces
  // it. Without this the flag survives 40 ms: ageing re-derives provenance
  // from the timestamp, sees the reading is still inside its freshness
  // window, and calls it LIVE again — so "mark the sensors stale the moment
  // we are backgrounded" would be undone by the very next publish, which is
  // exactly the case the flag exists for.
  // A field's KIND says what it normally is; `forcedDerived` says what THIS
  // value actually is. They differ when a field a sensor normally fills gets
  // computed instead — the turn rate is the gyro's on this device and is worked
  // out from two broadcast ground tracks when following an aircraft. Without
  // the flag that value published as LIVE while the bank angle DERIVED FROM IT
  // published as DERIVED, which is a derived value claiming to be more certain
  // than its own input.
  const fresh = field.forcedDerived || kind === 'derived' ? DERIVED : LIVE;
  const stale = field.forcedStale || ageMs > freshMs;
  return makeField({
    value: field.value,
    unit: field.unit,
    provenance: stale ? STALE : fresh,
    at: field.at,
    ageMs,
    reason: stale ? (field.reason ?? 'past its freshness window') : field.reason,
    forcedStale: field.forcedStale,
    forcedDerived: field.forcedDerived,
    // CARRIED THROUGH AGEING. Without this the owner's window survives exactly
    // one publish: `publishNow` re-ages from the raw field every 40 ms, and a
    // window dropped here would silently revert to the registry default.
    windows: field.windows,
  });
}

/**
 * Combine the provenance of several inputs for a derived value.
 *
 * The result is only as good as its worst input: any FAIL input makes the
 * output FAIL (naming which one), any STALE input makes it STALE. This is what
 * stops a derived readout looking healthier than the readings underneath it.
 */
/**
 * Unwrap a composed failure reason down to its ROOT cause.
 *
 * `worstOf` quotes its first failing input's reason — and that reason is often
 * itself a `worstOf` composition, so the quoting nests. Three levels deep, on
 * the face of a gauge, it read:
 *
 *   MSL altitude, altimeter setting, station altimeter unavailable (MSL
 *   altitude: GPS altitude, geoid separation unavailable (GPS altitude: not yet
 *   initialised))
 *
 * Every layer of that is individually correct and the whole is unreadable. The
 * INTERMEDIATE names are noise: what a reader needs is the names of what is
 * missing here, and the one fact underneath the entire chain. So the quoted
 * detail is unwrapped to the deepest cause and the middle layers are dropped.
 *
 * Bounded, because a cycle in the field graph would otherwise spin here — and
 * an error path that hangs is worse than the error.
 */
export function rootCause(reason) {
  let out = String(reason ?? '').trim();
  // 32 is not a guess about how deep reasons go — real chains are two to four.
  // The loop shrinks the string every pass and so always terminates on its own;
  // this cap only guarantees that a malformed reason cannot spin, and is set far
  // above any real chain so the bound never truncates a genuine one.
  for (let depth = 0; depth < 32; depth += 1) {
    const nested = /^.*? unavailable \((.*)\)$/s.exec(out);
    if (!nested) break;
    out = nested[1].trim();
  }
  return out;
}

export function worstOf(inputs) {
  const entries = Object.entries(inputs);
  const failed = entries.filter(([, f]) => !f || f.provenance === FAIL);
  if (failed.length) {
    // Name every failing input, but quote only the FIRST one's reason.
    // Concatenating all of them produced a paragraph on the face of a gauge:
    // four failed inputs each carrying a full sentence turned one altitude
    // readout into eight lines of prose. The names say what is missing; the
    // BITE page is where the full explanation of each one lives.
    const [firstName, firstField] = failed[0];
    const names = failed.map(([n]) => n);
    // The ROOT cause, not the intermediate one. See rootCause().
    const raw = firstField?.reason ?? 'missing';
    const root = rootCause(raw) || 'missing';
    // An unwrapped root already carries the name of the field it came from, so
    // prefixing it again produced "MSL altitude: GPS altitude: not yet
    // initialised" — two colons and a name that is not the cause.
    const detail = root === raw ? `${firstName}: ${root}` : root;
    return {
      provenance: FAIL,
      reason: failed.length === 1 ? detail : `${names.join(', ')} unavailable (${detail})`,
      at: null,
    };
  }
  const stale = entries.filter(([, f]) => f.provenance === STALE);
  // The derived value is exactly as old as its oldest input, not as old as the
  // moment it was computed. Stamping it "now" would launder a stale input into
  // a fresh-looking output — a lie that computes correctly.
  const at = Math.min(...entries.map(([, f]) => f.at));
  if (stale.length) {
    return { provenance: STALE, reason: `${stale.map(([n]) => n).join(', ')} stale`, at };
  }
  return { provenance: DERIVED, reason: null, at };
}
