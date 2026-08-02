/**
 * capability.js — per-instrument capability detection.
 *
 * PER-INSTRUMENT, NEVER A GLOBAL FALLBACK. iOS has no Generic Sensor API, no
 * Battery Status, no AmbientLightSensor and no Vibration, but it does have
 * DeviceMotion and DeviceOrientation behind a permission prompt. A single
 * "is this Chromium?" branch gets every one of those wrong; each probe below
 * asks about exactly one capability.
 *
 * The result is what the BITE page renders. It is the user-visible capability
 * matrix, not a debug console, so every entry carries a reason a pilot can act
 * on rather than a stack trace.
 */

export const PASS = 'PASS';
export const DEGRADED = 'DEGRADED';
export const FAILED = 'FAIL';

/**
 * Non-hue channel for BITE status (Doctrine §4 — declared before the code).
 * Each status has a distinct GLYPH and its own WORD; colour only reinforces.
 */
export const STATUS_MARK = {
  [PASS]: { glyph: '●', word: 'PASS' },
  [DEGRADED]: { glyph: '◐', word: 'DEGRADED' },
  [FAILED]: { glyph: '✕', word: 'FAIL' },
};

const has = (obj, key) => typeof obj !== 'undefined' && obj !== null && key in obj;

/** iOS gates the motion/orientation events behind a call that must originate
 *  from a user gesture. Detecting the METHOD is what tells us a gesture is
 *  required — never the user agent string. */
export const needsMotionPermission = () =>
  typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';

export const needsOrientationPermission = () =>
  typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

/**
 * Static probes — what the platform offers before anything is switched on.
 * Each returns { id, label, status, reason, group }.
 *
 * `status` here is the BEST the platform can do. Whether a sensor is actually
 * delivering is a runtime fact the BITE page merges in from live state, because
 * "the API exists" and "the API is producing readings" are different claims and
 * conflating them is how a capability matrix starts lying.
 */
export function probeStatic() {
  const out = [];
  const add = (id, label, group, status, reason) => out.push({ id, label, group, status, reason });

  // --- orientation ----------------------------------------------------------
  if (typeof DeviceOrientationEvent === 'undefined') {
    add('orientation', 'Attitude (device orientation)', 'Sensors', FAILED, 'DeviceOrientationEvent not implemented by this browser');
  } else if (needsOrientationPermission()) {
    add('orientation', 'Attitude (device orientation)', 'Sensors', PASS, 'available after PANEL POWER grants motion access');
  } else {
    add('orientation', 'Attitude (device orientation)', 'Sensors', PASS, 'available without a permission prompt');
  }

  // --- absolute heading -----------------------------------------------------
  // Three different platforms, three different mechanisms, and the branch is on
  // the mechanism rather than on the browser.
  const hasAbsoluteEvent = typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window;
  const hasAbsoluteSensor = typeof window !== 'undefined' && typeof window.AbsoluteOrientationSensor === 'function';
  if (hasAbsoluteEvent) {
    add('heading', 'Magnetic heading', 'Sensors', PASS, 'deviceorientationabsolute (alpha is earth-referenced)');
  } else if (hasAbsoluteSensor) {
    add('heading', 'Magnetic heading', 'Sensors', PASS, 'AbsoluteOrientationSensor');
  } else if (needsOrientationPermission()) {
    add('heading', 'Magnetic heading', 'Sensors', PASS, 'iOS webkitCompassHeading, after PANEL POWER');
  } else {
    add('heading', 'Magnetic heading', 'Sensors', FAILED, 'no earth-referenced heading source on this platform');
  }

  // --- motion ---------------------------------------------------------------
  if (typeof DeviceMotionEvent === 'undefined') {
    add('motion', 'G-meter, slip/skid, turn rate', 'Sensors', FAILED, 'DeviceMotionEvent not implemented by this browser');
  } else {
    add('motion', 'G-meter, slip/skid, turn rate', 'Sensors', PASS, needsMotionPermission() ? 'available after PANEL POWER grants motion access' : 'available without a permission prompt');
  }

  // --- geolocation ----------------------------------------------------------
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    add('geo', 'GPS position, groundspeed, track', 'Sensors', FAILED, 'Geolocation API not available');
  } else {
    add('geo', 'GPS position, groundspeed, track', 'Sensors', PASS, 'watchPosition with high accuracy');
  }

  // --- ambient light, and its two declared fallbacks -------------------------
  if (typeof window !== 'undefined' && typeof window.AmbientLightSensor === 'function') {
    add('ambient', 'Panel dimming', 'Sensors', PASS, 'AmbientLightSensor');
  } else if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    add('ambient', 'Panel dimming', 'Sensors', DEGRADED, 'no AmbientLightSensor — camera luminance is available but is not enabled without a request');
  } else {
    add('ambient', 'Panel dimming', 'Sensors', DEGRADED, 'no light sensor and no camera — dimming is manual');
  }

  // --- v1 BITE-only entries -------------------------------------------------
  // Declared in v1 as capability entries ONLY. They are not instrument sources,
  // and nothing on the PFD reads them.
  if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
    add('battery', 'Battery status (BITE entry only)', 'Host', PASS, 'Battery Status API present; not an instrument source in v1');
  } else {
    add('battery', 'Battery status (BITE entry only)', 'Host', FAILED, 'Battery Status API not implemented (expected on iOS)');
  }

  if (typeof navigator !== 'undefined' && navigator.connection) {
    add('network', 'Network information (BITE entry only)', 'Host', PASS, 'Network Information API present; not an instrument source in v1');
  } else {
    add('network', 'Network information (BITE entry only)', 'Host', FAILED, 'Network Information API not implemented (expected on iOS)');
  }

  // --- PWA plumbing ---------------------------------------------------------
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    add('wakelock', 'Screen wake lock', 'Host', PASS, 'Screen Wake Lock API present');
  } else {
    add('wakelock', 'Screen wake lock', 'Host', DEGRADED, 'no Wake Lock API — the screen may sleep in flight');
  }

  if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.lock === 'function') {
    add('orientationlock', 'Landscape lock', 'Host', PASS, 'Screen Orientation lock available (installed PWA only on some platforms)');
  } else {
    add('orientationlock', 'Landscape lock', 'Host', DEGRADED, 'no orientation lock — mount the device in landscape manually');
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    add('serviceworker', 'Offline shell', 'Host', PASS, 'Service worker supported');
  } else {
    add('serviceworker', 'Offline shell', 'Host', FAILED, 'no service worker — the panel will not run offline');
  }

  return out;
}

/**
 * Merge the static probe with what the store is actually delivering.
 *
 * The rule this encodes: an API that exists but has produced nothing is
 * DEGRADED or FAIL, never PASS. "Supported" is a claim about the browser;
 * BITE is asked a question about the aircraft.
 */
export function mergeRuntime(entries, fields, checks) {
  return entries.map((entry) => {
    const check = checks[entry.id];
    if (!check) return entry;
    const verdict = check(fields, entry);
    if (!verdict) return entry;
    return { ...entry, ...verdict };
  });
}
