/**
 * tape.js — the vertical moving tape used for groundspeed and altitude, and the
 * horizontal heading tape.
 *
 * ONE IMPLEMENTATION, THREE INSTRUMENTS. They differ in range, tick spacing and
 * the units in the box, and nothing else — so writing three of these would be
 * three places for the FAIL behaviour to drift apart.
 *
 * A tape whose field has FAILED shows a cross and an empty digit box. It does
 * NOT keep scrolling from its last value, which is the specific failure the
 * rendering rule names: never freeze a gauge at its last value with no
 * indication.
 */

import { failFlag, roundRect, staleBand, text } from '../canvas.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * MAY A SELECTED-VALUE BUG BE DRAWN AT ALL?
 *
 * Pure and exported because it is the honesty rule on these instruments and a
 * canvas is invisible to the accessibility gate — so this is the only place the
 * decision can be checked. A bug marks a target the crew set; drawing one for a
 * value nobody broadcast would put an invented intention on the instrument
 * whose whole job is to say where the aircraft is going.
 *
 * FAIL and a missing field draw nothing. STALE still draws, in the stale tone,
 * because a target from a minute ago is still the target — it is the aircraft's
 * position that went stale, not the crew's decision.
 */
export function showsSelected(field) {
  return !!field && field.provenance !== 'FAIL' && Number.isFinite(field.value);
}

/**
 * @param side  'left' | 'right' — which way the digit box points.
 * @param step  units between minor ticks
 * @param major every Nth tick is labelled
 * @param span  units visible from top to bottom of the tape
 */
export function drawVerticalTape(
  ctx,
  { x, y, w, h, tokens, field, label, unit, step = 10, major = 5, span = 100, side = 'left', format = (v) => String(Math.round(v)),
    /**
     * THE SELECTED VALUE — what the crew dialled in, not what the aircraft is
     * doing. A real PFD draws it twice: a bug on the tape at that value, and the
     * number boxed above the tape so it is readable when the bug is off-scale.
     *
     * A FIELD, NOT A NUMBER, so a FAIL or a STALE selection is handled like
     * every other value in this app rather than by the caller remembering to
     * check. Nothing is drawn unless it is genuinely known — a bug at a value
     * nobody broadcast would be an invented target on the one instrument whose
     * whole job is to say where you are going.
     */
    selected = null },
) {
  ctx.save();
  ctx.fillStyle = tokens.surface;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = tokens.hairline;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.stroke();

  const labelSize = Math.max(9, Math.min(13, w * 0.19));
  text(ctx, label, x + w / 2, y + labelSize, { size: labelSize, weight: 700, colour: tokens['text-3'] });

  if (!field || field.provenance === 'FAIL') {
    failFlag(ctx, {
      x: x + 2,
      y: y + labelSize * 1.8,
      w: w - 4,
      h: h - labelSize * 1.8 - 2,
      tokens,
      label: '✕',
      reason: null,
      size: Math.max(14, w * 0.3),
    });
    text(ctx, unit, x + w / 2, y + h - labelSize, { size: labelSize * 0.85, colour: tokens['text-3'] });
    ctx.restore();
    return;
  }

  const value = field.value;
  const cy = y + h / 2;
  const pxPerUnit = (h - labelSize * 3) / span;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + labelSize * 1.6, w - 2, h - labelSize * 2.8);
  ctx.clip();

  const first = Math.floor((value - span / 2) / step) * step;
  const last = Math.ceil((value + span / 2) / step) * step;
  const tickSize = Math.max(8, Math.min(12, w * 0.17));

  for (let v = first; v <= last; v += step) {
    const ty = cy - (v - value) * pxPerUnit;
    const isMajor = Math.round(v / step) % major === 0;
    ctx.strokeStyle = tokens['text-3'];
    ctx.lineWidth = isMajor ? 2 : 1;
    const len = isMajor ? w * 0.28 : w * 0.16;
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(x + w - 2, ty);
      ctx.lineTo(x + w - 2 - len, ty);
    } else {
      ctx.moveTo(x + 2, ty);
      ctx.lineTo(x + 2 + len, ty);
    }
    ctx.stroke();
    if (isMajor) {
      text(ctx, format(v), side === 'left' ? x + w - 4 - len : x + 4 + len, ty, {
        size: tickSize,
        colour: tokens['text-2'],
        align: side === 'left' ? 'right' : 'left',
      });
    }
  }

  /**
   * THE SELECTED-VALUE BUG, drawn inside the same clip as the ticks so it slides
   * off the ends of the tape instead of floating over the heading.
   *
   * A HOLLOW BRACKET, not a filled shape. The digit box at the centre is filled
   * and the track bug on the heading tape is a filled diamond; a third filled
   * mark would be a shape argument nobody can win. An outline reads as "where
   * this is going", which is what a target is.
   */
  if (showsSelected(selected)) {
    const sy = cy - (selected.value - value) * pxPerUnit;
    const s = Math.max(5, w * 0.13);
    ctx.strokeStyle = selected.provenance === 'STALE' ? tokens.stale : tokens.primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(x + w - 2, sy - s);
      ctx.lineTo(x + w - 2 - s, sy - s);
      ctx.lineTo(x + w - 2 - s, sy + s);
      ctx.lineTo(x + w - 2, sy + s);
    } else {
      ctx.moveTo(x + 2, sy - s);
      ctx.lineTo(x + 2 + s, sy - s);
      ctx.lineTo(x + 2 + s, sy + s);
      ctx.lineTo(x + 2, sy + s);
    }
    ctx.stroke();
  }
  ctx.restore();

  /**
   * AND THE SELECTED VALUE AS A NUMBER, above the tape.
   *
   * The bug alone is useless the moment the target is further away than half the
   * tape's span — which on the altitude tape is 600 ft, so a climb to a cleared
   * level is off-scale for most of it. A real PFD boxes the number for exactly
   * that reason, and it is the part a crew reads.
   */
  if (showsSelected(selected)) {
    const size = Math.max(10, Math.min(15, w * 0.22));
    text(ctx, format(selected.value), x + w / 2, y + labelSize + size * 1.1, {
      size,
      weight: 700,
      colour: selected.provenance === 'STALE' ? tokens.stale : tokens.primary,
    });
  }

  // The digit box: the current value, always at the centre line, which is what
  // makes a tape readable at a glance.
  const boxH = Math.max(22, h * 0.11);
  const boxW = w - 4;
  const bx = x + 2;
  const by = cy - boxH / 2;
  ctx.fillStyle = tokens.page;
  roundRect(ctx, bx, by, boxW, boxH, 4);
  ctx.fill();
  ctx.strokeStyle = field.provenance === 'STALE' ? tokens.stale : tokens.rail;
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, boxW, boxH, 4);
  ctx.stroke();
  text(ctx, format(value), x + w / 2, cy, {
    size: Math.max(13, Math.min(20, boxW * 0.28)),
    weight: 700,
    colour: field.provenance === 'STALE' ? tokens.stale : tokens.text,
  });

  if (field.provenance === 'STALE') {
    staleBand(ctx, { x: x + 2, y: y + h - labelSize * 2.4, w: w - 4, h: labelSize * 1.6, tokens, ageText: field.ageText });
  } else {
    text(ctx, unit, x + w / 2, y + h - labelSize, { size: labelSize * 0.85, colour: tokens['text-3'] });
  }
  ctx.restore();
}

/**
 * The heading tape along the bottom of the PFD.
 *
 * `label` NAMES WHAT IS ON THE TAPE, exactly as the altitude tape's heading
 * does, because two genuinely different directions can end up here:
 *
 *   HDG  magnetic heading — where the nose is pointing
 *   TRK  ground track — where the aircraft is actually going
 *
 * They differ by the drift angle, which at altitude is routinely ten degrees or
 * more. Following a flight makes this concrete: most aircraft broadcast a track
 * and no heading at all, so the tape shows the track — and it must say TRK
 * rather than silently presenting one as the other.
 */
export function drawHeadingTape(ctx, { x, y, w, h, tokens, heading, track, label = 'HDG', spanDeg = 90,
  /** What the crew dialled in. Same contract as the vertical tape's — a field,
   *  so an absent or stale selection needs no special case at the call site. */
  selected = null }) {
  ctx.save();
  ctx.fillStyle = tokens.surface;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = tokens.hairline;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.lineWidth = 1;
  ctx.stroke();

  if (!heading || heading.provenance === 'FAIL') {
    failFlag(ctx, {
      x: x + 2,
      y: y + 2,
      w: w - 4,
      h: h - 4,
      tokens,
      label: `${label} FAIL`,
      reason: heading?.reason ?? null,
      size: Math.max(11, h * 0.22),
    });
    ctx.restore();
    return;
  }

  const cx = x + w / 2;
  const pxPerDeg = w / spanDeg;
  const value = heading.value;
  const size = Math.max(9, Math.min(13, h * 0.26));

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();

  const first = Math.floor((value - spanDeg / 2) / 5) * 5;
  const last = Math.ceil((value + spanDeg / 2) / 5) * 5;
  for (let d = first; d <= last; d += 5) {
    const tx = cx + (d - value) * pxPerDeg;
    const isMajor = ((d % 360) + 360) % 360 % 10 === 0;
    ctx.strokeStyle = tokens['text-3'];
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(tx, y + h * 0.55);
    ctx.lineTo(tx, y + h * (isMajor ? 0.78 : 0.7));
    ctx.stroke();
    if (isMajor) {
      const norm = (((d % 360) + 360) % 360) / 10;
      const cardinal = { 0: 'N', 9: 'E', 18: 'S', 27: 'W' }[norm];
      text(ctx, cardinal ?? String(norm).padStart(2, '0'), tx, y + h * 0.32, {
        size,
        weight: cardinal ? 700 : 500,
        colour: cardinal ? tokens.text : tokens['text-2'],
      });
    }
  }

  // Track bug. Drawn as a DIAMOND and labelled TRK, so it is never mistaken for
  // the heading index by shape alone.
  //
  // Suppressed when the TAPE ITSELF is the track: a bug marking the same
  // quantity the tape is showing would sit permanently under the lubber line
  // and imply a drift angle of zero, which is a reading we do not have.
  if (label !== 'TRK' && track && track.provenance !== 'FAIL') {
    let delta = ((track.value - value + 540) % 360) - 180;
    const tx = clamp(cx + delta * pxPerDeg, x + 6, x + w - 6);
    ctx.fillStyle = track.provenance === 'STALE' ? tokens.stale : tokens.primary;
    const s = h * 0.16;
    ctx.beginPath();
    ctx.moveTo(tx, y + h * 0.55 - s);
    ctx.lineTo(tx + s, y + h * 0.55);
    ctx.lineTo(tx, y + h * 0.55 + s);
    ctx.lineTo(tx - s, y + h * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * THE SELECTED-HEADING BUG, and it is a DIFFERENT SHAPE from the track bug on
   * purpose.
   *
   * Track is a filled diamond a few lines above. Two marks on one scale that
   * mean different things must be distinguishable by shape alone — a reader who
   * cannot separate colours still has to be able to tell "where I am going" from
   * "where I was told to go". This is the hollow bracket the vertical tape uses
   * for the same quantity, so the two tapes agree with each other.
   *
   * It is CLAMPED to the ends like the track bug: a target ninety degrees away
   * is off the visible arc, and a bug that vanished would read as no target at
   * all rather than as one you have to turn a long way for.
   */
  if (showsSelected(selected)) {
    const delta = ((selected.value - value + 540) % 360) - 180;
    const sx = clamp(cx + delta * pxPerDeg, x + 8, x + w - 8);
    ctx.strokeStyle = selected.provenance === 'STALE' ? tokens.stale : tokens.primary;
    ctx.lineWidth = 2;
    const s = h * 0.15;
    ctx.beginPath();
    ctx.moveTo(sx - s, y + h * 0.55 + s);
    ctx.lineTo(sx - s, y + h * 0.55 - s);
    ctx.lineTo(sx + s, y + h * 0.55 - s);
    ctx.lineTo(sx + s, y + h * 0.55 + s);
    ctx.stroke();
  }
  ctx.restore();

  // The lubber line and the digital heading.
  const boxW = Math.max(46, w * 0.1);
  const boxH = h * 0.5;
  ctx.fillStyle = tokens.page;
  roundRect(ctx, cx - boxW / 2, y + h - boxH - 2, boxW, boxH, 4);
  ctx.fill();
  ctx.strokeStyle = heading.provenance === 'STALE' ? tokens.stale : tokens.rail;
  ctx.lineWidth = 2;
  roundRect(ctx, cx - boxW / 2, y + h - boxH - 2, boxW, boxH, 4);
  ctx.stroke();
  text(ctx, `${String(Math.round(value) % 360).padStart(3, '0')}`, cx, y + h - boxH / 2 - 2, {
    size: Math.max(12, boxH * 0.55),
    weight: 700,
    colour: heading.provenance === 'STALE' ? tokens.stale : tokens.text,
  });
  // WHICH direction this is. Beside the digits, always, never inferred from
  // context — the whole point of the ladder is that the reader is told.
  text(ctx, label, cx - boxW / 2 - 4, y + h - boxH / 2 - 2, {
    size: Math.max(9, boxH * 0.34),
    weight: 700,
    align: 'right',
    colour: tokens['text-3'],
  });
  ctx.restore();
}
