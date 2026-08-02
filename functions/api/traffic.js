/**
 * /api/traffic — OpenSky Network state vectors.
 *
 *   Source : https://opensky-network.org/api/states/all
 *   Auth   : OAuth2 client-credentials ONLY. Tokens expire in 30 min and are
 *            cached in KV with a 25-min TTL; a 401 refreshes once and retries.
 *   Cache  : 10 s of state vectors (POLICIES.traffic)
 *   Terms  : https://opensky-network.org/about/terms-of-use — free for
 *            non-commercial research and personal use.
 *
 * NO PANEL CONSUMES THIS IN v1. The traffic display is v2 and is gated behind
 * the attitude stability test. The endpoint is built and testable now, as the
 * spec allows, because the credential handling is the part worth getting right
 * while nothing depends on it.
 *
 * THE SECRETS NEVER REACH THE CLIENT. OPENSKY_CLIENT_ID and
 * OPENSKY_CLIENT_SECRET are Worker env bindings, read here, exchanged here, and
 * the bearer token is cached in KV — server side, never in a response body,
 * never in a header we emit (Doctrine §16.4: a secret reaches exactly the step
 * that needs it).
 */

import { POLICIES, USER_AGENT, cached, json, politeFetch, problem } from './_lib.js';

const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

const KV_TOKEN_KEY = 'opensky:token';
/** 25 minutes against a 30-minute lifetime: five minutes of headroom so a
 *  token cannot expire between being read and being used. */
const TOKEN_TTL_SECONDS = 25 * 60;

/** Cold-start bounding box, before the first GPS fix (NOTES.md, settled). */
export const COLD_START_BBOX = Object.freeze({
  lamin: 38.1,
  lomin: -121.85,
  lamax: 39.25,
  lomax: -120.15,
});

async function mintToken(env) {
  const id = env.OPENSKY_CLIENT_ID;
  const secret = env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) {
    // Naming which binding is missing, without printing either value. An unset
    // binding and a wrong one are different problems and the message says which
    // this is (LESSONS 7c: an unset env var reported as a missing secret).
    const missing = [!id && 'OPENSKY_CLIENT_ID', !secret && 'OPENSKY_CLIENT_SECRET'].filter(Boolean).join(' and ');
    return { error: `traffic is not configured: ${missing} is not bound to this deployment` };
  }

  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret });
  let res;
  try {
    res = await politeFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    return { error: `OpenSky token endpoint unreachable: ${err.message}` };
  }
  if (!res.ok) {
    // Deliberately does NOT echo the upstream body: a token-endpoint error can
    // quote the request back at you.
    return { error: `OpenSky refused the client credentials (HTTP ${res.status})` };
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    return { error: `OpenSky token response was not JSON: ${err.message}` };
  }
  if (!payload?.access_token) return { error: 'OpenSky token response carried no access_token' };
  return { token: payload.access_token, expiresIn: Number(payload.expires_in) || TOKEN_TTL_SECONDS };
}

async function getToken(env, { forceRefresh = false } = {}) {
  const kv = env.FAUXPLANE_KV;
  if (!forceRefresh && kv) {
    const held = await kv.get(KV_TOKEN_KEY);
    if (held) return { token: held, cached: true };
  }
  const minted = await mintToken(env);
  if (minted.error) return minted;
  if (kv) {
    await kv.put(KV_TOKEN_KEY, minted.token, { expirationTtl: Math.min(TOKEN_TTL_SECONDS, minted.expiresIn) });
  }
  return { token: minted.token, cached: false };
}

function parseStates(payload, { lamin, lomin, lamax, lomax }) {
  const rows = Array.isArray(payload?.states) ? payload.states : [];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return rows
    .map((s) => ({
      icao24: typeof s[0] === 'string' ? s[0] : null,
      callsign: typeof s[1] === 'string' && s[1].trim() ? s[1].trim() : null,
      originCountry: typeof s[2] === 'string' ? s[2] : null,
      lastContact: num(s[4]),
      lon: num(s[5]),
      lat: num(s[6]),
      baroAltitudeM: num(s[7]),
      onGround: s[8] === true,
      velocityMs: num(s[9]),
      trackDeg: num(s[10]),
      verticalRateMs: num(s[11]),
      geoAltitudeM: num(s[13]),
      squawk: typeof s[14] === 'string' ? s[14] : null,
    }))
    .filter((a) => a.icao24 && a.lat !== null && a.lon !== null)
    .filter((a) => a.lat >= lamin && a.lat <= lamax && a.lon >= lomin && a.lon <= lomax);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const n = (name, fallback) => {
    const v = Number(url.searchParams.get(name));
    return Number.isFinite(v) ? v : fallback;
  };
  const box = {
    lamin: n('lamin', COLD_START_BBOX.lamin),
    lomin: n('lomin', COLD_START_BBOX.lomin),
    lamax: n('lamax', COLD_START_BBOX.lamax),
    lomax: n('lomax', COLD_START_BBOX.lomax),
  };
  if (box.lamin >= box.lamax || box.lomin >= box.lomax) return problem('bbox min must be less than max', { status: 400 });
  if (box.lamax - box.lamin > 6 || box.lomax - box.lomin > 6) {
    return problem('bbox is larger than 6 degrees on a side', { status: 400 });
  }

  const key = `/api/traffic?lamin=${box.lamin}&lomin=${box.lomin}&lamax=${box.lamax}&lomax=${box.lomax}`;

  return cached(request, key, POLICIES.traffic.cacheSeconds, async () => {
    const call = async (token) => {
      const upstream = new URL(STATES_URL);
      for (const [k, v] of Object.entries(box)) upstream.searchParams.set(k, String(v));
      return politeFetch(upstream.toString(), {
        headers: { authorization: `Bearer ${token}`, 'user-agent': USER_AGENT },
      });
    };

    let auth = await getToken(env);
    if (auth.error) return problem(auth.error, { status: 503 });

    let res;
    try {
      res = await call(auth.token);
    } catch (err) {
      return problem(`OpenSky unreachable: ${err.message}`);
    }

    // Exactly one refresh-and-retry on 401, as specified. A loop here would
    // hammer the token endpoint on a credential that has genuinely stopped
    // working.
    if (res.status === 401) {
      auth = await getToken(env, { forceRefresh: true });
      if (auth.error) return problem(auth.error, { status: 503 });
      try {
        res = await call(auth.token);
      } catch (err) {
        return problem(`OpenSky unreachable after token refresh: ${err.message}`);
      }
    }

    if (res.status === 429) {
      // A 429 is an instruction. politeFetch already waited out a Retry-After
      // if one was short enough; reaching here means we are being asked to back
      // off properly. Hold whatever the edge still has and say it is STALE —
      // never retry harder to get a fresher answer.
      const held = await caches.default.match(new Request(new URL(key, request.url).toString()));
      if (held) {
        const body = await held.json();
        return json({ ...body, ok: true, held: true }, { cacheSeconds: 0, stale: true });
      }
      return problem('OpenSky rate limit reached and nothing is held to show', { status: 429 });
    }

    if (!res.ok) return problem(`OpenSky returned HTTP ${res.status}`, { status: 502 });

    let payload;
    try {
      payload = await res.json();
    } catch (err) {
      return problem(`OpenSky returned a non-JSON body: ${err.message}`);
    }

    const aircraft = parseStates(payload, box);
    return json(
      {
        ok: true,
        source: POLICIES.traffic.source,
        sourceUrl: POLICIES.traffic.policyUrl,
        bbox: box,
        upstreamTime: typeof payload?.time === 'number' ? new Date(payload.time * 1000).toISOString() : null,
        fetchedAt: new Date().toISOString(),
        count: aircraft.length,
        aircraft,
      },
      { cacheSeconds: POLICIES.traffic.cacheSeconds },
    );
  });
}
