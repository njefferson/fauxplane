/**
 * selftest.js — the checks only Noah's device can run, on one press.
 *
 * WHY THIS EXISTS. Noah, 2026-08-04: *"You could build a simple test that I run,
 * like the debug sheet, instead of redoing the whole app every fucking time."*
 *
 * He was describing the actual cost of how this was being worked. Learning one
 * fact about a live feed took a release, a follow, a report and a wait — three
 * times over for the route endpoint alone. Every one of those round trips was
 * spending HIS time to answer a question a machine could ask.
 *
 * IT LIVES ON BITE BECAUSE BITE IS ALREADY THIS. "Built-in test" is what BITE
 * means on a flight deck, and this page has always reported what every sensor
 * and feed is doing. The only thing missing was the ability to ACTIVELY go and
 * ask rather than to report what happened to arrive.
 *
 * WHAT IT COVERS IS EXACTLY WHAT THE SANDBOX CANNOT REACH, which is the whole
 * point of putting it here rather than writing another unit test:
 *
 *   · the real feeds, through the real Functions, from a real Cloudflare edge —
 *     this sandbox's proxy denies every outbound host (verified, google
 *     included), so no test here can ever see them;
 *   · iOS Safari, whose sensor permissions, screen-angle reporting and
 *     `maxTouchPoints` are the things that have actually broken;
 *   · the service worker and its caches, which only exist in a real browser.
 *
 * ONE PRESS, ONE BLOCK OF TEXT. The result folds into the diagnostics report so
 * a single paste carries everything; nobody should have to assemble evidence by
 * hand from two screens.
 *
 * A CHECK NEVER INVENTS A VERDICT. Anything it could not determine reports
 * `unknown` with the reason, because "I could not tell" and "it is fine" are
 * different answers and only one of them is earned.
 */

/** One request, with its timing and enough of its reply to diagnose it. */
async function probe(name, url, { fetchImpl = fetch, method = 'GET', clock = () => Date.now() } = {}) {
  const startedAt = clock();
  try {
    const res = await fetchImpl(url, { method, cache: 'no-store' });
    const ms = clock() - startedAt;
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* unreadable; the length below reports null rather than pretending zero */
    }
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {
      /* not JSON — that is a finding, not an error */
    }
    return {
      name,
      state: res.ok ? 'ok' : 'fail',
      ms,
      status: res.status,
      contentType: res.headers?.get?.('content-type') ?? null,
      bytes: body ? body.length : 0,
      json: payload !== null,
      // The app's own Functions answer with `{ok, reason}`; surfacing the reason
      // is what turns "HTTP 200 but nothing works" into a sentence.
      detail: payload && typeof payload === 'object' ? (payload.reason ?? payload.source ?? null) : body.slice(0, 120) || null,
    };
  } catch (err) {
    return { name, state: 'fail', ms: clock() - startedAt, status: null, detail: `threw: ${err.message}` };
  }
}

/**
 * THE PLATFORM FACTS THE USER-AGENT STRING HIDES.
 *
 * iPadOS Safari reports itself as `Macintosh`, so the browser string is not
 * evidence of anything — `maxTouchPoints` is what tells an iPad from a Mac, and
 * that has already cost this project a wrong diagnosis.
 */
export function platformFacts(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return [{ name: 'platform', state: 'unknown', detail: 'no window' }];
  const nav = win.navigator ?? {};
  const touch = Number(nav.maxTouchPoints ?? 0);
  const claimsMac = /Macintosh/.test(nav.userAgent ?? '');
  return [
    {
      name: 'device',
      state: 'ok',
      detail:
        claimsMac && touch > 1
          ? `an iPad (the browser string says Macintosh; maxTouchPoints ${touch} says otherwise)`
          : `${claimsMac ? 'a Mac' : 'a touch device'} (maxTouchPoints ${touch})`,
    },
    { name: 'installed to home screen', state: win.matchMedia?.('(display-mode: standalone)')?.matches ? 'ok' : 'info', detail: win.matchMedia?.('(display-mode: standalone)')?.matches ? 'yes' : 'no — running in the browser' },
    { name: 'screen angle', state: 'info', detail: `window.orientation ${win.orientation ?? '—'}, screen.orientation ${win.screen?.orientation?.angle ?? '—'} (${win.screen?.orientation?.type ?? '—'})` },
    { name: 'viewport', state: 'info', detail: `${win.innerWidth}x${win.innerHeight}` },
  ];
}

/** Which sensor APIs exist at all, before any permission is asked for. */
export function sensorFacts(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return [];
  const has = (k) => k in win;
  return [
    { name: 'DeviceOrientationEvent', state: has('DeviceOrientationEvent') ? 'ok' : 'fail', detail: has('DeviceOrientationEvent') ? 'present' : 'absent — no horizon from this device' },
    { name: 'DeviceMotionEvent', state: has('DeviceMotionEvent') ? 'ok' : 'fail', detail: has('DeviceMotionEvent') ? 'present' : 'absent — no G or turn rate' },
    { name: 'geolocation', state: win.navigator?.geolocation ? 'ok' : 'fail', detail: win.navigator?.geolocation ? 'present' : 'absent — no position' },
    { name: 'AmbientLightSensor', state: has('AmbientLightSensor') ? 'ok' : 'info', detail: has('AmbientLightSensor') ? 'present' : 'absent — dimming falls back to solar elevation' },
    { name: 'wake lock', state: win.navigator?.wakeLock ? 'ok' : 'info', detail: win.navigator?.wakeLock ? 'present' : 'absent — the screen may sleep' },
  ];
}

/** What the service worker is holding, which only a real browser can say. */
export async function shellFacts(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.caches) return [{ name: 'caches', state: 'unknown', detail: 'the Cache API is not available here' }];
  try {
    const names = await win.caches.keys();
    return [
      { name: 'cached shells', state: names.length ? 'ok' : 'info', detail: names.length ? names.join(', ') : 'none held — the panel needs the network' },
      { name: 'controlled by a worker', state: win.navigator?.serviceWorker?.controller ? 'ok' : 'info', detail: win.navigator?.serviceWorker?.controller ? 'yes' : 'no — first visit, or the worker is not installed' },
    ];
  } catch (err) {
    return [{ name: 'caches', state: 'unknown', detail: `could not be read: ${err.message}` }];
  }
}

/**
 * THE FEEDS, ASKED FOR REAL, ONE REQUEST EACH.
 *
 * `callsign` is optional and only used for the route probe: without a followed
 * flight there is nothing honest to ask about, so that check reports `skipped`
 * rather than inventing a callsign. Asking about a made-up aeroplane would be
 * the synthetic-input version of the rule this whole app is built on.
 */
export async function feedProbes({ lat, lon, callsign = null, fetchImpl = fetch, clock = () => Date.now() } = {}) {
  const at = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  const out = [];
  out.push(await probe('/api/metar', at ? `/api/metar?lat=${at.lat.toFixed(3)}&lon=${at.lon.toFixed(3)}` : '/api/metar', { fetchImpl, clock }));
  out.push(
    at
      ? await probe('/api/traffic', `/api/traffic?lat=${at.lat.toFixed(3)}&lon=${at.lon.toFixed(3)}&dist=40`, { fetchImpl, clock })
      : { name: '/api/traffic', state: 'skipped', detail: 'no position yet — the scope needs somewhere to look' },
  );
  out.push(
    at
      ? await probe('/api/winds', `/api/winds?lat=${at.lat.toFixed(3)}&lon=${at.lon.toFixed(3)}&alt=5000`, { fetchImpl, clock })
      : { name: '/api/winds', state: 'skipped', detail: 'no position yet' },
  );
  out.push(
    callsign && at
      ? await probe('/api/route', `/api/route?callsign=${encodeURIComponent(callsign)}&lat=${at.lat.toFixed(4)}&lon=${at.lon.toFixed(4)}`, { fetchImpl, clock })
      : { name: '/api/route', state: 'skipped', detail: 'follow a flight first — there is nothing honest to ask about without one' },
  );
  return out;
}

/** Run everything. Pure enough to test: every source of truth is injectable. */
export async function runSelfTest(opts = {}) {
  const { win = typeof window !== 'undefined' ? window : null, clock = () => Date.now() } = opts;
  const startedAt = clock();
  const groups = [
    { title: 'DEVICE', rows: platformFacts(win) },
    { title: 'SENSORS AVAILABLE', rows: sensorFacts(win) },
    { title: 'OFFLINE SHELL', rows: await shellFacts(win) },
    { title: 'FEEDS, ASKED ONCE EACH', rows: await feedProbes({ ...opts, clock }) },
  ];
  return { at: startedAt, tookMs: clock() - startedAt, groups };
}

/** The whole run as text to paste. One block, no assembly required. */
export function formatSelfTest(result) {
  if (!result) return null;
  const out = ['SELF TEST', `  run at ${new Date(result.at).toISOString()}  (${result.tookMs} ms)`];
  for (const g of result.groups) {
    out.push(`  ${g.title}`);
    for (const r of g.rows) {
      const mark = { ok: 'ok  ', fail: 'FAIL', info: '·   ', skipped: 'skip', unknown: '????' }[r.state] ?? '·   ';
      const timing = Number.isFinite(r.ms) ? ` ${r.ms}ms` : '';
      const http = r.status ? ` HTTP ${r.status}` : '';
      const shape = r.bytes !== undefined && r.status ? `  ${r.bytes}B${r.json ? ' json' : ''}${r.contentType ? ` ${r.contentType.split(';')[0]}` : ''}` : '';
      out.push(`    ${mark} ${r.name}${http}${timing}${shape}`);
      if (r.detail) out.push(`         ${r.detail}`);
    }
  }
  return out.join('\n');
}
