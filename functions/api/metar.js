/**
 * /api/metar — proxy for the NOAA Aviation Weather Center METAR feed.
 *
 *   Source : https://aviationweather.gov/api/data/metar?format=json&bbox=...
 *   Key    : none required
 *   Cache  : 60 s (POLICIES.metar)
 *   Terms  : https://aviationweather.gov/data/api/ — a US Government work.
 *
 * The client never calls aviationweather.gov directly. That is not only about
 * CORS: routing every request through here is what makes the cache shared, so
 * our load on a public service does not scale with how many people open the
 * app (Doctrine §15.6).
 *
 * STATION SELECTION HAPPENS ON THE CLIENT, deliberately. This endpoint returns
 * every station in the box with its distance-relevant fields intact; picking
 * the nearest one with a valid altimeter setting needs the device's current
 * position, and the device's position is not something to send to a server for
 * an app whose privacy posture is "nothing leaves the device" (Doctrine §9).
 * The bbox is coarse enough to be uninformative; a GPS fix is not.
 */

import { POLICIES, cached, json, parseBbox, politeFetch, problem } from './_lib.js';

const UPSTREAM = 'https://aviationweather.gov/api/data/metar';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const { bbox, error } = parseBbox(url.searchParams.get('bbox'));
  if (error) return problem(error, { status: 400 });

  const key = `/api/metar?bbox=${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`;

  return cached(request, key, POLICIES.metar.cacheSeconds, async () => {
    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set('format', 'json');
    // The AWC parameter order is latMin,lonMin,latMax,lonMax.
    upstream.searchParams.set('bbox', `${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`);

    let res;
    try {
      res = await politeFetch(upstream.toString());
    } catch (err) {
      return problem(`aviationweather.gov unreachable: ${err.message}`);
    }
    if (!res.ok) return problem(`aviationweather.gov returned HTTP ${res.status}`, { status: 502 });

    let raw;
    try {
      raw = await res.json();
    } catch (err) {
      // A 200 carrying something that is not JSON is a question, not an answer
      // (LESSONS: a success response carrying nothing is a failed probe).
      return problem(`aviationweather.gov returned a non-JSON body: ${err.message}`);
    }
    if (!Array.isArray(raw)) return problem('aviationweather.gov returned an unexpected shape (expected an array)');

    // Normalise to exactly what the panel needs, and nothing more. Fields the
    // upstream omits stay NULL — never zero, never a stand-in. An altimeter of
    // 0 inHg and an unreported altimeter are different facts.
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const stations = raw
      .map((m) => ({
        id: typeof m.icaoId === 'string' ? m.icaoId : null,
        name: typeof m.name === 'string' ? m.name : null,
        lat: num(m.lat),
        lon: num(m.lon),
        elevationM: num(m.elev),
        // AWC reports altim in hPa in the JSON feed.
        altimeterHpa: num(m.altim),
        tempC: num(m.temp),
        dewpointC: num(m.dewp),
        windDirDeg: typeof m.wdir === 'number' ? m.wdir : null,
        windSpeedKt: num(m.wspd),
        windGustKt: num(m.wgst),
        visibilitySm: num(m.visib),
        observedAt: typeof m.reportTime === 'string' ? m.reportTime : null,
        raw: typeof m.rawOb === 'string' ? m.rawOb : null,
      }))
      .filter((s) => s.id && s.lat !== null && s.lon !== null);

    return json(
      {
        ok: true,
        source: POLICIES.metar.source,
        sourceUrl: POLICIES.metar.policyUrl,
        bbox,
        fetchedAt: new Date().toISOString(),
        count: stations.length,
        stations,
      },
      { cacheSeconds: POLICIES.metar.cacheSeconds },
    );
  });
}
