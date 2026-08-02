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
import { drawAdi } from '../render/gauges/adi.js';
import { drawGMeter, drawVsi } from '../render/gauges/vsi.js';
import { drawHeadingTape, drawVerticalTape } from '../render/gauges/tape.js';
import { createReadout, describeField } from '../render/dom.js';

const withAge = (field) => (field ? { ...field, ageText: formatAge(field.ageMs) } : field);

export function createPfd({ canvas, surface, readoutHost, announcer, mountOffset = () => null }) {
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
  readoutHost.replaceChildren(...Object.values(readouts).map((r) => r.root));

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

    drawVerticalTape(ctxOf(surface), {
      x: pad,
      y: pad,
      w: tapeW,
      h: bodyH - pad,
      tokens: t,
      field: withAge(fields['position.groundspeed']),
      label: 'GS',
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
    const [altLabel, altField] = ladder.find(([, f]) => f && f.provenance !== 'FAIL') ?? ladder[ladder.length - 1];
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
      describeField('Groundspeed', fields['position.groundspeed'], { unit: 'knots', format: (v) => String(Math.round(v)) }),
      describeField('GPS altitude', fields['position.altitudeGeometric'], { unit: 'feet', format: (v) => String(Math.round(v)) }),
      describeField('Vertical speed', fields['vsi.rate'], { unit: 'feet per minute', format: (v) => String(Math.round(v)) }),
      describeField('Load factor', fields['motion.gLoad'], { unit: 'g', format: (v) => v.toFixed(2) }),
    ];
    canvas.setAttribute('aria-label', `Primary flight display. ${parts.join('. ')}.`);
  };

  return {
    /** Called on every publish while this page is the visible one. */
    render(snapshot) {
      draw(snapshot.fields);
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
