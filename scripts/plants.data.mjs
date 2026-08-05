/**
 * plants.data.mjs — WHAT to break, and nothing about HOW.
 *
 * SPLIT OUT OF plant.mjs ON 2026-08-04, and the reason is a scheduling one
 * rather than a tidiness one.
 *
 * `plant.mjs --changed` runs only the plants whose target file moved, and it
 * ESCALATES to the whole sweep whenever a file changes that could blunt a plant
 * which does not name it — the gates, the store, the renderers. The harness was
 * on that list, correctly: editing the code that injects and restores faults
 * can break any plant at all.
 *
 * But almost every release ADDS a plant, so almost every release touched the
 * harness file and escalated, and the selector saved nothing on exactly the
 * changes it was built for. Noah, 2026-08-04: "I think you are wasting a lot of
 * time." He was right twice — once about the sweeps, and once about a fix that
 * did not reach the common case.
 *
 * So: this file is DATA. Adding or editing a plant here cannot change how any
 * other plant is injected, restored or judged, so it does not escalate.
 * `plant.mjs` is CODE and stays on the escalation list, where it belongs.
 *
 * KEEP IT THAT WAY. Nothing in here may import, branch, or compute — the moment
 * a plant's `find` string is built rather than written, this file stops being
 * data and the escalation rule it exists to satisfy is quietly false.
 *
 * Each plant names the check it is aiming at, the edit that should break it,
 * and a pattern the gate's output must match. `expect` is deliberately
 * specific: matching only "FAIL" would pass on any failure at all.
 *
 * `gate` is 'a11y' (the default) or 'tests'. Sensor-logic plants MUST use
 * 'tests' — a headless browser has no accelerometer, so the accessibility gate
 * is structurally blind to them and would stay green.
 */
export const PLANTS = [
  {
    name: 'contrast: the build stamp is dimmed below the floor',
    check: 'contrast registry, measured from real pixels',
    file: 'public/styles.css',
    find: '  font-size: 0.8125rem;\n  color: var(--text-3);\n  cursor: pointer;',
    replace: '  font-size: 0.8125rem;\n  color: #3f3f3f;\n  cursor: pointer;',
    expect: /build stamp measured \d+\.\d+:1 against the real backdrop/,
  },
  {
    name: 'contrast: the build stamp is dimmed with opacity instead of a token',
    check: 'opacity is invisible to a contrast gate',
    file: 'public/styles.css',
    find: '  color: var(--text-3);\n  cursor: pointer;\n  user-select: text;',
    replace: '  color: var(--text-3);\n  opacity: 0.35;\n  cursor: pointer;\n  user-select: text;',
    expect: /build stamp: dimmed with opacity/,
  },
  {
    name: 'registry: a registered class is renamed',
    check: 'a selector matching nothing FAILS, it is never skipped',
    file: 'public/src/panels/bite.js',
    find: "const reason = el('p', { class: 'bite-reason' });",
    replace: "const reason = el('p', { class: 'bite-why' });",
    expect: /contrast registry selector matched nothing: \.bite-reason/,
  },
  {
    name: 'targets: a control drops under the 44px floor',
    check: 'touch target size',
    file: 'public/styles.css',
    find: '.koll-btn {\n  min-width: var(--target);\n  min-height: var(--target);',
    replace: '.koll-btn {\n  min-width: 30px;\n  min-height: 30px;\n  height: 30px;',
    expect: /target <button> ".*" is \d+x\d+, under the 44px floor/,
  },
  {
    name: 'no-synthetic-data: a FAILED readout shows a number anyway',
    check: 'acceptance criterion 1 — no digits with every permission denied',
    file: 'public/src/render/dom.js',
    find: "valueNode.textContent = !field || p === 'FAIL' ? '— — —' : format(field.value);",
    replace: "valueNode.textContent = !field || p === 'FAIL' ? '0' : format(field.value);",
    expect: /is FAIL but is still showing digits/,
  },
  {
    name: 'honesty: a failure stops explaining itself',
    check: 'every FAIL carries a reason',
    file: 'public/src/render/dom.js',
    find: "reasonNode.textContent = p === 'FAIL' ? (field?.reason ?? 'no reading') : '';",
    replace: "reasonNode.textContent = '';",
    expect: /is FAIL with no reason/,
  },
  {
    name: 'secrets: a credential is inlined into a client module',
    check: 'acceptance criterion 2 — nothing secret in the client bundle',
    file: 'public/src/data/traffic.js',
    find: "import { REGION } from '../core/region.js';",
    replace: "const client_secret = 'a5f3c9d2e7b14806aa93';\nimport { REGION } from '../core/region.js';",
    expect: /matches a secret pattern/,
  },
  {
    name: 'client egress: a module calls a third-party host directly',
    check: 'every third-party call goes through /api/*',
    file: 'public/src/data/metar.js',
    find: "export const FALLBACK_ALTIMETER_INHG = 29.92;",
    replace: "export const FALLBACK_ALTIMETER_INHG = 29.92;\nexport const DIRECT = 'https://aviationweather.gov/api/data/metar';",
    expect: /references aviationweather\.gov directly/,
  },
  {
    // The old plant here removed the power gate's second dismiss control. There
    // is no gate any more — the panel opens as itself with a PWR switch on it —
    // so the property worth breaking changed with it. A two-state control that
    // does not declare itself a switch is the new failure: a screen reader
    // announces a button, the reader is never told whether the panel is on, and
    // the state word alone cannot be queried.
    name: 'panel power: the switch stops declaring that it is a switch',
    check: 'the power control is a real two-state switch, and says which state it is in',
    file: 'public/index.html',
    find: '<button type="button" role="switch" aria-checked="false" id="power-btn" class="power-btn">',
    replace: '<button type="button" id="power-btn" class="power-btn">',
    expect: /role "null" — a two-state control is a switch|aria-checked/,
  },
  {
    // adsb.fi's terms REQUIRE the citation. A licence condition nobody watches
    // fail is a condition that quietly lapses in the next tidy-up — which is
    // the whole reason this file exists.
    name: 'attribution: the citation the providers\u2019 terms require stops being a link',
    check: 'the radar page links whichever source answered, as a condition of use',
    file: 'public/src/panels/radar.js',
    find: "            ? el('a', { class: 'radar-credit-link', href: home, rel: 'noopener', text: name })",
    replace: "            ? el('span', { class: 'radar-credit-link', text: name })",
    expect: /is not a link|renders no source citation|require/,
  },
  {
    // THE REGRESSION THIS RELEASE IS ABOUT. A gyro with an ordinary zero-offset
    // used to hold the filter at a permanent standoff, so `converged` never
    // became true and the horizon stayed crossed out for as long as anyone
    // watched. Removing the integral term puts that back exactly.
    //
    // Checked against the UNIT SUITE, not the accessibility gate: a headless
    // browser has no accelerometer, so the gate sees FAIL either way and would
    // stay green through this. Planting it against the gate would have "passed"
    // while proving nothing.
    name: 'attitude: the gyro zero-offset stops being learned',
    check: 'an ordinary gyro offset does not hold the horizon crossed out',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    const ki = explainable ? cfg.biasKi * (gain / (1 - cfg.alpha)) : 0;',
    replace: '    const ki = 0;',
    expect: /never converged|zero-offset|horizon vanished|estimated at/,
  },
  {
    // The other half of the same claim: attitude must reach the panel from
    // gravity alone, without waiting for the gyro to settle.
    name: 'attitude: the horizon goes back to waiting on convergence',
    check: 'a usable gravity attitude is published without waiting for the gyro',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '      const hasAttitude = pitch !== null && roll !== null && !stale;',
    replace: '      const hasAttitude = pitch !== null && roll !== null && !stale && converged;',
    expect: /no attitude after a good gravity sample|hasAttitude/,
  },
  {
    // The diagnostics report exists so nobody has to read pixels off a photo.
    // If it silently stops carrying the diagnosis, the whole reason for it is
    // gone and nothing else on screen would look different.
    name: 'diagnostics: the report stops leading with what is failing',
    check: 'one tap on the version stamp produces a usable diagnosis',
    file: 'public/src/panels/diagnostics.js',
    find: "  line(\n    `WHAT IS NOT WORKING",
    replace: "  line(\n    `panel state",
    expect: /does not lead with what is failing/,
  },
  {
    // THE MOST LIKELY WAY THIS FEATURE ROTS, and it rots into a lie rather than
    // into a blank. adsb.lol infer a route from the callsign and call it
    // PLAUSIBLE. Strip that word and "KSFO → KJFK" reads, to the person this
    // app is actually built for, as the flight plan the crew filed. The banner
    // is cramped, the caveat is the longest thing in it, and deleting it is the
    // obvious tidy — so the gate has to be the thing that says no.
    name: 'route: the plausible-route caveat is tidied out of the banner',
    check: 'an inferred route never appears without the word that makes it an inference',
    file: 'public/src/app.js',
    find: '    followRouteCaveat.hidden = !line || !caveat;',
    replace: '    followRouteCaveat.hidden = true;',
    expect: /caveat|plausible/i,
  },
  {
    // The self test exists so Noah stops paying a release per fact. A
    // diagnostic that LIES is worse than none, because it is believed — and the
    // specific lie worth guarding is calling a check that never ran a pass.
    name: 'selftest: a check that was skipped is reported as a pass',
    check: 'not asked and answered are different facts',
    gate: 'tests',
    file: 'public/src/panels/selftest.js',
    find: "      : { name: '/api/route', state: 'skipped', detail: 'follow a flight first",
    replace: "      : { name: '/api/route', state: 'ok', detail: 'follow a flight first",
    expect: /skipped|follow a flight first/i,
  },
  {
    // Noah, 2026-08-04: "Why does every runway look exactly the same even at
    // different scales?" The width was `max(1.5, min(5, len * 0.06))` and
    // `len * 0.06` never reaches 1.5 at any size a real runway draws — so it
    // was pinned at 1.5 for every runway at every range, forever. Putting a
    // constant back is the defect.
    name: 'runways: the width goes back to a constant hairline',
    check: 'a runway is drawn as a strip whose width varies with its size',
    gate: 'tests',
    file: 'public/src/render/gauges/plan.js',
    find: '  return Math.max(2, Math.min(7, len * 0.13));',
    replace: '  return Math.max(1.5, Math.min(5, len * 0.06));',
    expect: /same width|hairline|pinned at 1\.5/i,
  },
  {
    // FOUND BY THE FIRST RUN OF invariants.test.mjs, not by a person. The
    // followed aircraft was `list[0]` — whatever came back, adopted without
    // checking it was the aircraft we asked about. Real numbers, real
    // provenance, real timestamps, WRONG AEROPLANE, and invisible.
    name: 'identity: a broadcast is adopted without checking which aircraft it is',
    check: 'the answer is about the aircraft we asked about',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: '      const want = followKey.value.trim().toUpperCase();',
    replace: "      const want = String(list[0]?.callsign ?? '').trim().toUpperCase();",
    expect: /present or imply a different aircraft|answered about/i,
  },
  {
    // Noah's first real route probe came back HTTP 201 — the shape was
    // ACCEPTED — and the report could only say "no readable keys", which
    // cannot tell an empty body from a non-JSON one from valid JSON of an
    // unexpected shape. A probe that reports a status without the body is half
    // a probe, and it cost a full round trip through his device to learn it.
    name: 'probe: the route probe stops carrying the raw body',
    check: 'a probe reports the body, not just the status',
    gate: 'tests',
    file: 'functions/api/route.js',
    find: "    bodyPrefix: typeof raw === 'string' ? raw.slice(0, 400) : null,",
    replace: '    bodyPrefix: null,',
    expect: /raw text is the evidence|bodyPrefix|doctype/i,
  },
  {
    // From the same report: following N81AB with every field reading "waiting
    // for the first report from N81AB", while attitude.heading still read
    // "N460DF is not broadcasting a heading". The panel was naming an aircraft
    // it was no longer following.
    name: 'honesty: heading keeps the PREVIOUS aircraft name after a switch',
    check: 'no field names an aircraft the panel is not following',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: "        state.fail('attitude.heading', why);\n        return;",
    replace: '        return;',
    expect: /switching aircraft clears the previous one/i,
  },
  {
    // Noah, 2026-08-04: the mark at the top of the (i) panel "does not match
    // the app's icon close enough, and looks like an error because it is
    // different." A LOOKALIKE is the defect — the only version that cannot
    // drift from the icon on his home screen is the identical file, so the
    // panel points at the manifest's own icon and the gate checks that.
    name: 'identity: the panel mark drifts to a lookalike of the app icon',
    check: 'the mark is the SAME icon file the manifest declares',
    file: 'public/index.html',
    find: '        <img class="gate-mark" src="/icons/icon.svg" alt="" width="88" height="88" />',
    replace: '        <img class="gate-mark" src="/icons/icon-192.png" alt="" width="88" height="88" />',
    expect: /manifest's icon|lookalike|app mark/i,
  },
  {
    // Noah, looking at NO CONTACT above "Standing off ... for a moment":
    // "No indication of how long I'll wait before the radar will work…like the
    // delay countdown, maybe?…. Just looks broken." A wait with no number is
    // indistinguishable from a hang, and the app knew the number all along.
    name: 'radar: the countdown stops being shown while the scope waits',
    check: 'a waiting scope says when it will ask again',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: '  const retry = Number.isFinite(nextAttemptInS) && nextAttemptInS > 0 ? `RETRY ${Math.ceil(nextAttemptInS)}s` : null;',
    replace: '  const retry = null;',
    expect: /RETRY|Asking again/i,
  },
  {
    // The other half, and the one that would be a LIE rather than an omission:
    // a countdown that promises the radar will WORK. We control when we ask;
    // we do not control the answer, and the next one may be another refusal.
    name: 'radar: the countdown promises a working scope rather than a request',
    check: 'the countdown commits only to the attempt',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: "  const retrySentence = retry ? ` Asking again in ${Math.ceil(nextAttemptInS)}s.` : '';",
    replace: "  const retrySentence = retry ? ` Working again in ${Math.ceil(nextAttemptInS)}s.` : '';",
    expect: /will work|working in|Asking again/i,
  },
  {
    // The server's half. "up to 600s" is the length as RECORDED and never
    // shrinks, so nine minutes into a ten-minute wait it still said 600s.
    name: 'standoff: the wait reports its original length instead of what is left',
    check: 'the stand-off phrase counts down',
    gate: 'tests',
    file: 'functions/api/_lib.js',
    find: '  if (r < 60) return `not asking again for ${r}s`;',
    replace: '  if (r < 60) return `not asking again for ${cool.seconds}s`;',
    expect: /45s|600|remaining|left/i,
  },
  {
    // FROM NOAH'S 1.21.1 DIAGNOSTICS REPORT. The panel said attitude.heading
    // had failed because "this device reports no magnetic heading" — three
    // lines above a raw block reading `webkitCompassHeading 278.3`. His iPhone
    // has a compass; it had stopped SENDING while the page was backgrounded.
    // A confident wrong sentence is worse than a wrong number: a wrong number
    // looks wrong, and this one sends the reader off to replace working
    // hardware.
    name: 'honesty: a quiet compass is reported as a device that has none',
    check: 'a reason string never invents a fact about the reader’s hardware',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: "          heading === null\n            ? 'this device reports no magnetic heading'",
    replace: "          true\n            ? 'this device reports no magnetic heading'",
    expect: /fabricated fact|no magnetic heading|stopped updating/i,
  },
  {
    // The same report: every followed field reading "waiting for the first
    // report from PXT466", under a banner asserting that aircraft's broadcast
    // was on screen. It was showing nothing. That sentence sits at the top of a
    // panel of red crosses and is why it "looks broken without any data".
    name: 'honesty: the follow banner claims a broadcast that never arrived',
    check: 'the banner does not claim data the panel does not have',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: '  if (followed) return `${label} — this panel is showing that aircraft\'s broadcast, not this device`;',
    replace: '  return `${label} — this panel is showing that aircraft\'s broadcast, not this device`;',
    expect: /never arrived|no broadcast received|showing that aircraft/i,
  },
  {
    // NOAH PHOTOGRAPHED THIS: following DAL2229, every instrument crossed out
    // at once, PWR ON. "This aircraft makes the whole display look broken
    // without any data, despite being 'turned on.'" The followed fields were
    // aged on the registry's SENSOR windows — heading's staleMs is 5 s because
    // a magnetometer updates many times a second, and the follow poll is 10 s.
    // A field cannot survive a limit shorter than the cadence that fills it.
    name: 'follow: the broadcast is aged on a sensor window it cannot possibly meet',
    check: 'a followed field outlives the poll that fills it',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: '        state.write(path, value, { at, reason: from, windows: FOLLOW_WINDOWS });',
    replace: '        state.write(path, value, { at, reason: from });',
    expect: /window|freshness|sensor window/i,
  },
  {
    // AN INDICATOR THAT STOPS TRACKING IS WORSE THAN NO INDICATOR, because the
    // reader now trusts it. Noah asked for this precisely so he could tell a
    // filling scope from a finished one; a frozen chip answers every question
    // with the same word and looks authoritative doing it.
    //
    // NOTE ON A PLANT THAT DID NOT WORK. The first version of this deleted the
    // `readiness.tappable` guard from the tap handler — and the gate stayed
    // GREEN, correctly: in the scenario the gate drives, the tap succeeds
    // either way, so removing a guard that was not blocking anything changes
    // nothing observable. A plant has to break something the check can SEE.
    name: 'radar: the readiness indicator freezes instead of tracking the scope',
    check: 'the indicator says which state the scope is actually in',
    file: 'public/src/panels/radar.js',
    find: '      readyChip.textContent = readiness.label;\n      readyChip.dataset.state = readiness.state;',
    replace: "      readyChip.textContent = 'CONTACT';\n      readyChip.dataset.state = 'contact';",
    expect: /indicator still reads|must name the aircraft/i,
  },
  {
    // SHIPPED IN 1.21.0 AND FIXED IN 1.21.1. Keying the route feed's cooldown
    // as `adsb.lol:route` reads like careful scoping and is the opposite:
    // adsb.lol rate limit per IP across their whole API, so a per-endpoint
    // standoff is no standoff. A 429 earned by a route request never told the
    // traffic feed to back off, and the visible symptom was not a missing
    // route — it was an EMPTY SCOPE, because the aircraft feed is the one
    // running every ten seconds.
    name: 'etiquette: the route feed gets a private cooldown the traffic feed cannot see',
    check: 'a refusal stands the whole PROVIDER down, not one endpoint',
    gate: 'tests',
    file: 'functions/api/route.js',
    find: '        ROUTE_SOURCE.id,\n        cooldownSeconds(res.status, after),',
    replace: '        `${ROUTE_SOURCE.id}:route`,\n        cooldownSeconds(res.status, after),',
    expect: /provider|standoff|stand-off/i,
  },
  {
    // The synthetic-data path this parser could grow. One airport is not a
    // route, and an off-by-one here turns "KSAC" into "KSAC → KSAC" — a
    // departure and arrival at the same field, invented by arithmetic rather
    // than reported by anyone.
    name: 'route: one airport is dressed up as a route to nowhere',
    check: 'the route parser refuses a partial answer instead of completing it',
    gate: 'tests',
    file: 'functions/api/route.js',
    find: '  if (places.length < 2) {',
    replace: '  if (places.length < 1) {',
    expect: /one airport|route/i,
  },
  {
    // Mount levelling moves what the instrument calls zero. That is legitimate
    // and it is exactly why it must be visible: a horizon reading level at an
    // attitude the device is not at, with nothing saying so, is the most
    // plausible-looking wrong instrument this app could ship.
    name: 'levelling: the panel stops saying its zero has been moved',
    check: 'a levelled horizon declares the offset on its own face',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    get mountOffset() {\n      if (!mountRef) return null;',
    replace: '    get mountOffset() {\n      return null;\n      // eslint-disable-next-line no-unreachable\n      if (!mountRef) return null;',
    expect: /the offset must be reportable|mountOffset/,
  },
  {
    // The iPad defect. Believing screen.orientation.angle put the horizon
    // ninety degrees over in every orientation, and no test could see it
    // because every device tried until then was in portrait.
    name: 'orientation: the screen angle goes back to trusting the lying API',
    check: 'the screen angle comes from the source that told the truth on iOS',
    gate: 'tests',
    file: 'public/src/sensors/orientation.js',
    find: '  if (Number.isFinite(windowOrientation)) {',
    replace: '  if (false && Number.isFinite(windowOrientation)) {',
    expect: /window\.orientation|iPad/i,
  },
  {
    // The other half: the rotation itself was applied backwards, invisible for
    // two releases because portrait makes it the identity.
    name: 'orientation: the screen rotation is applied backwards again',
    check: 'a quarter turn moves earth-up to the screen axis it should',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '  let sx = (x * c - y * s) / m;\n  let sy = (x * s + y * c) / m;',
    replace: '  let sx = (x * c + y * s) / m;\n  let sy = (-x * s + y * c) / m;',
    expect: /quarter turn was applied backwards|held square is not banked/,
  },
  {
    // The escape hatch that got Noah's iPad off 0.4.1. Its dangerous direction
    // is the FALSE POSITIVE: it can force a reload, so a version of it that
    // fires when it should not is a reload loop, which is worse than the stale
    // panel. Planting the loosened condition proves the tests still object.
    name: 'stale worker: the escape hatch starts reloading when it should not',
    check: 'a first visit, the current release and a half-installed worker are all left alone',
    gate: 'tests',
    file: 'public/boot.js',
    find: '  if (!mine.length) return [];\n  if (!liveVersion || mine.includes(PREFIX + liveVersion)) return [];',
    replace: '  if (!liveVersion) return [];',
    expect: /first visit|installing is left alone|current release/,
  },
  {
    // The other direction: the hatch stops finding a genuinely stuck device and
    // the loop that stranded the iPad for two releases comes straight back.
    name: 'stale worker: the escape hatch stops detecting an old release',
    check: 'a worker from an older release is detected',
    gate: 'tests',
    file: 'public/boot.js',
    find: '  return mine;\n}',
    replace: '  return [];\n}',
    expect: /older release is detected/,
  },
  {
    // The report is the tool for diagnosing a broken device, so the state it
    // must survive is "nothing works". `undefined?.provenance !== 'FAIL'` is
    // true, and that optional chain took the whole report down on any device
    // that never got a position fix.
    name: 'diagnostics: the report throws on a device with no position fix',
    check: 'a device that never got a fix still gets a report',
    gate: 'tests',
    file: 'public/src/panels/diagnostics.js',
    find: "&& field && field.provenance !== 'FAIL'",
    replace: "&& field?.provenance !== 'FAIL'",
    expect: /never got a position fix|Cannot read properties of undefined/,
  },
  {
    // Zero is a measurement. Going back to crossing groundspeed out because the
    // platform handed us null is the exact defect Noah found.
    name: 'stationary: groundspeed goes back to failing instead of reading zero',
    check: 'a receiver sitting still reads zero, not a failure',
    gate: 'tests',
    file: 'public/src/core/derive.js',
    find: '  return { speedMs, floorMs, dt, moving: speedMs > floorMs };',
    replace: '  return { speedMs, floorMs, dt, moving: true };',
    expect: /jitter inside the accuracy bound is not motion|not moving/,
  },
  {
    // The zero-velocity update. Without it an integrator reads every shake as
    // the start of a climb, which is what crossed the VSI out on a desk.
    name: 'stationary: the zero-velocity update stops being applied',
    check: 'a wiggle is not integrated into a climb',
    gate: 'tests',
    file: 'public/src/core/derive.js',
    find: '      rateFpm = 0;\n      lastAccelAt = at;\n      reason = null;\n      stationaryAt = at;',
    replace: '      stationaryAt = null;',
    expect: /wiggle|shaken desk|no net vertical speed|stationary/,
  },
  {
    // The exact defect that shipped: tokens read while the page was hidden get
    // cached, so every gauge on it draws in the missing-token sentinel colour.
    // Caught by the ACCESSIBILITY gate, because it is the only thing that runs
    // a real browser and can read pixels back out of a canvas.
    name: 'canvas: token reads taken while hidden are cached again',
    check: 'no gauge draws in the missing-token magenta',
    file: 'public/src/render/canvas.js',
    find: '    tokens = complete ? out : null;',
    replace: '    tokens = out;',
    expect: /missing-token magenta/,
  },
  {
    // A rejected sample means the device is being thrown around. Leaving
    // `still` set through that told the ZUPT a manoeuvring aircraft was
    // stationary, which would zero a real climb.
    name: 'stillness: a rejected manoeuvring sample stops clearing stillness',
    check: 'a shove genuinely registers as motion',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '      stillSince = null;\n      return;\n    }\n\n    rejecting = false;',
    replace: '      return;\n    }\n\n    rejecting = false;',
    expect: /must genuinely register as motion|still/,
  },
  {
    // Levelling must not depend on the calmest instant being the instant of
    // the press, which is the instant the finger lands.
    name: 'levelling: the filter stops remembering when it was last still',
    check: 'the pre-touch reference survives the press',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '      lastStillAttitude = { pitch: solved.pitch, roll: solved.roll, at };',
    replace: '      lastStillAttitude = null;',
    expect: /still attitude|pre-touch reference/,
  },
  {
    // A CDN block page is HTML. Pasting its head onto a gauge says
    // "<!DOCTYPE html> <!--[if lt IE 7]>" and truncates before the error code,
    // which is the only part that decides what to do next.
    name: 'upstream: the raw block page is pasted onto the gauge again',
    check: 'a refused upstream names the CDN, the reason and the code',
    gate: 'tests',
    file: 'functions/api/traffic.js',
    find: '    const title = /<title[^>]*>([^<]{1,160})<\\/title>/i.exec(body);',
    replace: '    const title = null && body;',
    expect: /restrict access|no markup at all|no doctype/,
  },
  {
    // Chained derived values compose their reasons, so the quoting nests. Three
    // levels deep it was a paragraph of parentheses on the face of a gauge, and
    // the one fact underneath was the part hardest to find.
    name: 'reasons: a failure reason goes back to nesting its parentheses',
    check: 'a chained failure reads as one sentence naming the root cause',
    gate: 'tests',
    file: 'public/src/core/provenance.js',
    find: '    const root = rootCause(raw) || \'missing\';',
    replace: '    const root = raw;',
    expect: /no nested parenthesis|no doubled name prefix|one sentence|not yet initialised/,
  },
  {
    // Nineteen aircraft, a dozen in one quadrant, labels overprinted into a
    // smear that reads as corruption rather than density. The gate cannot see
    // inside a canvas, so the unit suite is the only thing that can catch this.
    name: 'plan: aircraft labels go back to overprinting each other',
    check: 'no two labels on the plan view overlap',
    gate: 'tests',
    file: 'public/src/render/gauges/plan.js',
    find: '      if (placed.some((q) => overlaps(q, box))) continue;',
    replace: '      // collision check removed',
    expect: /overlap|smear/,
  },
  {
    // Re-added after the harness was fixed. It could not be proven before: the
    // test asserted on a null reason, which throws a TypeError instead of an
    // assertion, so the expected regex never appeared in the output at all.
    name: 'resolution: the vertical speed stops saying what it cannot resolve',
    check: 'a rate under the GPS resolution keeps its value and gains the bound',
    gate: 'tests',
    file: 'public/src/core/derive.js',
    find: '          { ...meta, reason: `GPS altitude resolves no better than ±${Math.round(floor).toLocaleString()} fpm here` },',
    replace: '          meta,',
    expect: /resolves no better than/,
  },
  {
    // A horizon that trembles on a desk reads as an instrument that is not
    // working, whatever the numbers say. The static gain is right for ALIGNING
    // and wrong for holding.
    name: 'jitter: the aligned filter goes back to the alignment gain',
    check: 'an aligned, still horizon does not wander on accelerometer noise',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    // RE-ANCHORED 2026-08-03: adding the conceded-gate branch rewrote this
    // expression into a nested ternary, so the old one-line anchor stopped
    // matching and this plant silently went STALE — the THIRD time an anchor
    // has drifted in this file. A plant whose anchor no longer matches proves
    // nothing while still looking like coverage, which is why the harness
    // reports STALE loudly rather than skipping it.
    find: '        ? aligned\n          ? 1 - cfg.settledAlpha\n          : 1 - cfg.staticAlpha',
    replace: '        ? aligned\n          ? 1 - cfg.staticAlpha\n          : 1 - cfg.staticAlpha',
    expect: /settling made no difference/,
  },
  {
    // Blanking the plan view on a failed refresh tells the reader the sky is
    // empty. sw.js refuses to invent an empty sky for exactly this reason and
    // this path was doing it anyway.
    name: 'radar: a failed refresh empties the plan view again',
    check: 'a failed refresh keeps the aircraft already on the plan view',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    // RE-ANCHORED 2026-08-03: the single-radius fetch introduced `allNearby`,
    // so the old two-line anchor stopped matching and this plant silently went
    // UNPROVEN. A plant whose anchor has drifted proves nothing while still
    // looking like coverage — the second time that has happened in this file.
    find: '      if (result.ok) {\n        // Everything the fetch returned, kept whole so a range change can be',
    replace: '      allNearby = result.ok ? withRangeAndBearing(result.aircraft ?? [], centre) : [];\n      nearby = withinRange(allNearby, display);\n      if (result.ok) {\n        // Everything the fetch returned, kept whole so a range change can be',
    expect: /failed refresh emptied the sky/,
  },
  {
    // The first surface a new reader sees. If the orientation is dropped, the
    // gate still asks for sensor permissions from somebody who has not been
    // told what the thing is.
    name: 'first run: the new-reader orientation is dropped from the gate',
    check: 'the power gate tells a first-time reader what this is and how to install it',
    file: 'public/index.html',
    // Anchored on the page LIST, not on a heading: two headings share
    // `.gate-first-h`, so removing one leaves the selector matching the other
    // and the gate stays green. A registry row guards a class only while that
    // class has one reason to exist — which is worth knowing about every row
    // in there, not just this one.
    find: '<dl class="gate-pages">',
    replace: '<dl class="gate-pages-gone">',
    expect: /matched nothing: \.gate-pages dt/,
  },
  {
    // THE ROCKET. Leaning a hand-held phone swings the accelerometer's
    // direction while its magnitude stays near one g, so the magnitude gate
    // never fires and the horizon follows the corruption. Only the unit suite
    // can see this — a headless browser has no accelerometer.
    name: 'attitude: the direction gate stops rejecting corrupted gravity',
    check: 'a lean with a corrupted accelerometer tracks the gyro, not the corruption',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    if (aligned && !stillHeld && disagreeDeg > cfg.accelGateDeg) {',
    replace: '    if (false) {',
    expect: /gated horizon is|the gate made no difference/,
  },
  {
    // Two range controls, one value. Break the PFD side's wiring and the two
    // surfaces show two different ranges — checked as rendered, by clicking
    // one and reading the other.
    name: 'range: the PFD control stops driving the shared range',
    check: 'range set on the PFD reaches the radar page',
    file: 'public/src/app.js',
    find: "    b.addEventListener('click', () => radar.setRange(nm));",
    replace: "    b.addEventListener('click', () => b.setAttribute('aria-pressed', 'true'));",
    expect: /did not reach the radar page/,
  },
  {
    // Power-on used to throw the first-run instructions away mid-read, so the
    // node was moved rather than destroyed. RE-ANCHORED 2026-08-03: there is no
    // gate any more — the panel opens as itself with a PWR switch on it — and
    // the destination changed from the SETUP page to the (i) menu, at boot
    // rather than on dismissal. The INVARIANT is unchanged: the instructions
    // survive and are findable. Only the place they survive INTO moved.
    name: 'first run: the orientation never reaches the (i) menu',
    check: 'the first-run instructions survive into the (i) menu',
    file: 'public/src/app.js',
    find: "  info.adoptFirstRun($('first-run-store')?.querySelector('.gate-first'));",
    replace: "  $('first-run-store')?.querySelector('.gate-first')?.remove();",
    expect: /did not survive into the \(i\) menu|first-run instructions/,
  },
  {
    // THE PICKER'S DANGEROUS FAILURE is not an empty list — that is visible.
    // It is the scope relabelling itself KSMF while the feed is still being
    // asked about this desk, so the panel shows the aircraft over a house
    // under an airport's name. Only re-asking the feed makes it true, so the
    // plant severs exactly that and nothing else.
    name: 'centre picker: choosing an airport stops re-asking the feed',
    check: 'the traffic query moves to the chosen airport, not just the label',
    file: 'public/src/panels/radar.js',
    find: '    onCentreChange();',
    replace: '    // onCentreChange();',
    expect: /did not re-ask the traffic feed|still asked about/,
  },
  {
    // The centre's short name is drawn by two scopes and owned by neither
    // until radarCentre supplied it. Removing it puts HOME back under the
    // crosshair of a scope centred on an airport — the label contradicting the
    // status line three lines below it.
    name: 'centre picker: the crosshair goes back to saying HOME',
    check: 'the crosshair names the chosen airport',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: "      short: chosen.short ?? chosen.label ?? 'CHOSEN',",
    replace: '',
    expect: /must show its identifier, not the word HOME/,
  },
  {
    // Doctrine §7h.1, and the default advice everywhere is the fault. A worker
    // that skips waiting claims a page built from the PREVIOUS release, then
    // activate deletes that release's cache, so the page is served new modules
    // into old markup. Nothing errors and nothing is said.
    name: 'update: the new worker seizes the page instead of waiting',
    check: 'the new worker waits until the reader lets it in',
    file: 'public/sw.js',
    find: '      // NO skipWaiting() HERE, and that is Doctrine §7h.1.',
    replace: '      await self.skipWaiting();\n      // NO skipWaiting() HERE, and that is Doctrine §7h.1.',
    expect: /took over on its own/,
  },
  {
    // The other half: waiting SILENTLY is not better than seizing. An app that
    // caches itself cannot notice it is stale, so if nothing raises the strip
    // the reader has no way to find out at all.
    name: 'update: a waiting version is never mentioned to the reader',
    check: 'the panel says a new version is ready',
    file: 'public/src/app.js',
    find: '          readCacheState();\n          showUpdateStrip(',
    replace: '          readCacheState();\n          if (true) return;\n          showUpdateStrip(',
    expect: /panel says nothing about it/,
  },
  {
    // Noah, 2026-08-03: "Why am I not seeing my first-time-run pop-up
    // anymore?" It was moved into the (i) menu at boot and nothing ever opened
    // it — the text survived, which the plant below already proves, and was
    // never presented, which nothing checked. Passing one half while failing
    // the other is exactly what shipped for five releases.
    name: 'first run: the orientation is never shown to a first-time reader',
    check: 'a first-time reader is shown the orientation, once',
    file: 'public/src/app.js',
    find: '  if (!introSeen) info.open({ scrollTo: \'.gate-first\' });',
    replace: '  if (false && !introSeen) info.open({ scrollTo: \'.gate-first\' });',
    expect: /was shown no orientation at all/,
  },
  {
    // The other direction, and the one that makes it unusable rather than
    // merely quiet: explaining itself on every single load.
    name: 'first run: the orientation is shown again on every visit',
    check: 'the orientation is shown ONCE',
    file: 'public/src/app.js',
    find: '    introSeen = localStorage.getItem(INTRO_KEY) === \'yes\';',
    replace: '    introSeen = false;',
    expect: /opened again on the second visit/,
  },
  {
    // `hidden` means hidden. An author `display:` rule outranks the user
    // agent's `[hidden] { display: none }`, and this app has been bitten three
    // times — most recently showing a first-time visitor an update offer for
    // the build they had just installed.
    name: 'hidden: an author display rule outranks the hidden attribute again',
    check: 'nothing carrying the hidden attribute is painted',
    file: 'public/styles.css',
    find: '[hidden] {\n  display: none !important;\n}',
    replace: '[hidden] {\n  display: revert;\n}',
    expect: /carries the hidden attribute and is painted anyway/,
  },
  {
    // Noah, 2026-08-03: "Gentle rotation errors the horizon", with the ADI
    // reading `gravity 51° from the gyro — coasting on gyro`. The budget bounds
    // how long a phone gyro is trusted with no absolute reference, and the
    // error a reader sees is roughly linear in it — measured, 4 s of budget
    // reaches 53° and 2 s stops at 32°. Doubling it is the defect.
    name: 'attitude: the gyro is trusted for twice as long with no reference',
    check: 'a horizon the filter knows is wrong comes back within two seconds',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '  disagreeCoastMs: 2000,',
    replace: '  disagreeCoastMs: 8000,',
    expect: /the horizon is still \d+(\.\d+)?° from level/,
  },
  {
    // THE ROOT CAUSE of "gentle rotation errors the horizon". The propagation
    // used φ̇ = p, the small-angle shortcut, which is exact only near wings- and
    // nose-level. Restoring it invents roll in proportion to tan of the tilt:
    // measured, 52° from three seconds of gentle turning at a 60° tilt.
    name: 'kinematics: the roll rate goes back to the small-angle shortcut',
    check: 'turning a tilted device does not roll the horizon',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    roll += (p + (q * Math.sin(phi) + r * Math.cos(phi)) * tanTheta) * dt;',
    replace: '    roll += p * dt;',
    expect: /gentle turning moved the horizon \d+(\.\d+)?° in roll/,
  },
  {
    // The other half of the same relations. Dropping the pitch coupling is
    // quieter but no more correct.
    name: 'kinematics: the pitch rate goes back to the small-angle shortcut',
    check: 'turning a tilted device does not pitch the horizon either',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    pitch += (q * Math.cos(phi) - r * Math.sin(phi)) * dt;',
    replace: '    pitch += q * dt;',
    expect: /moved the horizon|from level|drifted/,
  },
  {
    // adsb.fi's terms: "Requests returning a 400, 401, 403, 404, or 429 status
    // code count toward the limit" for a temporary IP restriction. Ours 403s
    // every single time, so asking on every request spends a strike on a call
    // that cannot succeed, from an address shared with every other Cloudflare
    // tenant. Removing the stand-off puts that back.
    name: 'etiquette: a provider that refused is asked again immediately',
    check: 'a refusal is remembered and the provider is not re-asked',
    gate: 'tests',
    file: 'functions/api/_lib.js',
    find: '  if (status === 403) return 600;',
    replace: '  if (status === 403) return 0;',
    expect: /stands off far longer than a 429|cooldown/,
  },
  {
    // Noah photographed `cf-ray a258e8a82ff1fa4e-SJC` on the face of a gauge.
    // Every word of the raw chain is true and it is written for whoever is
    // debugging the Pages Function. Putting it back is the defect.
    name: 'refusal: the raw upstream chain goes back on the gauge',
    check: 'the reader gets a sentence and the forensics go to diagnostics',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    find: "  else if (has(/429|rate limit/i)) what = 'The aircraft feed is rate limiting us.';",
    replace: '  else if (has(/429|rate limit/i)) what = raw;',
    expect: /cf-ray|rate limiting us/,
  },
  {
    // Noah, 2026-08-05: "The ranges still need to be made right." `Math.round`
    // labelled the 2.5 and 7.5 nm rings "3" and "8". 20, 40 and 80 all divide
    // evenly by four, so three of the four ranges were right by accident and
    // the fourth was the only witness. The test imports `ringLabelFor` rather
    // than re-typing the formula — that is what this plant proves.
    name: 'rings: the range label goes back to rounding away from its ring',
    check: 'a ring label names the distance the circle is actually at',
    gate: 'tests',
    file: 'public/src/render/gauges/plan.js',
    find: '  const at = rangeNm * frac;\n  return Number.isInteger(at) ? String(at) : at.toFixed(1);',
    replace: '  return String(Math.round(rangeNm * frac));',
    expect: /the 0\.25 ring reads 3 and sits at 2\.5|old code rounded these/,
  },
  {
    // Noah, 2026-08-05: "Tapping the planes on top is still inconsistent in
    // whether they will respond or not." `placeLabels` puts the label 20-28px
    // from the mark and the radius was 24, so the biggest, most inviting part
    // of the target was half outside it. Not flakiness — geometry.
    name: 'tap: the aircraft target shrinks back inside its own label',
    check: 'a tap on the altitude label still finds its aircraft',
    gate: 'tests',
    file: 'public/src/render/gauges/plan.js',
    find: 'export const TAP_SLOP_PX = 34;',
    replace: 'export const TAP_SLOP_PX = 24;',
    expect: /a tap 28px away — where the label is — must hit/,
  },
  {
    // Noah, 2026-08-05: "The radar is pushed down by the airport picker."
    // Putting the picker back above the scope is the exact regression. `el`
    // returns nodes, so appending them earlier MOVES them — the picker really
    // does end up back on top, and the `.radar-centre` box below is left empty.
    //
    // Every existing check on this page stayed green through the whole defect,
    // because they all ask whether things EXIST and are legible. None asked
    // where the instrument starts, which is the only question a reader has.
    name: 'layout: the centre picker goes back above the scope',
    check: 'only the controls read WHILE looking at the scope may sit above it',
    file: 'public/src/panels/radar.js',
    find: "      el('div', { class: 'radar-range', role: 'group', 'aria-label': 'Plan view range' }, rangeButtons),",
    replace:
      "      el('div', { class: 'radar-centre' }, [\n"
      + "        el('label', { class: 'radar-centre-label', for: 'radar-centre', text: 'Centre the scope on' }),\n"
      + "        el('div', { class: 'radar-centre-row' }, [centreInput, centreClear]),\n"
      + '        centreList,\n'
      + '        centreNote,\n'
      + '      ]),\n'
      + "      el('div', { class: 'radar-range', role: 'group', 'aria-label': 'Plan view range' }, rangeButtons),",
    expect: /"radar-centre" sits between the card title and the scope/,
  },
  {
    // The exact regression the `nowrap` measurement exists to hold: wrapping
    // puts the (i) back on a row of its own under the tabs.
    name: 'header: the (i) drops onto a row of its own again',
    check: 'the (i) rides the tab row rather than sitting under it',
    file: 'public/styles.css',
    find: '  flex-wrap: nowrap;\n}\n/* Takes the room the tabs need and no more',
    replace: '  flex-wrap: wrap;\n}\n/* Takes the room the tabs need and no more',
    expect: /the \(i\) button sits at y=\d+ while the tab rows start at/,
  },
  {
    // The tempting way to get the (i) onto the tab row, and the one §7e names
    // as the thing it must not become. A headless axe run does NOT reliably
    // fail on a stray child of a tablist, which is why this is asserted
    // directly rather than left to the library.
    //
    // THE FIRST VERSION OF THIS PLANT DELETED `</nav>`, which puts the button
    // inside the NAV and not inside the tablist — so it broke the layout, the
    // gate went red about the (i) leaving the tab row, and the harness
    // correctly reported the plant as unproven: red, but not about this.
    name: 'header: the (i) is moved inside the tablist',
    check: 'the (i) is not a sixth tab',
    file: 'public/index.html',
    find: '        </div>\n      </nav>\n',
    replace:
      '          <button type="button" id="info-btn" class="info-btn" aria-label="Information about this panel">'
      + '<span class="info-glyph" aria-hidden="true">i</span></button>\n        </div>\n      </nav>\n',
    expect: /inside the tablist — that makes it a sixth tab/,
  },
  {
    // Noah, 2026-08-05, on a landscape phone: "This layout is unacceptable",
    // and then "why are you bounding everything to the circle inside the radar
    // instead of pushing everything down so I don't have to see all the
    // diagnostics?" `auto` is what the rule held before, and it puts a sliced
    // value row back on the panel above the footer.
    name: 'layout: the value strip climbs back onto the instrument screen',
    check: 'on a short screen the instruments fill the panel and the values start below it',
    file: 'public/styles.css',
    find: '  .pfd-row {\n    min-height: 100%;\n  }',
    replace: '  .pfd-row {\n    min-height: auto;\n  }',
    expect: /the value strip starts \d+px above the fold|is not filling the screen it was given/,
  },
  {
    // A moved control that renders and does nothing. The markup is present, the
    // label reads correctly, contrast passes — and the panel never dims.
    name: 'brightness: the SETUP control stops driving the palette',
    check: 'pressing brightness actually changes the panel',
    file: 'public/src/app.js',
    find: '  dimToggle.addEventListener(\'click\', () => {',
    replace: '  dimToggle.addEventListener(\'click\', () => { if (1) return;',
    expect: /did not take a manual mode|is not driving the panel/,
  },
  {
    // Noah photographed `ADS-B carries no attitude — pitch is n…` on the ADI.
    // The identical fix already existed twenty lines away in the ATT FAIL
    // branch; this branch is only reachable by following a real aircraft, so it
    // was never on screen while the other one was being fixed.
    name: 'reasons: the NO PITCH reason goes back to being truncated',
    check: 'a crossed-out gauge states its whole reason',
    gate: 'tests',
    file: 'public/src/render/canvas.js',
    find: '  if (lines.length < maxLines && line) lines.push(line);',
    replace: '  if (lines.length < maxLines && line && lines.length === 0) lines.push(line);',
    expect: /reasons cut off on the ADI|must use both lines|still truncated/,
  },
  {
    // "19 more below" with nineteen aircraft in total and seven on screen. The
    // count was measured one frame after render, and the list is built while
    // the RADAR page is still hidden — where everything measures zero, so every
    // row counts as below the fold.
    // THE REAL CAUSE, and the first version of this plant aimed at the wrong
    // one. `offsetTop` is measured from the nearest POSITIONED ancestor; with
    // the list unpositioned every row reports a page coordinate and the count
    // comes out as the total. Removing `position: relative` puts that back
    // exactly, which the guard-removal plant never did — it stayed green, the
    // sweep said UNPROVEN, and that is what sent anyone looking at the offsets.
    name: 'list: the scroller stops being the origin for its own rows',
    check: 'the aircraft list counts what is actually below the fold',
    file: 'public/styles.css',
    find: '  position: relative;\n  display: flex;\n  flex-direction: column;\n  gap: 0.4rem;\n  max-height: 22rem;',
    replace: '  display: flex;\n  flex-direction: column;\n  gap: 0.4rem;\n  max-height: 22rem;',
    expect: /the count equals the TOTAL|more below" while \d+ of \d+ rows are actually hidden|cut through the middle/,
  },
  {
    // A row sliced through its own text against a hard container edge reads as
    // broken rather than as scrollable — the same complaint as the value strip
    // under the horizon, in the same session.
    name: 'list: the scroller goes back to cutting a row in half',
    check: 'the aircraft list ends on a row boundary',
    file: 'public/src/panels/radar.js',
    find: "      list.style.maxHeight = `${last.offsetTop + last.offsetHeight}px`;",
    replace: '      list.style.maxHeight = `${LIST_MAX_PX()}px`;',
    expect: /row\(s\) are cut through the middle by the list/,
  },
  {
    // Noah, 2026-08-05: "The PFD still looks wrong because you insist on trying
    // to make the horizon and the radar the same height." Measured, the radar
    // was BIGGER: 520x217 against 269x269. Narrowing the horizon's share puts
    // that back.
    name: 'PFD: the navigation display out-sizes the horizon again',
    check: 'the attitude indicator is the biggest instrument on a PRIMARY flight display',
    //
    // THE FIRST VERSION OF THIS PLANT USED `flex: 62 1 0;` ALONE, which occurs
    // TWICE in this stylesheet — so it was injected into the wrong rule and the
    // gate stayed green. The harness reported UNPROVEN, which is the only
    // reason anybody counted. A `find` that is not unique is not a plant, it is
    // a coin toss.
    file: 'public/styles.css',
    find: '.pfd-main {\n  flex: 62 1 0;',
    replace: '.pfd-main {\n  flex: 20 1 0;',
    expect: /must be the biggest instrument on a PRIMARY flight display/,
  },
  {
    // The regression made WHILE fixing the above: a new wrapper between the row
    // and the page inherits none of the row's growth, and the tablet's horizon
    // fell from 381px to 227 with every existing check still green.
    name: 'PFD: the instrument wrapper stops taking the page height',
    check: 'the horizon is most of the panel, not merely bigger than the scope',
    file: 'public/styles.css',
    find: '     growth, and the measurement is the only thing that says so. */\n  flex: 1 1 auto;\n  min-height: 0;',
    replace: '     growth, and the measurement is the only thing that says so. */\n  min-height: 0;',
    expect: /under half the screen it is on/,
  },
  {
    // Noah, 2026-08-05, iPad portrait: "the power button is too low." Removing
    // the order puts the controls after BOTH stacked instruments again, which
    // is most of a screen below the horizon they belong to.
    name: 'PFD: the power switch drops below the radar in portrait',
    check: 'PWR sits with the horizon it powers when the instruments are stacked',
    file: 'public/styles.css',
    find: '  .pfd-controls {\n    order: 2;\n  }',
    replace: '  .pfd-controls {\n    order: 4;\n  }',
    expect: /it belongs with the horizon it powers, not underneath the radar/,
  },
  /*
   * NO PLANT FOR "the value strip is drawn over the power switch", DELIBERATELY,
   * and this comment is the record of why.
   *
   * The defect was real — Noah photographed it on an iPad in landscape at
   * 1.28.6 — and it is fixed. But THREE attempts at a single-edit plant came
   * back green: reverting the wrapper's `flex`, reverting the range column, and
   * both together. Each was written from a confident story about the mechanism,
   * and the sweep said plainly each time that the story was wrong.
   *
   * A plant that does not reproduce is not evidence, and one kept anyway is
   * worse than none: it reports coverage it does not have.
   *
   * THE GUARD IS PROVEN A BETTER WAY. `scripts/a11y-gate.mjs` as it stands was
   * run against a checkout of 1.28.6 — the build in the photograph — and went
   * red on both complaints, by name:
   *
   *   layout/ipad-landscape: the value strip is drawn over the power switch
   *                          — 3402px of overlap
   *   layout/ipad-portrait:  the power switch starts at 1091px, below the
   *                          navigation display at 652px
   *
   * A check verified against the real historical defect, on the real device
   * shape, beats a synthetic fault injected to satisfy a harness. Where a plant
   * cannot be written, say so here rather than leaving the check unmentioned.
   */
  {
    // Noah, 2026-08-05: "I DO NOT NEED THEM BECAUSE I CAN FUCKING SEE THE
    // GUAGES." Un-hiding the strip gives the duplicate its band of glass back.
    name: 'values: the screen-reader strip is painted on the panel again',
    check: 'the values are read, not seen',
    file: 'public/styles.css',
    find: '.readouts {\n  display: block;\n}',
    replace: '.readouts {\n  display: block;\n  position: static;\n  width: auto;\n  height: auto;\n  clip: auto;\n}',
    expect: /it is meant to be read, not seen/,
  },
  {
    // The other direction, and the dangerous one: hiding it so well that it
    // stops being a text alternative at all. A canvas is non-text content, so
    // this would take acceptance criterion 4 with it — while making the panel
    // look exactly as intended.
    name: 'values: the text alternative is hidden from screen readers too',
    check: 'visually hidden is not the same as gone',
    file: 'public/index.html',
    find: '<div class="readouts sr-only" id="pfd-readouts" role="group" aria-label="Flight values"></div>',
    replace: '<div class="readouts sr-only" id="pfd-readouts" role="group" aria-label="Flight values" aria-hidden="true"></div>',
    expect: /aria-hidden — the one thing it must never be|readouts/,
  },
  {
    name: 'BITE: the page stops reading the live store',
    check: 'BITE explains each failure rather than reporting all-clear',
    file: 'public/src/panels/bite.js',
    find: 'const merged = mergeRuntime(staticEntries, fields, CHECKS);',
    replace: 'const merged = mergeRuntime(staticEntries, fields, {});',
    // Deliberately names the ENTRY. The first version of both this expectation
    // and the check it aims at were satisfied by any FAIL anywhere on the page,
    // and the feed rows supply one in this build whatever BITE does.
    expect: /BITE reports "(orientation|heading|motion|geo)" as PASS with every permission denied/,
  },
];
