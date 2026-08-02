/**
 * units.js — pure unit conversion. No state, no I/O, no defaults.
 *
 * Every function here returns null for a null input and NEVER substitutes a
 * value. A conversion is not a place where a missing reading can quietly become
 * a present one (the rule that shapes v1: no synthetic data path).
 */

// --- constants, all exact or standard-atmosphere definitions -----------------

/** Standard gravity, m/s^2 (CGPM 1901 definition). */
export const G0 = 9.80665;
/** Metres per international foot (exact). */
export const M_PER_FT = 0.3048;
/** Metres per nautical mile (exact). */
export const M_PER_NM = 1852;
/** Standard sea-level pressure, hectopascals (ISA). */
export const ISA_P0_HPA = 1013.25;
/** Standard sea-level pressure, inches of mercury (ISA). */
export const ISA_P0_INHG = 29.9213;
/** Standard sea-level temperature, kelvin (ISA). */
export const ISA_T0_K = 288.15;
/** ISA tropospheric lapse rate, K/m. */
export const ISA_LAPSE_K_PER_M = 0.0065;
/** Mean radius of the Earth, metres (IUGG). */
export const EARTH_RADIUS_M = 6371008.8;

const pass = (f) => (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : f(v));

// --- speed -------------------------------------------------------------------

export const msToKt = pass((v) => (v * 3600) / M_PER_NM);
export const ktToMs = pass((v) => (v * M_PER_NM) / 3600);
export const msToFpm = pass((v) => (v / M_PER_FT) * 60);

// --- length ------------------------------------------------------------------

export const mToFt = pass((v) => v / M_PER_FT);
export const ftToM = pass((v) => v * M_PER_FT);
export const mToNm = pass((v) => v / M_PER_NM);

// --- pressure ----------------------------------------------------------------

export const hPaToInHg = pass((v) => v * (ISA_P0_INHG / ISA_P0_HPA));
export const inHgToHPa = pass((v) => v * (ISA_P0_HPA / ISA_P0_INHG));

// --- angle -------------------------------------------------------------------

export const degToRad = pass((v) => (v * Math.PI) / 180);
export const radToDeg = pass((v) => (v * 180) / Math.PI);

/** Wrap to [0, 360). Used for every heading, track and bearing. */
export const wrap360 = pass((v) => ((v % 360) + 360) % 360);

/** Wrap to (-180, 180]. Used for every angular DIFFERENCE. */
export const wrap180 = pass((v) => {
  const w = ((v % 360) + 540) % 360;
  return w - 180 === -180 ? 180 : w - 180;
});

/**
 * Shortest signed turn from a to b, degrees. Positive is right/clockwise.
 * A naive b - a is wrong across the 360/0 seam, which is exactly where a
 * heading bug spends its life.
 */
export function angleDelta(a, b) {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return wrap180(b - a);
}

// --- atmosphere --------------------------------------------------------------

/**
 * Pressure altitude offset for a given altimeter setting, in FEET.
 *
 * The altimeter's Kollsman window shifts the indicated altitude by roughly
 * 1000 ft per inch of mercury near sea level; the exact form used here inverts
 * the ISA hypsometric relation, so it stays honest at altitude instead of
 * relying on the 1000 ft/inHg rule of thumb.
 *
 * Returns the number of feet to ADD to true (MSL) altitude to obtain pressure
 * altitude. With the setting at 29.92 the offset is zero by construction.
 */
export function pressureAltitudeOffsetFt(altimeterInHg) {
  if (altimeterInHg === null || !Number.isFinite(altimeterInHg) || altimeterInHg <= 0) return null;
  const exponent = (ISA_LAPSE_K_PER_M * 287.05287) / G0; // R_specific(air) = 287.05287 J/(kg K)
  const ratio = altimeterInHg / ISA_P0_INHG;
  const metres = (ISA_T0_K / ISA_LAPSE_K_PER_M) * (1 - Math.pow(ratio, exponent));
  return mToFt(metres);
}

/**
 * ISA temperature at a pressure altitude, in kelvin. Troposphere only — above
 * the tropopause it returns null rather than extrapolating a lapse rate that
 * has stopped applying.
 */
export function isaTempK(pressureAltFt) {
  if (pressureAltFt === null || !Number.isFinite(pressureAltFt)) return null;
  const m = ftToM(pressureAltFt);
  if (m > 11000) return null;
  return ISA_T0_K - ISA_LAPSE_K_PER_M * m;
}

/**
 * True airspeed -> calibrated airspeed, knots.
 *
 * Uses the compressible-flow relation rather than the sqrt(density-ratio)
 * approximation, because the approximation is silently wrong by several knots
 * at the altitudes a light aircraft actually flies.
 *
 * Returns null unless BOTH the pressure altitude and the outside air
 * temperature are real readings. This is the function most likely to be handed
 * a plausible substitute for OAT; it refuses.
 */
export function tasToCas(tasKt, { pressureAltFt, oatC }) {
  if (tasKt === null || !Number.isFinite(tasKt)) return null;
  if (pressureAltFt === null || !Number.isFinite(pressureAltFt)) return null;
  if (oatC === null || !Number.isFinite(oatC)) return null;

  const tK = oatC + 273.15;
  if (tK <= 0) return null;

  // Static pressure at the pressure altitude, from the ISA relation.
  const m = ftToM(pressureAltFt);
  const tIsa = ISA_T0_K - ISA_LAPSE_K_PER_M * m;
  if (tIsa <= 0) return null;
  const pStatic = ISA_P0_HPA * Math.pow(tIsa / ISA_T0_K, G0 / (ISA_LAPSE_K_PER_M * 287.05287));

  // Local speed of sound from the ACTUAL temperature, not the standard one.
  const a = Math.sqrt(1.4 * 287.05287 * tK); // m/s
  const tasMs = ktToMs(tasKt);
  const mach = tasMs / a;

  // Impact pressure from Mach and static pressure (subsonic form).
  const qc = pStatic * (Math.pow(1 + 0.2 * mach * mach, 3.5) - 1);

  // Invert at sea level to get CAS.
  const a0 = Math.sqrt(1.4 * 287.05287 * ISA_T0_K);
  const casMs = a0 * Math.sqrt(5 * (Math.pow(qc / ISA_P0_HPA + 1, 1 / 3.5) - 1));
  return msToKt(casMs);
}

// --- geometry ----------------------------------------------------------------

/** Great-circle distance in metres (haversine). Null unless both points are real. */
export function greatCircleM(a, b) {
  if (!a || !b) return null;
  const { lat: lat1, lon: lon1 } = a;
  const { lat: lat2, lon: lon2 } = b;
  for (const v of [lat1, lon1, lat2, lon2]) if (!Number.isFinite(v)) return null;

  const p1 = degToRad(lat1);
  const p2 = degToRad(lat2);
  const dp = degToRad(lat2 - lat1);
  const dl = degToRad(lon2 - lon1);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle distance in nautical miles. */
export function greatCircleNm(a, b) {
  return mToNm(greatCircleM(a, b));
}

/**
 * Initial great-circle bearing FROM a TO b, degrees true, 0 at north.
 *
 * The initial bearing, not the rhumb line: over the tens of nautical miles a
 * plan view covers the two agree closely, but the initial bearing is the one
 * that matches what the great-circle distance beside it measured, and a display
 * that mixes the two is quietly inconsistent.
 */
export function bearingDeg(a, b) {
  if (!a || !b) return null;
  for (const v of [a.lat, a.lon, b.lat, b.lon]) if (!Number.isFinite(v)) return null;
  const p1 = degToRad(a.lat);
  const p2 = degToRad(b.lat);
  const dl = degToRad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  if (y === 0 && x === 0) return null; // the same point has no bearing
  return wrap360(radToDeg(Math.atan2(y, x)));
}

/**
 * A latitude/longitude bounding box a given number of nautical miles either
 * side of a point. Longitude degrees shrink with latitude, so the longitude
 * half-width is divided by cos(lat) — omitting that makes the box far too
 * narrow at 38 N, which is where this app lives.
 */
export function bboxAround({ lat, lon }, halfWidthNm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(halfWidthNm)) return null;
  const dLat = halfWidthNm / 60;
  const cos = Math.cos(degToRad(lat));
  // Near the poles cos -> 0 and the longitude span explodes; clamp to the whole
  // globe rather than emitting Infinity.
  const dLon = Math.abs(cos) < 1e-6 ? 180 : Math.min(180, halfWidthNm / 60 / Math.abs(cos));
  return {
    latMin: Math.max(-90, lat - dLat),
    latMax: Math.min(90, lat + dLat),
    lonMin: lon - dLon,
    lonMax: lon + dLon,
  };
}

// --- formatting --------------------------------------------------------------

/**
 * Format an age for display. STALE fields must show their age (the rendering
 * rule), and it has to be readable at a glance on a panel.
 */
export function formatAge(ms) {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '--';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 100 ? `${h}h` : '99h+';
}
