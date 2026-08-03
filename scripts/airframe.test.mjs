import assert from 'node:assert/strict';
import test from 'node:test';

import { UNTYPED, airframeGroups, filterByAirframe } from '../public/src/data/traffic.js';

const ac = (hex, type, description) => ({ hex, type, description });

test('groups by type code, counting each', () => {
  const groups = airframeGroups([
    ac('a', 'B738', 'Boeing 737-800'),
    ac('b', 'B738', 'Boeing 737-800'),
    ac('c', 'A320', 'Airbus A320'),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => [g.id, g.count]),
    [['B738', 2], ['A320', 1]],
  );
});

test('the label is the broadcast description, not the code', () => {
  // "Boeing 747-400" is the thing worth reading. "B744" is not, for someone who
  // loves planes but does not speak ICAO.
  const [g] = airframeGroups([ac('a', 'B744', 'Boeing 747-400')]);
  assert.equal(g.label, 'Boeing 747-400');
  assert.equal(g.code, 'B744');
});

test('a type with no description falls back to its code', () => {
  const [g] = airframeGroups([ac('a', 'B744', null)]);
  assert.equal(g.label, 'B744');
});

test('one type with two spellings picks the most common, deterministically', () => {
  // Otherwise the button flickers between spellings as aircraft come and go.
  const groups = airframeGroups([
    ac('a', 'B738', 'Boeing 737-800'),
    ac('b', 'B738', 'Boeing 737NG'),
    ac('c', 'B738', 'Boeing 737-800'),
  ]);
  assert.equal(groups[0].label, 'Boeing 737-800');
  assert.equal(groups[0].count, 3);
});

test('a tie between two descriptions breaks alphabetically, not by insertion', () => {
  const first = airframeGroups([ac('a', 'B738', 'Zeta'), ac('b', 'B738', 'Alpha')]);
  const second = airframeGroups([ac('a', 'B738', 'Alpha'), ac('b', 'B738', 'Zeta')]);
  assert.equal(first[0].label, 'Alpha');
  assert.equal(second[0].label, 'Alpha', 'the same set in a different order gave a different label');
});

test('sorted by count, most numerous first', () => {
  const groups = airframeGroups([
    ac('a', 'A320', 'Airbus A320'),
    ac('b', 'B738', 'Boeing 737-800'),
    ac('c', 'B738', 'Boeing 737-800'),
    ac('d', 'B738', 'Boeing 737-800'),
    ac('e', 'A320', 'Airbus A320'),
  ]);
  assert.deepEqual(groups.map((g) => g.id), ['B738', 'A320']);
});

// ---------------------------------------------------------------------------
// The untyped bucket — an absence of information, not an airframe
// ---------------------------------------------------------------------------

test('aircraft broadcasting no type get their own bucket and are NOT dropped', () => {
  // Dropping them would make the picker's counts disagree with the scope, which
  // is the radar telling two different stories about the same sky.
  const groups = airframeGroups([ac('a', 'B738', 'Boeing 737-800'), ac('b', null, null), ac('c', '', '')]);
  const untyped = groups.find((g) => g.id === UNTYPED);
  assert.ok(untyped, 'untyped aircraft vanished');
  assert.equal(untyped.count, 2);
  assert.equal(untyped.label, 'Type not broadcast');
  assert.equal(untyped.code, null);
});

test('the untyped bucket sorts LAST even when it is the biggest', () => {
  const groups = airframeGroups([
    ac('a', null, null),
    ac('b', null, null),
    ac('c', null, null),
    ac('d', 'B744', 'Boeing 747-400'),
  ]);
  assert.equal(groups[groups.length - 1].id, UNTYPED);
  assert.equal(groups[0].id, 'B744');
});

test('the counts add up to the aircraft given — nothing is lost or double-counted', () => {
  const aircraft = [
    ac('a', 'B738', 'Boeing 737-800'),
    ac('b', null, null),
    ac('c', 'a320', 'Airbus A320'),
    ac('d', 'A320', 'Airbus A320'),
  ];
  const total = airframeGroups(aircraft).reduce((n, g) => n + g.count, 0);
  assert.equal(total, aircraft.length);
});

test('type codes are matched case-insensitively', () => {
  // A feed that sends 'a320' and 'A320' must not produce two buttons for one
  // airframe.
  const groups = airframeGroups([ac('a', 'a320', 'Airbus A320'), ac('b', 'A320', 'Airbus A320')]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
});

test('no aircraft means no groups, not a group of zero', () => {
  assert.deepEqual(airframeGroups([]), []);
  assert.deepEqual(airframeGroups(null), []);
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

test('filtering returns exactly the aircraft the count promised', () => {
  const aircraft = [
    ac('a', 'B738', 'Boeing 737-800'),
    ac('b', 'A320', 'Airbus A320'),
    ac('c', 'B738', 'Boeing 737-800'),
  ];
  // THE INVARIANT THAT MATTERS: every group's count equals what selecting it
  // shows. A picker whose number disagrees with its list is worse than none.
  for (const g of airframeGroups(aircraft)) {
    assert.equal(filterByAirframe(aircraft, g.id).length, g.count, `${g.id} count disagrees with its filter`);
  }
});

test('a null selection is every aircraft', () => {
  const aircraft = [ac('a', 'B738', 'x'), ac('b', null, null)];
  assert.equal(filterByAirframe(aircraft, null).length, 2);
  assert.equal(filterByAirframe(aircraft, undefined).length, 2);
});

test('selecting the untyped bucket returns only untyped aircraft', () => {
  const aircraft = [ac('a', 'B738', 'x'), ac('b', null, null), ac('c', '  ', null)];
  const got = filterByAirframe(aircraft, UNTYPED);
  assert.deepEqual(got.map((a) => a.hex), ['b', 'c']);
});

test('filtering is case-insensitive, matching how groups were built', () => {
  const aircraft = [ac('a', 'a320', 'Airbus A320'), ac('b', 'A320', 'Airbus A320')];
  assert.equal(filterByAirframe(aircraft, 'A320').length, 2);
});

test('a type that is no longer up there returns nothing rather than throwing', () => {
  assert.deepEqual(filterByAirframe([ac('a', 'B738', 'x')], 'B744'), []);
});
