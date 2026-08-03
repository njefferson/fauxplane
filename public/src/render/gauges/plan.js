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
/**
 * THE TCAS LABEL: relative altitude in hundreds of feet, signed, plus a trend.
 *
 * This is what a real ND shows beside a traffic symbol and it is ALL it shows —
 * no callsign, no registration, no type. `+03` is three hundred feet above you.
 * Noah: "What info is shown for each object? ... My desired fix is ALWAYS more
 * like a regular aircraft."
 *
 * Two digits, because TCAS uses two: anything beyond ±99 hundred feet is far
 * outside any band a crew would select, and a third digit is a number nobody
 * reads at a glance.
 *
 * WITH NO OWN ALTITUDE there is no relative anything, so it falls back to the
 * absolute label rather than inventing a datum. That is the honest degradation
 * and it is what happens on a desk before the first GPS fix.
 *
 * The arrow is TCAS's own threshold: climbing or descending more than about
 * 500 fpm. Below that an aircraft is level as far as the display is concerned.
 */
export function tcasLabel(a, ownAltFt) {
  if (a.onGround) return 'GND';
  const ft = Number.isFinite(a.altGeomFt) ? a.altGeomFt : a.altBaroFt;
  if (!Number.isFinite(ft)) return '';
  if (!Number.isFinite(ownAltFt)) return altLabel(a);

  const hundreds = Math.round((ft - ownAltFt) / 100);
  const clamped = Math.max(-99, Math.min(99, hundreds));
  // A MINUS SIGN, not a hyphen — it lines up in a monospaced column and reads
  // as arithmetic rather than as punctuation.
  const sign = clamped < 0 ? '\u2212' : '+';
  const digits = String(Math.abs(clamped)).padStart(2, '0');

  const rate = a.verticalRateFpm;
  const trend = !Number.isFinite(rate) || Math.abs(rate) < 500 ? '' : rate > 0 ? '\u2191' : '\u2193';
  return `${sign}${digits}${trend}`;
}

export function altLabel(a) {
  if (a.onGround) return 'GND';
  const ft = a.altBaroFt ?? a.altGeomFt;
  if (ft === null || ft === undefined) return '';
  return ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft / 100) * 100}`;
}

/**
 * Decide where each aircraft label goes, and drop the ones that cannot fit.
 *
 * NINETEEN AIRCRAFT IN ONE QUADRANT OVERPRINTED INTO A SMEAR. Every label was
 * drawn at a fixed offset below its symbol, so a cluster produced several lines
 * of text in the same pixels — unreadable, and worse than unreadable because it
 * looks like corruption rather than density.
 *
 * Greedy placement against the labels already placed: four candidate positions
 * per aircraft, first one that is clear wins. **A label that fits nowhere is
 * DROPPED, and its symbol is still drawn.** That is the honest trade — the
 * aircraft is still on the plan view at the right bearing and range, which is
 * what a plan view is for, and its callsign is in the list on the RADAR page as
 * text. Drawing it anyway would hide a neighbour to no one's benefit.
 *
 * Priority decides who keeps their label when they cannot all have one: the
 * followed aircraft first, then whoever is closest to the middle.
 *
 * Pure, and takes its own text measurement, so it can be tested without a
 * canvas — which is the only way to test it at all, since the accessibility
 * gate cannot see inside one.
 */
export function placeLabels(items, { measure, lineHeight, bounds }) {
  const placed = [];
  const out = [];
  const overlaps = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;

  const ordered = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const item of ordered) {
    const tw = measure(item.text);
    const pad = item.size + lineHeight * 0.9;
    // Below, above, right, left. Below first because it is where a reader
    // already expects it and keeps the cluster shapes familiar.
    const candidates = [
      { x: item.x, y: item.y + pad, align: 'center' },
      { x: item.x, y: item.y - pad, align: 'center' },
      { x: item.x + item.size + 3, y: item.y + lineHeight * 0.35, align: 'left' },
      { x: item.x - item.size - 3, y: item.y + lineHeight * 0.35, align: 'right' },
    ];
    let chosen = null;
    for (const c of candidates) {
      const left = c.align === 'center' ? c.x - tw / 2 : c.align === 'left' ? c.x : c.x - tw;
      const box = { left, right: left + tw, top: c.y - lineHeight * 0.6, bottom: c.y + lineHeight * 0.6 };
      if (bounds && (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom)) continue;
      if (placed.some((q) => overlaps(q, box))) continue;
      chosen = { ...c, box };
      break;
    }
    if (!chosen) continue; // symbol still drawn; label dropped rather than smeared
    placed.push(chosen.box);
    out.push({ key: item.key, text: item.text, x: chosen.x, y: chosen.y, align: chosen.align });
  }
  return out;
}

/**
 * Which aircraft is under a tap, if any.
 *
 * The SAME geometry drawPlan draws with — centre, ring radius, px-per-nm —
 * so a symbol is hit exactly where it is painted. Pure, so the finger-sized
 * tolerance is testable without a canvas: a tap is a ~44 px event, not a
 * pixel, and the nearest symbol inside that circle wins.
 */
export function hitTestAircraft(aircraft, { centre, rangeNm, w, h }, px, py, slopPx = 24) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 4;
  const pxPerNm = r / rangeNm;
  let best = null;
  let bestD = slopPx;
  for (const a of aircraft ?? []) {
    const q = project(a, { centre, pxPerNm, cx, cy });
    if (!q || Math.hypot(q.x - cx, q.y - cy) > r) continue;
    const d = Math.hypot(q.x - px, q.y - py);
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function drawPlan(ctx, { x, y, w, h, tokens, centre, aircraft, rangeNm, followedHex, fromFix, centreLabel = null, ownAltFt = null, trail = [] }) {
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
  // THE CENTRE SAYS WHAT IT IS, and `radarCentre` is the one thing that decides.
  //
  // Four states now: this device, the home reference before a fix, the aircraft
  // the whole panel has become while following, and a place chosen by hand. The
  // caller used to work the label out, which meant each scope worked it out
  // separately — the RADAR page named a followed flight and the PFD's navigation
  // display drew HOME under the identical crosshair, and once a place could be
  // picked the RADAR page said HOME while its own status line said KSMF.
  //
  // `centreLabel` remains only as an override for a caller that has something
  // truer to say; nothing passes one today.
  text(ctx, (centreLabel ?? centre?.short ?? (fromFix ? 'YOU' : 'HOME')).slice(0, 12), cx, cy + s * 2.6, {
    size: ringLabel * 0.9,
    weight: 700,
    colour: tokens['text-3'],
  });

  // --- the aircraft --------------------------------------------------------
  // THE OBSERVED PATH of the followed aircraft, drawn before the symbols so it
  // sits under them. Straight segments between reported positions and nothing
  // else: no smoothing, because a curve through sparse observations is a
  // DRAWING of a flight path rather than a record of one, and no extrapolation
  // ahead, because ADS-B says where an aircraft has been and never where it is
  // going.
  if (trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = tokens.primary;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let drawing = false;
    for (const point of trail) {
      const q = project(point, { centre, pxPerNm, cx, cy });
      // Outside the ring it would read as a bearing it is not at, so the trail
      // simply stops there and resumes when it comes back — the same contract
      // the symbols keep.
      if (!q || Math.hypot(q.x - cx, q.y - cy) > r) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
      drawing = true;
    }
    ctx.stroke();
    ctx.restore();
  }

  const labelSize = Math.max(8, Math.min(12, r * 0.062));
  const pending = [];
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

    // COLLECTED, NOT DRAWN. Placement needs to know about every other label, so
    // it cannot happen inside the loop that draws the symbols.
    pending.push({
      key: a.hex,
      x: p.x,
      y: p.y,
      size,
      // THE SCOPE CARRIES NO IDENTITY. A real ND shows a symbol and a relative
      // altitude, nothing else — the callsign was ours, and it is what made
      // fifty-six aircraft unreadable. Identity is one tap away and is on the
      // "Heard right now" list in full: the scope gets austere, the list stays
      // rich, and nothing is lost.
      text: tcasLabel(a, ownAltFt),
      // The followed aircraft keeps its label at any density; after that,
      // whoever is nearest the middle.
      priority: (isFollowed ? 1e6 : 0) - Math.hypot(p.x - cx, p.y - cy),
      followed: isFollowed,
    });
  }

  ctx.font = `500 ${labelSize}px ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace`;
  const laid = placeLabels(pending, {
    measure: (t) => ctx.measureText(t).width,
    lineHeight: labelSize,
    bounds: { left: x + 2, right: x + w - 2, top: y + 2, bottom: y + h - 2 },
  });
  const byKey = new Map(pending.map((i) => [i.key, i]));
  for (const l of laid) {
    text(ctx, l.text, l.x, l.y, {
      size: labelSize,
      align: l.align,
      weight: byKey.get(l.key)?.followed ? 700 : 500,
      colour: byKey.get(l.key)?.followed ? tokens.primary : tokens['text-2'],
    });
  }

  ctx.restore();
  ctx.restore();
}
