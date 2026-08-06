/**
 * pfd.js — the primary flight display.
 *
 * A PANEL ONLY SUBSCRIBES. It reads no sensor, fetches nothing, and computes no
 * flight value; everything it draws arrives as a field from the store with its
 * provenance already decided. That is the core contract, and it is what makes
 * "every numeric readout traces to a state field" checkable rather than
 * aspirational — there is no other source in this file to trace to.
 *
 * ALTITUDE, AND THE ONE THING WORTH READING CAREFULLY. The tape shows whichever
 * of three genuinely different altitudes the app actually has, best first, and
 * the tape's own heading NAMES the one on it: ALT (indicated), MSL (above mean
 * sea level), or GPS ALT (geometric, above the ellipsoid). That is a selection
 * displayed on its own label, never a substitution — a pilot must never have to
 * guess which of the three they are reading, and the panel never silently swaps
 * one for another.
 */

import { formatAge } from '../core/units.js';
import { alertsSummary } from '../data/alerts.js';
import { drawAdi } from '../render/gauges/adi.js';
import { drawPlan } from '../render/gauges/plan.js';
import { drawGMeter, drawVsi } from '../render/gauges/vsi.js';
import { drawHeadingTape, drawVerticalTape } from '../render/gauges/tape.js';
import { createReadout, describeField, el } from '../render/dom.js';

const withAge = (field) => (field ? { ...field, ageText: formatAge(field.ageMs) } : field);

/**
 * WHICH OF SEVERAL GENUINELY DIFFERENT QUANTITIES IS ON A TAPE.
 *
 * Both moving tapes make the same choice: take the best one that is actually
 * available, and put its NAME on the tape's own heading. It is a selection shown
 * on its label, never a substitution — a pilot must never have to guess which of
 * three they are reading.
 *
 * Pure and exported because a canvas is invisible to the accessibility gate, so
 * this is the only place the choice can be checked. The last entry is the
 * fallback and is returned even when it too has failed, so the tape draws its
 * own cross under an honest heading rather than nothing at all.
 */
/**
 * The speed ladder, in ONE place — because the tape and the canvas's text
 * alternative both have to name the same quantity.
 *
 * They did not. The tape was hard-coded to groundspeed and so was the spoken
 * description, so fixing only the drawing would have left a reader who cannot
 * see the canvas being told "Groundspeed" while the glass said CAS. The two
 * descriptions of one instrument have to come from one decision.
 */
export function speedLadderFor(fields) {
  return [
    ['CAS', fields['speed.cas']],
    ['TAS', fields['speed.tas']],
    ['GS', fields['position.groundspeed']],
  ];
}

export function selectTape(ladder) {
  return ladder.find(([, f]) => f && f.provenance !== 'FAIL') ?? ladder[ladder.length - 1];
}

/**
 * THE ND INSET PREFERENCE.
 *
 * Injectable storage and a pure default, exactly like `loadSaved`/`saveMount`
 * in setup.js — so both halves are testable without a browser, and a private
 * window with no storage at all is a normal starting state rather than an error.
 *
 * DEFAULT ON. Anything unreadable, corrupt, or simply absent means ON: the
 * inset is what the panel has always had, and a preference that fails closed
 * would silently remove an instrument.
 */
const INSET_KEY = 'fauxplane.nd-inset';

export function loadInset(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(INSET_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveInset(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(INSET_KEY, on ? 'on' : 'off');
    return true;
  } catch {
    return false;
  }
}

export function createPfd({
  canvas,
  surface,
  readoutHost,
  announcer,
  mountOffset = () => null,
  planSurface = null,
  planCanvas = null,
  traffic = () => ({ aircraft: [], centre: null, rangeNm: 40, fromFix: false, followedHex: null }),
  /** The EICAS strip's host, and the list to put in it. Both optional: the unit
   *  tests construct this panel without a document, and a panel with no strip
   *  simply has no alerting display rather than a broken one. */
  eicasHost = null,
  alerts = () => [],
}) {
  let peakG = null;

  const readouts = {
    groundspeed: createReadout({ label: 'Groundspeed', unit: 'kt' }),
    altitude: createReadout({ label: 'GPS altitude', unit: 'ft', format: (v) => Math.round(v).toLocaleString() }),
    msl: createReadout({ label: 'MSL altitude', unit: 'ft', format: (v) => Math.round(v).toLocaleString() }),
    indicated: createReadout({ label: 'Indicated altitude', unit: 'ft', format: (v) => Math.round(v).toLocaleString() }),
    vsi: createReadout({ label: 'Vertical speed', unit: 'fpm', format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v / 10) * 10)}` }),
    heading: createReadout({ label: 'Heading', unit: '°M', format: (v) => String(Math.round(v) % 360).padStart(3, '0') }),
    track: createReadout({ label: 'Track', unit: '°T', format: (v) => String(Math.round(v) % 360).padStart(3, '0') }),
    pitch: createReadout({ label: 'Pitch', unit: '°', format: (v) => v.toFixed(1) }),
    roll: createReadout({ label: 'Roll', unit: '°', format: (v) => v.toFixed(1) }),
    gLoad: createReadout({ label: 'Load factor', unit: 'g', format: (v) => v.toFixed(2) }),
    slip: createReadout({ label: 'Slip / skid', unit: 'g', format: (v) => v.toFixed(2) }),
    turn: createReadout({ label: 'Turn rate', unit: '°/s', format: (v) => v.toFixed(1) }),
    tas: createReadout({ label: 'True airspeed', unit: 'kt' }),
    cas: createReadout({ label: 'Calibrated airspeed', unit: 'kt' }),
    aoa: createReadout({ label: 'Angle of attack', unit: '°', format: (v) => v.toFixed(1) }),
  };

  /**
   * WHAT THE CREW HAS DIALLED IN — only while following an aircraft.
   *
   * Kept in its own group and HIDDEN otherwise, because this device has no
   * autopilot to read: three permanently-crossed-out rows on the normal panel
   * would be noise dressed as instrumentation, and the panel is already
   * carefully honest about the difference. When following, an aircraft that
   * does not broadcast them crosses them out WITH ITS NAME in the reason, which
   * is a fact about that aircraft and worth showing.
   */
  const navReadouts = {
    selectedAltitude: createReadout({
      label: 'Selected altitude',
      unit: 'ft',
      format: (v) => Math.round(v).toLocaleString(),
      hint: 'What the crew has set on the autopilot',
    }),
    selectedHeading: createReadout({
      label: 'Selected heading',
      unit: '°',
      format: (v) => String(Math.round(v) % 360).padStart(3, '0'),
    }),
    crewQnh: createReadout({
      label: 'Crew altimeter setting',
      unit: 'hPa',
      format: (v) => Math.round(v).toString(),
    }),
  };
  const navGroup = el('div', { class: 'ro-group', role: 'group', 'aria-label': 'What the followed aircraft’s crew has selected' }, [
    el('h3', { class: 'ro-group-h', text: 'On the followed aircraft’s autopilot' }),
    ...Object.values(navReadouts).map((r) => r.root),
  ]);
  navGroup.hidden = true;

  readoutHost.replaceChildren(...Object.values(readouts).map((r) => r.root), navGroup);

  /** Throttle the canvas text alternative: it must stay current, but rewriting
   *  it 25 times a second is a live-region flood in everything but name. */
  let lastAltAt = 0;

  const draw = (fields) => {
    const t = surface.tokens;
    surface.begin();
    const { width: W, height: H } = surface;
    if (W < 2 || H < 2) return;

    // Proportional layout, measured from the box that exists right now. No
    // constant here is a pixel size (Doctrine §4 — no fixed size that ignores
    // the space available).
    const pad = Math.max(4, Math.min(10, W * 0.012));
    const tapeW = Math.max(46, Math.min(96, W * 0.115));
    const headingH = Math.max(30, Math.min(52, H * 0.13));
    const bodyH = H - headingH - pad;
    const vsiW = Math.max(30, Math.min(58, W * 0.07));

    const adiX = pad + tapeW + pad;
    const adiW = W - (tapeW + pad) * 2 - vsiW - pad * 2;

    const pitch = fields['attitude.pitch'];
    const roll = fields['attitude.roll'];
    // PITCH AND ROLL ARE PASSED SEPARATELY, because they can fail separately.
    // Following an aircraft gives a derived bank and no pitch at all, and the
    // ADI degrades to a bank-only instrument rather than crossing itself out.
    const okPitch = pitch && pitch.provenance !== 'FAIL';
    const okRoll = roll && roll.provenance !== 'FAIL';
    const attitude =
      okRoll
        ? {
            pitch: okPitch ? pitch.value : null,
            roll: roll.value,
            provenance: (okPitch && pitch.provenance === 'STALE') || roll.provenance === 'STALE' ? 'STALE' : roll.provenance,
            ageText: formatAge(Math.max(okPitch ? (pitch.ageMs ?? 0) : 0, roll.ageMs ?? 0)),
            pitchReason: okPitch ? null : (pitch?.reason ?? 'pitch unavailable'),
            // A usable attitude may still carry a caveat — "the gyro has not
            // settled, this is the gravity reference alone". That belongs ON
            // the horizon, not only on BITE: it is the difference between an
            // instrument that is right and one that is right for now.
            reason: (okPitch ? pitch.reason : null) ?? roll.reason ?? null,
          }
        : { provenance: 'FAIL', reason: pitch?.reason ?? roll?.reason ?? 'no attitude' };

    drawAdi(ctxOf(surface), {
      x: adiX,
      y: pad,
      w: adiW,
      h: bodyH - pad,
      tokens: t,
      attitude,
      slip: withAge(fields['motion.lateralG']),
      turnRate: withAge(fields['attitude.turnRate']),
      // AN INSTRUMENT WHOSE ZERO HAS BEEN MOVED SAYS SO, on its own face. The
      // levelling is legitimate and it is not a failure, but "this horizon
      // reads zero at an attitude the device is not actually at" is exactly the
      // sort of thing that must not live only in a settings page.
      mount: mountOffset(),
    });

    /**
     * WHICH SPEED IS ON THE TAPE IS A REAL DECISION TOO, and it used to be
     * decided once, in the source, as groundspeed.
     *
     * A REAL PFD'S LEFT TAPE IS AIRSPEED AND NEVER GROUNDSPEED. Groundspeed is a
     * small readout in the navigation display's corner. Hard-coding GS here put
     * a real number in the position a pilot reads as airspeed — the panel was
     * honest about WHAT it was showing and wrong about WHERE.
     *
     * The fix is the ladder the altitude tape below already uses, for the same
     * reason and in the same words: a SELECTION shown on the tape's own heading,
     * never a substitution. Best first:
     *
     *   CAS  calibrated airspeed — what an airspeed indicator shows, once
     *        pressure altitude and temperature are known
     *   TAS  true airspeed — needs winds aloft where the aircraft actually is
     *   GS   groundspeed — the GPS reading, which is what a desk has
     *
     * On a stationary desk it lands on GS and says GS. While following an
     * aircraft, CAS and TAS are correctly FAIL (this device's weather is not the
     * aircraft's), so it lands on GS there too — and the heading says so rather
     * than letting the position imply airspeed.
     */
    const [speedLabel, speedField] = selectTape(speedLadderFor(fields));
    drawVerticalTape(ctxOf(surface), {
      x: pad,
      y: pad,
      w: tapeW,
      h: bodyH - pad,
      tokens: t,
      field: withAge(speedField),
      label: speedLabel,
      unit: 'kt',
      step: 10,
      major: 2,
      span: 120,
      side: 'left',
    });

    // WHICH ALTITUDE IS ON THE TAPE IS A REAL DECISION, AND THE LABEL CARRIES IT.
    //
    // Three genuinely different quantities, best first:
    //   ALT     indicated altitude — needs the geoid AND a station altimeter
    //   MSL     height above mean sea level — needs only the geoid, so it
    //           works with the radio off, which matters for an offline app
    //   GPS ALT geometric height above the ellipsoid — the raw sensor reading
    //
    // This is a SELECTION shown on the tape's own heading, never a substitution.
    // A pilot must never have to guess which of the three they are reading.
    const ladder = [
      ['ALT', fields['altitude.indicated']],
      ['MSL', fields['altitude.msl']],
      ['GPS ALT', fields['position.altitudeGeometric']],
    ];
    const [altLabel, altField] = selectTape(ladder);
    drawVerticalTape(ctxOf(surface), {
      x: W - pad - tapeW - vsiW - pad,
      y: pad,
      w: tapeW,
      h: bodyH - pad,
      tokens: t,
      field: withAge(altField),
      label: altLabel,
      unit: 'ft',
      step: 100,
      major: 2,
      span: 1200,
      side: 'right',
      format: (v) => String(Math.round(v)),
      // WHAT THE CREW DIALLED IN. Broadcast by many aircraft and, until now,
      // shown only as a text row beside the panel — which is where a value goes
      // when nobody has decided what it MEANS. On a real PFD it is a bug on this
      // tape and a number above it, because the gap between where you are and
      // where you were cleared to is the thing being read.
      selected: withAge(fields['nav.selectedAltitude']),
    });

    drawVsi(ctxOf(surface), {
      x: W - pad - vsiW,
      y: pad,
      w: vsiW,
      h: bodyH - pad,
      tokens: t,
      field: withAge(fields['vsi.rate']),
    });

    // THE DIRECTION LADDER, on the same principle as the altitude one above.
    //
    //   HDG  magnetic heading — where the nose points. The compass answer.
    //   TRK  ground track — where the aircraft is actually going.
    //
    // They differ by the drift angle. On this device the magnetometer usually
    // answers; following a flight it usually does not, because most aircraft
    // broadcast a track and no heading at all. Either way the tape's own label
    // says which one is on it, and nothing is ever silently substituted.
    const dirLadder = [
      ['HDG', fields['attitude.heading']],
      ['TRK', fields['position.track']],
    ];
    const [dirLabel, dirField] = dirLadder.find(([, f]) => f && f.provenance !== 'FAIL') ?? dirLadder[0];
    drawHeadingTape(ctxOf(surface), {
      x: pad,
      y: H - headingH,
      w: W - pad * 2,
      h: headingH - 2,
      tokens: t,
      heading: withAge(dirField),
      track: withAge(fields['position.track']),
      label: dirLabel,
      // The heading bug, for the same reason the altitude bug exists: the crew's
      // intent belongs on the instrument that shows the quantity, not in a list
      // beside it.
      selected: withAge(fields['nav.selectedHeading']),
    });

    const g = fields['motion.gLoad'];
    if (g && g.provenance !== 'FAIL' && (peakG === null || g.value > peakG)) peakG = g.value;
    drawGMeter(ctxOf(surface), {
      x: adiX + 4,
      y: pad + 4,
      w: Math.max(58, adiW * 0.16),
      h: Math.max(44, adiW * 0.11),
      tokens: t,
      field: withAge(g),
      peak: peakG,
    });
  };

  const updateReadouts = (fields) => {
    readouts.groundspeed.update(fields['position.groundspeed']);
    readouts.altitude.update(fields['position.altitudeGeometric']);
    readouts.msl.update(fields['altitude.msl']);
    readouts.indicated.update(fields['altitude.indicated']);
    readouts.vsi.update(fields['vsi.rate']);
    readouts.heading.update(fields['attitude.heading']);
    readouts.track.update(fields['position.track']);
    readouts.pitch.update(fields['attitude.pitch']);
    readouts.roll.update(fields['attitude.roll']);
    readouts.gLoad.update(fields['motion.gLoad']);
    readouts.slip.update(fields['motion.lateralG']);
    readouts.turn.update(fields['attitude.turnRate']);
    readouts.tas.update(fields['speed.tas']);
    readouts.cas.update(fields['speed.cas']);
    readouts.aoa.update(fields['aoa.angle']);

    // WHAT THE CREW HAS SELECTED — only meaningful, and only shown, while an
    // aircraft is being followed. Updated before the group is hidden so the
    // rows are never left holding a previous aircraft's numbers underneath.
    navReadouts.selectedAltitude.update(fields['nav.selectedAltitude']);
    navReadouts.selectedHeading.update(fields['nav.selectedHeading']);
    navReadouts.crewQnh.update(fields['nav.crewQnh']);
    navGroup.hidden = !(traffic() ?? {}).followedHex;
  };

  /** The canvas text alternative. It describes WHAT IS ON IT and is kept
   *  current as that changes — "Primary flight display" would be a label for
   *  the box, not an alternative to the content. */
  const updateAlt = (fields, now) => {
    if (now - lastAltAt < 1000) return;
    lastAltAt = now;
    const parts = [
      describeField('Pitch', fields['attitude.pitch'], { unit: 'degrees', format: (v) => v.toFixed(1) }),
      describeField('Roll', fields['attitude.roll'], { unit: 'degrees', format: (v) => v.toFixed(1) }),
      describeField('Heading', fields['attitude.heading'], { unit: 'degrees magnetic', format: (v) => String(Math.round(v)) }),
      (() => {
        // THE SAME SELECTION THE TAPE MADE. A reader who cannot see the canvas
        // gets this sentence instead of the instrument, so naming a different
        // quantity from the one drawn would be the panel telling two people two
        // different things.
        const [label, field] = selectTape(speedLadderFor(fields));
        const spoken = { CAS: 'Calibrated airspeed', TAS: 'True airspeed', GS: 'Groundspeed' }[label] ?? label;
        return describeField(spoken, field, { unit: 'knots', format: (v) => String(Math.round(v)) });
      })(),
      describeField('GPS altitude', fields['position.altitudeGeometric'], { unit: 'feet', format: (v) => String(Math.round(v)) }),
      describeField('Vertical speed', fields['vsi.rate'], { unit: 'feet per minute', format: (v) => String(Math.round(v)) }),
      describeField('Load factor', fields['motion.gLoad'], { unit: 'g', format: (v) => v.toFixed(2) }),
    ];
    canvas.setAttribute('aria-label', `Primary flight display. ${parts.join('. ')}.`);
  };

  /**
   * The navigation display beside the horizon — the same plan view the RADAR
   * page draws, from the same source, because two drawings of one truth is how
   * they end up disagreeing.
   *
   * Silent when there is no traffic surface (the unit tests construct the panel
   * without one) and when the centre is unknown, which is the honest state
   * before the first fix rather than a ring drawn around nowhere.
   */
  /**
   * EICAS — the crew alerting list, under the navigation display.
   *
   * `alerts.js` decides WHAT is in the list and why; this only draws it. The
   * split is the same one every other instrument here keeps: the rule is pure
   * and testable without a browser, the rendering is not.
   *
   * REBUILT WHOLESALE EACH FRAME rather than diffed. The list is at most five
   * short rows and this runs on a render that already redraws four canvases;
   * a diff here would be machinery guarding nothing.
   *
   * HIDDEN WHEN EMPTY, which is the state a real EICAS is in most of the time.
   * The accessible name still carries the summary, so "none" is something a
   * reader can be told rather than an element that has disappeared.
   */
  /**
   * THE ROWS ARE KEPT AND THEIR TEXT IS UPDATED; only a change in the LIST
   * ITSELF rebuilds them.
   *
   * The traffic flag carries a countdown — `NO CONTACT · RETRY 14s` — so its
   * text changes every second. Rebuilding on every text change replaced the row
   * nodes once a second, which is wasteful, would drop focus out of the strip
   * if anyone were reading it, and broke measurement outright: the contrast
   * gate reads a box, hides that element, screenshots, and samples. A node
   * replaced in between is a node still painted when the screenshot is taken,
   * and the sampler then reads the text's own pixels as its backdrop and
   * reports 1.00:1 — a colour compared against itself. That is the second
   * distinct way this file has produced that number.
   *
   * So the STRUCTURE key is the ids and levels, which change only when the list
   * of conditions does. Text is written in place.
   */
  let alertShape = null;
  let alertRows = [];
  const drawEicas = () => {
    if (!eicasHost) return;
    const list = alerts() ?? [];
    eicasHost.setAttribute('aria-label', alertsSummary(list));
    eicasHost.hidden = list.length === 0;

    const shape = list.map((a) => `${a.id}:${a.level}`).join('|');
    if (shape !== alertShape) {
      alertShape = shape;
      alertRows = list.map((a) => {
        const code = el('span', { class: 'eicas-code' });
        // The detail span is omitted rather than emptied when there is none:
        // an empty element still takes the row's gap and still answers a
        // selector, which is how a contrast registry ends up measuring nothing.
        const detail = a.detail ? el('span', { class: 'eicas-detail' }) : null;
        const row = el('p', { class: 'eicas-msg', 'data-level': a.level }, detail ? [code, detail] : [code]);
        return { row, code, detail };
      });
      eicasHost.replaceChildren(...alertRows.map((r) => r.row));
    }

    for (let i = 0; i < list.length; i += 1) {
      const r = alertRows[i];
      if (!r) continue;
      if (r.code.textContent !== list[i].text) r.code.textContent = list[i].text;
      if (r.detail && r.detail.textContent !== list[i].detail) r.detail.textContent = list[i].detail;
    }

    /**
     * FOCUSABLE ONLY WHEN IT ACTUALLY SCROLLS (SC 2.1.1).
     *
     * The strip caps its height and scrolls past the cap, and a scrolling region
     * a keyboard cannot reach is content a keyboard cannot read — axe caught it
     * on the two short viewports, where three messages already overflow.
     *
     * BUT A PERMANENT `tabindex="0"` IS THE OPPOSITE MISTAKE, and this app has
     * made it once already: the value strip carried one while invisible, sending
     * a sighted keyboard user's focus to a box with nothing in it. So the
     * attribute tracks the real condition, measured after the rows are in the
     * DOM, and comes off the moment the content fits.
     */
    if (eicasHost.scrollHeight > eicasHost.clientHeight + 1) {
      eicasHost.setAttribute('tabindex', '0');
    } else {
      eicasHost.removeAttribute('tabindex');
    }
  };

  const drawSide = () => {
    if (!planSurface) return;
    planSurface.begin();
    const t = planSurface.tokens;
    const view = traffic() ?? {};
    if (!view.centre) return;
    drawPlan(planSurface.ctx, {
      readiness: view.readiness ?? null,
      x: 0,
      y: 0,
      w: planSurface.width,
      h: planSurface.height,
      tokens: t,
      centre: view.centre,
      aircraft: view.aircraft ?? [],
      rangeNm: view.rangeNm ?? 40,
      followedHex: view.followedHex ?? null,
      fromFix: view.fromFix ?? false,
      trail: view.trail ?? [],
      // The same runways the RADAR page draws, from the same source. Two
      // scopes showing one truth is the rule this file's own comment set.
      runways: view.runways ?? [],
      // PLAN or MAP, which way is up, and the wind. All decided in app.js from
      // the store; this panel only subscribes, which is the file's contract.
      mode: view.mode ?? 'plan',
      up: view.up ?? null,
      wind: view.wind ?? null,
    });
    if (planCanvas) {
      const n = (view.aircraft ?? []).length;
      /**
       * THE FLAG IS DRAWN ON A CANVAS, so it must be in the name as well.
       *
       * The state was added to the picture and not to the label, which is the
       * same defect as a value painted onto a canvas and never written as text
       * — a reader using the panel by voice would have had no way to tell a
       * quiet sky from a feed that is being refused.
       *
       * "No aircraft being heard" was also doing double duty for two different
       * facts, exactly as the RADAR page's sentence was: nothing in range, and
       * nothing answering. Those need different words.
       */
      const flag = view.readiness?.label && view.readiness.state !== 'contact' && view.readiness.state !== 'following'
        ? ` Feed state: ${view.readiness.label}.`
        : '';
      /**
       * WHICH MODE, AND WHICH WAY IS UP, IN THE NAME TOO.
       *
       * Track-up is a rotation of a picture, so a reader who cannot see the
       * picture gets NOTHING from it unless it is said — and the difference
       * between "everything on this display is measured from north" and "from
       * where you are going" is the whole meaning of every bearing on it. The
       * reason travels with it, because on a desk the answer is nearly always
       * north-up and the interesting part is why.
       */
      const upSaid = view.mode === 'map'
        ? ` Map mode, ${(view.up?.label ?? 'north up').toLowerCase()}${view.up?.reason ? ` — ${view.up.reason}` : ''}.`
        : ' Plan mode, north up, centred.';
      planCanvas.setAttribute(
        'aria-label',
        n
          ? `Navigation display:${upSaid} ${n} aircraft within ${view.rangeNm ?? 40} nautical miles.${flag} The list on the RADAR page has each one as text.`
          : `Navigation display:${upSaid} No aircraft within range.${flag}`,
      );
    }
  };

  return {
    /** Called on every publish while this page is the visible one. */
    render(snapshot) {
      draw(snapshot.fields);
      drawSide();
      drawEicas();
      updateReadouts(snapshot.fields);
      updateAlt(snapshot.fields, snapshot.t);
      announcer.watch('Attitude', snapshot.fields['attitude.pitch']);
      announcer.watch('Heading', snapshot.fields['attitude.heading']);
      announcer.watch('Groundspeed', snapshot.fields['position.groundspeed']);
      announcer.watch('GPS altitude', snapshot.fields['position.altitudeGeometric']);
    },
    resetPeakG() {
      peakG = null;
    },
  };
}

/** The surface hands out its 2D context; this keeps the call sites short
 *  without letting a gauge reach for a context it did not get from here. */
const ctxOf = (surface) => surface.ctx;
