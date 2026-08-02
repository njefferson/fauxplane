/**
 * /api/traffic — live aircraft, from adsb.fi open data.
 *
 *   Source : https://opendata.adsb.fi/api/
 *   Auth   : NONE. No key, no OAuth, no KV, no secret to leak.
 *   Terms  : https://github.com/adsbfi/opendata — personal, non-commercial,
 *            citation required. Quoted in full in POLICIES.traffic.
 *   Cache  : 8 s by area, 5 s by callsign, at the edge.
 *
 * WHY NOT OpenSky, WHICH THIS ENDPOINT USED TO CALL. Two reasons, in order of
 * how much they matter. First, OpenSky has no lookup by callsign at all — its
 * REST surface is `states/all` with an optional bounding box, confirmed by
 * reading its own Python client — so "show me this flight number" meant pulling
 * a box and filtering, with no way to find an aircraft you cannot already guess
 * the position of. Second, its useful rate limit needs OAuth client credentials,
 * a KV namespace to cache the bearer token, and two repo secrets that were
 * never set. adsb.fi answers both questions directly and anonymously.
 *
 * WHAT ADS-B ACTUALLY CARRIES, because the panel must not imply otherwise:
 * position, barometric and geometric altitude, groundspeed, true track, and
 * vertical rate. It carries NO ATTITUDE — no pitch, no roll. Anything the panel
 * shows beyond this list is derived downstream and says so.
 *
 * THE POSITION SENT UPSTREAM IS DELIBERATELY COARSE. A radius query needs a
 * centre, so unlike the METAR path this one cannot keep the fix entirely on the
 * device. It is quantised to a tenth of a degree — about six nautical miles —
 * before it leaves us, which is uninformative about a person and, not by
 * coincidence, makes every user within the same six miles share one cache entry.
 */

import { POLICIES, USER_AGENT, cached, json, politeFetch, problem } from './_lib.js';

const BASE = 'https://opendata.adsb.fi/api';

/** Home reference, used only until the client has a fix (NOTES.md, settled). */
const HOME = { lat: 38.68, lon: -121.0 };

/** adsb.fi caps the radius query at 250 nm. Ours is tighter: a plan view of
 *  half a state is not a panel instrument, and §15.5 says do not sweep. */
const MAX_DIST_NM = 120;
const DEFAULT_DIST_NM = 40;

/** Quantum for the outbound centre, degrees. ~6 nm. */
const POSITION_QUANTUM = 0.1;

const quantise = (v) => Math.round(v / POSITION_QUANTUM) * POSITION_QUANTUM;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * `alt_baro` is a number of feet OR the literal string "ground". Treating the
 * string as a missing altitude would silently drop every taxiing aircraft into
 * "no data"; treating it as a number gives NaN. It is neither — it is a
 * different fact, and it travels as one.
 */
function parseAltitude(raw) {
  if (raw === 'ground') return { ft: null, onGround: true };
  const v = num(raw);
  return { ft: v, onGround: false };
}

/**
 * Normalise one ADSBexchange-v2-shaped aircraft into this app's own shape.
 *
 * Renaming rather than passing the upstream object through is deliberate: it is
 * the seam where a field that changes name upstream produces a null we can see,
 * instead of an `undefined` that reaches a gauge.
 */
function parseAircraft(a) {
  if (!a || typeof a !== 'object') return null;
  const hex = typeof a.hex === 'string' ? a.hex.trim().toLowerCase() : null;
  if (!hex) return null;

  const baro = parseAltitude(a.alt_baro);
  const callsign = typeof a.flight === 'string' && a.flight.trim() ? a.flight.trim() : null;

  return {
    hex,
    callsign,
    registration: typeof a.r === 'string' && a.r.trim() ? a.r.trim() : null,
    type: typeof a.t === 'string' && a.t.trim() ? a.t.trim() : null,
    description: typeof a.desc === 'string' && a.desc.trim() ? a.desc.trim() : null,
    lat: num(a.lat),
    lon: num(a.lon),
    altBaroFt: baro.ft,
    altGeomFt: num(a.alt_geom),
    onGround: baro.onGround,
    groundspeedKt: num(a.gs),
    trackDeg: num(a.track),
    headingDeg: num(a.true_heading ?? a.mag_heading ?? a.nav_heading),
    // Barometric rate is the one an altimeter would show; geometric is the one
    // GPS sees. Prefer baro, fall back, and never average two different
    // measurements into a number that is neither.
    verticalRateFpm: num(a.baro_rate) ?? num(a.geom_rate),
    squawk: typeof a.squawk === 'string' ? a.squawk : null,
    category: typeof a.category === 'string' ? a.category : null,
    /** Seconds since this aircraft's position was last heard. The client ages
     *  its own display from this, so a receiver gap shows as STALE rather than
     *  as an aircraft frozen in place. */
    seenPosS: num(a.seen_pos),
    seenS: num(a.seen),
  };
}

function parsePayload(payload) {
  const rows = Array.isArray(payload?.ac)
    ? payload.ac
    : Array.isArray(payload?.aircraft)
      ? payload.aircraft
      : null;
  // A body in neither shape is not "no aircraft" — it is an upstream we no
  // longer understand, and saying so is the difference between an empty sky
  // and a broken client.
  if (!rows) return { error: 'adsb.fi returned a body with no aircraft array (ac/aircraft)' };

  const aircraft = rows
    .map(parseAircraft)
    .filter((a) => a && a.lat !== null && a.lon !== null);

  const nowMs = num(payload?.now);
  return {
    aircraft,
    upstreamTime: nowMs === null ? null : new Date(nowMs > 1e12 ? nowMs : nowMs * 1000).toISOString(),
  };
}

/** Shared tail of both query shapes: call upstream, normalise, wrap. */
async function relay(upstreamUrl, meta, cacheSeconds) {
  let res;
  try {
    res = await politeFetch(upstreamUrl, { headers: { 'user-agent': USER_AGENT } });
  } catch (err) {
    return problem(`adsb.fi unreachable: ${err.message}`);
  }

  if (res.status === 429) {
    // A 429 is an instruction (Doctrine §15.3). politeFetch already waited out
    // a short Retry-After; reaching here means back off properly. There is
    // nothing to serve instead, and inventing an empty sky would read as "no
    // traffic" — which is a lie a radar page must never tell.
    return problem('adsb.fi asked us to slow down (rate limited) — the display holds its last sweep', { status: 429 });
  }
  if (res.status === 404) {
    // The callsign endpoint 404s for a flight that is not currently airborne
    // and heard by a receiver. That is an ANSWER, not a fault.
    return json(
      { ok: true, source: POLICIES.traffic.source, attribution: POLICIES.traffic.attribution, ...meta, count: 0, aircraft: [], notHeard: true },
      { cacheSeconds },
    );
  }
  if (!res.ok) {
    // CARRY THE EVIDENCE. "HTTP 403" is a status code, not a reason, and it
    // left the one question that matters unanswered: whether adsb.fi is
    // refusing this request, this User-Agent, or every Cloudflare Worker.
    // Their reply usually says which, and the panel's whole contract is that a
    // failure explains itself — a rule the app applies to its own sensors and
    // had not been applying to somebody else's server.
    //
    // Bounded and stripped of newlines because it goes on the face of a gauge,
    // and read defensively: an error path that throws is an error path that
    // hides the error.
    let detail = '';
    try {
      const body = (await res.text()).replace(/\s+/g, ' ').trim();
      if (body) detail = ` — ${body.slice(0, 160)}`;
    } catch {
      /* no readable body; the status is all there is */
    }
    const server = res.headers.get('server');
    const via = server ? ` [server: ${server}]` : '';
    return problem(`adsb.fi returned HTTP ${res.status}${via}${detail}`, { status: 502 });
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    return problem(`adsb.fi returned a non-JSON body: ${err.message}`);
  }

  const parsed = parsePayload(payload);
  if (parsed.error) return problem(parsed.error, { status: 502 });

  return json(
    {
      ok: true,
      source: POLICIES.traffic.source,
      sourceUrl: POLICIES.traffic.homeUrl,
      // Carried in the payload rather than hardcoded in the client, so the
      // citation adsb.fi's terms require travels WITH the data it is about.
      attribution: POLICIES.traffic.attribution,
      ...meta,
      upstreamTime: parsed.upstreamTime,
      fetchedAt: new Date().toISOString(),
      count: parsed.aircraft.length,
      aircraft: parsed.aircraft,
    },
    { cacheSeconds },
  );
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const callsign = url.searchParams.get('callsign');

  // --- by callsign: "where is this flight right now" ------------------------
  if (callsign !== null) {
    // VALIDATED BEFORE IT IS SENT. adsb.fi counts 400s and 404s against the
    // same rate limit as real queries, so a client typo must cost us nothing
    // upstream. Callsigns are ICAO-style: letters and digits, up to eight.
    const cs = callsign.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(cs)) {
      return problem('callsign must be 2 to 8 letters or digits, e.g. UAL328 or N172SP', { status: 400 });
    }
    return cached(request, `/api/traffic?callsign=${cs}`, POLICIES.traffic.callsignCacheSeconds, () =>
      relay(`${BASE}/v2/callsign/${encodeURIComponent(cs)}`, { query: { callsign: cs } }, POLICIES.traffic.callsignCacheSeconds),
    );
  }

  // --- by Mode-S hex: the same question for an aircraft with no callsign ----
  const hex = url.searchParams.get('hex');
  if (hex !== null) {
    const h = hex.trim().toLowerCase();
    // Exactly six hex digits. Validated before sending, for the same reason as
    // the callsign above: adsb.fi counts our 404s against our rate limit.
    if (!/^[0-9a-f]{6}$/.test(h)) return problem('hex must be six hexadecimal digits, e.g. a1b2c3', { status: 400 });
    return cached(request, `/api/traffic?hex=${h}`, POLICIES.traffic.callsignCacheSeconds, () =>
      relay(`${BASE}/v2/hex/${h}`, { query: { hex: h } }, POLICIES.traffic.callsignCacheSeconds),
    );
  }

  // --- by area: "what is around me" -----------------------------------------
  const asNumber = (name, fallback) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };

  const lat = asNumber('lat', HOME.lat);
  const lon = asNumber('lon', HOME.lon);
  let dist = asNumber('dist', DEFAULT_DIST_NM);

  if (lat === null || lon === null || dist === null) return problem('lat, lon and dist must be numbers', { status: 400 });
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return problem('lat or lon out of range', { status: 400 });
  if (!(dist > 0)) return problem('dist must be greater than zero', { status: 400 });
  if (dist > MAX_DIST_NM) return problem(`dist is capped at ${MAX_DIST_NM} nm`, { status: 400 });
  dist = Math.round(dist);

  // Coarsened here, once, so the quantised value is what goes upstream AND what
  // keys the cache. Rounding in only one of the two places would leak the
  // precise fix into the cache key instead.
  const qLat = quantise(lat);
  const qLon = quantise(lon);

  const key = `/api/traffic?lat=${qLat.toFixed(1)}&lon=${qLon.toFixed(1)}&dist=${dist}`;
  return cached(request, key, POLICIES.traffic.cacheSeconds, () =>
    relay(
      `${BASE}/v3/lat/${qLat.toFixed(4)}/lon/${qLon.toFixed(4)}/dist/${dist}`,
      {
        query: { lat: qLat, lon: qLon, distNm: dist },
        // Said out loud in the payload so the client can show it, and so a
        // later session reading a response cannot mistake the coarse centre for
        // the device's actual position.
        centreQuantisedDeg: POSITION_QUANTUM,
      },
      POLICIES.traffic.cacheSeconds,
    ),
  );
}

export { parseAircraft, parsePayload, quantise, MAX_DIST_NM, DEFAULT_DIST_NM };
