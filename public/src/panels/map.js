/**
 * map.js — the MAP page: the same scope, on the ground it is over.
 *
 * WHY A SIXTH TAB, when the (i) menu exists precisely so that things which are
 * not instruments do not get one. Because this IS an instrument: it is the
 * navigation display with a basemap under it, which is what "MAP mode" means on
 * a real aeroplane, and the PFD's ND is a few inches across. A map you cannot
 * see the ground on is not the thing.
 *
 * IT DOES NOT GROW A SECOND RENDERER. Every mark is drawn by `drawPlan` — the
 * same projection, the same TCAS symbology, the same runways and airports, the
 * same track-up rotation, the same range arcs. This file is a page around it:
 * a canvas, the layer switches, and the mode and range controls. A second
 * renderer is how two pictures of one truth start disagreeing, which is the
 * mistake this repo has already made once and written down.
 *
 * THE BASEMAP IS BUNDLED, NOT TILED — Natural Earth, public domain, clipped to
 * the region. `scripts/build-basemap.mjs` carries the licence, read from the
 * publisher's own repository. It cannot be rate limited, it works with the
 * radio off, and it puts none of this app's load on somebody else's tile
 * server. The same reasoning as the airport database, and the same shape.
 *
 * ACCESSIBILITY OF THE CONTROLS, declared before the code (Doctrine §4):
 *   - Every layer is a real two-state button with a visible name and a pressed
 *     state carried by BOTH its border and its text colour, never by fill alone.
 *   - Nothing here is drag-only; there is no pan or pinch to fumble, because
 *     the centre is chosen on RADAR and shared.
 *   - The canvas carries a text alternative saying what is drawn on it,
 *     including which layers are off — a switched-off layer is a fact about the
 *     picture and a reader who cannot see it would otherwise never learn it.
 */

import { el } from '../render/dom.js';
import { createSurface } from '../render/canvas.js';
import { drawPlan, groundspeedReadout, hitTestAircraft, upReference } from '../render/gauges/plan.js';
import { RADAR_RANGE_NM } from '../data/traffic.js';

/**
 * WHAT CAN BE SWITCHED, in the order a real ND's ARPT / WPT / DATA switches go:
 * the ground first, then what is on it, then what is flying over it.
 *
 * `basemap` is one switch for the whole ground rather than four, because
 * "coastline but not rivers" is a preference nobody has and four more buttons
 * is a row of chrome over the instrument.
 */
/**
 * EVERY NAME OPENS WITH THE VISIBLE TEXT (SC 2.5.3, "label in name"). These are
 * flight-deck abbreviations, so the spoken name has to CONTAIN the word on the
 * button or "tap ARPT" has no answer for anyone using voice control — and the
 * accessibility gate caught all four the first time this page was measured.
 *
 * Note the shape: `GND — ground …`, not `Ground …`. An `aria-label` that merely
 * mentions the abbreviation somewhere would pass a substring check by accident,
 * which is hub LESSONS §29 and cost a sibling app a release.
 */
export const MAP_LAYERS = [
  { id: 'basemap', label: 'GND', name: 'GND — ground: coastline, lakes, rivers and built-up areas' },
  { id: 'airports', label: 'ARPT', name: 'ARPT — airports and runways' },
  { id: 'traffic', label: 'TFC', name: 'TFC — traffic' },
  { id: 'track', label: 'TRK', name: 'TRK — the flown track of a followed aircraft' },
];

/**
 * What the canvas says it is showing. Pure and exported, so every sentence the
 * page can produce is testable without a browser — the same reason
 * `radarReadiness` and `crewAlerts` are.
 */
export function describeMap({ mode, up, count, rangeNm, off = [], basemapMissing = false, groundspeed = null, runwaysDropped = 0 }) {
  const parts = [`Map, ${mode === 'map' ? `${(up?.label ?? 'north up').toLowerCase()}` : 'north up and centred'}`];
  if (mode === 'map' && up?.reason) parts.push(up.reason);
  parts.push(`${rangeNm} nautical mile range`);
  /**
   * THE SAME FUNCTION DECIDES BOTH, so the corner and the sentence can never
   * disagree — the pattern `selectTape` established on the PFD, where the tape
   * and its spoken description once chose independently and could name
   * different speeds. Spelled out here because "GS 441" is a flight-deck
   * abbreviation and speech synthesis reads it as two letters.
   */
  const gs = groundspeedReadout(groundspeed);
  if (gs) parts.push(`groundspeed ${gs.kt} knots${gs.stale ? ', stale' : ''}`);
  parts.push(count === 1 ? '1 aircraft' : `${count} aircraft`);
  // A SWITCHED-OFF LAYER IS A FACT ABOUT THE PICTURE. Without this, a reader
  // using the panel by voice is told there are no aircraft on a map whose
  // traffic layer somebody turned off — which is a different thing entirely.
  if (off.length) parts.push(`${off.join(', ')} turned off`);
  if (basemapMissing) parts.push('the ground map is not loaded');
  // A TRUNCATED PICTURE SAYS SO. The range floors do the real decluttering and
  // are a stated policy; the count cap behind them is a backstop against a
  // dense metropolitan area, and a scope quietly showing a subset is the exact
  // defect the floors were added to fix.
  if (runwaysDropped > 0) parts.push(`${runwaysDropped} more runways are in range than the map draws at once`);
  return `${parts.join('. ')}.`;
}

export function createMap({ host, traffic, state, announcer, radar, mode = () => 'plan', setMode = () => {}, onFollow = null }) {
  const canvas = el('canvas', { class: 'map-canvas', role: 'img', 'aria-label': 'Map. Starting up.' });
  const surface = createSurface(canvas);

  /** Loaded once, lazily, and NEVER invented. A basemap that failed to load is
   *  a map with no ground on it and the page says so — it is not a reason to
   *  draw a coastline from somewhere else. */
  let basemap = null;
  let basemapFailed = null;

  const on = Object.fromEntries(MAP_LAYERS.map((l) => [l.id, true]));

  const layerButtons = MAP_LAYERS.map((l) => {
    const b = el('button', {
      class: 'map-layer',
      type: 'button',
      text: l.label,
      // The name says what it IS, not what pressing it does — `aria-pressed`
      // already carries the state, and "Hide traffic" on a control that is
      // about to say "pressed" is two answers to one question.
      'aria-label': l.name,
      'aria-pressed': 'true',
    });
    b.addEventListener('click', () => {
      on[l.id] = !on[l.id];
      b.setAttribute('aria-pressed', on[l.id] ? 'true' : 'false');
      announcer.say(`${l.name} ${on[l.id] ? 'on' : 'off'}`);
      draw();
    });
    return b;
  });

  const rangeButtons = RADAR_RANGE_NM.map((nm) => {
    const b = el('button', {
      class: 'map-range-btn',
      type: 'button',
      text: `${nm}`,
      'aria-label': `Range ${nm} nautical miles`,
      'aria-pressed': radar.rangeNm === nm ? 'true' : 'false',
    });
    // THE SAME SETTER every other surface uses. Two controls for one value is
    // fine; two copies of the value is how they disagree.
    b.addEventListener('click', () => radar.setRange(nm));
    return b;
  });
  radar.onRange((nm) => {
    for (const b of rangeButtons) b.setAttribute('aria-pressed', b.textContent === String(nm) ? 'true' : 'false');
  });

  /**
   * THE MODE SWITCH, ON THIS PAGE TOO.
   *
   * It shipped only on the PFD, which meant the whole point of the MAP page —
   * seeing the ground track-up across a full screen — was reachable only by
   * going to a different page, pressing a button there, and coming back. The
   * state is still ONE value shared with the PFD's switch; only the reach
   * changed, which is the same arrangement the range buttons already have.
   */
  const modeButtons = [
    { id: 'plan', label: 'PLAN', name: 'PLAN — centred and north up' },
    { id: 'map', label: 'MAP', name: 'MAP — turned to the direction of travel' },
  ].map((m) => {
    const b = el('button', {
      class: 'map-mode-btn',
      type: 'button',
      text: m.label,
      // The visible word OPENS the name (SC 2.5.3), so "tap MAP" has an answer.
      'aria-label': m.name,
      'aria-pressed': mode() === m.id ? 'true' : 'false',
    });
    b.addEventListener('click', () => {
      setMode(m.id);
      syncMode();
      announcer.say(m.name);
      draw();
    });
    return b;
  });
  const syncMode = () => {
    for (const b of modeButtons) b.setAttribute('aria-pressed', b.textContent === (mode() === 'map' ? 'MAP' : 'PLAN') ? 'true' : 'false');
  };

  const note = el('p', { class: 'map-note', role: 'status' });

  host.replaceChildren(
    el('section', { class: 'card map-card', 'aria-labelledby': 'map-h' }, [
      el('h2', { id: 'map-h', class: 'sr-only', text: 'Map' }),
      canvas,
      el('div', { class: 'map-controls' }, [
        el('div', { class: 'map-layers', role: 'group', 'aria-label': 'Map layers' }, layerButtons),
        el('div', { class: 'map-mode', role: 'group', 'aria-label': 'Map mode' }, modeButtons),
        el('div', { class: 'map-range', role: 'group', 'aria-label': 'Map range' }, rangeButtons),
      ]),
      note,
    ]),
  );

  /**
   * TAP AN AIRCRAFT TO FOLLOW IT — the thing this page looked like it did and
   * did not.
   *
   * The owner, on a real iPad with 275 aircraft on screen: tapping the map does
   * nothing. It was a straight omission — the RADAR page's scope has had this
   * since 1.7.0 and this canvas was built without it, so a page full of
   * tappable-looking marks answered no taps at all.
   *
   * IT USES `planGeometry` THROUGH `hitTestAircraft`, so the mark is hit exactly
   * where it was painted, in either mode. That is the whole reason the geometry
   * moved into one function: a hit test that computes its own centre is a hit
   * test that misses the moment the renderer's centre moves, and MAP mode moves
   * it to the bottom of the box.
   *
   * The RADAR page's "Heard right now" list remains the accessible route to the
   * same action, so this is an enhancement rather than the only way in.
   */
  canvas.addEventListener('click', (e) => {
    const view = traffic.view?.() ?? {};
    if (!view.centre || !onFollow) return;
    const aircraft = on.traffic ? view.aircraft ?? [] : [];
    if (!aircraft.length) return;
    const rect = canvas.getBoundingClientRect();
    const ndMode = mode();
    const hit = hitTestAircraft(
      aircraft,
      {
        centre: view.centre,
        rangeNm: view.rangeNm ?? 40,
        w: rect.width,
        h: rect.height,
        mode: ndMode,
        upDeg: ndMode === 'map' ? upReference(state.snapshot.fields, ndMode).upDeg : 0,
      },
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
    if (!hit) return;
    onFollow(hit);
    draw();
  });

  async function loadBasemap() {
    if (basemap || basemapFailed) return;
    try {
      const res = await fetch('/data/basemap.json', { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      basemap = await res.json();
    } catch (err) {
      // Stated, never substituted. A map with no ground is a worse map and an
      // honest one; a map with a coastline from somewhere unverified is not.
      basemapFailed = `The ground map did not load (${err.message}). Everything else is still drawn.`;
    }
    draw();
  }

  function draw() {
    surface.begin();
    const view = traffic.view?.() ?? {};
    if (!view.centre) {
      note.textContent = 'Waiting for a position to centre the map on.';
      canvas.setAttribute('aria-label', 'Map. Waiting for a position to centre on.');
      return;
    }
    const ndMode = mode();
    const up = upReference(state.snapshot.fields, ndMode);
    const aircraft = view.aircraft ?? [];

    /**
     * THE ONE PAGE THAT MAY SHOW GROUNDSPEED, because it is the one page with
     * no speed anywhere else on it. The PFD's inset has a speed tape inches
     * away and passes nothing — that is the duplication the rule forbids, and
     * `groundspeedReadout` carries the whole argument.
     *
     * Read straight from the store rather than from the traffic view, because
     * the store is where ownership already moves: following an aircraft writes
     * ITS groundspeed into this same field, or FAILs it with the reason. One
     * source owns the field, so one read is right in both modes.
     */
    const groundspeed = state.snapshot.fields['position.groundspeed'] ?? null;

    drawPlan(surface.ctx, {
      x: 0,
      y: 0,
      w: surface.width,
      h: surface.height,
      tokens: surface.tokens,
      centre: view.centre,
      aircraft,
      rangeNm: view.rangeNm ?? 40,
      followedHex: view.followedHex ?? null,
      fromFix: view.fromFix ?? false,
      ownAltFt: view.ownAltFt ?? null,
      trail: view.trail ?? [],
      runways: view.runways ?? [],
      readiness: view.readiness ?? null,
      mode: ndMode,
      up,
      wind: view.wind ?? null,
      basemap,
      layers: on,
      // THIS PAGE IS THE CHART, so its fields are named. The PFD's little scope
      // and the RADAR page are traffic displays and stay austere.
      airportIdents: true,
      groundspeed,
    });

    const off = MAP_LAYERS.filter((l) => !on[l.id]).map((l) => l.label);
    canvas.setAttribute(
      'aria-label',
      describeMap({
        mode: ndMode,
        up,
        count: on.traffic ? aircraft.length : 0,
        rangeNm: view.rangeNm ?? 40,
        off,
        basemapMissing: !basemap,
        groundspeed,
        // Set by `runwaysNear` when its backstop cap bit — see the comment there
        // about why it is non-enumerable and why it is reported rather than
        // swallowed.
        runwaysDropped: view.runways?.dropped ?? 0,
      }),
    );

    /**
     * THE CREDIT SAYS WHAT IT IS CREDITING.
     *
     * It read "Made with Natural Earth." on its own under a map full of
     * aircraft, and the owner's reaction was a question mark — fairly, because
     * that sentence names a thing without saying which thing it is about. Their
     * offered wording is kept verbatim and prefixed with the part that makes it
     * a sentence a reader can use.
     */
    note.textContent = basemapFailed
      ?? (basemap
        ? `Coastline, lakes, rivers and towns: ${basemap.source?.credit ?? 'Natural Earth.'} Public domain. Aircraft, runways and airports come from the sources in the (i) menu.`
        : 'Loading the ground map…');
  }

  return {
    root: host,
    measure() {
      surface.measure();
      loadBasemap();
    },
    refreshTokens() {
      surface.refreshTokens();
    },
    render() {
      syncMode();
      draw();
    },
  };
}
