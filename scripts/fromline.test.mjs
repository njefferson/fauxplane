/**
 * fromline.test.mjs — placing a hazard advisory from the only line in it that
 * carries geography.
 *
 * ---------------------------------------------------------------------------
 * EVERY LINE HERE IS A REAL ONE
 * ---------------------------------------------------------------------------
 *
 * Not one clause below was written to suit the parser. They are the lines
 * `wxtext.test.mjs` already carries verbatim, reconstructed from a response on
 * the owner's device, plus the two that were captured in full. That file records
 * why: its own first fixture was built to MATCH the heuristic it was checking,
 * passed, and the real feed sent something else entirely — which cost a release
 * and is now hub LESSONS §64. Writing a `FROM` line from this parser's idea of
 * the format would repeat it exactly.
 *
 * The table is the SHIPPED one, `public/data/navaids-us.json`, for the same
 * reason: a hand-written lookup would test a parser against positions nobody
 * ships, and the interesting failures are all idents the real table happens not
 * to contain.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THE WHOLE FILE IS ABOUT
 * ---------------------------------------------------------------------------
 *
 * An advisory that cannot be placed is NEVER dropped, and never called
 * elsewhere. "We do not know where this is" is not "it is not near you", and
 * hiding a hazard because a parser failed would be a worse defect than the
 * nationwide list this replaces.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { fromClauses, placeAdvisory, polygonTouchesBox, resolveClause } from '../public/src/data/fromline.js';
import { bearingDeg, greatCircleNm } from '../public/src/core/units.js';
import { collapseByIdent } from './build-navaids.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = JSON.parse(await readFile(path.join(REPO, 'public', 'data', 'navaids-us.json'), 'utf8'));

/** The same resolution order the app uses: VOR-class first, then an airport. */
const lookup = (ident) => {
  const hit = TABLE.navaids[ident] ?? TABLE.airports[ident];
  return hit ? { lat: hit[0], lon: hit[1] } : null;
};

// ---------------------------------------------------------------------------
// The real bulletin, exactly as `wxtext.test.mjs` carries it
// ---------------------------------------------------------------------------

const REAL_BULLETIN = [
  'Type: SIGMET Hazard: CONVECTIVE WSUS33 KKCI 051755',
  'SIGW CONVECTIVE SIGMET 17W',
  'VALID UNTIL 1955Z',
  'AZ',
  'FROM 30W PHX-60E PHX-40N TUS-80ESE BZA-70E BZA-30W',
  '',
  'OUTLOOK VALID 051955-052355',
  'FROM RSK-DMN-60SSE SSO-50S TUS-30SE BZA-50NNW PGS-RSK',
  'WST ISSUANCES POSS. REFER TO MOST RECENT ACUS01 KWNS',
  '',
  'AREA 3...FROM END-ARG-LIT-MCB-CEW-210S CEW-50SSE',
  'WST ISSUANCES EXPD.',
].join('\n');

/** Captured in full, so these close on the facility they opened with. */
const EAST = 'FROM BUF-BDL-CRG-CEW-BNA-CLE-BUF';
const GULF = 'AREA 3...FROM END-ARG-LIT-MCB-CEW-210S CEW-50SSE LEV-100ESE PSX-END';

/** What the app actually asks about — the region this panel covers. */
const NORCAL = { latMin: 36.5, latMax: 41.0, lonMin: -124.5, lonMax: -118.5 };

// ---------------------------------------------------------------------------
// Finding the clauses
// ---------------------------------------------------------------------------

test('every FROM line in a bulletin is found, including the OUTLOOK and the numbered AREA', () => {
  // Three polygons in one document. Missing the second and third would silently
  // shrink the advisory to its first cell.
  assert.deepEqual(fromClauses(REAL_BULLETIN), [
    '30W PHX-60E PHX-40N TUS-80ESE BZA-70E BZA-30W',
    'RSK-DMN-60SSE SSO-50S TUS-30SE BZA-50NNW PGS-RSK',
    'END-ARG-LIT-MCB-CEW-210S CEW-50SSE',
  ]);
});

test('FROM is found MID-LINE, which is where a numbered area puts it', () => {
  assert.deepEqual(fromClauses(GULF), ['END-ARG-LIT-MCB-CEW-210S CEW-50SSE LEV-100ESE PSX-END']);
});

test('A CLAUSE STOPS WHERE ITS POLYGON CLOSES — hazard prose is not part of it', () => {
  // This line produced a clause with MOD, TURB, BTN and FL180 in it. Four
  // ident-shaped words, none of them a place, so an advisory whose polygon
  // resolved perfectly reported itself as unplaceable.
  //
  // It was fixed once by bounding the clause at the newline, which worked here
  // and did NOTHING on the real feed, because a real bulletin is one line. The
  // closure is what actually ends a clause; this passes for the right reason
  // now, and `REAL_FEED_BULLETIN` below is what proves it.
  const wrapped = 'FROM BUF-BDL-CLE-BUF\nMOD TURB BTN FL180 AND FL400';
  assert.deepEqual(fromClauses(wrapped), ['BUF-BDL-CLE-BUF']);
  assert.deepEqual(resolveClause(fromClauses(wrapped)[0], lookup).unresolved, []);
});

test('prose after a full stop is not part of the polygon either', () => {
  assert.deepEqual(fromClauses('FROM BUF-BDL-CLE-BUF. WST ISSUANCES POSS'), ['BUF-BDL-CLE-BUF']);
});

test('a report with no FROM line is UNKNOWN, never elsewhere', () => {
  const out = placeAdvisory('KSMF 051553Z 20008KT 10SM CLR 21/09 A3011', NORCAL, lookup);
  assert.equal(out.where, 'unknown');
  assert.match(out.reason, /no FROM line/);
});

// ---------------------------------------------------------------------------
// The grammar, from the real lines
// ---------------------------------------------------------------------------

test('BOTH separators are read, because the real lines use both for one thing', () => {
  // `PHX-60E PHX` is three tokens: PHX, then 60 east of PHX. Splitting on the
  // hyphen alone, or the space alone, gets a different polygon either way.
  const { points, unresolved } = resolveClause('30W PHX-60E PHX-40N TUS-80ESE BZA-70E BZA', lookup);
  assert.equal(unresolved.length, 0);
  assert.equal(points.length, 5, 'five vertices: 30W PHX, 60E PHX, 40N TUS, 80ESE BZA, 70E BZA');
});

test('an offset lands where the arithmetic says, measured back with the inverse', () => {
  // Not eyeballed: resolve the bare ident, resolve the offset point, and ask
  // greatCircleNm and bearingDeg how far apart they came out.
  const base = lookup('PHX');
  const [offset] = resolveClause('30W PHX', lookup).points;
  assert.equal(Number(greatCircleNm(base, offset).toFixed(3)), 30);
  assert.equal(Number(bearingDeg(base, offset).toFixed(3)), 270);

  const [ese] = resolveClause('80ESE BZA', lookup).points;
  assert.equal(Number(greatCircleNm(lookup('BZA'), ese).toFixed(3)), 80);
  assert.equal(Number(bearingDeg(lookup('BZA'), ese).toFixed(3)), 112.5, 'ESE is 112.5, not 110 and not 120');
});

test('a three-digit offset is a distance, not a bearing', () => {
  // `210S CEW` — 210 nautical miles south. Read as a heading it would put the
  // vertex on top of CEW.
  const [p] = resolveClause('210S CEW', lookup).points;
  assert.equal(Number(greatCircleNm(lookup('CEW'), p).toFixed(3)), 210);
  assert.equal(Number(bearingDeg(lookup('CEW'), p).toFixed(3)), 180);
});

test('the full lines close on the facility they opened with', () => {
  // True of every line captured in full, and it is what makes a dangling offset
  // recognisable as a truncation rather than a shape.
  for (const clause of [fromClauses(EAST)[0], fromClauses(GULF)[0], 'RSK-DMN-60SSE SSO-50S TUS-30SE BZA-50NNW PGS-RSK']) {
    const { points, unresolved } = resolveClause(clause, lookup);
    assert.deepEqual(unresolved, [], `${clause} did not resolve completely`);
    assert.deepEqual(points.at(0), points.at(-1), `${clause} does not close`);
  }
});

test('the shipped table resolves the real lines — all of them', () => {
  // The point of a nationwide table. The bundled region navdata has 44 navaids
  // clipped to Northern California and cannot place a single one of these.
  for (const clause of [fromClauses(EAST)[0], fromClauses(GULF)[0], 'RSK-DMN-60SSE SSO-50S TUS-30SE BZA-50NNW PGS-RSK']) {
    assert.deepEqual(resolveClause(clause, lookup).unresolved, []);
  }
});

test('the positions are the real ones, spot-checked against places with known locations', () => {
  // If the table were built wrong — columns swapped, sign dropped — every test
  // above would still pass on internally consistent nonsense.
  const near = (ident, lat, lon) => {
    const p = lookup(ident);
    assert.ok(p, `${ident} missing from the shipped table`);
    assert.ok(Math.abs(p.lat - lat) < 0.6 && Math.abs(p.lon - lon) < 0.6, `${ident} came out at ${p.lat},${p.lon}`);
  };
  near('BUF', 42.9, -78.7);
  near('CLE', 41.4, -81.8);
  near('PHX', 33.4, -112.3);
  near('TUS', 32.1, -110.9);
  near('BNA', 36.1, -86.7);
});

// ---------------------------------------------------------------------------
// What it refuses to do
// ---------------------------------------------------------------------------

test('AN IDENT IT CANNOT FIND IS RECORDED, never skipped', () => {
  // SPO is the one ident in the captured advisories that the shipped table does
  // not carry. Dropping it would shrink the polygon and change the answer.
  const { points, unresolved } = resolveClause('BUF-SPO-CLE', lookup);
  assert.deepEqual(unresolved, ['SPO']);
  assert.equal(points.length, 2);
});

test('A CLAUSE ENDING ON AN OFFSET IS TRUNCATED, and says so', () => {
  // `BZA-30W` — the text stopped half way through a point. The vertex exists
  // and is missing, which is exactly the condition that must not be reported as
  // a complete polygon.
  const { unresolved } = resolveClause('30W PHX-60E PHX-40N TUS-80ESE BZA-70E BZA-30W', lookup);
  assert.deepEqual(unresolved, ['30W']);
});

test('an offset naming an ident that is not in the table takes the ident with it', () => {
  const { points, unresolved } = resolveClause('40N ZZZQ-BUF', lookup);
  assert.deepEqual(unresolved, ['ZZZQ']);
  assert.equal(points.length, 1, 'BUF still resolves; the offset point does not');
});

test('nothing resolvable at all is UNKNOWN with a reason, not an empty polygon', () => {
  const out = placeAdvisory('FROM ZZZQ-ZZZR-ZZZS', NORCAL, lookup);
  assert.equal(out.where, 'unknown');
  assert.equal(out.points.length, 0);
  assert.match(out.reason, /ZZZQ/);
});

test('the reason tells a missing PLACE apart from a line that ran out', () => {
  // "30W could not be found" invites the reader to go looking for a navaid
  // called 30W. It is not a place; it is half of one.
  const truncated = placeAdvisory('FROM BUF-BDL-CLE-30W', NORCAL, lookup);
  assert.match(truncated.reason, /stops part-way through a point/);
  assert.doesNotMatch(truncated.reason, /30W/, 'an offset token was printed as if it were a place name');

  const missing = placeAdvisory('FROM BUF-ZZZQ-CLE', NORCAL, lookup);
  assert.match(missing.reason, /ZZZQ/);
  assert.doesNotMatch(missing.reason, /stops part-way/);
});

// ---------------------------------------------------------------------------
// Where it is — and the asymmetry that decides every close call
// ---------------------------------------------------------------------------

test('the box test is generous ON PURPOSE, and generous in the safe direction', () => {
  const square = [{ lat: 40, lon: -100 }, { lat: 40, lon: -90 }, { lat: 30, lon: -90 }, { lat: 30, lon: -100 }];
  assert.equal(polygonTouchesBox(square, { latMin: 35, latMax: 36, lonMin: -96, lonMax: -95 }), true, 'inside');
  assert.equal(polygonTouchesBox(square, { latMin: 39, latMax: 41, lonMin: -101, lonMax: -99 }), true, 'overlapping an edge');
  assert.equal(polygonTouchesBox(square, { latMin: 41, latMax: 42, lonMin: -101, lonMax: -99 }), false, 'clear of it');
  assert.equal(polygonTouchesBox([], NORCAL), false, 'no polygon touches nothing');
});

test('a real advisory over Arizona is NEAR an Arizona panel and ELSEWHERE for a New England one', () => {
  const AZ = { latMin: 32, latMax: 35, lonMin: -113, lonMax: -110 };
  // Around Hartford, where BDL is — the polygon's eastern-most vertex, at
  // -72.69. A box out at -70 is past the end of it and correctly comes back
  // elsewhere, which is how this expectation got written wrong the first time.
  const HARTFORD = { latMin: 41.5, latMax: 42.3, lonMin: -73.2, lonMax: -72.2 };
  assert.equal(placeAdvisory(REAL_BULLETIN, AZ, lookup).where, 'near');
  assert.equal(placeAdvisory(EAST, HARTFORD, lookup).where, 'near', 'BDL is Hartford — this polygon really is overhead');
  assert.equal(placeAdvisory(EAST, { latMin: 32, latMax: 35, lonMin: -113, lonMax: -110 }, lookup).where, 'far');
});

test('the real advisories are ELSEWHERE for this panel, which is the entire point', () => {
  // 66 nationwide advisories, none of them over Sacramento. Before this they
  // were all listed with no way to tell which.
  assert.equal(placeAdvisory(EAST, NORCAL, lookup).where, 'far');
  assert.equal(placeAdvisory(GULF, NORCAL, lookup).where, 'far');
});

test('EACH POLYGON IS TESTED ON ITS OWN — the areas of one bulletin are not pooled', () => {
  // One bulletin, two cells: Arizona, and Oklahoma to the Gulf. Pooling their
  // vertices into one bounding box claims all of New Mexico and west Texas,
  // where the bulletin says nothing. Measured: this box came back `near`.
  const between = { latMin: 34.5, latMax: 35.5, lonMin: -104, lonMax: -103 };
  // BOTH CELLS CLOSE on the point they open with, because every real area line
  // does. The first version of this fixture did not — it was written before the
  // closure was read out of the captured lines — and an unclosed polygon is now
  // correctly reported as one that may reach further than it shows.
  const twoAreas = 'FROM 30W PHX-60E PHX-40N TUS-30W PHX\n\nFROM END-ARG-LIT-MCB-CEW-END';
  assert.equal(placeAdvisory(twoAreas, between, lookup).where, 'far');

  // …and each cell still places itself, so the tighter test did not lose one.
  assert.equal(placeAdvisory(twoAreas, { latMin: 32, latMax: 35, lonMin: -113, lonMax: -110 }, lookup).where, 'near');
  assert.equal(placeAdvisory(twoAreas, { latMin: 35, latMax: 37, lonMin: -99, lonMax: -97 }, lookup).where, 'near');
});

test('A NEW FROM ENDS THE CLAUSE BEFORE IT, even when that one never closed', () => {
  // `FROM` is four letters and therefore ident-shaped. Without a terminator the
  // scan walks out of one polygon and into the next, merging a Buffalo area and
  // a Gulf one into a single shape covering everything between them.
  //
  // ONLY A NON-CLOSING FIRST CLAUSE REACHES THIS. A closed one stops on its own
  // closure long before the next FROM — which is how the previous version of
  // this coverage was lost: the fixture it lived in was corrected to close, and
  // took the only test of this rule with it. The plant went green and said so.
  const two = 'FROM BUF-BDL-CLE\n\nFROM END-ARG-LIT-END';
  assert.deepEqual(fromClauses(two), ['BUF-BDL-CLE', 'END-ARG-LIT-END']);

  // And the merged shape really would have spanned the country.
  const first = resolveClause(fromClauses(two)[0], lookup);
  assert.equal(first.points.length, 3);
  assert.ok(Math.min(...first.points.map((p) => p.lon)) > -83, 'the first clause reached past Ohio');
});

test('A PARTIAL POLYGON THAT ALREADY TOUCHES IS NEAR, and it is certain', () => {
  // Adding the missing vertex can only make the area bigger. It cannot take
  // away an overlap that is already there, so this needs no hedge.
  const AZ = { latMin: 32, latMax: 35, lonMin: -113, lonMax: -110 };
  const out = placeAdvisory('FROM 30W PHX-60E PHX-40N TUS-30W', AZ, lookup);
  assert.equal(out.where, 'near');
  assert.ok(out.unresolved.length, 'this clause really is incomplete');
  assert.equal(out.reason, null, 'a certain answer carries no caveat');
});

test('A PARTIAL POLYGON THAT DOES NOT TOUCH IS UNKNOWN — never elsewhere', () => {
  // The dangerous direction, and the whole reason the unknown group exists. The
  // missing vertex might have reached the reader, and "elsewhere" would be a
  // claim this cannot support.
  const out = placeAdvisory('FROM 30W PHX-60E PHX-40N TUS-30W', NORCAL, lookup);
  assert.equal(out.where, 'unknown');
  assert.match(out.reason, /may reach further/);
});

test('one unplaceable vertex ANYWHERE in a bulletin holds the whole bulletin back from elsewhere', () => {
  // The resolvable cell is over Arizona; the other names a facility this table
  // does not have. Calling the bulletin "elsewhere" on the strength of the half
  // it could read is exactly the false negative that must not happen.
  const mixed = 'FROM 30W PHX-60E PHX-PHX\n\nFROM ZZZQ-ZZZR-ZZZQ';
  assert.equal(placeAdvisory(mixed, NORCAL, lookup).where, 'unknown');
});

test('a complete polygon that misses is ELSEWHERE, with no hedge — otherwise nothing is ever filed away', () => {
  // The counterweight. If every advisory came back unknown the block would be
  // the nationwide list again, wearing a different heading.
  const out = placeAdvisory(EAST, NORCAL, lookup);
  assert.equal(out.where, 'far');
  assert.deepEqual(out.unresolved, []);
  assert.equal(out.reason, null);
});

// ---------------------------------------------------------------------------
// The shipped table itself
// ---------------------------------------------------------------------------

test('A TIE IS REFUSED, NOT WON — tested on the collapse itself, because the shipped list is empty', () => {
  // The shipped table currently has ZERO ambiguous idents: excluding NDBs
  // removed nearly every collision, which is why they are excluded. So
  // asserting over `TABLE.ambiguous` proves nothing — it is an empty loop that
  // would keep passing if the refusal were deleted.
  //
  // This drives the function instead. Two facilities of the SAME rank sharing
  // one name, and no way to know which an advisory meant: a coin flip would put
  // a hazard on the map at a position nobody measured.
  const rank = (r) => ['VOR', 'DME'].indexOf(r.type);
  const out = collapseByIdent([
    { ident: 'TIE', type: 'VOR', lat: 10, lon: 20 },
    { ident: 'TIE', type: 'VOR', lat: 40, lon: 50 },
    { ident: 'WIN', type: 'VOR', lat: 1, lon: 2 },
    { ident: 'WIN', type: 'DME', lat: 3, lon: 4 },
    { ident: 'NDB', type: 'NDB', lat: 5, lon: 6 },
  ], rank);

  assert.deepEqual(out.ambiguous, ['TIE'], 'a tie at the top rank must be refused');
  assert.equal(out.table.TIE, undefined, 'a refused ident must not resolve to either candidate');
  assert.deepEqual(out.table.WIN, [1, 2], 'a clear winner by rank is kept, and it is the higher-ranked one');
  assert.equal(out.table.NDB, undefined, 'a type outside the ranking is not carried at all');
});

test('nothing the shipped table calls ambiguous resolves anyway', () => {
  // The consistency half. Vacuous today by construction; it is here so that if
  // a future type is added back and collisions return, they cannot resolve.
  assert.ok(Array.isArray(TABLE.ambiguous));
  for (const ident of TABLE.ambiguous) {
    assert.equal(lookup(ident), null, `${ident} is listed as ambiguous and still resolves`);
  }
});

test('the table is NATIONWIDE, which is the one thing the bundled navdata is not', () => {
  // `build-navdata.mjs` clips to the region by design. If this file were ever
  // clipped the same way it would resolve nothing east of the Sierra, and every
  // advisory in the country would silently become "could not place".
  const lons = Object.values(TABLE.navaids).map(([, lon]) => lon);
  assert.ok(Math.min(...lons) < -150, 'nothing in Alaska or Hawaii — this table has been clipped');
  assert.ok(Math.max(...lons) > -70, 'nothing on the east coast — this table has been clipped');
  assert.ok(Object.keys(TABLE.navaids).length > 500, `only ${Object.keys(TABLE.navaids).length} navaids`);
});

test('the table records where it came from and under what licence', () => {
  assert.equal(TABLE.source.name, 'OurAirports');
  assert.match(TABLE.source.licence, /Unlicense/);
  assert.ok(TABLE.source.sha256.navaids, 'no checksum for the file this was built from');
});

// ---------------------------------------------------------------------------
// THE REAL FEED — one bulletin, on ONE LINE, exactly as the service sent it
// ---------------------------------------------------------------------------

/**
 * Read off the owner's device on 2026-08-06, from the advisories block. This is
 * the first `airsigmet` response any session has seen, and it broke every
 * assumption the reconstruction above encoded.
 *
 * IT HAS NO INTERNAL NEWLINES. The reconstruction in `wxtext.test.mjs` has them,
 * and the parser was built to bound each clause at one — so on the real feed
 * that bound did nothing, the greedy match swallowed the whole bulletin, and
 * only ONE clause was found instead of three. The panel reported 16 advisories
 * out of 16 as unplaceable while every vertex in them was resolvable.
 *
 * Hub LESSONS 64, third time in this repo: the fixture was tidier than the feed.
 */
const REAL_FEED_BULLETIN =
  '060155 SIGC CONVECTIVE SIGMET 6C VALID UNTIL 0355Z NM FROM 60S FTI-60SSW CME-10ENE DMN-40SW ABQ-60S FTI '
  + 'AREA TS MOV LTL. TOPS TO FL420. OUTLOOK VALID 060355-060755 AREA 1...FROM 30ESE HLC-40SW ICT-30E AMA-50SW '
  + 'TCC-50E ABQ-30NNW CIM-40N LAA-30ESE HLC WST ISSUANCES EXPD. REFER TO MOST RECENT ACUS01 KWNS FROM STORM '
  + 'PREDICTION CENTER FOR SYNOPSIS AND METEOROLOGICAL DETAILS. AREA 2...FROM 40W PMM-BVT-70NNW ARG-40N END-40ESE '
  + 'HLC-40W PMM WST ISSUANCES EXPD. REFER TO MOST RECENT ACUS01 KWNS FROM STORM PREDICTION CENTER FOR SYNOPSIS AND';

test('THE REAL BULLETIN YIELDS THREE POLYGONS, and the prose between them yields none', () => {
  assert.deepEqual(fromClauses(REAL_FEED_BULLETIN), [
    '60S FTI-60SSW CME-10ENE DMN-40SW ABQ-60S FTI',
    '30ESE HLC-40SW ICT-30E AMA-50SW TCC-50E ABQ-30NNW CIM-40N LAA-30ESE HLC',
    '40W PMM-BVT-70NNW ARG-40N END-40ESE HLC-40W PMM',
  ]);
});

test('each real clause CLOSES on the point it opened with', () => {
  // This is the property the parser terminates on, so it is asserted on the
  // real text rather than taken on trust.
  for (const clause of fromClauses(REAL_FEED_BULLETIN)) {
    const { points } = resolveClause(clause, lookup);
    assert.deepEqual(points.at(0), points.at(-1), `${clause} does not close`);
  }
});

test('"…KWNS FROM STORM PREDICTION CENTER…" IS PROSE, and yields no polygon at all', () => {
  // The word FROM appears twice in this bulletin's boilerplate. Read as an area
  // line it produces a clause of pure junk, which would make the whole advisory
  // unplaceable no matter how well its real polygons resolved.
  const clauses = fromClauses(REAL_FEED_BULLETIN);
  assert.ok(!clauses.some((c) => /STORM|PREDICTION|CENTER|SYNOPSIS/.test(c)), `prose became a polygon: ${clauses}`);

  // On its own, with nothing else to find.
  assert.deepEqual(fromClauses('REFER TO MOST RECENT ACUS01 KWNS FROM STORM PREDICTION CENTER FOR SYNOPSIS'), []);
});

test('THE PROSE AFTER A POLYGON NEVER BECOMES A VERTEX', () => {
  // `AREA TS MOV LTL` and `WST ISSUANCES EXPD` follow two of these areas. The
  // first version of this parser put AREA and TS into the polygon and reported
  // the advisory unplaceable.
  const { points, unresolved } = resolveClause(fromClauses(REAL_FEED_BULLETIN)[0], lookup);
  assert.deepEqual(unresolved, []);
  assert.equal(points.length, 5);
});

test('WST IS AN AIRPORT IN THE SHIPPED TABLE, and that is why the terminator is CLOSURE and not the lookup', () => {
  // `WST ISSUANCES EXPD` follows two areas in this bulletin, and WST resolves —
  // Westerly, Rhode Island. A parser that read points until one failed to
  // resolve would take it as a vertex and drag a Kansas polygon to New England.
  assert.ok(lookup('WST'), 'WST no longer resolves; this test no longer proves what it says');
  const kansas = fromClauses(REAL_FEED_BULLETIN)[1];
  assert.ok(!kansas.endsWith('WST'), 'the clause swallowed WST');
  const { points } = resolveClause(kansas, lookup);
  const east = Math.max(...points.map((p) => p.lon));
  assert.ok(east < -95, `a vertex came out at ${east} — the polygon reached the east coast`);
});

test('every ident in the real bulletin resolves against the SHIPPED table', () => {
  // Fourteen of them, checked rather than assumed. If any were missing the
  // advisory would honestly report "could not place" — the table is not widened
  // to make this pass.
  for (const clause of fromClauses(REAL_FEED_BULLETIN)) {
    assert.deepEqual(resolveClause(clause, lookup).unresolved, [], clause);
  }
});

test('AND THE WHOLE POINT: the real bulletin is ELSEWHERE, not unplaceable', () => {
  // New Mexico, Kansas and the Gulf. Before this it read "0 over your area,
  // 16 that could not be placed" on a panel in California.
  const out = placeAdvisory(REAL_FEED_BULLETIN, NORCAL, lookup);
  assert.equal(out.where, 'far');
  assert.deepEqual(out.unresolved, []);
  assert.equal(out.reason, null);

  // …and it really is near the ground it covers.
  assert.equal(placeAdvisory(REAL_FEED_BULLETIN, { latMin: 34, latMax: 36, lonMin: -107, lonMax: -105 }, lookup).where, 'near');
});
