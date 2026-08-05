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
  /**
   * PIREPs, SIGMETs/AIRMETs and TAFs — the SAME publisher and the SAME API as
   * `metar` above, so this is not a new licensing question: a US Government
   * work, terms already read. It is a separate entry only because the pacing
   * differs, and pacing is what these declarations are for.
   */
  wxtext: {
    source: 'NOAA Aviation Weather Center',
    policyUrl: 'https://aviationweather.gov/data/api/',
    // Per KIND, in wxtext.js — a forecast and a pilot report are not worth
    // holding for the same length of time. This is the shortest of the three.
    cacheSeconds: 300,
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
    // The DEFAULT source, and the one credited before anything has answered.
    // The live answer names whichever provider actually served it — see
    // TRAFFIC_PROVIDERS.
    source: 'adsb.lol',
    policyUrl: 'https://www.adsb.lol/docs/open-data/api/',
    homeUrl: 'https://adsb.lol',
    attribution: 'Aircraft data from adsb.lol (ODbL)',
    /**
     * THE TTL MUST EXCEED THE CLIENT'S POLL INTERVAL OR THE CACHE DOES NOTHING.
     *
     * These were 8 s and 5 s against polls of 10 s and 5 s. Every entry expired
     * a moment BEFORE the poll that would have used it, so essentially every
     * request went upstream and the cache was decorative — while the comments
     * here and in app.js both claimed the refresh rate "lands on Cloudflare
     * rather than on adsb.fi". One iPad following an aircraft on the radar page
     * was asking a volunteer network eighteen times a minute.
     *
     * Now each TTL is twice its poll interval, so at most every other poll can
     * reach upstream: six requests a minute in the same situation, and usually
     * fewer. `traffic-pacing.test.mjs` fails the build if the relationship is
     * ever inverted again, because prose did not stop it the first time.
     */
    cacheSeconds: 30,
    callsignCacheSeconds: 20,
    identifies: true,
    honoursRetryAfter: true,
  },

  /**
   * THE PLAUSIBLE ROUTE for a followed flight (adsb.lol, ODbL).
   *
   * CACHED FAR HARDER THAN THE TRAFFIC FEED, and the reason is the data rather
   * than the etiquette: a position changes every second and a route does not
   * change at all during a flight. Ten minutes means one follow costs one
   * upstream request instead of one every ten seconds — and the whole feature
   * is therefore close to free for a service that asks us to be careful.
   */
  route: {
    source: 'adsb.lol',
    policyUrl: 'https://api.adsb.lol/docs',
    licence: 'ODbL',
    cacheSeconds: 600,
    identifies: true,
    honoursRetryAfter: true,
  },
};

/**
 * WHERE LIVE TRAFFIC COMES FROM, IN ORDER, and why there is more than one.
 *
 * adsb.fi answered every request with HTTP 403 from a Cloudflare block page —
 * their EDGE refusing a Pages Function before their API ever saw it. The
 * endpoint was correct and the request well-formed; we were simply not welcome
 * from that origin. Nothing about that is fixable from this side without
 * disguising the client to slip past a rule the operator deliberately set, and
 * this app does not do that to a service whose data it is asking for.
 *
 * So the source became a LIST. Both publish an ADSBexchange-v2-compatible shape
 * — adsb.lol describe theirs as "a drop-in replacement" — so one parser reads
 * either, and the panel credits whichever actually answered rather than
 * whichever we hoped would.
 *
 * NEITHER HAS EVER BEEN REACHED FROM THIS SANDBOX. Its proxy refuses CONNECT to
 * both, so the paths below are the publishers' documented ones and the field
 * mapping is from their published schema. The first device to open RADAR is the
 * real test, and the failure text now names the provider, the CDN and the code.
 *
 * Terms, both of which are conditions and not courtesies:
 *   adsb.lol — data under ODbL 1.0, no key at present, dynamic rate limit.
 *   adsb.fi  — personal and non-commercial, citation with a link required,
 *              1 request per second.
 */
export const TRAFFIC_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'adsb.lol',
    base: 'https://api.adsb.lol',
    homeUrl: 'https://adsb.lol',
    attribution: 'Aircraft data from adsb.lol (ODbL)',
    policyUrl: 'https://www.adsb.lol/docs/open-data/api/',
    area: (lat, lon, dist) => `/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
    callsign: (cs) => `/v2/callsign/${cs}`,
    hex: (h) => `/v2/hex/${h}`,
  }),
  Object.freeze({
    id: 'adsb.fi',
    base: 'https://opendata.adsb.fi/api',
    homeUrl: 'https://adsb.fi',
    attribution: 'Aircraft data from adsb.fi',
    policyUrl: 'https://github.com/adsbfi/opendata',
    area: (lat, lon, dist) => `/v3/lat/${lat}/lon/${lon}/dist/${dist}`,
    callsign: (cs) => `/v2/callsign/${cs}`,
    hex: (h) => `/v2/hex/${h}`,
  }),
]);

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

/* ------------------------------------------------------- provider cooldown */

/**
 * A PROVIDER THAT HAS JUST REFUSED IS NOT ASKED AGAIN FOR A WHILE.
 *
 * adsb.fi's own terms, read 2026-08-03 from the page the owner sent:
 *
 *   "Making excessive invalid HTTP requests results in a temporary IP address
 *    restriction. Requests returning a 400, 401, 403, 404, or 429 status code
 *    count toward the limit."
 *
 * Every one of our adsb.fi attempts returns 403 — their Cloudflare edge blocks
 * a Pages Function before their API ever sees it. So the failover was spending
 * a strike against an abuse threshold on EVERY request, for a call that cannot
 * possibly succeed, on an egress address shared with every other Cloudflare
 * tenant. Retrying a refusal we can predict is not persistence, it is exactly
 * the "excessive invalid requests" the sentence describes.
 *
 * The marker lives in the edge cache rather than in a variable, because a
 * Worker isolate is short-lived and a per-isolate memo would forget between
 * requests — which is the same as not having one.
 *
 * IT EXPIRES ON ITS OWN. Nothing here can make the panel permanently blind: the
 * cache entry ages out, and the reason travels with it so the gauge can say why
 * a source was skipped rather than merely that it failed.
 */
const COOLDOWN_MAX_S = 900;

const cooldownKey = (request, id) => new Request(new URL(`/__cooldown/${encodeURIComponent(id)}`, request.url).toString());

/**
 * How long to stand off, by what the provider actually said.
 *
 * A 403 from a firewall is STRUCTURAL — it is a decision about who we are, and
 * it will not have changed in thirty seconds. A 429 is a rate limit and carries
 * its own instruction (Doctrine §15.3), so the service's own number wins over
 * any guess of ours.
 */
export function cooldownSeconds(status, retryAfterS = null) {
  if (Number.isFinite(retryAfterS) && retryAfterS > 0) return Math.min(retryAfterS, COOLDOWN_MAX_S);
  if (status === 403) return 600;
  if (status === 429) return 60;
  return 0;
}

export async function noteRefusal(request, id, seconds, reason, cache = caches.default) {
  if (!(seconds > 0)) return false;
  const ttl = Math.min(Math.round(seconds), COOLDOWN_MAX_S);
  await cache.put(
    cooldownKey(request, id),
    /**
     * `until` IS AN ABSOLUTE EXPIRY, and it is what makes a COUNTDOWN possible.
     *
     * `seconds` is the length of the stand-off as recorded — it never shrinks,
     * so a panel reading it says "standing off for up to 600s" nine minutes
     * into a ten-minute wait.
     *
     * Storing when it ENDS lets `inCooldown` return what is actually left, and
     * a number that ticks down is the difference between a panel that is
     * waiting and a panel that is broken.
     */
    new Response(JSON.stringify({ id, reason, seconds: ttl, until: Date.now() + ttl * 1000 }), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
    }),
  );
  return true;
}

/** The standing refusal for a provider, or null if it may be asked again. */
/**
 * How much longer we are not asking, in words — or the honest admission that we
 * do not know.
 *
 * "up to 600s" was true and useless: it is the length of the stand-off, not
 * what remains, so it read the same nine minutes in as it did at the start.
 * A record written before `until` existed genuinely cannot say, and says that
 * rather than guessing zero — zero means "ask now", which would be an
 * instruction rather than a gap in knowledge.
 */
export function standoffPhrase(cool) {
  const r = cool?.remainingS;
  if (!Number.isFinite(r)) return 'standing off (no expiry recorded)';
  if (r <= 0) return 'the stand-off has just expired';
  if (r < 60) return `not asking again for ${r}s`;
  const m = Math.floor(r / 60);
  const rem = r % 60;
  return `not asking again for ${m}m${rem ? ` ${rem}s` : ''}`;
}

export async function inCooldown(request, id, cache = caches.default) {
  const hit = await cache.match(cooldownKey(request, id));
  if (!hit) return null;
  try {
    const rec = await hit.json();
    // WHAT IS LEFT, not what was recorded. Null when the record predates
    // `until` — an unknown remaining time must read as unknown rather than as
    // zero, because zero means "ask now" and would be a wrong instruction.
    const remainingS = Number.isFinite(rec?.until)
      ? Math.max(0, Math.ceil((rec.until - Date.now()) / 1000))
      : null;
    return { ...rec, remainingS };
  } catch {
    return { id, reason: 'refused recently', seconds: null, remainingS: null };
  }
}
