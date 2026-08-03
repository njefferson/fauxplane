/**
 * app.js — boot, the PANEL POWER gate, page switching, and the one place that
 * wires sensors and feeds into the store.
 *
 * THE SHAPE OF THE APP, in one paragraph. The store owns every value. Sensors
 * and feeds write into it. A single subscriber computes the derived values from
 * what is already in it. Panels subscribe and draw. Nothing else talks to
 * anything else — so any number on screen can be traced backwards through
 * exactly one path, which is what makes the no-synthetic-data rule enforceable
 * rather than merely stated.
 */

import { CACHE_NAME, VERSION } from './core/version.js';
import { state } from './core/state.js';
import { createFusion } from './core/fusion.js';
import { createVsi, angleOfAttack, calibratedAirspeed, indicatedAltitude, mslAltitude, pressureAltitude, trueAirspeed } from './core/derive.js';
import { needsMotionPermission, needsOrientationPermission } from './core/capability.js';
import { REGION } from './core/region.js';

import { createOrientationSensor } from './sensors/orientation.js';
import { createMotionSensor } from './sensors/motion.js';
import { createGeoSensor } from './sensors/geo.js';
import { createAmbientSensor } from './sensors/ambient.js';
import { probeBattery } from './sensors/battery.js';
import { probeNetwork, watchNetwork } from './sensors/network.js';
import { probeMagnetometer } from './sensors/magnetometer.js';

import { createMetarSource } from './data/metar.js';
import { createTrafficSource, radarCentre } from './data/traffic.js';
import { createWindsSource } from './data/windsaloft.js';
import { createGeoidSource } from './data/geoid.js';
import { loadNavdata } from './data/navdata.js';
import { loadModel, magneticField } from './data/wmm.js';

import { createSurface } from './render/canvas.js';
import { createAnnouncer, el } from './render/dom.js';
import { createPfd } from './panels/pfd.js';
import { createAtis } from './panels/atis.js';
import { createBite } from './panels/bite.js';
import { createRadar } from './panels/radar.js';
import { buildReport, createDiagnostics, installConsoleCapture } from './panels/diagnostics.js';
import { createSetup } from './panels/setup.js';
import { createUpdateBanner } from './panels/whatsnew.js';
import { createInfo } from './panels/info.js';
import { DEGRADED, FAILED, PASS } from './core/capability.js';

const $ = (id) => document.getElementById(id);
/**
 * ONE CLOCK, THE STORE'S.
 *
 * The store ages every field against its own clock, which is
 * `performance.timeOrigin + performance.now()`. The sensors were being handed
 * `Date.now()` instead, so a reading could be stamped a millisecond or two
 * AFTER the publish that measured its age — which is where the "coasting -21ms"
 * in Noah's reports came from. Two clocks that agree to within a few
 * milliseconds still disagree, and a negative age is a small lie about a
 * timestamp in an app whose entire contract is timestamps.
 */
const now = () => state.clock();

// INSTALLED AT MODULE LOAD, NOT INSIDE boot(). "The panel failed to start" is
// precisely the case worth capturing, and boot() may never run.
installConsoleCapture();
const BOOT_AT = now();

/** Feed cadences. Each is at or below what the upstream's own cache allows, so
 *  a refresh that lands early costs the edge cache and not the service. */
const METAR_INTERVAL_MS = 60_000;
const WINDS_INTERVAL_MS = 15 * 60_000;
/**
 * EACH INTERVAL IS HALF ITS EDGE CACHE TTL, and that relationship is the point.
 *
 * These were 10 s and 5 s against caches of 8 s and 5 s — every entry expired
 * just before the poll that would have used it, so the cache never once served
 * a single user and every poll reached adsb.lol. The old comment right here
 * claimed the opposite. Noah was rate limited off the radar repeatedly, which
 * is what a false claim about pacing buys.
 *
 * A plan view fifteen seconds old is still a useful plan view; provenance ages
 * it honestly either way. A hobby panel has no business polling a volunteer
 * network at its ceiling (Doctrine §15.6), and being inside the ceiling is not
 * the same as being frugal.
 *
 * `traffic-pacing.test.mjs` holds these against POLICIES so the two files
 * cannot drift back apart.
 */
const TRAFFIC_INTERVAL_MS = 15_000;
/** The followed aircraft is polled harder, because it IS the instrument
 *  source — but still under its own 20 s edge cache. */
const FOLLOW_INTERVAL_MS = 10_000;

async function boot() {
  // ---- the build stamp, written at BOOT ------------------------------------
  // Doctrine §7b: not when a panel opens. The whole point is that it is already
  // there in a screenshot nobody thought to compose.
  $('build-stamp').textContent = `v${VERSION}`;
  // The accessible name CONTAINS the visible text (SC 2.5.3, Label in Name),
  // built from the same constant so the two can never disagree.
  $('build-stamp').setAttribute('aria-label', `v${VERSION} — open diagnostics`);

  const announcer = createAnnouncer($('announcer'));
  const fusion = createFusion();
  const vsi = createVsi();

  // THE VERSION STAMP IS THE DIAGNOSTICS BUTTON.
  //
  // Every defect this app has had was found by photographing a phone and
  // reading pixels off it, which loses the reason strings, cannot show a field
  // that is off screen, and cannot show the filter's internals at all. One tap
  // here produces the whole state as text to paste. It is wired to the stamp
  // rather than to a fifth tab because it is a diagnostic, not an instrument,
  // and the tab row is for things a pilot scans.
  const stamp = $('build-stamp');
  const diagnostics = createDiagnostics({
    trigger: stamp,
    build: ({ precisePosition }) =>
      buildReport({
        snapshot: state.snapshot,
        fusion,
        traffic,
        metar,
        bootAt: BOOT_AT,
        // The filter is read at the moment the report is asked for, not at the
        // last publish. See the note on `readAt` in buildReport.
        now: now(),
        precisePosition,
        env: readEnvironment(),
        mount: fusion.mountOffset,
        mountApplies: fusion.mountOffset ? fusion.mountOffset.capturedAtScreenAngle === orientation.screenAngle() : null,
        raw: { accel: motion.lastRaw, orientation: orientation.lastRaw },
      }),
  });

  // The (i) menu. Built here because PANEL POWER hands it the first-run
  // instructions when the gate is dismissed, so it must already exist.
  const infoBtn = $('info-btn');
  const info = createInfo({
    trigger: infoBtn,
    onDiagnostics: () => diagnostics.open(),
  });
  infoBtn.addEventListener('click', () => info.open());

  // ---- sensors (constructed now, started only by PANEL POWER) --------------
  const orientation = createOrientationSensor({ state, fusion, clock: now });
  // FIELD OWNERSHIP. The device's own sensors stop WRITING while the panel is
  // following an aircraft, because the broadcast fills those very same fields.
  // Both sources writing means the panel shows whichever landed last, and they
  // arrive at different rates — so the groundspeed would alternate between a
  // desk in Cameron Park and a 737 over the Sierra several times a second.
  // Declared here as a forward reference and read lazily; `traffic` is built a
  // few lines down and the predicate is not called until a sensor fires.
  const deviceOwnsFields = () => !traffic.isFollowing;
  const motion = createMotionSensor({
    state,
    fusion,
    vsi,
    screenAngle: orientation.screenAngle,
    owns: deviceOwnsFields,
    clock: now,
  });
  const ambient = createAmbientSensor({ state, clock: now });
  let sawFirstFix = false;
  const geo = createGeoSensor({
    state,
    vsi,
    owns: deviceOwnsFields,
    clock: now,
    onFix: () => {
      if (!sawFirstFix) {
        sawFirstFix = true;
        // PUBLISH FIRST. This runs inside the geolocation callback, before the
        // 25 Hz loop has published the fix, so `state.snapshot` still says
        // there is no position — and the winds fetch, which correctly refuses
        // to ask for a surrogate position, then declined and waited fifteen
        // minutes for its next interval. Noah's screenshot showed exactly that:
        // GPS PASS on the BITE page, "no position fix" on the winds row.
        state.publishNow();
        // The cold-start boxes stop being used the moment a fix exists, and the
        // feeds are re-asked immediately rather than waiting out their interval.
        refreshMetar();
        refreshWinds();
      }
    },
  });

  // ---- feeds ---------------------------------------------------------------
  const metar = createMetarSource({ state, clock: now });
  const winds = createWindsSource({ state, clock: now });
  const geoid = createGeoidSource({ state, clock: now });
  const traffic = createTrafficSource({ state, clock: now });

  // ---- panels --------------------------------------------------------------
  const canvas = $('pfd-canvas');
  const surface = createSurface(canvas);
  // The navigation display beside the horizon. Its own surface, because a
  // canvas measures the box it is actually in and these are two different boxes.
  const planCanvas = $('pfd-plan');
  const planSurface = createSurface(planCanvas);

  const pfd = createPfd({
    canvas,
    surface,
    planCanvas,
    planSurface,
    // ONE SOURCE, TWO DRAWINGS. The ND reads the same traffic the RADAR page
    // does, at the same range, rather than keeping its own copy — two pictures
    // of one truth is exactly how they come to disagree.
    traffic: () => ({
      centre: radarCentre(state.snapshot.fields),
      aircraft: traffic.nearby,
      rangeNm: radar.rangeNm,
      followedHex: traffic.followed?.hex ?? null,
      fromFix: !!radarCentre(state.snapshot.fields)?.fromFix,
      trail: traffic.trail,
    }),
    readoutHost: $('pfd-readouts'),
    announcer,
    // Only reported when it is actually in force; a levelling captured in the
    // other screen orientation is not being applied and must not claim to be.
    mountOffset: () => {
      const o = fusion.mountOffset;
      return o && o.capturedAtScreenAngle === orientation.screenAngle() ? o : null;
    },
  });
  const atis = createAtis({ host: $('page-atis'), state, announcer, clock: now });
  const bite = createBite({ host: $('page-bite'), announcer });
  // Exposed for scripts/preview.mjs ONLY, which drives the real calibration
  // entry point from outside so a preview scene cannot diverge from the button.
  globalThis.__previewFusion = fusion;
  const setup = createSetup({
    host: $('page-setup'),
    fusion,
    state,
    announcer,
    screenAngle: orientation.screenAngle,
    onChange: () => pfd.render(state.snapshot),
  });

  // LEVELLING, ON THE PFD, WHERE THE CROOKED HORIZON IS.
  //
  // It lived only on SETUP — which is the one page a reader is NOT looking at
  // when they notice the horizon is wrong. Noah: "move the level function out
  // of setup so it's intuitive." These buttons call setup's own capture and
  // clear, so there is still exactly ONE implementation of the procedure and
  // one place the refusals are worded; only the reach changed.
  const levelBtn = $('pfd-level');
  const levelClearBtn = $('pfd-level-clear');
  const levelStatus = $('pfd-level-status');

  /** Mirror setup's own wording rather than inventing a second vocabulary. */
  const syncLevelUi = () => {
    const applied = fusion.mountOffset;
    levelClearBtn.hidden = !applied;
    levelBtn.textContent = applied ? 'Re-level the horizon' : 'Level the horizon';
    if (!applied && !levelStatus.dataset.tone) {
      levelStatus.textContent = 'Not levelled — the horizon shows the device’s own angle.';
    }
  };

  levelBtn.addEventListener('click', () => {
    const said = setup.capture();
    // capture() writes its own status onto the SETUP page; repeat the outcome
    // here so a reader who never opens that page still learns what happened.
    levelStatus.textContent = setup.lastStatus?.text ?? '';
    levelStatus.dataset.tone = setup.lastStatus?.tone ?? '';
    syncLevelUi();
    return said;
  });
  levelClearBtn.addEventListener('click', () => {
    setup.clearLevelling();
    levelStatus.textContent = 'Levelling cleared — the horizon shows the device’s own angle again.';
    levelStatus.dataset.tone = '';
    syncLevelUi();
  });
  syncLevelUi();
  // A saved levelling is re-applied at boot, so it survives a reload without
  // anyone having to re-level a cradle that has not moved.
  const restored = setup.restore();

  // The standing FOLLOW indicator, wired before the panel that can turn it on.
  const followBanner = $('follow-banner');
  const followWhat = $('follow-what');
  const syncFollowBanner = () => {
    const label = traffic.followLabel;
    followBanner.hidden = !label;
    followWhat.textContent = label ? `${label} — this panel is showing that aircraft's broadcast, not this device` : '';
    document.body.dataset.following = label ? 'true' : 'false';
  };
  const radar = createRadar({
    host: $('page-radar'),
    traffic,
    announcer,
    onFollowChange: () => {
      syncFollowBanner();
      // Ask at once rather than waiting out the interval: the five seconds
      // between a tap and the first numbers is the whole first impression.
      refreshFollowed();
    },
  });

  // RANGE, BESIDE THE NAVIGATION DISPLAY. Same four ranges as the RADAR page,
  // driving the same value through radar.setRange — two controls are fine, two
  // copies of the value is how they disagree. onRange keeps both surfaces'
  // pressed states true whichever one was tapped.
  const pfdRangeHost = $('pfd-range');
  const pfdRangeButtons = [10, 25, 40, 80].map((nm) => {
    const b = el('button', {
      class: 'pfd-range-btn',
      type: 'button',
      text: `${nm}`,
      'aria-label': `Range ${nm} nautical miles`,
      'aria-pressed': radar.rangeNm === nm ? 'true' : 'false',
    });
    b.addEventListener('click', () => radar.setRange(nm));
    return b;
  });
  pfdRangeHost.replaceChildren(...pfdRangeButtons);
  radar.onRange((nm) => {
    for (const b of pfdRangeButtons) b.setAttribute('aria-pressed', b.textContent === String(nm) ? 'true' : 'false');
    // NO FETCH. One radius is ever requested and it is the widest, so a narrower
    // scope is a filter over aircraft already in hand. This is why changing
    // range can no longer empty the display: there is no request to fail.
    traffic.setDisplayRange(nm);
  });

  $('follow-exit').addEventListener('click', () => {
    traffic.unfollow();
    syncFollowBanner();
    announcer.say('Stopped following. The panel is back on this device’s own sensors.');
  });
  syncFollowBanner();

  // ---- one-shot loads ------------------------------------------------------
  const extraBite = [];
  await geoid.load();
  if (geoid.detail) bite.setDetails({ geoid: geoid.detail });

  const wmm = await loadModel();
  if (wmm.error) {
    state.fail('nav.declination', wmm.error);
    if (wmm.detail) bite.setDetails({ declination: wmm.detail });
  }

  loadNavdata().then((res) => {
    extraBite.push(
      res.ok
        ? {
            id: 'navdata',
            label: 'Navdata bundle (v2 — no panel reads it yet)',
            group: 'Feeds',
            status: PASS,
            reason: `${res.counts.airports} airports, ${res.counts.runways} runways, ${res.counts.navaids} navaids for ${res.meta.region}`,
          }
        : {
            id: 'navdata',
            label: 'Navdata bundle (v2 — no panel reads it yet)',
            group: 'Feeds',
            status: FAILED,
            reason: res.detail ? `${res.reason} — ${res.detail}` : res.reason,
          },
    );
    bite.setHostEntries(extraBite);
  });

  probeBattery().then((r) => {
    // Same id as the static probe, so the live answer REPLACES it rather than
    // adding a second row for the same capability.
    extraBite.push({ id: 'battery', label: 'Battery status (BITE entry only)', group: 'Host', status: r.status, reason: r.reason });
    bite.setHostEntries(extraBite);
  });

  const pushNetwork = (r) => {
    const i = extraBite.findIndex((e) => e.id === 'network');
    const entry = { id: 'network', label: 'Network (BITE entry only)', group: 'Host', status: r.status, reason: r.reason };
    if (i >= 0) extraBite[i] = entry;
    else extraBite.push(entry);
    bite.setHostEntries(extraBite);
  };
  pushNetwork(probeNetwork());
  watchNetwork(pushNetwork);

  const mag = probeMagnetometer();
  extraBite.push({ id: 'magnetometer', label: 'Magnetometer', group: 'Sensors', status: mag.status, reason: mag.reason });
  bite.setHostEntries(extraBite);

  // Which accelerometer convention this platform uses, once it is known. Worth
  // a BITE row: it is invisible otherwise, and it is the difference between a
  // horizon that works and one that is upside down.
  let reportedAccelSign = null;
  const reportAccelSign = () => {
    if (fusion.accelSign === null || fusion.accelSign === reportedAccelSign) return;
    reportedAccelSign = fusion.accelSign;
    const i = extraBite.findIndex((e) => e.id === 'accel-convention');
    const entry = {
      id: 'accel-convention',
      label: 'Accelerometer orientation',
      group: 'Sensors',
      status: PASS,
      reason:
        reportedAccelSign === 1
          ? 'this browser reports acceleration pointing up (W3C convention) — detected, not assumed'
          : 'this browser reports acceleration NEGATED (Safari/iOS convention) — detected and corrected',
    };
    if (i >= 0) extraBite[i] = entry;
    else extraBite.push(entry);
    bite.setHostEntries(extraBite);
  };

  // The learned gyro zero-offset. Worth a row for the same reason the
  // accelerometer convention is: it is completely invisible otherwise, and it
  // is the difference between a horizon that settles and one that argues with
  // itself for ever. Reported in whole tenths because the exact figure is not
  // the point — whether it is a fraction of a degree or five is.
  let reportedBiasAt = 0;
  const reportGyroBias = (t) => {
    const b = fusion.gyroBias;
    if (!b || t - reportedBiasAt < 10_000) return;
    reportedBiasAt = t;
    const worst = Math.max(Math.abs(b.alpha), Math.abs(b.beta), Math.abs(b.gamma));
    const i = extraBite.findIndex((e) => e.id === 'gyro-bias');
    const entry = {
      id: 'gyro-bias',
      label: 'Gyroscope zero-offset',
      group: 'Sensors',
      status: PASS,
      reason:
        `measured and removed: ${b.alpha.toFixed(1)}, ${b.beta.toFixed(1)}, ${b.gamma.toFixed(1)} °/s on the three axes` +
        ` — every gyroscope reads something while sitting still, and left in it becomes drift${worst > 5 ? ' (this one is large)' : ''}`,
    };
    if (i >= 0) extraBite[i] = entry;
    else extraBite.push(entry);
    bite.setHostEntries(extraBite);
  };

  // ---- derived values ------------------------------------------------------
  // ONE subscriber computes every derived field from what is already in the
  // store. They land in the next publish, 40 ms later, which is invisible and
  // keeps the derivation out of the render path.
  let lastDeclinationAt = 0;
  // The most recent attitude read, so the vertical-speed integrator can be told
  // when the device is being held still without reading the filter twice.
  let lastAttitude = null;
  state.subscribe((snapshot) => {
    const f = snapshot.fields;
    const t = snapshot.t;

    reportAccelSign();
    reportGyroBias(t);

    // WHO OWNS THE FIELDS RIGHT NOW.
    //
    // Exactly one source writes each field, and following an aircraft moves
    // ownership wholesale rather than blending. A panel showing a real 747's
    // groundspeed beside the desk's own accelerometer would be two aircraft at
    // once — which is worse than either alone, and is the sort of thing that
    // looks fine until somebody believes it.
    const following = traffic.isFollowing;

    // Attitude, from the filter.
    //
    // PUBLISHED ON `hasAttitude`, NOT ON `converged`. Gravity alone is a real
    // measurement of which way is down, and it is exact on a device sitting
    // still — which is how this panel spends most of its life. Convergence is
    // the filter's steadiness THROUGH MOTION, so it rides along as the field's
    // reason and shows on the horizon as a caption, instead of deciding whether
    // there is a horizon at all. See the long note in fusion.read().
    if (!following) {
      const att = fusion.read(t);
      lastAttitude = att;
      if (att.hasAttitude) {
        state.write('attitude.pitch', att.pitch, { at: t, reason: att.reason });
        state.write('attitude.roll', att.roll, { at: t, reason: att.reason });
      } else {
        const why = att.reason ?? 'attitude filter has no gravity reference';
        state.fail('attitude.pitch', why);
        state.fail('attitude.roll', why);
      }
      // The compass fails separately from the accelerometer, because it is a
      // different sensor answering a different question.
      if (att.hasHeading) state.write('attitude.heading', att.heading, { at: t });
      else state.fail('attitude.heading', 'no earth-referenced heading source (this device reports no magnetic heading)');
    }

    // Magnetic declination, recomputed when the position moves or every hour.
    if (wmm.model && t - lastDeclinationAt > 60_000) {
      const lat = f['position.lat'];
      const lon = f['position.lon'];
      if (lat && lon && lat.provenance !== 'FAIL' && lon.provenance !== 'FAIL') {
        const solved = magneticField(wmm.model, { latDeg: lat.value, lonDeg: lon.value, date: new Date(t) });
        if (solved) {
          state.write('nav.declination', solved.declinationDeg, { at: t });
          lastDeclinationAt = t;
        } else {
          state.fail('nav.declination', 'WMM evaluation produced no result for this position');
        }
      } else {
        state.fail('nav.declination', 'no position fix — declination is position-dependent');
      }
    }

    geoid.apply(f);
    winds.apply(f);

    // Altitude chain. MSL runs in BOTH modes: it needs only a geometric
    // altitude and the geoid separation at that position, and when following an
    // aircraft both of those are the aircraft's. Everything below it does not,
    // because it needs local weather — see the note in data/traffic.js.
    const msl = mslAltitude({ geometricFt: f['position.altitudeGeometric'], geoidSeparationFt: f['altitude.geoidSeparation'] });
    writeField('altitude.msl', msl, t);

    if (following) {
      traffic.apply();
      return;
    }

    const indicated = indicatedAltitude({
      mslFt: msl,
      kollsmanInHg: f['control.kollsman'],
      stationAltimeterInHg: f['metar.altimeter'],
    });
    writeField('altitude.indicated', indicated, t);
    const pAlt = pressureAltitude({ mslFt: msl, stationAltimeterInHg: f['metar.altimeter'] });
    writeField('altitude.pressure', pAlt, t);

    // Airspeed chain.
    const windField = f['winds.vector'];
    const windDir = fieldFrom(windField, (v) => v.dirDeg);
    const windSpeed = fieldFrom(windField, (v) => v.speedKt);
    const tas = trueAirspeed({
      groundspeedKt: f['position.groundspeed'],
      trackDegTrue: f['position.track'],
      windDirDegFrom: windDir,
      windSpeedKt: windSpeed,
    });
    writeField('speed.tas', tas, t);
    const cas = calibratedAirspeed({ tasKt: tas, pressureAltFt: pAlt, oatC: f['winds.oat'] });
    writeField('speed.cas', cas, t);

    // ZERO-VELOCITY UPDATE. The attitude filter already decides, from gyro rate
    // and gravity magnitude, whether this thing is being held still — so tell
    // the vertical-speed integrator, which otherwise reads a wiggle as the
    // start of a climb. Only when the device owns its own fields: a followed
    // aircraft's vertical speed has nothing to do with this desk being still.
    if (!following) vsi.setStationary(lastAttitude?.still === true, t);

    // Vertical speed and angle of attack.
    const vs = vsi.read({
      altitudeField: f['position.altitudeGeometric'],
      verticalAccelField: f['motion.verticalAccel'],
      // The receiver's own stated accuracy, so the instrument can say what it
      // can and cannot resolve rather than implying a precision it lacks.
      altitudeAccuracyField: f['position.altitudeAccuracy'],
    });
    writeField('vsi.rate', vs, t);
    const aoa = angleOfAttack({ pitchDeg: f['attitude.pitch'], groundspeedKt: f['position.groundspeed'], verticalSpeedFpm: vs });
    writeField('aoa.angle', aoa, t);
  });

  /**
   * Copy a computed field into the store, preserving its provenance and reason.
   *
   * STAMPED WITH THE COMPUTE TIME, and staleness passed as a flag. Using the
   * oldest input's timestamp instead made every value derived from a feed age
   * out immediately — see the long note on mk() in core/derive.js. A derived
   * FAIL must arrive as a FAIL, not as an absent write.
   */
  function writeField(path, field, t) {
    if (!field || field.provenance === 'FAIL') {
      state.fail(path, field?.reason ?? 'not computable');
      return;
    }
    state.write(path, field.value, { at: t, reason: field.reason, stale: field.provenance === 'STALE' });
  }

  /** Pull one member out of a composite field, keeping its provenance. */
  function fieldFrom(field, pick) {
    if (!field || field.provenance === 'FAIL') return field ?? null;
    const v = pick(field.value);
    if (!Number.isFinite(v)) return { provenance: 'FAIL', reason: 'component missing from the wind vector', value: null };
    return { ...field, value: v };
  }

  // ---- feed scheduling -----------------------------------------------------
  async function refreshMetar() {
    const result = await metar.refresh(state.snapshot.fields);
    if (result?.ok) atis.offerStationSetting(result.altimeterInHg);
    else if (result?.reason) atis.applyFallback(result.reason);
  }
  async function refreshWinds() {
    await winds.refresh(state.snapshot.fields);
  }
  // A 429 IS AN INSTRUCTION, NOT AN OBSTACLE (Doctrine §15.3). Noah's report
  // showed the follow poll asking every five seconds THROUGH a rate limit for
  // over a minute: adsb.lol said slow down and the panel did not. Each
  // rate-limited round now doubles the wait before traffic is asked again —
  // any traffic, nearby or followed, because the limit is theirs, not
  // per-endpoint — and one success clears it.
  let trafficPenalty = 0;
  let trafficAllowedAt = 0;
  const noteTrafficResult = (result) => {
    if (result && result.ok === false && /rate limited/.test(String(result.reason ?? ''))) {
      trafficPenalty = Math.min(trafficPenalty + 1, 5);
      trafficAllowedAt = now() + Math.min(FOLLOW_INTERVAL_MS * 2 ** trafficPenalty, 120_000);
    } else if (result && result.ok !== false) {
      trafficPenalty = 0;
      trafficAllowedAt = 0;
    }
  };

  async function refreshTraffic() {
    if (now() < trafficAllowedAt) return;
    // The plan view is only fetched while it is the page being LOOKED AT.
    // Polling a volunteer network to draw a canvas nobody has open is exactly
    // the shape §15.6 forbids — and it is free to avoid, because the page
    // re-asks the moment it is opened.
    // The PFD now carries a navigation display, so it is a page that is LOOKING
    // at the plan view and may ask for it. The rule is unchanged — fetch only
    // for a page somebody has open — and the edge cache means two pages open in
    // turn cost one upstream request, not two.
    if (active === 'radar' || active === 'pfd') {
      noteTrafficResult(await traffic.refreshNearby(state.snapshot.fields, radar.rangeNm));
      trafficBite();
    }
  }
  async function refreshFollowed() {
    if (now() < trafficAllowedAt) return;
    if (traffic.isFollowing) noteTrafficResult(await traffic.refreshFollowed());
  }

  // ---- page switching ------------------------------------------------------
  const pages = {
    pfd: $('page-pfd'),
    atis: $('page-atis'),
    radar: $('page-radar'),
    bite: $('page-bite'),
    setup: $('page-setup'),
  };
  const tabs = [...document.querySelectorAll('[data-page]')];
  let active = 'pfd';

  const show = (name) => {
    if (!pages[name]) return;
    active = name;
    for (const [key, node] of Object.entries(pages)) node.hidden = key !== name;
    for (const tab of tabs) {
      const on = tab.dataset.page === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    }
    // The canvas is only measured while it is on screen; a hidden element has
    // no box, and a size captured then would be zero for ever.
    if (name === 'pfd') surface.measure();
    if (name === 'radar') {
      radar.measure();
      // Opening the page asks at once rather than waiting out the interval —
      // the same reason the first GPS fix re-asks the weather immediately.
      refreshTraffic();
    }
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => show(tab.dataset.page));
    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        show(next.dataset.page);
      }
    });
  }
  show('pfd');

  // The patch notes live on BITE; this is how anyone finds out they exist. It
  // appears once after an update, on the page the reader already opens, and
  // "See what changed" is the only thing that moves them off it.
  const updateBanner = createUpdateBanner({
    onOpen: () => info.open({ scrollTo: '.wn-card' }),
  });
  if (updateBanner) pages.pfd.prepend(updateBanner.root);

  // ---- render loop ---------------------------------------------------------
  state.subscribe((snapshot) => {
    if (active === 'pfd') pfd.render(snapshot);
    else if (active === 'atis') atis.render(snapshot, metar.last);
    else if (active === 'radar') radar.render(snapshot);
    else if (active === 'setup') setup.render();
    else bite.render(snapshot);
  });

  // A BITE row for the traffic service, so "why is the radar empty" is
  // answerable on the page that answers such questions.
  const trafficBite = () => {
    const r = traffic.last;
    const i = extraBite.findIndex((e) => e.id === 'traffic');
    const entry = {
      id: 'traffic',
      label: 'Traffic (adsb.fi)',
      group: 'Feeds',
      status: !r ? DEGRADED : r.ok ? PASS : FAILED,
      reason: !r
        ? 'not asked yet — the radar page fetches when it is opened'
        : r.ok
          ? `${r.aircraft?.length ?? 0} aircraft within ${r.rangeNm} nm, from adsb.fi`
          : r.reason,
    };
    if (i >= 0) extraBite[i] = entry;
    else extraBite.push(entry);
    bite.setHostEntries(extraBite);
  };

  // The levelling, as a BITE row. An instrument whose zero has been MOVED must
  // say so somewhere a person goes looking when a reading seems wrong, and this
  // is that page.
  const mountBite = () => {
    const offset = fusion.mountOffset;
    const stale = offset && offset.capturedAtScreenAngle !== orientation.screenAngle();
    const i = extraBite.findIndex((e) => e.id === 'mount');
    const entry = {
      id: 'mount',
      label: 'Mount levelling',
      group: 'Sensors',
      status: !offset ? PASS : stale ? DEGRADED : PASS,
      reason: !offset
        ? 'not levelled — the horizon is showing this device\u2019s own attitude'
        : stale
          ? `levelled at ${offset.pitchDeg.toFixed(1)}\u00b0 pitch, ${offset.rollDeg.toFixed(1)}\u00b0 roll, but the screen has rotated since so it is NOT being applied`
          : `levelled: the mount is ${offset.pitchDeg.toFixed(1)}\u00b0 in pitch and ${offset.rollDeg.toFixed(1)}\u00b0 in roll, and that is being subtracted`,
    };
    if (i >= 0) extraBite[i] = entry;
    else extraBite.push(entry);
    bite.setHostEntries(extraBite);
  };
  mountBite();
  if (restored?.restored) announcer.say('Saved mount levelling restored.');

  // ---- panel dimming -------------------------------------------------------
  // Two MEASURED palette blocks, never a brightness filter. See
  // palettes/fauxplane.json for why a filter is a contrast failure in disguise.
  let dimMode = 'auto';
  const applyDim = () => {
    const b = ambient.brightness(state.snapshot.fields);
    const wanted = dimMode === 'auto' ? (b.value < 0.62 ? 'night' : 'day') : dimMode;
    if (document.documentElement.dataset.dim !== wanted) {
      document.documentElement.dataset.dim = wanted;
      surface.refreshTokens();
    }
    $('dim-note').textContent = dimMode === 'auto' ? `Auto (${b.from ?? 'no light source'})` : `Manual: ${wanted}`;
  };
  $('dim-toggle').addEventListener('click', () => {
    dimMode = dimMode === 'auto' ? 'day' : dimMode === 'day' ? 'night' : 'auto';
    applyDim();
    announcer.say(`Panel brightness ${dimMode}`);
  });
  setInterval(applyDim, 5000);
  applyDim();

  // ---- backgrounding -------------------------------------------------------
  // Sensors stop when backgrounded on iOS. The honest response is immediate:
  // mark the affected fields STALE the moment we are hidden, and on return hold
  // FAIL until the filter has genuinely reconverged.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      for (const p of ['attitude.pitch', 'attitude.roll', 'attitude.heading', 'attitude.turnRate', 'motion.gLoad', 'motion.lateralG', 'motion.verticalAccel']) {
        state.markStale(p, 'app was backgrounded — sensors stop delivering');
      }
    } else {
      fusion.reset('app returned to the foreground — filter reconverging');
      vsi.reset('app returned to the foreground');
      surface.measure();
      refreshMetar();
    }
  });

  // ---- PANEL POWER ---------------------------------------------------------
  const gate = $('power-gate');
  const powerBtn = $('power-btn');

  // THE WAY OUT IS WIRED FIRST (Doctrine §14). Before the permission plumbing,
  // before anything that can throw. A gate you cannot leave is the worst
  // failure a gate has — and leaving it must work even if every sensor refuses,
  // because that is acceptance criterion 1.
  const dismiss = (why) => {
    gate.close?.();
    gate.hidden = true;
    // THE INSTRUCTIONS OUTLIVE THE GATE. Noah: "turning the panel on closes
    // the initial instructions" — the first-run orientation and install steps
    // lived only on this dialog, so the button a new reader presses first was
    // the thing that took them away, mid-read. The NODE is moved rather than
    // copied: one copy in the markup, relocated, so the two cannot drift.
    //
    // The destination is now the (i) menu, not the SETUP page. SETUP is for
    // levelling, and "what this app is" filed under levelling was findable only
    // by accident. Anything that is information rather than instrumentation
    // belongs behind the one control named for it.
    info.adoptFirstRun(gate.querySelector('.gate-first'));
    document.body.dataset.powered = 'true';
    if (why) announcer.say(why);
    surface.measure();
  };
  for (const btn of document.querySelectorAll('[data-dismiss-gate]')) {
    btn.addEventListener('click', () => dismiss('Continuing without sensors. Instruments will show their failure flags.'));
  }
  gate.addEventListener('cancel', (e) => {
    e.preventDefault();
    dismiss('Continuing without sensors.');
  });

  // Only NOW, with both ways out already attached, is the gate upgraded from
  // the markup's non-modal `open` to a real modal.
  //
  // The `open` attribute is in the HTML so the surface appears even if this
  // module never runs — but a non-modal dialog leaves everything behind it
  // focusable, so a keyboard user could Tab straight into a panel the gate is
  // supposed to be covering. The accessibility gate caught exactly that. A
  // browser without showModal keeps the non-modal surface, which is the
  // outcome it would have had anyway.
  try {
    if (typeof gate.showModal === 'function' && !gate.matches(':modal')) {
      gate.close();
      gate.showModal();
    }
  } catch {
    gate.setAttribute('open', '');
  }

  let started = false;
  const startSensors = async () => {
    if (started) return;
    started = true;
    // These two MUST be called from inside the user gesture on iOS. Awaiting
    // anything before them loses the gesture and the prompt never appears.
    const results = [];
    if (needsMotionPermission()) results.push(['motion', await motion.requestPermission()]);
    if (needsOrientationPermission()) results.push(['orientation', await orientation.requestPermission()]);

    orientation.start();
    motion.start();
    geo.start();
    ambient.start();

    for (const [what, verdict] of results) {
      if (verdict !== 'granted') announcer.say(`${what} permission ${verdict}; those instruments will show FAIL`);
    }

    await refreshMetar();
    await refreshWinds();
    setInterval(refreshMetar, METAR_INTERVAL_MS);
    setInterval(refreshWinds, WINDS_INTERVAL_MS);

    requestWakeLock();
    lockLandscape();
  };

  powerBtn.addEventListener('click', async () => {
    dismiss(null);
    await startSensors();
    announcer.say('Panel powered.');
  });

  /** Everything about the device the report needs. Gathered here because it is
   *  the only place that can see the DOM, the surface and the worker at once. */
  function readEnvironment() {
    return {
      userAgent: navigator.userAgent,
      screenW: screen?.width,
      screenH: screen?.height,
      dpr: window.devicePixelRatio,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      screenAngle: orientation.screenAngle(),
      // BOTH the value in use and the raw platform readings, because "which of
      // these three disagrees" is the whole question on an iPad.
      rawScreenAngle: screen?.orientation?.angle ?? 'absent',
      screenAngleSource: orientation.screenAngleSource,
      windowOrientation: typeof window.orientation === 'number' ? window.orientation : 'absent',
      orientation: screen?.orientation?.type ?? 'unknown',
      rootFontPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      dim: `${document.documentElement.dataset.dim} (${$('dim-note').textContent})`,
      standalone: window.matchMedia?.('(display-mode: standalone)')?.matches ?? false,
      swState: navigator.serviceWorker?.controller ? `controlled (${CACHE_NAME})` : 'not controlled',
      wakeLock: wakeLock ? 'held' : 'not held',
    };
  }

  // ---- PWA plumbing --------------------------------------------------------
  let wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch {
      // A refused wake lock is a DEGRADED capability, which BITE already
      // reports from the static probe. Not worth interrupting anyone over.
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && started && !wakeLock) requestWakeLock();
  });

  function lockLandscape() {
    try {
      screen.orientation?.lock?.('landscape').catch(() => {});
    } catch {
      // Only an installed PWA may lock orientation on most platforms. BITE
      // says so; the panel works either way.
    }
  }

  if ('serviceWorker' in navigator) {
    // TAKE EFFECT ON THE RELOAD THE USER ALREADY DID.
    //
    // A new worker calls skipWaiting and claims the page, but by then this page
    // has already been built from the previous release's cache. Without this,
    // seeing a new version takes TWO reloads — which reads exactly like the
    // deploy not having happened, and is what Noah hit.
    //
    // Guarded so it can only fire once: a reload loop on a cockpit panel would
    // be considerably worse than a stale one.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    // The version travels in the URL so the worker has ONE source for it
    // without needing to be a module worker — see the note at the top of sw.js.
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(VERSION)}`).catch(() => {
      announcer.say('Offline shell unavailable — the panel needs a connection to reload.');
    });
  }

  state.start();

  // TRAFFIC NEEDS NO PERMISSION AND NO SENSOR — only a network. So it is
  // scheduled at boot rather than from PANEL POWER, which means someone who
  // declines every permission still gets a working radar page. That is not a
  // nicety: on a device clamped indoors and not moving, this is the page with
  // the most on it.
  setInterval(refreshTraffic, TRAFFIC_INTERVAL_MS);
  setInterval(refreshFollowed, FOLLOW_INTERVAL_MS);

  // The home reference is shown so nobody reads a pre-fix distance as a
  // distance from the aircraft.
  $('home-note').textContent = `${REGION.home.name} ${REGION.home.lat.toFixed(2)}, ${REGION.home.lon.toFixed(2)}`;
}

boot().catch((err) => {
  // A boot failure must not be a blank screen (acceptance criterion 1). Say
  // what happened, in the page, where it can be photographed.
  const host = document.getElementById('boot-error');
  if (host) {
    host.hidden = false;
    host.replaceChildren(
      el('strong', { text: 'The panel failed to start.' }),
      el('span', { text: ` ${err?.message ?? String(err)}` }),
    );
  }
  throw err;
});

export { DEGRADED, FAILED, PASS };
