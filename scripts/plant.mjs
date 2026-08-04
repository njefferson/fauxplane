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
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * WHAT to break lives in a DATA file; HOW to break it lives here.
 *
 * The split is what makes `--changed` useful. This file is on the
 * escalation list — editing the injector can break any plant — and almost
 * every release adds a plant, so while the two lived together every release
 * escalated and the selector saved nothing. Adding a plant is a data change
 * and no longer forces a whole sweep.
 */
import { PLANTS } from './plants.data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const file = (p) => path.join(REPO, p);


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

/**
 * FILES WHOSE CHANGE CAN BLUNT A PLANT THAT DOES NOT NAME THEM.
 *
 * A change here forces the WHOLE sweep no matter what `--changed` computes,
 * and the list is deliberately generous. Hub LESSONS §38 is why it exists at
 * all: fixing the contrast sampler silently blunted the canvas sentinel, four
 * targeted re-runs all came back green, and only the whole sweep found 44/45.
 * The lesson was "run the sweep whole" — the refinement is knowing WHEN that
 * argument actually applies, which is when the thing doing the measuring moves,
 * not when a leaf module does.
 *
 *   the gates themselves   — a check that changed can stop catching anything
 *   the store and provenance — every field on every page flows through them
 *   dom/canvas renderers    — every readout and every pixel check
 *   styles.css / index.html — contrast and target checks on every page read them
 */
/** The plants themselves. Data, so it does NOT escalate — but a plant edited
 *  here always runs, however its target file fared. */
const DATA_FILE = 'scripts/plants.data.mjs';

const SWEEP_EVERYTHING_IF_TOUCHED = [
  'scripts/a11y-gate.mjs',
  'scripts/plant.mjs',
  'scripts/serve.mjs',
  'public/src/core/state.js',
  'public/src/core/provenance.js',
  'public/src/render/dom.js',
  'public/src/render/canvas.js',
  'public/styles.css',
  'public/index.html',
];

const { values: argv } = parseArgs({
  options: { only: { type: 'string' }, changed: { type: 'string' }, dry: { type: 'boolean' }, here: { type: 'boolean' } },
});

/**
 * `--changed=<git-ref>` runs only the plants whose target file actually moved.
 *
 * Noah, 2026-08-04: *"you make a small change and then rescan everything else
 * that has no relationship and could not have changed."* He is right, and the
 * arithmetic says so: 24 of these plants are gated by the ACCESSIBILITY gate,
 * each one a full browser run, and they are ~95% of a sweep's wall-clock. The
 * other 33 are unit-gated and cost about a second each.
 *
 * WHAT MAKES THIS SAFE IS THAT IT IS MECHANICAL. Choosing plants by judgement
 * is precisely the habit §38 was written against — you re-run the ones you
 * SUSPECT, which is the reasoning a fault-injection harness exists to replace.
 * This asks git, not a session, and escalates to everything on any file that
 * could affect an unrelated plant.
 *
 * AND IT SAYS WHAT IT SKIPPED. A selective run that prints the same closing
 * line as a whole one is a silent cap, and reads as "everything is covered"
 * when it is not.
 */
function changedFiles(ref) {
  const out = spawnSync('git', ['diff', '--name-only', ref, '--'], { cwd: REPO, encoding: 'utf8' });
  if (out.status !== 0) {
    console.error(`--changed=${ref}: git diff failed — ${(out.stderr || '').trim()}`);
    process.exit(2);
  }
  const tracked = out.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf8' });
  return new Set([...tracked, ...(untracked.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean)]);
}

let selected = PLANTS;
let skipped = [];
let escalated = null;

if (argv.only) {
  selected = [PLANTS[Number(argv.only)]];
} else if (argv.changed) {
  const touched = changedFiles(argv.changed);
  const trigger = SWEEP_EVERYTHING_IF_TOUCHED.filter((f) => touched.has(f));
  if (trigger.length) {
    escalated = trigger;
  } else {
    /**
     * A PLANT THAT IS NEW OR EDITED ALWAYS RUNS, whatever it targets.
     *
     * Splitting the data out opened this hole: selecting purely by target file
     * skips a plant added in the same commit unless that file happened to
     * change too. **A plant nobody has watched fail is not evidence** — it is
     * the entire premise of this harness — so a brand-new one that never ran is
     * the worst possible thing for the selector to skip silently.
     *
     * The diff of the data file names them. Mechanical, like the rest of this.
     */
    const added = new Set();
    if (touched.has(DATA_FILE)) {
      const d = spawnSync('git', ['diff', '-U0', argv.changed, '--', DATA_FILE], { cwd: REPO, encoding: 'utf8' });
      for (const m of (d.stdout ?? '').matchAll(/^\+\s*name: '(.+)',$/gm)) added.add(m[1]);
    }
    const wanted = (pl) => touched.has(pl.file) || added.has(pl.name);
    selected = PLANTS.filter(wanted);
    skipped = PLANTS.filter((pl) => !wanted(pl));
    if (added.size) console.log(`  ${added.size} plant(s) new or edited in ${DATA_FILE} — always run`);
  }
  console.log(`\nchanged since ${argv.changed}: ${[...touched].length} file(s)`);
  if (escalated) {
    console.log(`  WHOLE SWEEP FORCED — ${escalated.join(', ')} can blunt a plant that does not name it`);
  } else {
    console.log(`  running ${selected.length} plant(s) whose target file moved`);
    console.log(`  NOT RUN: ${skipped.length} plant(s) whose target file did not change —`);
    console.log('  this run is NOT evidence about them. Run the whole sweep before a release.');
    for (const pl of selected) console.log(`    · ${pl.name}`);
  }
}

// `--dry` answers "what WOULD this run" without paying for a browser. Useful
// before a release to see whether the selector escalated, and it is the only
// way to inspect the choice without a forty-minute commitment.
if (argv.dry) {
  console.log(`\n--dry: ${selected.length} plant(s) would run, ${PLANTS.length - selected.length} would not.`);
  process.exit(0);
}
/**
 * THE SWEEP RUNS IN A COPY, SO IT NEVER TAKES THE WORKING TREE HOSTAGE.
 *
 * Noah, 2026-08-04: "WHY THE FUCK DO YOU RUN SWEEPS THAT DELAY EVERY FUCKING
 * THING WHEN *I* AM NOT FUCKING DONE WORKING... WHY AM I WAITING ON YOU TO TELL
 * ME IT'S OK TO WORK, WHEN NO ONE TOLD YOU TO DELAY"
 *
 * He is right, and the blocking was self-inflicted. This harness injected
 * faults into the REAL tree, so for forty-five minutes nobody could edit or
 * commit — every session running one told him to wait, and the waiting was
 * never anyone's requirement. It was an implementation detail of the harness
 * that had been promoted into a rule in CLAUDE.md.
 *
 * So the first thing a run does now is copy the tree — tracked, untracked,
 * uncommitted, exactly as it stands — into a scratch directory and re-run
 * itself there. `node_modules` is symlinked rather than copied, because it is
 * the only large thing and nothing plants into it.
 *
 * WHAT THIS DELETES, and it is the point: the "do not edit or commit while it
 * runs" rule, the alarming `git diff` mid-run, and the entire class of accident
 * where a killed run left an injected fault behind in real work. The pid lock
 * and the crash-safe restore stay — they now protect the copy, which costs
 * nothing and means a killed run still cleans up after itself.
 *
 * `--here` forces the old in-place behaviour. It exists for debugging the
 * harness itself and should not be used to verify a release.
 */
if (!process.env.PLANT_ISOLATED && !argv.here && !argv.dry) {
  const scratch = path.join(REPO, '..', `.plant-run-${process.pid}`);
  const SKIP = new Set(['node_modules', '.git', '.plant-backup', '.plant-backup.lock']);
  rmSync(scratch, { recursive: true, force: true });
  cpSync(REPO, scratch, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  // Symlinked, not copied: it is the only large thing here and no plant touches
  // it. A copy would add tens of seconds to every run for nothing.
  try {
    symlinkSync(path.join(REPO, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');
  } catch {
    /* already there, or unsupported — the run will fail loudly on a missing dep */
  }
  process.stdout.write(`plant: running in ${scratch} — your working tree is untouched\n`);
  const child = spawnSync(process.execPath, [path.join(scratch, 'scripts', 'plant.mjs'), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, PLANT_ISOLATED: '1' },
  });
  rmSync(scratch, { recursive: true, force: true });
  process.exit(child.status ?? 1);
}

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
