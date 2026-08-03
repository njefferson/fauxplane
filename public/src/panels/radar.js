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
import { ALTITUDE_BANDS, RADAR_RANGE_NM, airframeGroups, filterByAirframe, ownAltitudeFt, withinBand } from '../data/traffic.js';
import { formatAge } from '../core/units.js';

const fmt = (v, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

export function createRadar({ host, traffic, announcer, onFollowChange = () => {} }) {
  let rangeNm = RADAR_RANGE_NM[2];
  let lastDrawnAt = 0;

  const canvas = el('canvas', {
    class: 'radar-canvas',
    role: 'img',
    'aria-label': 'Traffic plan view. Waiting for the first sweep.',
  });
  const surface = createSurface(canvas);

  const status = el('p', { class: 'radar-status', role: 'status', 'aria-live': 'polite', text: 'Waiting for the first sweep.' });
  const list = el('div', { class: 'radar-list', role: 'group', 'aria-label': 'Aircraft heard, nearest first' });
  const followNote = el('p', { class: 'radar-follow-note' });
  /**
   * THE AIRFRAME PICKER. Noah: "an airframe picker from all aircraft on the
   * radar, and he can choose to see what's up there... Types currently in range
   * only, and filters its own list."
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

  const submit = (e) => {
    e.preventDefault();
    const value = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(value)) {
      status.textContent = 'A flight number is 2 to 8 letters or digits — the ICAO form, like UAL328 rather than UA328.';
      return;
    }
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

  const startFollowing = (key) => {
    traffic.follow(key);
    stopBtn.hidden = false;
    announcer.say(`Following ${key.callsign ?? key.hex}. The panel is now showing that aircraft, not this device.`);
    onFollowChange();
    renderFollowNote();
  };

  // TAP AN AIRCRAFT TO FOLLOW IT (Noah: "map tapping the flight add it to the
  // tracking dialogue box"). The tap fills the follow box AND follows, through
  // the same startFollowing the form uses — and the "Heard right now" list
  // remains the accessible route to exactly the same action, so the canvas tap
  // is an enhancement rather than the only way.
  canvas.addEventListener('click', (e) => {
    const result = traffic.last;
    if (!result?.centre) return;
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
    startFollowing(hit.callsign ? { callsign: hit.callsign } : { hex: hit.hex });
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
  // carries its own range buttons (Noah: "put range options on the side of the
  // radar on the main screen"), and two controls for one value is fine — two
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
  const setBand = (id) => {
    bandId = id;
    for (const b of bandButtons) b.setAttribute('aria-pressed', b.dataset.band === id ? 'true' : 'false');
    lastKeys = '';
    lastPickerKey = '';
    const band = ALTITUDE_BANDS.find((b) => b.id === id);
    announcer.say(
      band?.real
        ? `Traffic band ${band.label}: aircraft within ${band.above} feet above and ${band.below} feet below.`
        : 'Showing every altitude. A real flight deck has no such setting.',
    );
  };
  const bandButtons = ALTITUDE_BANDS.map((b) =>
    el('button', {
      class: 'radar-band-btn',
      type: 'button',
      dataset: { band: b.id },
      // The one that is NOT a real flight-deck setting says so, rather than
      // sitting in the row pretending to be one.
      title: b.real ? `TCAS ${b.label}: +${b.above} / −${b.below} ft` : 'Not a real flight-deck setting — ours',
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
      el('div', { class: 'radar-range', role: 'group', 'aria-label': 'Plan view range' }, rangeButtons),
      bandHost,
      canvas,
      status,
      attribution,
    ]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: 'Follow a flight' }), form, followNote]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: 'Heard right now' }), picker, list]),
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

    list.replaceChildren(
      ...aircraft.slice(0, 24).map((a) => {
        const name = a.callsign ?? a.registration ?? a.hex.toUpperCase();
        const row = el(
          'button',
          {
            class: 'radar-row',
            type: 'button',
            dataset: { hex: a.hex },
            onclick: () => startFollowing(a.callsign ? { callsign: a.callsign } : { hex: a.hex }),
          },
          [
            el('span', { class: 'radar-row-name', text: name }),
            el('span', { class: 'radar-row-detail', text: rowDetail(a) }),
          ],
        );
        return row;
      }),
    );
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
      const result = traffic.last;
      // OWN ALTITUDE FIRST — every relative number and the band depend on it,
      // and while following an aircraft "own" is that aircraft.
      const ownAltFt = ownAltitudeFt(snapshot.fields, traffic.followed);
      lastOwnAltFt = ownAltFt;
      const aircraft = withinBand(traffic.nearby, ownAltFt, bandId);

      if (!result) status.textContent = 'Waiting for the first sweep.';
      else if (!result.ok) status.textContent = `No traffic: ${result.reason}`;
      else {
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
        // While following, the centre IS the aircraft — say so on the scope.
        centreLabel: result?.centre?.followed ? (result.centre.centredOn ?? 'FOLLOWED').slice(0, 10) : null,
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
