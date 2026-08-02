import assert from 'node:assert/strict';
import test from 'node:test';

import { derived, fail, reading } from '../public/src/core/provenance.js';
import {
  AOA_MIN_GROUNDSPEED_KT,
  angleOfAttack,
  calibratedAirspeed,
  createVsi,
  VSI_ABSURD_FPM,
  indicatedAltitude,
  mslAltitude,
  pressureAltitude,
  trueAirspeed,
} from '../public/src/core/derive.js';
import { bankAngle, createTurnRate, loadFactorFromBank } from "../public/src/core/derive.js";
import { selectStation } from '../public/src/data/metar.js';
import { interpolateLevels } from '../public/src/data/windsaloft.js';
import { decimalYear, magneticField, parseCof } from '../public/src/data/wmm.js';
import { sampleGrid } from '../public/src/data/geoid.js';
import { createTrafficSource, radarCentre, withRangeAndBearing } from '../public/src/data/traffic.js';
import { createStore } from '../public/src/core/state.js';
import { createGeoSensor } from '../public/src/sensors/geo.js';
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

test('the radar centres on home only until a fix exists', () => {
  const cold = radarCentre({});
  assert.equal(cold.fromFix, false);
  assert.equal(cold.lat, 38.68);
  assert.equal(cold.lon, -121.0);

  const warm = radarCentre({ 'position.lat': R(37.0, 'deg'), 'position.lon': R(-122.0, 'deg') });
  assert.equal(warm.fromFix, true);
  assert.equal(warm.lat, 37);
  assert.equal(warm.lon, -122);
});

test('range and bearing are measured from the DEVICE, and sorted nearest first', () => {
  // The Function deliberately coarsens the position it sends upstream to about
  // six nautical miles, so any distance computed up there inherits that error.
  // These are computed here, from the precise fix.
  const centre = { lat: 38.68, lon: -121.0 };
  const out = withRangeAndBearing(
    [
      { hex: 'far', lat: 39.68, lon: -121.0 }, // 60 nm due north
      { hex: 'near', lat: 38.68, lon: -120.8 }, // a little to the east
    ],
    centre,
  );

  assert.equal(out[0].hex, 'near', 'the list must be nearest first');
  assert.ok(Math.abs(out[1].distanceNm - 60) < 0.5, `60 nm north measured as ${out[1].distanceNm}`);
  assert.ok(Math.abs(out[1].bearingDeg - 0) < 0.5, `due north measured as ${out[1].bearingDeg}`);
  assert.ok(Math.abs(out[0].bearingDeg - 90) < 0.5, `due east measured as ${out[0].bearingDeg}`);
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

/* ------------------------------------------- what ADS-B can and cannot say */

test('BANK IS DERIVABLE from a turn: a standard-rate turn at 250 kt is about 25 degrees', () => {
  // tan(bank) = V x omega / g. At 250 kt (128.6 m/s) and 3 deg/s (0.05236
  // rad/s) that is atan(6.734 / 9.807) = 34.5 degrees. Checked against the
  // textbook approximation for a standard rate turn, bank ~ TAS/10 + 7, which
  // gives 32 — close enough to confirm the formula is not off by a conversion.
  const bank = bankAngle({ groundspeedKt: R(250, 'kt'), turnRateDegPerSec: R(3, 'deg/s') });
  assert.equal(bank.provenance, 'DERIVED');
  assert.ok(Math.abs(bank.value - 34.5) < 1, `bank ${bank.value}`);
  assert.match(bank.reason ?? '', /coordinated/, 'the assumption must reach the screen');

  // A LEFT turn banks left. A sign error here mirrors the horizon.
  assert.ok(bankAngle({ groundspeedKt: R(250, 'kt'), turnRateDegPerSec: R(-3, 'deg/s') }).value < 0);

  // Straight and level is zero bank, not a missing reading.
  assert.equal(bankAngle({ groundspeedKt: R(250, 'kt'), turnRateDegPerSec: R(0, 'deg/s') }).value, 0);
});

test('bank refuses to be inferred from a ground track at taxi speed', () => {
  const parked = bankAngle({ groundspeedKt: R(5, 'kt'), turnRateDegPerSec: R(20, 'deg/s') });
  assert.equal(parked.provenance, 'FAIL');
  assert.equal(parked.value, null);
  assert.match(parked.reason, /below 20 kt/);
});

test('a missing input makes the bank FAIL and names it — never a level attitude', () => {
  const noSpeed = bankAngle({ groundspeedKt: fail('not broadcast'), turnRateDegPerSec: R(3, 'deg/s') });
  assert.equal(noSpeed.provenance, 'FAIL');
  assert.match(noSpeed.reason, /groundspeed/);
  assert.equal(bankAngle({ groundspeedKt: R(250, 'kt'), turnRateDegPerSec: fail('no track') }).provenance, 'FAIL');
});

test('load factor follows the bank, and gives up before it diverges', () => {
  assert.ok(Math.abs(loadFactorFromBank({ bankDeg: R(0, 'deg') }).value - 1) < 1e-9);
  // 60 degrees of bank is exactly 2 g — the one figure every pilot knows, which
  // is what makes it a good check on the formula.
  assert.ok(Math.abs(loadFactorFromBank({ bankDeg: R(60, 'deg') }).value - 2) < 1e-6);
  assert.ok(Math.abs(loadFactorFromBank({ bankDeg: R(-60, 'deg') }).value - 2) < 1e-6, 'a left turn pulls g too');
  assert.equal(loadFactorFromBank({ bankDeg: R(89.5, 'deg') }).provenance, 'FAIL');
  assert.equal(loadFactorFromBank({ bankDeg: fail('no bank') }).provenance, 'FAIL');
});

test('the rate of turn needs TWO track readings, and crosses the 360 seam correctly', () => {
  const turn = createTurnRate();
  // One reading is not a rate. Returning zero here would read as "wings level"
  // for every aircraft the moment it was selected.
  const first = turn.read(R(350, 'degT'), 1000);
  assert.equal(first.provenance, 'FAIL');
  assert.match(first.reason, /second track reading/);

  // 350 -> 010 is a 20 degree RIGHT turn, not a 340 degree left one. Taking the
  // raw difference gives -340 deg over 4 s, which through the bank formula is a
  // fully inverted aircraft.
  const rate = turn.read(R(10, 'degT'), 5000);
  assert.equal(rate.provenance, 'DERIVED');
  assert.ok(Math.abs(rate.value - 5) < 1e-9, `rate ${rate.value} deg/s`);

  // A long gap is not a slow turn — it is an unknown one.
  const stale = turn.read(R(180, 'degT'), 5000 + 60_000);
  assert.equal(stale.provenance, 'FAIL');
  assert.match(stale.reason, /would span the gap/);
});

test('losing the track resets the rate rather than differencing across the hole', () => {
  const turn = createTurnRate();
  turn.read(R(90, 'degT'), 1000);
  assert.equal(turn.read(fail('aircraft stopped being heard'), 3000).provenance, 'FAIL');
  // The next good reading is a FIRST reading again, not a partner for the one
  // from before the outage.
  assert.match(turn.read(R(180, 'degT'), 5000).reason, /second track reading/);
});

/* ------------------------------------------------- FOLLOW writes into the store */

const AIRCRAFT = (over = {}) => ({
  hex: 'a1b2c3',
  callsign: 'UAL328',
  registration: 'N77261',
  type: 'B739',
  lat: 38.9,
  lon: -121.15,
  altBaroFt: 34000,
  altGeomFt: 34350,
  onGround: false,
  groundspeedKt: 452,
  trackDeg: 118,
  headingDeg: null,
  verticalRateFpm: -1216,
  squawk: '2451',
  seenPosS: 2,
  seenS: 1,
  ...over,
});

/** A store plus a traffic source whose fetch returns whatever is queued. */
const followRig = (bodies) => {
  const store = createStore({ clock: () => rigNow });
  const queue = [...bodies];
  const traffic = createTrafficSource({
    state: store,
    clock: () => rigNow,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => '0' },
      json: async () => ({ ok: true, aircraft: queue.length > 1 ? [queue.shift()] : [queue[0]] }),
    }),
  });
  return { store, traffic };
};
let rigNow = 1_000_000;

test('FOLLOW writes the broadcast, stamped with when it was HEARD', async () => {
  rigNow = 1_000_000;
  const { store, traffic } = followRig([AIRCRAFT()]);
  traffic.follow({ callsign: 'UAL328' });
  await traffic.refreshFollowed();
  traffic.apply();
  const f = store.publishNow().fields;

  assert.equal(f['position.groundspeed'].value, 452);
  assert.equal(f['position.groundspeed'].provenance, 'LIVE');
  assert.match(f['position.groundspeed'].reason, /adsb\.fi/);
  assert.equal(f['position.altitudeGeometric'].value, 34350, 'geometric altitude, not barometric');
  assert.equal(f['vsi.rate'].value, -1216);

  // seen_pos was 2 seconds, so the reading is stamped two seconds ago — which
  // is what lets the store age a receiver gap into STALE on its own.
  assert.ok(f['position.groundspeed'].ageMs >= 2000, `ageMs ${f['position.groundspeed'].ageMs}`);
});

test('FOLLOW crosses out everything ADS-B cannot answer, each with its reason', async () => {
  rigNow = 1_000_000;
  const { store, traffic } = followRig([AIRCRAFT()]);
  traffic.follow({ callsign: 'UAL328' });
  await traffic.refreshFollowed();
  traffic.apply();
  const f = store.publishNow().fields;

  // THE ONE THAT MATTERS MOST. Flight path angle is computable and is NOT
  // pitch; writing it here would be the synthetic-data defect wearing a
  // plausible label.
  assert.equal(f['attitude.pitch'].provenance, 'FAIL');
  assert.equal(f['attitude.pitch'].value, null);
  assert.match(f['attitude.pitch'].reason, /no attitude/);

  for (const path of ['motion.lateralG', 'speed.tas', 'speed.cas', 'altitude.indicated', 'aoa.angle']) {
    assert.equal(f[path].provenance, 'FAIL', `${path} should be FAIL when following`);
    assert.ok(f[path].reason, `${path} must say why`);
  }

  // No heading broadcast: FAIL, and the reason points at the track instead.
  assert.equal(f['attitude.heading'].provenance, 'FAIL');
  assert.match(f['attitude.heading'].reason, /TRACK/);
  assert.equal(f['position.track'].value, 118, 'the track itself is real and stays');
});

test('FOLLOW derives bank only once a SECOND report gives it a rate of turn', async () => {
  rigNow = 1_000_000;
  const { store, traffic } = followRig([AIRCRAFT({ trackDeg: 118 }), AIRCRAFT({ trackDeg: 133, seenPosS: 0 })]);
  traffic.follow({ callsign: 'UAL328' });

  await traffic.refreshFollowed();
  traffic.apply();
  let f = store.publishNow().fields;
  // One report is not a rate, and a bank of zero would read as wings level.
  assert.equal(f['attitude.roll'].provenance, 'FAIL');
  assert.equal(f['attitude.turnRate'].provenance, 'FAIL');

  // Five seconds of wall clock later, and 15 degrees of track.
  //
  // The rate is 15/7, NOT 15/5 — and that is the point of the differing
  // seen_pos values. The first report was heard two seconds BEFORE it was
  // fetched and the second was heard as it arrived, so the two observations are
  // seven seconds apart, not five. Dividing by the fetch interval instead would
  // overstate every rate of turn by whatever the receiver lag happened to be,
  // and the bank angle derived from it along with it.
  rigNow += 5000;
  await traffic.refreshFollowed();
  traffic.apply();
  f = store.publishNow().fields;

  assert.equal(f['attitude.turnRate'].provenance, 'DERIVED', 'a rate worked out from two tracks is DERIVED, not LIVE');
  assert.ok(Math.abs(f['attitude.turnRate'].value - 15 / 7) < 0.01, `rate ${f['attitude.turnRate'].value}`);
  assert.equal(f['attitude.roll'].provenance, 'DERIVED');
  assert.ok(f['attitude.roll'].value > 30 && f['attitude.roll'].value < 55, `bank ${f['attitude.roll'].value}`);
  assert.match(f['attitude.roll'].reason, /coordinated/);
  assert.ok(f['motion.gLoad'].value > 1.1, `load factor ${f['motion.gLoad'].value} in a 45 degree turn`);
});

test('UNFOLLOW hands the fields back rather than leaving the last aircraft on screen', async () => {
  rigNow = 1_000_000;
  const { store, traffic } = followRig([AIRCRAFT()]);
  traffic.follow({ callsign: 'UAL328' });
  await traffic.refreshFollowed();
  traffic.apply();
  assert.equal(store.publishNow().fields['position.groundspeed'].provenance, 'LIVE');

  traffic.unfollow();
  const f = store.publishNow().fields;
  assert.equal(f['position.groundspeed'].provenance, 'FAIL', 'a followed value must not linger after unfollow');
  assert.equal(f['position.groundspeed'].value, null);
  assert.equal(traffic.isFollowing, false);
});

test('OWNERSHIP: the device stops writing the fields a followed aircraft fills', async () => {
  // Both sources writing means the panel shows whichever landed last, and they
  // arrive at different rates — geolocation on its own schedule, the follow
  // source at 25 Hz. The groundspeed would alternate between a desk and a 737
  // several times a second, and every value on screen would be untraceable.
  rigNow = 1_000_000;
  const { store, traffic } = followRig([AIRCRAFT()]);
  const owns = () => !traffic.isFollowing;

  const geo = createGeoSensor({
    state: store,
    vsi: { updateAltitude() {} },
    owns,
    clock: () => rigNow,
  });

  const deskFix = {
    timestamp: rigNow,
    coords: { latitude: 38.68, longitude: -121.0, accuracy: 12, speed: 0, heading: null, altitude: 140, altitudeAccuracy: 8 },
  };

  // Not following: the device owns its fields.
  geo.acceptFix(deskFix);
  assert.equal(store.publishNow().fields['position.lat'].value, 38.68);

  // Following: the aircraft owns them, and a fix arriving mid-flight must not
  // drag the panel back to the desk.
  traffic.follow({ callsign: 'UAL328' });
  await traffic.refreshFollowed();
  traffic.apply();
  geo.acceptFix(deskFix);
  let f = store.publishNow().fields;
  assert.equal(f['position.lat'].value, 38.9, 'a GPS fix overwrote the followed aircraft');
  assert.equal(f['position.groundspeed'].value, 452, 'the desk overwrote the aircraft groundspeed');

  // And handed back on unfollow.
  traffic.unfollow();
  geo.acceptFix(deskFix);
  f = store.publishNow().fields;
  assert.equal(f['position.lat'].value, 38.68, 'the device did not take its fields back');
});

test('THE VSI REFUSES A RUNAWAY, and resets rather than sulking for ever', () => {
  // THE PATH THAT PRODUCED 344,570 fpm ON NOAH'S IPAD, reproduced.
  //
  // A GPS fix arrives, then stops for a while — routine indoors. The FIELD
  // stays LIVE for its full sixty-second window, so `read` keeps answering,
  // but `updateAltitude` is never called, so nothing corrects the integrator.
  // Meanwhile the vertical accelerometer was reading a HORIZONTAL axis (the
  // horizon was ninety degrees over), so it fed a full g in, and the rate
  // climbed without bound.
  const vsi = createVsi();
  let t = 0;
  vsi.updateAltitude(1000, t);
  t += 1000;
  vsi.updateAltitude(1000, t); // rateFpm is now 0 and the filter is running

  // Forty seconds of a mis-projected axis, with no fix arriving to correct it.
  for (let i = 0; i < 2000; i += 1) {
    t += 20;
    vsi.updateAccel(9.80665, t);
  }

  const runaway = vsi.read({ altitudeField: R(1000, 'ft'), verticalAccelField: R(9.80665, 'm/s2') });
  assert.equal(runaway.provenance, 'FAIL');
  assert.equal(runaway.value, null, 'a runaway must not reach the gauge as a number');
  assert.match(runaway.reason, /not a real climb/);

  // And it RECOVERS once fixes come back. Refusing without resetting would
  // cross the instrument out permanently, because the integrator would still be
  // sitting at the runaway value on every subsequent read.
  for (let i = 0; i < 40; i += 1) {
    t += 250;
    vsi.updateAltitude(1000 + ((i + 1) * 250 * (500 / 60)) / 1000, t);
    vsi.updateAccel(0, t);
  }
  const recovered = vsi.read({ altitudeField: R(1200, 'ft'), verticalAccelField: R(0, 'm/s2') });
  assert.equal(recovered.provenance, 'DERIVED', `did not recover: ${recovered.reason}`);
  assert.ok(Math.abs(recovered.value) < VSI_ABSURD_FPM);
});

test('an ordinary climb is nowhere near the absurd threshold', () => {
  // The bound must refuse only runaway. An airliner's 4000 fpm and this app's
  // own 6000 fpm full scale are both far inside it.
  assert.ok(VSI_ABSURD_FPM > 6000 * 3, `the bound is ${VSI_ABSURD_FPM}, too close to the instrument's own full scale`);
});
