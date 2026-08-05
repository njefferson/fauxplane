/**
 * alerts.js — the crew alerting half of EICAS, for the space under the ND.
 *
 * WHAT EICAS ACTUALLY IS. On a 747 the centre display carries engine
 * indications and crew alerting messages. This panel has no engine, so the
 * alerting half is the whole of it: a ranked list of conditions, most urgent
 * first, in the flight deck's own colours.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THAT DECIDES WHAT GOES IN IT, because without one this becomes the
 * value strip again — a band of glass restating what is already drawn beside it.
 * ---------------------------------------------------------------------------
 *
 * A message earns its place ONLY if the condition is real, is degrading
 * something, and is NOT ALREADY VISIBLE ON THE PAGE THE READER IS LOOKING AT.
 *
 * That last clause is the whole design. The PFD already crosses out every failed
 * field with its reason, draws ATT FAIL on the horizon, prints the levelling
 * offset on the ADI, and — since 1.29.1 — flags the traffic feed's state on the
 * navigation display itself. Repeating any of that here would be furniture.
 *
 * What the PFD CANNOT show is everything true on the OTHER pages. The altimeter
 * is set on ATIS; a Kollsman quietly off the field's setting is the oldest error
 * in aviation and is invisible from the horizon. A denied sensor permission
 * shows as ATT FAIL but the ADI cannot say the word "denied", which is the one
 * part the reader can actually fix. Those are what this list is for.
 *
 * ---------------------------------------------------------------------------
 * THE TIERS, and why one of them is deliberately never emitted.
 * ---------------------------------------------------------------------------
 *
 * Boeing's tiers are WARNING (red, immediate action), CAUTION (amber,
 * awareness), ADVISORY and MEMO. This app follows the colour convention it
 * already follows everywhere else: red for a condition needing immediate
 * action, amber for one to be aware of.
 *
 * NOTHING HERE EMITS RED, and that is a statement rather than an omission. This
 * is a phone clamped to a desk. No condition it can detect requires anybody to
 * do anything immediately, and lighting a red message for a rate-limited traffic
 * feed would devalue the colour on the day something does. `warning` exists in
 * the type because a real EICAS has it and because the renderer must handle it
 * if one is ever justified — not because one is pending.
 *
 * EMPTY IS A VALID STATE AND SHOWS NOTHING. A real EICAS is blank when nothing
 * is wrong. A strip that always has something in it stops being read.
 *
 * Pure, and takes fields and a readiness object rather than a store, so every
 * message this panel can produce is testable without a browser or a feed.
 */

/** How far the Kollsman may sit from the field's setting before it is an alert.
 *  One hundredth is the dial's own step, so anything at or below it is the
 *  reader having turned it exactly one click and not a discrepancy. */
export const KOLLSMAN_TOLERANCE_INHG = 0.011;

/** Ranked most urgent first. A message's position in the list IS its rank —
 *  there is no separate priority number to drift out of step with the order. */
const RANK = ['warning', 'caution', 'status'];

const live = (f) => !!f && f.provenance !== 'FAIL';

/**
 * @param {object} fields the store's current snapshot fields
 * @param {object} opts
 * @param {boolean} opts.powered whether the panel has been switched on
 * @param {object|null} opts.readiness `radarReadiness(...)`, or null
 * @param {number|null} opts.stationAltimeterInHg what the selected station reports
 * @param {string|null} opts.motionDenied reason motion access was refused, if it was
 * @param {string|null} opts.followLabel the aircraft being followed, if any
 * @param {boolean} opts.following whether a followed aircraft has been heard
 * @returns {{id: string, level: string, text: string, detail: string}[]}
 */
export function crewAlerts(fields = {}, {
  powered = false,
  readiness = null,
  stationAltimeterInHg = null,
  motionDenied = null,
  followLabel = null,
  following = false,
} = {}) {
  /**
   * A PANEL THAT IS OFF RAISES NOTHING, and this is the first rule rather than
   * an edge case.
   *
   * Before power every field in the store is FAIL by construction — that is how
   * the store is seeded, deliberately, so a panel that mounts before any sensor
   * has spoken still renders flags. Alerting on that state would light the strip
   * on the very first frame of a cold app, permanently, about conditions nobody
   * has tried to satisfy yet. A real EICAS with no power shows nothing at all.
   *
   * Found by the accessibility gate, which measured the strip on a panel it had
   * never switched on and correctly called it furniture.
   */
  if (!powered) return [];

  const out = [];

  /**
   * ALTIMETER — the one real flight-deck alert this panel can honestly raise.
   *
   * A Kollsman off the field's setting means every altitude on the panel is
   * wrong by about a thousand feet per inch, and NOTHING on the PFD says so:
   * the ALT tape shows a confident number computed from a setting the reader
   * last touched on a different page. Both values are named, because "check
   * altimeter" without the two numbers is a chore rather than an alert.
   */
  const koll = fields['control.kollsman'];
  if (live(koll) && Number.isFinite(stationAltimeterInHg)) {
    const delta = koll.value - stationAltimeterInHg;
    if (Math.abs(delta) > KOLLSMAN_TOLERANCE_INHG) {
      const station = live(fields['metar.station']) ? fields['metar.station'].value : 'the field';
      out.push({
        id: 'altimeter-set',
        level: 'caution',
        text: 'ALTIMETER',
        detail: `Set ${koll.value.toFixed(2)} · ${station} ${stationAltimeterInHg.toFixed(2)} · about ${Math.abs(Math.round(delta * 1000))} ft out`,
      });
    }
  } else if (live(koll) && !live(fields['metar.station'])) {
    // No station means no setting to check against, and the dial is on the
    // standard 29.92 by fallback. The altitudes are still being computed and
    // still being shown; what is missing is any reason to believe them.
    out.push({
      id: 'altimeter-standard',
      level: 'caution',
      text: 'ALTIMETER STD',
      detail: `No station setting · ${koll.value.toFixed(2)} standard · altitude approximate`,
    });
  }

  /**
   * MOTION SENSORS — the reason, which the ADI structurally cannot carry.
   *
   * ATT FAIL is already drawn on the horizon and this does not repeat it. What
   * it adds is the word DENIED, because a permission the reader refused is the
   * one failure on this panel they can undo, and the flag on the horizon looks
   * identical to a phone that simply has no gyroscope.
   */
  if (motionDenied) {
    out.push({
      id: 'motion-denied',
      level: 'caution',
      text: 'MOTION SENSORS',
      detail: `${motionDenied} · the horizon needs them · press PWR to ask again`,
    });
  }

  /**
   * POSITION — everything measured from somewhere the reader is not.
   *
   * With no fix the app falls back to the home reference, openly, and both the
   * scope and the weather are then measured from there. The RADAR page says so
   * under the crosshair; the PFD has nowhere to.
   */
  const lat = fields['position.lat'];
  if (!live(lat)) {
    out.push({
      id: 'no-fix',
      level: 'caution',
      text: 'POSITION',
      detail: `${lat?.reason ?? 'no fix'} · measured from the home reference instead`,
    });
  }

  /**
   * FOLLOWING AN AIRCRAFT THAT HAS NOT BEEN HEARD. The banner says which
   * aircraft; what it does not say is that the entire panel is therefore
   * showing nothing, which is the question a reader asks when every gauge is
   * crossed out at once.
   */
  if (followLabel && !following) {
    out.push({
      id: 'follow-silent',
      level: 'caution',
      text: 'NO BROADCAST',
      detail: `Nothing from ${followLabel} yet · its fields stay crossed out until it is heard`,
    });
  }

  /**
   * THE TRAFFIC FEED, LAST AND AS STATUS RATHER THAN CAUTION. The navigation
   * display already carries this state as a flag on the instrument, so the
   * message is a restatement in a place a reader may be looking instead — which
   * is worth a line and is not worth amber.
   */
  if (readiness && (readiness.state === 'refused' || readiness.state === 'ageing')) {
    out.push({
      id: 'traffic-feed',
      level: 'status',
      text: readiness.label,
      /**
       * NO DETAIL, AND THAT IS THE POINT. `readiness.detail` is written for the
       * RADAR page's status line, where it has a full-width row: "The feed is
       * not answering and nothing has been heard yet. Asking again in 6s." In a
       * column-wide message strip that is four wrapped lines for a fact the
       * label already carries — NO CONTACT · RETRY 6s is the whole of it.
       *
       * Writing a SECOND, shorter sentence here would be two wordings of one
       * state, which is the drift `radarReadiness` exists to prevent. So the
       * flag travels verbatim and nothing is added.
       */
      detail: '',
    });
  }

  return out.sort((a, b) => RANK.indexOf(a.level) - RANK.indexOf(b.level));
}

/**
 * What the strip says about itself when it has nothing to say.
 *
 * NOT RENDERED — the strip is hidden when the list is empty, exactly as a real
 * EICAS is blank. This is the accessible name of the region, so a reader using
 * the panel by voice can ask and be told nothing is outstanding rather than
 * finding an element that has silently vanished.
 */
export function alertsSummary(alerts) {
  if (!alerts.length) return 'Crew alerts: none.';
  const cautions = alerts.filter((a) => a.level === 'caution').length;
  const parts = [];
  if (cautions) parts.push(`${cautions} caution${cautions === 1 ? '' : 's'}`);
  const rest = alerts.length - cautions;
  if (rest) parts.push(`${rest} status message${rest === 1 ? '' : 's'}`);
  return `Crew alerts: ${parts.join(', ')}.`;
}
