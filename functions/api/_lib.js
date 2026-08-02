/**
 * _lib.js — shared helpers for the Pages Functions. The leading underscore
 * keeps Cloudflare from routing it as an endpoint.
 *
 * These functions exist so the three endpoints cannot drift apart on the two
 * things that must never drift: how we identify ourselves to a service we do
 * not pay for (Doctrine §15.2), and how we behave when one tells us to slow
 * down (§15.3 — a 429 is an instruction, not an obstacle).
 */

export const VERSION = '0.1.0';
export const USER_AGENT = `fauxplane/${VERSION} (+https://github.com/njefferson/fauxplane)`;

/**
 * Every upstream declares the policy it operates under, right here, so a later
 * session can compare our pacing against the published terms without going
 * looking. Doctrine §15.1: the published policy is the authority, our inference
 * from observed behaviour is not.
 */
export const POLICIES = {
  metar: {
    source: 'NOAA Aviation Weather Center',
    policyUrl: 'https://aviationweather.gov/data/api/',
    cacheSeconds: 60,
    identifies: true,
    honoursRetryAfter: true,
  },
  winds: {
    source: 'Open-Meteo',
    policyUrl: 'https://open-meteo.com/en/terms',
    cacheSeconds: 900,
    identifies: true,
    honoursRetryAfter: true,
  },
  /**
   * adsb.fi open data. Terms read in full from the publisher's own repository
   * (github.com/adsbfi/opendata) on 2026-08-02, which is the authority
   * Doctrine §15.1 asks for — not an inference from a sibling project:
   *
   *   "adsb.fi open data is for personal, non-commercial use only. You may not
   *    license, sell, rent, or lease any part of the data or the service ...
   *    You must cite adsb.fi and include a link to our home page."
   *
   * Personal and non-commercial matches this app's own PolyForm Noncommercial
   * licence exactly. The citation requirement is a REQUIREMENT, not a courtesy,
   * and it is discharged on the radar page itself — see `attribution` below,
   * which the client renders rather than deciding for itself.
   *
   * The published rate limit is ONE REQUEST PER SECOND, and invalid requests
   * (400/401/403/404/429) count against it. Two things follow, and both are
   * implemented: every parameter is validated HERE before anything is sent, and
   * the edge cache is what the panel's refresh rate actually hits.
   */
  traffic: {
    source: 'adsb.fi',
    policyUrl: 'https://github.com/adsbfi/opendata',
    homeUrl: 'https://adsb.fi',
    attribution: 'Aircraft data from adsb.fi',
    // Comfortably inside 1 req/s even with several colos each holding their own
    // copy, and still fresher than the panel can usefully redraw a plan view.
    cacheSeconds: 8,
    callsignCacheSeconds: 5,
    identifies: true,
    honoursRetryAfter: true,
  },
};

/** A JSON response with the caching and provenance headers the client reads. */
export function json(body, { status = 200, cacheSeconds = 0, stale = false, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
      // The client uses this to decide LIVE vs STALE. It is set by the code
      // that KNOWS whether the payload came from upstream or from a held copy,
      // never guessed downstream.
      'x-fauxplane-stale': stale ? '1' : '0',
      'access-control-allow-origin': 'same-origin',
      ...headers,
    },
  });
}

/** A refusal that explains itself, in the shape the client's error path reads. */
export function problem(reason, { status = 502, cacheSeconds = 0 } = {}) {
  return json({ ok: false, reason }, { status, cacheSeconds });
}

/**
 * Fetch upstream with our identity attached, honouring Retry-After exactly.
 *
 * NEVER retries harder than the service asked for, never widens concurrency,
 * never hops to a mirror to evade a 429. One retry, only when the service told
 * us how long to wait and the wait is short enough to be worth holding a
 * request open for.
 */
export async function politeFetch(url, { headers = {}, maxWaitMs = 3000, ...init } = {}) {
  const send = () =>
    fetch(url, {
      ...init,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers },
    });

  let res = await send();
  if (res.status === 429 || res.status === 503) {
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter * 1000 <= maxWaitMs) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      res = await send();
    }
  }
  return res;
}

/** Parse and validate a `lat,lon,lat,lon` bbox parameter. */
export function parseBbox(raw, { maxSpanDeg = 12 } = {}) {
  if (!raw) return { error: 'bbox is required' };
  const parts = String(raw).split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) {
    return { error: 'bbox must be four numbers: latMin,lonMin,latMax,lonMax' };
  }
  const [latMin, lonMin, latMax, lonMax] = parts;
  if (latMin >= latMax || lonMin >= lonMax) return { error: 'bbox min must be less than max' };
  if (Math.abs(latMin) > 90 || Math.abs(latMax) > 90) return { error: 'bbox latitude out of range' };
  if (Math.abs(lonMin) > 180 || Math.abs(lonMax) > 180) return { error: 'bbox longitude out of range' };
  // A client asking for half a continent is either broken or is using us to
  // bulk-sweep somebody else's service (Doctrine §15.5). Refuse rather than
  // relay it.
  if (latMax - latMin > maxSpanDeg || lonMax - lonMin > maxSpanDeg) {
    return { error: `bbox is larger than ${maxSpanDeg} degrees on a side` };
  }
  return { bbox: { latMin, lonMin, latMax, lonMax } };
}

/**
 * Read-through cache on the Cloudflare edge cache.
 *
 * "Never ask twice for what we already have" (Doctrine §15.4) is the reason
 * this exists, and it is worth being precise about what it buys: without it,
 * usage of somebody else's free service scales with how many people open the
 * app, which is exactly the shape §15.6 forbids.
 */
export async function cached(request, key, ttlSeconds, produce) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(key, request.url).toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const fresh = await produce();
  if (fresh.ok && ttlSeconds > 0) {
    const toStore = fresh.clone();
    // The edge decides expiry from the response's own Cache-Control, which the
    // json() helper set from the policy above.
    await cache.put(cacheKey, toStore);
  }
  return fresh;
}
