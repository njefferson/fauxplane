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

const PAGES = ['pfd', 'atis', 'bite'];
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
const GATE_REGISTRY = [
  { selector: '.gate-title', label: 'gate title', min: 4.6 },
  { selector: '.gate-body', label: 'gate body', min: 4.6 },
  { selector: '.gate-small', label: 'gate small print', min: 4.6 },
  { selector: '.gate-power', label: 'PANEL POWER button', min: 4.6 },
  { selector: '.gate-close', label: 'gate close button', min: 4.6 },
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
const EXPAND = '.page-cards, .readouts, .page-pfd, .gate, .panel, body, html';

async function checkContrast(page, registry, where) {
  const restore = await page.evaluate((sel) => {
    const saved = [];
    for (const n of document.querySelectorAll(sel)) {
      saved.push([n, n.style.overflow, n.style.height, n.style.maxHeight]);
      n.style.overflow = 'visible';
      n.style.height = 'auto';
      n.style.maxHeight = 'none';
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
    for (const [n, overflow, height, maxHeight] of window.__gateRestore ?? []) {
      n.style.overflow = overflow;
      n.style.height = height;
      n.style.maxHeight = maxHeight;
    }
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
  const server = await createStaticServer({ extraRoutes: { '/__gate__/axe.js': AXE } });
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
        if (vp === VIEWPORTS[0] && dim === 'day') await checkPowerGate(page, base);

        await page.evaluate(() => document.querySelector('[data-dismiss-gate]').click());
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
async function checkPowerGate(page, base) {
  const where = 'power-gate';

  const first = await page.evaluate(() => {
    const gate = document.getElementById('power-gate');
    const close = gate.querySelector('[data-dismiss-gate]');
    const r = close.getBoundingClientRect();
    return {
      gateHeight: Math.round(gate.getBoundingClientRect().height),
      viewportHeight: window.innerHeight,
      closeVisibleFirstFrame: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
      closeCount: gate.querySelectorAll('[data-dismiss-gate]').length,
      scrollHeight: gate.scrollHeight,
    };
  });

  await checkContrast(page, GATE_REGISTRY, where);
  await checkTargets(page, where);
  await checkNames(page, where);

  if (!first.closeVisibleFirstFrame) fail(where, 'the dismiss is not visible in the first frame without scrolling');
  if (first.closeCount < 2) fail(where, `only ${first.closeCount} dismiss control(s) — one must also be present at the bottom`);
  // Bounded in length: measure it, do not assume.
  if (first.scrollHeight > first.viewportHeight * 2) {
    fail(where, `the panel is ${first.scrollHeight}px tall against a ${first.viewportHeight}px viewport — fold or paginate it`);
  }

  // Reachable from ANYWHERE in it: scroll to the very end and check again, and
  // hit-test the centre so nothing is sitting on top of it.
  const atEnd = await page.evaluate(() => {
    const gate = document.getElementById('power-gate');
    gate.scrollTop = gate.scrollHeight;
    const closes = [...gate.querySelectorAll('[data-dismiss-gate]')];
    return closes.map((close) => {
      const r = close.getBoundingClientRect();
      const onScreen = r.top >= 0 && r.bottom <= window.innerHeight;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onScreen, hitIsSelf: close.contains(hit) };
    });
  });
  if (!atEnd.some((c) => c.onScreen)) fail(where, 'no dismiss is on screen after scrolling to the very end');
  if (!atEnd.some((c) => c.hitIsSelf)) fail(where, 'hit-testing the dismiss centre returns something else — it is covered');

  // It must actually REMOVE the surface, not merely flag it closed, and focus
  // must land somewhere real.
  await page.evaluate(() => document.querySelector('[data-dismiss-gate]').click());
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const gate = document.getElementById('power-gate');
    const r = gate.getBoundingClientRect();
    return {
      gone: gate.hidden || getComputedStyle(gate).display === 'none' || r.width === 0,
      focusReal: document.activeElement !== null && document.activeElement !== document.body ? true : document.body.contains(document.activeElement),
    };
  });
  if (!after.gone) fail(where, 'the surface is still rendered after its dismiss was activated');
  if (!after.focusReal) fail(where, 'focus did not land anywhere real after dismissal');

  // The dismiss must work with NOTHING granted — it is never conditional.
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
    for (const host of ['opensky-network.org', 'aviationweather.gov', 'api.open-meteo.com']) {
      if (file.startsWith('/src/') && body.includes(`https://${host}`)) {
        fail(where, `${file} references ${host} directly — the client must go through /api/*`);
      }
    }
  }

  // And the functions must read their credentials from env bindings only.
  const traffic = await readFile(path.join(REPO, 'functions', 'api', 'traffic.js'), 'utf8');
  if (!/env\.OPENSKY_CLIENT_ID/.test(traffic) || !/env\.OPENSKY_CLIENT_SECRET/.test(traffic)) {
    fail(where, 'functions/api/traffic.js does not read its credentials from env bindings');
  }
  if (/OPENSKY_CLIENT_SECRET['"]?\s*[:=]\s*['"][^'"]+/.test(traffic)) {
    fail(where, 'functions/api/traffic.js appears to contain a literal secret');
  }
}

/**
 * ACCEPTANCE CRITERION 4: every numeric readout traces to a state field.
 *
 * Rather than trusting the panels, this asks the STORE what it declares and
 * asserts that every readout on screen is one of those fields — and that every
 * field the store publishes carries a provenance from the allowed set.
 */
async function checkProvenanceCoverage(browser, base) {
  const where = 'provenance';
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, permissions: [] });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('[data-dismiss-gate]').click());
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

await main();
