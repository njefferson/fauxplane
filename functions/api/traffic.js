/**
 * /api/traffic — live aircraft, from community ADS-B open data.
 *
 *   Sources: adsb.lol, then adsb.fi — see TRAFFIC_PROVIDERS in _lib.js for the
 *            order, the paths and each one's terms.
 *   Auth   : NONE. No key, no OAuth, no KV, no secret to leak.
 *   Cache  : 8 s by area, 5 s by callsign, at the edge.
 *
 * THERE IS MORE THAN ONE SOURCE BECAUSE ONE OF THEM REFUSED US. adsb.fi
 * answered every request with a Cloudflare block page — their edge declining a
 * Pages Function before their API saw it. The endpoint was right and the
 * request well-formed. Both publish an ADSBexchange-v2-compatible shape, so one
 * parser reads either, and the panel credits WHICHEVER ANSWERED rather than
 * whichever was tried first.
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

import { POLICIES, TRAFFIC_PROVIDERS, USER_AGENT, cached, cooldownSeconds, inCooldown, json, noteRefusal, politeFetch, problem, standoffPhrase } from './_lib.js';

/** Home reference, used only until the client has a fix (NOTES.md, settled). */
const HOME = { lat: 38.68, lon: -121.0 };

/** Both providers cap the radius query at 250 nm. Ours is tighter: a plan view of
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

    /**
     * WHAT THE CREW HAS DIALLED IN. These come from Mode S BDS 4,0 and are the
     * closest a broadcast gets to intent rather than state: the altitude
     * selected on the mode control panel, the heading selected, the altimeter
     * setting the crew is flying to, and which autopilot modes are engaged.
     *
     * `nav_altitude_fms` is DELIBERATELY NOT a fallback for `nav_altitude_mcp`.
     * They are different quantities from different boxes — the panel selection
     * versus the flight plan's — and substituting one for the other is the same
     * error as filling a geometric altitude with a barometric one. Only the MCP
     * value is taken; an aircraft sending only the FMS one reads as not
     * broadcasting a selected altitude, which is true.
     *
     * Most aircraft send none of this. That is a FAIL with a reason, not a gap
     * to fill.
     */
    navSelectedAltitudeFt: num(a.nav_altitude_mcp),
    navSelectedHeadingDeg: num(a.nav_heading),
    navQnhHpa: num(a.nav_qnh),
    navModes: Array.isArray(a.nav_modes)
      ? a.nav_modes.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim())
      : null,
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
  if (!rows) return { error: 'returned a body with no aircraft array (ac/aircraft)' };

  const aircraft = rows
    .map(parseAircraft)
    .filter((a) => a && a.lat !== null && a.lon !== null);

  const nowMs = num(payload?.now);
  return {
    aircraft,
    upstreamTime: nowMs === null ? null : new Date(nowMs > 1e12 ? nowMs : nowMs * 1000).toISOString(),
    observed: observeShape(rows),
  };
}

/**
 * WHAT THE PROVIDER ACTUALLY SENT, as opposed to what its documentation says.
 *
 * THIS IS THE ONLY PLACE THE RAW PAYLOAD IS VISIBLE. The Function normalises
 * every aircraft before the client sees it, so a browser cannot answer "does
 * this provider broadcast the autopilot selections at all" — the field is
 * either a number or null by then, and null could mean "not sent" or "we spelt
 * the key wrong". A parser written from documentation rather than from an
 * observed payload fails exactly that way, silently.
 *
 * So the shape rides along on every response: no extra request, no probe
 * needed, and the answer is in the diagnostics report whenever the owner opens it
 * (Doctrine §7f — prefer reporting what already happened).
 *
 * It reports COVERAGE, not values: how many of N aircraft carried each field.
 * "0 of 34" is the answer that matters, and it is one nobody can infer from a
 * panel showing a crossed-out readout.
 */
function observeShape(rows) {
  const sample = rows.slice(0, 60);
  const keys = new Set();
  const present = {};
  const bump = (k) => {
    present[k] = (present[k] ?? 0) + 1;
  };

  for (const row of sample) {
    if (!row || typeof row !== 'object') continue;
    for (const k of Object.keys(row)) keys.add(k);
    // The fields the panel makes claims about. Counted only when the value is
    // one we could actually use — a key present with a null is not coverage.
    if (num(row.nav_altitude_mcp) !== null) bump('nav_altitude_mcp');
    if (num(row.nav_altitude_fms) !== null) bump('nav_altitude_fms');
    if (num(row.nav_heading) !== null) bump('nav_heading');
    if (num(row.nav_qnh) !== null) bump('nav_qnh');
    if (Array.isArray(row.nav_modes) && row.nav_modes.length) bump('nav_modes');
    if (typeof row.t === 'string' && row.t.trim()) bump('t (type code)');
    if (typeof row.desc === 'string' && row.desc.trim()) bump('desc (type name)');
    if (num(row.true_heading) !== null) bump('true_heading');
    if (num(row.mag_heading) !== null) bump('mag_heading');
    if (num(row.geom_rate) !== null) bump('geom_rate');
    if (num(row.baro_rate) !== null) bump('baro_rate');
  }

  return {
    sampled: sample.length,
    // Sorted so two reports from different moments can be diffed by eye.
    keys: [...keys].sort(),
    coverage: present,
  };
}

/**
 * Turn a failed upstream response into one readable sentence.
 *
 * WHEN A CDN REFUSES YOU, THE CDN IS THE ONE ANSWERING — not the API. That
 * distinction is the whole diagnosis, and it is carried by three things: the
 * `server` header, the block page's `<title>`, and Cloudflare's numeric error
 * code. Those three fit on a gauge; the HTML they arrive wrapped in does not.
 *
 * Exported so it can be tested against real captured block pages without a
 * network, which is the only way this path can be exercised from a sandbox
 * whose proxy refuses to reach adsb.fi at all.
 */
export async function describeUpstreamFailure(res) {
  const bits = [];
  const server = res.headers?.get?.('server');
  if (server) bits.push(`server: ${server}`);
  // Cloudflare sets these on its own challenge and block responses; they are
  // absent when the origin itself answered, which is exactly the thing worth
  // telling apart.
  const mitigated = res.headers?.get?.('cf-mitigated');
  if (mitigated) bits.push(`cf-mitigated: ${mitigated}`);
  const ray = res.headers?.get?.('cf-ray');
  if (ray) bits.push(`ray ${ray}`);

  let body = '';
  try {
    body = await res.text();
  } catch {
    /* no readable body; the headers are all there is */
  }
  if (body) {
    // The title of a Cloudflare block page names both the site and the reason:
    // "Access denied | opendata.adsb.fi used Cloudflare to restrict access".
    const title = /<title[^>]*>([^<]{1,160})<\/title>/i.exec(body);
    if (title) bits.push(title[1].replace(/\s+/g, ' ').trim());
    // "Error 1020" is a firewall RULE; 1015 is rate limiting; 1010 is a blocked
    // client signature. Which number it is decides what to do about it.
    const code = /error\s*(?:code:?\s*)?(\d{4})/i.exec(body);
    if (code) bits.push(`Cloudflare error ${code[1]}`);
    if (!title && !code) {
      // Not a page we recognise. Fall back to a flattened, bounded excerpt
      // rather than saying nothing at all.
      const flat = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (flat) bits.push(flat.slice(0, 120));
    }
  }
  return bits.length ? ` — ${bits.join('; ')}` : '';
}

/**
 * ONE provider, one attempt. Returns either a finished Response or a `retry`
 * marker saying why this provider is out, so the caller can go to the next one.
 *
 * The distinction matters: a 404 from the callsign endpoint is an ANSWER (that
 * flight is not being heard) and must NOT cause a fallback, while a 403 from a
 * CDN is that provider refusing us and must.
 */
async function tryProvider(provider, pathname, meta, cacheSeconds, request = null) {
  const upstreamUrl = `${provider.base}${pathname}`;
  let res;
  try {
    res = await politeFetch(upstreamUrl, { headers: { 'user-agent': USER_AGENT } });
  } catch (err) {
    return { retry: `${provider.id} unreachable: ${err.message}` };
  }

  if (res.status === 429) {
    // A 429 is an instruction (Doctrine §15.3). politeFetch already waited out
    // a short Retry-After; reaching here means back off properly. There is
    // nothing to serve instead, and inventing an empty sky would read as "no
    // traffic" — which is a lie a radar page must never tell.
    //
    // CARRY WHAT THEY ASKED FOR. The instruction lives in the headers and this
    // threw every one of them away, so the panel could say it was rate limited
    // but never how long for — and the owner's report showed a 429 on the FIRST
    // request of a session, which no amount of pacing on our side explains.
    // Answering "is this us, or is it the address we share with every other
    // Cloudflare tenant" needs the numbers, not the status code.
    const said = [];
    for (const h of ['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'ratelimit-reset', 'cf-ray']) {
      const v = res.headers?.get?.(h);
      if (v) said.push(`${h} ${v}`);
    }
    // STAND OFF, and for as long as they asked. A 429 is an instruction.
    if (request) {
      const after = Number(res.headers?.get?.('retry-after'));
      await noteRefusal(request, provider.id, cooldownSeconds(429, after), 'rate limited (HTTP 429)').catch(() => {});
    }
    return {
      retry: `${provider.id} rate limited us (HTTP 429${said.length ? `; ${said.join(', ')}` : '; it sent no retry guidance'})`,
    };
  }
  if (res.status === 404) {
    // The callsign endpoint 404s for a flight that is not currently airborne
    // and heard by a receiver. That is an ANSWER, not a fault.
    return json(
      { ok: true, source: provider.id, sourceUrl: provider.homeUrl, attribution: provider.attribution, ...meta, count: 0, aircraft: [], notHeard: true },
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
    // EXTRACT THE SIGNAL, do not paste the page.
    //
    // The first version of this dumped the first 160 characters of the body,
    // which for a Cloudflare block page is `<!DOCTYPE html> <!--[if lt IE 7]>`
    // — a paragraph of conditional comments on the face of a gauge, truncated
    // just before the only part that means anything. Relaying MORE was not the
    // answer; relaying the RIGHT part was.
    const detail = await describeUpstreamFailure(res);
    /**
     * A 403 IS STRUCTURAL, so stop asking for a while.
     *
     * This is the branch adsb.fi takes on every single request — their firewall
     * refuses a Pages Function before their API sees it — and their terms say
     * such a reply counts toward a temporary IP restriction. Retrying a refusal
     * we can predict is the "excessive invalid requests" that sentence is about,
     * and the address it would be charged against is shared with every other
     * Cloudflare tenant.
     */
    if (request) {
      await noteRefusal(request, provider.id, cooldownSeconds(res.status), `refused us (HTTP ${res.status})`).catch(() => {});
    }
    return { retry: `${provider.id} returned HTTP ${res.status}${detail}` };
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    return { retry: `${provider.id} returned a non-JSON body: ${err.message}` };
  }

  const parsed = parsePayload(payload);
  if (parsed.error) return { retry: `${provider.id}: ${parsed.error}` };

  return json(
    {
      ok: true,
      source: provider.id,
      sourceUrl: provider.homeUrl,
      // Carried in the payload rather than hardcoded in the client, so the
      // citation each provider's terms require travels WITH the data it is
      // about — and names whichever one actually answered, not whichever was
      // tried first.
      attribution: provider.attribution,
      ...meta,
      upstreamTime: parsed.upstreamTime,
      fetchedAt: new Date().toISOString(),
      count: parsed.aircraft.length,
      /** What the provider actually sent, for the diagnostics report (§7f).
       *  Rides on every response so the answer costs no extra request. */
      observed: parsed.observed,
      aircraft: parsed.aircraft,
    },
    { cacheSeconds },
  );
}

/**
 * Try each provider in turn and return the first real answer.
 *
 * EVERY REASON IS KEPT, and all of them are reported if none works. "adsb.lol
 * returned HTTP 403" alone would send the next reader to look at adsb.lol; the
 * useful fact is usually that BOTH refused, and how each one phrased it.
 */
async function relay(pick, meta, cacheSeconds, request = null) {
  const refusals = [];
  for (const provider of TRAFFIC_PROVIDERS) {
    /**
     * A PROVIDER THAT REFUSED RECENTLY IS SKIPPED, not retried.
     *
     * adsb.fi's terms say a 403 counts toward a temporary IP restriction, and
     * ours 403s every single time — their firewall blocks a Pages Function
     * before their API sees it. Asking anyway spends a strike on a call that
     * cannot succeed, from an address shared with every other Cloudflare
     * tenant. See noteRefusal in _lib.js.
     *
     * The skip is REPORTED, not silent: the panel's contract is that a failure
     * explains itself, and "we did not ask" is a different fact from "they said
     * no" — a reader deserves to know which.
     */
    if (request) {
      const cool = await inCooldown(request, provider.id).catch(() => null);
      if (cool) {
        refusals.push(`${provider.id} not asked — ${cool.reason}, ${standoffPhrase(cool)}`);
        continue;
      }
    }
    const out = await tryProvider(provider, pick(provider), meta, cacheSeconds, request);
    if (!out?.retry) return out;
    refusals.push(out.retry);
  }
  return problem(refusals.join(' | '), { status: 502 });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const callsign = url.searchParams.get('callsign');

  // --- by callsign: "where is this flight right now" ------------------------
  if (callsign !== null) {
    // VALIDATED BEFORE IT IS SENT. These services count 400s and 404s against
    // the same rate limit as real queries, so a client typo must cost us nothing
    // upstream. Callsigns are ICAO-style: letters and digits, up to eight.
    const cs = callsign.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(cs)) {
      return problem('callsign must be 2 to 8 letters or digits, e.g. UAL328 or N172SP', { status: 400 });
    }
    return cached(request, `/api/traffic?callsign=${cs}`, POLICIES.traffic.callsignCacheSeconds, () =>
      relay((p) => p.callsign(encodeURIComponent(cs)), { query: { callsign: cs } }, POLICIES.traffic.callsignCacheSeconds, request),
    );
  }

  // --- by Mode-S hex: the same question for an aircraft with no callsign ----
  const hex = url.searchParams.get('hex');
  if (hex !== null) {
    const h = hex.trim().toLowerCase();
    // Exactly six hex digits. Validated before sending, for the same reason as
    // the callsign above: a 404 counts against our rate limit too.
    if (!/^[0-9a-f]{6}$/.test(h)) return problem('hex must be six hexadecimal digits, e.g. a1b2c3', { status: 400 });
    return cached(request, `/api/traffic?hex=${h}`, POLICIES.traffic.callsignCacheSeconds, () =>
      relay((p) => p.hex(h), { query: { hex: h } }, POLICIES.traffic.callsignCacheSeconds, request),
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
      (p) => p.area(qLat.toFixed(4), qLon.toFixed(4), dist),
      {
        query: { lat: qLat, lon: qLon, distNm: dist },
        // Said out loud in the payload so the client can show it, and so a
        // later session reading a response cannot mistake the coarse centre for
        // the device's actual position.
        centreQuantisedDeg: POSITION_QUANTUM,
      },
      POLICIES.traffic.cacheSeconds,
      request,
    ),
  );
}

export { parseAircraft, parsePayload, quantise, MAX_DIST_NM, DEFAULT_DIST_NM };
