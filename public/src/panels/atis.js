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
      format: (v) =>
        `${v.dirDeg === null ? 'VRB' : String(Math.round(v.dirDeg)).padStart(3, '0')}° / ${Math.round(v.speedKt)}${v.gustKt ? `G${Math.round(v.gustKt)}` : ''} kt`,
    }),
    oat: createReadout({ label: 'OAT at altitude', unit: '°C', format: (v) => v.toFixed(1) }),
    windsAloft: createReadout({
      label: 'Wind at altitude',
      format: (v) => `${String(Math.round(v.dirDeg)).padStart(3, '0')}° / ${Math.round(v.speedKt)} kt`,
    }),
    indicated: createReadout({ label: 'Indicated altitude', unit: 'ft', format: (v) => Math.round(v).toLocaleString() }),
    pressureAlt: createReadout({ label: 'Pressure altitude', unit: 'ft', format: (v) => Math.round(v).toLocaleString() }),
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

    render(snapshot, metarResult) {
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

      announcer.watch('Altimeter setting', f['metar.altimeter']);
      announcer.watch('Winds aloft', f['winds.vector']);
    },
  };
}
