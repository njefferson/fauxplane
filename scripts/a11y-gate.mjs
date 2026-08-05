#!/usr/bin/env node
/**
 * a11y-gate.mjs — the accessibility and acceptance gate.
 *
 * IT EXITS NON-ZERO ON ANY FAILURE. That single property is the difference
 * between a gate and a reporter, and this family has already shipped a
 * documented gate that printed "FAIL" and exited 0 for months (Doctrine §4).
 *
 * WHAT IT COVERS, and why each one is here rather than trusted:
 *
 *   1. axe-core on every page, in BOTH measured palettes, at three viewports
 *      including the small-phone-at-200%-text case.
 *   2. A CONTRAST REGISTRY read from REAL PIXELS — the text colour as computed,
 *      against the backdrop sampled from a screenshot taken with that text
 *      hidden. A selector that matches nothing FAILS the build; renaming a
 *      class must not silently remove coverage.
 *   3. Touch targets, with WCAG 2.2 SC 2.5.8's inline-in-a-sentence exemption
 *      applied AND every exempted element NAMED, never silently.
 *   4. The PANEL POWER surface: the way out is visible in the first frame,
 *      still on screen at the very bottom, wins its own hit test, actually
 *      REMOVES the surface, lands focus somewhere real, and the panel is under
 *      a stated height.
 *   5. THE FOUR ACCEPTANCE CRITERIA the spec names, as assertions rather than
 *      as claims — including the one that matters most: with every permission
 *      denied, no readout anywhere on the panel is showing digits.
 *   6. No console errors, anywhere, in any of it.
 *
 * MAKE IT FAIL BEFORE YOU BELIEVE IT (Doctrine §6, LESSONS 7g). Every check
 * here was planted against: see scripts/plant.mjs, which breaks one specific
 * thing at a time and asserts that this gate, and only the relevant check, goes
 * red. A check written alongside its code inherits the author's framing and
 * tends to measure something ADJACENT to its claim.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createStaticServer } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const AXE = path.join(REPO, 'node_modules', 'axe-core', 'axe.min.js');

const { values: argv } = parseArgs({
  options: { verbose: { type: 'boolean', default: false }, quick: { type: 'boolean', default: false } },
});

const failures = [];
const notes = [];
const exemptions = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const note = (message) => notes.push(message);

/* ------------------------------------------------------------------ config */

const ALL_VIEWPORTS = [
  { name: 'tablet-landscape', width: 1024, height: 768, fontScale: 1 },
  { name: 'phone-landscape', width: 740, height: 360, fontScale: 1 },
  // A reader at 200% text is, in layout terms, on a much smaller screen. This
  // is the case that broke a sibling app's card so it would not open at all.
  { name: 'small-phone-200pct', width: 390, height: 640, fontScale: 2 },
];

/**
 * --quick runs ONE viewport and ONE palette, with every check type intact. It
 * exists for scripts/plant.mjs, which runs the gate once per planted fault and
 * would otherwise take ten minutes to prove eight things. A check that fires
 * under --quick fires under the full matrix — the matrix widens coverage, it
 * does not change which checks exist. The gate that guards a release is the
 * full one.
 */
const VIEWPORTS = argv.quick ? [ALL_VIEWPORTS[0]] : ALL_VIEWPORTS;

const PAGES = ['pfd', 'atis', 'radar', 'bite', 'setup'];

/**
 * A traffic response in the shape /api/traffic emits, so the radar page renders
 * WITH AIRCRAFT rather than empty.
 *
 * A plan view with nothing on it exercises none of the code that matters: the
 * symbols, the labels, their contrast against the surface, and the aircraft
 * list's buttons and target sizes. This is the same argument scripts/preview.mjs
 * makes about the horizon — a gate that only ever sees one state has only ever
 * checked one state.
 *
 * It says NOTHING about whether the live adsb.fi response looks like this. That
 * cannot be checked from here and is recorded in NOTES.md as unverified.
 */
/**
 * The plausible route, in the shape `/api/route` answers with.
 *
 * `plausible: true` is the case that matters. adsb.lol infer a route from the
 * callsign and that word is theirs; the check below exists to prove it reaches
 * the screen as text a reader can actually read.
 */
const ROUTE_FIXTURE = {
  ok: true,
  source: 'adsb.lol',
  sourceUrl: 'https://adsb.lol',
  attribution: 'Route data from adsb.lol (ODbL) — plausible, inferred from the callsign',
  callsign: 'UAL328',
  origin: { code: 'KSFO', name: 'San Francisco International', lat: 37.6188, lon: -122.3754 },
  destination: { code: 'KJFK', name: 'John F Kennedy International', lat: 40.6398, lon: -73.7789 },
  via: [],
  plausible: true,
  probe: { status: 200, topLevelKeys: ['routes'], entryKeys: ['callsign', 'airport_codes', '_airports'], entries: 1 },
};

const TRAFFIC_FIXTURE = {
  ok: true,
  source: 'adsb.lol',
  sourceUrl: 'https://adsb.lol',
  attribution: 'Aircraft data from adsb.lol (ODbL)',
  query: { lat: 38.7, lon: -121.0, distNm: 40 },
  upstreamTime: '2026-08-02T15:04:05.000Z',
  fetchedAt: '2026-08-02T15:04:05.000Z',
  count: 3,
  aircraft: [
    {
      hex: 'a1b2c3',
      callsign: 'UAL328',
      registration: 'N77261',
      type: 'B739',
      lat: 38.9,
      lon: -121.15,
      altBaroFt: 34000,
      altGeomFt: 34350,
      onGround: false,
      groundspeedKt: 452,
      trackDeg: 118,
      headingDeg: null,
      verticalRateFpm: -1216,
      squawk: '2451',
      seenPosS: 1.2,
      seenS: 0.4,
    },
    {
      hex: 'ab1201',
      callsign: 'SWA1509',
      registration: 'N8654B',
      type: 'B738',
      lat: 38.5,
      lon: -120.72,
      altBaroFt: 12250,
      altGeomFt: 12600,
      onGround: false,
      groundspeedKt: 331,
      trackDeg: 302,
      headingDeg: 297,
      verticalRateFpm: 2240,
      squawk: '4703',
      seenPosS: 3.9,
      seenS: 1.1,
    },
    // An aircraft on the ground with no callsign and no track: the case that
    // must NOT be drawn as a triangle pointing somewhere it is not going.
    {
      hex: 'a99f10',
      callsign: null,
      registration: 'N172SP',
      type: 'C172',
      lat: 38.69,
      lon: -121.06,
      altBaroFt: null,
      altGeomFt: null,
      onGround: true,
      groundspeedKt: 0,
      trackDeg: null,
      headingDeg: null,
      verticalRateFpm: null,
      squawk: '1200',
      seenPosS: 8.5,
      seenS: 2.2,
    },
  ],
};
const DIMS = argv.quick ? ['day'] : ['day', 'night'];

/**
 * THE CONTRAST REGISTRY. Every foreground/background pair the app renders as
 * text or as a load-bearing edge. A selector matching nothing is a FAILURE, not
 * a skip — that is what makes "added to the gate in the same commit" mean
 * something.
 *
 * `page` limits a row to the panel page where the element exists.
 */
const REGISTRY = [
  { selector: '.stamp', label: 'build stamp', min: 4.6 },
  { selector: '.tab[aria-selected="true"]', label: 'selected tab', min: 4.6 },
  { selector: '.tab[aria-selected="false"]', label: 'unselected tab', min: 4.6 },
  { selector: '.dim-label', label: 'brightness label', min: 4.6 },
  { selector: '.dim-note', label: 'brightness note', min: 4.6 },
  { selector: '.foot-item', label: 'footer text', min: 4.6 },
  { selector: '.foot-link', label: 'footer link', min: 4.6 },
  { selector: '.ro-label', label: 'readout label', min: 4.6, page: 'pfd' },
  { selector: '.ro-figure', label: 'readout value', min: 4.6, page: 'pfd' },
  { selector: '.ro-unit', label: 'readout unit', min: 4.6, page: 'pfd' },
  { selector: '.ro-reason', label: 'readout failure reason', min: 4.6, page: 'pfd' },
  { selector: '.chip-fail', label: 'FAIL chip', min: 4.6, page: 'pfd' },
  // The airframe picker (Doctrine §4: a new fg/bg pair joins the gate in the
  // same commit as the code that renders it). Both states, because a pressed
  // button changes BOTH its fill and its text colour.
  // The TCAS altitude band, both states (§4).
  { selector: ".radar-band-btn[aria-pressed='true']", label: 'altitude band (selected)', min: 4.6, page: 'radar' },
  { selector: ".radar-band-btn[aria-pressed='false']", label: 'altitude band (unselected)', min: 4.6, page: 'radar' },
  { selector: ".radar-pick[aria-pressed='true']", label: 'airframe picker (selected)', min: 4.6, page: 'radar' },
  { selector: ".radar-pick[aria-pressed='false']", label: 'airframe picker (unselected)', min: 4.6, page: 'radar' },
  // The centre picker's resting state (§4, same commit). Its typed states —
  // the field with a value in it, the match buttons, the clear button — are
  // measured by checkCentrePicker, which has to type before they exist.
  { selector: '.radar-centre-label', label: 'centre picker label', min: 4.6, page: 'radar' },
  { selector: '.radar-centre-note', label: 'centre picker note', min: 4.6, page: 'radar' },
  // The power annunciator, both states (§4: a new fg/bg pair joins the gate in
  // the same commit). The LIT state is the one that matters — an annunciator
  // nobody can read is worse than no annunciator.
  { selector: ".power-btn[aria-checked='false'] .power-state", label: 'power annunciator (OFF, lit)', min: 4.6, page: 'pfd' },
  { selector: '.power-word', label: 'power switch legend', min: 4.6, page: 'pfd' },
  { selector: '.setup-body', label: 'setup body text', min: 4.6, page: 'setup' },
  { selector: '.setup-caution', label: 'setup caution (amber)', min: 4.6, page: 'setup' },
  { selector: ".pfd-range-btn[aria-pressed='true']", label: 'PFD range (selected)', min: 4.6, page: 'pfd' },
  { selector: ".pfd-range-btn[aria-pressed='false']", label: 'PFD range (unselected)', min: 4.6, page: 'pfd' },
  { selector: '#pfd-level', label: 'PFD levelling button', min: 4.6, page: 'pfd' },
  { selector: '.pfd-level-status', label: 'PFD levelling state', min: 4.6, page: 'pfd' },
  { selector: '.setup-current', label: 'setup levelling state', min: 4.6, page: 'setup' },
  { selector: '.setup-btn', label: 'setup button', min: 4.6, page: 'setup' },
  { selector: '.atis-station', label: 'ATIS station line', min: 4.6, page: 'atis' },
  { selector: '.atis-source', label: 'ATIS source line', min: 4.6, page: 'atis' },
  { selector: '.koll-value', label: 'Kollsman value', min: 4.6, page: 'atis' },
  { selector: '.koll-unit', label: 'Kollsman unit', min: 4.6, page: 'atis' },
  { selector: '.koll-note', label: 'Kollsman note', min: 4.6, page: 'atis' },
  { selector: '.koll-label', label: 'Kollsman input label', min: 4.6, page: 'atis' },
  { selector: '.bite-intro', label: 'BITE intro', min: 4.6, page: 'bite' },
  { selector: '.bite-summary', label: 'BITE summary', min: 4.6, page: 'bite' },
  { selector: '.bite-label', label: 'BITE entry label', min: 4.6, page: 'bite' },
  { selector: '.bite-reason', label: 'BITE entry reason', min: 4.6, page: 'bite' },
  { selector: '.bite-item[data-status="FAIL"] .bite-mark', label: 'BITE FAIL mark', min: 4.6, page: 'bite' },
];

/** Registry for the PANEL POWER surface, which is only present before dismissal. */
/**
 * The (i) menu's text, measured WHERE IT NOW LIVES.
 *
 * These rows used to be the power gate's, because the first-run text was on a
 * modal. The modal is gone — Noah: "'Switch the panel on' still takes all
 * attention on the initial pop-up and reads like 'accept the terms'" — and the
 * text moved into the (i) dialog. The rows moved with it rather than being
 * deleted, which is the difference between relocating coverage and losing it.
 */
/**
 * The centre picker's TYPED states. None of these exist until someone types, so
 * they cannot live in the page sweep — checkCentrePicker types first, then runs
 * this. That is the same relocation as INFO_REGISTRY: the coverage moves to
 * where the pixels are rather than being dropped for being awkward to reach.
 */
/**
 * The update strip (Doctrine §7h.2). Hidden until a worker is waiting, so it is
 * measured by checkUpdateStrip after that state is forced — the same reason
 * INFO_REGISTRY and CENTRE_REGISTRY exist rather than sitting in the page sweep.
 */
const UPDATE_REGISTRY = [
  { selector: '.update-text', label: 'update strip text', min: 4.6 },
  { selector: '.update-go', label: 'update strip accept', min: 4.6 },
  { selector: '.update-later', label: 'update strip dismiss', min: 4.6 },
];

const CENTRE_REGISTRY = [
  { selector: '.radar-centre-input', label: 'centre picker field', min: 4.6 },
  { selector: '.radar-centre-hit', label: 'centre picker match', min: 4.6 },
  { selector: '.radar-centre-clear', label: 'centre picker reset', min: 4.6 },
];

const INFO_REGISTRY = [
  { selector: '.gate-first-h', label: 'first-run heading', min: 4.6 },
  { selector: '.gate-pages dt', label: 'first-run page name', min: 4.6 },
  { selector: '.gate-pages dd', label: 'first-run page description', min: 4.6 },
  { selector: '.gate-body', label: 'first-run body', min: 4.6 },
  { selector: '.gate-uses li', label: 'the three uses', min: 4.6 },
  { selector: '.info-title', label: 'info dialog title', min: 4.6 },
  { selector: '.info-h', label: 'info section heading', min: 4.6 },
  { selector: '.info-body', label: 'info body', min: 4.6 },
  { selector: '.info-sources li', label: 'data source', min: 4.6 },
  { selector: '.info-close', label: 'info close button', min: 4.6 },
];

/* ------------------------------------------------------- colour arithmetic */

const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const parseRgb = (s) => {
  const n = (String(s).match(/[\d.]+/g) ?? []).map(Number);
  return n.length >= 3 ? n.slice(0, 3) : null;
};

/* ---------------------------------------------------------------- helpers */

/**
 * Sample real backdrop pixels.
 *
 * Computed style lies about backgrounds (PALETTES §7: a gradient page reports
 * as transparent and a walk up the tree falls through to a wrong fallback), so
 * the backdrop is read off an actual screenshot taken with the registered text
 * HIDDEN. The decoding happens inside the page, which is why the CSP allows
 * `img-src data:`.
 */
async function sampleBackdrops(page, boxes) {
  const shot = await page.screenshot({ type: 'png', fullPage: true });
  const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;
  return page.evaluate(
    async ({ url, points, dpr }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return points.map((p) => {
        // Sample a small patch and take the LIGHTEST pixel found: over a mixed
        // backdrop the worst case for light text is the lightest thing under it.
        let best = null;
        let bestLum = -1;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const x = Math.round(p.x * dpr) + dx;
            const y = Math.round(p.y * dpr) + dy;
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
            const d = ctx.getImageData(x, y, 1, 1).data;
            const l = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
            if (l > bestLum) {
              bestLum = l;
              best = [d[0], d[1], d[2]];
            }
          }
        }
        return best;
      });
    },
    { url: dataUrl, points: boxes, dpr: page.viewportSize() ? 1 : 1 },
  );
}

/**
 * Run the contrast registry for one page state.
 *
 * Scroll containers are EXPANDED first. A registered element sitting below the
 * fold of an inner scroller is absent from any screenshot, and "could not
 * determine a backdrop" would then be reported as a failure of the colour
 * rather than of the instrument — which is the trap PALETTES §7 is a list of.
 * Expanding costs nothing here because only colours are being read.
 */
const EXPAND = '.page-cards, .readouts, .page-pfd, .gate, .info, .diag, .panel, body, html';

async function checkContrast(page, registry, where) {
  const restore = await page.evaluate((sel) => {
    // A MODAL <dialog> LIVES IN THE TOP LAYER, which is painted relative to the
    // VIEWPORT and is not part of the document flow at all. A full-page
    // screenshot therefore captures only the part of it that fits on screen;
    // everything below the fold shows the page behind, so sampling a coordinate
    // down there reads an unpainted pixel and returns near-white. That is what
    // reported the first-run text at 1.37:1 against a backdrop it is not on.
    //
    // `position: static` cannot fix this — top-layer membership is not a
    // positioning property. The dialog has to be demoted to a plain open
    // dialog, which puts it back in normal flow, and promoted again after.
    const modals = [];
    for (const d of document.querySelectorAll('dialog')) {
      if (d.matches(':modal')) {
        modals.push(d);
        d.close();
        d.setAttribute('open', '');
      }
    }
    window.__gateModals = modals;

    const saved = [];
    for (const n of document.querySelectorAll(sel)) {
      saved.push([n, n.style.overflow, n.style.height, n.style.maxHeight, n.style.position, n.style.margin]);
      n.style.overflow = 'visible';
      n.style.height = 'auto';
      n.style.maxHeight = 'none';
      // A FIXED OVERLAY TALLER THAN THE VIEWPORT CANNOT BE SCREENSHOTTED.
      //
      // The power gate is `position: fixed; inset: 0; margin: auto`. Expanding
      // it to its full height leaves it auto-centred against the viewport, so
      // half of it sits at NEGATIVE document coordinates where a full-page
      // screenshot does not reach — and the sampler then read whatever pixel
      // happened to be at those coordinates instead. It reported the first-run
      // text at 1.37:1 against a backdrop that text is not on.
      //
      // Dropping it into normal flow puts every line at a real document
      // coordinate. This gate could not measure ANY fixed overlay longer than
      // the screen until now, which is precisely where first-run copy lives.
      if (getComputedStyle(n).position === 'fixed') {
        n.style.position = 'static';
        n.style.margin = '0';
      }
    }
    window.__gateRestore = saved;
    return saved.length;
  }, EXPAND);
  if (restore === 0) fail(where, 'no scroll containers matched the expand selector — the sampler cannot be trusted');

  /**
   * MEASURE AND CAPTURE UNDER ONE LAYOUT.
   *
   * `page.screenshot({ fullPage: true })` grows the viewport to the document
   * height to take the shot. Any layout that depends on viewport height —
   * percentage heights, flex distribution down a column, a panel sized to fill
   * the screen — REFLOWS while it does. So coordinates read beforehand at a
   * 768px viewport were being sampled out of an image laid out at 1030px, and
   * pointed at whatever had slid into that spot.
   *
   * It surfaced as `power annunciator measured 1.00:1` — a foreground compared
   * against its own colour, which is what happens when the pixel sampled for
   * the BACKDROP is the element's own text, still painted a hundred pixels from
   * where the measurement said it was. Nothing was wrong with the colour, the
   * element, or the hiding; the gate was reading two different layouts and
   * could not have known.
   *
   * Growing the viewport FIRST makes the later fullPage capture a no-op and the
   * two agree by construction. Capped, because a very tall document would
   * otherwise mint an enormous screenshot for every registry row on every page.
   */
  const vp = page.viewportSize();
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const tall = Math.min(Math.max(docHeight, vp.height), 4000);
  if (tall > vp.height) await page.setViewportSize({ width: vp.width, height: tall });

  const found = await page.evaluate((rows) => {
    return rows.map((row) => {
      const onScreen = [...document.querySelectorAll(row.selector)].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
      });
      // A FORM FIELD HAS NO textContent, so this registry was structurally
      // blind to every input in the app: registering one reported "selector
      // matched nothing", which reads as a missing element rather than as a
      // gate that cannot see it. Its rendered text is its VALUE — never its
      // placeholder, which is drawn in a different colour by `::placeholder`
      // and would have this measure a pair that is not on screen.
      const nodes = onScreen.filter((n) =>
        n.matches('input, textarea, select')
          ? String(n.value ?? '').trim().length > 0
          : n.textContent.trim().length > 0,
      );
      if (!nodes.length) {
        return {
          ...row,
          matched: 0,
          why: onScreen.length
            ? `${onScreen.length} matched but carried no text — a registered field must be measured with a real value typed into it`
            : null,
        };
      }
      const n = nodes[0];
      const r = n.getBoundingClientRect();
      const s = getComputedStyle(n);
      return {
        ...row,
        matched: nodes.length,
        colour: s.color,
        // Opacity is invisible to a contrast gate, which is exactly how two
        // sibling apps shipped a 2.54:1 build stamp. If anything on a
        // registered element is translucent, say so and fail.
        opacity: Number(s.opacity),
        // ABSOLUTE document coordinates, to match a full-page screenshot.
        x: r.x + window.scrollX + Math.min(r.width / 2, 8),
        y: r.y + window.scrollY + r.height / 2,
      };
    });
  }, registry);

  const live = found.filter((f) => f.matched > 0);
  for (const miss of found.filter((f) => f.matched === 0)) {
    fail(
      where,
      `contrast registry selector matched nothing: ${miss.selector} (${miss.label})${miss.why ? ` — ${miss.why}` : ''}`,
    );
  }
  if (!live.length) return;

  // Hide the registered text, screenshot, sample, restore.
  //
  // A FORM FIELD PAINTS ITS OWN BACKGROUND, so `visibility: hidden` would take
  // the fill away with the text and the sampler would read the card behind it —
  // measuring the field's text against a colour it is not on. Blanking the
  // value leaves the box painted and removes only the ink.
  await page.evaluate((rows) => {
    const blanked = [];
    for (const row of rows) {
      for (const n of document.querySelectorAll(row.selector)) {
        if (n.matches('input, textarea, select')) {
          blanked.push([n, n.value, n.placeholder]);
          n.value = '';
          n.placeholder = '';
        } else {
          n.style.visibility = 'hidden';
        }
      }
    }
    window.__gateBlanked = blanked;
  }, registry);
  const backdrops = await sampleBackdrops(
    page,
    live.map((f) => ({ x: f.x, y: f.y })),
  );
  await page.evaluate((rows) => {
    for (const row of rows) for (const n of document.querySelectorAll(row.selector)) n.style.visibility = '';
    for (const [n, value, placeholder] of window.__gateBlanked ?? []) {
      n.value = value;
      n.placeholder = placeholder;
    }
    window.__gateBlanked = [];
    for (const [n, overflow, height, maxHeight, position, margin] of window.__gateRestore ?? []) {
      n.style.overflow = overflow;
      n.style.height = height;
      n.style.maxHeight = maxHeight;
      n.style.position = position;
      n.style.margin = margin;
    }
    for (const d of window.__gateModals ?? []) {
      d.removeAttribute('open');
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    }
    window.__gateModals = [];
    window.__gateRestore = [];
  }, registry);
  if (tall > vp.height) await page.setViewportSize(vp);

  live.forEach((entry, i) => {
    const fg = parseRgb(entry.colour);
    const bg = backdrops[i];
    if (!fg || !bg) {
      // Never guess a background. If no opaque colour can be determined the run
      // FAILS rather than assuming one.
      fail(where, `${entry.label}: could not determine a real backdrop colour`);
      return;
    }
    if (Number.isFinite(entry.opacity) && entry.opacity < 1) {
      fail(where, `${entry.label}: dimmed with opacity ${entry.opacity} — use a colour token, opacity is invisible to this gate`);
      return;
    }
    const ratio = contrast(fg, bg);
    if (ratio < entry.min) {
      fail(where, `${entry.label} measured ${ratio.toFixed(2)}:1 against the real backdrop (floor ${entry.min})`);
    } else if (argv.verbose) {
      note(`${where}: ${entry.label} ${ratio.toFixed(2)}:1`);
    }
  });
}

/**
 * EVERY CHECK BUT ONE IS A RETURNING READER.
 *
 * The first-run orientation opens the (i) dialog on a profile that has never
 * seen it (Doctrine §7e) — which is a MODAL, so in a fresh Playwright context
 * it sits over the panel and every other check measures the dialog instead of
 * the page. It presented as ten contrast failures at 1.0:1, a radar tap that
 * did nothing, and a picker that found no airports: the symptoms of a surface
 * nobody knew was there, which is exactly how a modal fails a test suite.
 *
 * So each context declares which it is. `seenIntro` is the returning reader and
 * is the default everywhere; `checkFirstRunIntro` is the one context that does
 * NOT call it, and is therefore the only place the dialog can appear.
 */
async function seenIntro(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('fauxplane:intro-seen', 'yes');
    } catch {
      /* private mode: the app treats a refused store as already seen */
    }
  });
  return context;
}

/** Touch targets, with the inline-in-a-sentence exemption applied and NAMED. */
async function checkTargets(page, where) {
  const results = await page.evaluate(() => {
    const out = [];
    const selectors = 'a[href], button, input, select, textarea, [role="tab"], [tabindex]:not([tabindex="-1"])';
    const indexOf = new Map();
    for (const n of document.querySelectorAll(selectors)) {
      const r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none') continue;

      // SC 2.5.8's exception: a target inline in a sentence, whose height the
      // surrounding line constrains. Forcing 44px mid-paragraph breaks the text
      // flow and makes the page worse.
      const inlineInText =
        s.display.startsWith('inline') &&
        !!n.parentElement &&
        n.parentElement.textContent.trim().length > n.textContent.trim().length;

      out.push({
        tag: n.tagName.toLowerCase(),
        node: n,
        name: (n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        inlineInText,
        // MEASURE THE EFFECTIVE HIT AREA, NOT THE BOX (PALETTES §7). A box can
        // extend past its own scroll clip, or sit behind an open modal, and in
        // both cases the geometry says "overlap" while nothing is reachable
        // there. Hit-testing the centre is what the user's finger actually does.
        hitIsSelf: (() => {
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return false;
          const hit = document.elementFromPoint(cx, cy);
          return !!hit && (n === hit || n.contains(hit));
        })(),
      });
      indexOf.set(n, out.length - 1);
    }
    // Record containment so the spacing check can tell "two controls that
    // overlap" from "a focusable scroll region that contains its own buttons".
    // Without this, every tabpanel is reported as overlapping everything in it.
    for (const [n, i] of indexOf) {
      out[i].contains = [...indexOf.entries()].filter(([m]) => m !== n && n.contains(m)).map(([, j]) => j);
    }
    for (const entry of out) delete entry.node;
    return out;
  });

  for (const t of results) {
    if (t.inlineInText) {
      exemptions.push(`${where}: SC 2.5.8 inline exemption applied to <${t.tag}> "${t.name}" (${t.w}x${t.h})`);
      continue;
    }
    if (t.w < 44 || t.h < 44) {
      fail(where, `target <${t.tag}> "${t.name}" is ${t.w}x${t.h}, under the 44px floor`);
    }
  }

  // Spacing: what tremor does is OVERSHOOT, so adjacent targets need clear air.
  for (let i = 0; i < results.length; i += 1) {
    for (let j = i + 1; j < results.length; j += 1) {
      const a = results[i];
      const b = results[j];
      if (a.inlineInText || b.inlineInText) continue;
      // A focusable container legitimately encloses its own controls.
      if (a.contains?.includes(j) || b.contains?.includes(i)) continue;
      // Only compare things a finger could actually land on.
      if (!a.hitIsSelf || !b.hitIsSelf) continue;
      const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
      const dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
      if (dx < -1 && dy < -1) fail(where, `targets "${a.name}" and "${b.name}" overlap`);
    }
  }
}

async function runAxe(page, where) {
  // Served same-origin by the gate's own server: the real CSP is script-src
  // 'self', and it correctly refuses an injected inline script. Weakening the
  // policy for the gate would be testing a policy the deploy does not have.
  await page.addScriptTag({ url: '/__gate__/axe.js' });
  const result = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return axe.run(document, { resultTypes: ['violations'] });
  });
  for (const v of result.violations) {
    fail(where, `axe ${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)] — ${v.nodes[0]?.target?.join(' ')}`);
  }
}

/** Distinct accessible names: two controls answering to one name is a coin toss
 *  for anyone driving by voice (Doctrine §4). */
async function checkNames(page, where) {
  const names = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll('a[href], button, input, [role="tab"]')) {
      const r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // An accessible name can come from aria-label, from the element's own
      // text, or from an associated <label for>. Reading only the first two
      // reports a correctly labelled input as nameless.
      const associated = n.id ? document.querySelector(`label[for="${CSS.escape(n.id)}"]`) : null;
      const label = n.getAttribute('aria-label');
      const visible = (n.textContent || associated?.textContent || '').trim();
      out.push({ name: (label || visible || n.getAttribute('title') || '').trim().toLowerCase(), label, visible });
    }
    return out;
  });

  const seen = new Map();
  for (const n of names) {
    if (!n.name) continue;
    seen.set(n.name, (seen.get(n.name) ?? 0) + 1);
    // SC 2.5.3: when a control shows words AND carries an aria-label, the
    // visible words must appear in that label.
    // SC 2.5.3 is about a control whose visible label is WORDS. A control
    // labelled only by a symbol ("+", "−", "✕") has no text for the label to
    // be about, and the criterion excludes it — Doctrine §4 names that
    // exclusion. The rule was checked against the case before the buttons were
    // edited to please it (PALETTES §7: a rule can be right and over-applied).
    const hasWords = /[a-z0-9]/i.test(n.visible);
    if (n.label && hasWords && !n.label.toLowerCase().includes(n.visible.toLowerCase())) {
      fail(where, `SC 2.5.3: control shows "${n.visible}" but its aria-label "${n.label}" does not contain it`);
    }
  }
  for (const [name, count] of seen) {
    if (count > 1) fail(where, `two or more controls answer to the accessible name "${name}"`);
  }
}

/* --------------------------------------------------------------- the run */

async function main() {
  const server = await createStaticServer({
    extraRoutes: { '/__gate__/axe.js': AXE },
    apiStubs: {
      '/api/traffic': TRAFFIC_FIXTURE,
      /**
       * METAR AND WINDS ARE STUBBED AS HONEST FAILURES, not as fake weather.
       *
       * They are Pages Functions and are not running in the harness, so the
       * server's default is a 503 — which the browser logs, and "no console
       * errors" is acceptance criterion 1. Nothing noticed until the power
       * switch replaced the gate: the old gate check pressed DISMISS, so the
       * feeds never started and never 503'd. Pressing a real PWR switch starts
       * them, which is the point of it.
       *
       * A refusal is the truthful answer here — the endpoint genuinely is not
       * deployed — and it exercises the panel's failure path, which is the one
       * worth checking anyway. Inventing an observation would put a synthetic
       * altimeter setting into a panel whose entire contract forbids it.
       */
      '/api/metar': { ok: false, reason: 'the weather service is not deployed in this harness' },
      '/api/winds': { ok: false, reason: 'the winds service is not deployed in this harness' },
    },
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ executablePath: EXECUTABLE });

  try {
    /* ---- 1. every page, both palettes, three viewports ------------------ */
    for (const vp of VIEWPORTS) {
      for (const dim of DIMS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          // Every permission denied. This is the acceptance-criterion-1 state
          // AND the state the whole sweep runs in, so nothing here is passing
          // because a sensor happened to be available.
          permissions: [],
        });
        await seenIntro(context);
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text());
        });
        page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

        // 200% text is modelled the way a reader actually sets it: the root
        // font size, which is what rem-sized type responds to.
        if (vp.fontScale !== 1) {
          await page.addInitScript((scale) => {
            document.addEventListener('DOMContentLoaded', () => {
              document.documentElement.style.fontSize = `${16 * scale}px`;
            });
          }, vp.fontScale);
        }

        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        await page.evaluate((d) => {
          document.documentElement.dataset.dim = d;
        }, dim);

        /* ---- the PANEL POWER surface, checked before it is dismissed ---- */
        if (vp === VIEWPORTS[0] && dim === 'day') {
          await checkPanelPower(page, base);
          await checkInfoMenu(page, base);
        }

        // No gate to dismiss: the panel is the first surface (PWR is a switch on it).
        await page.waitForTimeout(250);

        for (const name of PAGES) {
          const where = `${vp.name}/${dim}/${name}`;
          await page.evaluate((n) => document.querySelector(`[data-page="${n}"]`).click(), name);
          await page.waitForTimeout(200);

          await runAxe(page, where);
          await checkTargets(page, where);
          await checkNames(page, where);

          // No blank screens: the visible panel must actually have painted
          // something. A page that renders nothing passes every check above.
          const painted = await page.evaluate((n) => {
            const el = document.getElementById(`page-${n}`);
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim().length };
          }, name);
          if (painted.w < 100 || painted.h < 60) fail(where, `panel box is ${painted.w}x${painted.h} — effectively invisible`);

          /**
           * EVERY `hidden` ELEMENT IS ACTUALLY HIDDEN, measured rather than
           * believed.
           *
           * An author `display:` rule outranks the user agent's
           * `[hidden] { display: none }`, so an element can carry the attribute
           * and be painted at full size. It has happened three times in this
           * app — `.page`, `.follow-banner`, and `.update`, where a first-time
           * visitor was shown an update offer for the build they had just
           * installed. Each was fixed for that one class, and the next new
           * element repeated it, because nothing was LOOKING.
           *
           * This is the check that makes the global `[hidden]` rule hold: any
           * future component that sets `display` and forgets is caught on the
           * release that introduces it rather than three releases later.
           */
          const painted_hidden = await page.evaluate(() =>
            [...document.querySelectorAll('[hidden]')]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
              })
              .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`),
          );
          for (const el of painted_hidden) {
            fail(where, `<${el}> carries the hidden attribute and is painted anyway — an author display: rule is outranking [hidden]`);
          }
          if (name !== 'pfd' && painted.text < 40) fail(where, `panel rendered only ${painted.text} characters — blank screen`);

          // THE MISSING-TOKEN SENTINEL, and this is the check that should have
          // existed the day it was invented.
          //
          // Every gauge takes its colour from a CSS custom property and falls
          // back to magenta when one cannot be read, deliberately hideous so it
          // gets noticed. Nothing ever LOOKED. The radar canvas read its tokens
          // while its page was still hidden — where getComputedStyle returns
          // empty for every property — cached the result, and shipped as a solid
          // magenta rectangle through several releases. Axe cannot see into a
          // canvas and neither could any check here, so every gate stayed green
          // about a screen that was one flat colour.
          const sentinel = await page.evaluate(() => {
            const bad = [];
            for (const c of document.querySelectorAll('canvas')) {
              const box = c.getBoundingClientRect();
              if (box.width < 4 || box.height < 4) continue; // not on screen
              const ctx = c.getContext('2d');
              if (!ctx || !c.width || !c.height) continue;
              const data = ctx.getImageData(0, 0, c.width, c.height).data;
              // Sample a grid rather than every pixel; the failure mode is a
              // large flat fill, not a stray pixel.
              const step = 4 * Math.max(1, Math.floor((c.width * c.height) / 4000));
              let hits = 0;
              let seen = 0;
              for (let i = 0; i < data.length; i += step) {
                if (data[i + 3] < 8) continue; // transparent
                seen += 1;
                if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) hits += 1;
              }
              if (seen && hits / seen > 0.01) {
                bad.push(
                  `<canvas ${c.id || c.className || '(unnamed)'}> is ${Math.round((hits / seen) * 100)}% missing-token magenta — a colour token could not be read`,
                );
              }
            }
            return bad;
          });
          for (const s of sentinel) fail(where, s);

          /**
           * CONTRAST LAST, because it PERTURBS THE PAGE and the checks above
           * must see what the app produced.
           *
           * It expands scroll containers, demotes modals, hides text, and now
           * grows the viewport to make the measurement and the screenshot agree.
           * That last one fires a resize, which makes this app re-read its
           * canvas colour tokens — and re-reading them HEALS the exact fault the
           * magenta sentinel exists to catch. The canvas plant went from caught
           * to UNPROVEN the moment the viewport grew, with nothing wrong in the
           * app at all: a check had been blunted by another check's side effect.
           *
           * Ordering is the fix rather than un-doing the perturbation, because
           * any of these steps could heal something and listing them here would
           * be a list that goes stale. Measure the app first; mutate it after.
           */
          await checkContrast(
            page,
            REGISTRY.filter((r) => !r.page || r.page === name),
            where,
          );

          // ONE RANGE, TWO SURFACES, CHECKED AS RENDERED. The PFD's range
          // buttons and the RADAR page's drive one value through one setter;
          // this clicks on one surface and reads the OTHER, because the sync
          // is the claim and a grep for setRange would only prove somebody
          // typed it.
          if (name === 'pfd') {
            const sync = await page.evaluate(() => {
              // NO HARDCODED RANGE. This asked for the "25" button, which
              // stopped existing when the steps became the real Boeing ones
              // (10/20/40/80) — and the check then reported a sync failure for
              // a control that was working. Both sides are read from the DOM,
              // so the check follows the app instead of a copy of it.
              const pfdBtns = [...document.querySelectorAll('.pfd-range-btn')];
              if (pfdBtns.length < 2) return { missing: true };
              const pick = pfdBtns[1];
              const nm = pick.textContent.trim();
              pick.click();
              const radarPeer = [...document.querySelectorAll('.radar-range-btn')].find(
                (b) => b.textContent.trim() === `${nm} nm`,
              );
              const out = {
                missing: false,
                nm,
                pfdPressed: pick.getAttribute('aria-pressed'),
                radarPressed: radarPeer?.getAttribute('aria-pressed') ?? 'absent',
              };
              pfdBtns[2]?.click();
              return out;
            });
            if (sync.missing) fail(where, 'the PFD range control is missing');
            else if (sync.pfdPressed !== 'true' || sync.radarPressed !== 'true') {
              fail(where, `range set on the PFD did not reach the radar page: pfd=${sync.pfdPressed} radar=${sync.radarPressed} — two controls showing two different ranges`);
            }
          }

          // THE FIRST-RUN INSTRUCTIONS OUTLIVE THE GATE. Pressing power took
          // them away mid-read; the node MOVES rather than being destroyed, and
          // this checks the destination — this loop runs after the gate was
          // dismissed. The destination changed from the SETUP page to the (i)
          // menu, which is why this asserts the node's presence in the dialog
          // rather than on a page: the invariant is that they survive, not
          // where they landed.
          if (name === 'pfd') {
            const survived = await page.evaluate(() => !!document.querySelector('dialog.info .gate-first'));
            if (!survived) fail(where, 'the first-run instructions did not survive the gate — power-on threw them away again');

            // The one control that reaches all of it must exist and say what
            // it is. An icon-only button with no accessible name is the classic
            // way an information menu becomes unreachable (SC 4.1.2).
            const infoBtn = await page.evaluate(() => {
              const b = document.querySelector('#info-btn');
              if (!b) return null;
              return { name: b.getAttribute('aria-label') ?? '', text: b.textContent.trim() };
            });
            if (!infoBtn) fail(where, 'the (i) menu button is missing');
            else if (!/information/i.test(infoBtn.name)) {
              fail(where, `the (i) button's accessible name does not say what it opens: "${infoBtn.name}"`);
            }
          }

          // THE CITATION, CHECKED AS RENDERED rather than grepped for.
          //
          // This used to search radar.js for the literal "https://adsb.fi",
          // which passed happily while the anchor's href was HARDCODED to a
          // provider that had not supplied the data — a citation that is
          // present, checked, and wrong. Now that a second source exists and
          // either may answer, the only meaningful assertion is that the link
          // on the page points at the source the response actually named.
          // NOTHING ON THE PANEL MAY SIT ON TOP OF ANYTHING ELSE.
          //
          // Every check here passed while the navigation display was drawn
          // straight over the horizon on a portrait phone — measured at
          // y 506-650 inside a canvas spanning 179-685. Contrast, targets,
          // names and axe all look at elements one at a time, so a layout that
          // stacks two of them in the same pixels is invisible to all of it.
          // The cause was a media query written before those wrappers existed;
          // the class of bug is "the gate has no opinion about geometry".
          if (name === 'pfd') {
            const overlaps = await page.evaluate(() => {
              const rect = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return r.width > 1 && r.height > 1 ? { sel, ...r.toJSON() } : null;
              };
              const boxes = ['.pfd-canvas', '.pfd-plan', '.readouts', '.pfd-level'].map(rect).filter(Boolean);
              const bad = [];
              for (let i = 0; i < boxes.length; i += 1) {
                for (let j = i + 1; j < boxes.length; j += 1) {
                  const a = boxes[i];
                  const b = boxes[j];
                  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                  // A couple of pixels is a rounding artefact; a real overlap is
                  // one instrument painted over another.
                  if (ox > 2 && oy > 2) bad.push(`${a.sel} and ${b.sel} overlap by ${Math.round(ox)}x${Math.round(oy)}px`);
                }
              }
              return bad;
            });
            for (const o of overlaps) fail(where, o);
          }

          if (name === 'radar') {
            const credit = await page.evaluate(() => {
              const a = document.querySelector('.radar-credit-link');
              return a
                ? { href: a.getAttribute('href') ?? null, text: (a.textContent ?? '').trim(), tag: a.tagName }
                : null;
            });
            if (!credit) {
              fail(where, 'the radar panel renders no source citation — every provider we use requires one');
            } else if (credit.tag !== 'A' || !credit.href) {
              fail(where, `the radar citation "${credit.text}" is not a link — the terms require a link to the home page`);
            } else if (credit.href !== TRAFFIC_FIXTURE.sourceUrl) {
              fail(
                where,
                `the radar citation links ${credit.href} but the data came from ${TRAFFIC_FIXTURE.sourceUrl} — crediting the wrong source is worse than crediting none`,
              );
            }
          }
        }

        /* ---- the DIAGNOSTICS dialog, in its open state ------------------
           A surface nobody checks open is a surface nobody has checked. It is
           reached from the version stamp rather than from a tab, so the page
           loop above cannot see it — and it is the one place in the app a
           reader is likely to be at 200% text, hunting for a reason string. */
        {
          const where = `${vp.name}/${dim}/diagnostics`;
          await page.evaluate(() => document.getElementById('build-stamp').click());
          await page.waitForTimeout(200);
          const open = await page.evaluate(() => !!document.querySelector('.diag[open], .diag[open=""]'));
          if (!open) fail(where, 'pressing the version stamp did not open the diagnostics dialog');
          await runAxe(page, where);
          await checkTargets(page, where);
          await checkNames(page, where);
          const report = await page.evaluate(() => document.querySelector('.diag-body')?.textContent ?? '');
          // It must contain the version and an actual diagnosis, not a shell.
          if (!report.includes('fauxplane diagnostics')) fail(where, 'the diagnostics report has no header');
          if (!/WHAT IS NOT WORKING/.test(report)) fail(where, 'the report does not lead with what is failing');
          if (!/ALL FIELDS/.test(report)) fail(where, 'the report carries no field table');
          if (report.length < 400) fail(where, `the report is only ${report.length} characters — effectively empty`);
          // It must not carry a precise position unless asked.
          if (/position rounded/.test(report) === false) fail(where, 'the report does not say the position was coarsened');
          await page.evaluate(() => document.querySelector('.diag-close').click());
          await page.waitForTimeout(150);
        }

        /* ---- acceptance criterion 1, asserted rather than claimed ------- */
        if (dim === 'day' && vp === VIEWPORTS[0]) await checkDeniedState(page);

        for (const err of consoleErrors) fail(`${vp.name}/${dim}`, `console error: ${err}`);
        await context.close();
      }
    }

    /* ---- 2. acceptance criterion 2: no secret in the client ------------- */
    await checkNoSecrets(base);

    /* ---- 3. acceptance criterion 4: every readout traces to a field ----- */
    await checkProvenanceCoverage(browser, base);
    await checkStoredLevelling(browser, base);
    // BOTH INPUT MODES. Noah reported tap-to-follow broken on his iPad while
    // this check — which only ever drove a MOUSE — was green. A mouse click
    // and a touch tap are different event paths, and the device this app is
    // built for only has one of them.
    await checkRadarTap(browser, base, { touch: false });
    await checkRadarTap(browser, base, { touch: true });
    await checkCentrePicker(browser, base);
    await checkUpdateStrip(browser);
    await checkFirstRunIntro(browser, base);

    /* ---- 4. the bundled geophysical data actually reaches the panel ----- */
    await checkGeoDataChain(browser, base);
  } finally {
    await browser.close();
    server.close();
  }

  /* ---- report --------------------------------------------------------- */
  for (const line of exemptions) process.stdout.write(`  exempt  ${line}\n`);
  if (argv.verbose) for (const line of notes) process.stdout.write(`  note    ${line}\n`);

  if (failures.length) {
    process.stderr.write(`\n${failures.length} failure(s):\n`);
    for (const f of failures) process.stderr.write(`  FAIL  ${f}\n`);
    process.exit(1);
  }
  process.stdout.write(`\na11y-gate: all checks pass (${VIEWPORTS.length} viewports x ${DIMS.length} palettes x ${PAGES.length} pages)\n`);
}

/**
 * The interrupting surface. Doctrine §4 lists six requirements for a dismiss
 * and says to gate all of it rather than eyeball it.
 */
/**
 * PANEL POWER, now a switch on the panel rather than a dialog in front of it.
 *
 * The old check tested a modal: two dismiss controls, one visible in the first
 * frame, one still reachable at the very bottom, a hit test proving nothing sat
 * on top, and that activating it actually removed the surface. Every one of
 * those existed because a gate you cannot leave is the worst failure a gate
 * has. There is no gate now, so there is nothing to leave — and the property
 * they were all protecting, that a reader can use the panel without granting
 * anything, is the DEFAULT state and is asserted by checkDeniedState.
 *
 * What replaces them is narrower and truer to what now exists: the panel is
 * visible and usable from the first frame, the switch says which state it is in
 * IN WORDS, and the reading material is reachable and legible in the (i) menu
 * where it moved to.
 */
async function checkPanelPower(page, base) {
  const where = 'panel-power';

  const first = await page.evaluate(() => {
    const btn = document.getElementById('power-btn');
    const panel = document.getElementById('panel');
    const pr = panel?.getBoundingClientRect();
    return {
      exists: !!btn,
      role: btn?.getAttribute('role') ?? null,
      checked: btn?.getAttribute('aria-checked') ?? null,
      text: btn?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      // NOTHING COVERS THE PANEL. The whole point of removing the modal is that
      // the instruments are the first thing on screen.
      panelVisible: !!pr && pr.width > 0 && pr.height > 0,
      panelTopHit: pr ? document.elementFromPoint(pr.x + pr.width / 2, pr.y + 10)?.closest('#panel') !== null : false,
      anyModal: !!document.querySelector('dialog:modal'),
    };
  });

  if (!first.exists) {
    fail(where, 'there is no power switch on the panel');
    return;
  }
  if (first.role !== 'switch') fail(where, `the power control has role "${first.role}" — a two-state control is a switch`);
  if (first.checked !== 'false') fail(where, `the panel claims aria-checked="${first.checked}" before anything was pressed`);
  // THE STATE IS A WORD, not a colour (§4). Grayscale and colour-blind readers
  // get the same answer as anyone else.
  if (!/\bOFF\b/i.test(first.text ?? '')) {
    fail(where, `the switch does not say its state in words: "${first.text}"`);
  }
  if (!first.panelVisible) fail(where, 'the panel is not rendered on load');
  if (!first.panelTopHit) fail(where, 'something is covering the panel on load — the modal was removed for exactly this');
  if (first.anyModal) fail(where, 'a modal dialog is open on load');

  // The switch reports its own state honestly after being pressed. Sensors will
  // not actually start in a headless browser with every permission denied, and
  // that is fine — this asserts the CONTROL, not the hardware.
  /**
   * POLLED, NOT SLEPT — the same defect as the update-strip check, found the
   * same way and on the same day.
   *
   * This was `waitForTimeout(250)`, and 250 ms is a guess about how long a
   * browser takes to flip a switch that also starts the sensors, asks for two
   * permissions and requests a wake lock. It is plenty on an idle machine and
   * it is not plenty under load — this check went RED on a promotion candidate
   * and GREEN on the identical tree one minute later.
   *
   * An intermittently-red gate is worse than a broken one: it teaches everyone
   * that red means "run it again". Waiting for the STATE makes the failure mean
   * something — reaching this deadline is a switch that genuinely did not move.
   */
  const readSwitch = () =>
    page.evaluate(() => {
      const btn = document.getElementById('power-btn');
      return { checked: btn.getAttribute('aria-checked'), text: btn.textContent.replace(/\s+/g, ' ').trim() };
    });
  const settleSwitch = async (want) => {
    const deadline = Date.now() + 8000;
    let seen = await readSwitch();
    while (Date.now() < deadline && seen.checked !== want) {
      await page.waitForTimeout(100);
      seen = await readSwitch();
    }
    return seen;
  };

  await page.evaluate(() => document.getElementById('power-btn').click());
  const after = await settleSwitch('true');
  if (after.checked !== 'true') fail(where, 'pressing the switch did not change aria-checked');
  if (!/\bON\b/i.test(after.text)) fail(where, `the switch still reads "${after.text}" after being switched on`);

  // And back off again. A switch that only goes one way is a button wearing a
  // switch's clothes.
  await page.evaluate(() => document.getElementById('power-btn').click());
  const back = await settleSwitch('false');
  if (back.checked !== 'false' || !/\bOFF\b/i.test(back.text)) {
    fail(where, `the switch will not go back off: aria-checked=${back.checked}, text "${back.text}"`);
  }

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
}

/**
 * The (i) menu — reachable, and its text legible where it now lives.
 *
 * The first-run copy used to be measured on the power gate. It moved here, and
 * the contrast rows moved with it rather than being deleted, because deleting
 * them would have quietly removed coverage at the same moment the content
 * became harder to find.
 */
async function checkInfoMenu(page, base) {
  const where = 'info-menu';

  const opened = await page.evaluate(() => {
    const btn = document.getElementById('info-btn');
    if (!btn) return { missing: true };
    btn.click();
    const dlg = document.querySelector('dialog.info');
    return {
      missing: false,
      open: !!dlg && !dlg.hidden,
      // §7e: the first-run text MOVED here rather than being destroyed.
      hasFirstRun: !!dlg?.querySelector('.gate-first'),
      hasWhatsNew: !!dlg?.querySelector('.wn-card'),
      hasSources: !!dlg?.querySelector('.info-sources'),
      /**
       * THE MARK AT THE TOP OF THE PANEL IS THE SAME FILE the manifest
       * declares, not a redrawn approximation.
       *
       * Noah, 2026-08-04, with his home screen beside it: it "does not match the
       * app's icon close enough, and looks like an error because it is
       * different." It was a hand-drawn SVG — no plate, level horizon rather
       * than the icon's 12-degree bank, no pitch ladder, palette tokens instead
       * of the icon's colours — under a comment claiming the two were the same.
       *
       * RESEMBLING THE ICON IS NOT THE REQUIREMENT. A redraw drifts the moment
       * either copy is touched, and a comment asserting they match is not a
       * check. The only version that cannot drift is the identical file, so
       * that is what this asserts. Painted size too: an <img> whose src 404s
       * still exists in the DOM and still reports its class.
       */
      mark: (() => {
        const img = dlg?.querySelector('.gate-mark');
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return {
          src: new URL(img.getAttribute('src'), location.href).pathname,
          w: r.width,
          h: r.height,
          loaded: img.complete && img.naturalWidth > 0,
        };
      })(),
    };
  });

  if (opened.missing) {
    fail(where, 'the (i) button is missing');
    return;
  }
  await page.waitForTimeout(200);
  if (!opened.open) fail(where, 'pressing (i) did not open the information dialog');

  // The manifest is the authority on what this app's icon IS; the panel must
  // point at that file and not at a lookalike.
  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  const canonical = manifest.icons?.[0]?.src;
  if (!opened.mark) {
    fail(where, 'the information panel carries no app mark — it does not say which app it belongs to');
  } else if (opened.mark.src !== canonical) {
    fail(where, `the panel's mark is "${opened.mark.src}" but the manifest's icon is "${canonical}" — a lookalike drifts from the icon on the home screen`);
  } else if (!opened.mark.loaded) {
    fail(where, `the panel's mark "${opened.mark.src}" did not load`);
  } else if (opened.mark.w < 16 || opened.mark.h < 16) {
    fail(where, `the panel's mark is ${Math.round(opened.mark.w)}x${Math.round(opened.mark.h)} — too small to read as the app's icon`);
  }
  if (!opened.hasFirstRun) fail(where, 'the first-run instructions did not survive into the (i) menu');
  if (!opened.hasWhatsNew) fail(where, 'the (i) menu carries no release notes (Doctrine §7d)');
  if (!opened.hasSources) fail(where, 'the (i) menu does not say where the numbers come from (Doctrine §7e)');

  await checkContrast(page, INFO_REGISTRY, where);
  await checkTargets(page, where);
  await checkNames(page, where);

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
}

/**
 * ACCEPTANCE CRITERION 1, as an assertion.
 *
 * With every permission denied, every instrument shows its failure flag and
 * nothing shows a number. This measures the SPECIFIC claim: not "the page
 * loaded", but "no readout is displaying digits", which is the only way a
 * synthetic value could surface.
 */
async function checkDeniedState(page) {
  const where = 'denied-permissions';
  await page.evaluate(() => document.querySelector('[data-page="pfd"]').click());
  await page.waitForTimeout(600);

  const readouts = await page.evaluate(() =>
    [...document.querySelectorAll('.readout')].map((n) => ({
      label: n.querySelector('.ro-label')?.textContent ?? '?',
      provenance: n.dataset.provenance,
      value: n.querySelector('.ro-value')?.textContent ?? '',
      reason: n.querySelector('.ro-reason')?.textContent ?? '',
      chip: n.querySelector('.chip-word')?.textContent ?? '',
    })),
  );

  if (readouts.length === 0) fail(where, 'the PFD rendered no readouts at all');

  for (const r of readouts) {
    if (r.provenance !== 'FAIL') {
      fail(where, `"${r.label}" is ${r.provenance} with every permission denied — it has a value from somewhere`);
      continue;
    }
    if (/\d/.test(r.value)) fail(where, `"${r.label}" is FAIL but is still showing digits: ${JSON.stringify(r.value)}`);
    if (!r.reason.trim()) fail(where, `"${r.label}" is FAIL with no reason — every failure must explain itself`);
    if (r.chip !== 'FAIL') fail(where, `"${r.label}" is FAIL but its chip reads ${JSON.stringify(r.chip)}`);
  }

  // BITE must explain each one.
  await page.evaluate(() => document.querySelector('[data-page="bite"]').click());
  await page.waitForTimeout(400);
  const bite = await page.evaluate(() =>
    [...document.querySelectorAll('.bite-item')].map((n) => ({
      id: n.dataset.entryId,
      label: n.querySelector('.bite-label')?.textContent ?? '',
      status: n.dataset.status,
      reason: n.querySelector('.bite-reason')?.textContent ?? '',
    })),
  );
  if (bite.length < 8) fail(where, `BITE listed only ${bite.length} entries — it must cover every sensor and feed`);

  // ONE ROW PER CAPABILITY. The static probe and the async live probe both
  // legitimately describe the same thing, and both were being rendered: Noah's
  // page listed battery twice and network twice, with different reasons. A page
  // whose whole job is to be an honest inventory must not list anything twice.
  const seenIds = new Map();
  const seenLabels = new Map();
  for (const e of bite) {
    seenIds.set(e.id, (seenIds.get(e.id) ?? 0) + 1);
    seenLabels.set(e.label, (seenLabels.get(e.label) ?? 0) + 1);
  }
  for (const [id, n] of seenIds) if (n > 1) fail(where, `BITE lists the entry "${id}" ${n} times`);
  for (const [label, n] of seenLabels) if (n > 1) fail(where, `BITE lists "${label}" ${n} times under different ids`);
  for (const e of bite) {
    if (!e.reason.trim()) fail(where, `BITE entry "${e.label}" has no reason`);
  }
  // MEASURE WHAT THE LIVE MERGE CONTRIBUTES, NOT THE TOTAL AFTERWARDS.
  //
  // The first version of this check asserted only that SOMETHING on the page
  // read FAIL — and the feed rows are FAIL in this build regardless, so the
  // check passed with the sensor merge entirely disabled. Planting caught it
  // (scripts/plant.mjs, "BITE: the page stops reading the live store").
  //
  // These four entries are the difference: the static probe reports them
  // available because the browser implements the APIs, and only the merge with
  // the live store can know that nothing is arriving. If any of them says PASS
  // with every permission denied, BITE is reporting a browser capability as an
  // aircraft capability — the exact conflation the page exists to avoid.
  for (const id of ['orientation', 'heading', 'motion', 'geo']) {
    const entry = bite.find((e) => e.id === id);
    if (!entry) {
      fail(where, `BITE has no "${id}" entry — the sensor matrix is incomplete`);
    } else if (entry.status === 'PASS') {
      fail(where, `BITE reports "${id}" as PASS with every permission denied — it is not merging the live store`);
    }
  }

  // The canvas text alternative must describe what is on it, not label the box.
  const alt = await page.evaluate(() => document.getElementById('pfd-canvas').getAttribute('aria-label'));
  if (!alt || alt.length < 40) fail(where, `the canvas text alternative is too thin to be an alternative: ${JSON.stringify(alt)}`);
  if (!/unavailable/i.test(alt)) fail(where, 'the canvas alternative does not report the unavailable readings it is showing');
}

/**
 * ACCEPTANCE CRITERION 2: no third-party API key or secret is reachable from
 * the client bundle. Checked against the SERVED files, not the source tree, so
 * anything the deploy would actually hand a browser is in scope.
 */
async function checkNoSecrets(base) {
  const where = 'secrets';
  const files = [
    '/index.html',
    '/styles.css',
    '/sw.js',
    '/manifest.webmanifest',
    '/src/app.js',
    '/src/data/metar.js',
    '/src/data/traffic.js',
    '/src/data/windsaloft.js',
    '/src/data/wmm.js',
    '/src/core/region.js',
  ];
  const forbidden = [
    /OPENSKY_CLIENT_SECRET\s*[:=]\s*['"]/i,
    /client_secret\s*[:=]\s*['"][^'"]+['"]/i,
    /\bBearer\s+[A-Za-z0-9._-]{20,}/,
    /api[_-]?key\s*[:=]\s*['"][^'"]{8,}['"]/i,
    /eyJ[A-Za-z0-9_-]{20,}\./, // a JWT
  ];

  for (const file of files) {
    const res = await fetch(`${base}${file}`);
    if (!res.ok) {
      fail(where, `${file} is not served (HTTP ${res.status}) but the service worker precaches it`);
      continue;
    }
    const body = await res.text();
    for (const pattern of forbidden) {
      if (pattern.test(body)) fail(where, `${file} matches a secret pattern: ${pattern}`);
    }
    // The client must never name a third-party host directly: every call goes
    // through a Pages Function on this origin.
    for (const host of ['opendata.adsb.fi', 'aviationweather.gov', 'api.open-meteo.com']) {
      if (file.startsWith('/src/') && body.includes(`https://${host}`)) {
        fail(where, `${file} references ${host} directly — the client must go through /api/*`);
      }
    }
  }

  // NO PAGES FUNCTION MAY CARRY A LITERAL CREDENTIAL.
  //
  // This used to assert the opposite shape — that traffic.js READ two specific
  // OpenSky env bindings — which stopped being the right question the moment
  // that endpoint moved to a service needing no credentials at all. A check
  // naming one upstream's variables is really a check that the upstream has not
  // changed; this asks the thing that stays true whoever we call.
  for (const name of ['traffic.js', 'metar.js', 'winds.js']) {
    const body = await readFile(path.join(REPO, 'functions', 'api', name), 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(body)) fail(where, `functions/api/${name} matches a secret pattern: ${pattern}`);
    }
    // Anything that IS a credential must arrive through an env binding, never
    // through a literal on the right of an assignment.
    if (/(?:secret|token|password|apikey|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(body)) {
      fail(where, `functions/api/${name} appears to assign a literal credential`);
    }
  }

  // ADSB.FI'S TERMS REQUIRE A CITATION, SO THE GATE ENFORCES ONE.
  //
  // "You must cite adsb.fi and include a link to our home page." That is a
  // condition of use, not a courtesy, and a condition nobody checks is one that
  // quietly lapses in a refactor. Doctrine §15.1 makes the publisher's policy
  // the authority; this is the policy expressed as a test.
  const libSrc = await readFile(path.join(REPO, 'functions', 'api', '_lib.js'), 'utf8');
  if (!/attribution:\s*['"][^'"]+['"]/.test(libSrc)) {
    fail(where, 'no provider carries an attribution string for the client to render');
  }
}

/**
 * ACCEPTANCE CRITERION 4: every numeric readout traces to a state field.
 *
 * Rather than trusting the panels, this asks the STORE what it declares and
 * asserts that every readout on screen is one of those fields — and that every
 * field the store publishes carries a provenance from the allowed set.
 */
/**
 * A STORED CALIBRATION MUST NOT BE DENIED BY THE PANEL THAT IS USING IT.
 *
 * Noah, from his iPad: "On reload, the app lies and says level is not set when
 * it is actually using a previously stored level." The offset was loaded and
 * being subtracted from every reading — the ADI badge said LVL -46 +3 and the
 * diagnostics agreed — while the line under the horizon said "Not levelled".
 *
 * No unit test could catch it, because the fault was TIMING: the line was
 * written once at boot, before the stored calibration had been re-applied. So
 * this seeds a real calibration into storage, loads the real app, and reads the
 * rendered sentence. It also cross-checks the ADI's own badge, because the bug
 * was two surfaces disagreeing and either one alone could be the wrong one.
 */
/**
 * TAPPING AN AIRCRAFT ON THE SCOPE FOLLOWS IT.
 *
 * `hitTestAircraft` was used in radar.js and never imported, so every tap threw
 * `hitTestAircraft is not defined` and the feature had never worked once since
 * it shipped. Nothing caught it for seven releases, and the reason is exact:
 * this gate asserts "no console errors" but had never CLICKED anything. An
 * error that only fires on interaction is invisible to a sweep that only looks.
 *
 * So this drives a real pointer at a real aircraft's drawn position, using the
 * SAME geometry the renderer uses, and asserts the follow actually started.
 */
async function checkRadarTap(browser, base, { touch = false } = {}) {
  const where = touch ? 'radar-tap/touch' : 'radar-tap/mouse';
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, permissions: [], hasTouch: touch });
  await seenIntro(context);
  await context.route('**/api/traffic**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TRAFFIC_FIXTURE) }),
  );
  // Counted, because "asked once per flight" is a promise made to a volunteer
  // service and a promise nobody measures is a hope.
  let routeAsks = 0;
  await context.route('**/api/route**', (route) => {
    routeAsks += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROUTE_FIXTURE) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('[data-page="radar"]').click());
  await page.waitForTimeout(800);

  // Where the FIRST aircraft is actually painted, from the renderer's own maths.
  const target = await page.evaluate(async () => {
    const canvas = document.querySelector('.radar-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { greatCircleNm, bearingDeg } = await import('/src/core/units.js');
    const { radarCentre } = await import('/src/data/traffic.js');
    const { state } = await import('/src/core/state.js');
    const c = radarCentre(state.snapshot.fields);
    const a = { lat: 38.9, lon: -121.15 }; // UAL328 in the fixture
    const w = rect.width;
    const h = rect.height;
    const r = Math.min(w, h) / 2 - 4;
    const pxPerNm = r / 40;
    const rad = (bearingDeg(c, a) * Math.PI) / 180;
    const d = greatCircleNm(c, a);
    return {
      clientX: rect.x + w / 2 + Math.sin(rad) * d * pxPerNm,
      clientY: rect.y + h / 2 - Math.cos(rad) * d * pxPerNm,
    };
  });

  if (!target) {
    fail(where, 'the radar canvas is missing');
    await context.close();
    return;
  }

  /**
   * THE INDICATOR AGREES WITH THE SCOPE BEFORE THE TAP, AND AFTER IT.
   *
   * Noah asked for a state indicator because he could not tell a filling scope
   * from a finished one. An indicator that says CONTACT over a scope that
   * ignores taps would be worse than none — so this asserts the chip claims
   * tappable at the moment a tap is about to succeed.
   */
  const beforeTap = await page.evaluate(() => {
    const chip = document.querySelector('.radar-ready');
    if (!chip) return null;
    const r = chip.getBoundingClientRect();
    return { text: chip.textContent.trim(), tappable: chip.dataset.tappable, state: chip.dataset.state, w: r.width, h: r.height };
  });
  if (!beforeTap) fail(where, 'the radar has no readiness indicator at all');
  else if (beforeTap.w < 1 || beforeTap.h < 1) fail(where, `the readiness indicator is not painted (${Math.round(beforeTap.w)}x${Math.round(beforeTap.h)})`);
  else if (beforeTap.state !== 'contact') fail(where, `the scope has aircraft drawn but the indicator reads "${beforeTap.text}" (state ${beforeTap.state})`);
  else if (beforeTap.tappable !== 'true') {
    fail(where, `the indicator says "${beforeTap.text}" but does not claim to be tappable, on a scope where a tap is about to work`);
  }

  if (touch) await page.touchscreen.tap(target.clientX, target.clientY);
  else await page.mouse.click(target.clientX, target.clientY);
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => ({
    following: !document.getElementById('follow-banner')?.hidden,
    what: document.getElementById('follow-what')?.textContent?.trim() ?? '',
    input: document.querySelector('.radar-form input')?.value ?? '',
  }));

  // An error thrown by the handler is the actual defect, so name it first.
  for (const e of errors) fail(where, `tapping the scope threw: ${e}`);
  if (!after.following) {
    fail(where, `tapping an aircraft did not start following it (banner hidden, input "${after.input}")`);
  } else if (!/UAL328/.test(`${after.what} ${after.input}`)) {
    fail(where, `tapped UAL328 but the panel is following "${after.what}"`);
  }

  /**
   * THE ROUTE, AND THE WORD THAT QUALIFIES IT, BOTH PAINTED.
   *
   * MEASURED, not read off the DOM. The first draft of this feature put the
   * caveat in a `title` attribute, where `textContent` would have found it and
   * a phone would not — there is no hover on a touch screen, and this app is
   * built for one. So the assertion is a bounding box with real area plus text
   * that is really there, which is the only form of "on screen" that survives
   * someone deciding the banner looks cramped.
   *
   * The route without the caveat is the failure that matters. An inferred
   * route presented bare reads as a filed flight plan to someone who is not a
   * pilot, which is the exact misreading this app is not allowed to cause.
   */
  const afterFollow = await page.evaluate(() => {
    const chip = document.querySelector('.radar-ready');
    return chip ? { text: chip.textContent.trim(), state: chip.dataset.state } : null;
  });
  if (afterFollow && afterFollow.state !== 'following') {
    fail(where, `the panel is following an aircraft and the indicator still reads "${afterFollow.text}"`);
  }
  if (afterFollow && !/UAL328/.test(afterFollow.text)) {
    fail(where, `the indicator says "${afterFollow.text}" — it must name the aircraft the panel has become`);
  }

  /**
   * THE SCOPE IS NOT PUSHED OFF THE SCREEN BY ITS OWN CONTROLS.
   *
   * Noah, 2026-08-05: "The radar is pushed down by the airport picker." The
   * centre picker — a label, a field and a two-line hint — sat ABOVE the
   * instrument, and the range and band buttons wrapped onto two rows each on a
   * phone. The scope began past the half-way point and ran off the bottom.
   *
   * Every check on this page passed throughout, because they all asked whether
   * things EXIST and are legible. None asked where the instrument starts, which
   * is the only question a reader has when they open the page.
   */
  const scopeTop = await page.evaluate(() => {
    const c = document.querySelector('.radar-canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { top: r.top + window.scrollY, h: r.height, viewport: window.innerHeight };
  });
  if (!scopeTop) fail(where, 'the radar canvas is missing');
  else if (scopeTop.top > scopeTop.viewport * 0.5) {
    fail(
      where,
      `the scope starts ${Math.round(scopeTop.top)}px down a ${scopeTop.viewport}px viewport — `
        + 'its own controls have pushed the instrument past the half-way point',
    );
  }

  // BACK TO THE PANEL FIRST. The banner lives inside `#page-pfd`, which is
  // `[hidden]` while the scope is up — so measuring here without switching
  // reads 0x0 for a perfectly visible element and would have to be "fixed" by
  // weakening the check. This is the reader's own path: tap an aircraft on the
  // scope, then go and look at the panel it is now driving.
  await page.evaluate(() => document.querySelector('[data-page="pfd"]').click());
  await page.waitForTimeout(300);

  const shown = await page.evaluate(() => {
    const seen = (id) => {
      const el = document.getElementById(id);
      if (!el) return { present: false };
      const r = el.getBoundingClientRect();
      return { present: true, hidden: el.hidden, text: el.textContent.trim(), w: r.width, h: r.height };
    };
    return { route: seen('follow-route'), caveat: seen('follow-route-caveat') };
  });

  for (const [what, got] of [['route', shown.route], ['caveat', shown.caveat]]) {
    if (!got.present) fail(where, `the follow banner has no ${what} element at all`);
    else if (got.hidden || got.w < 1 || got.h < 1) {
      fail(where, `the ${what} is not painted (hidden ${got.hidden}, ${Math.round(got.w)}x${Math.round(got.h)}) — a route the reader cannot see is not shown`);
    } else if (!got.text) fail(where, `the ${what} element is painted but empty`);
  }
  if (shown.route.text && !/KSFO/.test(shown.route.text)) {
    fail(where, `the route reads "${shown.route.text}" — the followed flight's origin is missing`);
  }
  if (shown.caveat.text && !/plausible/i.test(shown.caveat.text)) {
    fail(where, `the caveat reads "${shown.caveat.text}" — adsb.lol's own word PLAUSIBLE has to be the one on screen`);
  }
  if (shown.caveat.text && !/not a filed flight plan/i.test(shown.caveat.text)) {
    fail(where, `the caveat reads "${shown.caveat.text}" — it must say this is not a filed flight plan`);
  }
  if (routeAsks > 1) {
    fail(where, `the route feed was asked ${routeAsks} times for one flight — it must be asked once per flight, not once per sweep`);
  }

  await context.close();
}

/**
 * THE CENTRE PICKER, asserted end to end.
 *
 * Noah: "I want to be able to set an airport on the radar page? Or another
 * location. Airports should be easy to pick." Three things have to be true and
 * only one of them is visible: the matches appear, pressing one moves the
 * label, AND THE NEXT FETCH ASKS ABOUT SOMEWHERE ELSE. The third is the one
 * that makes the feature real — a picker that relabels the scope without moving
 * the query is exactly the class of defect this app exists not to ship, because
 * the panel would then show this desk's traffic under an airport's name.
 *
 * The typed states are contrast-measured here too, because they do not exist
 * during the page sweep.
 */
async function checkCentrePicker(browser, base) {
  const where = 'centre-picker';
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, permissions: [] });
  await seenIntro(context);
  const queries = [];
  await context.route('**/api/traffic**', (route) => {
    queries.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TRAFFIC_FIXTURE) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('[data-page="radar"]').click());
  await page.waitForTimeout(600);

  const field = page.locator('.radar-centre-input');
  if ((await field.count()) === 0) {
    fail(where, 'the radar page has no centre picker');
    await context.close();
    return;
  }

  /* ---- 1. a code finds the airport, best match first ------------------- */
  await field.fill('KSMF');
  await page.waitForTimeout(400);
  const hits = await page.evaluate(() => [...document.querySelectorAll('.radar-centre-hit')].map((b) => b.textContent.trim()));
  if (!hits.length) {
    // Nothing below this can mean anything without a match to press, and
    // waiting 30 seconds for a button that will never exist reports a timeout
    // where the real finding is one line up.
    const why = await page.evaluate(() => document.querySelector('.radar-centre-note')?.textContent?.trim() ?? '');
    fail(where, `typing KSMF offered no airports — the bundled list did not reach the picker (it says: "${why}")`);
    for (const e of errors) fail(where, `the centre picker threw: ${e}`);
    await context.close();
    return;
  }
  if (!hits[0].startsWith('KSMF')) {
    fail(where, `typing the exact code KSMF offered "${hits[0]}" first`);
  }

  // Measured with a real value in the box and the matches on screen.
  await checkContrast(page, CENTRE_REGISTRY.filter((r) => r.selector !== '.radar-centre-clear'), where);

  /* ---- 2. pressing one moves the scope AND the query ------------------- */
  const before = queries.length;
  await page.locator('.radar-centre-hit').first().click();
  await page.waitForTimeout(900);

  const after = await page.evaluate(() => ({
    note: document.querySelector('.radar-centre-note')?.textContent?.trim() ?? '',
    value: document.querySelector('.radar-centre-input')?.value ?? '',
    clearShown: !document.querySelector('.radar-centre-clear')?.hidden,
  }));
  if (!/KSMF/.test(after.value)) fail(where, `pressing the KSMF match left the box reading "${after.value}"`);
  if (!/centred on/i.test(after.note)) fail(where, `the picker did not say where the scope is now: "${after.note}"`);
  if (!after.clearShown) fail(where, 'the scope is on an airport but there is no way back to this device');

  const fresh = queries.slice(before);
  if (!fresh.length) {
    fail(where, 'choosing an airport did not re-ask the traffic feed — the scope would be labelled KSMF and show this desk');
  } else {
    // KSMF is 38.6954 / −121.591. The home fallback is 38.68 / −121.00, so a
    // query still pointed at home is a full half-degree of longitude away and
    // cannot be mistaken for rounding.
    const q = fresh[fresh.length - 1];
    const lat = Number(q.searchParams.get('lat'));
    const lon = Number(q.searchParams.get('lon'));
    if (!(Math.abs(lat - 38.6954) < 0.02 && Math.abs(lon + 121.591) < 0.02)) {
      fail(where, `after choosing KSMF the feed was still asked about ${lat}, ${lon}`);
    }
  }

  // The matches are GONE now — choosing one closes the list — so this pass is
  // the reset control, which only exists once there is something to reset.
  await checkContrast(page, CENTRE_REGISTRY.filter((r) => r.selector !== '.radar-centre-hit'), where);

  /* ---- 3. a typed coordinate, and the way back ------------------------- */
  await field.fill('37.62, -122.37');
  await page.waitForTimeout(300);
  const coordHit = await page.evaluate(() => document.querySelector('.radar-centre-hit')?.textContent?.trim() ?? '');
  if (!/37\.620/.test(coordHit)) fail(where, `a typed coordinate offered "${coordHit}" instead of the position`);

  await page.locator('.radar-centre-clear').click();
  await page.waitForTimeout(600);
  const home = await page.evaluate(() => ({
    value: document.querySelector('.radar-centre-input')?.value ?? '',
    clearShown: !document.querySelector('.radar-centre-clear')?.hidden,
  }));
  if (home.value !== '') fail(where, `going back to this device left "${home.value}" in the box`);
  if (home.clearShown) fail(where, 'the reset control is still offered with nothing to reset');

  for (const e of errors) fail(where, `the centre picker threw: ${e}`);
  await context.close();
}

/**
 * DOCTRINE §7h, WITH A REAL SECOND WORKER.
 *
 * "Serve a genuinely different sw.js and let the browser's own update machinery
 * run; a mock proves the mock works." So this runs its own server with a
 * `transform` hook that appends a comment to `sw.js` once armed — different
 * bytes, which is the only thing that makes a browser install a second worker.
 *
 * The four properties, in the order they can fail:
 *
 *   3. A BRAND-NEW VISITOR IS NOT TOLD. The first worker on a first visit is
 *      not an update, and offering one thirty seconds after arriving is
 *      nonsense.
 *   1. THE NEW WORKER WAITS. The old one is still the controller after it
 *      installs — that is what keeps the open page's markup and modules from
 *      the same release.
 *   2. THE READER IS TOLD, in a standing element with two ways out, and the
 *      text is legible in both palettes.
 *   1. THE READER'S PRESS RELEASES IT, and only theirs.
 */
async function checkUpdateStrip(browser) {
  const where = 'update-strip';
  let armed = false;
  const server = await createStaticServer({
    apiStubs: { '/api/traffic': TRAFFIC_FIXTURE, '/api/metar': { ok: false, reason: 'not deployed here' }, '/api/winds': { ok: false, reason: 'not deployed here' } },
    // Byte-different but still a WORKING worker: a comment cannot change what
    // it does, which is what lets step 4 assert it actually took over.
    transform: (pathname, raw) =>
      armed && pathname === '/sw.js' ? Buffer.concat([raw, Buffer.from('\n// second worker, served by the a11y gate\n')]) : raw,
  });
  await new Promise((r) => server.listen(0, r));
  const swBase = `http://127.0.0.1:${server.address().port}`;

  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, permissions: [] });
  await seenIntro(context);
  /**
   * A TAKEOVER HAS TO BE OBSERVED AS AN EVENT, because it cannot be observed as
   * a difference.
   *
   * The first attempt compared `controller.scriptURL` before and after. That
   * can never work here: this app's worker takes its version from its
   * registration URL, so BOTH workers are registered at `/sw.js?v=1.16.0` and
   * the string is identical whichever one is in charge. And when a takeover
   * does happen the app reloads the page, so anything held in a JS variable is
   * gone before it can be read.
   *
   * `sessionStorage` survives the reload; an init script gets the listener in
   * before any page code. This is what makes the skipWaiting plant detectable
   * at all — without it the gate went red about "the browser did not see it as
   * an update", which was the opposite of what had happened.
   */
  await context.addInitScript(() => {
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      sessionStorage.setItem('gate:controllerchange', 'yes');
    });
    /**
     * ASK THE PIXELS, NOT THE ATTRIBUTE.
     *
     * `el.hidden` is what the DOM was TOLD. Whether the reader can see it is a
     * different question, and the two came apart here: `.update { display: flex }`
     * outranks the user agent's `[hidden] { display: none }`, so the strip was
     * painted at full size while `hidden` read true. Every assertion in this
     * check agreed nothing was shown, and a first-time visitor was looking at
     * "A new version of the panel is ready" about the version they had just
     * installed — the §7h.3 failure this check is named after, passing.
     */
    window.onScreen = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  /**
   * EVERY READ HERE HAPPENS WHILE A RELOAD MAY BE IN FLIGHT, and a `page.evaluate`
   * whose execution context is destroyed mid-call THROWS — which took the whole
   * gate down with an uncaught exception instead of reporting a failure. The
   * plant harness then said "the gate went red, but not about this: (no failing
   * line found)", because a crash produces no FAIL line to quote.
   *
   * Worse, it was a RACE: the same planted fault was diagnosed correctly on one
   * run and crashed on the next. A check that reports different things about
   * the same defect is not evidence of anything.
   */
  const settle = async (fn) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        if (!/context was destroyed|Execution context|navigating/i.test(String(err.message))) throw err;
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(300);
      }
    }
    return null;
  };
  const seized = () => settle(() => page.evaluate(() => sessionStorage.getItem('gate:controllerchange') === 'yes'));
  const clearSeized = () => settle(() => page.evaluate(() => sessionStorage.removeItem('gate:controllerchange')));

  try {
    /* ---- §7h.3: a first visit is never told anything -------------------- */
    await page.goto(`${swBase}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(600);
    if (await settle(() => page.evaluate(() => onScreen(document.getElementById('update-strip'))))) {
      fail(where, 'a first-ever visitor was told a new version is ready — they arrived seconds ago (§7h.3)');
    }

    // Now they have a controller, which is what makes the NEXT one an update.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const controlled = await settle(() => page.evaluate(() => !!navigator.serviceWorker.controller));
    if (!controlled) {
      fail(where, 'the worker never took control, so the update path cannot be exercised at all');
      return;
    }
    // The first worker claiming this page is not the takeover under test.
    await clearSeized();

    /* ---- a genuinely different sw.js, and the browser's own update ------- */
    armed = true;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });
    /**
     * POLLED FOR THE STATE, NOT SLEPT FOR A GUESS.
     *
     * This was `waitForTimeout(1200)`, and 1200 ms is an opinion about how long
     * a browser takes to install a worker that precaches forty-nine shell files
     * and a 317 KB airport database. It is plenty on an idle machine. It is not
     * plenty on the forty-ninth browser of a plant sweep — where this check
     * announced "the browser did not see it as an update" about a worker that
     * was, at that moment, still installing.
     *
     * The plant running underneath came back UNPROVEN, which is the harness
     * doing its job: a check that goes red for the wrong reason is not
     * evidence, and a check that does it INTERMITTENTLY is worse than one that
     * never worked, because the green reads as coverage.
     *
     * Both exits below are real answers rather than expiries: something is
     * waiting, or a worker seized the page. Reaching the deadline after this
     * long is a genuine failure, not a slow machine — which is the property a
     * fixed sleep can never have.
     */
    const deadlineAt = Date.now() + 20_000;
    let sawWaiting = false;
    let sawSeized = false;
    while (Date.now() < deadlineAt) {
      sawWaiting = !!(await settle(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)));
      sawSeized = !!(await seized());
      if (sawWaiting || sawSeized) break;
      await page.waitForTimeout(150);
    }

    /* ---- §7h.1: it WAITS ------------------------------------------------ */
    const state = { waiting: sawWaiting, seized: sawSeized };
    /**
     * TWO WAYS FOR `waiting` TO BE FALSE, AND THEY ARE OPPOSITE FAULTS. The
     * first draft of this check reported both as "the browser did not see it as
     * an update" — which is the correct diagnosis for one of them and a
     * completely misleading one for the other. Planting `skipWaiting()` proved
     * it: the gate went red, and about the wrong thing, so the plant read as
     * UNPROVEN rather than as the defect it is.
     *
     *   · a controllerchange FIRED — a new worker did arrive and seized the
     *     page. That is §7h.1 exactly, and the failure this check exists for.
     *   · no controllerchange and nothing waiting — no second worker was ever
     *     installed, so everything below tests nothing and saying so is the
     *     only honest outcome.
     */
    if (state.seized) {
      fail(
        where,
        'the new worker took over on its own. The open page is still the OLD release’s markup and modules, '
          + 'so it is now serving a mix (§7h.1) — and the reader was never asked',
      );
      return;
    }
    if (!state.waiting) {
      fail(where, 'a second worker was served, none is waiting, and no controllerchange fired — the browser did not see it as an update, so nothing below is being tested');
      return;
    }

    /* ---- §7h.2: the reader is told, legibly, with two ways out ---------- */
    const strip = await settle(() => page.evaluate(() => {
      const s = document.getElementById('update-strip');
      if (!onScreen(s)) return null;
      return {
        text: document.getElementById('update-text')?.textContent?.trim() ?? '',
        acts: [...s.querySelectorAll('button')].map((b) => b.textContent.trim()),
        role: s.getAttribute('role'),
        // A MODAL WOULD BE WRONG HERE. If it covers the panel, it is a dialog
        // wearing a strip's clothes.
        modal: !!s.closest('dialog') || getComputedStyle(s).position === 'fixed',
      };
    }));
    if (!strip) {
      fail(where, 'a worker is waiting and the panel says nothing about it — the reader cannot know they are behind (§7h.2)');
    } else {
      if (strip.acts.length < 2) fail(where, `the update strip offers ${strip.acts.length} control(s); it needs both a way in and a way out (§3)`);
      if (strip.modal) fail(where, 'the update strip is modal or fixed — §7h.2 says a standing indicator, never something over what the reader is using');
      if (strip.role !== 'status') fail(where, `the update strip has role="${strip.role}" — it must be announced without stealing focus`);
      await checkContrast(page, UPDATE_REGISTRY, where);
    }

    /* ---- §7h.1 again: only the reader's press releases it ---------------- */
    await clearSeized();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null),
      page.evaluate(() => document.getElementById('update-go').click()),
    ]);
    await page.waitForTimeout(900);
    const after = {
      waiting: await settle(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)),
      stripShown: await settle(() => page.evaluate(() => onScreen(document.getElementById('update-strip')))),
      seized: await seized(),
    };
    if (!after.seized) fail(where, 'pressing "Install it now" never handed the page over to the waiting worker');
    if (after.waiting) fail(where, 'pressing "Install it now" left the new worker still waiting — the control does not do what it says');
    if (after.stripShown) fail(where, 'the update strip is still offering an update that has been installed');

    for (const e of errors) fail(where, `the update path threw: ${e}`);
  } finally {
    await context.close();
    server.close();
  }
}

/**
 * THE FIRST-RUN ORIENTATION IS SHOWN, ONCE (Doctrine §7e).
 *
 * Noah, 2026-08-03: "Why am I not seeing my first-time-run pop-up anymore?"
 * Because 1.12.0 moved it into the (i) menu at boot and nothing opened it. The
 * text SURVIVED — which is the half `plant.mjs` already proves — and was never
 * PRESENTED, which is the half that makes it orientation instead of reference
 * material. Both halves are asserted now, because passing one while failing the
 * other is precisely what shipped.
 *
 * THIS IS THE ONE CONTEXT THAT DOES NOT CALL `seenIntro`.
 */
async function checkFirstRunIntro(browser, base) {
  const where = 'first-run';
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, permissions: [] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const first = await page.evaluate(() => {
    const dialog = document.querySelector('dialog.info');
    const intro = document.querySelector('.gate-first');
    const introBox = intro?.getBoundingClientRect();
    const panel = document.getElementById('panel')?.getBoundingClientRect();
    return {
      open: !!dialog?.open,
      // The orientation must be the thing on screen, not merely present in a
      // dialog scrolled to somewhere else.
      introVisible: !!introBox && introBox.width > 0 && introBox.height > 0,
      introInDialog: !!intro && !!intro.closest('dialog.info'),
      // §7e: the panel is live BEHIND it. This is not a gate and not a consent
      // screen — Noah rejected one that read "like accept the terms".
      panelPainted: !!panel && panel.width > 100 && panel.height > 60,
      closes: !!document.querySelector('dialog.info .info-close'),
    };
  });

  if (!first.open) fail(where, 'a first-time reader was shown no orientation at all — the text is in the (i) menu and nothing opens it (§7e)');
  if (!first.introInDialog) fail(where, 'the first-run text is not inside the (i) dialog, so it does not live where §7e says it must live afterwards');
  if (first.open && !first.introVisible) fail(where, 'the (i) dialog opened but the first-run orientation is not the part on screen');
  if (!first.panelPainted) fail(where, 'the panel is not behind the orientation — this must not be a gate the reader has to get through');
  if (!first.closes) fail(where, 'the orientation has no way out');

  // ...and it is ONCE. A panel that explains itself on every load is a panel
  // nobody can use.
  if (first.open) await page.evaluate(() => document.querySelector('dialog.info .info-close').click());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const second = await page.evaluate(() => !!document.querySelector('dialog.info')?.open);
  if (second) fail(where, 'the orientation opened again on the second visit — it is meant to be first-RUN');

  // And it is still findable, which is the whole reason it moved rather than
  // being destroyed.
  await page.evaluate(() => document.getElementById('info-btn').click());
  await page.waitForTimeout(300);
  const findable = await page.evaluate(() => {
    const intro = document.querySelector('dialog.info .gate-first');
    const b = intro?.getBoundingClientRect();
    return !!b && b.width > 0 && b.height > 0;
  });
  if (!findable) fail(where, 'the orientation is not in the (i) menu on a later visit — it was shown once and lost');

  for (const e of errors) fail(where, `the first-run path threw: ${e}`);
  await context.close();
}

async function checkStoredLevelling(browser, base) {
  const where = 'stored-levelling';
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, permissions: [] });
  await seenIntro(context);

  // A real gravity reference, normalised: Noah's own raw axes from the report
  // that exposed this, so the numbers on screen are the ones he saw.
  await context.addInitScript(() => {
    const m = Math.hypot(6.893, 0.451, 7.199);
    localStorage.setItem(
      'fauxplane.mount',
      JSON.stringify({ x: -6.893 / m, y: -0.451 / m, z: -7.199 / m, screenAngle: 0, at: Date.now() }),
    );
  });

  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  // No gate to dismiss: the panel is the first surface (PWR is a switch on it).
  await page.waitForTimeout(600);

  const seen = await page.evaluate(async () => {
    const mod = await import('/src/core/fusion.js');
    return {
      status: document.getElementById('pfd-level-status')?.textContent?.trim() ?? null,
      button: document.getElementById('pfd-level')?.textContent?.trim() ?? null,
      clearHidden: document.getElementById('pfd-level-clear')?.hidden ?? null,
      hasFusionExport: typeof mod.createFusion === 'function',
    };
  });

  if (seen.status === null) {
    fail(where, 'the PFD levelling line is missing');
  } else if (/not levelled/i.test(seen.status)) {
    fail(
      where,
      `a calibration was in storage and the panel says "${seen.status}" — the app is denying a levelling it is applying`,
    );
  }

  // The button and the clear control are the same claim in two other places.
  // All three must agree or the reader gets to pick which one to believe.
  if (seen.button && /^Level the horizon$/i.test(seen.button)) {
    fail(where, `a calibration was stored but the button still offers to "${seen.button}" rather than re-level`);
  }
  if (seen.clearHidden === true) {
    fail(where, 'a calibration was stored but the control to clear it is hidden');
  }

  await context.close();
}

async function checkProvenanceCoverage(browser, base) {
  const where = 'provenance';
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, permissions: [] });
  await seenIntro(context);
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  // No gate to dismiss: the panel is the first surface (PWR is a switch on it).
  await page.waitForTimeout(400);

  const result = await page.evaluate(async () => {
    const mod = await import('/src/core/state.js');
    const snapshot = mod.state.snapshot;
    const allowed = ['LIVE', 'DERIVED', 'STALE', 'FAIL'];
    const bad = [];
    let count = 0;
    for (const [pathName, field] of Object.entries(snapshot.fields)) {
      count += 1;
      if (!allowed.includes(field.provenance)) bad.push(`${pathName} has provenance ${field.provenance}`);
      if (field.provenance === 'FAIL' && field.value !== null) bad.push(`${pathName} is FAIL but carries a value`);
      if (field.provenance === 'FAIL' && !field.reason) bad.push(`${pathName} is FAIL with no reason`);
      if (field.provenance !== 'FAIL' && field.at === null) bad.push(`${pathName} has a value but no source timestamp`);
    }
    return { count, bad, declared: Object.keys(mod.FIELDS).length };
  });

  if (result.count === 0) fail(where, 'the store published no fields at all');
  if (result.count !== result.declared) {
    fail(where, `the store published ${result.count} fields but declares ${result.declared}`);
  }
  for (const b of result.bad) fail(where, b);

  await context.close();
}

/**
 * THE DATA FILES ARE CHECKED IN THE APP, not only in Node.
 *
 * wmm.test.mjs proves the model is right and the grid is right. Neither proves
 * the browser can FETCH them, that the manifest points at the correct paths,
 * that the service-worker shell lists them, or that the altitude chain actually
 * consumes them. Those are four separate ways for a correct file to reach
 * nothing — and every one of them would leave the panel reading FAIL while the
 * unit tests stayed green.
 *
 * So: grant a real position and assert the fields that depend on the bundles
 * stop reading FAIL.
 */
async function checkGeoDataChain(browser, base) {
  const where = 'geodata-chain';
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    permissions: ['geolocation'],
    // The home reference, which is inside both the geoid grid and the METAR box.
    geolocation: { latitude: 38.68, longitude: -121.0, accuracy: 8 },
  });
  await seenIntro(context);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // NARROW, AND ONLY THIS. Pressing PANEL POWER makes the app fetch its
    // feeds, and the local static server cannot serve Pages Functions — it
    // answers /api/* with a 503 on purpose. The browser logs any error status
    // as a console error, so that one is expected HERE and nowhere else.
    // Matching on the URL rather than the message text keeps the exclusion from
    // quietly swallowing a real 503 from somewhere else.
    const url = m.location()?.url ?? '';
    if (url.startsWith(`${base}/api/`)) return;
    consoleErrors.push(`${m.text()} (${url})`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('power-btn').click());
  // The declination recompute is throttled and the geoid needs a fix to sample.
  await page.waitForTimeout(2500);

  const result = await page.evaluate(async () => {
    const mod = await import('/src/core/state.js');
    const f = mod.state.snapshot.fields;
    const pick = (p) => ({ provenance: f[p]?.provenance ?? 'MISSING', value: f[p]?.value ?? null, reason: f[p]?.reason ?? null });
    return {
      geoid: pick('altitude.geoidSeparation'),
      declination: pick('nav.declination'),
      lat: pick('position.lat'),
    };
  });

  if (result.lat.provenance === 'FAIL') {
    fail(where, `the mocked position never arrived (${result.lat.reason}) — this check proved nothing`);
    await context.close();
    return;
  }

  if (result.geoid.provenance === 'FAIL') {
    fail(where, `geoid separation still FAILs with a fix and a bundled grid: ${result.geoid.reason}`);
  } else if (!(result.geoid.value < -78 && result.geoid.value > -130)) {
    // About -105 ft at the home reference. A number outside that is the grid
    // being sampled wrongly, which is worse than it being absent.
    fail(where, `geoid separation is ${result.geoid.value} ft at the home reference, expected about -105`);
  }

  // The tape must have climbed the ladder to MSL now that a geoid is bundled,
  // and must SAY so. A tape still labelled GPS ALT with a working geoid means
  // the selection never happened.
  const tapeLabel = await page.evaluate(() => {
    const c = document.getElementById('pfd-canvas');
    return c.getAttribute('aria-label') ?? '';
  });
  const msl = await page.evaluate(async () => {
    const mod = await import('/src/core/state.js');
    const f = mod.state.snapshot.fields['altitude.msl'];
    return { provenance: f?.provenance, value: f?.value, reason: f?.reason };
  });
  //
  // A mocked geolocation fix carries no ALTITUDE — Playwright supplies latitude,
  // longitude and accuracy only — so MSL legitimately cannot be computed here.
  // The assertion is therefore the precise one: whatever MSL is missing, it must
  // no longer be the geoid. That still fails loudly if the grid stops loading,
  // and it does not pretend the harness can produce an altitude it cannot.
  if (msl.provenance !== 'FAIL' && !Number.isFinite(msl.value)) {
    fail(where, 'MSL altitude is not FAIL but carries no number');
  }
  if (msl.provenance === 'FAIL' && /geoid/i.test(msl.reason ?? '')) {
    fail(where, `MSL altitude still blames the geoid with a grid bundled: ${msl.reason}`);
  }
  if (!tapeLabel) fail(where, 'the canvas lost its text alternative');

  if (result.declination.provenance === 'FAIL') {
    fail(where, `declination still FAILs with a fix and bundled coefficients: ${result.declination.reason}`);
  } else if (!(result.declination.value > 12 && result.declination.value < 14)) {
    fail(where, `declination is ${result.declination.value} at the home reference, expected about 13 east`);
  }

  for (const err of consoleErrors) fail(where, `console error: ${err}`);
  await context.close();
}

await main();
