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

import { VERSION } from './core/version.js';
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
import { createWindsSource } from './data/windsaloft.js';
import { createGeoidSource } from './data/geoid.js';
import { loadNavdata } from './data/navdata.js';
import { loadModel, magneticField } from './data/wmm.js';

import { createSurface } from './render/canvas.js';
import { createAnnouncer, el } from './render/dom.js';
import { createPfd } from './panels/pfd.js';
import { createAtis } from './panels/atis.js';
import { createBite } from './panels/bite.js';
import { DEGRADED, FAILED, PASS } from './core/capability.js';

const $ = (id) => document.getElementById(id);
const now = () => Date.now();

/** Feed cadences. Each is at or below what the upstream's own cache allows, so
 *  a refresh that lands early costs the edge cache and not the service. */
const METAR_INTERVAL_MS = 60_000;
const WINDS_INTERVAL_MS = 15 * 60_000;

async function boot() {
  // ---- the build stamp, written at BOOT ------------------------------------
  // Doctrine §7b: not when a panel opens. The whole point is that it is already
  // there in a screenshot nobody thought to compose.
  $('build-stamp').textContent = `v${VERSION}`;

  const announcer = createAnnouncer($('announcer'));
  const fusion = createFusion();
  const vsi = createVsi();

  // ---- sensors (constructed now, started only by PANEL POWER) --------------
  const orientation = createOrientationSensor({ state, fusion, clock: now });
  const motion = createMotionSensor({ state, fusion, vsi, screenAngle: orientation.screenAngle, clock: now });
  const ambient = createAmbientSensor({ state, clock: now });
  let sawFirstFix = false;
  const geo = createGeoSensor({
    state,
    vsi,
    clock: now,
    onFix: () => {
      if (!sawFirstFix) {
        sawFirstFix = true;
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

  // ---- panels --------------------------------------------------------------
  const canvas = $('pfd-canvas');
  const surface = createSurface(canvas);
  const pfd = createPfd({ canvas, surface, readoutHost: $('pfd-readouts'), announcer });
  const atis = createAtis({ host: $('page-atis'), state, announcer, clock: now });
  const bite = createBite({ host: $('page-bite'), announcer });

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
    extraBite.push({ id: 'battery-live', label: 'Battery status (BITE entry only)', group: 'Host', status: r.status, reason: r.reason });
    bite.setHostEntries(extraBite);
  });

  const pushNetwork = (r) => {
    const i = extraBite.findIndex((e) => e.id === 'network-live');
    const entry = { id: 'network-live', label: 'Network (BITE entry only)', group: 'Host', status: r.status, reason: r.reason };
    if (i >= 0) extraBite[i] = entry;
    else extraBite.push(entry);
    bite.setHostEntries(extraBite);
  };
  pushNetwork(probeNetwork());
  watchNetwork(pushNetwork);

  const mag = probeMagnetometer();
  extraBite.push({ id: 'magnetometer', label: 'Magnetometer', group: 'Sensors', status: mag.status, reason: mag.reason });
  bite.setHostEntries(extraBite);

  // ---- derived values ------------------------------------------------------
  // ONE subscriber computes every derived field from what is already in the
  // store. They land in the next publish, 40 ms later, which is invisible and
  // keeps the derivation out of the render path.
  let lastDeclinationAt = 0;
  state.subscribe((snapshot) => {
    const f = snapshot.fields;
    const t = snapshot.t;

    // Attitude, from the filter.
    const att = fusion.read(t);
    if (att.converged) {
      state.write('attitude.pitch', att.pitch, { at: t });
      state.write('attitude.roll', att.roll, { at: t });
      if (att.heading !== null) state.write('attitude.heading', att.heading, { at: t });
      else state.fail('attitude.heading', 'no earth-referenced heading source');
    } else {
      const why = att.reason ?? 'attitude filter has not converged';
      state.fail('attitude.pitch', why);
      state.fail('attitude.roll', why);
      state.fail('attitude.heading', why);
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

    // Altitude chain.
    const msl = mslAltitude({ geometricFt: f['position.altitudeGeometric'], geoidSeparationFt: f['altitude.geoidSeparation'] });
    writeField('altitude.msl', msl, t);
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

    // Vertical speed and angle of attack.
    const vs = vsi.read({
      altitudeField: f['position.altitudeGeometric'],
      verticalAccelField: f['motion.verticalAccel'],
    });
    writeField('vsi.rate', vs, t);
    const aoa = angleOfAttack({ pitchDeg: f['attitude.pitch'], groundspeedKt: f['position.groundspeed'], verticalSpeedFpm: vs });
    writeField('aoa.angle', aoa, t);
  });

  /** Copy a computed field into the store, preserving its provenance and its
   *  reason. A derived FAIL must arrive as a FAIL, not as an absent write. */
  function writeField(path, field, t) {
    if (!field || field.provenance === 'FAIL') state.fail(path, field?.reason ?? 'not computable');
    else state.write(path, field.value, { at: field.at ?? t, reason: field.reason });
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

  // ---- page switching ------------------------------------------------------
  const pages = { pfd: $('page-pfd'), atis: $('page-atis'), bite: $('page-bite') };
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

  // ---- render loop ---------------------------------------------------------
  state.subscribe((snapshot) => {
    if (active === 'pfd') pfd.render(snapshot);
    else if (active === 'atis') atis.render(snapshot, metar.last);
    else bite.render(snapshot);
  });

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
    // The version travels in the URL so the worker has ONE source for it
    // without needing to be a module worker — see the note at the top of sw.js.
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(VERSION)}`).catch(() => {
      announcer.say('Offline shell unavailable — the panel needs a connection to reload.');
    });
  }

  state.start();

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
