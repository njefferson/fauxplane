/**
 * bite.js — built-in test equipment.
 *
 * THIS IS A USER-VISIBLE CAPABILITY MATRIX, NOT A DEBUG CONSOLE. Every sensor
 * and every feed, with PASS / DEGRADED / FAIL and the reason, in language a
 * pilot can act on. It is the page that answers acceptance criterion 1: with
 * every permission denied, each instrument shows its failure flag and BITE
 * explains each one.
 *
 * IT MERGES TWO DIFFERENT CLAIMS, and keeping them apart is the whole point.
 * "The browser implements this API" and "this sensor is delivering readings"
 * are not the same statement, and a matrix that conflates them reports PASS
 * beside a crossed-out instrument. The static probe answers the first; the live
 * store answers the second; DEGRADED is what the disagreement is called.
 *
 * RENDERED AS A LIST, NOT A GRID. Doctrine §2 — a columnar layout is the format
 * that stops rendering somewhere, and every entry here is a heading plus two
 * lines, which reads everywhere and reflows at 200% text.
 */

import { DEGRADED, FAILED, PASS, STATUS_MARK, mergeRuntime, probeStatic } from '../core/capability.js';
import { el } from '../render/dom.js';
import { formatSelfTest, runSelfTest } from './selftest.js';
import { formatAge } from '../core/units.js';

/**
 * Runtime checks, one per static entry. Each answers: given what the store
 * actually holds, is this capability delivering?
 */
const CHECKS = {
  orientation: (f) => {
    const p = f['attitude.pitch'];
    if (!p || p.provenance === 'FAIL') return { status: FAILED, reason: p?.reason ?? 'no attitude' };
    if (p.provenance === 'STALE') return { status: DEGRADED, reason: `last attitude ${formatAge(p.ageMs)} ago` };
    // A usable attitude that still carries a reason is the gravity reference
    // ALONE — real, and exact while the device is still, but not yet backed by
    // a settled gyroscope. DEGRADED says that plainly without crossing out a
    // horizon that is working.
    if (p.reason) return { status: DEGRADED, reason: p.reason };
    return { status: PASS, reason: 'attitude filter aligned and updating' };
  },
  heading: (f) => {
    const h = f['attitude.heading'];
    if (!h || h.provenance === 'FAIL') return { status: FAILED, reason: h?.reason ?? 'no earth-referenced heading' };
    if (h.provenance === 'STALE') return { status: DEGRADED, reason: `last heading ${formatAge(h.ageMs)} ago` };
    return { status: PASS, reason: 'magnetic heading updating' };
  },
  motion: (f) => {
    const g = f['motion.gLoad'];
    const turn = f['attitude.turnRate'];
    if (!g || g.provenance === 'FAIL') return { status: FAILED, reason: g?.reason ?? 'no motion events' };
    if (!turn || turn.provenance === 'FAIL') {
      return { status: DEGRADED, reason: `accelerometer live, but ${turn?.reason ?? 'no gyroscope'}` };
    }
    return { status: PASS, reason: 'accelerometer and gyroscope delivering' };
  },
  geo: (f) => {
    const lat = f['position.lat'];
    if (!lat || lat.provenance === 'FAIL') return { status: FAILED, reason: lat?.reason ?? 'no position fix' };
    if (lat.provenance === 'STALE') return { status: DEGRADED, reason: `last fix ${formatAge(lat.ageMs)} ago` };
    const acc = f['position.accuracy'];
    const accText = acc && acc.provenance !== 'FAIL' ? ` ±${Math.round(acc.value)} m` : '';
    return { status: PASS, reason: `fix updating${accText}` };
  },
  ambient: (f, entry) => {
    const lux = f['ambient.lux'];
    if (lux && lux.provenance !== 'FAIL') return { status: PASS, reason: `${Math.round(lux.value)} lx from the light sensor` };
    return { status: DEGRADED, reason: `${entry.reason} — dimming is running on computed solar elevation` };
  },
};

/** Feed entries are built from the store rather than probed, because a feed's
 *  only real capability question is "did it answer, and how long ago". */
function feedEntries(fields, extra, details = {}) {
  const out = [];
  const add = (id, label, field, note) => {
    if (!field || field.provenance === 'FAIL') {
      out.push({ id, label, group: 'Feeds', status: FAILED, reason: field?.reason ?? note ?? 'no data' });
    } else if (field.provenance === 'STALE') {
      out.push({ id, label, group: 'Feeds', status: DEGRADED, reason: `holding last value, ${formatAge(field.ageMs)} old` });
    } else {
      out.push({ id, label, group: 'Feeds', status: PASS, reason: note ?? `updated ${formatAge(field.ageMs)} ago` });
    }
  };

  const station = fields['metar.station'];
  add(
    'metar',
    'METAR — surface observation',
    fields['metar.altimeter'],
    station && station.provenance !== 'FAIL' ? `${station.value}, altimeter setting received` : undefined,
  );
  add('winds', 'Winds and temperature aloft', fields['winds.vector']);
  add('geoid', 'Geoid model (GPS altitude → MSL)', fields['altitude.geoidSeparation']);
  add('declination', 'Magnetic declination (WMM)', fields['nav.declination']);

  // The long-form explanation, where one exists. A gauge shows the short
  // reason; this page is the one with room for the whole sentence, and that
  // split is why an altitude readout stopped being eight lines of prose.
  for (const e of out) if (details[e.id] && e.status !== PASS) e.reason = `${e.reason} — ${details[e.id]}`;

  for (const e of extra) out.push(e);
  return out;
}

/**
 * One row per capability, LAST writer wins.
 *
 * The static probe answers "does this browser implement the API" and the async
 * live probe answers "what is it actually reporting" — both legitimately
 * describe the same capability, and both were being rendered. a BITE page
 * showed "Battery status (BITE entry only)" twice with two different reasons,
 * and Network twice. A page whose whole job is to be an honest inventory must
 * not list anything twice.
 */
function dedupeById(entries) {
  const byId = new Map();
  for (const e of entries) byId.set(e.id, byId.has(e.id) ? { ...byId.get(e.id), ...e } : e);
  return [...byId.values()];
}

const ORDER = { [FAILED]: 0, [DEGRADED]: 1, [PASS]: 2 };

export function createBite({ host, announcer, selfTestContext = () => ({}), onSelfTest = () => {} }) {
  const staticEntries = probeStatic();
  const listHost = el('div', { class: 'bite-list' });
  const summary = el('p', { class: 'bite-summary', role: 'status' });

  // THE RELEASE NOTES ARE NOT HERE. They were, for one release, and it was the
  // wrong home: this page's one job is answering "what is broken", and a reader
  // who opened it because an instrument is crossed out should not scroll past a
  // changelog to reach the answer. They now live in the (i) menu with the rest
  // of the material that is information rather than instrumentation.
  /**
   * THE ACTIVE HALF OF BUILT-IN TEST (
   * )
   *
   * Everything above reports what HAPPENED to arrive. This goes and asks. It
   * belongs here rather than as a sixth page because BITE is already the
   * built-in test — the page was simply passive.
   *
   * It covers exactly what a sandbox cannot: the real feeds through the real
   * Functions, iOS's own sensor and orientation reporting, and the service
   * worker's caches. One press, one block to paste, folded into the diagnostics
   * report so a single paste carries it.
   */
  const testBtn = el('button', { class: 'bite-test', type: 'button', text: 'Run the self test' });
  const testOut = el('pre', { class: 'bite-test-out', tabindex: '0', 'aria-label': 'Self test result', hidden: true });
  const testNote = el('p', { class: 'bite-test-note', role: 'status', 'aria-live': 'polite' });

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testNote.textContent = 'Asking each feed once…';
    try {
      const result = await runSelfTest(selfTestContext());
      const text = formatSelfTest(result);
      testOut.textContent = text;
      testOut.hidden = false;
      // Handed up so the diagnostics report carries it too — nobody should have
      // to paste two things.
      onSelfTest(result);
      const failed = result.groups.flatMap((g) => g.rows).filter((r) => r.state === 'fail');
      testNote.textContent = failed.length
        ? `${failed.length} check${failed.length === 1 ? '' : 's'} failed. The detail is below, and it is in the diagnostics report too.`
        : 'Every check answered. The detail is below, and it is in the diagnostics report too.';
      announcer?.say?.(testNote.textContent);
    } catch (err) {
      testNote.textContent = `The self test itself failed: ${err.message}`;
    } finally {
      testBtn.disabled = false;
    }
  });

  host.replaceChildren(
    el('section', { class: 'card', 'aria-labelledby': 'bite-h' }, [
      el('h2', { id: 'bite-h', text: 'Built-in test' }),
      el('p', {
        class: 'bite-intro',
        text: 'Every sensor and feed this panel can use, and what it is doing right now. A FAIL here explains a crossed-out instrument on the PFD.',
      }),
      summary,
      listHost,
    ]),
    el('section', { class: 'card', 'aria-labelledby': 'bite-test-h' }, [
      el('h2', { id: 'bite-test-h', text: 'Self test' }),
      el('p', {
        class: 'bite-intro',
        text: 'Asks every feed once, and reports what this device can and cannot do. Run it when something looks wrong, then send the diagnostics report — it carries the result.',
      }),
      testBtn,
      testNote,
      testOut,
    ]),
  );

  /** Host-side probes arrive asynchronously and are folded in when they do. */
  let hostEntries = [];
  let details = {};
  const nodes = new Map();

  const rowFor = (entry) => {
    let row = nodes.get(entry.id);
    if (!row) {
      const mark = el('span', { class: 'bite-mark' });
      const glyph = el('span', { class: 'bite-glyph', 'aria-hidden': 'true' });
      const word = el('span', { class: 'bite-word' });
      mark.append(glyph, word);
      const label = el('h3', { class: 'bite-label' });
      const reason = el('p', { class: 'bite-reason' });
      const root = el('div', { class: 'bite-item' }, [label, mark, reason]);
      row = { root, glyph, word, label, reason };
      nodes.set(entry.id, row);
    }
    const m = STATUS_MARK[entry.status] ?? STATUS_MARK[FAILED];
    row.glyph.textContent = m.glyph;
    row.word.textContent = m.word;
    row.label.textContent = entry.label;
    row.reason.textContent = entry.reason ?? '';
    row.root.dataset.status = entry.status;
    row.root.dataset.group = entry.group;
    row.root.dataset.entryId = entry.id;
    return row.root;
  };

  return {
    setHostEntries(entries) {
      hostEntries = entries;
    },

    /** Long-form explanations for the deliberately-absent data bundles. */
    setDetails(next) {
      details = { ...details, ...next };
    },

    render(snapshot) {
      const fields = snapshot.fields;
      const merged = mergeRuntime(staticEntries, fields, CHECKS);
      const all = dedupeById([...merged, ...feedEntries(fields, hostEntries, details)]);

      // Worst first. A pilot opening BITE is looking for what is broken, and
      // making them scroll past nine PASS rows to find it is the page failing
      // at its one job.
      all.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.label.localeCompare(b.label));

      const counts = all.reduce((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {});
      const failed = counts[FAILED] ?? 0;
      const degraded = counts[DEGRADED] ?? 0;
      summary.textContent =
        failed === 0 && degraded === 0
          ? `All ${all.length} checks pass.`
          : `${failed} failed, ${degraded} degraded, ${counts[PASS] ?? 0} pass, of ${all.length} checks.`;

      listHost.replaceChildren(...all.map(rowFor));
      announcer.watch('Built-in test', { provenance: failed ? 'FAIL' : degraded ? 'STALE' : 'LIVE', reason: `${failed} failed` });
    },
  };
}
