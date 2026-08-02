/**
 * metar.js — surface observation, and the station-selection rule.
 *
 * THE RULE, settled by Noah (NOTES.md) and implemented exactly:
 *   - No hardcoded station identifier, ever.
 *   - Query the box, then choose the NEAREST station REPORTING A VALID
 *     ALTIMETER SETTING, by great-circle distance from the current position —
 *     or from the home reference before the first fix.
 *   - Show the chosen station and its distance, so the source is always visible.
 *   - If no station in the box reports an altimeter setting, the Kollsman
 *     window falls back to 29.92 and the altitude tape is flagged with the
 *     reason.
 *
 * "Nearest station" and "nearest station that can actually answer the question"
 * are different sorts, and the second is the one that matters: a station three
 * miles away reporting no altimeter is useless to an altimeter page, and
 * picking it because it is closest is how a panel ends up showing a blank
 * Kollsman beside a confident station ID.
 */

import { REGION, metarBboxParam } from '../core/region.js';
import { greatCircleNm, hPaToInHg } from '../core/units.js';

export const FALLBACK_ALTIMETER_INHG = 29.92;

const METAR_FIELDS = [
  'metar.station',
  'metar.distanceNm',
  'metar.altimeter',
  'metar.temp',
  'metar.dewpoint',
  'metar.wind',
  'metar.raw',
  'metar.observedAt',
];

/**
 * Choose the station. Pure, so the rule can be tested without a network.
 *
 * Returns { station, distanceNm, altimeterInHg } or { reason } explaining why
 * nothing was chosen — and the reason is what the ATIS page prints.
 */
export function selectStation(stations, from) {
  if (!Array.isArray(stations) || stations.length === 0) {
    return { reason: 'no stations returned for the query box' };
  }
  if (!from || !Number.isFinite(from.lat) || !Number.isFinite(from.lon)) {
    return { reason: 'no position to measure station distance from' };
  }

  const withAltimeter = stations.filter((s) => Number.isFinite(s.altimeterHpa) && s.altimeterHpa > 0);
  if (withAltimeter.length === 0) {
    return {
      reason: `${stations.length} station${stations.length === 1 ? '' : 's'} in the box, none reporting an altimeter setting`,
    };
  }

  let best = null;
  for (const s of withAltimeter) {
    const distanceNm = greatCircleNm(from, { lat: s.lat, lon: s.lon });
    if (distanceNm === null) continue;
    if (!best || distanceNm < best.distanceNm) best = { station: s, distanceNm };
  }
  if (!best) return { reason: 'no station in the box had a usable position' };

  return {
    station: best.station,
    distanceNm: best.distanceNm,
    altimeterInHg: hPaToInHg(best.station.altimeterHpa),
  };
}

export function createMetarSource({ state, fetchImpl = fetch, clock = () => Date.now() }) {
  let lastResult = null;
  let inFlight = null;

  /** Position to measure from: the live fix, or the home reference before one
   *  exists. The surrogate is NAMED in what the panel shows, so nobody reads a
   *  distance from Cameron Park as a distance from the aircraft. */
  const originFrom = (fields) => {
    const lat = fields['position.lat'];
    const lon = fields['position.lon'];
    if (lat && lon && lat.provenance !== 'FAIL' && lon.provenance !== 'FAIL') {
      return { lat: lat.value, lon: lon.value, isFix: true };
    }
    return { ...REGION.home, isFix: false };
  };

  const failAll = (reason) => {
    for (const p of METAR_FIELDS) state.fail(p, reason);
  };

  return {
    get last() {
      return lastResult;
    },

    async refresh(fields) {
      if (inFlight) return inFlight;
      const from = originFrom(fields ?? {});

      inFlight = (async () => {
        let res;
        try {
          res = await fetchImpl(`/api/metar?bbox=${encodeURIComponent(metarBboxParam())}`, { cache: 'no-store' });
        } catch (err) {
          // Offline is the ordinary case for this app, not an exception. The
          // fields keep their last values and age into STALE then FAIL on their
          // own; nothing here needs to blank them.
          lastResult = { ok: false, reason: `METAR fetch failed: ${err.message}` };
          return lastResult;
        }

        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.reason) detail = body.reason;
          } catch {
            /* a non-JSON error body is still an HTTP status worth reporting */
          }
          lastResult = { ok: false, reason: `METAR unavailable: ${detail}` };
          return lastResult;
        }

        let body;
        try {
          body = await res.json();
        } catch (err) {
          lastResult = { ok: false, reason: `METAR response was not JSON: ${err.message}` };
          return lastResult;
        }

        const chosen = selectStation(body.stations, from);
        if (!chosen.station) {
          failAll(chosen.reason);
          lastResult = { ok: false, reason: chosen.reason, fallbackAltimeter: FALLBACK_ALTIMETER_INHG, from };
          return lastResult;
        }

        const s = chosen.station;
        // Stamp every field with the OBSERVATION time, not the fetch time. A
        // METAR is an hour old the moment it is published; ageing it from now
        // would relabel an hour-old observation as a fresh reading, which is
        // the same lie as inventing one.
        const observed = s.observedAt ? Date.parse(s.observedAt) : NaN;
        const at = Number.isFinite(observed) ? observed : clock();

        state.write('metar.station', s.id, { at });
        state.write('metar.distanceNm', chosen.distanceNm, { at });
        state.write('metar.altimeter', chosen.altimeterInHg, { at });

        if (Number.isFinite(s.tempC)) state.write('metar.temp', s.tempC, { at });
        else state.fail('metar.temp', `${s.id} reported no temperature`);

        if (Number.isFinite(s.dewpointC)) state.write('metar.dewpoint', s.dewpointC, { at });
        else state.fail('metar.dewpoint', `${s.id} reported no dewpoint`);

        if (Number.isFinite(s.windSpeedKt)) {
          state.write(
            'metar.wind',
            { dirDeg: Number.isFinite(s.windDirDeg) ? s.windDirDeg : null, speedKt: s.windSpeedKt, gustKt: s.windGustKt ?? null },
            { at },
          );
        } else {
          state.fail('metar.wind', `${s.id} reported no wind`);
        }

        if (s.raw) state.write('metar.raw', s.raw, { at });
        else state.fail('metar.raw', `${s.id} returned no raw observation text`);

        if (s.observedAt) state.write('metar.observedAt', s.observedAt, { at });
        else state.fail('metar.observedAt', `${s.id} returned no observation time`);

        lastResult = {
          ok: true,
          stationId: s.id,
          stationName: s.name,
          distanceNm: chosen.distanceNm,
          altimeterInHg: chosen.altimeterInHg,
          from,
          candidates: body.stations.length,
          observedAt: s.observedAt ?? null,
        };
        return lastResult;
      })().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
  };
}
