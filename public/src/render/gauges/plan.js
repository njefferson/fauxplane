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

/**
 * Screen position for a lat/lon, given the centre, the scale, and WHICH WAY IS
 * UP.
 *
 * `upDeg` is the true bearing the top of the display points at. Zero is north,
 * which is what every caller passed before MAP mode existed and is still the
 * default — the RADAR page's scope is north-up and stays north-up.
 *
 * THE ROTATION IS APPLIED HERE, AT THE PROJECTION, AND THAT IS THE WHOLE
 * DESIGN. Every mark on the display — traffic, runways, airports, the flown
 * track — arrives through this function, so rotating here rotates all of them
 * at once and none of them can be left behind. A symbol whose own maths knew
 * about track-up would be a second opinion about which way is up, and the ones
 * that were forgotten would sit at a bearing they are not at while looking
 * perfectly ordinary. Only a symbol's own POINTING has to be turned separately,
 * and there is exactly one of those.
 */
export function project({ lat, lon }, { centre, pxPerNm, cx, cy, upDeg = 0 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Equirectangular about the centre. Over a plan view of tens of nautical
  // miles the error against a proper projection is far below one pixel, and it
  // keeps the maths legible; longitude still has to shrink with latitude or
  // everything east-west is stretched by a quarter at this latitude.
  const dNorthNm = (lat - centre.lat) * 60;
  const dEastNm = (lon - centre.lon) * 60 * Math.cos((centre.lat * Math.PI) / 180);
  const ex = dEastNm * pxPerNm;
  const ny = -dNorthNm * pxPerNm;
  if (!upDeg) return { x: cx + ex, y: cy + ny };
  // Screen axes, y down. Turning the WORLD by −upDeg is what puts the bearing
  // `upDeg` at the top: due east with east up must land straight above centre.
  const a = (upDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: cx + ex * cos + ny * sin, y: cy + ny * cos - ex * sin };
}

/**
 * WHICH WAY IS UP, AND WHY — and it is a FIELD DECISION, not a preference.
 *
 * A real ND in MAP mode is TRACK-UP: the top of the display is where the
 * aeroplane is actually going. Not heading, which is where the nose points, and
 * on a windy day those differ by several degrees.
 *
 * THIS PANEL USUALLY HAS NEITHER. It sits clamped to a desk: the GPS track needs
 * movement to exist, and plenty of phones report no magnetic heading at all. So
 * the display falls back to NORTH-UP and SAYS SO — a map that silently switched
 * between two references would be untrustworthy in exactly the way the file
 * header has always said, and a map claiming track-up while drawn north-up would
 * be worse than either.
 *
 * The case where it comes alive is FOLLOWING an aircraft, where the track is
 * filled from a real ADS-B broadcast. The map then turns with the flight.
 *
 * Pure and exported, so every sentence the display can put on itself is testable
 * without a canvas.
 */
export function upReference(fields = {}, mode = 'plan') {
  if (mode !== 'map') return { upDeg: 0, label: 'NORTH UP', reason: null, kind: 'north' };
  const track = fields['position.track'];
  if (track && track.provenance !== 'FAIL' && Number.isFinite(track.value)) {
    return { upDeg: track.value, label: 'TRK UP', reason: null, kind: 'track' };
  }
  const heading = fields['attitude.heading'];
  if (heading && heading.provenance !== 'FAIL' && Number.isFinite(heading.value)) {
    // Second choice and labelled as such. A crew reads TRK and HDG as different
    // numbers, so a display showing one under the other's name is a lie about
    // which it is — even when they happen to be equal.
    return { upDeg: heading.value, label: 'HDG UP', reason: 'no ground track — the nose, not the path', kind: 'heading' };
  }
  return {
    upDeg: 0,
    label: 'NORTH UP',
    reason: track?.reason ?? heading?.reason ?? 'no track or heading',
    kind: 'north',
  };
}

/**
 * WHERE OWN SHIP SITS, as a fraction of the box height.
 *
 * A north-up plan view is CENTRED, because the question it answers is "what is
 * around me". MAP mode puts the aeroplane near the bottom, because the question
 * changes to "what is ahead" and two thirds of a centred display is behind you.
 * 0.78 is about where a real ND's aircraft symbol sits.
 */
export const MAP_OWNSHIP_Y = 0.78;

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

/**
 * WHERE THE SCOPE'S CENTRE IS, HOW BIG IT IS, AND WHAT IS UP — in ONE place,
 * because two answers to that question is a hit test that misses.
 *
 * This comment used to say the hit test was north-up and centred "because the
 * only tappable scope is the RADAR page's, and that one is both", and that if
 * anything else ever became tappable it would need the same geometry `drawPlan`
 * uses. The MAP page shipped tappable-looking and not tappable, so the warning
 * was right and arrived one release early. Now there is nothing to keep in
 * step: the renderer and the hit test call this.
 *
 *   PLAN — centred; the radius is the largest circle that fits the box.
 *   MAP  — own ship near the bottom; the radius reaches the TOP of the box, so
 *          the range arc uses the height it has and is clipped at the sides,
 *          which is what a real ND looks like.
 */
export function planGeometry({ x = 0, y = 0, w, h, rangeNm, mode = 'plan', upDeg = 0 }) {
  const isMap = mode === 'map';
  const cx = x + w / 2;
  const cy = isMap ? y + h * MAP_OWNSHIP_Y : y + h / 2;
  const r = isMap ? Math.max(24, cy - y - 4) : Math.min(w, h) / 2 - 4;
  return { isMap, cx, cy, r, pxPerNm: r / rangeNm, upDeg };
}

/**
 * Which aircraft is under a tap. Takes the SAME geometry the renderer draws
 * with — see `planGeometry` — so a symbol is hit exactly where it is painted.
 */
export function hitTestAircraft(aircraft, { centre, rangeNm, w, h, x = 0, y = 0, mode = 'plan', upDeg = 0 }, px, py, slopPx = TAP_SLOP_PX) {
  const { cx, cy, r, pxPerNm } = planGeometry({ x, y, w, h, rangeNm, mode, upDeg });
  let best = null;
  let bestD = slopPx;
  for (const a of aircraft ?? []) {
    const q = project(a, { centre, pxPerNm, cx, cy, upDeg });
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

/**
 * THE AIRPORT SYMBOL'S RADIUS, AND IT SCALES WITH THE SCOPE.
 *
 * It was a flat 3.5px, chosen against the navigation display beside the horizon
 * — a box about 350px across, where 3.5px is a deliberate small circle. The MAP
 * page is a 1900px canvas, and on it the same constant is a speck: at 40 nm
 * every runway in the region falls under `RUNWAY_MIN_PX` and becomes one, so an
 * entire layer switched ON renders as dust. Reported from a real iPad.
 *
 * A symbol is not a scale drawing — that is the whole reason it replaces the
 * runway at range — so nothing about it has to stay a fixed number of pixels.
 * It stays 3.5 on the small scope and grows with the glass.
 */
export function airportSymbolR(r, { labelled = false } = {}) {
  // A LABELLED field gets a slightly bigger mark, because the label has to hang
  // off something. 3.5px beside 11px text reads as a speck with a caption.
  return Math.max(labelled ? 5 : 3.5, r * 0.016);
}

/**
 * How big an airport's identifier is drawn, and whether it is drawn at all.
 *
 * ---------------------------------------------------------------------------
 * THE FIRST VERSION OF THIS NEVER RENDERED ONCE, ON ANY DEVICE
 * ---------------------------------------------------------------------------
 *
 * It gated on `symR > 5 && identSize >= 9`, with `identSize = max(8, r*0.026)`.
 * The floor of 8 is BELOW the threshold of 9, so the size test could only pass
 * via the scaled term — needing a scope radius of 346px. Measured, in CSS
 * pixels, which is what this renderer draws in:
 *
 *     PFD plan scope, phone landscape    r =  66
 *     MAP page, phone landscape          r = 108
 *     PFD plan scope, phone portrait     r = 141
 *     RADAR page, phone                  r = 168
 *     MAP page, phone portrait           r = 168
 *     PFD plan scope, tablet             r = 184
 *     MAP page, tablet 1024x900          r = 295
 *
 * Nothing reaches it. Every airport on every device has been an anonymous
 * circle since the day idents were added, while the release note said they
 * "carry their identifier now, where there is room for it". There was never
 * room, and no check could see it — a canvas is invisible to the a11y gate.
 *
 * SO THE CALLER DECIDES, not a radius. The radius never could: the PFD's little
 * scope on a phone (141) is LARGER than the MAP page in landscape (108), so no
 * threshold separates "the austere scope beside the horizon" from "the chart".
 * That distinction is about what the page is FOR, and only the page knows.
 */
export const AIRPORT_IDENT_MIN_PX = 11;

export function airportIdentSize(r) {
  return Math.max(AIRPORT_IDENT_MIN_PX, r * 0.026);
}

/** Kept for the tests and callers that measured the old constant. */
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

/**
 * THE GROUNDSPEED READOUT IN THE MAP'S TOP CORNER — what it says, or nothing.
 *
 * ---------------------------------------------------------------------------
 * THE RULE IS ABOUT DUPLICATION, NOT ABOUT PLACEMENT
 * ---------------------------------------------------------------------------
 *
 * This readout was refused once, on a reading of the value-strip lesson as
 * "numbers do not belong in an ND corner". That was too wide. What the strip
 * did wrong was paint a screen-reader text alternative on the glass — eight
 * rows of it — and nearly all of it repeated a tape a few inches away.
 *
 * The rule that survives is the one `alerts.js` states: a thing earns its glass
 * only if it is NOT ALREADY VISIBLE on the page the reader is looking at. That
 * gives different answers per surface, which is the point:
 *
 *   PFD inset — the speed tape is inches to the left. Duplication. Refused.
 *   MAP page  — no speed appears anywhere on it. Drawn.
 *
 * The wind two hundred lines below has always been justified this way, in those
 * words. This readout is the same argument, applied to the same page.
 *
 * GS ONLY, NEVER AIRSPEED. On the MAP page the reader is on a desk, where TAS
 * and CAS correctly FAIL for want of air data, or following, where they FAIL by
 * design because this device's weather is not the aircraft's. A permanently
 * crossed-out airspeed in the corner of a chart is furniture.
 *
 * Returns null when there is nothing to say, so a FAIL draws nothing at all
 * rather than a crossed-out box — the same rule the wind arrow follows.
 */
export function groundspeedReadout(field) {
  if (!field || field.provenance === 'FAIL' || !Number.isFinite(field.value)) return null;
  const kt = Math.round(field.value);
  // `kt` as well as `text`, so the spoken description does not have to take the
  // abbreviation back off the front of a string somebody may later reword.
  return { text: `GS ${kt}`, kt, stale: field.provenance === 'STALE' };
}

export function drawPlan(ctx, { x, y, w, h, tokens, centre, aircraft, rangeNm, followedHex, fromFix, centreLabel = null, ownAltFt = null, trail = [], runways = [], readiness = null, mode = 'plan', up = null, wind = null, basemap = null, layers = null,
  /**
   * NAME THE AIRPORTS, or leave them as marks.
   *
   * OFF by default, so the PFD's scope and the RADAR page stay the austere
   * traffic displays they are meant to be — a TCAS scope does not label the
   * ground. The MAP page turns it on, because a chart whose fields are
   * anonymous circles answers "there is a field here" when the reader asked
   * "which field is that". See `airportIdentSize` for why this is the caller's
   * decision and not a size threshold.
   */
  airportIdents = false,
  /**
   * THE READER'S OWN GROUNDSPEED, and only the MAP page passes it.
   *
   * Null everywhere else, which is not an oversight — see `groundspeedReadout`.
   * Whether this number duplicates something depends on what surrounds the
   * canvas, and only the caller knows that.
   */
  groundspeed = null }) {
  /**
   * TWO GEOMETRIES, ONE RENDERER.
   *
   *   PLAN — centred, north-up, full rings and a fixed compass rose. What you
   *          use to review what is AROUND you, and what the RADAR page is.
   *   MAP  — own ship near the bottom, the display turned so the direction of
   *          travel is up, range ARCS and a compass arc across the top. What a
   *          crew actually flies with, because two thirds of a centred display
   *          is behind you.
   *
   * Same projection, same symbols, same data. Only the centre, the radius and
   * the furniture differ — everything else inherits the rotation through
   * `project`, which is why there is one renderer rather than two.
   */
  const upDeg = mode === 'map' ? (up?.upDeg ?? 0) : 0;
  // ONE SOURCE OF GEOMETRY, shared with `hitTestAircraft`. See `planGeometry`.
  const { isMap, cx, cy, r, pxPerNm } = planGeometry({ x, y, w, h, rangeNm, mode, upDeg });
  const projection = { centre, pxPerNm, cx, cy, upDeg };

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

  /**
   * --- THE BASEMAP, UNDER EVERYTHING -------------------------------------
   *
   * Natural Earth, public domain, clipped to this region and BUNDLED — see
   * `scripts/build-basemap.mjs` for the licence read from the publisher's own
   * repository and for why it is not tiled.
   *
   * IT IS FURNITURE AND IT MUST LOOK LIKE FURNITURE. A coastline as bright as
   * an aircraft is a scope where the ground competes with the traffic, which is
   * the one thing a traffic display cannot afford. Every layer is drawn in a
   * dim token at reduced alpha, under the range rings, and it is the only thing
   * on this display that can be switched off.
   *
   * It goes through `project` like everything else, so it turns with MAP mode
   * without knowing that MAP mode exists.
   */
  if (basemap && layers?.basemap !== false) {
    ctx.save();
    for (const layer of basemap.layers ?? []) {
      if (layers?.[layer.id] === false) continue;
      const area = layer.kind === 'area';
      ctx.globalAlpha = area ? 0.22 : 0.5;
      ctx.strokeStyle = tokens.hairline;
      ctx.fillStyle = tokens.hairline;
      ctx.lineWidth = layer.id === 'coast' ? 1.4 : 1;
      for (const shape of layer.shapes) {
        ctx.beginPath();
        let started = false;
        for (const [lon, lat] of shape) {
          const q = project({ lat, lon }, projection);
          if (!q) continue;
          if (started) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
          started = true;
        }
        if (!started) continue;
        if (area) {
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // --- range rings, or range ARCS ------------------------------------------
  // A full circle in MAP mode would spend most of its ink behind the aeroplane
  // and off the bottom of the box. The arc spans the sector actually in view.
  const ringLabel = Math.max(9, Math.min(12, r * 0.07));
  const from = isMap ? -Math.PI * 0.92 : 0;
  const to = isMap ? -Math.PI * 0.08 : Math.PI * 2;
  ctx.strokeStyle = tokens.rail;
  ctx.lineWidth = 1;
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * frac, from, to);
    ctx.stroke();
    text(ctx, ringLabelFor(rangeNm, frac), cx + 3, cy - r * frac + ringLabel * 0.7, {
      size: ringLabel,
      colour: tokens['text-3'],
      align: 'left',
    });
  }

  /**
   * --- THE TOP LEFT CORNER: the reader's groundspeed, then the feed's state.
   *
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
   *
   * THE GROUNDSPEED TAKES THE FIRST LINE AND THE FLAG MOVES DOWN — NEITHER IS
   * EVER SUPPRESSED FOR THE OTHER. They are unrelated facts: one is how fast
   * the reader is going, the other is that a feed is not answering, and a
   * corner that can only hold one of them would hide a failure behind a number
   * or a number behind a failure. Both are short; the corner holds two lines.
   */
  {
    const size = Math.max(9, r * 0.075);
    /**
     * NOT GATED ON MAP MODE, deliberately. Whether a speed duplicates something
     * is a fact about the PAGE, not about which way the scope is pointing — the
     * MAP page shows no speed anywhere in either mode, and the PFD's inset
     * shows one in both. The caller passing this at all IS the decision.
     */
    const gs = groundspeedReadout(groundspeed);
    const lines = [];
    if (gs) lines.push({ label: gs.text, tone: gs.stale ? tokens.stale ?? tokens['text-2'] : tokens.text });
    if (readiness?.label && readiness.state !== 'contact' && readiness.state !== 'following') {
      lines.push({ label: readiness.label, tone: readiness.state === 'ageing' ? tokens.warn ?? tokens['text-2'] : tokens.fail });
    }
    for (const [i, line] of lines.entries()) {
      text(ctx, line.label, x + 8, y + size + 6 + i * (size + 3), { size, weight: 700, colour: line.tone, align: 'left' });
    }
  }

  /**
   * --- RUNWAYS AND AIRPORTS ( )
   *
   * TWO MARKS, AND THE CHOICE BETWEEN THEM IS THE WHOLE FIX. THE DEFECT,
   * 2026-08-04: every runway looks exactly the same, at every scale.
   * Measured against the real navdata at a 350px scope radius, that was
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
  for (const rw of (layers?.airports === false ? [] : runways)) {
    const a = project(rw.le, projection);
    const b = project(rw.he, projection);
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

  /**
   * One symbol per airport that is too small to draw as a runway — and, where
   * there is room, ITS NAME.
   *
   * A circle with no name is a mark you cannot use. A real ND's ARPT switch
   * shows the identifier, which is the whole point of turning the layer on: not
   * "there is a field here" but "that is Sacramento Executive". The ident is
   * drawn only when the symbol is big enough for the text to sit clear of it,
   * so the small scope beside the horizon keeps its austere dots and the map
   * page gets a usable chart.
   */
  const showIdents = airportIdents;
  const symR = airportSymbolR(r, { labelled: showIdents });
  const identSize = airportIdentSize(r);
  ctx.lineWidth = 1.5;
  for (const d of byAirport.values()) {
    if (d.len >= RUNWAY_MIN_PX) continue;
    const mx = (d.a.x + d.b.x) / 2;
    const my = (d.a.y + d.b.y) / 2;
    ctx.beginPath();
    ctx.arc(mx, my, symR, 0, Math.PI * 2);
    ctx.stroke();
    if (showIdents && d.rw.ident) {
      text(ctx, d.rw.ident, mx + symR + 3, my + identSize * 0.35, {
        size: identSize,
        colour: tokens['text-3'],
        align: 'left',
      });
    }
  }
  ctx.restore();

  if (!isMap) {
    // --- compass rose, fixed: NORTH IS UP ----------------------------------
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
  } else {
    /**
     * --- THE COMPASS ARC, which is what a real ND has instead of a rose.
     *
     * It TURNS WITH THE MAP, so a bearing is read where that bearing actually
     * lies rather than off a fixed ring — that is the whole point of track-up
     * and the reason a rose would be worse than nothing here.
     *
     * Ticks every 10 degrees, labelled every 30, in the flight deck's own form:
     * the leading digits only, so 240 reads "24". Drawn only across the sector
     * in view, because a tick behind the aeroplane is a tick nobody can see.
     */
    const arcR = r - ringLabel * 0.6;
    ctx.strokeStyle = tokens.rail;
    ctx.lineWidth = 1;
    for (let brg = 0; brg < 360; brg += 10) {
      // Where this bearing sits once the world has been turned by upDeg.
      const rel = ((brg - upDeg + 540) % 360) - 180;
      if (Math.abs(rel) > 74) continue;
      const a = ((rel - 90) * Math.PI) / 180;
      const major = brg % 30 === 0;
      const len = major ? ringLabel * 0.8 : ringLabel * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * arcR, cy + Math.sin(a) * arcR);
      ctx.lineTo(cx + Math.cos(a) * (arcR - len), cy + Math.sin(a) * (arcR - len));
      ctx.stroke();
      if (major) {
        const lr = arcR - len - ringLabel * 0.8;
        text(ctx, brg === 0 ? 'N' : String(brg / 10).padStart(2, '0'), cx + Math.cos(a) * lr, cy + Math.sin(a) * lr, {
          size: ringLabel,
          weight: 700,
          colour: tokens['text-2'],
        });
      }
    }

    /**
     * WHICH REFERENCE IS UP, IN WORDS, ALWAYS. TRK UP, HDG UP or NORTH UP —
     * and on a desk it is nearly always the last of those, with the reason
     * beside it. A map that silently switched references would be untrustworthy
     * in exactly the way this file's header has said since it was written; one
     * that claimed track-up while drawn north-up would be worse than either.
     */
    if (up?.label) {
      const size = Math.max(9, r * 0.06);
      text(ctx, up.label, cx, y + size + 4, { size, weight: 700, colour: up.kind === 'north' ? tokens.stale ?? tokens['text-2'] : tokens['text-2'] });
    }
  }

  // --- the centre ----------------------------------------------------------
  ctx.strokeStyle = tokens.symbol;
  ctx.lineWidth = 2;
  const s = Math.max(5, r * 0.03);
  if (isMap) {
    /**
     * OWN SHIP, and in MAP mode it is an AEROPLANE rather than a cross.
     *
     * The cross is right for a centred plan view: it marks a PLACE, which is
     * all a north-up scope claims about the middle. Track-up is a different
     * claim — the display is oriented to where this thing is going, so the
     * symbol has a direction, and drawing a direction-free cross under a
     * direction-bearing display would be the only mark on it that disagreed.
     *
     * It points straight up by construction, because up IS the reference. It
     * never needs rotating and must never be given a rotation: the day it is,
     * it will be turned twice.
     */
    const a = s * 1.9;
    ctx.beginPath();
    ctx.moveTo(cx, cy - a);
    ctx.lineTo(cx, cy + a * 0.75);
    ctx.moveTo(cx - a * 0.8, cy + a * 0.1);
    ctx.lineTo(cx + a * 0.8, cy + a * 0.1);
    ctx.moveTo(cx - a * 0.35, cy + a * 0.7);
    ctx.lineTo(cx + a * 0.35, cy + a * 0.7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - s, cy);
    ctx.lineTo(cx + s, cy);
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx, cy + s);
    ctx.stroke();
  }
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
  if (trail.length > 1 && layers?.track !== false) {
    /**
     * DRAWN SO IT CAN BE SEEN, which the first version was not.
     *
     * It was a 1.5px line at 55% alpha. On the navigation display that is a
     * legible thread; on the MAP page the same track is a hairline crossing 30
     * pixels of a 1900px canvas, under a cluster of GND symbols, and the device
     * report was simply that no tracks were visible while following an aircraft that had
     * been broadcasting for three minutes. It was there. It was not visible,
     * which for an instrument is the same thing.
     *
     * The width now scales with the scope, it is fully opaque, and each
     * OBSERVATION gets a dot — because that is what the data is. ADS-B gives a
     * sequence of reported positions, not a curve, and a line alone hides how
     * many there were and how far apart. The dots are the honest form.
     */
    ctx.save();
    ctx.strokeStyle = tokens.primary;
    ctx.fillStyle = tokens.primary;
    ctx.lineWidth = Math.max(1.5, r * 0.007);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let drawing = false;
    for (const point of trail) {
      const q = project(point, projection);
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
    // One dot per REPORTED POSITION. Only where they are far enough apart to be
    // distinguishable — a string of touching dots is a thicker line, not more
    // information.
    const dotR = Math.max(1.2, r * 0.006);
    if (dotR > 1.6) {
      let prev = null;
      for (const point of trail) {
        const q = project(point, projection);
        if (!q || Math.hypot(q.x - cx, q.y - cy) > r) continue;
        if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) < dotR * 3) continue;
        prev = q;
        ctx.beginPath();
        ctx.arc(q.x, q.y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  const labelSize = Math.max(8, Math.min(12, r * 0.062));
  const pending = [];
  for (const a of (layers?.traffic === false ? [] : aircraft ?? [])) {
    const p = project(a, projection);
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
    // THE ONE THING `project` CANNOT DO FOR US. Position is rotated at the
    // projection; a symbol's own POINTING is drawn in its own frame, so it has
    // to be turned by the same amount here or every triangle on a track-up map
    // points at a bearing it is not flying.
    if (track !== null) ctx.rotate(((track - upDeg) * Math.PI) / 180);

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

  /**
   * --- THE WIND.
   *
   * Altitude, vertical speed and heading are all tapes a few inches to the left
   * on the PFD, so they are not repeated in its inset's corner. The wind aloft
   * is not anywhere on either page — it lives on ATIS — and it is what makes
   * the difference between where the nose points and where the aeroplane goes.
   *
   * THE TEST IS DUPLICATION, NOT PLACEMENT, and this comment used to get that
   * wrong: it said an ND corner readout would be "the value strip's mistake in
   * a smaller box", full stop, and that sentence was then cited to refuse the
   * groundspeed readout on the MAP page — a page with no speed on it anywhere.
   * The strip's mistake was repeating tapes that were already on screen. See
   * `groundspeedReadout`, which applies the same test and gets a different
   * answer per surface, exactly as this block always has.
   *
   * THE ARROW POINTS THE WAY THE WIND IS GOING, which is the opposite of the
   * direction it is REPORTED from: a "240" wind blows from 240 towards 060. A
   * flight deck draws the vector, and the number beside it is the reported
   * direction, so both conventions are on screen and neither has to be guessed.
   *
   * It turns with the map like everything else. Drawn only in MAP mode, and only
   * when there is a wind to draw — a crossed-out arrow would be furniture.
   */
  if (isMap && Number.isFinite(wind?.dirDeg) && Number.isFinite(wind?.speedKt)) {
    const size = Math.max(9, r * 0.06);
    const wx = x + w - size * 2.4;
    const wy = y + size * 3.2;
    const len = size * 1.5;
    // Reported FROM dirDeg, so it travels towards dirDeg + 180, then the map's
    // own rotation is taken off exactly as every other bearing's is.
    const a = ((wind.dirDeg + 180 - upDeg - 90) * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    ctx.save();
    ctx.strokeStyle = tokens['text-2'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx - dx * len, wy - dy * len);
    ctx.lineTo(wx + dx * len, wy + dy * len);
    // A head, so the direction is carried by shape and not only by position.
    const head = size * 0.55;
    const left = a + Math.PI * 0.82;
    const right = a - Math.PI * 0.82;
    ctx.moveTo(wx + dx * len, wy + dy * len);
    ctx.lineTo(wx + dx * len + Math.cos(left) * head, wy + dy * len + Math.sin(left) * head);
    ctx.moveTo(wx + dx * len, wy + dy * len);
    ctx.lineTo(wx + dx * len + Math.cos(right) * head, wy + dy * len + Math.sin(right) * head);
    ctx.stroke();
    ctx.restore();
    text(ctx, `${String(Math.round(wind.dirDeg) % 360).padStart(3, '0')}/${Math.round(wind.speedKt)}`, x + w - 6, y + size + 4, {
      size,
      weight: 700,
      colour: tokens['text-2'],
      align: 'right',
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
