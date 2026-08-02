/**
 * diagnostics.js — one tap on the version stamp, and the whole panel's state as
 * text you can paste.
 *
 * WHY THIS EXISTS. Every defect this app has had was found by Noah
 * photographing his phone and me reading pixels: a residual figure, a flag, a
 * reason clipped at the edge of a tape. That is a terrible channel. It loses
 * the reason strings, it cannot show a field that is off screen, it cannot show
 * the filter's internals at all, and it makes a person do OCR for a machine.
 *
 * The report is ordered so THE FIRST LINES ARE THE DIAGNOSIS — everything
 * currently failing, with its reason — and the raw dump is underneath. A
 * diagnostic that opens with a table of forty fields is one nobody reads.
 *
 * PRIVACY, because this is made to be pasted somewhere. The position is rounded
 * to two decimal places (about a kilometre) unless the box is ticked, and the
 * report says which it is. Nothing else here is personal: no account, no
 * identifiers, no history.
 */

import { VERSION } from '../core/version.js';
import { FIELDS } from '../core/state.js';
import { el } from '../render/dom.js';
import { formatAge } from '../core/units.js';

/** Console messages, captured from BOOT so a failure during startup is in the
 *  report rather than only in a devtools window nobody has open on a phone. */
const LOG = [];
const LOG_LIMIT = 40;

/**
 * Wrap console.error/warn and the global error handlers.
 *
 * Called at MODULE LOAD, not inside boot(), because "the panel failed to start"
 * is exactly the case worth capturing and boot() may never run.
 */
export function installConsoleCapture() {
  const note = (level, parts) => {
    LOG.push({ at: Date.now(), level, text: parts.map(stringify).join(' ').slice(0, 400) });
    if (LOG.length > LOG_LIMIT) LOG.shift();
  };
  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      note(level, args);
      original(...args);
    };
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => note('error', [e.message, `${e.filename}:${e.lineno}`]));
    window.addEventListener('unhandledrejection', (e) => note('error', ['unhandled rejection:', e.reason]));
  }
}

const stringify = (v) => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const pad = (s, n) => String(s).padEnd(n);
const iso = (ms) => new Date(ms).toISOString().replace('.000', '');

/** Round a position for the report. Two places is about a kilometre. */
const coarse = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : v);

function formatValue(field) {
  if (!field || field.provenance === 'FAIL') return '—';
  const v = field.value;
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2);
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Build the whole report.
 *
 * A pure function of the things handed to it, so it can be called from a test
 * without a browser — the same reason every derivation lives in derive.js.
 */
export function buildReport({ snapshot, fusion, traffic, metar, bootAt, precisePosition = false, env = {}, mount = null, mountApplies = null }) {
  const t = snapshot?.t ?? Date.now();
  const f = snapshot?.fields ?? {};
  const out = [];
  const line = (s = '') => out.push(s);

  line(`fauxplane diagnostics  v${VERSION}`);
  line(`captured ${iso(t)}   panel up ${formatAge(t - bootAt)}`);
  line();

  // ---- the diagnosis, first --------------------------------------------------
  //
  // ROOT CAUSES SEPARATED FROM WHAT THEY KNOCKED OVER. A derived field names
  // the inputs it is missing, so its reason contains "unavailable (" — which
  // means it is a CONSEQUENCE, not a cause. Listing all thirty-eight together
  // buries the two or three that actually went wrong, and the whole point of
  // putting this at the top is that the first lines answer the question.
  const failing = Object.keys(FIELDS).filter((p) => f[p]?.provenance === 'FAIL');
  const stale = Object.keys(FIELDS).filter((p) => f[p]?.provenance === 'STALE');
  const isDownstream = (p) => /unavailable \(|: not yet initialised\)/.test(f[p].reason ?? '');
  const roots = failing.filter((p) => !isDownstream(p));
  const downstream = failing.filter(isDownstream);
  const notStarted = roots.filter((p) => /not yet initialised|not fetched yet|filter has not started/.test(f[p].reason ?? ''));
  const realRoots = roots.filter((p) => !notStarted.includes(p));

  line(
    `WHAT IS NOT WORKING  —  ${failing.length} of ${Object.keys(FIELDS).length} fields failed` +
      `${stale.length ? `, ${stale.length} stale` : ''}`,
  );
  if (!failing.length && !stale.length) line('  nothing — every field is live or derived');

  if (realRoots.length) {
    line('  ROOT CAUSES:');
    for (const p of realRoots) line(`    ${pad(p, 28)} ${f[p].reason ?? 'no reason given'}`);
  }
  if (notStarted.length) {
    line(`  NEVER STARTED (${notStarted.length}) — no reading has arrived at all:`);
    line(`    ${notStarted.join(', ')}`);
  }
  for (const p of stale) line(`  STALE  ${pad(p, 28)} ${formatAge(f[p].ageMs)} old — ${f[p].reason ?? ''}`);
  if (downstream.length) {
    line(`  DOWNSTREAM (${downstream.length}) — failed only because something above did:`);
    line(`    ${downstream.join(', ')}`);
  }
  line();

  // ---- the attitude filter, because it is what goes wrong --------------------
  const att = fusion?.read?.(t);
  if (att) {
    line('ATTITUDE FILTER');
    line(`  quality ${att.quality ?? 'none'}   converged ${att.converged}   still ${att.still}   rejecting ${att.rejecting}`);
    line(`  pitch ${att.pitch === null ? '—' : att.pitch.toFixed(2)}   roll ${att.roll === null ? '—' : att.roll.toFixed(2)}   heading ${att.heading === null ? '—' : att.heading.toFixed(1)}`);
    line(`  residual ${att.residualDeg === null ? '—' : `${att.residualDeg.toFixed(2)}°`}   accepted ${att.acceptedSamples} samples   coasting ${att.coastingMs === null ? '—' : `${Math.round(att.coastingMs)}ms`}`);
    if (att.reason) line(`  says: ${att.reason}`);
    const b = fusion.gyroBias;
    line(
      b
        ? `  gyro zero-offset  alpha ${b.alpha.toFixed(2)}  beta ${b.beta.toFixed(2)}  gamma ${b.gamma.toFixed(2)} deg/s  (from ${b.samples} samples)`
        : '  gyro zero-offset  not yet estimated',
    );
    line(
      mount
        ? `  MOUNT LEVELLING  cradle ${mount.pitchDeg.toFixed(1)} deg pitch, ${mount.rollDeg.toFixed(1)} deg roll` +
            `  — ${mountApplies === false ? 'NOT APPLIED (screen rotated since it was captured)' : 'being subtracted from every reading'}`
        : '  MOUNT LEVELLING  none — the horizon is reading the device itself',
    );
    line(
      `  accelerometer convention  ${
        fusion.accelSign === null ? 'not yet determined' : fusion.accelSign === 1 ? 'W3C (points up)' : 'NEGATED (iOS/Safari) — corrected'
      }`,
    );
    line();
  }

  // ---- sources ---------------------------------------------------------------
  line('SOURCES');
  const station = f['metar.station'];
  line(`  METAR      ${station?.provenance === 'FAIL' ? `none — ${station.reason}` : `${station?.value} at ${formatValue(f['metar.distanceNm'])} nm, altimeter ${formatValue(f['metar.altimeter'])} inHg`}`);
  if (metar?.last?.reason) line(`             last result: ${metar.last.reason}`);
  const tr = traffic?.last;
  line(
    `  traffic    ${!tr ? 'not asked yet (the radar page fetches on open)' : tr.ok ? `${tr.aircraft?.length ?? 0} aircraft within ${tr.rangeNm} nm of ${tr.centre?.fromFix ? 'the fix' : 'home'}` : `FAILED — ${tr.reason}`}`,
  );
  if (traffic?.isFollowing) {
    line(`  FOLLOWING  ${traffic.followLabel}${traffic.followError ? ` — ${traffic.followError}` : ''}`);
    const a = traffic.followed;
    if (a) line(`             ${a.hex} ${a.registration ?? ''} ${a.type ?? ''}  seen_pos ${a.seenPosS}s ago`);
  }
  line();

  // ---- the device ------------------------------------------------------------
  line('DEVICE');
  line(`  ${env.userAgent ?? 'no user agent'}`);
  line(`  screen ${env.screenW}x${env.screenH} @${env.dpr}x   viewport ${env.viewportW}x${env.viewportH}   angle ${env.screenAngle}°   ${env.orientation ?? ''}`);
  line(`  root font ${env.rootFontPx}px${env.rootFontPx && env.rootFontPx !== 16 ? '  (text size is enlarged)' : ''}`);
  line(`  palette ${env.dim}   standalone ${env.standalone}   service worker ${env.swState}`);
  if (env.wakeLock !== undefined) line(`  wake lock ${env.wakeLock}`);
  line();

  // ---- every field -----------------------------------------------------------
  line('ALL FIELDS');
  line(`  ${pad('path', 30)}${pad('prov', 9)}${pad('value', 14)}${pad('unit', 7)}age`);
  for (const [p, spec] of Object.entries(FIELDS)) {
    const field = f[p];
    let value = formatValue(field);
    if (!precisePosition && (p === 'position.lat' || p === 'position.lon') && field?.provenance !== 'FAIL') {
      value = String(coarse(field.value));
    }
    line(
      `  ${pad(p, 30)}${pad(field?.provenance ?? '—', 9)}${pad(value, 14)}${pad(spec.unit ?? '', 7)}${
        field && field.provenance !== 'FAIL' ? formatAge(field.ageMs) : ''
      }`,
    );
  }
  line();
  line(
    precisePosition
      ? '  (position shown EXACTLY, because the box was ticked)'
      : '  (position rounded to ~1 km; tick the box in the diagnostics panel for the exact fix)',
  );
  line();

  // ---- console ---------------------------------------------------------------
  line(`CONSOLE  (${LOG.length} captured since boot${LOG.length >= LOG_LIMIT ? ', oldest dropped' : ''})`);
  if (!LOG.length) line('  nothing — no errors or warnings');
  for (const entry of LOG) line(`  ${iso(entry.at)}  ${entry.level.toUpperCase()}  ${entry.text}`);

  return out.join('\n');
}

/**
 * The panel itself.
 *
 * A dialog rather than a fifth tab: it is a diagnostic, not an instrument, and
 * it should not take a permanent slot in a tab row a pilot is scanning. Every
 * requirement of Doctrine §4 for an interrupting surface is still met — a
 * dismiss at the top AND the bottom, wired before anything that can throw, and
 * Escape closes it.
 */
export function createDiagnostics({ trigger, build }) {
  let precise = false;

  const body = el('pre', { class: 'diag-body', tabindex: '0', 'aria-label': 'Diagnostic report text' });
  const status = el('p', { class: 'diag-status', role: 'status', 'aria-live': 'polite' });

  const preciseBox = el('input', { type: 'checkbox', id: 'diag-precise', class: 'diag-check' });
  preciseBox.addEventListener('change', () => {
    precise = preciseBox.checked;
    refresh();
  });

  // TWO WAYS OUT (Doctrine §4), with DISTINCT NAMES. Two controls answering to
  // the same accessible name is ambiguous for anyone driving the panel by
  // voice — "tap close" has two answers — and the gate caught exactly that.
  const closeTop = el('button', { class: 'diag-close', type: 'button', text: 'Close' });
  const closeBottom = el('button', { class: 'diag-close diag-close-foot', type: 'button', text: 'Close diagnostics' });

  const copyBtn = el('button', { class: 'diag-action diag-primary', type: 'button', text: 'Copy report' });
  const shareBtn = el('button', { class: 'diag-action', type: 'button', text: 'Share' });
  const saveBtn = el('button', { class: 'diag-action', type: 'button', text: 'Save as file' });

  const dialog = el('dialog', { class: 'diag', 'aria-labelledby': 'diag-h' }, [
    el('div', { class: 'diag-head' }, [
      el('h2', { class: 'diag-title', id: 'diag-h', text: 'Diagnostics' }),
      closeTop,
    ]),
    el('p', {
      class: 'diag-intro',
      text: 'Everything the panel knows right now, as text. Copy it and paste it instead of taking a screenshot.',
    }),
    el('div', { class: 'diag-actions' }, [copyBtn, shareBtn, saveBtn]),
    el('label', { class: 'diag-label', for: 'diag-precise' }, [
      preciseBox,
      el('span', { text: ' Include my exact position (otherwise rounded to about a kilometre)' }),
    ]),
    status,
    body,
    closeBottom,
  ]);
  document.body.append(dialog);

  const refresh = () => {
    body.textContent = build({ precisePosition: precise });
  };

  const close = () => {
    dialog.close?.();
    dialog.hidden = true;
    trigger.focus();
  };
  for (const b of [closeTop, closeBottom]) b.addEventListener('click', close);

  const open = () => {
    refresh();
    dialog.hidden = false;
    status.textContent = '';
    try {
      if (typeof dialog.showModal === 'function' && !dialog.matches(':modal')) dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
    copyBtn.focus();
  };

  copyBtn.addEventListener('click', async () => {
    const text = body.textContent;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied. Paste it wherever you are reporting the problem.';
    } catch (err) {
      // Clipboard write can be refused; selecting the text is a real fallback
      // and is better than saying "copy failed" and stopping.
      const range = document.createRange();
      range.selectNodeContents(body);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      status.textContent = `Could not copy automatically (${err.message}). The report is selected — copy it by hand.`;
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (!navigator.share) {
      status.textContent = 'This browser has no share sheet. Use Copy or Save instead.';
      return;
    }
    try {
      await navigator.share({ title: `fauxplane v${VERSION} diagnostics`, text: body.textContent });
      status.textContent = 'Shared.';
    } catch (err) {
      if (err?.name !== 'AbortError') status.textContent = `Share failed: ${err.message}`;
    }
  });

  saveBtn.addEventListener('click', () => {
    const blob = new Blob([body.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `fauxplane-${VERSION}-diagnostics.txt` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    status.textContent = 'Saved.';
  });

  trigger.addEventListener('click', open);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  return { open, close, refresh, get text() { return body.textContent; } };
}
