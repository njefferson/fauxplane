import assert from 'node:assert/strict';
import test from 'node:test';

import {
  angleDelta,
  bboxAround,
  formatAge,
  greatCircleNm,
  hPaToInHg,
  msToKt,
  mToFt,
  pressureAltitudeOffsetFt,
  tasToCas,
  wrap180,
  wrap360,
} from '../public/src/core/units.js';
import { DERIVED, FAIL, LIVE, STALE, age, derived, fail, makeField, reading, worstOf } from '../public/src/core/provenance.js';
import { FIELDS, createStore } from '../public/src/core/state.js';
import { REGION } from '../public/src/core/region.js';

/* ------------------------------------------------------------------ units */

test('conversions round-trip and refuse a null', () => {
  assert.ok(Math.abs(msToKt(1) - 1.943844) < 1e-5);
  assert.ok(Math.abs(mToFt(1000) - 3280.8399) < 1e-3);
  assert.ok(Math.abs(hPaToInHg(1013.25) - 29.9213) < 1e-3);
  for (const fn of [msToKt, mToFt, hPaToInHg]) {
    assert.equal(fn(null), null);
    assert.equal(fn(undefined), null);
    assert.equal(fn(NaN), null);
  }
});

test('angles wrap the short way, including across the seam', () => {
  assert.equal(wrap360(370), 10);
  assert.equal(wrap360(-10), 350);
  assert.equal(wrap180(190), -170);
  assert.equal(angleDelta(359, 1), 2);
  assert.equal(angleDelta(1, 359), -2);
  assert.equal(angleDelta(10, 10), 0);
  assert.equal(angleDelta(null, 10), null);
});

test('the altimeter offset is zero at standard and signed correctly', () => {
  assert.ok(Math.abs(pressureAltitudeOffsetFt(29.9213)) < 1, 'standard setting must give a zero offset');
  // A HIGHER setting than standard means pressure altitude is BELOW true
  // altitude. Getting this backwards puts an aircraft a thousand feet from
  // where the instrument says it is.
  assert.ok(pressureAltitudeOffsetFt(30.92) < 0, 'a high setting must give a negative offset');
  assert.ok(pressureAltitudeOffsetFt(28.92) > 0, 'a low setting must give a positive offset');
  // Roughly 1000 ft per inch near sea level, the rule of thumb it should agree
  // with even though it is derived from the hypsometric relation.
  const perInch = pressureAltitudeOffsetFt(28.9213) - pressureAltitudeOffsetFt(29.9213);
  assert.ok(perInch > 850 && perInch < 1150, `an inch of mercury moved it ${perInch} ft`);
  assert.equal(pressureAltitudeOffsetFt(null), null);
  assert.equal(pressureAltitudeOffsetFt(0), null);
});

test('TAS to CAS REFUSES a missing atmosphere rather than assuming one', () => {
  assert.equal(tasToCas(120, { pressureAltFt: null, oatC: 15 }), null);
  assert.equal(tasToCas(120, { pressureAltFt: 5000, oatC: null }), null);
  assert.equal(tasToCas(null, { pressureAltFt: 5000, oatC: 5 }), null);
  // At sea level in standard conditions CAS and TAS coincide.
  const atSeaLevel = tasToCas(120, { pressureAltFt: 0, oatC: 15 });
  assert.ok(Math.abs(atSeaLevel - 120) < 1.5, `sea-level CAS was ${atSeaLevel}`);
  // Higher up, CAS is lower than TAS — the direction pilots rely on.
  const atAltitude = tasToCas(120, { pressureAltFt: 10000, oatC: -5 });
  assert.ok(atAltitude < 120 - 5, `CAS at 10 000 ft was ${atAltitude}, not meaningfully below TAS`);
});

test('great-circle distance is right at a known separation', () => {
  // One minute of latitude is one nautical mile, by definition.
  const d = greatCircleNm({ lat: 38.0, lon: -121.0 }, { lat: 38.0166667, lon: -121.0 });
  assert.ok(Math.abs(d - 1) < 0.01, `a minute of latitude measured ${d} nm`);
  assert.equal(greatCircleNm(null, { lat: 1, lon: 1 }), null);
});

test('a bbox around a point accounts for longitude shrinking with latitude', () => {
  const box = bboxAround({ lat: REGION.home.lat, lon: REGION.home.lon }, 40);
  assert.ok(Math.abs(box.latMax - box.latMin - 40 / 30) < 1e-9);
  // At 38.68 N a degree of longitude is about 78% of a degree of latitude, so
  // the box must be WIDER in longitude, not square. A square box is 22% short
  // at this latitude.
  assert.ok(box.lonMax - box.lonMin > box.latMax - box.latMin, 'the longitude span must exceed the latitude span');
  assert.equal(bboxAround({ lat: NaN, lon: 0 }, 40), null);
});

test('formatAge is readable at every scale', () => {
  assert.equal(formatAge(0), '0s');
  assert.equal(formatAge(45_000), '45s');
  assert.equal(formatAge(90_000), '1m');
  assert.equal(formatAge(7_200_000), '2h');
  assert.equal(formatAge(null), '--');
});

/* ------------------------------------------------------------- provenance */

test('a FAIL field CANNOT carry a value, and a value CANNOT lack a source', () => {
  assert.throws(() => makeField({ provenance: FAIL, value: 0, reason: 'x' }), /synthetic-data defect/);
  assert.throws(() => makeField({ provenance: LIVE, value: null, at: 1 }), /must carry a value/);
  assert.throws(() => makeField({ provenance: LIVE, value: 5 }), /must say WHEN/);
  assert.throws(() => makeField({ provenance: FAIL }), /must explain itself/);
  assert.throws(() => makeField({ provenance: 'MAYBE', value: 1, at: 1 }), /provenance must be one of/);
});

test('ageing walks a field LIVE to STALE to FAIL, and says how old', () => {
  const f = reading(42, { unit: 'kt', at: 1000 });
  const opts = { freshMs: 5000, staleMs: 30000, kind: 'sensor' };

  const live = age(f, { now: 3000, ...opts });
  assert.equal(live.provenance, LIVE);
  assert.equal(live.ageMs, 2000);

  const stale = age(f, { now: 10000, ...opts });
  assert.equal(stale.provenance, STALE);
  assert.equal(stale.value, 42, 'a STALE field keeps its last known good value');
  assert.equal(stale.ageMs, 9000);

  const dead = age(f, { now: 60000, ...opts });
  assert.equal(dead.provenance, FAIL);
  assert.equal(dead.value, null, 'a FAILed field must not keep showing its value');
  assert.match(dead.reason, /no update for 59s/);
});

test('a derived field is DERIVED while fresh, not LIVE', () => {
  const f = derived(1, { at: 1000 });
  assert.equal(age(f, { now: 1100, freshMs: 5000, staleMs: 9000, kind: 'derived' }).provenance, DERIVED);
});

test('worstOf takes the WORST input, and the OLDEST timestamp', () => {
  const good = reading(1, { at: 5000 });
  const old = { ...reading(2, { at: 1000 }), provenance: STALE };
  const dead = fail('sensor denied');

  assert.equal(worstOf({ a: good, b: good }).provenance, DERIVED);

  const withStale = worstOf({ a: good, b: old });
  assert.equal(withStale.provenance, STALE);
  // The derived value is as old as its OLDEST input. Stamping it "now" would
  // launder a stale input into a fresh-looking output.
  assert.equal(withStale.at, 1000);

  const withFail = worstOf({ groundspeed: good, wind: dead });
  assert.equal(withFail.provenance, FAIL);
  assert.match(withFail.reason, /wind: sensor denied/);

  // With SEVERAL failures the names are all listed but only the first reason
  // is quoted — a gauge face is not a place for four sentences.
  const many = worstOf({ groundspeed: fail('no fix'), wind: dead, oat: fail('no feed') });
  assert.match(many.reason, /groundspeed, wind, oat unavailable \(groundspeed: no fix\)/);
  assert.ok(many.reason.length < 120, `a chained reason grew to ${many.reason.length} characters`);
});

/* ------------------------------------------------------------------ state */

test('every declared field starts as FAIL with a reason, before any sensor speaks', () => {
  const store = createStore({ clock: () => 1000 });
  const { fields } = store.snapshot;
  assert.equal(Object.keys(fields).length, Object.keys(FIELDS).length);
  for (const [path, f] of Object.entries(fields)) {
    assert.equal(f.provenance, FAIL, `${path} did not start FAILed`);
    assert.equal(f.value, null);
    assert.ok(f.reason, `${path} started FAILed with no reason`);
  }
});

test('an unknown field path throws rather than silently never rendering', () => {
  const store = createStore({ clock: () => 0 });
  assert.throws(() => store.write('position.altitud', 1), /unknown state field/);
  assert.throws(() => store.fail('nope', 'x'), /unknown state field/);
});

test('a sensor that fires with nothing in it records ABSENCE, not a value', () => {
  const store = createStore({ clock: () => 0 });
  store.write('position.groundspeed', null);
  assert.equal(store.peek('position.groundspeed').provenance, FAIL);
  store.write('position.groundspeed', NaN);
  assert.equal(store.peek('position.groundspeed').provenance, FAIL);
});

test('publishing ages every field against its own declared window', () => {
  let now = 1000;
  const store = createStore({ clock: () => now });
  store.write('position.groundspeed', 90);
  assert.equal(store.publishNow().fields['position.groundspeed'].provenance, LIVE);

  now = 1000 + FIELDS['position.groundspeed'].freshMs + 1;
  assert.equal(store.publishNow().fields['position.groundspeed'].provenance, STALE);

  now = 1000 + FIELDS['position.groundspeed'].staleMs + 1;
  const dead = store.publishNow().fields['position.groundspeed'];
  assert.equal(dead.provenance, FAIL);
  assert.equal(dead.value, null);
});

test('markStale keeps the value and the ORIGINAL timestamp — backgrounding is honest', () => {
  let now = 1000;
  const store = createStore({ clock: () => now });
  store.write('attitude.turnRate', 3);
  store.markStale('attitude.turnRate', 'app was backgrounded');

  now = 1200;
  const f = store.publishNow().fields['attitude.turnRate'];
  assert.equal(f.provenance, STALE);
  assert.equal(f.value, 3);
  assert.equal(f.ageMs, 200, 'the age must be measured from the reading, not from when it was marked');
});

test('one throwing subscriber does not stop the others', () => {
  const store = createStore({ clock: () => 0 });
  let reached = false;
  store.subscribe(() => {
    throw new Error('a broken instrument');
  });
  store.subscribe(() => {
    reached = true;
  });
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a);
  try {
    store.publishNow();
  } finally {
    console.error = original;
  }
  assert.equal(reached, true, 'the second subscriber never ran');
  assert.equal(errors.length, 1, 'the failure was swallowed instead of reported');
});

test('a snapshot is frozen, so no panel can write to the state it renders', () => {
  const store = createStore({ clock: () => 0 });
  const snap = store.publishNow();
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.fields));
  assert.ok(Object.isFrozen(snap.fields['position.lat']));
});

test('every declared field has a unit, a label and a sane freshness window', () => {
  for (const [path, spec] of Object.entries(FIELDS)) {
    assert.ok(spec.label, `${path} has no label — BITE and the readouts both print it`);
    assert.ok(['sensor', 'feed', 'derived'].includes(spec.kind), `${path} has kind ${spec.kind}`);
    assert.ok(spec.freshMs > 0, `${path} has no freshness window`);
    assert.ok(spec.staleMs > spec.freshMs, `${path} would go FAIL before it went STALE`);
  }
});

/* ---------------------------------------------------------------------------
 * THE ALTIMETER REGRESSION.
 *
 * Indicated and pressure altitude could never be shown at all: they were
 * stamped with their OLDEST input's timestamp, and a METAR observation is
 * always several minutes old while their freshness window is sixty seconds. On
 * The owner's device the altimeter read "no update for 806s (limit 60s)" — 806
 * seconds being precisely the age of the observation it came from.
 *
 * Every unit test passed throughout, because each one exercised the derivation
 * with same-instant inputs. The bug lived in the interaction between the
 * derivation and the store's ageing, and only real data has inputs of genuinely
 * different ages.
 * ------------------------------------------------------------------------- */

const { indicatedAltitude, mslAltitude } = await import('../public/src/core/derive.js');

/** Mirrors app.js's writeField exactly, so this tests the real path. */
function writeDerived(store, path, field, now) {
  if (!field || field.provenance === 'FAIL') {
    store.fail(path, field?.reason ?? 'not computable');
    return;
  }
  store.write(path, field.value, { at: now, reason: field.reason, stale: field.provenance === 'STALE' });
}

test('an altitude derived from a 13-MINUTE-OLD METAR is still shown', () => {
  let now = 10_000_000;
  const store = createStore({ clock: () => now });
  const thirteenMinutes = 13 * 60 * 1000;

  // A METAR observed 13 minutes ago is perfectly normal and well inside its own
  // 65-minute freshness window.
  store.write('metar.altimeter', 29.99, { at: now - thirteenMinutes });
  store.write('position.altitudeGeometric', 1200, { at: now });
  store.write('altitude.geoidSeparation', -105, { at: now });
  store.write('control.kollsman', 29.99, { at: now });

  const f = store.publishNow().fields;
  assert.equal(f['metar.altimeter'].provenance, LIVE, 'a 13-minute-old METAR must still be LIVE');

  const msl = mslAltitude({ geometricFt: f['position.altitudeGeometric'], geoidSeparationFt: f['altitude.geoidSeparation'] });
  const indicated = indicatedAltitude({
    mslFt: msl,
    kollsmanInHg: f['control.kollsman'],
    stationAltimeterInHg: f['metar.altimeter'],
  });
  writeDerived(store, 'altitude.indicated', indicated, now);

  now += 100;
  const out = store.publishNow().fields['altitude.indicated'];
  assert.equal(out.provenance, DERIVED, `indicated altitude came out ${out.provenance}: ${out.reason}`);
  assert.ok(Math.abs(out.value - 1305) < 1, `expected about 1305 ft, got ${out.value}`);
});

test('...but a METAR past its OWN window drags the altitude to STALE, not to fresh', () => {
  let now = 10_000_000;
  const store = createStore({ clock: () => now });
  // Past metar.altimeter's 65-minute freshness window, inside its 3-hour limit.
  const seventyMinutes = 70 * 60 * 1000;

  store.write('metar.altimeter', 29.99, { at: now - seventyMinutes });
  store.write('position.altitudeGeometric', 1200, { at: now });
  store.write('altitude.geoidSeparation', -105, { at: now });
  store.write('control.kollsman', 29.99, { at: now });

  const f = store.publishNow().fields;
  assert.equal(f['metar.altimeter'].provenance, STALE, 'setup wrong: the METAR should be STALE by now');

  const msl = mslAltitude({ geometricFt: f['position.altitudeGeometric'], geoidSeparationFt: f['altitude.geoidSeparation'] });
  const indicated = indicatedAltitude({
    mslFt: msl,
    kollsmanInHg: f['control.kollsman'],
    stationAltimeterInHg: f['metar.altimeter'],
  });
  writeDerived(store, 'altitude.indicated', indicated, now);

  now += 100;
  const out = store.publishNow().fields['altitude.indicated'];
  // Stamping the compute time must NOT launder a stale input into a fresh
  // output. The staleness rides the flag instead of the clock.
  assert.equal(out.provenance, STALE, `a stale altimeter setting must make the altitude STALE, got ${out.provenance}`);
  assert.ok(out.value !== null, 'a STALE value keeps its last known good number');
  assert.match(out.reason ?? '', /stale/i);
});

test('a derived value that STOPS being computed still ages out', () => {
  let now = 10_000_000;
  const store = createStore({ clock: () => now });
  store.write('altitude.indicated', 1300, { at: now });
  assert.equal(store.publishNow().fields['altitude.indicated'].provenance, DERIVED);

  // The derivation stops running. That is what the timestamp is now for, and it
  // must still be caught.
  now += FIELDS['altitude.indicated'].staleMs + 1;
  const out = store.publishNow().fields['altitude.indicated'];
  assert.equal(out.provenance, FAIL);
  assert.match(out.reason, /no update for/);
});

/* ------------------------------------------------------------------------- */

test('the service worker never searches OTHER releases’ caches', async () => {
  // `caches.match(x)` searches every cache in the origin, oldest first, so a new
  // worker will happily serve the previous release's modules — the page then
  // runs old code behind a new index.html and reports the old version. There is
  // no headless way to exercise a real service-worker upgrade here, so this
  // pins the one line that causes it.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sw = await readFile(path.join(repo, 'public', 'sw.js'), 'utf8');

  const unscoped = sw.match(/(?<!\/\/.*)\bcaches\.match\s*\(/g) ?? [];
  assert.equal(
    unscoped.length,
    0,
    'sw.js uses caches.match(), which searches every release’s cache. Open CACHE_NAME and match on that instead.',
  );
  assert.match(sw, /caches\.open\(CACHE_NAME\)/, 'sw.js must scope lookups to its own cache');
});

test('every shipped module is in the service worker precache list', async () => {
  // A new module that nobody adds to the list works perfectly online and fails
  // only offline, on someone else's device, with no error anyone sees. This
  // release added two modules and the list was updated by hand — which is
  // exactly the kind of memory that eventually misses one.
  const { readdir, readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = path.join(repo, 'public', 'src');

  const walk = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
  };

  const sw = await readFile(path.join(repo, 'public', 'sw.js'), 'utf8');
  const missing = (await walk(src))
    .map((f) => `/${path.relative(path.join(repo, 'public'), f).split(path.sep).join('/')}`)
    .filter((rel) => !sw.includes(`'${rel}'`));

  assert.deepEqual(missing, [], `not precached, so the app breaks offline: ${missing.join(', ')}`);
});
