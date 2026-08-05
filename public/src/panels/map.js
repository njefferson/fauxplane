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
import { drawPlan, upReference } from '../render/gauges/plan.js';
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
export function describeMap({ mode, up, count, rangeNm, off = [], basemapMissing = false }) {
  const parts = [`Map, ${mode === 'map' ? `${(up?.label ?? 'north up').toLowerCase()}` : 'north up and centred'}`];
  if (mode === 'map' && up?.reason) parts.push(up.reason);
  parts.push(`${rangeNm} nautical mile range`);
  parts.push(count === 1 ? '1 aircraft' : `${count} aircraft`);
  // A SWITCHED-OFF LAYER IS A FACT ABOUT THE PICTURE. Without this, a reader
  // using the panel by voice is told there are no aircraft on a map whose
  // traffic layer somebody turned off — which is a different thing entirely.
  if (off.length) parts.push(`${off.join(', ')} turned off`);
  if (basemapMissing) parts.push('the ground map is not loaded');
  return `${parts.join('. ')}.`;
}

export function createMap({ host, traffic, state, announcer, radar, mode = () => 'plan' }) {
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

  const note = el('p', { class: 'map-note', role: 'status' });

  host.replaceChildren(
    el('section', { class: 'card map-card', 'aria-labelledby': 'map-h' }, [
      el('h2', { id: 'map-h', class: 'sr-only', text: 'Map' }),
      canvas,
      el('div', { class: 'map-controls' }, [
        el('div', { class: 'map-layers', role: 'group', 'aria-label': 'Map layers' }, layerButtons),
        el('div', { class: 'map-range', role: 'group', 'aria-label': 'Map range' }, rangeButtons),
      ]),
      note,
    ]),
  );

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
    });

    const off = MAP_LAYERS.filter((l) => !on[l.id]).map((l) => l.label);
    canvas.setAttribute(
      'aria-label',
      describeMap({ mode: ndMode, up, count: on.traffic ? aircraft.length : 0, rangeNm: view.rangeNm ?? 40, off, basemapMissing: !basemap }),
    );

    // The credit. Natural Earth say it is unnecessary and offer the wording;
    // a panel whose contract is that values trace to a source names it anyway.
    note.textContent = basemapFailed ?? (basemap ? basemap.source?.credit ?? '' : 'Loading the ground map…');
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
      draw();
    },
  };
}
