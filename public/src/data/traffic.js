/**
 * traffic.js — client for /api/traffic.
 *
 * NO PANEL CONSUMES THIS IN v1, and nothing here writes to the state store.
 * The traffic display is v2, gated behind the attitude stability test (fusion
 * holds attitude within 2 degrees over a 60 s static test). The spec allows the
 * endpoint to be built and tested in v1; this is the client half of that, and
 * BITE uses it only to report whether the traffic service is reachable and
 * configured.
 *
 * It writes no state field on purpose. That is the structural way of saying
 * "not an instrument source in v1" — a later session cannot accidentally wire a
 * gauge to it without first adding the field, which is exactly the moment to
 * remember the gate.
 */

import { REGION } from '../core/region.js';
import { bboxAround } from '../core/units.js';

/**
 * The query box: derived from the current fix at a 40 nm half-width once one
 * exists, and the settled cold-start box until then. After the first fix the
 * default is never used again — which is the point of returning `fromFix` so
 * the caller can say which one it is looking at.
 */
export function trafficBbox(fields) {
  const lat = fields?.['position.lat'];
  const lon = fields?.['position.lon'];
  if (lat && lon && lat.provenance !== 'FAIL' && lon.provenance !== 'FAIL') {
    const box = bboxAround({ lat: lat.value, lon: lon.value }, REGION.trafficHalfWidthNm);
    if (box) {
      return {
        fromFix: true,
        lamin: box.latMin,
        lomin: box.lonMin,
        lamax: box.latMax,
        lomax: box.lonMax,
      };
    }
  }
  return { fromFix: false, ...REGION.trafficColdStart };
}

export async function fetchTraffic(fields, fetchImpl = fetch) {
  const box = trafficBbox(fields);
  const q = new URLSearchParams({
    lamin: box.lamin.toFixed(4),
    lomin: box.lomin.toFixed(4),
    lamax: box.lamax.toFixed(4),
    lomax: box.lomax.toFixed(4),
  });
  try {
    const res = await fetchImpl(`/api/traffic?${q}`, { cache: 'no-store' });
    const stale = res.headers.get('x-fauxplane-stale') === '1';
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.reason) detail = body.reason;
      } catch {
        /* status alone is still an answer */
      }
      return { ok: false, reason: detail, box, stale };
    }
    const body = await res.json();
    return { ok: true, count: body.count ?? 0, upstreamTime: body.upstreamTime ?? null, box, stale: stale || !!body.held };
  } catch (err) {
    return { ok: false, reason: `traffic fetch failed: ${err.message}`, box, stale: false };
  }
}
