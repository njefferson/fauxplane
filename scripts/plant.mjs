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
    name: 'interrupting surface: the bottom dismiss is removed',
    check: 'a way out at the bottom as well, not only at the top',
    file: 'public/index.html',
    find: '<button type="button" class="gate-close gate-close-foot" data-dismiss-gate>Continue without sensors</button>',
    replace: '<span class="gate-small">Continue without sensors</span>',
    expect: /only 1 dismiss control|no dismiss is on screen after scrolling/,
  },
  {
    // adsb.fi's terms REQUIRE the citation. A licence condition nobody watches
    // fail is a condition that quietly lapses in the next tidy-up — which is
    // the whole reason this file exists.
    name: 'attribution: the adsb.fi citation their terms require is dropped',
    check: 'the radar page links adsb.fi, as a condition of using their data',
    file: 'public/src/panels/radar.js',
    find: "el('a', { class: 'radar-credit-link', href: 'https://adsb.fi', rel: 'noopener', text: 'adsb.fi' })",
    replace: "el('span', { class: 'radar-credit-link', text: 'adsb.fi' })",
    expect: /does not link adsb\.fi|require a citation/,
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
    find: '    const ki = cfg.biasKi * (gain / (1 - cfg.alpha));',
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
const TEST_FILES = ['core', 'fusion', 'derive', 'wmm', 'build-navdata'].map((n) => path.join(HERE, `${n}.test.mjs`));
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
      results.push({ plant, ok: false, why: `the gate went red, but not about this: ${out.split('\n').filter((l) => l.includes('FAIL')).slice(0, 2).join(' | ')}` });
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
