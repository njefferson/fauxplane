/**
 * Tests for build-navdata.mjs, against fixtures that reproduce the shapes the
 * real OurAirports files actually contain: commas and quotes inside names,
 * CRLF line endings, a BOM, blank numeric fields, and a column order that has
 * moved since the last time anyone looked.
 *
 * Run: node --test scripts/
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { REGION, buildNavdata, inBox, parseCsv, toObjects } from './build-navdata.mjs';

// --- parseCsv ---------------------------------------------------------------

test('parseCsv keeps commas and escaped quotes inside a quoted field', () => {
  const rows = parseCsv('a,b\n"Bell\'s Field, Number Two","He said ""no"""\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ["Bell's Field, Number Two", 'He said "no"'],
  ]);
});

test('parseCsv handles CRLF, a BOM, and a newline inside a quoted field', () => {
  const rows = parseCsv('﻿a,b\r\n"line\none",2\r\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['line\none', '2'],
  ]);
});

test('parseCsv ignores the trailing blank line but keeps empty fields', () => {
  const rows = parseCsv('a,b,c\n1,,3\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1', '', '3'],
  ]);
});

test('parseCsv refuses a file truncated inside a quoted field', () => {
  assert.throws(() => parseCsv('a,b\n"unterminated,2\n'), /truncated/);
});

// --- toObjects --------------------------------------------------------------

test('toObjects reads by header name, so a reordered source still lands right', () => {
  // icao_code ahead of gps_code — the reordering OurAirports actually made.
  const rows = parseCsv('ident,icao_code,gps_code\nKSAC,KSAC,KSAC2\n');
  const [o] = toObjects(rows, { label: 't', required: ['ident', 'gps_code'] });
  assert.equal(o.gps_code, 'KSAC2');
  assert.equal(o.icao_code, 'KSAC');
});

test('toObjects fails loudly when a required column disappears', () => {
  const rows = parseCsv('ident,name\nKSAC,Sacramento\n');
  assert.throws(
    () => toObjects(rows, { label: 'airports.csv', required: ['ident', 'latitude_deg'] }),
    /schema changed — missing column\(s\) latitude_deg/,
  );
});

// --- inBox ------------------------------------------------------------------

test('inBox includes the exact edges and excludes just past them', () => {
  const { latMin, latMax, lonMin, lonMax } = REGION.bbox;
  assert.equal(inBox(latMin, lonMin), true);
  assert.equal(inBox(latMax, lonMax), true);
  assert.equal(inBox(latMin - 0.0001, lonMin), false);
  assert.equal(inBox(latMax + 0.0001, lonMax), false);
  assert.equal(inBox(latMin, lonMin - 0.0001), false);
  assert.equal(inBox(latMax, lonMax + 0.0001), false);
});

test('inBox rejects a missing coordinate rather than treating it as zero', () => {
  assert.equal(inBox(null, -121.0), false);
  assert.equal(inBox(38.68, null), false);
});

test('the region bbox is the one the amendment specifies', () => {
  assert.deepEqual(REGION.bbox, { latMin: 37.0, latMax: 40.4, lonMin: -123.2, lonMax: -118.8 });
  assert.deepEqual(REGION.home, { name: 'Cameron Park, CA', lat: 38.68, lon: -121.0 });
  assert.equal(REGION.kvKey, 'navdata:norcal');
});

// --- buildNavdata -----------------------------------------------------------

const AIRPORTS = [
  'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,iso_region,municipality,icao_code,iata_code,gps_code,local_code',
  // Inside: Cameron Airpark, right by the home reference.
  '1,O61,small_airport,"Cameron Airpark",38.6853,-120.9866,1286,US-CA,"Cameron Park",,,O61,O61',
  // Inside, sea level — elevation 0 must survive as 0, not become null.
  '2,KSAC,medium_airport,"Sacramento Executive, Field",38.5125,-121.4933,0,US-CA,Sacramento,KSAC,SAC,KSAC,SAC',
  // Inside, elevation blank — must be null, not 0.
  '3,CA99,heliport,"Unknown Elev",39.0,-121.0,,US-CA,,,,,',
  // Inside but closed — kept, with its type intact for the app to decide on.
  '4,CL01,closed,"Closed Strip",37.5,-122.0,120,US-CA,,,,,',
  // Outside: south of latMin.
  '5,KFAT,medium_airport,Fresno,36.7762,-119.7181,336,US-CA,Fresno,KFAT,FAT,KFAT,',
  // Outside: west of lonMin (Pacific).
  '6,OUT2,small_airport,"West Of Box",38.0,-124.0,10,US-CA,,,,,',
  '',
].join('\n');

const RUNWAYS = [
  'id,airport_ref,airport_ident,length_ft,width_ft,surface,lighted,closed,le_ident,le_latitude_deg,le_longitude_deg,le_elevation_ft,le_heading_degT,le_displaced_threshold_ft,he_ident,he_latitude_deg,he_longitude_deg,he_elevation_ft,he_heading_degT,he_displaced_threshold_ft',
  // Belongs to an in-box airport, and carries no coordinates of its own — the
  // case that proves runways join on the airport rather than filter by bbox.
  '10,1,O61,4000,60,ASP,1,0,13,,,,131,,31,,,,311,',
  '11,2,KSAC,5503,150,ASP,1,0,2,38.5061,-121.4967,20,20,,20,38.5199,-121.4894,16,200,',
  // Belongs to an out-of-box airport — must be dropped.
  '12,5,KFAT,9222,150,ASP,1,0,11L,36.7719,-119.7286,331,116,,29R,36.7789,-119.7069,325,296,',
  '',
].join('\r\n');

const NAVAIDS = [
  'id,filename,ident,name,type,frequency_khz,latitude_deg,longitude_deg,elevation_ft,iso_country,dme_frequency_khz,dme_channel,dme_latitude_deg,dme_longitude_deg,dme_elevation_ft,slaved_variation_deg,magnetic_variation_deg,usageType,power,associated_airport',
  '100,SAC,SAC,Sacramento,VORTAC,115500,38.4436,-121.5514,20,US,115500,102X,,,,15.0,15.0,BOTH,HIGH,KSAC',
  '101,ILA,ILA,"Lincoln, VOR",VOR,110600,38.9092,-121.3517,120,US,,,,,,15.0,15.0,LO,LOW,',
  // Inside: the box reaches past the Sierra to Reno, which is easy to assume
  // it does not. Caught by this fixture being wrong the first time it ran.
  '102,FMG,FMG,Mustang,VORTAC,117900,39.5325,-119.6567,4900,US,117900,126X,,,,15.0,15.0,BOTH,HIGH,KRNO',
  // Outside the box — east of lonMax.
  '103,OAL,OAL,Coaldale,VORTAC,117700,38.0006,-117.8217,4700,US,117700,124X,,,,15.0,15.0,BOTH,HIGH,',
  '',
].join('\n');

const fixture = () =>
  buildNavdata({ airportsCsv: AIRPORTS, runwaysCsv: RUNWAYS, navaidsCsv: NAVAIDS });

test('buildNavdata keeps only airports inside the box', () => {
  const { airports } = fixture();
  assert.deepEqual(
    airports.map((a) => a.ident),
    ['CA99', 'CL01', 'KSAC', 'O61'],
  );
});

test('buildNavdata keeps a closed airport and says so, rather than guessing', () => {
  const closed = fixture().airports.find((a) => a.ident === 'CL01');
  assert.equal(closed.type, 'closed');
});

test('buildNavdata distinguishes an elevation of zero from an unknown one', () => {
  const { airports } = fixture();
  assert.equal(airports.find((a) => a.ident === 'KSAC').elevation_ft, 0);
  assert.equal(airports.find((a) => a.ident === 'CA99').elevation_ft, null);
});

test('buildNavdata survives a comma inside a quoted airport name', () => {
  const ksac = fixture().airports.find((a) => a.ident === 'KSAC');
  assert.equal(ksac.name, 'Sacramento Executive, Field');
  assert.equal(ksac.lat, 38.5125);
  assert.equal(ksac.lon, -121.4933);
});

test('runways come in by airport join, including ones with no coordinates', () => {
  const { runways } = fixture();
  assert.deepEqual(
    runways.map((r) => r.airport_ident),
    ['KSAC', 'O61'],
  );
  const o61 = runways.find((r) => r.airport_ident === 'O61');
  assert.equal(o61.le_lat, null);
  assert.equal(o61.length_ft, 4000);
  assert.equal(o61.lighted, true);
  assert.equal(o61.closed, false);
});

test('buildNavdata keeps only navaids inside the box', () => {
  const { navaids } = fixture();
  assert.deepEqual(
    navaids.map((n) => n.ident),
    ['FMG', 'ILA', 'SAC'],
  );
  assert.equal(navaids.find((n) => n.ident === 'SAC').frequency_khz, 115500);
});

test('buildNavdata refuses to emit an empty database', () => {
  const emptyAirports = [AIRPORTS.split('\n')[0], ''].join('\n');
  assert.throws(
    () => buildNavdata({ airportsCsv: emptyAirports, runwaysCsv: RUNWAYS, navaidsCsv: NAVAIDS }),
    /no airports inside the region/,
  );
});
