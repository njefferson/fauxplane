/**
 * route.js — where the followed flight came from and where it is going.
 *
 * IT IS A FEED, HELD TO THE SAME RULE AS EVERY OTHER. adsb.lol serve it under
 * ODbL, the panel credits them, and a route that is not known reads as not
 * known rather than as a blank.
 *
 * "PLAUSIBLE" IS ADSB.LOL'S OWN WORD AND IT IS ON SCREEN. They infer the route
 * from the CALLSIGN — UAL328 flies the sector United usually fly it on — which
 * is a good guess and is not a filed flight plan. An aircraft can be diverting,
 * repositioning, or flying a completely different leg under a reused callsign.
 * This app crosses out a pitch it cannot measure; it is not about to present an
 * inference as a clearance.
 *
 * ASKED ONCE PER FOLLOWED FLIGHT, not once per sweep. A position changes every
 * second and a route does not change at all, so the Function caches it for ten
 * minutes and this asks only when the callsign actually changes. The whole
 * feature costs a volunteer service roughly one request per flight anyone
 * follows.
 */

/** Nothing known yet, and that is a state rather than an absence. */
const UNKNOWN = Object.freeze({ state: 'unknown', reason: null });

export function createRouteSource({ fetchImpl = fetch, clock = () => Date.now() } = {}) {
  let current = { callsign: null, ...UNKNOWN };
  let inflight = null;
  /** The last probe, for the diagnostics report (§7f). */
  let probe = null;

  /**
   * Ask about a callsign, at most once.
   *
   * The guard is on the CALLSIGN rather than on a timer: following the same
   * flight for an hour asks once, and switching flights asks again immediately,
   * which is the shape of the question rather than a rate the client invented.
   */
  async function forFlight(callsign, position) {
    const cs = String(callsign ?? '').trim().toUpperCase();
    if (!cs) {
      current = { callsign: null, ...UNKNOWN };
      return current;
    }
    if (current.callsign === cs && current.state !== 'unknown') return current;
    if (inflight?.callsign === cs) return inflight.promise;

    // WITHOUT A POSITION THERE IS NOTHING TO ASK. The feed disambiguates a
    // reused callsign by where the aircraft actually is, and sending a made-up
    // point to satisfy a parameter would be inventing an input.
    if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lon)) {
      current = { callsign: cs, state: 'unknown', reason: 'waiting for the aircraft’s position' };
      return current;
    }

    const promise = (async () => {
      const url = `/api/route?callsign=${encodeURIComponent(cs)}&lat=${position.lat.toFixed(4)}&lon=${position.lon.toFixed(4)}`;
      try {
        const res = await fetchImpl(url);
        const body = await res.json();
        probe = { at: clock(), callsign: cs, ...(body?.probe ?? {}) };
        current = body?.ok
          ? {
              callsign: cs,
              state: 'known',
              origin: body.origin,
              destination: body.destination,
              via: body.via ?? [],
              plausible: body.plausible !== false,
              source: body.source ?? null,
              sourceUrl: body.sourceUrl ?? null,
              attribution: body.attribution ?? null,
              at: clock(),
            }
          : { callsign: cs, state: 'none', reason: body?.reason ?? 'the route feed had no answer' };
      } catch (err) {
        current = { callsign: cs, state: 'none', reason: `the route feed is unreachable: ${err.message}` };
      } finally {
        inflight = null;
      }
      return current;
    })();

    inflight = { callsign: cs, promise };
    return promise;
  }

  return {
    forFlight,
    get current() {
      return current;
    },
    /** What the feed actually sent, for the diagnostics report. */
    get probe() {
      return probe;
    },
    clear() {
      current = { callsign: null, ...UNKNOWN };
      inflight = null;
    },
  };
}

/**
 * The route as one line, or null when there is nothing honest to say.
 *
 * PURE, so the wording is testable — and the wording is the whole point here.
 * Every branch has to be readable by someone who is not a pilot and has to
 * distinguish "we do not know" from "there is no route", which are different
 * facts about a flight.
 */
export function routeLine(route) {
  if (!route || route.state === 'unknown') return null;
  if (route.state !== 'known') return null;

  const name = (p) => p?.code ?? null;
  const from = name(route.origin);
  const to = name(route.destination);
  if (!from || !to) return null;

  const via = (route.via ?? []).map(name).filter(Boolean);
  const middle = via.length ? ` via ${via.join(', ')}` : '';
  return `${from} → ${to}${middle}`;
}

/**
 * The caveat, in adsb.lol's own word. Never omitted while the route is shown.
 *
 * SHORT ON PURPOSE, because it is VISIBLE TEXT in a banner that already carries
 * a callsign and a way out, on a panel whose landscape layout has already been
 * reported as cramped. Every word left in it is load-bearing:
 * "plausible" is the source's own verdict, "from the callsign" is the method
 * that makes it a guess, and "not a filed flight plan" is the sentence that
 * stops a reader who is not a pilot treating it as a clearance. The longer
 * version lives in the (i) menu under where the numbers come from.
 */
export function routeCaveat(route) {
  if (!route || route.state !== 'known') return null;
  return route.plausible
    ? 'plausible — from the callsign, not a filed flight plan'
    : 'reported as confirmed by the source';
}
