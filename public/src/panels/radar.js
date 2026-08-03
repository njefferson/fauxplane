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
import { drawPlan, altLabel } from '../render/gauges/plan.js';
import { RADAR_RANGE_NM } from '../data/traffic.js';
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

  stopBtn.addEventListener('click', () => {
    traffic.unfollow();
    stopBtn.hidden = true;
    input.value = '';
    announcer.say('Stopped following. The panel is back on this device’s own sensors.');
    onFollowChange();
    renderFollowNote();
  });

  // --- range ---------------------------------------------------------------
  const rangeButtons = RADAR_RANGE_NM.map((nm) =>
    el('button', {
      class: 'radar-range-btn',
      type: 'button',
      text: `${nm} nm`,
      'aria-pressed': nm === rangeNm ? 'true' : 'false',
      onclick: () => {
        rangeNm = nm;
        for (const b of rangeButtons) b.setAttribute('aria-pressed', b.textContent === `${nm} nm` ? 'true' : 'false');
        announcer.say(`Radar range ${nm} nautical miles`);
      },
    }),
  );

  const attribution = el('p', { class: 'radar-credit' });

  host.replaceChildren(
    el('section', { class: 'card radar-card' }, [
      el('h2', { class: 'card-title', text: 'Traffic' }),
      el('div', { class: 'radar-range', role: 'group', 'aria-label': 'Plan view range' }, rangeButtons),
      canvas,
      status,
      attribution,
    ]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: 'Follow a flight' }), form, followNote]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: 'Heard right now' }), list]),
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

  /** The aircraft list. Rebuilt only when the SET changes, so a row a finger is
   *  already moving toward does not get replaced underneath it. */
  let lastKeys = '';
  function renderList(aircraft) {
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
      list.replaceChildren(el('p', { class: 'radar-empty', text: 'Nothing being heard within this range right now.' }));
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
    measure() {
      surface.measure();
    },
    refreshTokens() {
      surface.refreshTokens();
    },

    render(snapshot) {
      const result = traffic.last;
      const aircraft = traffic.nearby;

      if (!result) status.textContent = 'Waiting for the first sweep.';
      else if (!result.ok) status.textContent = `No traffic: ${result.reason}`;
      else {
        const age = formatAge(snapshot.t - result.at);
        status.textContent =
          `${aircraft.length} aircraft within ${result.rangeNm} nm of ` +
          `${result.centre.fromFix ? 'this device' : 'the home reference'} · updated ${age} ago`;
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
