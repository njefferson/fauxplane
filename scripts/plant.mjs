#!/usr/bin/env node
/**
 * plant.mjs — break one thing at a time and prove the gate notices.
 *
 * A CHECK YOU HAVE NEVER SEEN GO RED IS NOT EVIDENCE, and it is
 * indistinguishable from a check that works. A sibling app shipped a headless
 * check reading "and Solid shades the roof planes as well — ok" that had been
 * green from the moment it was written; deleting an entire roof plane did not
 * move it, because it measured the TOTAL shaded pixels and the walls alone
 * already cleared the threshold. Underneath was a real defect that had already
 * reached staging.
 *
 * So each plant below breaks ONE specific thing the gate claims to check, and
 * this script asserts two things:
 *   - the gate exits NON-ZERO, and
 *   - the failure it prints is ABOUT the thing that was broken, not some
 *     collateral damage that would have fired anyway.
 *
 * The second assertion is the one that matters. A check that goes red for the
 * wrong reason is still a check that has never been shown to work.
 *
 * FILES ARE BACKED UP TO DISK AND RESTORED IN A `finally`, ON A SIGNAL, AND ON
 * THE NEXT RUN. An in-memory backup is not enough, and this script learned that
 * the expensive way: a run was killed by an outer shell timeout partway through
 * a plant, the `finally` never executed, and the working tree kept the injected
 * fault. It surfaced twenty minutes later as a gate failure that looked like a
 * real regression in code that had just been verified and pushed.
 *
 * So: the original content goes to .plant-backup/ BEFORE the file is touched,
 * signal handlers restore synchronously, and startup restores any backup a
 * previous run left behind. A fault-injection harness that is not crash-safe is
 * a saboteur with good intentions.
 *
 * Never reach for `git checkout` to undo a plant — a sibling session did that
 * on a file whose real work was still uncommitted and destroyed it.
 *
 *   node scripts/plant.mjs            # every plant
 *   node scripts/plant.mjs --only 3   # one, by index
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const file = (p) => path.join(REPO, p);

/**
 * Each plant names the check it is aiming at, the edit that should break it,
 * and a pattern the gate's output must match. `expect` is deliberately
 * specific: matching only "FAIL" would pass on any failure at all.
 */
const PLANTS = [
  {
    name: 'contrast: the build stamp is dimmed below the floor',
    check: 'contrast registry, measured from real pixels',
    file: 'public/styles.css',
    find: '  font-size: 0.8125rem;\n  color: var(--text-3);\n  cursor: pointer;',
    replace: '  font-size: 0.8125rem;\n  color: #3f3f3f;\n  cursor: pointer;',
    expect: /build stamp measured \d+\.\d+:1 against the real backdrop/,
  },
  {
    name: 'contrast: the build stamp is dimmed with opacity instead of a token',
    check: 'opacity is invisible to a contrast gate',
    file: 'public/styles.css',
    find: '  color: var(--text-3);\n  cursor: pointer;\n  user-select: text;',
    replace: '  color: var(--text-3);\n  opacity: 0.35;\n  cursor: pointer;\n  user-select: text;',
    expect: /build stamp: dimmed with opacity/,
  },
  {
    name: 'registry: a registered class is renamed',
    check: 'a selector matching nothing FAILS, it is never skipped',
    file: 'public/src/panels/bite.js',
    find: "const reason = el('p', { class: 'bite-reason' });",
    replace: "const reason = el('p', { class: 'bite-why' });",
    expect: /contrast registry selector matched nothing: \.bite-reason/,
  },
  {
    name: 'targets: a control drops under the 44px floor',
    check: 'touch target size',
    file: 'public/styles.css',
    find: '.koll-btn {\n  min-width: var(--target);\n  min-height: var(--target);',
    replace: '.koll-btn {\n  min-width: 30px;\n  min-height: 30px;\n  height: 30px;',
    expect: /target <button> ".*" is \d+x\d+, under the 44px floor/,
  },
  {
    name: 'no-synthetic-data: a FAILED readout shows a number anyway',
    check: 'acceptance criterion 1 — no digits with every permission denied',
    file: 'public/src/render/dom.js',
    find: "valueNode.textContent = !field || p === 'FAIL' ? '— — —' : format(field.value);",
    replace: "valueNode.textContent = !field || p === 'FAIL' ? '0' : format(field.value);",
    expect: /is FAIL but is still showing digits/,
  },
  {
    name: 'honesty: a failure stops explaining itself',
    check: 'every FAIL carries a reason',
    file: 'public/src/render/dom.js',
    find: "reasonNode.textContent = p === 'FAIL' ? (field?.reason ?? 'no reading') : '';",
    replace: "reasonNode.textContent = '';",
    expect: /is FAIL with no reason/,
  },
  {
    name: 'secrets: a credential is inlined into a client module',
    check: 'acceptance criterion 2 — nothing secret in the client bundle',
    file: 'public/src/data/traffic.js',
    find: "import { REGION } from '../core/region.js';",
    replace: "const client_secret = 'a5f3c9d2e7b14806aa93';\nimport { REGION } from '../core/region.js';",
    expect: /matches a secret pattern/,
  },
  {
    name: 'client egress: a module calls a third-party host directly',
    check: 'every third-party call goes through /api/*',
    file: 'public/src/data/metar.js',
    find: "export const FALLBACK_ALTIMETER_INHG = 29.92;",
    replace: "export const FALLBACK_ALTIMETER_INHG = 29.92;\nexport const DIRECT = 'https://aviationweather.gov/api/data/metar';",
    expect: /references aviationweather\.gov directly/,
  },
  {
    // The old plant here removed the power gate's second dismiss control. There
    // is no gate any more — the panel opens as itself with a PWR switch on it —
    // so the property worth breaking changed with it. A two-state control that
    // does not declare itself a switch is the new failure: a screen reader
    // announces a button, the reader is never told whether the panel is on, and
    // the state word alone cannot be queried.
    name: 'panel power: the switch stops declaring that it is a switch',
    check: 'the power control is a real two-state switch, and says which state it is in',
    file: 'public/index.html',
    find: '<button type="button" role="switch" aria-checked="false" id="power-btn" class="power-btn">',
    replace: '<button type="button" id="power-btn" class="power-btn">',
    expect: /role "null" — a two-state control is a switch|aria-checked/,
  },
  {
    // adsb.fi's terms REQUIRE the citation. A licence condition nobody watches
    // fail is a condition that quietly lapses in the next tidy-up — which is
    // the whole reason this file exists.
    name: 'attribution: the citation the providers\u2019 terms require stops being a link',
    check: 'the radar page links whichever source answered, as a condition of use',
    file: 'public/src/panels/radar.js',
    find: "            ? el('a', { class: 'radar-credit-link', href: home, rel: 'noopener', text: name })",
    replace: "            ? el('span', { class: 'radar-credit-link', text: name })",
    expect: /is not a link|renders no source citation|require/,
  },
  {
    // THE REGRESSION THIS RELEASE IS ABOUT. A gyro with an ordinary zero-offset
    // used to hold the filter at a permanent standoff, so `converged` never
    // became true and the horizon stayed crossed out for as long as anyone
    // watched. Removing the integral term puts that back exactly.
    //
    // Checked against the UNIT SUITE, not the accessibility gate: a headless
    // browser has no accelerometer, so the gate sees FAIL either way and would
    // stay green through this. Planting it against the gate would have "passed"
    // while proving nothing.
    name: 'attitude: the gyro zero-offset stops being learned',
    check: 'an ordinary gyro offset does not hold the horizon crossed out',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    const ki = explainable ? cfg.biasKi * (gain / (1 - cfg.alpha)) : 0;',
    replace: '    const ki = 0;',
    expect: /never converged|zero-offset|horizon vanished|estimated at/,
  },
  {
    // The other half of the same claim: attitude must reach the panel from
    // gravity alone, without waiting for the gyro to settle.
    name: 'attitude: the horizon goes back to waiting on convergence',
    check: 'a usable gravity attitude is published without waiting for the gyro',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '      const hasAttitude = pitch !== null && roll !== null && !stale;',
    replace: '      const hasAttitude = pitch !== null && roll !== null && !stale && converged;',
    expect: /no attitude after a good gravity sample|hasAttitude/,
  },
  {
    // The diagnostics report exists so nobody has to read pixels off a photo.
    // If it silently stops carrying the diagnosis, the whole reason for it is
    // gone and nothing else on screen would look different.
    name: 'diagnostics: the report stops leading with what is failing',
    check: 'one tap on the version stamp produces a usable diagnosis',
    file: 'public/src/panels/diagnostics.js',
    find: "  line(\n    `WHAT IS NOT WORKING",
    replace: "  line(\n    `panel state",
    expect: /does not lead with what is failing/,
  },
  {
    // Mount levelling moves what the instrument calls zero. That is legitimate
    // and it is exactly why it must be visible: a horizon reading level at an
    // attitude the device is not at, with nothing saying so, is the most
    // plausible-looking wrong instrument this app could ship.
    name: 'levelling: the panel stops saying its zero has been moved',
    check: 'a levelled horizon declares the offset on its own face',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    get mountOffset() {\n      if (!mountRef) return null;',
    replace: '    get mountOffset() {\n      return null;\n      // eslint-disable-next-line no-unreachable\n      if (!mountRef) return null;',
    expect: /the offset must be reportable|mountOffset/,
  },
  {
    // The iPad defect. Believing screen.orientation.angle put the horizon
    // ninety degrees over in every orientation, and no test could see it
    // because every device tried until then was in portrait.
    name: 'orientation: the screen angle goes back to trusting the lying API',
    check: 'the screen angle comes from the source that told the truth on iOS',
    gate: 'tests',
    file: 'public/src/sensors/orientation.js',
    find: '  if (Number.isFinite(windowOrientation)) {',
    replace: '  if (false && Number.isFinite(windowOrientation)) {',
    expect: /window\.orientation|iPad/i,
  },
  {
    // The other half: the rotation itself was applied backwards, invisible for
    // two releases because portrait makes it the identity.
    name: 'orientation: the screen rotation is applied backwards again',
    check: 'a quarter turn moves earth-up to the screen axis it should',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '  let sx = (x * c - y * s) / m;\n  let sy = (x * s + y * c) / m;',
    replace: '  let sx = (x * c + y * s) / m;\n  let sy = (-x * s + y * c) / m;',
    expect: /quarter turn was applied backwards|held square is not banked/,
  },
  {
    // The escape hatch that got Noah's iPad off 0.4.1. Its dangerous direction
    // is the FALSE POSITIVE: it can force a reload, so a version of it that
    // fires when it should not is a reload loop, which is worse than the stale
    // panel. Planting the loosened condition proves the tests still object.
    name: 'stale worker: the escape hatch starts reloading when it should not',
    check: 'a first visit, the current release and a half-installed worker are all left alone',
    gate: 'tests',
    file: 'public/boot.js',
    find: '  if (!mine.length) return [];\n  if (!liveVersion || mine.includes(PREFIX + liveVersion)) return [];',
    replace: '  if (!liveVersion) return [];',
    expect: /first visit|installing is left alone|current release/,
  },
  {
    // The other direction: the hatch stops finding a genuinely stuck device and
    // the loop that stranded the iPad for two releases comes straight back.
    name: 'stale worker: the escape hatch stops detecting an old release',
    check: 'a worker from an older release is detected',
    gate: 'tests',
    file: 'public/boot.js',
    find: '  return mine;\n}',
    replace: '  return [];\n}',
    expect: /older release is detected/,
  },
  {
    // The report is the tool for diagnosing a broken device, so the state it
    // must survive is "nothing works". `undefined?.provenance !== 'FAIL'` is
    // true, and that optional chain took the whole report down on any device
    // that never got a position fix.
    name: 'diagnostics: the report throws on a device with no position fix',
    check: 'a device that never got a fix still gets a report',
    gate: 'tests',
    file: 'public/src/panels/diagnostics.js',
    find: "&& field && field.provenance !== 'FAIL'",
    replace: "&& field?.provenance !== 'FAIL'",
    expect: /never got a position fix|Cannot read properties of undefined/,
  },
  {
    // Zero is a measurement. Going back to crossing groundspeed out because the
    // platform handed us null is the exact defect Noah found.
    name: 'stationary: groundspeed goes back to failing instead of reading zero',
    check: 'a receiver sitting still reads zero, not a failure',
    gate: 'tests',
    file: 'public/src/core/derive.js',
    find: '  return { speedMs, floorMs, dt, moving: speedMs > floorMs };',
    replace: '  return { speedMs, floorMs, dt, moving: true };',
    expect: /jitter inside the accuracy bound is not motion|not moving/,
  },
  {
    // The zero-velocity update. Without it an integrator reads every shake as
    // the start of a climb, which is what crossed the VSI out on a desk.
    name: 'stationary: the zero-velocity update stops being applied',
    check: 'a wiggle is not integrated into a climb',
    gate: 'tests',
    file: 'public/src/core/derive.js',
    find: '      rateFpm = 0;\n      lastAccelAt = at;\n      reason = null;\n      stationaryAt = at;',
    replace: '      stationaryAt = null;',
    expect: /wiggle|shaken desk|no net vertical speed|stationary/,
  },
  {
    // The exact defect that shipped: tokens read while the page was hidden get
    // cached, so every gauge on it draws in the missing-token sentinel colour.
    // Caught by the ACCESSIBILITY gate, because it is the only thing that runs
    // a real browser and can read pixels back out of a canvas.
    name: 'canvas: token reads taken while hidden are cached again',
    check: 'no gauge draws in the missing-token magenta',
    file: 'public/src/render/canvas.js',
    find: '    tokens = complete ? out : null;',
    replace: '    tokens = out;',
    expect: /missing-token magenta/,
  },
  {
    // A rejected sample means the device is being thrown around. Leaving
    // `still` set through that told the ZUPT a manoeuvring aircraft was
    // stationary, which would zero a real climb.
    name: 'stillness: a rejected manoeuvring sample stops clearing stillness',
    check: 'a shove genuinely registers as motion',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '      stillSince = null;\n      return;\n    }\n\n    rejecting = false;',
    replace: '      return;\n    }\n\n    rejecting = false;',
    expect: /must genuinely register as motion|still/,
  },
  {
    // Levelling must not depend on the calmest instant being the instant of
    // the press, which is the instant the finger lands.
    name: 'levelling: the filter stops remembering when it was last still',
    check: 'the pre-touch reference survives the press',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '      lastStillAttitude = { pitch: solved.pitch, roll: solved.roll, at };',
    replace: '      lastStillAttitude = null;',
    expect: /still attitude|pre-touch reference/,
  },
  {
    // A CDN block page is HTML. Pasting its head onto a gauge says
    // "<!DOCTYPE html> <!--[if lt IE 7]>" and truncates before the error code,
    // which is the only part that decides what to do next.
    name: 'upstream: the raw block page is pasted onto the gauge again',
    check: 'a refused upstream names the CDN, the reason and the code',
    gate: 'tests',
    file: 'functions/api/traffic.js',
    find: '    const title = /<title[^>]*>([^<]{1,160})<\\/title>/i.exec(body);',
    replace: '    const title = null && body;',
    expect: /restrict access|no markup at all|no doctype/,
  },
  {
    // Chained derived values compose their reasons, so the quoting nests. Three
    // levels deep it was a paragraph of parentheses on the face of a gauge, and
    // the one fact underneath was the part hardest to find.
    name: 'reasons: a failure reason goes back to nesting its parentheses',
    check: 'a chained failure reads as one sentence naming the root cause',
    gate: 'tests',
    file: 'public/src/core/provenance.js',
    find: '    const root = rootCause(raw) || \'missing\';',
    replace: '    const root = raw;',
    expect: /no nested parenthesis|no doubled name prefix|one sentence|not yet initialised/,
  },
  {
    // Nineteen aircraft, a dozen in one quadrant, labels overprinted into a
    // smear that reads as corruption rather than density. The gate cannot see
    // inside a canvas, so the unit suite is the only thing that can catch this.
    name: 'plan: aircraft labels go back to overprinting each other',
    check: 'no two labels on the plan view overlap',
    gate: 'tests',
    file: 'public/src/render/gauges/plan.js',
    find: '      if (placed.some((q) => overlaps(q, box))) continue;',
    replace: '      // collision check removed',
    expect: /overlap|smear/,
  },
  {
    // Re-added after the harness was fixed. It could not be proven before: the
    // test asserted on a null reason, which throws a TypeError instead of an
    // assertion, so the expected regex never appeared in the output at all.
    name: 'resolution: the vertical speed stops saying what it cannot resolve',
    check: 'a rate under the GPS resolution keeps its value and gains the bound',
    gate: 'tests',
    file: 'public/src/core/derive.js',
    find: '          { ...meta, reason: `GPS altitude resolves no better than ±${Math.round(floor).toLocaleString()} fpm here` },',
    replace: '          meta,',
    expect: /resolves no better than/,
  },
  {
    // A horizon that trembles on a desk reads as an instrument that is not
    // working, whatever the numbers say. The static gain is right for ALIGNING
    // and wrong for holding.
    name: 'jitter: the aligned filter goes back to the alignment gain',
    check: 'an aligned, still horizon does not wander on accelerometer noise',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    const gain = still ? (aligned ? 1 - cfg.settledAlpha : 1 - cfg.staticAlpha) : 1 - cfg.alpha;',
    replace: '    const gain = still ? 1 - cfg.staticAlpha : 1 - cfg.alpha;',
    expect: /settling made no difference/,
  },
  {
    // Blanking the plan view on a failed refresh tells the reader the sky is
    // empty. sw.js refuses to invent an empty sky for exactly this reason and
    // this path was doing it anyway.
    name: 'radar: a failed refresh empties the plan view again',
    check: 'a failed refresh keeps the aircraft already on the plan view',
    gate: 'tests',
    file: 'public/src/data/traffic.js',
    // RE-ANCHORED 2026-08-03: the single-radius fetch introduced `allNearby`,
    // so the old two-line anchor stopped matching and this plant silently went
    // UNPROVEN. A plant whose anchor has drifted proves nothing while still
    // looking like coverage — the second time that has happened in this file.
    find: '      if (result.ok) {\n        // Everything the fetch returned, kept whole so a range change can be',
    replace: '      allNearby = result.ok ? withRangeAndBearing(result.aircraft ?? [], centre) : [];\n      nearby = withinRange(allNearby, display);\n      if (result.ok) {\n        // Everything the fetch returned, kept whole so a range change can be',
    expect: /failed refresh emptied the sky/,
  },
  {
    // The first surface a new reader sees. If the orientation is dropped, the
    // gate still asks for sensor permissions from somebody who has not been
    // told what the thing is.
    name: 'first run: the new-reader orientation is dropped from the gate',
    check: 'the power gate tells a first-time reader what this is and how to install it',
    file: 'public/index.html',
    // Anchored on the page LIST, not on a heading: two headings share
    // `.gate-first-h`, so removing one leaves the selector matching the other
    // and the gate stays green. A registry row guards a class only while that
    // class has one reason to exist — which is worth knowing about every row
    // in there, not just this one.
    find: '<dl class="gate-pages">',
    replace: '<dl class="gate-pages-gone">',
    expect: /matched nothing: \.gate-pages dt/,
  },
  {
    // THE ROCKET. Leaning a hand-held phone swings the accelerometer's
    // direction while its magnitude stays near one g, so the magnitude gate
    // never fires and the horizon follows the corruption. Only the unit suite
    // can see this — a headless browser has no accelerometer.
    name: 'attitude: the direction gate stops rejecting corrupted gravity',
    check: 'a lean with a corrupted accelerometer tracks the gyro, not the corruption',
    gate: 'tests',
    file: 'public/src/core/fusion.js',
    find: '    if (aligned && !stillHeld && disagreeDeg > cfg.accelGateDeg) {',
    replace: '    if (false) {',
    expect: /gated horizon is|the gate made no difference/,
  },
  {
    // Two range controls, one value. Break the PFD side's wiring and the two
    // surfaces show two different ranges — checked as rendered, by clicking
    // one and reading the other.
    name: 'range: the PFD control stops driving the shared range',
    check: 'range set on the PFD reaches the radar page',
    file: 'public/src/app.js',
    find: "    b.addEventListener('click', () => radar.setRange(nm));",
    replace: "    b.addEventListener('click', () => b.setAttribute('aria-pressed', 'true'));",
    expect: /did not reach the radar page/,
  },
  {
    // Power-on used to throw the first-run instructions away mid-read, so the
    // node was moved rather than destroyed. RE-ANCHORED 2026-08-03: there is no
    // gate any more — the panel opens as itself with a PWR switch on it — and
    // the destination changed from the SETUP page to the (i) menu, at boot
    // rather than on dismissal. The INVARIANT is unchanged: the instructions
    // survive and are findable. Only the place they survive INTO moved.
    name: 'first run: the orientation never reaches the (i) menu',
    check: 'the first-run instructions survive into the (i) menu',
    file: 'public/src/app.js',
    find: "  info.adoptFirstRun($('first-run-store')?.querySelector('.gate-first'));",
    replace: "  $('first-run-store')?.querySelector('.gate-first')?.remove();",
    expect: /did not survive into the \(i\) menu|first-run instructions/,
  },
  {
    name: 'BITE: the page stops reading the live store',
    check: 'BITE explains each failure rather than reporting all-clear',
    file: 'public/src/panels/bite.js',
    find: 'const merged = mergeRuntime(staticEntries, fields, CHECKS);',
    replace: 'const merged = mergeRuntime(staticEntries, fields, {});',
    // Deliberately names the ENTRY. The first version of both this expectation
    // and the check it aims at were satisfied by any FAIL anywhere on the page,
    // and the feed rows supply one in this build whatever BITE does.
    expect: /BITE reports "(orientation|heading|motion|geo)" as PASS with every permission denied/,
  },
];

const BACKUP_DIR = path.join(REPO, '.plant-backup');
const backupPath = (rel) => path.join(BACKUP_DIR, rel.replace(/[/\\]/g, '__'));

/** Restore anything a previous run left behind. Runs before the baseline, so a
 *  killed run is repaired rather than diagnosed. */
function restoreLeftovers() {
  if (!existsSync(BACKUP_DIR)) return [];
  const restored = [];
  for (const name of readdirSync(BACKUP_DIR)) {
    const rel = name.replace(/__/g, '/');
    const target = path.join(REPO, rel);
    writeFileSync(target, readFileSync(path.join(BACKUP_DIR, name)));
    restored.push(rel);
  }
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  return restored;
}

const saveBackup = (rel, content) => {
  mkdirSync(BACKUP_DIR, { recursive: true });
  writeFileSync(backupPath(rel), content);
};
const clearBackup = (rel) => {
  rmSync(backupPath(rel), { force: true });
  try {
    rmSync(BACKUP_DIR, { recursive: false });
  } catch {
    /* still holds other backups, which is fine */
  }
};

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    const restored = restoreLeftovers();
    if (restored.length) process.stderr.write(`\nplant: interrupted — restored ${restored.join(', ')}\n`);
    process.exit(130);
  });
}

/**
 * TWO GATES, BECAUSE THEY SEE DIFFERENT THINGS.
 *
 * The accessibility gate drives a real browser, so it is the only thing that
 * can see contrast, target sizes and what is actually on screen. But a headless
 * browser has NO ACCELEROMETER, so every attitude in it is FAIL whatever the
 * filter does — which means the gate is structurally blind to the entire class
 * of bug this release is about. Planting a broken horizon against it would
 * "pass" while proving nothing, which is the exact failure this script exists
 * to prevent, one level up.
 *
 * So a plant declares which gate should catch it, and the sensor-logic ones are
 * checked against the unit suite instead.
 */
// The unit entry names the test files EXPLICITLY, matching package.json's
// `npm test`. Handing node --test the whole scripts/ directory sweeps in this
// file, the gate and the build scripts and tries to run them as suites.
// READ FROM DISK, never hand-listed. This was a hand-written array of five
// names, and it silently stopped covering `boot.test.mjs` the moment that file
// was added — a plant gate that quietly runs fewer tests than `npm test` will
// bless a fault the suite would have caught. Filtered on the suffix rather than
// handed the whole directory, because `node --test scripts/` once swept in
// every non-test script in here and ran them as tests.
const TEST_FILES = readdirSync(HERE)
  .filter((n) => n.endsWith('.test.mjs'))
  .sort()
  .map((n) => path.join(HERE, n));
const GATES = {
  a11y: [path.join(HERE, 'a11y-gate.mjs'), '--quick'],
  tests: ['--test', ...TEST_FILES],
};

const runGate = (which = 'a11y') =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, GATES[which], { cwd: REPO });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      out += d;
    });
    child.on('close', (code) => resolve({ code, out }));
  });

const { values: argv } = parseArgs({ options: { only: { type: 'string' } } });

const selected = argv.only ? [PLANTS[Number(argv.only)]] : PLANTS;
const results = [];

/**
 * ONE HARNESS AT A TIME, AND THIS IS NOT THEORETICAL.
 *
 * Two runs overlapped once. The second read a file the FIRST had already
 * planted, kept that as its "original", and faithfully restored the planted
 * fault when it finished — so the working tree silently kept a broken BITE page
 * that every gate then passed, because the plant it came from had been retired.
 * It surfaced only as a STALE plant on the next run.
 *
 * A harness whose whole purpose is to leave the tree exactly as it found it has
 * to refuse to run twice at once. The lock carries the pid so a stale one from a
 * killed run can be told apart from a live one.
 */
// A SIBLING of the backup directory, never inside it: restoreLeftovers() wipes
// that directory wholesale, so a lock kept in there would delete itself and
// then be restored on top of the repo as a file called LOCK.
const LOCK = path.join(REPO, '.plant-backup.lock');
try {
  const held = readFileSync(LOCK, 'utf8').trim();
  const pid = Number(held);
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    /* no such process — the lock outlived its run */
  }
  if (alive) {
    process.stderr.write(
      `plant: another run is already planting (pid ${pid}).\n` +
        'Running two at once makes one restore the other\'s injected code into the tree.\n',
    );
    process.exit(1);
  }
  process.stdout.write(`plant: clearing a stale lock from pid ${pid}\n`);
} catch {
  /* no lock file: the normal case */
}
mkdirSync(path.dirname(LOCK), { recursive: true });
writeFileSync(LOCK, String(process.pid));
const releaseLock = () => {
  try {
    rmSync(LOCK, { force: true });
  } catch {
    /* nothing to release */
  }
};
process.on('exit', releaseLock);

const leftovers = restoreLeftovers();
if (leftovers.length) {
  process.stdout.write(`restored from an interrupted earlier run: ${leftovers.join(', ')}\n`);
}

// Baseline first: if the tree is already red, every plant "passes" for the
// wrong reason and this whole script proves nothing.
// Both gates, because a plant is only evidence if the thing it turns red was
// green to begin with.
for (const which of Object.keys(GATES)) {
  process.stdout.write(`baseline ${which} (nothing planted) ... `);
  const baseline = await runGate(which);
  if (baseline.code !== 0) {
    process.stderr.write(`\nthe ${which} gate is already failing before anything was planted:\n${baseline.out}\n`);
    process.exit(1);
  }
  process.stdout.write('green\n');
}
process.stdout.write('\n');

for (const plant of selected) {
  const target = file(plant.file);
  const original = await readFile(target, 'utf8');

  if (!original.includes(plant.find)) {
    results.push({ plant, ok: false, why: 'the plant no longer matches the file — this script has gone stale' });
    process.stdout.write(`STALE  ${plant.name}\n`);
    continue;
  }

  try {
    saveBackup(plant.file, original);
    await writeFile(target, original.replace(plant.find, plant.replace));
    const { code, out } = await runGate(plant.gate ?? 'a11y');
    const caught = plant.expect.test(out);
    if (code === 0) {
      results.push({ plant, ok: false, why: 'the gate stayed GREEN with the fault planted' });
      process.stdout.write(`GREEN  ${plant.name}  <-- the check does not work\n`);
    } else if (!caught) {
      // WHY THIS DOES NOT GREP FOR "FAIL".
      //
      // It used to, and a PASSING unit test whose NAME contains the word — "a
      // FAIL field CANNOT carry a value" — matched the filter. The harness then
      // quoted a GREEN line as the cause of a red run, which sent a session
      // looking at the wrong file twice. A diagnosis that names an innocent
      // check is worse than "it went red", because it is followed.
      //
      // `not ok` is the TAP marker for a failing test and cannot appear on a
      // passing one; the a11y gate's own failures are its `FAIL ` prefix at the
      // start of a line, which a test NAME never has.
      const why = out
        .split('\n')
        .filter((l) => /^\s*not ok /.test(l) || /^\s*FAIL\s/.test(l))
        .slice(0, 2)
        .map((l) => l.trim())
        .join(' | ');
      results.push({ plant, ok: false, why: `the gate went red, but not about this: ${why || '(no failing line found — read the gate output)'}` });
      process.stdout.write(`WRONG  ${plant.name}  <-- red for a different reason\n`);
    } else {
      results.push({ plant, ok: true });
      process.stdout.write(`caught ${plant.name}\n`);
    }
  } finally {
    // Always, on every path. The copy taken before planting is the only thing
    // standing between a planted fault and a corrupted working tree.
    await writeFile(target, original);
    clearBackup(plant.file);
  }
}

const broken = results.filter((r) => !r.ok);
process.stdout.write(`\n${results.length - broken.length}/${results.length} planted faults were caught by the gate\n`);
if (broken.length) {
  for (const b of broken) process.stderr.write(`  UNPROVEN  ${b.plant.check}: ${b.why}\n`);
  process.exit(1);
}
