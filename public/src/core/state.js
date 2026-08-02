/**
 * state.js — the single normalized aircraft-state object. THE core contract.
 *
 * Sensors and data modules WRITE to it. Panels only SUBSCRIBE. No panel reads a
 * sensor and no panel fetches anything; that rule is what keeps every number on
 * screen traceable to one place.
 *
 * Published at a fixed 25 Hz via requestAnimationFrame, decoupled from the
 * sensor callback rate — DeviceMotion fires at 60+ Hz on some devices and 10 Hz
 * on others, and the panel must not inherit either.
 *
 * AGEING IS STRUCTURAL, NOT PER-INSTRUMENT. Every publish re-derives each
 * field's provenance from its age against the freshness window declared in
 * FIELDS below. That is why "kill the network mid-session and watch the feeds
 * go STALE then FAIL" is a property of the store rather than something seven
 * instruments each have to remember to implement.
 */

import { FAIL, age, fail, makeField } from './provenance.js';

/** Publish period. 25 Hz, as specified. */
export const PUBLISH_MS = 40;

/**
 * THE FIELD REGISTRY — the single source for what exists, what it is called,
 * what unit it is in, and how long it stays believable.
 *
 * `kind` decides what a fresh field is called: 'sensor'/'feed' -> LIVE,
 * 'derived' -> DERIVED. Past `freshMs` everything is STALE; past `staleMs`
 * everything is FAIL. Windows are chosen from how fast the underlying quantity
 * actually changes, not from how often we happen to poll.
 */
export const FIELDS = {
  // --- attitude (fusion output) ---------------------------------------------
  'attitude.pitch': { unit: 'deg', kind: 'derived', freshMs: 500, staleMs: 3000, label: 'Pitch' },
  'attitude.roll': { unit: 'deg', kind: 'derived', freshMs: 500, staleMs: 3000, label: 'Roll' },
  'attitude.heading': { unit: 'degM', kind: 'derived', freshMs: 1000, staleMs: 5000, label: 'Heading (magnetic)' },
  'attitude.turnRate': { unit: 'deg/s', kind: 'sensor', freshMs: 500, staleMs: 3000, label: 'Turn rate' },

  // --- raw orientation -------------------------------------------------------
  'orientation.beta': { unit: 'deg', kind: 'sensor', freshMs: 500, staleMs: 3000, label: 'Orientation beta' },
  'orientation.gamma': { unit: 'deg', kind: 'sensor', freshMs: 500, staleMs: 3000, label: 'Orientation gamma' },
  'orientation.compass': { unit: 'degM', kind: 'sensor', freshMs: 1000, staleMs: 5000, label: 'Compass heading' },

  // --- motion ---------------------------------------------------------------
  'motion.gLoad': { unit: 'g', kind: 'derived', freshMs: 500, staleMs: 3000, label: 'Normal acceleration' },
  'motion.lateralG': { unit: 'g', kind: 'derived', freshMs: 500, staleMs: 3000, label: 'Lateral acceleration' },
  'motion.verticalAccel': { unit: 'm/s2', kind: 'derived', freshMs: 500, staleMs: 3000, label: 'Vertical acceleration' },

  // --- position -------------------------------------------------------------
  'position.lat': { unit: 'deg', kind: 'sensor', freshMs: 10000, staleMs: 120000, label: 'Latitude' },
  'position.lon': { unit: 'deg', kind: 'sensor', freshMs: 10000, staleMs: 120000, label: 'Longitude' },
  'position.accuracy': { unit: 'm', kind: 'sensor', freshMs: 10000, staleMs: 120000, label: 'Position accuracy' },
  'position.groundspeed': { unit: 'kt', kind: 'sensor', freshMs: 5000, staleMs: 30000, label: 'Groundspeed' },
  'position.track': { unit: 'degT', kind: 'sensor', freshMs: 5000, staleMs: 30000, label: 'Track (true)' },
  'position.altitudeGeometric': { unit: 'ft', kind: 'sensor', freshMs: 10000, staleMs: 60000, label: 'GPS geometric altitude' },
  'position.altitudeAccuracy': { unit: 'm', kind: 'sensor', freshMs: 10000, staleMs: 60000, label: 'Altitude accuracy' },

  // --- derived flight values ------------------------------------------------
  'altitude.geoidSeparation': { unit: 'ft', kind: 'derived', freshMs: 3600000, staleMs: 86400000, label: 'Geoid separation' },
  'altitude.msl': { unit: 'ft', kind: 'derived', freshMs: 10000, staleMs: 60000, label: 'MSL altitude' },
  'altitude.indicated': { unit: 'ft', kind: 'derived', freshMs: 10000, staleMs: 60000, label: 'Indicated altitude' },
  'altitude.pressure': { unit: 'ft', kind: 'derived', freshMs: 10000, staleMs: 60000, label: 'Pressure altitude' },
  'speed.tas': { unit: 'kt', kind: 'derived', freshMs: 10000, staleMs: 60000, label: 'True airspeed' },
  'speed.cas': { unit: 'kt', kind: 'derived', freshMs: 10000, staleMs: 60000, label: 'Calibrated airspeed' },
  'vsi.rate': { unit: 'fpm', kind: 'derived', freshMs: 3000, staleMs: 15000, label: 'Vertical speed' },
  'aoa.angle': { unit: 'deg', kind: 'derived', freshMs: 2000, staleMs: 10000, label: 'Angle of attack' },
  'nav.declination': { unit: 'deg', kind: 'derived', freshMs: 3600000, staleMs: 86400000, label: 'Magnetic declination' },

  // --- feeds ----------------------------------------------------------------
  'metar.station': { unit: null, kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'METAR station' },
  'metar.distanceNm': { unit: 'nm', kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'METAR station distance' },
  'metar.altimeter': { unit: 'inHg', kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'Altimeter setting' },
  'metar.temp': { unit: 'C', kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'Surface temperature' },
  'metar.dewpoint': { unit: 'C', kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'Surface dewpoint' },
  'metar.wind': { unit: null, kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'Surface wind' },
  'metar.raw': { unit: null, kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'Raw METAR' },
  'metar.observedAt': { unit: null, kind: 'feed', freshMs: 3900000, staleMs: 10800000, label: 'Observation time' },

  'winds.vector': { unit: null, kind: 'feed', freshMs: 3600000, staleMs: 10800000, label: 'Wind aloft at altitude' },
  'winds.oat': { unit: 'C', kind: 'feed', freshMs: 3600000, staleMs: 10800000, label: 'Outside air temperature' },

  // --- panel controls (user input is a real input, and it says so) ----------
  'control.kollsman': { unit: 'inHg', kind: 'sensor', freshMs: 86400000, staleMs: 172800000, label: 'Kollsman setting' },

  // --- environment ----------------------------------------------------------
  'ambient.lux': { unit: 'lx', kind: 'sensor', freshMs: 30000, staleMs: 300000, label: 'Ambient light' },
};

const now = () => (typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now());

class Store {
  constructor({ clock = now } = {}) {
    this.clock = clock;
    /** Raw last-written fields, before ageing. */
    this.raw = new Map();
    /** The last published snapshot. */
    this.snapshot = Object.freeze({ t: 0, fields: Object.freeze({}) });
    this.subscribers = new Set();
    this.running = false;
    this.lastPublish = 0;
    this.frame = null;

    // Every declared field starts as FAIL with a reason, not as absent. A panel
    // that mounts before any sensor has spoken must still render a flag, and
    // acceptance criterion 1 (all permissions denied -> correct failure flags)
    // is satisfied by construction rather than by remembering to seed it.
    for (const [path, spec] of Object.entries(FIELDS)) {
      this.raw.set(path, fail('not yet initialised', { unit: spec.unit }));
    }
    this.publishNow();
  }

  /** Declared spec for a path. Throws on an unknown path — a typo'd field name
   *  would otherwise silently never render, which is invisible in exactly the
   *  way this app cannot afford. */
  spec(path) {
    const s = FIELDS[path];
    if (!s) throw new Error(`unknown state field: ${path}`);
    return s;
  }

  /** Write a sensor/feed reading. `at` defaults to now; pass it when the
   *  source stamped its own time (a METAR observation is older than its fetch). */
  write(path, value, { at = this.clock(), reason = null, stale = false, derived = false } = {}) {
    const spec = this.spec(path);
    if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
      // A sensor that fired with nothing in it has not produced a reading.
      // Recording it as a value would be the defect; record the absence.
      this.raw.set(path, fail(reason ?? 'source produced no value', { unit: spec.unit }));
      return;
    }
    this.raw.set(
      path,
      makeField({
        value,
        unit: spec.unit,
        // `stale` lets a DERIVED value say "my inputs are stale" without
        // faking its own age. See the note on writeField in app.js.
        //
        // `derived` is for a field the registry calls a SENSOR field that is,
        // this time, computed — the turn rate is the gyro's on this device and
        // is worked out from two broadcast ground tracks when following an
        // aircraft. It can only ever WEAKEN a claim (LIVE -> DERIVED); there is
        // no option here that strengthens one, which is deliberate.
        provenance: stale ? 'STALE' : derived || spec.kind === 'derived' ? 'DERIVED' : 'LIVE',
        at,
        ageMs: 0,
        reason,
        forcedStale: stale,
        forcedDerived: derived,
      }),
    );
  }

  /** Record that a field is unavailable, and why. */
  fail(path, reason) {
    const spec = this.spec(path);
    this.raw.set(path, fail(reason, { unit: spec.unit }));
  }

  /**
   * Force a field to STALE immediately, keeping its last value and its original
   * timestamp. Used on visibilitychange: iOS stops delivering sensor events
   * when backgrounded, and the honest thing is to say so at once rather than
   * wait for the freshness window to notice.
   */
  markStale(path, reason) {
    const f = this.raw.get(path);
    if (!f || f.provenance === FAIL) return;
    this.raw.set(
      path,
      makeField({ value: f.value, unit: f.unit, provenance: 'STALE', at: f.at, ageMs: f.ageMs, reason, forcedStale: true }),
    );
  }

  /** Read the last RAW field. Panels use the published snapshot instead. */
  peek(path) {
    return this.raw.get(path) ?? null;
  }

  /** Age every field and hand subscribers an immutable snapshot. */
  publishNow() {
    const t = this.clock();
    const fields = {};
    for (const [path, spec] of Object.entries(FIELDS)) {
      const raw = this.raw.get(path);
      const aged = age(raw, { now: t, freshMs: spec.freshMs, staleMs: spec.staleMs, kind: spec.kind });
      // A field that has aged out is written back, so its FAIL reason persists
      // instead of being recomputed from a timestamp that keeps growing.
      if (aged !== raw && aged.provenance === FAIL && raw.provenance !== FAIL) this.raw.set(path, aged);
      fields[path] = aged;
    }
    this.snapshot = Object.freeze({ t, fields: Object.freeze(fields) });
    for (const fn of this.subscribers) {
      try {
        fn(this.snapshot);
      } catch (err) {
        // One broken instrument must not stop the other six from updating.
        // Silence here would hide a defect, so it is reported and the loop
        // continues.
        console.error('subscriber threw during publish', err);
      }
    }
    this.lastPublish = t;
    return this.snapshot;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    // Protected exactly like the publish loop. A panel that throws on its
    // FIRST render must not stop the remaining panels from being wired — the
    // loop already knew that, and this call did not.
    try {
      fn(this.snapshot);
    } catch (err) {
      console.error('subscriber threw on its first render', err);
    }
    return () => this.subscribers.delete(fn);
  }

  /** Start the 25 Hz publish loop. rAF gives us the frame cadence; the
   *  accumulator gives us the fixed rate regardless of what rAF is doing. */
  start() {
    if (this.running || typeof requestAnimationFrame !== 'function') return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      if (this.clock() - this.lastPublish >= PUBLISH_MS) this.publishNow();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

export function createStore(options) {
  return new Store(options);
}

/** The app's single store. Tests build their own with createStore(). */
export const state = createStore();

export { FAIL };
