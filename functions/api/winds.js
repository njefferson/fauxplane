/**
 * /api/winds — Open-Meteo pressure-level winds and temperature.
 *
 *   Source : https://api.open-meteo.com/v1/forecast
 *   Key    : none required
 *   Cache  : 15 min (POLICIES.winds)
 *   Terms  : https://open-meteo.com/en/terms — free for non-commercial use,
 *            which is exactly this app's licence posture (Doctrine §8).
 *
 * GEOPOTENTIAL HEIGHT IS FETCHED ALONGSIDE THE WIND, and it is the reason this
 * endpoint is worth having. A wind at "850 hPa" is not usable by an instrument
 * until you know what altitude 850 hPa is at TODAY, and that moves by hundreds
 * of feet with the weather. Interpolating the wind onto the aircraft's altitude
 * using a standard-atmosphere table instead would be a modelled number standing
 * in for a measured one.
 */

import { POLICIES, cached, json, politeFetch, problem } from './_lib.js';

const UPSTREAM = 'https://api.open-meteo.com/v1/forecast';

/** Levels that cover the altitudes a light aircraft actually flies. */
export const LEVELS_HPA = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500];

const VARIABLES = LEVELS_HPA.flatMap((hpa) => [
  `wind_speed_${hpa}hPa`,
  `wind_direction_${hpa}hPa`,
  `temperature_${hpa}hPa`,
  `geopotential_height_${hpa}hPa`,
]);

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return problem('lat and lon are required and must be a real position', { status: 400 });
  }

  // Round the cache key to a tenth of a degree — about six nautical miles.
  // Winds aloft do not change meaningfully across that, and it stops a moving
  // aircraft minting a new upstream request every few seconds.
  const keyLat = lat.toFixed(1);
  const keyLon = lon.toFixed(1);
  const key = `/api/winds?lat=${keyLat}&lon=${keyLon}`;

  return cached(request, key, POLICIES.winds.cacheSeconds, async () => {
    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set('latitude', keyLat);
    upstream.searchParams.set('longitude', keyLon);
    upstream.searchParams.set('hourly', VARIABLES.join(','));
    upstream.searchParams.set('forecast_days', '1');
    upstream.searchParams.set('wind_speed_unit', 'kn');
    upstream.searchParams.set('timeformat', 'unixtime');

    let res;
    try {
      res = await politeFetch(upstream.toString());
    } catch (err) {
      return problem(`open-meteo unreachable: ${err.message}`);
    }
    if (!res.ok) return problem(`open-meteo returned HTTP ${res.status}`, { status: 502 });

    let body;
    try {
      body = await res.json();
    } catch (err) {
      return problem(`open-meteo returned a non-JSON body: ${err.message}`);
    }
    const hourly = body?.hourly;
    if (!hourly || !Array.isArray(hourly.time)) return problem('open-meteo returned no hourly block');

    // Pick the hour nearest to now rather than the first in the array. The
    // series starts at midnight local, so index 0 is the small hours and using
    // it would report last night's wind all day.
    const nowSec = Date.now() / 1000;
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < hourly.time.length; i += 1) {
      const d = Math.abs(hourly.time[i] - nowSec);
      if (d < best) {
        best = d;
        idx = i;
      }
    }

    const at = (name) => {
      const series = hourly[name];
      if (!Array.isArray(series)) return null;
      const v = series[idx];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };

    const levels = LEVELS_HPA.map((hpa) => ({
      pressureHpa: hpa,
      geopotentialHeightM: at(`geopotential_height_${hpa}hPa`),
      windSpeedKt: at(`wind_speed_${hpa}hPa`),
      windDirDeg: at(`wind_direction_${hpa}hPa`),
      temperatureC: at(`temperature_${hpa}hPa`),
      // A level whose height is unknown cannot be placed against an altitude,
      // so it is marked unusable HERE rather than being silently skipped by
      // whatever interpolates downstream.
    })).filter((l) => l.geopotentialHeightM !== null);

    if (!levels.length) return problem('open-meteo returned no usable pressure levels');

    return json(
      {
        ok: true,
        source: POLICIES.winds.source,
        sourceUrl: POLICIES.winds.policyUrl,
        position: { lat: Number(keyLat), lon: Number(keyLon) },
        validAt: new Date(hourly.time[idx] * 1000).toISOString(),
        fetchedAt: new Date().toISOString(),
        levels,
      },
      { cacheSeconds: POLICIES.winds.cacheSeconds },
    );
  });
}
