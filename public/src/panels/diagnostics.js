/**
 * diagnostics.js — one tap on the version stamp, and the whole panel's state as
 * text you can paste.
 *
 * WHY THIS EXISTS. Every defect this app has had was found by Noah
 * photographing his phone and me reading pixels: a residual figure, a flag, a
 * reason clipped at the edge of a tape. That is a terrible channel. It loses
 * the reason strings, it cannot show a field that is off screen, it cannot show
 * the filter's internals at all, and it makes a person do OCR for a machine.
 *
 * The report is ordered so THE FIRST LINES ARE THE DIAGNOSIS — everything
 * currently failing, with its reason — and the raw dump is underneath. A
 * diagnostic that opens with a table of forty fields is one nobody reads.
 *
 * PRIVACY, because this is made to be pasted somewhere. The position is rounded
 * to two decimal places (about a kilometre) unless the box is ticked, and the
 * report says which it is. Nothing else here is personal: no account, no
 * identifiers, no history.
 */

import { VERSION } from '../core/version.js';
import { FIELDS } from '../core/state.js';
import { el } from '../render/dom.js';
import { formatAge } from '../core/units.js';
import { formatSelfTest } from './selftest.js';

/** Console messages, captured from BOOT so a failure during startup is in the
 *  report rather than only in a devtools window nobody has open on a phone. */
const LOG = [];
const LOG_LIMIT = 40;

/**
 * Wrap console.error/warn and the global error handlers.
 *
 * Called at MODULE LOAD, not inside boot(), because "the panel failed to start"
 * is exactly the case worth capturing and boot() may never run.
 */
export function installConsoleCapture() {
  const note = (level, parts) => {
    LOG.push({ at: Date.now(), level, text: parts.map(stringify).join(' ').slice(0, 400) });
    if (LOG.length > LOG_LIMIT) LOG.shift();
  };
  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      note(level, args);
      original(...args);
    };
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => note('error', [e.message, `${e.filename}:${e.lineno}`]));
    window.addEventListener('unhandledrejection', (e) => note('error', ['unhandled rejection:', e.reason]));
  }
}

const stringify = (v) => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const pad = (s, n) => String(s).padEnd(n);
const iso = (ms) => new Date(ms).toISOString().replace('.000', '');

/** Round a position for the report. Two places is about a kilometre. */
const coarse = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : v);

function formatValue(field) {
  if (!field || field.provenance === 'FAIL') return '—';
  const v = field.value;
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2);
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Build the whole report.
 *
 * A pure function of the things handed to it, so it can be called from a test
 * without a browser — the same reason every derivation lives in derive.js.
 */
/** Wrap a list of short strings to a width, so a long key list stays readable
 *  in a pasted report rather than becoming one enormous line. */
function chunkList(items, width) {
  const out = [];
  let row = '';
  for (const item of items) {
    if (row && row.length + item.length + 2 > width) {
      out.push(row);
      row = '';
    }
    row = row ? `${row}, ${item}` : item;
  }
  if (row) out.push(row);
  return out;
}

export function buildReport({ snapshot, fusion, traffic, route = null, selfTest = null, visibility = null, metar, bootAt, precisePosition = false, env = {}, mount = null, mountApplies = null, raw = {}, now = null }) {
  // FIELD AGES are measured against the snapshot, which is when those values
  // were true. THE FILTER IS NOT A FIELD — it is live, and it keeps accepting
  // samples after a snapshot is taken. Reading it at `snapshot.t` is what put
  // `coasting -9ms`, `-21ms`, `-34ms` in every report Noah ever sent: the last
  // publish was up to a frame old, the filter had moved on, and the subtraction
  // ran backwards. It was never a clock mismatch, which is why making the app
  // use one clock did not fix it.
  const t = snapshot?.t ?? now ?? 0;
  const readAt = now ?? t;
  const f = snapshot?.fields ?? {};
  const out = [];
  const line = (s = '') => out.push(s);

  line(`fauxplane diagnostics  v${VERSION}`);
  line(`captured ${iso(t)}   panel up ${formatAge(t - bootAt)}`);
  line();

  // ---- the diagnosis, first --------------------------------------------------
  //
  // ROOT CAUSES SEPARATED FROM WHAT THEY KNOCKED OVER. A derived field names
  // the inputs it is missing, so its reason contains "unavailable (" — which
  // means it is a CONSEQUENCE, not a cause. Listing all thirty-eight together
  // buries the two or three that actually went wrong, and the whole point of
  // putting this at the top is that the first lines answer the question.
  // A field that can only have a value in a mode the panel is not in is NOT a
  // failure. Counting it as one inflates the headline on a healthy panel and
  // teaches the reader to discount the number, which is the one thing this
  // report cannot afford.
  //
  // Only a field that is ACTUALLY EMPTY counts as inapplicable. A field with a
  // value is applicable by definition — setting one aside because of its
  // declared mode would hide a real reading, which is the opposite failure and
  // a worse one.
  const inapplicable = Object.keys(FIELDS).filter(
    (p) =>
      FIELDS[p].onlyWhen === 'following' &&
      !traffic?.isFollowing &&
      (!f[p] || f[p].provenance === 'FAIL'),
  );
  const failing = Object.keys(FIELDS).filter(
    (p) => f[p]?.provenance === 'FAIL' && !inapplicable.includes(p),
  );
  const stale = Object.keys(FIELDS).filter((p) => f[p]?.provenance === 'STALE');
  const isDownstream = (p) => /unavailable \(|: not yet initialised\)/.test(f[p].reason ?? '');
  const roots = failing.filter((p) => !isDownstream(p));
  const downstream = failing.filter(isDownstream);
  const notStarted = roots.filter((p) => /not yet initialised|not fetched yet|filter has not started/.test(f[p].reason ?? ''));
  const realRoots = roots.filter((p) => !notStarted.includes(p));

  line(
    `WHAT IS NOT WORKING  —  ${failing.length} of ${Object.keys(FIELDS).length} fields failed` +
      `${stale.length ? `, ${stale.length} stale` : ''}`,
  );
  if (!failing.length && !stale.length) line('  nothing — every field is live or derived');

  if (realRoots.length) {
    line('  ROOT CAUSES:');
    for (const p of realRoots) line(`    ${pad(p, 28)} ${f[p].reason ?? 'no reason given'}`);
  }
  if (notStarted.length) {
    line(`  NEVER STARTED (${notStarted.length}) — no reading has arrived at all:`);
    line(`    ${notStarted.join(', ')}`);
  }
  if (inapplicable.length) {
    line(`  NOT APPLICABLE (${inapplicable.length}) — nothing is wrong; these need a followed aircraft:`);
    line(`    ${inapplicable.join(', ')}`);
  }
  for (const p of stale) line(`  STALE  ${pad(p, 28)} ${formatAge(f[p].ageMs)} old — ${f[p].reason ?? ''}`);
  if (downstream.length) {
    line(`  DOWNSTREAM (${downstream.length}) — failed only because something above did:`);
    line(`    ${downstream.join(', ')}`);
  }
  line();

  // ---- the attitude filter, because it is what goes wrong --------------------
  const att = fusion?.read?.(readAt);
  if (att) {
    line('ATTITUDE FILTER');
    line(`  quality ${att.quality ?? 'none'}   converged ${att.converged}   aligned ${att.aligned}   still ${att.still}   rejecting ${att.rejecting}`);
    // Number.isFinite, never `=== null`. A missing reading is `undefined` as
    // often as it is null, and `undefined.toFixed()` throws — in a report whose
    // entire job is to survive the broken states nothing else survives.
    const num = (v, digits, suffix = '') => (Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : '—');
    line(`  pitch ${num(att.pitch, 2)}   roll ${num(att.roll, 2)}   heading ${num(att.heading, 1)}`);
    line(
      `  residual ${num(att.residualDeg, 2, '°')}   accepted ${att.acceptedSamples ?? '—'} samples   coasting ${
        Number.isFinite(att.coastingMs) ? `${Math.round(att.coastingMs)}ms` : '—'
      }`,
    );
    if (att.reason) line(`  says: ${att.reason}`);
    const b = fusion.gyroBias;
    line(
      b
        ? `  gyro zero-offset  alpha ${b.alpha.toFixed(2)}  beta ${b.beta.toFixed(2)}  gamma ${b.gamma.toFixed(2)} deg/s  (from ${b.samples} samples)`
        : '  gyro zero-offset  not yet estimated',
    );
    line(
      mount
        ? `  MOUNT LEVELLING  cradle ${mount.pitchDeg.toFixed(1)} deg pitch, ${mount.rollDeg.toFixed(1)} deg roll` +
            `  — ${mountApplies === false ? 'NOT APPLIED (screen rotated since it was captured)' : 'being subtracted from every reading'}`
        : '  MOUNT LEVELLING  none — the horizon is reading the device itself',
    );
    line(
      `  accelerometer convention  ${
        fusion.accelSign === null ? 'not yet determined' : fusion.accelSign === 1 ? 'W3C (points up)' : 'NEGATED (iOS/Safari) — corrected'
      }`,
    );
    line();
  }

  // ---- sources ---------------------------------------------------------------
  line('SOURCES');
  const station = f['metar.station'];
  line(`  METAR      ${station?.provenance === 'FAIL' ? `none — ${station.reason}` : `${station?.value} at ${formatValue(f['metar.distanceNm'])} nm, altimeter ${formatValue(f['metar.altimeter'])} inHg`}`);
  if (metar?.last?.reason) line(`             last result: ${metar.last.reason}`);
  const tr = traffic?.last;
  line(
    // `centredOn` NAMES the centre. The old line read "of the fix" or "of home"
    // and had no third answer, so once a place could be chosen the report said
    // "of home" while the scope was over Sacramento International — a wrong
    // sentence in the one document that is supposed to replace a photograph.
    `  traffic    ${!tr ? 'not asked yet (the radar page fetches on open)' : tr.ok ? `${tr.aircraft?.length ?? 0} aircraft within ${tr.rangeNm} nm of ${tr.centre?.centredOn ?? (tr.centre?.fromFix ? 'the fix' : 'home')}` : `FAILED — ${tr.reason}`}`,
  );
  if (traffic?.chosenPlace) {
    line(`             scope centred by hand on ${traffic.chosenPlace.label} — not on this device`);
  }
  if (traffic?.isFollowing) {
    line(`  FOLLOWING  ${traffic.followLabel}${traffic.followError ? ` — ${traffic.followError}` : ''}`);
    const a = traffic.followed;
    if (a) line(`             ${a.hex} ${a.registration ?? ''} ${a.type ?? ''}  seen_pos ${a.seenPosS}s ago`);
  }
  // THE ROUTE IS A FEED AND REPORTS LIKE ONE. Its three states are different
  // facts and the report has to keep them apart: nothing asked yet, asked and
  // there is no route, asked and here is a guess. A blank line for all three
  // would make a broken request indistinguishable from a quiet flight.
  const rt = route?.current ?? route ?? null;
  if (rt?.callsign || rt?.state === 'known') {
    const codes = rt.state === 'known' ? `${rt.origin?.code ?? '?'} → ${rt.destination?.code ?? '?'}` : null;
    line(
      `  route      ${
        rt.state === 'known'
          ? `${codes}${(rt.via ?? []).length ? ` via ${rt.via.map((v) => v.code).join(', ')}` : ''} — ${rt.plausible ? 'PLAUSIBLE (inferred from the callsign)' : 'reported confirmed'}, ${rt.source ?? 'adsb.lol'}`
          : `none — ${rt.reason ?? 'not asked yet'}`
      }`,
    );
  }
  line();

  // ---- WHAT THE FEED ACTUALLY SENT -------------------------------------------
  //
  // Doctrine §7f: a sandbox cannot reach the provider, so the check is built
  // into the surface that Noah's device can run. This costs no extra request —
  // the Function computes it from the raw payload it already fetched, because
  // that is the only place the raw payload exists. By the time the client sees
  // an aircraft, a missing field and a misspelt key look identical.
  //
  // COVERAGE, NOT VALUES. "nav_altitude_mcp on 0 of 34" is the answer that
  // settles whether the autopilot readout can ever show anything, and it is not
  // inferable from a panel showing a crossed-out row.
  if (tr?.observed) {
    const o = tr.observed;
    line('WHAT THE TRAFFIC FEED ACTUALLY SENT');
    line(`  provider ${tr.source ?? 'unknown'}   sampled ${o.sampled} aircraft of ${tr.count ?? '?'}`);
    const cov = Object.entries(o.coverage ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!cov.length) line('  no counted field appeared on ANY aircraft in the sample');
    for (const [k, n] of cov) line(`    ${k.padEnd(22)} ${n} of ${o.sampled}`);
    // Every key the provider sent, including ones this app does not read — a
    // field we could be using and are not is invisible any other way.
    for (const chunk of chunkList(o.keys ?? [], 74)) line(`  keys  ${chunk}`);
    line();
  }

  // ---- WHAT THE ROUTE FEED ACTUALLY SENT -------------------------------------
  //
  // THE REQUEST SHAPE FOR `POST /api/0/routeset` IS A HYPOTHESIS, and this
  // block is how it stops being one. adsb.lol's OpenAPI page names the schemas
  // `PlaneList` and `PlaneInstance` without expanding them in any capture we
  // have, and this sandbox cannot reach api.adsb.lol at all — so the Function
  // sends the shape the tar1090 family uses and the answer comes back HERE,
  // from Noah's device, on the first real follow.
  //
  // `validation` is the line that matters. FastAPI answers a wrong body with a
  // 422 and a `detail` array naming the exact field it rejected, so a wrong
  // guess diagnoses itself and the next release is a correction rather than
  // another guess. A block that says `422  at: body.planes.0.lat  says: field
  // required` is worth more than four screenshots.
  const rp = route?.probe ?? null;
  if (rp) {
    line('WHAT THE ROUTE FEED ACTUALLY SENT');
    line(`  callsign ${rp.callsign ?? '—'}   HTTP ${rp.status ?? '—'}   entries ${rp.entries ?? '—'}`);
    /**
     * SAY SO WHEN THE PROBE IS ABOUT A DIFFERENT AIRCRAFT.
     *
     * Noah's 1.23.1 report has this block reading `callsign N460DF` while the
     * panel was following N81AB — the last probe, correctly retained, sitting
     * under a heading that never said it was stale. A block of evidence that
     * does not say which question it answers is a trap for whoever reads it
     * next, and that was going to be me.
     */
    if (traffic?.followLabel && rp.callsign && rp.callsign !== traffic.followLabel) {
      line(`  NOTE: this is the LAST probe, for ${rp.callsign} — the panel is now following ${traffic.followLabel}`);
    }
    if (rp.contentType) line(`  content-type ${rp.contentType}`);
    // WHERE THE REPLY CAME FROM. A 201 of text/html with nothing in it is not a
    // JSON API answering, and these three lines say which of the possibilities
    // it actually is rather than leaving it to be guessed at.
    if (rp.finalUrl) line(`  answered by ${rp.finalUrl}${rp.redirected ? '  (REDIRECTED — our POST may have become a GET)' : ''}`);
    for (const [k, v] of [['server', rp.server], ['cf-ray', rp.cfRay], ['location', rp.location], ['allow', rp.allow]]) {
      if (v) line(`  ${k}: ${v}`);
    }
    // THE BODY, which the first real probe did not carry and needed to. A 201
    // with nothing readable in it is three different faults wearing one face.
    if (rp.bodyLength !== null && rp.bodyLength !== undefined) {
      line(`  body ${rp.bodyLength} bytes   parsed as JSON: ${rp.parsed ? 'yes' : 'NO'}`);
    }
    if (rp.bodyPrefix) for (const chunk of chunkList(String(rp.bodyPrefix).split(/(?<=.{70})/), 74)) line(`  raw   ${chunk}`);
    if (rp.topLevelKeys?.length) for (const chunk of chunkList(rp.topLevelKeys, 74)) line(`  top   ${chunk}`);
    if (rp.entryKeys?.length) for (const chunk of chunkList(rp.entryKeys, 74)) line(`  entry ${chunk}`);
    for (const v of rp.validation ?? []) line(`  REJECTED  at: ${v.at ?? '?'}   says: ${v.says ?? '?'}   (${v.kind ?? '?'})`);
    if (!rp.topLevelKeys?.length && !rp.entryKeys?.length && !rp.validation?.length) {
      line('  the reply carried no readable keys — see the HTTP status above');
    }
    line();
  }

  // ---- THE SELF TEST, if it has been run ------------------------------------
  //
  // Folded in so ONE paste carries everything. Noah should not have to assemble
  // evidence from two screens, and a result that lives only on the BITE page is
  // a result that arrives in a screenshot.
  if (selfTest) {
    const text = formatSelfTest(selfTest);
    if (text) {
      for (const l of text.split('\n')) line(l);
      line();
    }
  } else {
    line('SELF TEST  not run — press "Run the self test" on the BITE page');
    line();
  }

  // ---- FOREGROUND HISTORY ----------------------------------------------------
  //
  // On iOS the sensors stop the moment the page loses the foreground, and the
  // resulting FAIL reason — "no update for 3s (limit 3s)" — describes a clock
  // rather than a cause. Two reports carried that sentence with a perfectly
  // good gravity vector three lines below it, and neither could settle whether
  // the page had been backgrounded. These lines settle it.
  if (visibility) {
    line('FOREGROUND');
    line(`  currently ${typeof document === 'undefined' ? 'unknown' : document.visibilityState}`);
    line(
      `  backgrounded ${visibility.hiddenCount} time(s) since boot`
        + `${visibility.lastHiddenAt ? `, last ${formatAge(readAt - visibility.lastHiddenAt)} ago` : ''}`
        + `${visibility.lastVisibleAt ? `; returned ${formatAge(readAt - visibility.lastVisibleAt)} ago` : ''}`,
    );
    line();
  }

  // ---- RAW SENSOR AXES -------------------------------------------------------
  //
  // The three numbers, before anything is done to them, alongside the screen
  // angle they are about to be rotated by. This block exists because an axis
  // convention cannot be diagnosed from a photograph of a horizon — an iPad
  // reading roll -90 in BOTH orientations and an iPad with a missing screen
  // rotation look identical on screen and are different bugs.
  line('RAW SENSOR AXES  (before any correction)');
  const a = raw.accel;
  line(
    a
      ? `  accelerationIncludingGravity  x ${a.x.toFixed(3)}  y ${a.y.toFixed(3)}  z ${a.z.toFixed(3)}  |g| ${(Math.hypot(a.x, a.y, a.z) / 9.80665).toFixed(3)}`
      : '  accelerationIncludingGravity  no event received',
  );
  if (a?.rotation) {
    const r = a.rotation;
    const n = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
    line(`  rotationRate                  alpha ${n(r.alpha)}  beta ${n(r.beta)}  gamma ${n(r.gamma)} deg/s`);
  }
  const o = raw.orientation;
  line(
    o
      ? `  deviceorientation             alpha ${o.alpha === null ? '—' : Number(o.alpha).toFixed(1)}  beta ${o.beta === null ? '—' : Number(o.beta).toFixed(1)}  gamma ${o.gamma === null ? '—' : Number(o.gamma).toFixed(1)}  absolute ${o.absolute}`
      : '  deviceorientation             no event received',
  );
  if (o && o.webkitCompassHeading !== null) line(`  webkitCompassHeading          ${Number(o.webkitCompassHeading).toFixed(1)}`);
  line(`  screen angle in use           ${env.screenAngle}  from ${env.screenAngleSource}`);
  line(`    candidates                  screen.orientation.angle ${env.rawScreenAngle}, type ${env.orientation}, window.orientation ${env.windowOrientation}`);
  line(`  viewport                      ${env.viewportW}x${env.viewportH}  ${env.viewportW > env.viewportH ? '(landscape as the reader sees it)' : '(portrait as the reader sees it)'}`);
  line(`  screen                        ${env.screenW}x${env.screenH}`);
  line();

  // ---- the device ------------------------------------------------------------
  line('DEVICE');
  line(`  ${env.userAgent ?? 'no user agent'}`);
  line(`  screen ${env.screenW}x${env.screenH} @${env.dpr}x   viewport ${env.viewportW}x${env.viewportH}   angle ${env.screenAngle}°   ${env.orientation ?? ''}`);
  line(`  root font ${env.rootFontPx}px${env.rootFontPx && env.rootFontPx !== 16 ? '  (text size is enlarged)' : ''}`);
  line(`  palette ${env.dim}   standalone ${env.standalone}   service worker ${env.swState}`);
  if (env.wakeLock !== undefined) line(`  wake lock ${env.wakeLock}`);
  // Doctrine §7h.4. THE VERSION STAMP ABOVE CANNOT ANSWER "IS THIS CURRENT?" —
  // it reports what the cache served, and a stale app reports its stale version
  // perfectly honestly. These lines are what make the answer readable from the
  // other end of a message.
  if (env.caches) {
    const held = env.caches.length ? env.caches.join(', ') : 'none';
    line(`  shells held ${held}`);
    line(
      `  a newer version is ${env.swWaiting ? 'WAITING to be installed — the update strip is offering it' : 'not waiting'}`
        + `${env.cacheReadAt ? `   (read ${env.cacheReadAt})` : '   (never read)'}`,
    );
    // MORE THAN ONE SHELL IS NOT NORMAL. `activate` deletes every cache but its
    // own, so two means an activate did not finish — which is the shape of the
    // defect that stranded the iPad on 0.4.1.
    if (env.caches.length > 1) {
      line('  MORE THAN ONE SHELL IS HELD — an activate did not finish; the panel may be serving a mix');
    }
  }
  line();

  // ---- every field -----------------------------------------------------------
  line('ALL FIELDS');
  line(`  ${pad('path', 30)}${pad('prov', 9)}${pad('value', 14)}${pad('unit', 7)}age`);
  for (const [p, spec] of Object.entries(FIELDS)) {
    const field = f[p];
    let value = formatValue(field);
    // `field &&` IS LOAD-BEARING. An unwritten field is `undefined`, and
    // `undefined?.provenance !== 'FAIL'` is TRUE — so this rounded a value off
    // a field that did not exist and threw, taking the ENTIRE report with it.
    // A device that never got a position fix is precisely the device somebody
    // presses the version stamp on, and it is the one that got nothing back.
    if (!precisePosition && (p === 'position.lat' || p === 'position.lon') && field && field.provenance !== 'FAIL') {
      value = String(coarse(field.value));
    }
    line(
      `  ${pad(p, 30)}${pad(field?.provenance ?? '—', 9)}${pad(value, 14)}${pad(spec.unit ?? '', 7)}${
        field && field.provenance !== 'FAIL' ? formatAge(field.ageMs) : ''
      }`,
    );
  }
  line();
  line(
    precisePosition
      ? '  (position shown EXACTLY, because the box was ticked)'
      : '  (position rounded to ~1 km; tick the box in the diagnostics panel for the exact fix)',
  );
  line();

  // ---- console ---------------------------------------------------------------
  line(`CONSOLE  (${LOG.length} captured since boot${LOG.length >= LOG_LIMIT ? ', oldest dropped' : ''})`);
  if (!LOG.length) line('  nothing — no errors or warnings');
  for (const entry of LOG) line(`  ${iso(entry.at)}  ${entry.level.toUpperCase()}  ${entry.text}`);

  return out.join('\n');
}

/**
 * The panel itself.
 *
 * A dialog rather than a fifth tab: it is a diagnostic, not an instrument, and
 * it should not take a permanent slot in a tab row a pilot is scanning. Every
 * requirement of Doctrine §4 for an interrupting surface is still met — a
 * dismiss at the top AND the bottom, wired before anything that can throw, and
 * Escape closes it.
 */
export function createDiagnostics({ trigger, build }) {
  let precise = false;

  const body = el('pre', { class: 'diag-body', tabindex: '0', 'aria-label': 'Diagnostic report text' });
  const status = el('p', { class: 'diag-status', role: 'status', 'aria-live': 'polite' });

  const preciseBox = el('input', { type: 'checkbox', id: 'diag-precise', class: 'diag-check' });
  preciseBox.addEventListener('change', () => {
    precise = preciseBox.checked;
    refresh();
  });

  // TWO WAYS OUT (Doctrine §4), with DISTINCT NAMES. Two controls answering to
  // the same accessible name is ambiguous for anyone driving the panel by
  // voice — "tap close" has two answers — and the gate caught exactly that.
  const closeTop = el('button', { class: 'diag-close', type: 'button', text: 'Close' });
  const closeBottom = el('button', { class: 'diag-close diag-close-foot', type: 'button', text: 'Close diagnostics' });

  const copyBtn = el('button', { class: 'diag-action diag-primary', type: 'button', text: 'Copy report' });
  const shareBtn = el('button', { class: 'diag-action', type: 'button', text: 'Share' });
  const saveBtn = el('button', { class: 'diag-action', type: 'button', text: 'Save as file' });
  /**
   * ONE REQUEST, ON DEMAND (Doctrine §7f, §15.6).
   *
   * The report already carries what the last response contained, at no cost.
   * This is for the case where a fresh answer is the question — "is it rate
   * limiting us RIGHT NOW, and what is it asking us to wait?" — which the
   * stored result cannot answer.
   *
   * It makes exactly one request and reports the status, the timing, and any
   * Retry-After the service sent, because a 429 is an instruction and the
   * instruction is in the header nobody can see from a panel.
   */
  const probeBtn = el('button', { class: 'diag-action', type: 'button', text: 'Probe the feed once' });

  const dialog = el('dialog', { class: 'diag', 'aria-labelledby': 'diag-h' }, [
    el('div', { class: 'diag-head' }, [
      el('h2', { class: 'diag-title', id: 'diag-h', text: 'Diagnostics' }),
      closeTop,
    ]),
    el('p', {
      class: 'diag-intro',
      text: 'Everything the panel knows right now, as text. Copy it and paste it instead of taking a screenshot.',
    }),
    el('div', { class: 'diag-actions' }, [copyBtn, shareBtn, saveBtn, probeBtn]),
    el('label', { class: 'diag-label', for: 'diag-precise' }, [
      preciseBox,
      el('span', { text: ' Include my exact position (otherwise rounded to about a kilometre)' }),
    ]),
    status,
    body,
    closeBottom,
  ]);
  document.body.append(dialog);

  probeBtn.addEventListener('click', async () => {
    probeBtn.disabled = true;
    status.textContent = 'Asking the traffic feed once…';
    const startedAt = Date.now();
    const lines = ['', 'ONE-SHOT FEED PROBE', `  asked at ${new Date(startedAt).toISOString()}`];
    try {
      const res = await fetch('/api/traffic?lat=38.68&lon=-121.00&dist=80', { cache: 'no-store' });
      const ms = Date.now() - startedAt;
      lines.push(`  HTTP ${res.status} ${res.statusText || ''} in ${ms} ms`);
      // A 429 IS AN INSTRUCTION (§15.3). If it says how long, that is the most
      // useful line in the whole report and it is invisible from the panel.
      for (const h of ['retry-after', 'cf-ray', 'server', 'age', 'cf-cache-status']) {
        const v = res.headers.get(h);
        if (v) lines.push(`  ${h}: ${v}`);
      }
      // NOT named `body`: that is the <pre> this report is written into, and
      // shadowing it here meant the append below would have written the probe
      // result onto the JSON object instead of onto the screen.
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        lines.push('  the body was not JSON');
      }
      if (payload) {
        lines.push(`  ok ${payload.ok}   provider ${payload.source ?? '—'}   aircraft ${payload.count ?? '—'}`);
        if (payload.reason) lines.push(`  reason: ${payload.reason}`);
        const o = payload.observed;
        if (o) {
          lines.push(`  sampled ${o.sampled}`);
          const cov = Object.entries(o.coverage ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
          if (!cov.length) lines.push('    no counted field appeared on ANY aircraft');
          for (const [k, n] of cov) lines.push(`    ${k.padEnd(22)} ${n} of ${o.sampled}`);
          for (const chunk of chunkList(o.keys ?? [], 74)) lines.push(`  keys  ${chunk}`);
        }
      }
    } catch (err) {
      lines.push(`  the request threw: ${err.message}`);
    }
    // APPENDED, never replacing the report. The rest of the panel state is what
    // makes a probe result interpretable.
    body.textContent = `${body.textContent}\n${lines.join('\n')}\n`;
    status.textContent = 'Probe finished — it is at the end of the report. Copy and paste the whole thing.';
    probeBtn.disabled = false;
  });

  const refresh = () => {
    body.textContent = build({ precisePosition: precise });
  };

  const close = () => {
    dialog.close?.();
    dialog.hidden = true;
    trigger.focus();
  };
  for (const b of [closeTop, closeBottom]) b.addEventListener('click', close);

  const open = () => {
    refresh();
    dialog.hidden = false;
    status.textContent = '';
    try {
      if (typeof dialog.showModal === 'function' && !dialog.matches(':modal')) dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
    copyBtn.focus();
  };

  copyBtn.addEventListener('click', async () => {
    const text = body.textContent;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied. Paste it wherever you are reporting the problem.';
    } catch (err) {
      // Clipboard write can be refused; selecting the text is a real fallback
      // and is better than saying "copy failed" and stopping.
      const range = document.createRange();
      range.selectNodeContents(body);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      status.textContent = `Could not copy automatically (${err.message}). The report is selected — copy it by hand.`;
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (!navigator.share) {
      status.textContent = 'This browser has no share sheet. Use Copy or Save instead.';
      return;
    }
    try {
      await navigator.share({ title: `fauxplane v${VERSION} diagnostics`, text: body.textContent });
      status.textContent = 'Shared.';
    } catch (err) {
      if (err?.name !== 'AbortError') status.textContent = `Share failed: ${err.message}`;
    }
  });

  saveBtn.addEventListener('click', () => {
    const blob = new Blob([body.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `fauxplane-${VERSION}-diagnostics.txt` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    status.textContent = 'Saved.';
  });

  trigger.addEventListener('click', open);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  return { open, close, refresh, get text() { return body.textContent; } };
}
