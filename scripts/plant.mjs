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
 * FILES ARE BACKED UP IN MEMORY AND RESTORED IN A `finally`. Never reach for
 * `git checkout` to undo a plant — a sibling session did that on a file whose
 * real work was still uncommitted and destroyed it.
 *
 *   node scripts/plant.mjs            # every plant
 *   node scripts/plant.mjs --only 3   # one, by index
 */

import { readFile, writeFile } from 'node:fs/promises';
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
    find: '.stamp {\n  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;\n  font-size: 0.8125rem;\n  color: var(--text-3);',
    replace: '.stamp {\n  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;\n  font-size: 0.8125rem;\n  color: #3f3f3f;',
    expect: /build stamp measured \d+\.\d+:1 against the real backdrop/,
  },
  {
    name: 'contrast: the build stamp is dimmed with opacity instead of a token',
    check: 'opacity is invisible to a contrast gate',
    file: 'public/styles.css',
    find: '  color: var(--text-3);\n  padding: 0.25rem 0.4rem;\n  user-select: text;',
    replace: '  color: var(--text-3);\n  opacity: 0.35;\n  padding: 0.25rem 0.4rem;\n  user-select: text;',
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

const runGate = () =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, 'a11y-gate.mjs'), '--quick'], { cwd: REPO });
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

// Baseline first: if the tree is already red, every plant "passes" for the
// wrong reason and this whole script proves nothing.
process.stdout.write('baseline (nothing planted) ... ');
const baseline = await runGate();
if (baseline.code !== 0) {
  process.stderr.write(`\nthe gate is already failing before anything was planted:\n${baseline.out}\n`);
  process.exit(1);
}
process.stdout.write('green\n\n');

for (const plant of selected) {
  const target = file(plant.file);
  const original = await readFile(target, 'utf8');

  if (!original.includes(plant.find)) {
    results.push({ plant, ok: false, why: 'the plant no longer matches the file — this script has gone stale' });
    process.stdout.write(`STALE  ${plant.name}\n`);
    continue;
  }

  try {
    await writeFile(target, original.replace(plant.find, plant.replace));
    const { code, out } = await runGate();
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
  }
}

const broken = results.filter((r) => !r.ok);
process.stdout.write(`\n${results.length - broken.length}/${results.length} planted faults were caught by the gate\n`);
if (broken.length) {
  for (const b of broken) process.stderr.write(`  UNPROVEN  ${b.plant.check}: ${b.why}\n`);
  process.exit(1);
}
