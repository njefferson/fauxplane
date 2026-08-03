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
  { selector: ".radar-pick[aria-pressed='true']", label: 'airframe picker (selected)', min: 4.6, page: 'radar' },
  { selector: ".radar-pick[aria-pressed='false']", label: 'airframe picker (unselected)', min: 4.6, page: 'radar' },
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

  const found = await page.evaluate((rows) => {
    return rows.map((row) => {
      const nodes = [...document.querySelectorAll(row.selector)].filter((n) => {
        const r = n.getBoundingClientRect();
        const s = getComputedStyle(n);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && n.textContent.trim().length > 0;
      });
      if (!nodes.length) return { ...row, matched: 0 };
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
    fail(where, `contrast registry selector matched nothing: ${miss.selector} (${miss.label})`);
  }
  if (!live.length) return;

  // Hide the registered text, screenshot, sample, restore.
  await page.evaluate((rows) => {
    for (const row of rows) for (const n of document.querySelectorAll(row.selector)) n.style.visibility = 'hidden';
  }, registry);
  const backdrops = await sampleBackdrops(
    page,
    live.map((f) => ({ x: f.x, y: f.y })),
  );
  await page.evaluate((rows) => {
    for (const row of rows) for (const n of document.querySelectorAll(row.selector)) n.style.visibility = '';
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
          await checkContrast(
            page,
            REGISTRY.filter((r) => !r.page || r.page === name),
            where,
          );

          // No blank screens: the visible panel must actually have painted
          // something. A page that renders nothing passes every check above.
          const painted = await page.evaluate((n) => {
            const el = document.getElementById(`page-${n}`);
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim().length };
          }, name);
          if (painted.w < 100 || painted.h < 60) fail(where, `panel box is ${painted.w}x${painted.h} — effectively invisible`);
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

          // ONE RANGE, TWO SURFACES, CHECKED AS RENDERED. The PFD's range
          // buttons and the RADAR page's drive one value through one setter;
          // this clicks on one surface and reads the OTHER, because the sync
          // is the claim and a grep for setRange would only prove somebody
          // typed it.
          if (name === 'pfd') {
            const sync = await page.evaluate(() => {
              const pfd25 = [...document.querySelectorAll('.pfd-range-btn')].find((b) => b.textContent === '25');
              if (!pfd25) return { missing: true };
              pfd25.click();
              const radar25 = [...document.querySelectorAll('.radar-range-btn')].find((b) => b.textContent === '25 nm');
              const out = {
                missing: false,
                pfdPressed: pfd25.getAttribute('aria-pressed'),
                radarPressed: radar25?.getAttribute('aria-pressed') ?? 'absent',
              };
              const pfd40 = [...document.querySelectorAll('.pfd-range-btn')].find((b) => b.textContent === '40');
              pfd40?.click();
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
  await page.evaluate(() => document.getElementById('power-btn').click());
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const btn = document.getElementById('power-btn');
    return { checked: btn.getAttribute('aria-checked'), text: btn.textContent.replace(/\s+/g, ' ').trim() };
  });
  if (after.checked !== 'true') fail(where, 'pressing the switch did not change aria-checked');
  if (!/\bON\b/i.test(after.text)) fail(where, `the switch still reads "${after.text}" after being switched on`);

  // And back off again. A switch that only goes one way is a button wearing a
  // switch's clothes.
  await page.evaluate(() => document.getElementById('power-btn').click());
  await page.waitForTimeout(250);
  const back = await page.evaluate(() => {
    const btn = document.getElementById('power-btn');
    return { checked: btn.getAttribute('aria-checked'), text: btn.textContent.replace(/\s+/g, ' ').trim() };
  });
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
    };
  });

  if (opened.missing) {
    fail(where, 'the (i) button is missing');
    return;
  }
  await page.waitForTimeout(200);
  if (!opened.open) fail(where, 'pressing (i) did not open the information dialog');
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
async function checkStoredLevelling(browser, base) {
  const where = 'stored-levelling';
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, permissions: [] });

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
