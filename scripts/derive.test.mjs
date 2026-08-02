import assert from 'node:assert/strict';
import test from 'node:test';

import { derived, fail, reading } from '../public/src/core/provenance.js';
import {
  AOA_MIN_GROUNDSPEED_KT,
  angleOfAttack,
  calibratedAirspeed,
  createVsi,
  indicatedAltitude,
  mslAltitude,
  pressureAltitude,
  trueAirspeed,
} from '../public/src/core/derive.js';
import { selectStation } from '../public/src/data/metar.js';
import { interpolateLevels } from '../public/src/data/windsaloft.js';
import { decimalYear, magneticField, parseCof } from '../public/src/data/wmm.js';
import { sampleGrid } from '../public/src/data/geoid.js';
import { trafficBbox } from '../public/src/data/traffic.js';
import { brightnessFromLux, brightnessFromSolarElevation, DIM_FLOOR, solarElevationDeg } from '../public/src/sensors/ambient.js';

const at = 1_000_000;
const R = (v, unit) => reading(v, { unit, at });

/* ------------------------------------------------------------- altitudes */

test('MSL altitude needs the geoid term and FAILS by name without it', () => {
  const ok = mslAltitude({ geometricFt: R(1500, 'ft'), geoidSeparationFt: R(-100, 'ft') });
  assert.equal(ok.provenance, 'DERIVED');
  assert.equal(ok.value, 1600);

  const missing = mslAltitude({ geometricFt: R(1500, 'ft'), geoidSeparationFt: fail('no geoid model bundled') });
  assert.equal(missing.provenance, 'FAIL');
  assert.equal(missing.value, null);
  assert.match(missing.reason, /geoid separation: no geoid model bundled/);
});

test('indicated altitude equals MSL when the dial matches the station', () => {
  const msl = R(3000, 'ft');
  const same = indicatedAltitude({ mslFt: msl, kollsmanInHg: R(30.12), stationAltimeterInHg: R(30.12) });
  assert.ok(Math.abs(same.value - 3000) < 1e-6, `indicated was ${same.value}`);

  // Dial HIGHER than the field and the altimeter over-reads — the direction
  // every altimeter-setting error takes, and the one worth pinning.
  const high = indicatedAltitude({ mslFt: msl, kollsmanInHg: R(31.12), stationAltimeterInHg: R(30.12) });
  assert.ok(high.value > 3800 && high.value < 4200, `a 1.00 inHg over-set gave ${high.value} ft, expected about 4000`);

  const low = indicatedAltitude({ mslFt: msl, kollsmanInHg: R(29.12), stationAltimeterInHg: R(30.12) });
  assert.ok(low.value < 2200 && low.value > 1800, `a 1.00 inHg under-set gave ${low.value} ft, expected about 2000`);
});

test('indicated altitude FAILS without a station setting rather than assuming standard', () => {
  const none = indicatedAltitude({
    mslFt: R(3000, 'ft'),
    kollsmanInHg: R(29.92),
    stationAltimeterInHg: fail('no station in the box reported an altimeter setting'),
  });
  assert.equal(none.provenance, 'FAIL');
  assert.match(none.reason, /station altimeter/);
});

test('pressure altitude ignores the dial and follows the real pressure field', () => {
  const msl = R(3000, 'ft');
  const a = pressureAltitude({ mslFt: msl, stationAltimeterInHg: R(29.92) });
  const b = pressureAltitude({ mslFt: msl, stationAltimeterInHg: R(29.92) });
  assert.equal(a.value, b.value);
  assert.ok(Math.abs(a.value - 3000) < 15, `at standard pressure it should be about MSL, got ${a.value}`);

  const highPressure = pressureAltitude({ mslFt: msl, stationAltimeterInHg: R(30.92) });
  assert.ok(highPressure.value < a.value, 'high pressure must lower the pressure altitude');
});

/* --------------------------------------------------------------- airspeed */

test('TAS subtracts the wind vector — and does not add it', () => {
  // Flying north at 100 kt groundspeed with a 20 kt wind FROM the north (a
  // headwind) means the aircraft is moving 120 kt through the air.
  const headwind = trueAirspeed({
    groundspeedKt: R(100, 'kt'),
    trackDegTrue: R(0, 'degT'),
    windDirDegFrom: R(0),
    windSpeedKt: R(20, 'kt'),
  });
  assert.ok(Math.abs(headwind.value - 120) < 1e-6, `headwind gave TAS ${headwind.value}, expected 120`);

  // The same wind on the tail: 80 kt through the air.
  const tailwind = trueAirspeed({
    groundspeedKt: R(100, 'kt'),
    trackDegTrue: R(0, 'degT'),
    windDirDegFrom: R(180),
    windSpeedKt: R(20, 'kt'),
  });
  assert.ok(Math.abs(tailwind.value - 80) < 1e-6, `tailwind gave TAS ${tailwind.value}, expected 80`);
});

test('TAS reports the air-mass heading, which crab makes different from track', () => {
  const crosswind = trueAirspeed({
    groundspeedKt: R(100, 'kt'),
    trackDegTrue: R(0, 'degT'),
    windDirDegFrom: R(270), // from the west, pushing east
    windSpeedKt: R(20, 'kt'),
  });
  // Heading must be west of north to hold a northerly track in a westerly.
  assert.ok(crosswind.airHeadingDegTrue > 270 && crosswind.airHeadingDegTrue < 360, `heading ${crosswind.airHeadingDegTrue}`);
});

test('TAS FAILS, naming the input, when the wind is unknown', () => {
  const noWind = trueAirspeed({
    groundspeedKt: R(100, 'kt'),
    trackDegTrue: R(0, 'degT'),
    windDirDegFrom: fail('no winds aloft data'),
    windSpeedKt: fail('no winds aloft data'),
  });
  assert.equal(noWind.provenance, 'FAIL');
  assert.match(noWind.reason, /wind direction/);
});

test('CAS refuses to be computed without a real OAT', () => {
  const tas = derived(140, { unit: 'kt', at });
  const noOat = calibratedAirspeed({ tasKt: tas, pressureAltFt: R(8000, 'ft'), oatC: fail('no winds aloft data') });
  assert.equal(noOat.provenance, 'FAIL');
  assert.match(noOat.reason, /OAT/);

  const ok = calibratedAirspeed({ tasKt: tas, pressureAltFt: R(8000, 'ft'), oatC: R(0, 'C') });
  assert.equal(ok.provenance, 'DERIVED');
  assert.ok(ok.value < 140, 'CAS must be below TAS at altitude');
});

/* ------------------------------------------------------------------- AoA */

test('AoA is FORCED to FAIL below 20 kt, with the reason shown', () => {
  const slow = angleOfAttack({ pitchDeg: R(5, 'deg'), groundspeedKt: R(AOA_MIN_GROUNDSPEED_KT - 1, 'kt'), verticalSpeedFpm: R(0, 'fpm') });
  assert.equal(slow.provenance, 'FAIL');
  assert.match(slow.reason, /below 20 kt/);
});

test('AoA is pitch minus the flight-path angle', () => {
  // 100 kt is 10 127 ft/min over the ground. A 1013 fpm climb is about 5.7
  // degrees of flight path, so a 10 degree pitch leaves about 4.3 of AoA.
  const a = angleOfAttack({ pitchDeg: R(10, 'deg'), groundspeedKt: R(100, 'kt'), verticalSpeedFpm: R(1012.7, 'fpm') });
  assert.equal(a.provenance, 'DERIVED');
  assert.ok(Math.abs(a.value - 4.3) < 0.2, `AoA was ${a.value}, expected about 4.3`);

  // Level flight: AoA is exactly pitch.
  const level = angleOfAttack({ pitchDeg: R(3, 'deg'), groundspeedKt: R(100, 'kt'), verticalSpeedFpm: R(0, 'fpm') });
  assert.ok(Math.abs(level.value - 3) < 1e-9);
});

/* ------------------------------------------------------------------- VSI */

test('the VSI needs BOTH legs — neither alone is the instrument', () => {
  const vsi = createVsi();
  let t = 0;
  for (let i = 0; i < 40; i += 1) {
    t += 250;
    vsi.updateAltitude(1000 + (t / 1000) * (500 / 60), t); // a steady 500 fpm climb
    vsi.updateAccel(0, t);
  }

  const both = vsi.read({ altitudeField: R(1200, 'ft'), verticalAccelField: R(0, 'm/s2') });
  assert.equal(both.provenance, 'DERIVED');
  assert.ok(Math.abs(both.value - 500) < 60, `converged to ${both.value} fpm on a 500 fpm climb`);

  const noAccel = vsi.read({ altitudeField: R(1200, 'ft'), verticalAccelField: fail('attitude not converged') });
  assert.equal(noAccel.provenance, 'FAIL', 'a VSI on GPS alone is a different, worse instrument');

  const noAlt = vsi.read({ altitudeField: fail('no fix'), verticalAccelField: R(0, 'm/s2') });
  assert.equal(noAlt.provenance, 'FAIL', 'a VSI on the accelerometer alone drifts without bound');
});

test('the VSI restarts rather than spiking across a fix gap', () => {
  const vsi = createVsi();
  vsi.updateAltitude(1000, 0);
  vsi.updateAltitude(1010, 1000);
  vsi.updateAccel(0, 0);
  vsi.updateAccel(0, 1000);
  assert.ok(vsi.read({ altitudeField: R(1010, 'ft'), verticalAccelField: R(0, 'm/s2') }).provenance === 'DERIVED');

  // A ten-second gap then a 300 ft jump would read as a 1800 fpm climb if it
  // were differenced straight across.
  vsi.updateAltitude(1310, 20_000);
  const after = vsi.read({ altitudeField: R(1310, 'ft'), verticalAccelField: R(0, 'm/s2') });
  assert.equal(after.provenance, 'FAIL');
  assert.match(after.reason, /gap/);
});

/* -------------------------------------------------- METAR station choice */

const station = (id, lat, lon, altimeterHpa) => ({ id, lat, lon, altimeterHpa, name: id });

test('THE NEAREST STATION THAT CAN ANSWER, not simply the nearest', () => {
  const from = { lat: 38.68, lon: -121.0 };
  const chosen = selectStation(
    [
      station('KCLOSE', 38.69, -121.0, null), // three miles away, reports nothing
      station('KFAR', 38.9, -121.3, 1013.2),
    ],
    from,
  );
  assert.equal(chosen.station.id, 'KFAR', 'a nearer station with no altimeter setting must not win');
  assert.ok(chosen.distanceNm > 0);
  assert.ok(Math.abs(chosen.altimeterInHg - 29.92) < 0.02, `converted to ${chosen.altimeterInHg} inHg`);
});

test('among stations that can answer, the nearest wins', () => {
  const from = { lat: 38.68, lon: -121.0 };
  const chosen = selectStation([station('KFAR', 39.5, -121.5, 1013), station('KNEAR', 38.7, -121.02, 1015)], from);
  assert.equal(chosen.station.id, 'KNEAR');
});

test('no station with an altimeter setting is a REASON, not a silent 29.92', () => {
  const none = selectStation([station('KA', 38.7, -121.0, null)], { lat: 38.68, lon: -121.0 });
  assert.equal(none.station, undefined);
  assert.match(none.reason, /none reporting an altimeter setting/);

  assert.match(selectStation([], { lat: 38.68, lon: -121 }).reason, /no stations returned/);
  assert.match(selectStation([station('KA', 38.7, -121, 1013)], null).reason, /no position/);
});

/* ------------------------------------------------------------ winds aloft */

const level = (hpa, heightM, dir, speed, temp) => ({
  pressureHpa: hpa,
  geopotentialHeightM: heightM,
  windDirDeg: dir,
  windSpeedKt: speed,
  temperatureC: temp,
});

test('wind interpolates as a VECTOR, so the 360/0 seam is not a south wind', () => {
  // 350 degrees below, 010 above. The average is 000, NOT 180.
  const levels = [level(1000, 100, 350, 20, 15), level(900, 1000, 10, 20, 10)];
  const mid = interpolateLevels(levels, (100 + 1000) / 2 / 0.3048);
  assert.ok(mid.dirDeg > 355 || mid.dirDeg < 5, `interpolated to ${mid.dirDeg} degrees — the seam was crossed the long way`);
  assert.ok(Math.abs(mid.temperatureC - 12.5) < 0.5, `temperature ${mid.temperatureC}`);
});

test('above the highest reported level is FAIL, never clamped to the top one', () => {
  const levels = [level(1000, 100, 270, 10, 15), level(900, 1000, 280, 20, 10)];
  const above = interpolateLevels(levels, 20000);
  assert.ok(above.reason, 'a clamped top-level wind is a synthetic reading in disguise');
  assert.match(above.reason, /above the highest reported level/);
});

test('a level missing any component is dropped, not half-used', () => {
  const levels = [level(1000, 100, 270, null, 15), level(900, 1000, 280, 20, 10), level(800, 2000, 290, 25, 5)];
  const solved = interpolateLevels(levels, 1500 / 0.3048);
  assert.ok(!solved.reason, solved.reason);
  assert.deepEqual(solved.between, [900, 800]);
});

/* -------------------------------------------------------------- WMM, geoid */

test('WMM parses a real COF layout and refuses a broken one', () => {
  const cof = ['    2025.0            WMM-2025        11/13/2024', '  1  0  -29404.8       0.0       -26.4        0.0', '  1  1   -1450.9    4652.5        7.6      -25.1', '9999999999999999999'].join('\n');
  const model = parseCof(cof);
  assert.equal(model.epoch, 2025);
  assert.equal(model.nMax, 1);
  assert.equal(model.g[1][0], -29404.8);
  assert.equal(model.h[1][1], 4652.5);
  assert.throws(() => parseCof(''), /empty/);
  assert.throws(() => parseCof('not a header\n'), /epoch/);
});

test('a pure axial dipole has zero declination everywhere — the sanity case', () => {
  // With only g(1,0) the field is a centred axial dipole, whose horizontal
  // component points at true north by construction. Any declination at all
  // means the summation or the frame rotation is wrong.
  const model = parseCof(['2025.0 TEST', '  1  0  -29404.8       0.0        0.0        0.0', '9999999'].join('\n'));
  for (const [lat, lon] of [
    [38.68, -121.0],
    [10, 45],
    [-33, 150],
  ]) {
    const f = magneticField(model, { latDeg: lat, lonDeg: lon, date: new Date('2025-06-01T00:00:00Z') });
    assert.ok(f, 'no field returned');
    assert.ok(Math.abs(f.declinationDeg) < 1e-6, `declination ${f.declinationDeg} at ${lat},${lon} for an axial dipole`);
    assert.ok(f.intensityNt > 20000, `intensity ${f.intensityNt} nT looks wrong`);
  }
});

test('a dipole tilted toward the 90E meridian has zero declination ON that meridian', () => {
  // The axial test above pins the NORTH component's sign. This one exercises
  // the m=1 terms — the east component and the longitude sum — using a
  // symmetry that holds whatever the coefficients are, rather than half-
  // remembered real ones. With g(1,1)=0 and h(1,1) non-zero the dipole tilts
  // into the 90E/90W plane, so the field has no east component anywhere on it.
  const model = parseCof(
    ['2025.0 TEST', '  1  0  -29404.8       0.0        0.0        0.0', '  1  1       0.0    4652.5        0.0        0.0', '9999999'].join('\n'),
  );
  const date = new Date('2025-06-01T00:00:00Z');
  for (const lat of [-40, 0, 25, 60]) {
    for (const lon of [90, -90]) {
      const f = magneticField(model, { latDeg: lat, lonDeg: lon, date });
      assert.ok(Math.abs(f.declinationDeg) < 1e-6, `declination ${f.declinationDeg} at ${lat},${lon} on the symmetry meridian`);
    }
  }
  // And off that plane it must NOT be zero, or the test above would pass on a
  // function that always returns zero.
  const off = magneticField(model, { latDeg: 25, lonDeg: 0, date });
  assert.ok(Math.abs(off.declinationDeg) > 1, `declination off the symmetry plane was ${off.declinationDeg}`);
});

test('WMM refuses an unusable position rather than returning a number', () => {
  const model = parseCof(['2025.0 TEST', '  1  0  -29404.8 0 0 0', '9999999'].join('\n'));
  assert.equal(magneticField(model, { latDeg: NaN, lonDeg: 0 }), null);
  assert.equal(magneticField(model, { latDeg: 120, lonDeg: 0 }), null);
  assert.equal(magneticField(null, { latDeg: 0, lonDeg: 0 }), null);
});

test('decimalYear lands mid-year for mid-year', () => {
  assert.ok(Math.abs(decimalYear(new Date('2026-07-02T12:00:00Z')) - 2026.5) < 0.01);
});

test('the geoid sampler refuses outside its own grid rather than clamping', () => {
  const grid = { latMin: 38, latMax: 39, lonMin: -122, lonMax: -121, latStep: 0.5, lonStep: 0.5, values: [[-30, -31, -32], [-31, -32, -33], [-32, -33, -34]] };
  assert.ok(Math.abs(sampleGrid(grid, 38, -122) - -30) < 1e-9);
  assert.ok(Math.abs(sampleGrid(grid, 38.25, -121.75) - -31) < 1e-9);
  assert.equal(sampleGrid(grid, 40, -121.5), null, 'outside the grid must be null, never an edge value');
  assert.equal(sampleGrid(null, 38, -121), null);
});

/* ------------------------------------------------------ traffic + ambient */

test('the traffic bbox uses the cold-start box only until a fix exists', () => {
  const cold = trafficBbox({});
  assert.equal(cold.fromFix, false);
  assert.equal(cold.lamin, 38.1);
  assert.equal(cold.lomax, -120.15);

  const warm = trafficBbox({
    'position.lat': R(37.0, 'deg'),
    'position.lon': R(-122.0, 'deg'),
  });
  assert.equal(warm.fromFix, true);
  assert.ok(warm.lamin < 37 && warm.lamax > 37, 'the box must surround the fix');
  assert.ok(Math.abs(warm.lamax - warm.lamin - 80 / 60) < 1e-9, 'a 40 nm half-width is 80 nm across');
});

test('panel dimming never dims below the level the contrast gate measured', () => {
  assert.equal(brightnessFromLux(0), DIM_FLOOR);
  assert.ok(brightnessFromLux(50000) > 0.99);
  assert.equal(brightnessFromSolarElevation(-40), DIM_FLOOR);
  assert.ok(brightnessFromSolarElevation(60) > 0.99);
  assert.equal(brightnessFromLux(null), null);
});

test('solar elevation is negative at local midnight and positive at local noon', () => {
  const home = { lat: 38.68, lon: -121.0 };
  // Cameron Park is UTC-7 in June, so 20:00 UTC is about local noon.
  const noon = solarElevationDeg({ ...home, date: new Date('2026-06-21T19:30:00Z') });
  const midnight = solarElevationDeg({ ...home, date: new Date('2026-06-21T07:30:00Z') });
  assert.ok(noon > 60, `midsummer noon elevation was ${noon}`);
  assert.ok(midnight < -10, `midsummer midnight elevation was ${midnight}`);
  assert.equal(solarElevationDeg({ lat: NaN, lon: 0, date: new Date() }), null);
});
