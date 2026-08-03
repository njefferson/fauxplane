/**
 * adi.js — the attitude director indicator: artificial horizon, pitch ladder,
 * roll scale, slip/skid ball and turn-rate needle.
 *
 * NON-HUE CHANNELS, declared before the code (Doctrine §4). The sky/ground
 * split must say WHICH WAY IS UP in a grayscale render and to a colour-blind
 * reader, so it does not lean on blue-versus-brown:
 *
 *   1. Luminance. Sky and ground are 9.8 apart in grayscale ΔE — four times the
 *      2.3 JND the family treats as the floor for "these read as different".
 *   2. The pitch ladder is SOLID above the horizon and DASHED below it, which
 *      is the real instrument convention and carries the whole meaning alone.
 *   3. Every ladder rung is labelled with its signed pitch angle.
 *
 * Any one of the three is sufficient. That redundancy is the point: a horizon
 * that only works in colour is an instrument that fails in exactly the
 * conditions people fit instruments for.
 */

import { ellipsise, failFlag, roundRect, text, wrapText } from '../canvas.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function drawAdi(ctx, { x, y, w, h, tokens, attitude, slip, turnRate, mount = null }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;

  ctx.save();
  roundRect(ctx, x, y, w, h, Math.min(12, r * 0.1));
  ctx.clip();

  const hasPitch = attitude && Number.isFinite(attitude.pitch);
  const hasRoll = attitude && Number.isFinite(attitude.roll);

  if (!attitude || !hasRoll) {
    // The ball is not frozen at its last attitude, and it is not blanked to a
    // level horizon either — a level horizon is a reading, and we do not have
    // one. It is crossed out and it says why.
    failFlag(ctx, { x, y, w, h, tokens, label: 'ATT FAIL', reason: attitude?.reason ?? 'no attitude', size: Math.max(11, r * 0.09) });
    ctx.restore();
    drawFixedSymbol(ctx, { cx, cy, r, tokens });
    drawSlipSkid(ctx, { cx, cy: y + h - r * 0.16, r, tokens, slip });
    drawTurnRate(ctx, { cx, cy: y + h - r * 0.16, r, tokens, turnRate });
    return;
  }

  const pitch = hasPitch ? attitude.pitch : null;
  const roll = attitude.roll;
  /** Pixels per degree of pitch. Ten degrees across a quarter of the box is the
   *  proportion a real ADI uses; anything tighter turns the ladder into noise. */
  const pxPerDeg = r * 0.05;

  // BANK WITHOUT PITCH — AND THIS IS A KNOWING DEPARTURE FROM THE CONVENTION.
  //
  // CHECKED, and the certified answer is the opposite of this: when a real
  // EFIS loses attitude it clears the ENTIRE artificial horizon and shows an
  // ATT flag. Neither axis is presented separately. There is no transport
  // aircraft that draws bank without pitch.
  //
  // The reason that convention exists is that a partial ball invites the pilot
  // to read it as a whole one — and that hazard is real. The reason it does not
  // decide OUR case is that our case does not arise in an aeroplane: a certified
  // AHRS gives both angles or neither, so "we have a measured bank and no pitch
  // source at all" is not a failure mode the standard was written against. It
  // is what an ADS-B broadcast is: bank is recoverable from the rate of turn,
  // and pitch is simply not transmitted.
  //
  // So the departure is deliberate and it is guarded against the hazard the
  // convention is protecting: the sky/ground split and the pitch ladder are
  // BOTH removed, because both of them state where the horizon is and that is
  // exactly what is unknown. What is left cannot be mistaken for a horizon —
  // there is no horizon on it. The middle says NO PITCH in the failure colour
  // and names the reason.
  //
  // Recorded in NOTES.md as a departure rather than left looking conventional.
  if (!hasPitch) {
    ctx.fillStyle = tokens.page;
    ctx.fillRect(x, y, w, h);
    drawRollScale(ctx, { cx, cy, r, tokens, roll });
    ctx.restore();
    drawFixedSymbol(ctx, { cx, cy, r, tokens });

    const size = Math.max(11, r * 0.1);
    const why = attitude.pitchReason ?? attitude.reason ?? 'pitch unavailable';
    ctx.save();
    text(ctx, 'NO PITCH', cx, cy - r * 0.42, { size, weight: 700, colour: tokens.fail });
    text(ctx, ellipsise(ctx, why, w - 12, { size: size * 0.78 }), cx, cy - r * 0.42 + size * 1.25, {
      size: size * 0.78,
      colour: tokens.fail,
    });
    text(ctx, `BANK ${roll >= 0 ? 'R' : 'L'} ${Math.abs(roll).toFixed(0)}°`, cx, cy + r * 0.42, {
      size: size * 1.1,
      weight: 700,
      colour: tokens.primary,
    });
    ctx.restore();

    drawSlipSkid(ctx, { cx, cy: y + h - r * 0.16, r, tokens, slip });
    drawTurnRate(ctx, { cx, cy: y + h - r * 0.16, r, tokens, turnRate });
    return;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-roll * Math.PI) / 180);
  ctx.translate(0, pitch * pxPerDeg);

  // Sky and ground, drawn large enough that no rotation can expose a corner.
  const span = r * 4;
  ctx.fillStyle = tokens.sky;
  ctx.fillRect(-span, -span, span * 2, span);
  ctx.fillStyle = tokens.ground;
  ctx.fillRect(-span, 0, span * 2, span);

  // The horizon: a thick light line, which is a third non-hue cue and the one
  // the eye actually tracks.
  ctx.strokeStyle = tokens.text;
  ctx.lineWidth = Math.max(2, r * 0.014);
  ctx.beginPath();
  ctx.moveTo(-span, 0);
  ctx.lineTo(span, 0);
  ctx.stroke();

  // Pitch ladder. Solid above, dashed below — the convention that carries the
  // up/down meaning without colour.
  const labelSize = Math.max(9, r * 0.075);
  for (let deg = -30; deg <= 30; deg += 5) {
    if (deg === 0) continue;
    const major = deg % 10 === 0;
    const halfWidth = major ? r * 0.28 : r * 0.15;
    const yy = -deg * pxPerDeg;

    ctx.save();
    ctx.strokeStyle = tokens.text;
    ctx.lineWidth = Math.max(1.5, r * 0.009);
    ctx.setLineDash(deg < 0 ? [r * 0.05, r * 0.035] : []);
    ctx.beginPath();
    ctx.moveTo(-halfWidth, yy);
    ctx.lineTo(halfWidth, yy);
    ctx.stroke();
    ctx.restore();

    if (major) {
      const s = String(Math.abs(deg));
      text(ctx, s, -halfWidth - labelSize * 0.7, yy, { size: labelSize, colour: tokens.text, align: 'right' });
      text(ctx, s, halfWidth + labelSize * 0.7, yy, { size: labelSize, colour: tokens.text, align: 'left' });
    }
  }
  ctx.restore();

  drawRollScale(ctx, { cx, cy, r, tokens, roll });

  ctx.restore();
  drawFixedSymbol(ctx, { cx, cy, r, tokens });

  // A USABLE ATTITUDE THAT STILL HAS SOMETHING TO SAY.
  //
  // Most often: this is the gravity reference alone, which is exact while the
  // device is still and disturbed by acceleration while it is not. That is a
  // real caveat and it belongs on the instrument, not only on BITE — but it is
  // emphatically NOT a failure, and crossing the horizon out over it is how a
  // panel that knew its own attitude to a fraction of a degree spent thirteen
  // minutes showing a red X.
  //
  // AMBER, NOT CYAN, AND THAT IS THE CONVENTION RATHER THAN A PREFERENCE. The
  // flight-deck colour standard reserves RED for a condition needing immediate
  // action and AMBER for one the crew should be AWARE of. A displayed parameter
  // that is usable but degraded is the amber case exactly — it is the same
  // channel a real PFD uses for CHECK ATT, which is an amber annunciation over
  // a horizon that is still being drawn. Cyan was the DERIVED provenance tone
  // and said nothing about severity.
  //
  // Backed with a plate in the page colour so the text renders against the
  // measured token pair rather than against whatever the sky happens to be.
  if (attitude.reason && attitude.provenance !== 'STALE') {
    const size = Math.max(9, r * 0.075);
    const ty = y + h - r * 0.46;
    ctx.save();
    // WRAPPED, NOT TRUNCATED. This ellipsised a single line, so on a tablet the
    // caption read "gravity reference only — gyro settling (…" — severed inside
    // the parenthesis, throwing away the one number the sentence existed to
    // deliver, and looking like a crash while the panel worked correctly.
    const lines = wrapText(ctx, attitude.reason, w - 16, { size, weight: 700, maxLines: 2 });
    if (lines.length) {
      ctx.font = `700 ${size}px ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace`;
      const tw = Math.min(w - 10, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size);
      const th = size * (0.85 + 1.15 * lines.length);
      const top = ty - size * 0.85 - (lines.length - 1) * size * 0.575;
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = tokens.page;
      roundRect(ctx, cx - tw / 2, top, tw, th, size * 0.4);
      ctx.fill();
      ctx.globalAlpha = 1;
      lines.forEach((line, i) => {
        text(ctx, line, cx, top + size * 0.85 + i * size * 1.15, { size, weight: 700, colour: tokens.stale });
      });
    }
    ctx.restore();
  }

  drawSlipSkid(ctx, { cx, cy: y + h - r * 0.16, r, tokens, slip });
  drawTurnRate(ctx, { cx, cy: y + h - r * 0.16, r, tokens, turnRate });
  drawMountTag(ctx, { x, y, w, tokens, mount, r });

  if (attitude.provenance === 'STALE') {
    ctx.save();
    ctx.strokeStyle = tokens.stale;
    ctx.lineWidth = 3;
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 10);
    ctx.stroke();
    text(ctx, `STALE ${attitude.ageText ?? ''}`, cx, y + 16, { size: 13, weight: 700, colour: tokens.stale });
    ctx.restore();
  }
}

/**
 * The levelling tag. Present only when a mount offset is in force, and it says
 * the number so it can be sanity-checked against the cradle you can see.
 *
 * Drawn in the DERIVED tone rather than the caution amber: a levelled horizon
 * is not degraded, and it is not a condition to be aware of in the sense the
 * colour standard reserves amber for. It is a declared reference, like an
 * altimeter setting — which is why it shows its VALUE rather than a warning.
 */
function drawMountTag(ctx, { x, y, w, tokens, mount, r }) {
  if (!mount) return;
  const size = Math.max(8, r * 0.062);
  const label = `LVL ${mount.pitchDeg >= 0 ? '+' : '−'}${Math.abs(mount.pitchDeg).toFixed(0)}\u00b0 ${
    mount.rollDeg >= 0 ? '+' : '−'
  }${Math.abs(mount.rollDeg).toFixed(0)}\u00b0`;
  ctx.save();
  ctx.font = `700 ${size}px ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace`;
  const tw = ctx.measureText(label).width + size;
  const tx = x + w - tw - size * 0.5;
  const ty = y + size * 1.4;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = tokens.page;
  roundRect(ctx, tx, ty - size * 0.9, tw, size * 1.8, size * 0.4);
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, label, tx + tw / 2, ty, { size, weight: 700, colour: tokens.derived });
  ctx.restore();
}

/**
 * The roll scale and its pointer, fixed to the case.
 *
 * Pulled out of the main draw because it is the one part of the ball that is
 * still truthful when pitch is missing — and a copy of it in the partial path
 * would be two roll scales to keep in agreement.
 */
function drawRollScale(ctx, { cx, cy, r, tokens, roll }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = tokens.text;
  ctx.lineWidth = Math.max(1.5, r * 0.01);
  for (const deg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = ((deg - 90) * Math.PI) / 180;
    const inner = r * (deg % 30 === 0 ? 0.8 : 0.85);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
    ctx.stroke();
  }

  // Roll pointer — a triangle riding the scale at the current bank.
  const pa = ((-roll - 90) * Math.PI) / 180;
  const pr = r * 0.78;
  ctx.fillStyle = tokens.symbol;
  ctx.beginPath();
  ctx.moveTo(Math.cos(pa) * pr, Math.sin(pa) * pr);
  ctx.lineTo(Math.cos(pa + 0.05) * pr * 0.9, Math.sin(pa + 0.05) * pr * 0.9);
  ctx.lineTo(Math.cos(pa - 0.05) * pr * 0.9, Math.sin(pa - 0.05) * pr * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The fixed aircraft reference. Amber clears 3:1 against both sky and ground
 *  on its own; the dark outline is the instrument convention rather than the
 *  thing carrying the contrast. */
function drawFixedSymbol(ctx, { cx, cy, r, tokens }) {
  const wing = r * 0.42;
  const stub = r * 0.12;
  ctx.save();
  ctx.lineCap = 'butt';
  for (const [colour, lw] of [
    [tokens['symbol-outline'], Math.max(6, r * 0.045)],
    [tokens.symbol, Math.max(3, r * 0.026)],
  ]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(cx - wing, cy);
    ctx.lineTo(cx - stub, cy);
    ctx.lineTo(cx - stub, cy + stub * 0.8);
    ctx.moveTo(cx + wing, cy);
    ctx.lineTo(cx + stub, cy);
    ctx.lineTo(cx + stub, cy + stub * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, r * 0.018), 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }
  ctx.restore();
}

/** Slip/skid ball. Lateral acceleration over g, one ball-width per 0.1 g. */
function drawSlipSkid(ctx, { cx, cy, r, tokens, slip }) {
  const w = r * 0.44;
  const h = r * 0.1;
  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.save();
  ctx.fillStyle = tokens.page;
  ctx.globalAlpha = 0.75;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = tokens.rail;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.stroke();

  // The two cage marks a pilot centres the ball between.
  ctx.beginPath();
  ctx.moveTo(cx - h * 0.55, y + 1);
  ctx.lineTo(cx - h * 0.55, y + h - 1);
  ctx.moveTo(cx + h * 0.55, y + 1);
  ctx.lineTo(cx + h * 0.55, y + h - 1);
  ctx.stroke();

  if (!slip || slip.provenance === 'FAIL') {
    // No ball drawn, and a cross where it would be. An absent ball centred in
    // the cage is indistinguishable from coordinated flight.
    ctx.strokeStyle = tokens.fail;
    ctx.lineWidth = 2;
    const s = h * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s);
    ctx.lineTo(cx + s, cy + s);
    ctx.moveTo(cx + s, cy - s);
    ctx.lineTo(cx - s, cy + s);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const offset = clamp(slip.value / 0.2, -1, 1) * (w / 2 - h * 0.6);
  ctx.beginPath();
  ctx.arc(cx + offset, cy, h * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = slip.provenance === 'STALE' ? tokens.stale : tokens.text;
  ctx.fill();
  ctx.restore();
}

/** Turn-rate needle. Standard rate is 3 degrees per second. */
function drawTurnRate(ctx, { cx, cy, r, tokens, turnRate }) {
  const w = r * 0.9;
  const y = cy - r * 0.14;
  ctx.save();
  ctx.strokeStyle = tokens.rail;
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    const x = cx + side * (w / 2) * 0.66;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.03);
    ctx.lineTo(x, y + r * 0.03);
    ctx.stroke();
  }

  if (!turnRate || turnRate.provenance === 'FAIL') {
    text(ctx, 'TURN ✕', cx, y, { size: Math.max(9, r * 0.07), weight: 700, colour: tokens.fail });
    ctx.restore();
    return;
  }
  // Full scale is twice a standard-rate turn, so a standard rate lands exactly
  // on the mark — which is the whole reason the marks are there.
  const t = clamp(turnRate.value / 6, -1, 1);
  const x = cx + t * (w / 2) * 0.66;
  ctx.fillStyle = turnRate.provenance === 'STALE' ? tokens.stale : tokens.primary;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.035);
  ctx.lineTo(x + r * 0.03, y);
  ctx.lineTo(x, y + r * 0.035);
  ctx.lineTo(x - r * 0.03, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
