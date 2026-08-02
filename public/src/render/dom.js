/**
 * dom.js — DOM construction for annunciators, switches, flags and every numeric
 * readout.
 *
 * NODES AND textContent, NEVER innerHTML (Doctrine §16.7). Every string that
 * reaches this file can come from a feed — a station name, a METAR, an error
 * message from an upstream we do not control — and interpolating any of those
 * into markup is an injection with a delay fuse. There is no innerHTML in this
 * file and there should never be one.
 *
 * WHY THE NUMBERS LIVE IN THE DOM AND NOT ON THE CANVAS. A canvas is non-text
 * content (SC 1.1.1): a number painted onto it cannot be read by a screen
 * reader, cannot be selected, and does not scale with the reader's text-size
 * preference. So the canvas carries the GRAPHICS — horizon, tapes, needles —
 * and every value it depicts also exists here as real text with its provenance
 * beside it. The canvas then only needs to describe itself, not enumerate.
 */

import { MARK } from '../core/provenance.js';
import { formatAge } from '../core/units.js';

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * The provenance chip. THIS is where Doctrine §4's non-hue rule is enforced for
 * every readout in the app: the chip carries a GLYPH and the WORD, and colour
 * only reinforces them. The palette gate warns that a deutan reader cannot tell
 * `live` from `fail` by hue (ΔE 3.6) — which is fine, because neither of them
 * has ever been asked to carry the meaning alone.
 */
export function provenanceChip(field) {
  const mark = MARK[field?.provenance] ?? MARK.FAIL;
  const chip = el('span', { class: `chip chip-${mark.tone}` });
  chip.append(el('span', { class: 'chip-glyph', 'aria-hidden': 'true', text: mark.glyph }));
  chip.append(el('span', { class: 'chip-word', text: mark.word }));
  if (field?.provenance === 'STALE' && Number.isFinite(field.ageMs)) {
    chip.append(el('span', { class: 'chip-age', text: formatAge(field.ageMs) }));
  }
  return chip;
}

/** Human sentence for a field, used in canvas alt text and announcements. */
export function describeField(label, field, { format = (v) => String(v), unit = '' } = {}) {
  if (!field || field.provenance === 'FAIL') return `${label}: unavailable, ${field?.reason ?? 'no reading'}`;
  const age = field.provenance === 'STALE' ? `, stale, ${formatAge(field.ageMs)} old` : '';
  return `${label}: ${format(field.value)}${unit ? ` ${unit}` : ''}, ${field.provenance.toLowerCase()}${age}`;
}

/**
 * A readout row: label, value, unit, provenance chip.
 *
 * Returns an object with an `update` so the row is built once and only its text
 * changes at 25 Hz. Rebuilding rows every frame would destroy the reader's
 * selection and make the whole panel a churning live region.
 */
export function createReadout({ label, unit = '', format = (v) => String(Math.round(v)), hint = null }) {
  const valueNode = el('span', { class: 'ro-value', text: '—' });
  const unitNode = el('span', { class: 'ro-unit', text: unit });
  const chipHost = el('span', { class: 'ro-chip' });
  const reasonNode = el('span', { class: 'ro-reason' });

  const root = el('div', { class: 'readout' }, [
    el('span', { class: 'ro-label', text: label }),
    el('span', { class: 'ro-figure' }, [valueNode, unitNode]),
    chipHost,
    reasonNode,
  ]);
  if (hint) root.append(el('span', { class: 'ro-hint', text: hint }));

  let lastProvenance = null;

  return {
    root,
    get provenance() {
      return lastProvenance;
    },
    update(field) {
      const p = field?.provenance ?? 'FAIL';
      // FAIL REMOVES THE DIGITS. This is the strongest non-hue signal the panel
      // has, and it is the visible form of "never freeze a gauge at its last
      // value": there is no last value on screen to freeze.
      valueNode.textContent = !field || p === 'FAIL' ? '— — —' : format(field.value);
      // The UNIT stays. It is a label, not a reading, and keeping it means the
      // row still says what quantity is missing rather than going anonymous.
      unitNode.textContent = unit;
      reasonNode.textContent = p === 'FAIL' ? (field?.reason ?? 'no reading') : '';
      root.dataset.provenance = p;

      if (p !== lastProvenance) {
        chipHost.replaceChildren(provenanceChip(field));
        lastProvenance = p;
      } else if (p === 'STALE') {
        chipHost.replaceChildren(provenanceChip(field));
      }
    },
  };
}

/**
 * The status announcer. Status messages must reach assistive technology WITHOUT
 * STEALING FOCUS (SC 4.1.3), so this is a polite live region and nothing else.
 *
 * It announces TRANSITIONS only — "altitude went stale" — never the value on
 * every frame. A live region updated at 25 Hz is a denial-of-service on a
 * screen reader, which is a way of being technically compliant and actually
 * unusable.
 */
export function createAnnouncer(node) {
  const lastState = new Map();
  let queue = [];
  let timer = null;

  const flush = () => {
    timer = null;
    if (!queue.length) return;
    node.textContent = queue.join('. ');
    queue = [];
  };

  return {
    /** Report a field's provenance; announces only when it changes. */
    watch(label, field) {
      const p = field?.provenance ?? 'FAIL';
      const previous = lastState.get(label);
      if (previous === p) return;
      lastState.set(label, p);
      if (previous === undefined) return; // the first observation is not a change
      queue.push(p === 'FAIL' ? `${label} failed: ${field?.reason ?? 'no reading'}` : `${label} is now ${p.toLowerCase()}`);
      if (!timer) timer = setTimeout(flush, 700);
    },
    say(message) {
      queue.push(message);
      if (!timer) timer = setTimeout(flush, 200);
    },
  };
}
