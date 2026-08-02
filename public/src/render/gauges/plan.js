/**
 * plan.js — the radar plan view: aircraft around a centre, drawn head-up north.
 *
 * NON-HUE CHANNELS, declared before the code (Doctrine §4). Aircraft differ
 * from one another and from the furniture without relying on colour:
 *
 *   1. SHAPE. Each aircraft is a triangle POINTED ALONG ITS TRACK, so heading
 *      is carried by geometry. The centre is a cross; range rings are circles.
 *   2. SIZE AND FILL. The followed aircraft is drawn larger and filled solid,
 *      with a ring around it; everything else is outlined.
 *   3. TEXT. Every aircraft is labelled with its callsign and flight level, so
 *      no aircraft is identified by colour alone.
 *
 * NORTH IS UP AND SAYS SO. A track-up plan view would need a heading this panel
 * may not have, and silently switching between the two is how a display becomes
 * untrustworthy. The compass rose is fixed and labelled.
 */

import { roundRect, text } from '../canvas.js';

/** Screen position for a lat/lon, given the centre and the scale. */
export function project({ lat, lon }, { centre, pxPerNm, cx, cy }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Equirectangular about the centre. Over a plan view of tens of nautical
  // miles the error against a proper projection is far below one pixel, and it
  // keeps the maths legible; longitude still has to shrink with latitude or
  // everything east-west is stretched by a quarter at this latitude.
  const dNorthNm = (lat - centre.lat) * 60;
  const dEastNm = (lon - centre.lon) * 60 * Math.cos((centre.lat * Math.PI) / 180);
  return { x: cx + dEastNm * pxPerNm, y: cy - dNorthNm * pxPerNm };
}

/** Flight level or altitude, in the compact form a plan view wants. */
export function altLabel(a) {
  if (a.onGround) return 'GND';
  const ft = a.altBaroFt ?? a.altGeomFt;
  if (ft === null || ft === undefined) return '';
  return ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft / 100) * 100}`;
}

export function drawPlan(ctx, { x, y, w, h, tokens, centre, aircraft, rangeNm, followedHex, fromFix }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2 - 4;
  const pxPerNm = r / rangeNm;

  ctx.save();
  ctx.fillStyle = tokens.surface;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = tokens.hairline;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 8);
  ctx.clip();

  // --- range rings ---------------------------------------------------------
  const ringLabel = Math.max(9, Math.min(12, r * 0.07));
  ctx.strokeStyle = tokens.rail;
  ctx.lineWidth = 1;
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * frac, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, `${Math.round(rangeNm * frac)}`, cx + 3, cy - r * frac + ringLabel * 0.7, {
      size: ringLabel,
      colour: tokens['text-3'],
      align: 'left',
    });
  }

  // --- compass rose, fixed: NORTH IS UP ------------------------------------
  for (const [deg, label] of [
    [0, 'N'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W'],
  ]) {
    const a = ((deg - 90) * Math.PI) / 180;
    text(ctx, label, cx + Math.cos(a) * (r - ringLabel), cy + Math.sin(a) * (r - ringLabel), {
      size: ringLabel * 1.1,
      weight: 700,
      colour: tokens['text-2'],
    });
  }

  // --- the centre ----------------------------------------------------------
  ctx.strokeStyle = tokens.symbol;
  ctx.lineWidth = 2;
  const s = Math.max(5, r * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx - s, cy);
  ctx.lineTo(cx + s, cy);
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx, cy + s);
  ctx.stroke();
  text(ctx, fromFix ? 'YOU' : 'HOME', cx, cy + s * 2.6, { size: ringLabel * 0.9, weight: 700, colour: tokens['text-3'] });

  // --- the aircraft --------------------------------------------------------
  const labelSize = Math.max(8, Math.min(12, r * 0.062));
  for (const a of aircraft ?? []) {
    const p = project(a, { centre, pxPerNm, cx, cy });
    if (!p) continue;
    // Outside the drawn circle it would sit in a corner and read as being at a
    // bearing it is not. Range is the display's contract; respect it.
    if (Math.hypot(p.x - cx, p.y - cy) > r) continue;

    const isFollowed = followedHex && a.hex === followedHex;
    const size = isFollowed ? Math.max(7, r * 0.042) : Math.max(5, r * 0.028);
    const track = Number.isFinite(a.trackDeg) ? a.trackDeg : null;

    ctx.save();
    ctx.translate(p.x, p.y);
    if (track !== null) ctx.rotate((track * Math.PI) / 180);

    ctx.beginPath();
    if (track === null) {
      // No track broadcast: a circle, which cannot imply a direction it does
      // not have. A triangle pointing at a default would be an invented value.
      ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
    } else {
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.62, size * 0.75);
      ctx.lineTo(0, size * 0.35);
      ctx.lineTo(-size * 0.62, size * 0.75);
      ctx.closePath();
    }

    if (isFollowed) {
      ctx.fillStyle = tokens.primary;
      ctx.fill();
    } else {
      ctx.strokeStyle = a.onGround ? tokens['text-3'] : tokens.text;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    if (isFollowed) {
      ctx.strokeStyle = tokens.primary;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    const label = [a.callsign ?? a.registration ?? a.hex.toUpperCase(), altLabel(a)].filter(Boolean).join(' ');
    text(ctx, label, p.x, p.y + size + labelSize * 0.9, {
      size: labelSize,
      weight: isFollowed ? 700 : 500,
      colour: isFollowed ? tokens.primary : tokens['text-2'],
    });
  }

  ctx.restore();
  ctx.restore();
}
