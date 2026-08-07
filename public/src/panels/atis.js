/**
 * atis.js — the surface observation and the Kollsman window.
 *
 * THE STATION IS ALWAYS NAMED, WITH ITS DISTANCE. That is settled (NOTES.md)
 * and it is the honesty rule made visible: an altimeter setting is only as
 * meaningful as the distance to the station reporting it, so the panel shows
 * both and never a bare number.
 *
 * THE KOLLSMAN WINDOW IS A REAL CONTROL, not a label. It defaults to the
 * selected station's setting and can be dialled by hand; the indicated altitude
 * moves exactly as a real altimeter's would. When it is not on the station's
 * value, the panel says so, because a Kollsman quietly out of sync with the
 * field is the oldest altimeter error there is.
 *
 * ACCESSIBILITY OF THE CONTROL, declared before the code (Doctrine §4):
 *   - Every adjustment has a non-drag path: two buttons and a real number
 *     input. Nothing here is drag-only, and there is no slider to fumble.
 *   - Targets are at least 44px AND spaced, because what tremor does is
 *     overshoot; SYNC sits apart from the two nudge buttons.
 *   - Nothing commits on pointer-down. A click is pointer-up by definition and
 *     no handler here listens for pointerdown.
 *   - No timed gesture: no press-and-hold, no repeat-on-hold, no double-tap.
 *   - The buttons never change size when pressed, and the value sits in a
 *     fixed-width box, so nothing reflows under a finger already moving.
 */

import { FALLBACK_ALTIMETER_INHG } from '../data/metar.js';
import { WX_KINDS, placeReports, wxSummary } from '../data/wxtext.js';
import { loadNavaids } from '../data/navaids.js';
import { REGION } from '../core/region.js';
import { createReadout, el } from '../render/dom.js';
import { formatAge, inHgToHPa } from '../core/units.js';

export const KOLLSMAN_MIN = 27.5;
export const KOLLSMAN_MAX = 31.5;
export const KOLLSMAN_STEP = 0.01;

const clampSetting = (v) => Math.min(KOLLSMAN_MAX, Math.max(KOLLSMAN_MIN, Math.round(v * 100) / 100));

export function createAtis({ host, state, announcer, clock = () => Date.now() }) {
  /** Once the pilot has touched the dial, we stop auto-syncing it. Moving a
   *  control the user just set is the "no silent mutation" rule (Doctrine §14)
   *  in its smallest form. */
  let manual = false;
  let lastStationSetting = null;

  const stationLine = el('p', { class: 'atis-station', text: 'No station selected yet.' });
  const sourceLine = el('p', { class: 'atis-source' });
  const rawLine = el('pre', { class: 'atis-raw', tabindex: '0', 'aria-label': 'Raw METAR text' });

  const valueBox = el('output', { class: 'koll-value', for: 'koll-input', text: '—' });
  const input = el('input', {
    class: 'koll-input',
    id: 'koll-input',
    type: 'number',
    inputmode: 'decimal',
    min: String(KOLLSMAN_MIN),
    max: String(KOLLSMAN_MAX),
    step: String(KOLLSMAN_STEP),
    'aria-describedby': 'koll-help',
  });

  const setSetting = (value, { why }) => {
    const v = clampSetting(value);
    if (!Number.isFinite(v)) return;
    state.write('control.kollsman', v, { at: clock(), reason: why });
    input.value = v.toFixed(2);
    valueBox.textContent = v.toFixed(2);
  };

  const nudge = (delta) => {
    manual = true;
    const current = state.peek('control.kollsman');
    const base = current && current.provenance !== 'FAIL' ? current.value : FALLBACK_ALTIMETER_INHG;
    setSetting(base + delta, { why: 'set by hand' });
    announcer.say(`Altimeter setting ${clampSetting(base + delta).toFixed(2)} inches`);
  };

  // Accessible names are distinct from each other and each contains its visible
  // text (SC 2.5.3, and Doctrine §4's no-two-controls-answer-to-the-same-name).
  const down = el('button', {
    type: 'button',
    class: 'koll-btn',
    'aria-label': 'Decrease altimeter setting by one hundredth',
    onclick: () => nudge(-KOLLSMAN_STEP),
  }, ['−']);
  const up = el('button', {
    type: 'button',
    class: 'koll-btn',
    'aria-label': 'Increase altimeter setting by one hundredth',
    onclick: () => nudge(+KOLLSMAN_STEP),
  }, ['+']);
  const sync = el('button', {
    type: 'button',
    class: 'koll-sync',
    onclick: () => {
      manual = false;
      if (lastStationSetting !== null) {
        setSetting(lastStationSetting, { why: 'auto — from the selected station' });
        announcer.say(`Altimeter setting synced to station, ${lastStationSetting.toFixed(2)} inches`);
      } else {
        setSetting(FALLBACK_ALTIMETER_INHG, { why: `no station altimeter setting — standard ${FALLBACK_ALTIMETER_INHG} in use` });
        announcer.say('No station setting available; standard 29.92 in use');
      }
    },
  }, ['Sync to station']);

  input.addEventListener('change', () => {
    manual = true;
    const v = Number(input.value);
    if (Number.isFinite(v)) {
      setSetting(v, { why: 'set by hand' });
    } else {
      // A field cleared to nothing is not a setting. Put the last real value
      // back rather than writing a null into an altimeter.
      const current = state.peek('control.kollsman');
      input.value = current && current.provenance !== 'FAIL' ? current.value.toFixed(2) : '';
    }
  });

  const syncNote = el('p', { class: 'koll-note', id: 'koll-help' });

  const readouts = {
    altimeter: createReadout({ label: 'Station altimeter', unit: 'inHg', format: (v) => v.toFixed(2) }),
    temp: createReadout({ label: 'Temperature', unit: '°C', format: (v) => v.toFixed(0) }),
    dewpoint: createReadout({ label: 'Dewpoint', unit: '°C', format: (v) => v.toFixed(0) }),
    wind: createReadout({
      label: 'Surface wind',
      format: (v) => {
        // The raw report says 00000KT and every pilot reads that as CALM.
        // "000° / 0 kt" is the same fact spelled in a way nobody says out loud.
        if (Math.round(v.speedKt) === 0) return 'CALM';
        const dir = v.dirDeg === null ? 'VRB' : String(Math.round(v.dirDeg)).padStart(3, '0');
        return `${dir}° / ${Math.round(v.speedKt)}${v.gustKt ? `G${Math.round(v.gustKt)}` : ''} kt`;
      },
    }),
    oat: createReadout({ label: 'OAT at altitude', unit: '°C', format: (v) => v.toFixed(1) }),
    windsAloft: createReadout({
      label: 'Wind at altitude',
      format: (v) => `${String(Math.round(v.dirDeg)).padStart(3, '0')}° / ${Math.round(v.speedKt)} kt`,
    }),
    indicated: createReadout({ label: 'Indicated altitude', unit: 'ft', format: (v) => Math.round(v).toLocaleString() }),
    pressureAlt: createReadout({ label: 'Pressure altitude', unit: 'ft', format: (v) => Math.round(v).toLocaleString() }),
  };

  /**
   * THE TEXT A FLIGHT DECK CARRIES, and the ATIS page is where it belongs —
   * this is already the app's text-weather surface, and a seventh tab for three
   * blocks of prose would be the thing §7e names as the mistake.
   *
   * ONE BLOCK PER KIND, each with its own state line, because they fail
   * independently: PIREPs can answer while the forecast does not. A block with
   * nothing in it says WHICH nothing — a quiet sky and a service that did not
   * answer are different facts and neither may stand in for the other.
   *
   * `<pre>` because these are fixed-format reports. A PIREP's columns are what
   * make it readable, and reflowing one into a paragraph destroys the only
   * structure it has.
   */
  const wxBlocks = WX_KINDS.map((kind) => {
    const state = el('p', { class: 'wx-state' });
    const body = el('pre', { class: 'wx-body', 'aria-label': `${kind.label}, as filed` });
    /** Outside the scroller, like the aircraft list's — a "scroll for more" that
     *  itself scrolls out of view is the one place it must not be. */
    const more = el('p', { class: 'wx-more', role: 'status', hidden: '' });
    /** WHERE THE GROUPS GO when the block can be placed. Empty and hidden
     *  otherwise, so a kind the feed already narrows — pilot reports, forecasts
     *  — renders exactly as it always has. */
    const groups = el('div', { class: 'wx-groups', hidden: '' });
    return {
      kind,
      state,
      body,
      more,
      groups,
      /** What is currently BUILT in `groups`, and the handles to re-measure it
       *  — see the render loop. */
      signature: null,
      built: [],
      root: el('section', { class: 'wx-block' }, [
        el('h3', { class: 'wx-h', text: kind.label }),
        state,
        body,
        more,
        groups,
      ]),
    };
  });

  /**
   * THE NAVAID TABLE, asked for once and never waited on.
   *
   * A `FROM` line is the only geography in a hazard advisory, and resolving it
   * needs the nationwide ident table. Until it arrives — and if it never does,
   * because the bundle is absent — `placeReports` returns `placed: false` and
   * the block shows every advisory under the sentence saying the service does
   * not narrow them. That is the honest fallback, and it is the behaviour this
   * page already had, so an absent bundle costs the reader nothing they had.
   */
  // Why it is absent, when it is, is BITE's row — see `loadNavaids` in app.js.
  // Repeating the reason on this page would put a bundle diagnostic in front of
  // a reader who came here to read the weather.
  let navaidLookup = null;
  loadNavaids().then((t) => {
    if (t.ok) navaidLookup = t.lookup;
  });

  /**
   * THE BLOCK ENDS ON A LINE BOUNDARY, and says how much is below it.
   *
   * A fixed `max-height` cuts whichever line straddles it, and a line sliced
   * through its own glyphs against a hard container edge reads as broken rather
   * than as scrollable. The aircraft list learned this in 1.28.x and the fix is
   * the same one: measure, cap on a boundary, and put the count outside.
   *
   * Measured from the element's own line-height rather than from a constant, so
   * it stays right at 200% text — the reader's font size is the one number a
   * layout must never assume.
   */
  const capPre = (pre, more) => {
    const text = pre.textContent;
    if (!text) {
      more.hidden = true;
      return;
    }
    // No layout, no answer — never a count computed against a zero height. This
    // is also what makes a CLOSED disclosure safe to call this on: it measures
    // zero, returns, and is re-measured on toggle.
    if (!pre.clientHeight) return;
    const cs = getComputedStyle(pre);
    const line = Number.parseFloat(cs.lineHeight) || 18;
    const padY = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // The stylesheet's 14rem cap, in pixels, and how many WHOLE lines fit inside
    // it once the padding is paid for. At least one, or a big type size leaves
    // an empty box.
    const whole = Math.max(1, Math.floor((14 * rem - padY) / line));
    pre.style.maxHeight = `${whole * line + padY}px`;
    const lines = Math.max(0, Math.round((pre.scrollHeight - pre.clientHeight) / line));
    more.textContent = lines > 0 ? `${lines} more line${lines === 1 ? '' : 's'} below — scroll this block` : '';
    more.hidden = lines <= 0;
    // SC 2.1.1: focusable only while it actually scrolls. A tabindex on a box
    // that fits sends a keyboard user somewhere with nothing to read.
    if (lines > 0) pre.setAttribute('tabindex', '0');
    else pre.removeAttribute('tabindex');
  };

  const capBody = (b) => capPre(b.body, b.more);

  /**
   * ONE GROUP OF PLACED ADVISORIES.
   *
   * `Elsewhere` is the only collapsed one, and it is a real `<details>` rather
   * than a class that hides things: the reader can open it, it is a keyboard
   * control for free, and its count is in the summary either way. Nothing is
   * removed from the page.
   *
   * THE HEADING CARRIES THE COUNT because a disclosure whose label does not say
   * how much is behind it is a control nobody has a reason to press.
   */
  const renderGroup = (group) => {
    const more = el('p', { class: 'wx-more', role: 'status', hidden: '' });
    const pre = el('pre', {
      class: 'wx-body',
      'aria-label': `${group.label}, as filed`,
      text: group.reports.map((r) => (r.reason ? `${r.text}\n[${r.reason}]` : r.text)).join('\n\n'),
    });
    const n = group.reports.length;
    const label = `${group.label} — ${n} report${n === 1 ? '' : 's'}`;

    if (group.open) {
      return {
        root: el('div', { class: 'wx-group', 'data-where': group.where }, [
          el('h4', { class: 'wx-group-h', text: label }),
          pre,
          more,
        ]),
        measure: () => capPre(pre, more),
      };
    }

    const details = el('details', { class: 'wx-group wx-group-collapsed', 'data-where': group.where }, [
      el('summary', { class: 'wx-group-h', text: label }),
      pre,
      more,
    ]);
    // A closed disclosure has no layout, so the cap computed on render is zero
    // lines. Re-measure when it opens, or the reader gets an uncapped block with
    // no "more below" line.
    details.addEventListener('toggle', () => capPre(pre, more));
    return { root: details, measure: () => capPre(pre, more) };
  };

  host.replaceChildren(
    el('section', { class: 'card', 'aria-labelledby': 'atis-h' }, [
      el('h2', { id: 'atis-h', text: 'Observation' }),
      stationLine,
      sourceLine,
      ...Object.values(readouts).slice(0, 4).map((r) => r.root),
      rawLine,
    ]),
    el('section', { class: 'card', 'aria-labelledby': 'koll-h' }, [
      el('h2', { id: 'koll-h', text: 'Kollsman window' }),
      el('div', { class: 'koll-row' }, [
        down,
        el('div', { class: 'koll-display' }, [valueBox, el('span', { class: 'koll-unit', text: 'inHg' })]),
        up,
      ]),
      el('div', { class: 'koll-row koll-row-2' }, [
        el('label', { class: 'koll-label', for: 'koll-input', text: 'Set exactly' }),
        input,
        sync,
      ]),
      syncNote,
      readouts.indicated.root,
      readouts.pressureAlt.root,
    ]),
    el('section', { class: 'card', 'aria-labelledby': 'aloft-h' }, [
      el('h2', { id: 'aloft-h', text: 'Aloft' }),
      readouts.windsAloft.root,
      readouts.oat.root,
    ]),
    el('section', { class: 'card', 'aria-labelledby': 'wx-h' }, [
      el('h2', { id: 'wx-h', text: 'Reports and advisories' }),
      /**
       * THE CLAIM MATCHES WHAT THE FEED ACTUALLY SENDS.
       *
       * It said "Nothing here is summarised or reworded" full stop, and the
       * first real response showed the advisories arriving with the service's
       * own `Type: SIGMET Hazard: CONVECTIVE` labels in front of them. Small,
       * and it is still a sentence on screen that was not quite true — in the
       * one card whose entire selling point is that nothing was touched.
       */
      el('p', {
        class: 'atis-source',
        text:
          'As filed, from the US National Weather Service aviation weather service. Nothing is summarised or reworded here; where the service adds its own labels to a report, those arrive with it.',
      }),
      ...wxBlocks.map((b) => b.root),
    ]),
  );

  return {
    /** Offer the station's setting to the dial. Ignored once the pilot has
     *  taken manual control — see `manual` above. */
    offerStationSetting(inHg) {
      lastStationSetting = Number.isFinite(inHg) ? clampSetting(inHg) : null;
      if (!manual && lastStationSetting !== null) {
        setSetting(lastStationSetting, { why: 'auto — from the selected station' });
      }
    },

    /** The amendment's explicit fallback: no station altimeter anywhere in the
     *  box means 29.92, flagged, with the reason on screen. */
    applyFallback(reason) {
      lastStationSetting = null;
      if (!manual) {
        setSetting(FALLBACK_ALTIMETER_INHG, { why: `${reason} — standard ${FALLBACK_ALTIMETER_INHG} in use` });
      }
    },

    render(snapshot, metarResult, wxText = null) {
      const f = snapshot.fields;

      const station = f['metar.station'];
      const distance = f['metar.distanceNm'];
      if (station && station.provenance !== 'FAIL') {
        const d = distance && distance.provenance !== 'FAIL' ? `${distance.value.toFixed(1)} nm` : 'distance unknown';
        const fromFix = metarResult?.from?.isFix;
        stationLine.textContent = `${station.value} — ${d} from ${fromFix ? 'your position' : 'the home reference (no GPS fix yet)'}`;
        stationLine.dataset.provenance = station.provenance;
      } else {
        stationLine.textContent = station?.reason ?? 'No station selected yet.';
        stationLine.dataset.provenance = 'FAIL';
      }

      const observed = f['metar.observedAt'];
      if (observed && observed.provenance !== 'FAIL') {
        sourceLine.textContent = `Observed ${observed.value} · ${formatAge(observed.ageMs)} old · NOAA Aviation Weather Center`;
      } else {
        sourceLine.textContent = 'NOAA Aviation Weather Center';
      }

      const raw = f['metar.raw'];
      rawLine.textContent = raw && raw.provenance !== 'FAIL' ? raw.value : '';
      rawLine.hidden = !(raw && raw.provenance !== 'FAIL');

      readouts.altimeter.update(f['metar.altimeter']);
      readouts.temp.update(f['metar.temp']);
      readouts.dewpoint.update(f['metar.dewpoint']);
      readouts.wind.update(f['metar.wind']);
      readouts.oat.update(f['winds.oat']);
      readouts.windsAloft.update(f['winds.vector']);
      readouts.indicated.update(f['altitude.indicated']);
      readouts.pressureAlt.update(f['altitude.pressure']);

      const koll = f['control.kollsman'];
      if (koll && koll.provenance !== 'FAIL') {
        valueBox.textContent = koll.value.toFixed(2);
        if (document.activeElement !== input) input.value = koll.value.toFixed(2);
        const hpa = inHgToHPa(koll.value);
        const offStation =
          lastStationSetting !== null && Math.abs(koll.value - lastStationSetting) > 0.005
            ? ` · NOT the station setting (${lastStationSetting.toFixed(2)})`
            : '';
        syncNote.textContent = `${koll.reason ?? ''} · ${hpa.toFixed(0)} hPa${offStation}`;
        syncNote.dataset.state = offStation ? 'off-station' : 'ok';
      } else {
        syncNote.textContent = koll?.reason ?? 'No altimeter setting.';
        syncNote.dataset.state = 'fail';
      }

      /**
       * THE REPORTS. Rendered from whatever the source last got, per kind, and
       * the state line always says which state it is in — waiting, refused,
       * quiet, or a count with an age. A block that rendered nothing and said
       * nothing would be indistinguishable from a quiet sky.
       */
      for (const b of wxBlocks) {
        const result = wxText?.all?.find((x) => x.id === b.kind.id)?.result ?? null;
        const reports = result?.ok ? result.reports ?? [] : [];

        /**
         * ONLY AN UNFILTERED BLOCK IS SORTED. Pilot reports and forecasts come
         * back narrowed to the box already, so grouping them would claim a
         * second opinion about geography the feed has already given.
         */
        /**
         * AGAINST THE BOX THE REPORTS WERE FETCHED WITH, which from 2.0.0 is
         * the reader's own. It used to be `REGION.bbox`, so "Over your area"
         * meant "over Northern California" — the panel making a claim about the
         * reader that was not about the reader.
         *
         * Taken from the source rather than rebuilt here on purpose: a page
         * that sorted against a box it worked out for itself would eventually
         * file an advisory that is genuinely overhead under Elsewhere, the
         * moment the reader moved between the fetch and the paint.
         */
        const placement = result?.area === 'unfiltered'
          ? placeReports(reports, wxText?.area ?? REGION.bbox, navaidLookup)
          : null;

        const said = wxSummary(b.kind, result, clock(), placement);
        b.state.textContent = said.text;
        b.state.dataset.tone = said.tone;

        if (placement?.placed && reports.length) {
          // Grouped: the flat body goes away entirely rather than being left
          // behind the groups, where it would show every report twice.
          b.body.hidden = true;
          b.body.removeAttribute('tabindex');
          b.more.hidden = true;

          /**
           * REBUILT ONLY WHEN THE CONTENT CHANGES, and that is not an
           * optimisation.
           *
           * `render` runs every frame. Calling `replaceChildren` unconditionally
           * destroyed and rebuilt these nodes sixty times a second, which meant
           * the Elsewhere disclosure shut again the instant it was opened — the
           * reader could never read what was behind it — and any scroll position
           * inside a group was thrown away just as fast.
           *
           * Caught by the accessibility gate, which pressed the disclosure and
           * found it closed, and by four contrast rows measuring 1.00:1 against a
           * node that had been replaced between the measurement and the
           * screenshot. That is hub LESSONS §61 in a second costume: the fix is
           * the same one, key on the SHAPE of what is rendered and leave the DOM
           * alone when it has not moved.
           */
          const signature = placement.groups
            .map((g) => `${g.where}:${g.reports.map((r) => r.text.length).join(',')}`)
            .join('|');
          if (b.signature !== signature) {
            b.signature = signature;
            b.built = placement.groups.map(renderGroup);
            b.groups.replaceChildren(...b.built.map((g) => g.root));
          }
          /**
           * MEASURED EVERY RENDER, REBUILT ONLY ON CHANGE — and the two must not
           * be tied together.
           *
           * `measure` used to sit inside the guard above, so it ran exactly once:
           * immediately after `replaceChildren`, when the nodes had just been
           * inserted and had no layout. `capPre` correctly returns early on a
           * zero height, and then nothing ever called it again. Three things went
           * missing together — the "N more lines below" line, the cap on a whole
           * LINE boundary, and the SC 2.1.1 `tabindex` — so the block was capped
           * by the stylesheet's fallback instead, which slices the last line
           * through its own glyphs and says nothing about the rest.
           *
           * The flat body has always been measured on every render, which is why
           * it kept its notice while the groups lost theirs. This is that cadence,
           * restored, without giving back the rebuild that shut the disclosure.
           */
          for (const g of b.built ?? []) g.measure();
          b.groups.hidden = placement.groups.length === 0;
        } else {
          if (b.signature !== null) {
            b.signature = null;
            b.built = [];
            b.groups.replaceChildren();
          }
          b.groups.hidden = true;
          b.body.textContent = reports.join('\n\n');
          b.body.hidden = reports.length === 0;
          if (reports.length) capBody(b);
          else b.more.hidden = true;
        }
      }

      announcer.watch('Altimeter setting', f['metar.altimeter']);
      announcer.watch('Winds aloft', f['winds.vector']);
    },
  };
}
