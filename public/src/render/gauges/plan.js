/**
 * plan.js — the radar plan view: aircraft around a centre, drawn head-up north.
 *
 * NON-HUE CHANNELS, declared before the code (Doctrine §4). Aircraft differ
 * from one another and from the furniture without relying on colour:
 *
 *   1. SHAPE. An aircraft that broadcasts a track is a triangle POINTED ALONG
 *      IT, so direction is carried by geometry; one that does not is a DIAMOND,
 *      which is the flight deck's own symbol for traffic whose heading is not
 *      known. The centre is a cross; range rings are circles.
 *   2. FILL. Proximate traffic — within 6 nm and 1200 ft — is filled solid;
 *      everything else is outlined. `tcasClass` decides, and the reason it
 *      cannot go further than two categories is written there.
 *   3. SIZE AND A RING. The followed aircraft is drawn larger, filled, and
 *      circled, so it is never confused with a proximate contact.
 *   4. TEXT. Every aircraft is labelled with its relative altitude and trend,
 *      so no aircraft is identified by colour alone.
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

/**
 * PROXIMATE TRAFFIC: the real TCAS definition, and it is exactly two numbers —
 * within 6 nautical miles AND within 1200 feet vertically. Nothing else.
 *
 * A real display draws four categories. Two of them, TRAFFIC ADVISORY and
 * RESOLUTION ADVISORY, are NOT DRAWN HERE and never will be from this data:
 * both are decided by CLOSING RATE — how long until the two aircraft are at the
 * same point — and an ADS-B broadcast does not carry it. It reports where an
 * aircraft is and where it has been. Computing a threat category from that
 * would be a value produced from neither a sensor nor a feed, which is the one
 * thing this app does not do. The (i) menu says so in the reader's words.
 *
 * The remaining two ARE honest, because range and relative altitude are both
 * broadcast, and the distinction is worth having: it is the difference between
 * an aeroplane somewhere in the county and one you could see out of the window.
 *
 * WHAT IT IS PROXIMATE TO is the CENTRE OF THE SCOPE, which is the same datum
 * the range rings measure from and which the crosshair names — YOU, HOME, a
 * followed flight, or a field picked by hand. On a scope centred on an airport
 * the filled marks are the ones close to that airport, exactly as the "10" on
 * the outer ring means ten miles from it.
 *
 * A MISSING NUMBER NEVER PROMOTES. No distance, no altitude, or no own altitude
 * to be relative to, and the aircraft is `other` — the category that claims
 * less. An aircraft on the ground is not traffic at all and is never proximate,
 * which is what a real TCAS does with it.
 */
export const PROXIMATE_NM = 6;
export const PROXIMATE_FT = 1200;

export function tcasClass(a, ownAltFt, distanceNm) {
  if (!a || a.onGround) return 'other';
  if (!Number.isFinite(distanceNm) || distanceNm > PROXIMATE_NM) return 'other';
  if (!Number.isFinite(ownAltFt)) return 'other';
  const ft = Number.isFinite(a.altGeomFt) ? a.altGeomFt : a.altBaroFt;
  if (!Number.isFinite(ft)) return 'other';
  return Math.abs(ft - ownAltFt) <= PROXIMATE_FT ? 'proximate' : 'other';
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
/**
 * HOW FAR A TAP MAY LAND FROM THE SYMBOL AND STILL COUNT.
 *
 * Measured against `placeLabels`, which offsets a
 * label by `size + lineHeight * 0.9` — about 20px — plus the label's own height:
 * **a finger going for the altitude readout lands 20 to 28 px from the mark.**
 *
 * The old radius was 24, so tapping the LABEL — by far the biggest and most
 * inviting thing on the scope — missed about as often as it hit. That is the
 * inconsistency exactly: not a flaky hit test, a target that excluded the part
 * people aim at.
 *
 * Nearest-wins still resolves a cluster, so a wider radius only helps where
 * there was nothing closer to choose.
 */
export const TAP_SLOP_PX = 34;

/**
 * THE LABEL ON A RANGE RING NAMES THE DISTANCE THE RING IS ACTUALLY AT.
 *
 * It used to round away from it: `Math.round(rangeNm * frac)`. At 10 nm the
 * quarter and three-quarter rings sit at 2.5 and 7.5 nm and read "3" and "8" —
 * a display whose entire contract is distance, printing a distance the circle
 * is not at.
 *
 * 20, 40 and 80 all divide evenly by four, which is how it stayed hidden: three
 * of the four ranges were correct by arithmetic accident.
 *
 * EXPORTED SO THE TEST CAN CALL THE REAL THING. Written inline it was six
 * characters, and a test that re-typed those six characters would have gone on
 * passing with `Math.round` restored underneath it — which is a test of the
 * test, and the plant for this defect exists to prove it is not.
 */
export function ringLabelFor(rangeNm, frac) {
  const at = rangeNm * frac;
  return Number.isInteger(at) ? String(at) : at.toFixed(1);
}

export function hitTestAircraft(aircraft, { centre, rangeNm, w, h }, px, py, slopPx = TAP_SLOP_PX) {
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

/**
 * Below this drawn length a line cannot carry a direction — it is a speck, and
 * a speck that claims to be a runway is worse than a symbol that claims to be
 * an airport. Chosen from the measured sizes: at 40 nm real runways draw 4–9px,
 * which is squarely under it, and at 10 nm they draw 24px+, which is over.
 */
export const RUNWAY_MIN_PX = 14;

/** The airport symbol's radius. Small enough not to compete with a traffic
 *  mark, big enough to be a deliberate circle rather than a dot. */
export const AIRPORT_SYMBOL_R = 3.5;

/**
 * How wide to draw a runway of a given drawn length.
 *
 * EXPORTED SO THE TEST USES THIS ONE. The first version of the test declared
 * its own copy of the formula and asserted things about the copy — which would
 * have stayed green with any width at all in the renderer. That is hub LESSONS
 * §42 in miniature: a check on a decision the shipped code never consults.
 */
export function runwayWidthPx(len) {
  return Math.max(2, Math.min(7, len * 0.13));
}

export function drawPlan(ctx, { x, y, w, h, tokens, centre, aircraft, rangeNm, followedHex, fromFix, centreLabel = null, ownAltFt = null, trail = [], runways = [], readiness = null }) {
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
    text(ctx, ringLabelFor(rangeNm, frac), cx + 3, cy - r * frac + ringLabel * 0.7, {
      size: ringLabel,
      colour: tokens['text-3'],
      align: 'left',
    });
  }

  /**
   * THE FEED'S STATE, ON THE INSTRUMENT.
   *
   * The RADAR page has a chip saying NO CONTACT or AGEING with the retry
   * countdown; the navigation display beside the horizon had NOTHING, so the
   * same scope, drawn from the same data, said one thing on one page and was
   * silent on the other. A reader on the PFD saw a scope with no aircraft on it
   * and no way to tell a quiet sky from a feed that is being refused.
   *
   * Drawn ON the canvas rather than added beside it, because that is what an
   * instrument does with a flag — the ADI carries ATT FAIL the same way — and
   * because the PFD has no room for another row.
   *
   * Suppressed when the feed is healthy and has contacts: a flag that is always
   * lit is furniture, and the aircraft themselves say CONTACT better than a word
   * would.
   */
  if (readiness?.label && readiness.state !== 'contact' && readiness.state !== 'following') {
    const size = Math.max(9, r * 0.075);
    const tone = readiness.state === 'ageing' ? tokens.warn ?? tokens['text-2'] : tokens.fail;
    text(ctx, readiness.label, x + 8, y + size + 6, { size, weight: 700, colour: tone, align: 'left' });
  }

  /**
   * --- RUNWAYS AND AIRPORTS ( )
   *
   * TWO MARKS, AND THE CHOICE BETWEEN THEM IS THE WHOLE FIX. The owner,
   * 2026-08-04: "Why does every runway look exactly the same even at different
   * scales?" Measured against the real navdata at a 350px scope radius, he was
   * exactly right and for two compounding reasons:
   *
   *   · THE WIDTH FORMULA WAS DEAD. It was `max(1.5, min(5, len * 0.06))`, and
   *     `len * 0.06` never exceeds 1.44 at any real drawn length, so the `max`
   *     pinned every runway at 1.5px forever. It had never once varied.
   *   · TO SCALE, A RUNWAY IS NOTHING AT RANGE. At 40 nm a 4,000 ft strip is
   *     6px; at 80 nm it is 3px and culled. A 3,000 ft runway and a 6,000 ft
   *     one differ by five pixels of length at identical width — which is to
   *     say they look identical, because they are.
   *
   * Drawing them bigger than they are would be a lie about a distance, which
   * this panel does not tell. So below the length where a line can carry
   * ORIENTATION, the mark becomes an AIRPORT SYMBOL — a small open circle, the
   * same convention every aeronautical chart uses — placed once per airport
   * rather than once per runway. A symbol is not a scale drawing and does not
   * claim to be one; that is exactly why it is honest at range.
   *
   * Above that length the runway is drawn where it is, pointing where it
   * points, from real threshold coordinates, with a width that now actually
   * scales.
   *
   * Drawn UNDER everything else, because they are the ground and the aircraft
   * are above it.
   */
  ctx.save();
  ctx.lineCap = 'butt';
  const drawn = [];
  for (const rw of runways) {
    const a = project(rw.le, { centre, pxPerNm, cx, cy });
    const b = project(rw.he, { centre, pxPerNm, cx, cy });
    if (!a || !b) continue;
    drawn.push({ rw, a, b, len: Math.hypot(b.x - a.x, b.y - a.y) });
  }

  // The airports whose longest runway is too short to read as a direction.
  // Grouped, so a field with three runways is one symbol rather than three
  // specks stacked in the same place.
  const byAirport = new Map();
  for (const d of drawn) {
    const cur = byAirport.get(d.rw.ident);
    if (!cur || d.len > cur.len) byAirport.set(d.rw.ident, d);
  }

  ctx.strokeStyle = tokens['text-3'];
  for (const d of drawn) {
    if (d.len < RUNWAY_MIN_PX) continue;
    // Proportional and visible: a strip, not a hairline, and never so wide that
    // two parallel runways merge at close range.
    ctx.lineWidth = runwayWidthPx(d.len);
    ctx.beginPath();
    ctx.moveTo(d.a.x, d.a.y);
    ctx.lineTo(d.b.x, d.b.y);
    ctx.stroke();
  }

  // One symbol per airport that is too small to draw as a runway.
  ctx.lineWidth = 1.5;
  for (const d of byAirport.values()) {
    if (d.len >= RUNWAY_MIN_PX) continue;
    const mx = (d.a.x + d.b.x) / 2;
    const my = (d.a.y + d.b.y) / 2;
    ctx.beginPath();
    ctx.arc(mx, my, AIRPORT_SYMBOL_R, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

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
    // THE DISTANCE THE DISPLAY IS ITSELF ASSERTING, read back off the geometry
    // it just drew with, so a filled mark is always inside the circle a reader
    // can measure against the range rings. Taking `a.distanceNm` instead would
    // be a distance from the fetch's centre, which is not always this one.
    const distanceNm = Math.hypot(p.x - cx, p.y - cy) / pxPerNm;
    const proximate = tcasClass(a, ownAltFt, distanceNm) === 'proximate';

    ctx.save();
    ctx.translate(p.x, p.y);
    if (track !== null) ctx.rotate((track * Math.PI) / 180);

    ctx.beginPath();
    if (track === null) {
      // No track broadcast: a DIAMOND, the flight deck's own mark for traffic
      // whose heading is not known, so the absence is stated in the symbology
      // rather than merely absent. A triangle pointing at a default would be an
      // invented value.
      const d = size * 0.85;
      ctx.moveTo(0, -d);
      ctx.lineTo(d, 0);
      ctx.lineTo(0, d);
      ctx.lineTo(-d, 0);
      ctx.closePath();
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
    } else if (proximate) {
      // Filled, in the SAME ink as an outlined contact. Proximity is a fill, not
      // a hue: a colour here would collide with the provenance tones and with
      // the red/amber the flight deck reserves for a condition to act on, and
      // this is neither — it is an aeroplane that happens to be close.
      ctx.fillStyle = tokens.text;
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
