/**
 * wmm.js — magnetic declination from the World Magnetic Model, computed
 * client-side. No network call, as specified.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SHIPS WITHOUT COEFFICIENTS, AND WHY THAT IS THE HONEST STATE
 *
 * The algorithm below is the real thing: geodetic-to-geocentric conversion,
 * Schmidt semi-normalised associated Legendre functions, and the field sum that
 * NOAA's own reference implementation performs. What it needs is the WMM
 * coefficient file (`WMM.COF`), which is published by NOAA/BGS and is NOT in
 * this repo, because the session that built this could not reach the network to
 * fetch it (the egress proxy denies the host, and Doctrine §15 says do not route
 * around it).
 *
 * The coefficients are 90 numbers. Typing "roughly right" ones from memory
 * would produce a declination that is plausible to within a few degrees and
 * wrong — the exact defect v1 exists to forbid, on a number a pilot would use
 * to reconcile a compass against a GPS track. So: no file, no declination, FAIL
 * with the reason. Drop a real `public/data/wmm-cof.json` in and every consumer
 * lights up with no other change.
 *
 * Source when it is fetched: https://www.ncei.noaa.gov/products/world-magnetic-model
 * Terms: US Government work, public domain. NOT RE-READ THIS SESSION — the same
 * block. `COF_TERMS_READ_ON` stays null until someone reads them.
 * ---------------------------------------------------------------------------
 */

import { bundleStatus } from './manifest.js';
import { degToRad, radToDeg } from '../core/units.js';

export const COF_URL = '/data/wmm-cof.json';
export const COF_TERMS_READ_ON = null;

/** WGS84 ellipsoid, metres. */
const A = 6378137.0;
const F = 1 / 298.257223563;
const B = A * (1 - F);
/** Geomagnetic reference radius, metres (NOAA WMM constant). */
const RE = 6371200.0;

/**
 * Parse a NOAA WMM.COF text file into the coefficient structure.
 *
 * Format: a header line carrying the epoch and model name, then one line per
 * (n, m) with `n m g h dg dh`, terminated by a line of nines.
 */
export function parseCof(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('WMM coefficient file is empty');

  const header = lines[0].split(/\s+/);
  const epoch = Number(header[0]);
  if (!Number.isFinite(epoch)) throw new Error(`WMM header does not start with an epoch: ${lines[0]}`);

  const g = [];
  const h = [];
  const dg = [];
  const dh = [];
  let nMax = 0;

  for (const line of lines.slice(1)) {
    if (line.startsWith('9999')) break;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length < 6 || !parts.every(Number.isFinite)) continue;
    const [n, m, gnm, hnm, dgnm, dhnm] = parts;
    nMax = Math.max(nMax, n);
    (g[n] ??= [])[m] = gnm;
    (h[n] ??= [])[m] = hnm;
    (dg[n] ??= [])[m] = dgnm;
    (dh[n] ??= [])[m] = dhnm;
  }
  if (nMax < 1) throw new Error('WMM coefficient file carried no usable coefficients');
  return { epoch, nMax, g, h, dg, dh, name: header.slice(1).join(' ') || 'WMM' };
}

/** Decimal year, which is what the model's secular variation is expressed in. */
export function decimalYear(date) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

/**
 * Evaluate the model. Returns declination in degrees east of true north, plus
 * the field components, or null if any input is unusable.
 *
 * `heightM` is height above the WGS84 ellipsoid. Passing MSL altitude instead
 * changes the answer by far less than a tenth of a degree at light-aircraft
 * altitudes, but the parameter is named for what it is so nobody has to guess.
 */
export function magneticField(model, { latDeg, lonDeg, heightM = 0, date = new Date() }) {
  if (!model) return null;
  if (![latDeg, lonDeg, heightM].every(Number.isFinite)) return null;
  if (Math.abs(latDeg) > 90) return null;

  const t = decimalYear(date) - model.epoch;
  const lat = degToRad(latDeg);
  const lon = degToRad(lonDeg);

  // Geodetic -> geocentric (spherical) coordinates.
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const rc = A / Math.sqrt(1 - (1 - (B * B) / (A * A)) * sinLat * sinLat);
  const p = (rc + heightM) * cosLat;
  const z = (rc * ((B * B) / (A * A)) + heightM) * sinLat;
  const r = Math.hypot(p, z);
  const sinPhi = z / r; // geocentric latitude
  const cosPhi = p / r;

  const nMax = model.nMax;

  // Schmidt semi-normalised associated Legendre functions and their
  // derivatives, by the standard recurrence. Computed in the geocentric
  // colatitude, not the geodetic latitude — mixing those is the classic way to
  // be wrong by a fraction of a degree everywhere and much more near the poles.
  const P = Array.from({ length: nMax + 2 }, () => new Float64Array(nMax + 2));
  const dP = Array.from({ length: nMax + 2 }, () => new Float64Array(nMax + 2));
  P[0][0] = 1;
  dP[0][0] = 0;

  for (let n = 1; n <= nMax; n += 1) {
    for (let m = 0; m <= n; m += 1) {
      if (n === m) {
        P[n][m] = cosPhi * P[n - 1][m - 1];
        dP[n][m] = cosPhi * dP[n - 1][m - 1] + sinPhi * P[n - 1][m - 1];
      } else if (n === 1 && m === 0) {
        P[n][m] = sinPhi * P[n - 1][m];
        dP[n][m] = sinPhi * dP[n - 1][m] - cosPhi * P[n - 1][m];
      } else {
        const k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
        P[n][m] = sinPhi * P[n - 1][m] - k * P[n - 2][m];
        dP[n][m] = sinPhi * dP[n - 1][m] - cosPhi * P[n - 1][m] - k * dP[n - 2][m];
      }
    }
  }

  // Schmidt normalisation factors.
  const schmidt = Array.from({ length: nMax + 1 }, () => new Float64Array(nMax + 1));
  for (let n = 0; n <= nMax; n += 1) {
    schmidt[n][0] = 1;
    for (let m = 1; m <= n; m += 1) {
      schmidt[n][m] = schmidt[n][m - 1] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
  }

  let X = 0;
  let Y = 0;
  let Z = 0;
  const ratio = RE / r;
  let rPow = ratio * ratio; // (a/r)^(n+2) with n starting at 1

  for (let n = 1; n <= nMax; n += 1) {
    rPow *= ratio;
    for (let m = 0; m <= n; m += 1) {
      const gnm = (model.g[n]?.[m] ?? 0) + t * (model.dg[n]?.[m] ?? 0);
      const hnm = (model.h[n]?.[m] ?? 0) + t * (model.dh[n]?.[m] ?? 0);
      const cosMl = Math.cos(m * lon);
      const sinMl = Math.sin(m * lon);
      const norm = schmidt[n][m];
      const Pnm = norm * P[n][m];
      const dPnm = norm * dP[n][m];

      // X IS THE NORTHWARD COMPONENT, AND theta-hat POINTS SOUTH.
      //
      // B = -grad V, so B_theta = -(1/r) dV/dtheta — but colatitude increases
      // southward, so the NORTHWARD component is X = -B_theta = +(1/r) dV/dtheta,
      // which is a PLUS here. It was a minus, and since Y and Z were both
      // right that put the horizontal field exactly 180 degrees out: a pure
      // axial dipole reported a declination of 180 at every point on earth.
      // Nothing about the number looked wrong — it was finite, stable, and
      // varied sensibly with position.
      X += rPow * (gnm * cosMl + hnm * sinMl) * dPnm;
      Y += rPow * m * (gnm * sinMl - hnm * cosMl) * (Pnm / (cosPhi === 0 ? 1e-10 : cosPhi));
      Z -= rPow * (n + 1) * (gnm * cosMl + hnm * sinMl) * Pnm;
    }
  }

  // Rotate the geocentric components back into the geodetic frame.
  const psi = lat - Math.asin(Math.max(-1, Math.min(1, sinPhi)));
  const Xg = X * Math.cos(psi) - Z * Math.sin(psi);
  const Zg = X * Math.sin(psi) + Z * Math.cos(psi);

  return {
    declinationDeg: radToDeg(Math.atan2(Y, Xg)),
    inclinationDeg: radToDeg(Math.atan2(Zg, Math.hypot(Xg, Y))),
    intensityNt: Math.hypot(Xg, Y, Zg),
    model: model.name,
    epoch: model.epoch,
  };
}

/**
 * Load the coefficient file. Returns { model } or { error } — never a model
 * built from anything but the file's own numbers.
 */
export async function loadModel(fetchImpl = fetch) {
  const status = await bundleStatus('wmm', fetchImpl);
  if (!status.present) return { error: status.reason ?? 'no WMM coefficients bundled', detail: status.detail ?? null };
  try {
    const res = await fetchImpl(status.path ?? COF_URL, { cache: 'force-cache' });
    if (!res.ok) {
      return { error: `the data manifest says WMM coefficients are present but ${status.path ?? COF_URL} returned HTTP ${res.status}` };
    }
    const body = await res.json();
    const model = parseCof(body.cof ?? '');
    return { model };
  } catch (err) {
    return { error: `no WMM coefficients bundled — declination unavailable (${err.message})` };
  }
}
