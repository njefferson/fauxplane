/**
 * alerts.test.mjs — the crew alerting list, held to the rule that decides what
 * may go in it.
 *
 * The rule (alerts.js): a message earns its place only if the condition is real,
 * is degrading something, and is NOT already visible on the page the reader is
 * looking at. Without that clause this list becomes the value strip again — a
 * band of glass restating what is drawn beside it — so most of these tests are
 * about what the list must NOT contain.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { KOLLSMAN_TOLERANCE_INHG, alertsSummary, crewAlerts } from '../public/src/data/alerts.js';

/** A live field, as the store publishes one. */
const ok = (value) => ({ value, provenance: 'LIVE', reason: null });
const bad = (reason) => ({ value: null, provenance: 'FAIL', reason });

/** A panel with nothing wrong: a fix, a station, and the dial on its setting. */
const healthy = () => ({
  'position.lat': ok(38.7),
  'position.lon': ok(-121.0),
  'control.kollsman': ok(30.12),
  'metar.station': ok('KSMF'),
});

const ids = (list) => list.map((a) => a.id);

// ---------------------------------------------------------------------------
// Empty is a valid state, and it is the one that proves this is not furniture
// ---------------------------------------------------------------------------

test('A PANEL THAT IS OFF RAISES NOTHING, however broken it looks', () => {
  /**
   * Every field is seeded FAIL when the store is constructed, deliberately, so
   * a panel that mounts before any sensor has spoken still renders flags. Alert
   * on that and the strip lights on the very first frame of a cold app and
   * never goes out — about conditions nobody has tried to satisfy yet.
   *
   * The accessibility gate found this by measuring the strip on a panel it had
   * never switched on, and correctly called what it saw furniture.
   */
  const cold = {
    'position.lat': bad('not yet initialised'),
    'control.kollsman': ok(29.92),
    'metar.station': bad('not yet initialised'),
  };
  assert.deepEqual(crewAlerts(cold, { powered: false }), []);
  assert.deepEqual(crewAlerts(cold, {}), [], 'and off is the default, not something to remember to pass');
  // The same state with the power on is NOT silent — otherwise this test would
  // pass just as well against a function that always returns nothing.
  assert.ok(crewAlerts(cold, { powered: true }).length > 0, 'powering on must produce the messages');
});

test('a healthy panel produces NO alerts at all', () => {
  // A real EICAS is blank when nothing is wrong. A strip that always has
  // something in it stops being read, which would make it worse than absent.
  const alerts = crewAlerts(healthy(), { powered: true, stationAltimeterInHg: 30.12 });
  assert.deepEqual(alerts, []);
});

test('nothing already drawn on the PFD is repeated here', () => {
  // Attitude, heading, vertical speed and the levelling offset are all crossed
  // out or annotated on the horizon itself. If any of them ever starts
  // producing a message, this list has become the value strip again.
  const fields = {
    ...healthy(),
    'attitude.pitch': bad('no motion sensor'),
    'attitude.roll': bad('no motion sensor'),
    'attitude.heading': bad('this device reports no magnetic heading'),
    'vsi.rate': bad('no altitude source'),
    'speed.tas': bad('no winds aloft'),
  };
  assert.deepEqual(crewAlerts(fields, { powered: true, stationAltimeterInHg: 30.12 }), []);
});

// ---------------------------------------------------------------------------
// ALTIMETER — the one real flight-deck alert this panel can honestly raise
// ---------------------------------------------------------------------------

test('a Kollsman off the field setting is a CAUTION naming both numbers', () => {
  const alerts = crewAlerts({ ...healthy(), 'control.kollsman': ok(29.92) }, { powered: true, stationAltimeterInHg: 30.12 });
  assert.deepEqual(ids(alerts), ['altimeter-set']);
  assert.equal(alerts[0].level, 'caution');
  assert.match(alerts[0].detail, /29\.92/, 'the dial');
  assert.match(alerts[0].detail, /30\.12/, 'the field');
  assert.match(alerts[0].detail, /KSMF/, 'which field');
  // "Check altimeter" without the error is a chore. 0.20 inHg is about 200 ft.
  assert.match(alerts[0].detail, /200 ft/);
});

test('the tolerance is one dial click, so a single nudge is not an alert', () => {
  assert.equal(KOLLSMAN_TOLERANCE_INHG, 0.011);
  const justInside = crewAlerts({ ...healthy(), 'control.kollsman': ok(30.13) }, { powered: true, stationAltimeterInHg: 30.12 });
  assert.deepEqual(ids(justInside), [], 'one hundredth is the dial step, not a discrepancy');
  const justOutside = crewAlerts({ ...healthy(), 'control.kollsman': ok(30.14) }, { powered: true, stationAltimeterInHg: 30.12 });
  assert.deepEqual(ids(justOutside), ['altimeter-set']);
});

test('a dial BELOW the field setting alerts exactly as one above does', () => {
  const low = crewAlerts({ ...healthy(), 'control.kollsman': ok(29.50) }, { powered: true, stationAltimeterInHg: 30.12 });
  assert.deepEqual(ids(low), ['altimeter-set']);
  assert.match(low[0].detail, /620 ft/, 'the error is reported as a magnitude, not a signed number');
});

test('no station means no setting to check against, and the panel says the altitudes are standard', () => {
  const fields = { ...healthy(), 'metar.station': bad('no station in the box had a usable position') };
  const alerts = crewAlerts(fields, { powered: true, stationAltimeterInHg: null });
  assert.deepEqual(ids(alerts), ['altimeter-standard']);
  assert.match(alerts[0].detail, /standard/);
});

test('with no Kollsman value at all there is no altimeter message either way', () => {
  // A dial that has never been set is not a dial that is set wrong.
  const fields = { ...healthy(), 'control.kollsman': bad('not yet initialised') };
  assert.deepEqual(ids(crewAlerts(fields, { powered: true, stationAltimeterInHg: 30.12 })), []);
  assert.deepEqual(ids(crewAlerts(fields, { powered: true, stationAltimeterInHg: null })), []);
});

// ---------------------------------------------------------------------------
// The reasons the horizon structurally cannot carry
// ---------------------------------------------------------------------------

test('a DENIED motion permission says so, because it is the one failure the reader can undo', () => {
  // ATT FAIL is already on the horizon and this does not repeat it. What the
  // flag cannot say is "denied" — a phone with no gyroscope looks identical.
  const alerts = crewAlerts(healthy(), { powered: true, stationAltimeterInHg: 30.12, motionDenied: 'Motion access was denied.' });
  assert.deepEqual(ids(alerts), ['motion-denied']);
  assert.match(alerts[0].detail, /PWR/, 'and it says how to be asked again');
});

test('no position fix carries the reason and says what the numbers are measured from', () => {
  const fields = { ...healthy(), 'position.lat': bad('location permission denied') };
  const alerts = crewAlerts(fields, { powered: true, stationAltimeterInHg: 30.12 });
  assert.deepEqual(ids(alerts), ['no-fix']);
  assert.match(alerts[0].detail, /location permission denied/);
  assert.match(alerts[0].detail, /home reference/);
});

test('following an aircraft that has not been heard says the panel is not broken', () => {
  // Every followed field crossed out at once is exactly what a broken panel
  // looks like. This is the sentence that tells the two apart.
  const alerts = crewAlerts(healthy(), { powered: true, stationAltimeterInHg: 30.12, followLabel: 'PXT466', following: false });
  assert.deepEqual(ids(alerts), ['follow-silent']);
  assert.match(alerts[0].detail, /PXT466/);
  assert.match(alerts[0].detail, /crossed out/);
});

test('once the broadcast arrives that message goes away', () => {
  const alerts = crewAlerts(healthy(), { powered: true, stationAltimeterInHg: 30.12, followLabel: 'PXT466', following: true });
  assert.deepEqual(ids(alerts), []);
});

// ---------------------------------------------------------------------------
// The traffic feed — a STATUS line, deliberately not amber
// ---------------------------------------------------------------------------

test('a refused traffic feed is STATUS, because the navigation display already flags it', () => {
  const readiness = { state: 'refused', label: 'NO CONTACT · RETRY 6s', detail: 'The feed is not answering.' };
  const alerts = crewAlerts(healthy(), { powered: true, stationAltimeterInHg: 30.12, readiness });
  assert.deepEqual(ids(alerts), ['traffic-feed']);
  assert.equal(alerts[0].level, 'status', 'amber is for what the reader cannot already see');
  assert.equal(alerts[0].text, 'NO CONTACT · RETRY 6s', 'the flag verbatim — two wordings of one state would drift');
});

test('a healthy or merely empty feed produces no message', () => {
  for (const state of ['contact', 'empty', 'listening', 'following']) {
    const readiness = { state, label: state.toUpperCase(), detail: '' };
    assert.deepEqual(ids(crewAlerts(healthy(), { powered: true, stationAltimeterInHg: 30.12, readiness })), [], state);
  }
});

// ---------------------------------------------------------------------------
// Ranking, and the tier that is deliberately never emitted
// ---------------------------------------------------------------------------

test('cautions come before status, whatever order they were found in', () => {
  const readiness = { state: 'refused', label: 'NO CONTACT', detail: '' };
  const alerts = crewAlerts({ ...healthy(), 'control.kollsman': ok(29.92) }, {
    powered: true,
    stationAltimeterInHg: 30.12,
    readiness,
    motionDenied: 'Motion access was denied.',
  });
  const levels = alerts.map((a) => a.level);
  assert.deepEqual(levels, ['caution', 'caution', 'status']);
});

test('EVERY level this module can emit has a colour rule in the stylesheet', () => {
  /**
   * The gap this closes. `styles.css` deliberately has no `warning` rule,
   * because nothing emits one and an unemitted colour is unmeasurable — the
   * contrast gate fails on a selector matching nothing, so it could never be
   * checked. That is a fine trade right up until someone adds a red message and
   * not the rule, at which point it renders in the default ink and the tier
   * silently stops meaning anything.
   *
   * So: whatever levels the module CAN produce must have a rule. Adding one is
   * then a two-file change the suite insists on rather than a thing to remember.
   */
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

  // Every level reachable from the real function, gathered by running it into
  // every branch rather than by listing them here — a list would be the drift.
  const emitted = new Set(
    [
      crewAlerts({ 'control.kollsman': ok(29.92), 'metar.station': ok('KSMF'), 'position.lat': ok(1), 'position.lon': ok(1) }, { powered: true, stationAltimeterInHg: 30.5 }),
      crewAlerts({ 'control.kollsman': ok(29.92), 'metar.station': bad('none'), 'position.lat': ok(1) }, { powered: true }),
      crewAlerts({ 'position.lat': bad('denied') }, { powered: true }),
      crewAlerts({ 'position.lat': ok(1) }, { powered: true, motionDenied: 'denied' }),
      crewAlerts({ 'position.lat': ok(1) }, { powered: true, followLabel: 'X', following: false }),
      crewAlerts({ 'position.lat': ok(1) }, { powered: true, readiness: { state: 'refused', label: 'NO CONTACT', detail: 'x' } }),
      crewAlerts({ 'position.lat': ok(1) }, { powered: true, readiness: { state: 'ageing', label: 'AGEING', detail: 'x' } }),
    ].flat().map((a) => a.level),
  );

  assert.ok(emitted.size >= 2, 'expected at least caution and status to be reachable');
  for (const level of emitted) {
    assert.ok(
      css.includes(`.eicas-msg[data-level='${level}'] .eicas-code`),
      `level "${level}" is emitted but has no colour rule in styles.css — it would render in the default ink`,
    );
  }
});

test('NOTHING emits the red warning tier, and that is a statement rather than an omission', () => {
  // This is a phone clamped to a desk. No condition it can detect requires
  // anybody to act immediately, and a red message for a rate-limited feed would
  // devalue the colour on the day something does.
  const everythingWrong = {
    'position.lat': bad('denied'),
    'position.lon': bad('denied'),
    'control.kollsman': ok(28.00),
    'metar.station': ok('KSMF'),
  };
  const alerts = crewAlerts(everythingWrong, { powered: true,
    stationAltimeterInHg: 31.00,
    motionDenied: 'denied',
    followLabel: 'DAL2229',
    following: false,
    readiness: { state: 'refused', label: 'NO CONTACT', detail: '' },
  });
  assert.ok(alerts.length >= 4, 'expected the whole list');
  assert.equal(alerts.filter((a) => a.level === 'warning').length, 0);
});

test('every message has an id, a level, a short text and a detail', () => {
  const alerts = crewAlerts({ 'control.kollsman': ok(28.0), 'metar.station': ok('KSMF') }, {
    powered: true,
    stationAltimeterInHg: 30.0,
    motionDenied: 'denied',
    readiness: { state: 'ageing', label: 'AGEING · 3', detail: 'The feed is not answering.' },
  });
  const seen = new Set();
  for (const a of alerts) {
    assert.ok(a.id && !seen.has(a.id), `duplicate or missing id: ${a.id}`);
    seen.add(a.id);
    assert.ok(['warning', 'caution', 'status'].includes(a.level), `unknown level ${a.level}`);
    assert.ok(a.text && a.text.length <= 24, `${a.id}: the short text is a flight-deck message, not a sentence`);
    /**
     * A DETAIL IS OPTIONAL, and exactly one message goes without: the traffic
     * flag, whose label already says everything (NO CONTACT · RETRY 6s). Every
     * other message must have one, because a bare code means nothing to a
     * reader who is not a pilot.
     */
    if (a.id === 'traffic-feed') assert.equal(a.detail, '', 'the flag carries itself; a second wording would drift');
    else assert.ok(a.detail && a.detail.length > 20, `${a.id}: no detail`);
    /**
     * A FLIGHT-DECK MESSAGE, NOT A SUPPORT ARTICLE. The strip is one column
     * wide and capped at the leftover height it was allowed to claim; the first
     * version wrote these as prose and a SINGLE message overflowed the cap, so
     * the accessibility gate found every row clipped and the contrast sampler
     * read pixels nobody could see. Roughly 55 characters fit on a line there.
     */
    assert.ok(a.detail.length <= 78, `${a.id}: the detail is ${a.detail.length} chars — it will wrap past the strip's cap`);
  }
});

// ---------------------------------------------------------------------------
// The spoken summary
// ---------------------------------------------------------------------------

test('the summary says NONE rather than vanishing', () => {
  // The strip is hidden when empty, so a reader using the panel by voice would
  // otherwise find an element that had silently disappeared.
  assert.equal(alertsSummary([]), 'Crew alerts: none.');
});

test('the summary counts cautions and status messages separately', () => {
  assert.equal(alertsSummary([{ level: 'caution' }]), 'Crew alerts: 1 caution.');
  assert.equal(alertsSummary([{ level: 'caution' }, { level: 'caution' }]), 'Crew alerts: 2 cautions.');
  assert.equal(alertsSummary([{ level: 'caution' }, { level: 'status' }]), 'Crew alerts: 1 caution, 1 status message.');
  assert.equal(alertsSummary([{ level: 'status' }, { level: 'status' }]), 'Crew alerts: 2 status messages.');
});
