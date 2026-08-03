/**
 * vsi.js — vertical speed indicator, and the G-meter.
 *
 * Both are small arc/scale gauges with the same FAIL discipline as everything
 * else: a needle that cannot be placed is not drawn, and a cross takes its
 * place. A VSI needle resting at zero is a claim of level flight.
 */

import { failFlag, roundRect, text } from '../canvas.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Vertical speed, on a non-linear scale.
 *
 * Real VSIs compress the outer half because the difference between 500 and 700
 * fpm matters and the difference between 3000 and 3200 does not. The square
 * root does that smoothly, and smoothly matters: any hard boundary in a spatial
 * mapping prints its own geometry onto the needle's travel.
 */
/**
 * Full scale, in feet per minute.
 *
 * SIX THOUSAND, which is what a transport-category EFIS shows, not the two
 * thousand a light aircraft needs. An airliner's initial climb beats 2000 fpm
 * and a descent can pass 3000, so the needle pegged for the most interesting
 * part of the flight — the part where somebody is actually watching it. The
 * square-root scale below keeps the light-aircraft range readable anyway: a
 * 500 fpm climb still sits nearly a third of the way up.
 */
export const VSI_FULL_SCALE_FPM = 6000;

/** The marks a pilot actually flies to, across both regimes. */
const VSI_MARKS = [-6000, -4000, -2000, -1000, -500, 0, 500, 1000, 2000, 4000, 6000];

export function drawVsi(ctx, { x, y, w, h, tokens, field, maxFpm = VSI_FULL_SCALE_FPM }) {
  ctx.save();
  ctx.fillStyle = tokens.surface;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = tokens.hairline;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.stroke();

  const labelSize = Math.max(9, Math.min(12, w * 0.22));
  text(ctx, 'VS', x + w / 2, y + labelSize, { size: labelSize, weight: 700, colour: tokens['text-3'] });

  const top = y + labelSize * 1.9;
  const bottom = y + h - labelSize * 1.4;
  const cy = (top + bottom) / 2;
  const half = (bottom - top) / 2;
  const scale = (fpm) => {
    const t = clamp(fpm / maxFpm, -1, 1);
    return cy - Math.sign(t) * Math.sqrt(Math.abs(t)) * half;
  };

  ctx.strokeStyle = tokens['text-3'];
  for (const fpm of VSI_MARKS) {
    const ty = scale(fpm);
    // Labelled at the thousands. Compressed at the top of the scale, the
    // intermediate marks would collide with each other.
    const major = fpm % 2000 === 0 || Math.abs(fpm) === 1000;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, ty);
    ctx.lineTo(x + w * (major ? 0.78 : 0.68), ty);
    ctx.stroke();
    if (major && fpm !== 0) {
      text(ctx, String(Math.abs(fpm / 1000)), x + w * 0.3, ty, { size: labelSize * 0.9, colour: tokens['text-2'] });
    }
  }
  ctx.strokeStyle = tokens.rail;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, top);
  ctx.lineTo(x + w * 0.5, bottom);
  ctx.stroke();

  if (!field || field.provenance === 'FAIL') {
    failFlag(ctx, { x: x + 2, y: top, w: w - 4, h: bottom - top, tokens, label: '✕', reason: null, size: Math.max(12, w * 0.28) });
    ctx.restore();
    return;
  }

  const ty = scale(field.value);
  const colour = field.provenance === 'STALE' ? tokens.stale : tokens.primary;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2.5, w * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, cy);
  ctx.lineTo(x + w * 0.82, ty);
  ctx.stroke();

  text(ctx, `${field.value >= 0 ? '+' : '−'}${Math.abs(Math.round(field.value / 10) * 10)}`, x + w / 2, y + h - labelSize * 0.6, {
    size: labelSize,
    weight: 700,
    colour,
  });
  ctx.restore();
}

/** G-meter. A load-factor arc with a peak-hold marker. */
export function drawGMeter(ctx, { x, y, w, h, tokens, field, peak }) {
  const cx = x + w / 2;
  const cy = y + h * 0.78;
  const r = Math.min(w / 2, h * 0.7) * 0.92;

  ctx.save();
  ctx.fillStyle = tokens.surface;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = tokens.hairline;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.stroke();

  // "LOAD G", not "G", and not in the dimmest token available.
  //
  // Noah, looking at this gauge on his own panel: "What is the white gauge in
  // the upper left?" A single letter at the smallest size the palette has, in
  // `text-3`, is a label only to somebody who already knows what it says. An
  // instrument nobody can name is not an instrument, it is decoration — and the
  // reader this app is built for is explicitly NOT a pilot.
  const labelSize = Math.max(10, Math.min(13, w * 0.15));
  text(ctx, 'LOAD G', x + w / 2, y + labelSize, { size: labelSize, weight: 700, colour: tokens['text-2'] });

  // -1 g to +4 g across a half circle.
  const lo = -1;
  const hi = 4;
  const angle = (g) => Math.PI + ((clamp(g, lo, hi) - lo) / (hi - lo)) * Math.PI;

  ctx.strokeStyle = tokens['text-3'];
  ctx.lineWidth = 1.5;
  for (let g = lo; g <= hi; g += 1) {
    const a = angle(g);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  ctx.strokeStyle = tokens.rail;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, Math.PI, Math.PI * 2);
  ctx.stroke();

  if (!field || field.provenance === 'FAIL') {
    ctx.strokeStyle = tokens.fail;
    ctx.lineWidth = 2.5;
    const s = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s * 1.2);
    ctx.lineTo(cx + s, cy - s * 0.2);
    ctx.moveTo(cx + s, cy - s * 1.2);
    ctx.lineTo(cx - s, cy - s * 0.2);
    ctx.stroke();
    text(ctx, '✕ FAIL', cx, y + h - labelSize * 0.8, { size: labelSize, weight: 700, colour: tokens.fail });
    ctx.restore();
    return;
  }

  // Peak-hold: a thin marker at the highest load seen since power-up. Drawn
  // BEFORE the needle so the needle is never hidden by it.
  if (Number.isFinite(peak)) {
    const a = angle(peak);
    ctx.strokeStyle = tokens.stale;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }

  const a = angle(field.value);
  const colour = field.provenance === 'STALE' ? tokens.stale : tokens.text;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2.5, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
  ctx.stroke();

  text(ctx, `${field.value.toFixed(2)}`, cx, y + h - labelSize * 0.8, { size: labelSize * 1.15, weight: 700, colour });
  ctx.restore();
}
