/**
 * route.js — the plausible route for one aircraft, from adsb.lol.
 *
 *   Upstream: POST https://api.adsb.lol/api/0/routeset
 *   Licence : ODbL. "The license for the API as well as all data ADSB.lol
 *             makes public is ODbL" (their OpenAPI page, read 2026-08-04).
 *   Auth    : NONE today. Their terms say a key "will be required in the
 *             future" and is earned by feeding them.
 *
 * WHY THIS EXISTS. Noah, the day the airframe picker landed: "a 'flight plan'
 * page with a map and details sounds good if that's real and possible?" It is
 * real; it took until 2026-08-04 to get their terms in front of a session,
 * because this sandbox cannot reach api.adsb.lol at all.
 *
 * "PLAUSIBLE" IS THEIR WORD AND IT TRAVELS WITH THE DATA. adsb.lol infer a
 * route from the CALLSIGN — UAL328 flies a route United usually flies — which
 * is a strong guess and is not a filed flight plan. The aircraft may be on a
 * diversion, a repositioning leg, or a completely different sector with a
 * reused callsign. A panel whose entire contract is that values trace to a
 * source must not present an inference as a clearance, so the word is carried
 * in the payload rather than added by the client, exactly as the traffic
 * attribution is.
 *
 * THE REQUEST SHAPE IS A HYPOTHESIS, AND THE FUNCTION SAYS SO (Doctrine §7f).
 * The OpenAPI page names `PlaneList` and `PlaneInstance` as the schemas but the
 * capture we have of it does not expand them, and nothing here can fetch the
 * spec. So this sends the shape the tar1090 family uses and REPORTS WHAT CAME
 * BACK, including a 422's `detail`, which FastAPI fills in with the exact field
 * it rejected — `loc`, `msg` and `type` per problem.
 *
 * That is the difference between guessing and probing: a wrong guess here is
 * self-diagnosing, and the answer arrives in the diagnostics report from Noah's
 * device rather than from another round of screenshots. The same method
 * confirmed the Mode S crew readouts, which had been built from published field
 * names without a single real response ever having been seen.
 *
 * WHAT IT WILL NOT DO IS INVENT A ROUTE. If the response is not understood the
 * panel says the route is unavailable and the probe records why. There is no
 * synthetic data path here either.
 */

import { POLICIES, USER_AGENT, cached, cooldownSeconds, inCooldown, json, noteRefusal, politeFetch, problem, standoffPhrase } from './_lib.js';

export const ROUTE_SOURCE = Object.freeze({
  id: 'adsb.lol',
  url: 'https://api.adsb.lol/api/0/routeset',
  homeUrl: 'https://adsb.lol',
  attribution: 'Route data from adsb.lol (ODbL) — plausible, inferred from the callsign',
  policyUrl: 'https://api.adsb.lol/docs',
});

/**
 * Pull a route out of whatever came back, WITHOUT assuming a single shape.
 *
 * Every key this reads is tried in a couple of spellings, because the contract
 * is not confirmed and a parser that only understands one guess turns a
 * working feed into "unavailable". What it will NOT do is fabricate: if it
 * cannot find an origin and a destination it says so and hands the raw keys to
 * the probe.
 *
 * Exported and pure so the shapes can be tested without a network — which,
 * given the network is the thing this sandbox does not have, is the only way
 * any of this gets tested at all.
 */
export function parseRoute(payload, callsign) {
  const list = Array.isArray(payload) ? payload : (payload?.routes ?? payload?.planes ?? payload?.ac ?? null);
  if (!Array.isArray(list) || !list.length) return { ok: false, reason: 'the route feed returned no entries' };

  const want = String(callsign ?? '').trim().toUpperCase();
  const hit =
    list.find((r) => String(r?.callsign ?? r?.flight ?? '').trim().toUpperCase() === want) ?? list[0];
  if (!hit || typeof hit !== 'object') return { ok: false, reason: 'the route feed returned nothing readable' };

  // `_airports` is the rich form (a record per airport); `airport_codes` is the
  // terse one ("KSFO-KJFK"). Either is enough for an origin and a destination.
  const airports = Array.isArray(hit._airports) ? hit._airports : Array.isArray(hit.airports) ? hit.airports : null;
  const codes = typeof hit.airport_codes === 'string' ? hit.airport_codes.split('-').filter(Boolean) : null;

  const asPlace = (a, code) => {
    if (a && typeof a === 'object') {
      const icao = a.icao ?? a.iata ?? a.code ?? null;
      return {
        code: icao ? String(icao) : (code ?? null),
        name: a.name ? String(a.name) : null,
        // Only if the feed actually sent them. A place with no position is a
        // name, and a name is worth showing; an invented position is not.
        lat: Number.isFinite(a.lat) ? a.lat : null,
        lon: Number.isFinite(a.lon) ? a.lon : Number.isFinite(a.lng) ? a.lng : null,
      };
    }
    return code ? { code: String(code), name: null, lat: null, lon: null } : null;
  };

  const places = airports?.length
    ? airports.map((a, i) => asPlace(a, codes?.[i] ?? null)).filter(Boolean)
    : (codes ?? []).map((c) => asPlace(null, c)).filter(Boolean);

  if (places.length < 2) {
    return {
      ok: false,
      reason:
        places.length === 1
          ? 'the route feed gave one airport, which is not a route'
          : 'the route feed knows no route for this callsign',
    };
  }

  return {
    ok: true,
    origin: places[0],
    destination: places[places.length - 1],
    // Everything between, so a multi-leg route is not silently reported as a
    // direct one.
    via: places.slice(1, -1),
    /**
     * THEIR WORD, carried rather than asserted. If the feed ever starts saying
     * a route is confirmed, this will say so because it came from them.
     */
    plausible: hit.plausible !== false,
  };
}

/**
 * What actually came back, for the diagnostics report. Costs no extra request.
 *
 * IT CARRIES THE RAW BODY NOW, and the first real probe is why. adsb.lol
 * answered Noah's device with **HTTP 201** — not the 422 a wrong shape would
 * have produced, so the request was ACCEPTED — and this function could only
 * report "the reply carried no readable keys". That sentence is true and
 * useless: it cannot tell an empty body from a non-JSON body from valid JSON
 * with an unexpected shape, and those need three different fixes.
 *
 * The parsed view was built for a 422, where FastAPI's `detail` names the
 * rejected field. It had nothing to say about success. So the raw text travels
 * too, bounded — a probe that reports a status without the body is half a
 * probe, and it cost a whole round trip through a real device to find that out.
 */
function describe(payload, status, raw = null, contentType = null) {
  const top = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20) : [];
  const list = Array.isArray(payload) ? payload : (payload?.routes ?? payload?.planes ?? null);
  const first = Array.isArray(list) && list[0] && typeof list[0] === 'object' ? Object.keys(list[0]).slice(0, 30) : [];
  return {
    status,
    contentType,
    // Bounded and reported separately from the parse, so "empty" and
    // "unparseable" stop looking identical.
    bodyLength: raw === null ? null : raw.length,
    bodyPrefix: typeof raw === 'string' ? raw.slice(0, 400) : null,
    parsed: payload !== null,
    topLevelKeys: top,
    entryKeys: first,
    entries: Array.isArray(list) ? list.length : null,
    /**
     * FastAPI's validation error, verbatim and bounded. This is the single most
     * useful thing the probe can return: a 422 names the field it rejected, so
     * a wrong request shape diagnoses itself instead of failing silently.
     */
    validation: Array.isArray(payload?.detail)
      ? payload.detail.slice(0, 5).map((d) => ({
          at: Array.isArray(d?.loc) ? d.loc.join('.') : null,
          says: typeof d?.msg === 'string' ? d.msg.slice(0, 160) : null,
          kind: typeof d?.type === 'string' ? d.type : null,
        }))
      : null,
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const callsign = (url.searchParams.get('callsign') ?? '').trim().toUpperCase();
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));

  /**
   * VALIDATED BEFORE ANYTHING IS SENT, like every other upstream call here.
   * adsb.fi's terms say a 400 counts toward a temporary IP restriction and
   * adsb.lol say "if you get 4xx errors, you are doing something wrong" — a
   * client typo must cost us nothing upstream.
   */
  if (!/^[A-Z0-9]{2,8}$/.test(callsign)) {
    return problem('callsign must be 2 to 8 letters or digits, e.g. UAL328', { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return problem('lat and lon are required and must be a real position', { status: 400 });
  }

  /**
   * A ROUTE DOES NOT CHANGE DURING A FLIGHT, so this is cached hard — far
   * harder than the traffic feed, which is a live position. One follow costs
   * one upstream request rather than one every ten seconds.
   */
  const key = `/api/route?callsign=${callsign}`;
  return cached(request, key, POLICIES.route.cacheSeconds, async () => {
    /**
     * THE STANDOFF IS PER PROVIDER, NOT PER ENDPOINT, and getting that wrong
     * shipped once. This read `${ROUTE_SOURCE.id}:route`, which gives the route
     * feed a private cooldown — and adsb.lol's rate limit is per IP across
     * their whole API, so a private cooldown is not a cooldown at all. It broke
     * both ways: a 429 earned here never told the TRAFFIC feed to back off, and
     * a traffic feed already standing off from adsb.lol still got asked for
     * routes, spending the allowance the standoff existed to protect.
     *
     * The visible consequence is not a missing route. It is an EMPTY SCOPE —
     * the aircraft feed refused, because a second endpoint was quietly
     * competing with it for one shared Cloudflare egress address.
     *
     * `inCooldown`'s own comment says "the standing refusal for a PROVIDER".
     * Use the provider's id.
     */
    const cool = await inCooldown(request, ROUTE_SOURCE.id).catch(() => null);
    if (cool) {
      return problem(`route not asked — ${cool.reason}, ${standoffPhrase(cool)}`, { status: 503 });
    }

    let res;
    try {
      res = await politeFetch(ROUTE_SOURCE.url, {
        method: 'POST',
        headers: { 'user-agent': USER_AGENT, 'content-type': 'application/json' },
        /**
         * THE HYPOTHESIS. `planes` with `callsign` and `lat`/`lng` is the shape
         * the tar1090 family uses, and adsb.lol run that lineage. The position
         * is sent because the same callsign flies different sectors and the
         * feed disambiguates by where the aircraft actually is.
         *
         * If this is wrong the reply is a 422 naming the field, which is
         * exactly what the probe below reports.
         */
        body: JSON.stringify({ planes: [{ callsign, lat, lng: lon }] }),
      });
    } catch (err) {
      return problem(`the route feed is unreachable: ${err.message}`, { status: 502 });
    }

    /**
     * TEXT FIRST, THEN PARSE. `res.json()` consumes the body and throws away
     * what it could not read, which is precisely the thing worth seeing when a
     * 201 comes back empty. Reading the text keeps the evidence.
     */
    let raw = null;
    let payload = null;
    try {
      raw = await res.text();
    } catch {
      /* body unreadable; `describe` reports a null length, which says so */
    }
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        // Left null on purpose — `parsed: false` beside the raw prefix is the
        // honest picture, and now the prefix is actually there to look at.
      }
    }

    if (res.status === 429 || res.status === 403) {
      const after = Number(res.headers?.get?.('retry-after'));
      // Recorded against the PROVIDER, so the traffic feed backs off too. The
      // limit that produced this is per IP across their whole API; a refusal
      // earned here is a refusal the aircraft feed is about to earn as well.
      await noteRefusal(
        request,
        ROUTE_SOURCE.id,
        cooldownSeconds(res.status, after),
        `refused us (HTTP ${res.status}) on the route feed`,
      ).catch(() => {});
    }

    const probe = describe(payload, res.status, raw, res.headers?.get?.('content-type') ?? null);

    if (!res.ok) {
      return json(
        {
          ok: false,
          source: ROUTE_SOURCE.id,
          sourceUrl: ROUTE_SOURCE.homeUrl,
          callsign,
          reason: `the route feed returned HTTP ${res.status}`,
          probe,
        },
        { status: 200, cacheSeconds: 0 },
      );
    }

    const parsed = parseRoute(payload, callsign);
    return json(
      {
        ok: parsed.ok,
        source: ROUTE_SOURCE.id,
        sourceUrl: ROUTE_SOURCE.homeUrl,
        attribution: ROUTE_SOURCE.attribution,
        callsign,
        fetchedAt: new Date().toISOString(),
        ...(parsed.ok
          ? { origin: parsed.origin, destination: parsed.destination, via: parsed.via, plausible: parsed.plausible }
          : { reason: parsed.reason }),
        // Rides on every response, success or not — the answer to "what does
        // this feed actually send" costs nothing extra once the request is made.
        probe,
      },
      // A route that IS understood caches for the policy; one that is not
      // caches for nothing, so a fix upstream is picked up immediately.
      { cacheSeconds: parsed.ok ? POLICIES.route.cacheSeconds : 0 },
    );
  });
}
