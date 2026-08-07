/**
 * radar.js — live aircraft near here, and the flight-number lookup.
 *
 * THIS IS THE PAGE THAT IS ALIVE ON A DESK. Everything else in the panel is
 * driven by a device clamped indoors and not moving, so the tapes are honestly
 * crossed out. Real aircraft overhead need no motion from the device at all —
 * only a network — which makes this the one page a stationary cockpit shows in
 * full.
 *
 * ATTRIBUTION IS A REQUIREMENT, NOT A COURTESY. adsb.fi's terms say: "You must
 * cite adsb.fi and include a link to our home page"; adsb.lol publish under
 * ODbL, which also requires attribution. BOTH the name and the link come from
 * the response, so the panel credits whichever provider actually served the
 * data rather than whichever was tried first. That link is rendered here
 * from the attribution the API response itself carries, so the citation
 * travels with the data rather than being a constant in a client that could
 * drift away from whoever is actually being called.
 *
 * ACCESSIBILITY OF THE CONTROLS, declared before the code (Doctrine §4):
 *   - The aircraft list is REAL BUTTONS in the DOM, not canvas hit-testing.
 *     The plan view is a picture of the list, and the list is the interface.
 *   - Nothing is drag-only and there is no timed gesture anywhere.
 *   - The canvas carries an aria-label describing what is on it, kept current.
 *   - The range control is a set of radio-like buttons, each with a real label.
 */

import { el } from '../render/dom.js';
import { createSurface } from '../render/canvas.js';
import { drawPlan, altLabel, hitTestAircraft } from '../render/gauges/plan.js';
import { ALTITUDE_BANDS, RADAR_RANGE_NM, airframeGroups, explainTrafficRefusal, filterByAirframe, ownAltitudeFt, radarReadiness, withinBand } from '../data/traffic.js';
import { formatAge } from '../core/units.js';
import { loadNavdata, parseLatLon, runwaysNear, searchAirports } from '../data/navdata.js';
import { insideBundle, queryCentre } from '../data/position.js';

const fmt = (v, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

export function createRadar({
  host,
  traffic,
  announcer,
  onFollowChange = () => {},
  onCentreChange = () => {},
  /**
   * Seconds until the app next ASKS the feed, or null when it does not know.
   * A thunk because the schedule lives in app.js and moves every tick — and
   * because this panel is built before the poller exists.
   */
  nextAttemptInS = () => null,
  /** Only for ageing the "heard Ns ago" phrase when readiness is asked for from
   *  a page this panel is not rendering. `render` has the snapshot's own clock. */
  clock = () => Date.now(),
}) {
  let rangeNm = RADAR_RANGE_NM[2];
  let lastDrawnAt = 0;
  /** The most recent fields `render` was handed. This panel is built before the
   *  store exists and is never given it, so the position it reasons about comes
   *  in with the frame rather than being fetched. */
  let lastFields = {};

  const canvas = el('canvas', {
    class: 'radar-canvas',
    role: 'img',
    'aria-label': 'Traffic plan view. Waiting for the first sweep.',
  });
  const surface = createSurface(canvas);

  const status = el('p', { class: 'radar-status', role: 'status', 'aria-live': 'polite', text: 'Waiting for the first sweep.' });
  /**
   * THE STATE OF THE SCOPE, AT A GLANCE (the owner, 2026-08-04).
   *
   * `aria-hidden` because every word in it is already in `status`, which is
   * the live region — announcing both would read the same state twice to a
   * screen reader. This is the SEEN copy; `status` is the SPOKEN one.
   */
  const readyChip = el('p', { class: 'radar-ready', 'aria-hidden': 'true', text: 'LISTENING' });

  /**
   * THE FEED'S STATE, COMPUTED ON DEMAND RATHER THAN CACHED BY `render`.
   *
   * It used to be a variable assigned inside `render`, which only runs while
   * RADAR is the visible page — so on the PFD it was whatever RADAR last left
   * behind, and on a fresh load it was `{ tappable: false }` with no state at
   * all. The navigation display's feed flag, added in 1.29.1 precisely so the
   * PFD would stop being silent about a refused feed, was therefore silent
   * about a refused feed until the reader visited RADAR — the exact defect it
   * was written to fix, reintroduced by where the value was kept.
   *
   * Found by the accessibility gate while measuring the crew alerting strip,
   * which asked for the traffic state on a page RADAR had never rendered.
   *
   * Computing it here keeps the function's own rule — ONE computation, read by
   * the chip, the tap handler, the ND flag and EICAS. Four readers of one fact
   * is fine; four copies of it is how they come to disagree.
   */
  const computeReadiness = () => {
    const result = traffic.last;
    return radarReadiness({
      result,
      aircraft: withinBand(traffic.nearby, lastOwnAltFt, bandId),
      nearbyAt: result?.nearbyAt ?? null,
      now: clock(),
      following: traffic.followLabel,
      nextAttemptInS: nextAttemptInS(),
    });
  };
  const list = el('div', { class: 'radar-list', role: 'group', 'aria-label': 'Aircraft heard, nearest first', tabindex: '0' });
  /** Outside the scroller on purpose: a "scroll for more" that itself scrolls
   *  out of view is the one place it must not be. */
  const foot = el('p', { class: 'radar-list-foot', role: 'status', hidden: '' });
  /**
   * THE LIST ANSWERS BESIDE THE LIST.
   *
   * There are THREE ways to start following — the form, a tap on the scope, and
   * a press on a row in this list — and they are in three different cards. The
   * confirmation was written to the form's note every time, which is the card
   * ABOVE this one: press a row and the answer appears off the top of the
   * screen, in a place you were not looking, for a thing you did from here.
   *
   * The same defect as the value strip and as the readiness chip, in a third
   * costume: a message that lives where it was convenient to put it rather than
   * where the press happened.
   */
  const listNote = el('p', { class: 'radar-list-note', role: 'status', 'aria-live': 'polite' });
  const followNote = el('p', { class: 'radar-follow-note' });
  /**
   * THE AIRFRAME PICKER.
   *
   * So it offers exactly what is overhead AT THIS MOMENT, rebuilt every sweep,
   * and selecting one filters THIS list — the scope keeps drawing every
   * aircraft, because a plan view that hides traffic is a plan view that lies
   * about the sky.
   */
  /**
   * THE ALTITUDE BAND — the real de-clutter a flight deck uses.
   *
   * Defaults to ALL, which is NOT a real TCAS setting and is labelled as ours.
   * The panel spends most of its life on a desk at a few hundred feet, where
   * NORM would correctly hide every airliner overhead: realistic, and useless
   * for someone who wants to see what is up there. Offer the real bands, marked
   * as real, and default to the one that serves the reader.
   */
  let bandId = 'ALL';
  /** Own altitude as of the last render. The click handler has no snapshot of
   *  its own, and recomputing from a stale one would filter the tap against a
   *  different set than the one on screen. */
  let lastOwnAltFt = null;
  const bandHost = el('div', { class: 'radar-band', role: 'group', 'aria-label': 'Traffic altitude band' });

  /**
   * THE CENTRE PICKER (
   * ).
   *
   * The airports are BUNDLED — OurAirports, public domain, 702 of them for this
   * region in 317 KB. That is not only convenient: a dataset in the repo cannot
   * be rate limited, which is what has been breaking the live feed all day.
   */
  let airports = [];
  /** The whole bundle, kept because the RUNWAYS are drawn from it too. */
  let navdata = null;
  /** Recomputed only when the centre or the range actually moves — this runs
   *  inside a 25 Hz draw and scanning 407 runways every frame is heat. */
  let runwayCache = { key: '', list: [] };
  const currentRunways = (centre) => {
    if (!navdata || !centre) return [];
    const key = `${centre.lat.toFixed(3)},${centre.lon.toFixed(3)},${rangeNm}`;
    if (key !== runwayCache.key) runwayCache = { key, list: runwaysNear(navdata, centre, rangeNm) };
    return runwayCache.list;
  };
  const centreInput = el('input', {
    class: 'radar-centre-input',
    type: 'search',
    id: 'radar-centre',
    placeholder: 'KSMF, Sacramento, or 38.68, -121.00',
    autocomplete: 'off',
    'aria-describedby': 'radar-centre-note',
  });
  /**
   * A GROUP OF BUTTONS, not a `listbox`.
   *
   * The first draft claimed `role="listbox"` with `role="option"` children,
   * which is a lie in the accessibility tree: that role promises arrow-key
   * navigation and a roving tabindex, and these are plain buttons that a reader
   * tabs through. Claiming a widget behaviour the code does not implement is
   * the same class of defect as a synthetic reading — the label says one thing
   * and the machinery does another. A labelled group of buttons is what this
   * actually is, and it is fully usable by keyboard because buttons are.
   */
  const centreList = el('div', { class: 'radar-centre-list', role: 'group', 'aria-label': 'Matching airports' });
  /** What the box says before anyone has typed. Restored whenever it empties. */
  const centreHint = 'Type at least two letters. Without one, the scope stays on this device.';
  const centreNote = el('p', { class: 'radar-centre-note', id: 'radar-centre-note', role: 'status', text: centreHint });
  const centreClear = el('button', {
    class: 'radar-centre-clear',
    type: 'button',
    text: 'Back to my position',
    hidden: '',
  });

  const picker = el('div', { class: 'radar-picker', role: 'group', 'aria-label': 'Filter the list by airframe' });
  /** null = every aircraft. Otherwise an id from airframeGroups. */
  let airframe = null;

  // --- the flight-number box ------------------------------------------------
  const input = el('input', {
    class: 'radar-input',
    id: 'radar-callsign',
    type: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: '8',
    placeholder: 'UAL328',
    'aria-describedby': 'radar-callsign-help',
  });
  const followBtn = el('button', { class: 'radar-go', type: 'submit', text: 'Follow this flight' });
  const stopBtn = el('button', { class: 'radar-stop', type: 'button', text: 'Stop following', hidden: 'hidden' });

  /**
   * THE FORM ANSWERS BESIDE THE FORM.
   *
   * It
   * did — it wrote to `status`, which sits ABOVE THE SCOPE, several hundred
   * pixels off the top of the screen at the moment your thumb is on the button
   * at the bottom. An empty box produced a sentence nobody could see.
   *
   * It also overwrote the traffic feed's own line, so an input typo replaced
   * "86 aircraft within 40 nm" with a spelling lesson.
   */
  const formNote = el('p', { class: 'radar-form-note', role: 'status', 'aria-live': 'polite' });

  const submit = (e) => {
    e.preventDefault();
    const value = input.value.trim().toUpperCase();
    if (!value) {
      formNote.textContent = 'Type a flight number first, or tap an aircraft on the scope or in the list below.';
      return;
    }
    if (!/^[A-Z0-9]{2,8}$/.test(value)) {
      formNote.textContent = `“${value}” is not a flight number — 2 to 8 letters or digits, the ICAO form like UAL328 rather than UA328.`;
      return;
    }
    formNote.textContent = '';
    startFollowing({ callsign: value });
  };

  const form = el('form', { class: 'radar-form', onsubmit: submit }, [
    el('label', { class: 'radar-label', for: 'radar-callsign', text: 'Follow a flight number' }),
    el('div', { class: 'radar-form-row' }, [input, followBtn, stopBtn]),
    el('p', {
      class: 'radar-help',
      id: 'radar-callsign-help',
      text:
        'The ICAO callsign, which is what an aircraft actually transmits: UAL328, not UA328. ' +
        'The panel then shows what that aircraft is broadcasting — position, altitude, speed and vertical rate — and crosses out everything ADS-B does not carry.',
    }),
  ]);

  /**
   * `from` NAMES THE SURFACE THAT WAS PRESSED — 'form', 'scope' or 'list' — so
   * the confirmation lands next to it rather than always in the form's card.
   * The scope's own answer is the FOLLOWING chip directly under it, which is
   * already adjacent, so a tap there needs no extra line.
   */
  const startFollowing = (key, from = 'form') => {
    traffic.follow(key);
    stopBtn.hidden = false;
    const said = `Following ${key.callsign ?? key.hex}. Open PFD to see its instruments.`;
    formNote.textContent = from === 'form' ? said : '';
    listNote.textContent = from === 'list' ? said : '';
    announcer.say(`Following ${key.callsign ?? key.hex}. The panel is now showing that aircraft, not this device.`);
    onFollowChange();
    renderFollowNote();
  };

  // TAP AN AIRCRAFT TO FOLLOW IT (
  // ). The tap fills the follow box AND follows, through
  // the same startFollowing the form uses — and the "Heard right now" list
  // remains the accessible route to exactly the same action, so the canvas tap
  // is an enhancement rather than the only way.
  canvas.addEventListener('click', (e) => {
    const result = traffic.last;
    // THE SAME PREDICATE THE CHIP SHOWS. Asking a second question here is how
    // an indicator that says "tap to follow" ends up on a scope that ignores
    // taps — two opinions about one fact, which is hub LESSONS 42.
    if (!computeReadiness().tappable || !result?.centre) return;
    const rect = canvas.getBoundingClientRect();
    // THE SAME SET THE SCOPE IS DRAWING. Hit-testing the unfiltered list would
    // follow an aircraft the band is hiding — a tap on empty space picking
    // something invisible.
    const hit = hitTestAircraft(
      withinBand(traffic.nearby, lastOwnAltFt, bandId),
      { centre: result.centre, rangeNm, w: rect.width, h: rect.height },
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
    if (!hit) return;
    const key = hit.callsign ?? hit.registration ?? hit.hex.toUpperCase();
    input.value = key;
    startFollowing(hit.callsign ? { callsign: hit.callsign } : { hex: hit.hex }, 'scope');
  });

  stopBtn.addEventListener('click', () => {
    traffic.unfollow();
    stopBtn.hidden = true;
    input.value = '';
    announcer.say('Stopped following. The panel is back on this device’s own sensors.');
    onFollowChange();
    renderFollowNote();
  });

  // --- range ---------------------------------------------------------------
  // ONE implementation, notified everywhere. The PFD's navigation display now
  // carries its own range buttons (
  // ), and two controls for one value is fine — two
  // copies of the value is how they disagree. Every surface calls setRange and
  // every surface hears about it.
  const rangeListeners = [];
  const setRange = (nm) => {
    if (!RADAR_RANGE_NM.includes(nm)) return;
    rangeNm = nm;
    for (const b of rangeButtons) b.setAttribute('aria-pressed', b.textContent === `${nm} nm` ? 'true' : 'false');
    for (const fn of rangeListeners) fn(nm);
    announcer.say(`Radar range ${nm} nautical miles`);
  };
  const setCentre = (place) => {
    traffic.setCentre(place);
    centreClear.hidden = !place;
    centreList.replaceChildren();
    centreNote.textContent = place
      ? `Centred on ${place.label}.`
      : 'Centred on this device again.';
    if (place) centreInput.value = place.label;
    else centreInput.value = '';
    announcer.say(centreNote.textContent);
    // The centre changed, so the fetch must too — the aircraft around a chosen
    // airport are a different set from the ones around here.
    onCentreChange();
  };

  const renderMatches = () => {
    const q = centreInput.value;
    const coord = parseLatLon(q);
    if (coord) {
      centreList.replaceChildren(
        el('button', {
          class: 'radar-centre-hit',
          type: 'button',
          text: `Use ${coord.lat.toFixed(3)}, ${coord.lon.toFixed(3)}`,
          onclick: () =>
            setCentre({
              ...coord,
              label: `${coord.lat.toFixed(3)}, ${coord.lon.toFixed(3)}`,
              // What fits under the crosshair. A typed position has no name, so
              // it gets the coarse degrees rather than a made-up waypoint code.
              short: `${coord.lat.toFixed(1)}/${coord.lon.toFixed(1)}`,
            }),
        }),
      );
      // The note is this control's live region, so the count reaches a reader
      // who cannot see the list appear underneath the box.
      centreNote.textContent = 'That reads as a coordinate. Press it to move the scope there.';
      return;
    }
    /**
     * FIVE, NOT EIGHT. "sacra" matches eight fields around Sacramento, and eight
     * buttons on a phone pushed the scope itself off the bottom of the screen —
     * a picker that hides the instrument it aims is the wrong trade. Five fills
     * the space above the range buttons and no more, and typing another letter
     * is how a reader reaches the sixth.
     */
    const hits = searchAirports(airports, q, 5);
    centreList.replaceChildren(
      ...hits.map((a) =>
        el('button', {
          class: 'radar-centre-hit',
          type: 'button',
          // The code AND the name: a reader who typed a code wants to confirm
          // it, and one who typed a town needs to tell two fields apart.
          text: `${a.ident} — ${a.name}${a.municipality ? `, ${a.municipality}` : ''}`,
          onclick: () => setCentre({ lat: a.lat, lon: a.lon, label: `${a.ident} ${a.name}`, short: a.ident }),
        }),
      ),
    );
    if (q.trim().length < 2) centreNote.textContent = centreHint;
    /**
     * "NOT FOUND" AND "NOT IN THE BUNDLE" ARE DIFFERENT ANSWERS.
     *
     * The airport database is clipped to one region on purpose — it works with
     * the radio off and cannot be rate limited — but a reader in Denver typing
     * DEN is told their spelling is wrong. They will try again, and again, and
     * conclude the picker is broken rather than that it is regional.
     *
     * Said only when we are actually OUTSIDE it, so nobody standing inside the
     * region is given a regional excuse for a genuine typo. `insideBundle`
     * returns null when the bundle has not loaded, and null is not "outside".
     */
    else if (!hits.length && outsideBundle()) {
      centreNote.textContent = `Nothing matches “${q.trim()}”. The built-in airport list covers Northern California only, and you are outside it — a coordinate like 39.74, -104.99 works anywhere.`;
    } else if (!hits.length) centreNote.textContent = `Nothing matches “${q.trim()}”. Try an airport code, a town, or a coordinate.`;
    else if (hits.length === 5) centreNote.textContent = 'The five best matches. Type another letter to narrow it.';
    else centreNote.textContent = `${hits.length} match${hits.length === 1 ? '' : 'es'}. Press one to move the scope.`;
  };
  /** Where the READER is, not where the scope is pointed — someone who has
   *  already moved the scope to a California field is still in Denver, and it
   *  is their position that decides whether the bundle covers them. */
  const outsideBundle = () => insideBundle(queryCentre(lastFields), navdata?.meta?.bbox) === false;

  centreInput.addEventListener('input', renderMatches);
  centreClear.addEventListener('click', () => setCentre(null));

  // The airports load once, lazily, and a failure is SAID rather than silent —
  // an empty picker with no explanation reads as "there are no airports".
  /**
   * loadNavdata RESOLVES ON FAILURE — `{ ok: false, reason }` — and puts the
   * bundle under `.data`, not at the top level. The first draft read `d.airports`
   * and hung a `.catch` off the promise, so a perfectly loaded 702-airport file
   * produced an empty picker and the message "the airport list is empty", while
   * the catch that was supposed to explain it could never run. Read the shape
   * the function actually returns, and say its own reason when it says no.
   */
  loadNavdata().then((d) => {
    if (!d?.ok) {
      centreNote.textContent = `Airport list unavailable — ${d?.reason ?? 'unknown reason'}. You can still type a coordinate.`;
      return;
    }
    navdata = d.data ?? null;
    airports = navdata?.airports ?? [];
    if (!airports.length) centreNote.textContent = 'The airport list loaded but is empty; you can still type a coordinate.';
    // Someone who typed while it was still loading got "nothing matches" from
    // an empty array. Re-run against the list that has now arrived.
    else if (centreInput.value.trim()) renderMatches();
  });

  const setBand = (id) => {
    bandId = id;
    for (const b of bandButtons) b.setAttribute('aria-pressed', b.dataset.band === id ? 'true' : 'false');
    lastKeys = '';
    lastPickerKey = '';
    const band = ALTITUDE_BANDS.find((b) => b.id === id);
    announcer.say(
      band?.real
        ? `Traffic band ${band.label}: aircraft within ${band.above} feet above and ${band.below} feet below, airborne only.`
        : 'Showing every altitude, including aircraft on the ground. A real flight deck has no such setting.',
    );
  };
  const bandButtons = ALTITUDE_BANDS.map((b) =>
    el('button', {
      class: 'radar-band-btn',
      type: 'button',
      dataset: { band: b.id },
      // The one that is NOT a real flight-deck setting says so, rather than
      // sitting in the row pretending to be one.
      // A FILTER THAT REMOVES SOMETHING SAYS SO. The real bands drop aircraft on
      // the ground, which is what TCAS does and is invisible unless stated.
      title: b.real
        ? `TCAS ${b.label}: +${b.above} / −${b.below} ft, airborne traffic only`
        : 'Not a real flight-deck setting — ours. Every altitude, including aircraft on the ground.',
      text: b.real ? b.label : 'ALL*',
      'aria-pressed': b.id === bandId ? 'true' : 'false',
      onclick: () => setBand(b.id),
    }),
  );
  bandHost.replaceChildren(...bandButtons);

  const rangeButtons = RADAR_RANGE_NM.map((nm) =>
    el('button', {
      class: 'radar-range-btn',
      type: 'button',
      text: `${nm} nm`,
      'aria-pressed': nm === rangeNm ? 'true' : 'false',
      onclick: () => setRange(nm),
    }),
  );

  const attribution = el('p', { class: 'radar-credit' });

  host.replaceChildren(
    el('section', { class: 'card radar-card' }, [
      el('h2', { class: 'card-title', text: 'Traffic' }),
      /**
       * THE SCOPE COMES FIRST.
       *
       * The centre picker is a label, a text field and a two-line hint — and it
       * sat ABOVE the instrument, so on a phone the scope began past the
       * half-way point and ran off the bottom. It is a SETUP action, used once
       * to aim the thing; range and band are used WHILE looking at it, so they
       * stay above. The picker moved below the scope rather than being made
       * smaller, because shrinking a control to make room is how it becomes
       * unreadable instead of merely lower down.
       */
      el('div', { class: 'radar-range', role: 'group', 'aria-label': 'Plan view range' }, rangeButtons),
      bandHost,
      /**
       * THE STATE AND ITS EXPLANATION ARE ONE THING, so they sit together.
       *
       * The chip was above the scope and the sentence explaining it was below —
       * separated by the whole instrument, on a phone that means scrolling past
       * the scope to find out what `NO CONTACT · RETRY 6s` meant. Two halves of
       * one message, and the reader had to hold the first in their head while
       * they went looking for the second.
       *
       * THEY MOVED DOWN TO THE SENTENCE, NOT THE OTHER WAY. Lifting the text up
       * was tried first and the a11y gate refused it: at 200% text it put 16rem
       * of controls above the scope against a 13rem ceiling — the instrument
       * pushed down the page to unify a caption. Bringing the chip down instead
       * costs the instrument nothing and RAISES it, because the chip's own row
       * leaves the space above.
       *
       * The PFD's navigation display now carries the same state as a flag drawn
       * on the canvas, so the fact is not confined to this page.
       */
      canvas,
      readyChip,
      status,
      attribution,
      el('div', { class: 'radar-centre' }, [
        el('label', { class: 'radar-centre-label', for: 'radar-centre', text: 'Centre the scope on' }),
        el('div', { class: 'radar-centre-row' }, [centreInput, centreClear]),
        centreList,
        centreNote,
      ]),
    ]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: 'Follow a flight' }), form, followNote]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: 'Heard right now' }), picker, list, foot, listNote]),
  );

  function renderFollowNote() {
    const label = traffic.followLabel;
    if (!label) {
      followNote.textContent = '';
      followNote.dataset.state = 'off';
      return;
    }
    followNote.dataset.state = traffic.followError ? 'waiting' : 'on';
    followNote.textContent = traffic.followError
      ? `${label}: ${traffic.followError}`
      : `The panel is following ${label}. Pitch, slip, airspeed and indicated altitude stay crossed out — ADS-B does not carry them.`;
  }

  /**
   * Rebuild the picker for the airframes currently in range.
   *
   * Only rebuilt when the SET of ids or counts changes, for the same reason the
   * list is: replacing a button under a finger already moving toward it is a
   * pointer-cancellation failure, and this row changes every few seconds.
   */
  let lastPickerKey = '';
  /** Labels of ids seen recently, so a group that has GONE can still be named
   *  in the announcement that releases it. */
  const lastLabels = new Map();
  /** The aircraft list is rebuilt only when the SET changes, so a row a finger
   *  is already moving toward does not get replaced underneath it. */
  let lastKeys = '';

  function renderPicker(aircraft) {
    const groups = airframeGroups(aircraft);

    // A SELECTION THAT HAS FLOWN AWAY IS RELEASED, AND SAID OUT LOUD. Types are
    // "currently in range only", so an aircraft leaving can remove the very
    // button that is selected. Silently keeping the filter would show an empty
    // list under a control that no longer exists, and the reader would read
    // that as "nothing up there".
    if (airframe !== null && !groups.some((g) => g.id === airframe)) {
      const gone = lastLabels.get(airframe) ?? airframe;
      airframe = null;
      announcer.say(`No ${gone} in range any more. Showing every aircraft.`);
    }
    for (const g of groups) lastLabels.set(g.id, g.label);

    const key = `${airframe}|${groups.map((g) => `${g.id}:${g.count}`).join(',')}`;
    if (key === lastPickerKey) return;
    lastPickerKey = key;

    if (groups.length < 2) {
      // One airframe (or none) is not a choice. An "All" button on its own is
      // a control that cannot do anything.
      picker.replaceChildren();
      return;
    }

    const button = (id, label, count) =>
      el('button', {
        class: 'radar-pick',
        type: 'button',
        'aria-pressed': airframe === id ? 'true' : 'false',
        text: `${label} (${count})`,
        onclick: () => {
          airframe = id;
          lastPickerKey = '';
          lastKeys = '';
          renderPicker(traffic.nearby);
          renderList(traffic.nearby);
          announcer.say(id === null ? 'Showing every aircraft.' : `Showing ${label} only.`);
        },
      });

    picker.replaceChildren(
      button(null, 'All', aircraft.length),
      ...groups.map((g) => button(g.id, g.label, g.count)),
    );
  }
  function renderList(all) {
    const aircraft = filterByAirframe(all, airframe);
    const keys = aircraft.map((a) => a.hex).join(',');
    if (keys === lastKeys) {
      // Same aircraft, new numbers: update text in place.
      for (const a of aircraft) {
        const node = list.querySelector(`[data-hex="${a.hex}"] .radar-row-detail`);
        if (node) node.textContent = rowDetail(a);
      }
      return;
    }
    lastKeys = keys;

    if (!aircraft.length) {
      // Two different facts, and conflating them would be the panel lying about
      // the sky: an empty scope and a filter that matches nothing look the same
      // and mean completely different things.
      const text =
        airframe === null
          ? 'Nothing being heard within this range right now.'
          : `Nothing of that airframe within this range right now — ${all.length} other aircraft are being heard.`;
      list.replaceChildren(el('p', { class: 'radar-empty', text }));
      return;
    }

    /**
     * THE LIST SAYS IT IS A LIST, AND SAYS WHAT IS BELOW THE FOLD.
     *
     * It always scrolled —
     * `max-height: 22rem; overflow-y: auto` — but iOS hides a scrollbar until
     * something is actually scrolling, so a list of fifteen ended mid-row at
     * the container edge with nothing to suggest there was more. The filter
     * chip said "All (15)" and seven were on screen; there was no way to know
     * whether the other eight were hidden or simply not there.
     *
     * So the count is stated in words above the rows, and the number still
     * below the fold is stated under them. Both are plain text a screen reader
     * reads too, rather than a scrollbar nobody can see and a gradient nobody
     * can interpret.
     */
    const shown = aircraft.slice(0, 24);
    const head = el('p', {
      class: 'radar-list-head',
      text:
        shown.length === all.length
          ? `${all.length} aircraft, nearest first. Press one to follow it.`
          : `${shown.length} of ${all.length} aircraft, nearest first. Press one to follow it.`,
    });

    list.replaceChildren(
      head,
      ...shown.map((a) => {
        const name = a.callsign ?? a.registration ?? a.hex.toUpperCase();
        const row = el(
          'button',
          {
            class: 'radar-row',
            type: 'button',
            dataset: { hex: a.hex },
            /**
             * FILLS THE BOX TOO.
             * He was right — the canvas tap set the input and this
             * one did not, so the same action left the page in two different
             * states depending on which surface you touched it from.
             */
            onclick: () => {
              const key = a.callsign ?? a.registration ?? a.hex.toUpperCase();
              input.value = key;
              startFollowing(a.callsign ? { callsign: a.callsign } : { hex: a.hex }, 'list');
            },
          },
          [
            el('span', { class: 'radar-row-name', text: name }),
            el('span', { class: 'radar-row-detail', text: rowDetail(a) }),
          ],
        );
        return row;
      }),
    );
    requestAnimationFrame(measureList);
  }

  /**
   * HOW MANY ROWS ARE OFF THE BOTTOM, AND WHERE THE LIST SHOULD END.
   *
   * Two faults,
   * and the first one is why the second was so hard to look at.
   *
   * IT SAID "19 more below" WITH 19 AIRCRAFT IN TOTAL AND SEVEN ON SCREEN. The
   * count was taken in one `requestAnimationFrame` after the rows were added,
   * and the panel renders the list whenever the feed answers — including while
   * the RADAR page is `hidden`, where every element measures zero. With
   * `clientHeight` at 0 EVERY row is "below the fold", so the count equals the
   * total, and it stays that way until something happens to re-render. A number
   * measured on an unlaid-out element is not a small error, it is a different
   * quantity.
   *
   * So: refuse to answer when there is no layout to measure, and re-measure on
   * the two events that change the answer — the reader scrolling, and the list
   * getting a size (which is what happens the moment the page stops being
   * hidden).
   *
   * AND THE LIST ENDS ON A ROW BOUNDARY. A fixed `max-height` cuts whichever row
   * happens to straddle it, and a row sliced through its own text against a hard
   * container edge reads as broken rather than as scrollable — the same
   * complaint, in the same session, as the value strip under the horizon. The
   * cap is now the tallest whole run of rows that fits inside it, measured, so
   * the edge always falls in a gap.
   */
  function measureList() {
    const rows = [...list.querySelectorAll('.radar-row')];
    // No layout, no answer. Never a count computed against a zero height.
    if (!rows.length || !list.clientHeight) {
      foot.textContent = '';
      foot.hidden = true;
      return;
    }
    if (!list.dataset.capped) {
      const budget = LIST_MAX_PX();
      let fits = 0;
      for (const r of rows) {
        if (r.offsetTop + r.offsetHeight > budget) break;
        fits += 1;
      }
      // At least one row, or a tall row on a small screen leaves an empty box.
      const last = rows[Math.max(0, fits - 1)];
      list.style.maxHeight = `${last.offsetTop + last.offsetHeight}px`;
      list.dataset.capped = 'yes';
    }
    const hidden = rows.filter(
      (r) => r.offsetTop + r.offsetHeight > list.scrollTop + list.clientHeight + 2,
    ).length;
    foot.textContent = hidden > 0 ? `${hidden} more below — scroll the list` : '';
    foot.hidden = hidden === 0;
  }

  /** The cap the stylesheet would have applied, read from the element itself. */
  function LIST_MAX_PX() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return 22 * rem;
  }

  /*
   * THE TWO EVENTS THAT CHANGE THE ANSWER.
   *
   * Scrolling changes how many rows are below the fold. A resize is what
   * happens when the RADAR page stops being `hidden` and the list gets a
   * height for the first time — which is the exact moment the stale
   * "19 more below" was computed against, and never revisited.
   *
   * ResizeObserver rather than a tab-change hook: it fires for the page
   * appearing, for the device rotating, and for the reader changing their text
   * size, and it cannot drift out of step with a list it is watching directly.
   */
  list.addEventListener('scroll', () => measureList(), { passive: true });
  if (typeof ResizeObserver === 'function') {
    /*
     * IT MUST NOT RETRIGGER ITSELF. The first version of this cleared the cap
     * and blanked `max-height` before re-measuring — which resizes the very
     * element being observed, on every notification, forever. That is precisely
     * the "ResizeObserver loop completed with undelivered notifications"
     * warning this app already logs on an iPad, and writing a second source of
     * it while the first is still unexplained would have made the original
     * impossible to find.
     *
     * `measureList` sets the cap only when it is not already set, so the one
     * resize it causes settles on the next notification and stops.
     */
    new ResizeObserver(() => measureList()).observe(list);
  }

  function rowDetail(a) {
    const bits = [];
    if (Number.isFinite(a.distanceNm)) bits.push(`${fmt(a.distanceNm, 1)} nm`);
    if (Number.isFinite(a.bearingDeg)) bits.push(`${String(Math.round(a.bearingDeg)).padStart(3, '0')}°`);
    const alt = altLabel(a);
    if (alt) bits.push(alt);
    if (Number.isFinite(a.groundspeedKt)) bits.push(`${Math.round(a.groundspeedKt)} kt`);
    if (a.type) bits.push(a.type);
    return bits.join(' · ');
  }

  return {
    get rangeNm() {
      return rangeNm;
    },
    /** The runways currently on the scope, so the PFD's navigation display
     *  draws the same ones rather than computing its own set. */
    get runways() {
      return runwayCache.list;
    },
    /**
     * THE FEED'S STATE, so the PFD's navigation display can carry the same flag.
     *
     * It had none: the same scope, drawn from the same data, said NO CONTACT on
     * one page and nothing at all on the other. Exposed rather than recomputed,
     * for the reason the comment above gives about runways — two pictures of one
     * truth is how they come to disagree.
     */
    get readiness() {
      return computeReadiness();
    },
    /**
     * FOLLOW AN AIRCRAFT FROM ANOTHER SURFACE, through the same entry point the
     * form, the scope tap and the list all use.
     *
     * The MAP page needs it, and the alternative — a second `traffic.follow`
     * call over there — is how two ways of following the same aeroplane end up
     * doing different things to the Stop button, the note and the announcement.
     * `from: 'scope'` so no note is written on THIS page for something pressed
     * on another one; the confirmation belongs where the press happened.
     */
    followAircraft(a) {
      if (!a) return;
      startFollowing(a.callsign ? { callsign: a.callsign } : { hex: a.hex }, 'scope');
    },
    setRange,
    /** Hear about every range change, whichever surface made it. */
    onRange(fn) {
      rangeListeners.push(fn);
    },
    measure() {
      surface.measure();
    },
    refreshTokens() {
      surface.refreshTokens();
    },

    render(snapshot) {
      lastFields = snapshot.fields;
      const result = traffic.last;
      // OWN ALTITUDE FIRST — every relative number and the band depend on it,
      // and while following an aircraft "own" is that aircraft.
      const ownAltFt = ownAltitudeFt(snapshot.fields, traffic.followed);
      lastOwnAltFt = ownAltFt;
      const aircraft = withinBand(traffic.nearby, ownAltFt, bandId);

      // ONE COMPUTATION, READ BY THE CHIP, THE TAP, THE ND FLAG AND EICAS —
      // through `computeReadiness`, so no reader can be looking at a different
      // answer than another. `lastOwnAltFt` is set just above, so this sees the
      // same banding the draw below does.
      const readiness = computeReadiness();
      readyChip.textContent = readiness.label;
      readyChip.dataset.state = readiness.state;
      // THE CHIP SAYS WHETHER A TAP WOULD DO ANYTHING, because "populated" and
      // "ready to tap" are not the same fact and the owner asked for both.
      readyChip.dataset.tappable = readiness.tappable ? 'true' : 'false';

      if (!result) status.textContent = 'Waiting for the first sweep.';
      else if (!result.ok) {
        /**
         * THE READER GETS A SENTENCE; THE FORENSICS GO WHERE FORENSICS GO.
         *
         * This used to print the raw refusal chain, so what the owner photographed
         * on the face of a gauge was `cf-ray a258e8a82ff1fa4e-SJC`. True, and
         * written for whoever is debugging the Pages Function.
         *
         * Nothing is lost: the full chain is still in the diagnostics report
         * (§7f) and is on this element's `title`, so it is one long-press away
         * and one paste away. Summarising an error is help; hiding one is not,
         * and the difference is whether the detail is still reachable.
         */
        status.textContent = explainTrafficRefusal(result.reason, { heard: traffic.nearby.length });
        status.title = result.reason ?? '';
      } else {
        status.title = '';
      }
      if (result?.ok) {
        // The age of the AIRCRAFT, not of the last attempt. See nearbyAt.
        const age = formatAge(snapshot.t - (result.nearbyAt ?? result.at));
        // NAME WHAT THE SCOPE IS CENTRED ON. "within 40 nm of this device" is a
        // false sentence when the centre is a 737 over the Sierra, and it was
        // being printed in exactly that case.
        // SAY WHEN THE BAND IS HIDING SOMETHING. A count that silently excludes
        // aircraft is the scope lying about the sky by omission.
        const hidden = traffic.nearby.length - aircraft.length;
        const bandNote = hidden > 0 ? ` · ${hidden} outside the ${bandId} band` : '';
        status.textContent =
          `${aircraft.length} aircraft within ${result.rangeNm} nm of ` +
          `${result.centre.centredOn ?? (result.centre.fromFix ? 'this device' : 'the home reference')}` +
          ` · updated ${age} ago${bandNote}`;
      }

      // CREDIT WHOEVER ACTUALLY ANSWERED. The href used to be hardcoded to
      // adsb.fi while the TEXT came from the response — fine while there was
      // one source, and a false citation the moment there were two. Both the
      // name and the link now come from the payload, so a fallback to the
      // second provider credits the second provider.
      if (result?.attribution) {
        const home = result.sourceUrl ?? null;
        const name = result.source ?? 'the source';
        attribution.replaceChildren(
          document.createTextNode(`${result.attribution} — `),
          home
            ? el('a', { class: 'radar-credit-link', href: home, rel: 'noopener', text: name })
            : el('span', { class: 'radar-credit-link', text: name }),
          document.createTextNode(', a volunteer receiver network. Community coverage is strong over land and thin over oceans.'),
        );
      }

      renderPicker(aircraft);
      renderList(aircraft);
      renderFollowNote();

      // The plan view redraws at a human rate, not at 25 Hz: the underlying
      // data only changes every few seconds, so redrawing it forty times more
      // often than it changes is heat and nothing else.
      if (snapshot.t - lastDrawnAt < 250) return;
      lastDrawnAt = snapshot.t;

      surface.begin();
      const { width: W, height: H } = surface;
      if (W < 2 || H < 2) return;
      drawPlan(surface.ctx, {
        x: 0,
        y: 0,
        w: W,
        h: H,
        tokens: surface.tokens,
        centre: result?.centre ?? { lat: 0, lon: 0 },
        aircraft,
        rangeNm,
        followedHex: traffic.followed?.hex ?? null,
        fromFix: !!result?.centre?.fromFix,
        // No centreLabel: the centre carries its own short name now, so this
        // scope and the PFD's cannot disagree about what the crosshair is.
        runways: currentRunways(result?.centre),
        ownAltFt,
        trail: traffic.trail,
      });

      canvas.setAttribute(
        'aria-label',
        aircraft.length
          ? `Traffic plan view, north up, ${rangeNm} nautical mile range. ` +
              aircraft
                .slice(0, 8)
                .map(
                  (a) =>
                    `${a.callsign ?? a.hex}, ${fmt(a.distanceNm, 0)} nautical miles at ${Math.round(a.bearingDeg ?? 0)} degrees, ${altLabel(a) || 'no altitude'}`,
                )
                .join('. ') +
              (aircraft.length > 8 ? `. And ${aircraft.length - 8} more, listed below.` : '.')
          : `Traffic plan view, north up, ${rangeNm} nautical mile range. No aircraft being heard.`,
      );
    },
  };
}
