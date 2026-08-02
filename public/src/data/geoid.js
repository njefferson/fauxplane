/**
 * geoid.js — geoid separation, the term that turns a GPS height into an
 * altitude above mean sea level.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS RETURNS FAIL, AND WHY THAT IS THE CORRECT v1 BEHAVIOUR
 *
 * GPS reports height above the WGS84 ELLIPSOID, a smooth mathematical shape.
 * Altimeters, charts, terrain and every other altitude a pilot uses are
 * referenced to MEAN SEA LEVEL, which follows the geoid — and the two differ by
 * about -100 ft in this region.
 *
 * Worse, the platforms disagree about which one they hand you: iOS CoreLocation
 * applies the correction internally, Android's Location does not. So there is
 * no safe assumption available, only a real model or an admission.
 *
 * A model needs real EGM96/EGM2008 grid values. This session could not fetch
 * them (the egress proxy denies the hosts, and Doctrine §15 says do not route
 * around it), and typing approximate ones from memory would produce an altitude
 * that is wrong by tens of feet and looks entirely correct — the precise defect
 * v1 exists to forbid.
 *
 * So: no grid, no separation, FAIL with the reason, and the altitude tape shows
 * GPS GEOMETRIC altitude instead, labelled as what it is. Drop a real
 * `public/data/geoid-norcal.json` in and indicated altitude, pressure altitude,
 * TAS and CAS all light up with no other change.
 *
 * Expected file shape (a regular grid over the navdata region, metres, geoid
 * height above the WGS84 ellipsoid — negative here):
 *   { "latMin":37, "latMax":40.4, "lonMin":-123.2, "lonMax":-118.8,
 *     "latStep":0.25, "lonStep":0.25, "source":"EGM96", "values":[[...],[...]] }
 * ---------------------------------------------------------------------------
 */

import { bundleStatus } from './manifest.js';
import { mToFt } from '../core/units.js';

export const GEOID_URL = '/data/geoid-norcal.json';

/** Bilinear sample of the grid. Refuses outside its own bounds rather than
 *  clamping to an edge value that is no longer about where you are. */
export function sampleGrid(grid, lat, lon) {
  if (!grid || !Array.isArray(grid.values)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < grid.latMin || lat > grid.latMax || lon < grid.lonMin || lon > grid.lonMax) return null;

  const fy = (lat - grid.latMin) / grid.latStep;
  const fx = (lon - grid.lonMin) / grid.lonStep;
  const y0 = Math.floor(fy);
  const x0 = Math.floor(fx);
  const y1 = Math.min(y0 + 1, grid.values.length - 1);
  const row0 = grid.values[y0];
  const row1 = grid.values[y1];
  if (!row0 || !row1) return null;
  const x1 = Math.min(x0 + 1, row0.length - 1);

  const ty = fy - y0;
  const tx = fx - x0;
  const v00 = row0[x0];
  const v01 = row0[x1];
  const v10 = row1[x0];
  const v11 = row1[x1];
  if (![v00, v01, v10, v11].every(Number.isFinite)) return null;

  const top = v00 + (v01 - v00) * tx;
  const bottom = v10 + (v11 - v10) * tx;
  return top + (bottom - top) * ty;
}

export function createGeoidSource({ state, fetchImpl = fetch, clock = () => Date.now() }) {
  let grid = null;
  let reason = 'not loaded yet';
  let detail = null;

  return {
    get available() {
      return grid !== null;
    },
    get reason() {
      return grid ? null : reason;
    },
    /** The long explanation. Instrument flags show `reason`; BITE has room for
     *  this, and a gauge does not. */
    get detail() {
      return grid ? null : detail;
    },

    async load() {
      // The manifest is asked first, so a deliberately-absent bundle is
      // answered from a committed reason instead of from a 404.
      const status = await bundleStatus('geoid', fetchImpl);
      if (!status.present) {
        reason = status.reason ?? 'no geoid model bundled';
        detail = status.detail ?? null;
        state.fail('altitude.geoidSeparation', reason);
        return false;
      }
      try {
        const res = await fetchImpl(status.path ?? GEOID_URL, { cache: 'force-cache' });
        if (!res.ok) {
          reason = `the data manifest says the geoid model is present but ${status.path ?? GEOID_URL} returned HTTP ${res.status}`;
          state.fail('altitude.geoidSeparation', reason);
          return false;
        }
        const body = await res.json();
        if (!Array.isArray(body?.values) || !Number.isFinite(body?.latStep)) {
          reason = 'geoid model is present but malformed';
          state.fail('altitude.geoidSeparation', reason);
          return false;
        }
        grid = body;
        reason = null;
        return true;
      } catch (err) {
        reason = `no geoid model bundled — GPS altitude is shown as GEOMETRIC, uncorrected (${err.message})`;
        state.fail('altitude.geoidSeparation', reason);
        return false;
      }
    },

    /** Write the separation for the current position, or the reason there is none. */
    apply(fields) {
      if (!grid) {
        state.fail('altitude.geoidSeparation', reason ?? 'no geoid model bundled');
        return;
      }
      const lat = fields['position.lat'];
      const lon = fields['position.lon'];
      if (!lat || !lon || lat.provenance === 'FAIL' || lon.provenance === 'FAIL') {
        state.fail('altitude.geoidSeparation', 'no position fix — geoid separation is position-dependent');
        return;
      }
      const metres = sampleGrid(grid, lat.value, lon.value);
      if (metres === null) {
        state.fail('altitude.geoidSeparation', 'position is outside the bundled geoid grid');
        return;
      }
      state.write('altitude.geoidSeparation', mToFt(metres), { at: clock() });
    },
  };
}
