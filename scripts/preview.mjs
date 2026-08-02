#!/usr/bin/env node
/**
 * preview.mjs — render the panel in states a sandbox cannot otherwise reach.
 *
 * WHY THIS IS NOT A SYNTHETIC DATA PATH. Nothing here ships. This script lives
 * in scripts/, is never imported by the app, and drives the store from OUTSIDE
 * through the same public `write` the sensors use — it is a test bench holding
 * wires to the connector, not a signal generator soldered inside the box. The
 * deployed bundle has no code that can produce a value from neither a sensor
 * nor a feed, and this file does not change that.
 *
 * WHY IT IS WORTH HAVING. A headless browser has no accelerometer, no compass
 * and no GPS, so every automated look at this app sees the same all-FAILED
 * screen. That is the state acceptance criterion 1 is about, and it is also the
 * one state where a broken horizon, a mis-signed roll or a tape drawn upside
 * down would be completely invisible. A gate that only ever sees one state has
 * only ever checked one state.
 *
 *   node scripts/preview.mjs                 # writes scratch previews
 *   node scripts/preview.mjs --out ./shots
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createStaticServer } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * The scenes. Each is a set of state writes and the story it is telling — and
 * each exists because it makes a DIFFERENT rendering path visible.
 */
const SCENES = [
  {
    name: 'cruise',
    story: 'climbing right turn, everything live',
    writes: [
      ['attitude.pitch', 6.5],
      ['attitude.roll', 18],
      ['attitude.heading', 247],
      ['attitude.turnRate', 2.4],
      ['motion.gLoad', 1.12],
      ['motion.lateralG', 0.02],
      ['position.groundspeed', 118],
      ['position.track', 251],
      ['position.altitudeGeometric', 4820],
      ['vsi.rate', 640],
      ['speed.tas', 131],
      ['speed.cas', 121],
      ['aoa.angle', 3.1],
      ['position.lat', 38.68],
      ['position.lon', -121.0],
    ],
  },
  {
    name: 'left-bank-descent',
    story: 'descending left turn — the mirror of the above, so a sign error shows',
    writes: [
      ['attitude.pitch', -4],
      ['attitude.roll', -25],
      ['attitude.heading', 62],
      ['attitude.turnRate', -3],
      ['motion.gLoad', 1.05],
      ['motion.lateralG', -0.06],
      ['position.groundspeed', 96],
      ['position.track', 58],
      ['position.altitudeGeometric', 2310],
      ['vsi.rate', -520],
    ],
  },
  {
    name: 'airliner-climb',
    story: 'a real airliner initial climb — the case the old 2000 fpm VSI pegged on',
    writes: [
      ['attitude.pitch', 14],
      ['attitude.roll', -3],
      ['attitude.heading', 305],
      ['attitude.turnRate', -0.4],
      ['motion.gLoad', 1.08],
      ['motion.lateralG', 0.01],
      ['position.groundspeed', 287],
      ['position.track', 303],
      ['position.altitudeGeometric', 12400],
      ['altitude.msl', 12290],
      ['vsi.rate', 3800],
      ['position.lat', 38.68],
      ['position.lon', -121.0],
    ],
  },
  {
    name: 'mixed-provenance',
    story: 'sensors live, feeds gone stale — the state a lost connection actually produces',
    writes: [
      ['attitude.pitch', 1.2],
      ['attitude.roll', -2],
      ['attitude.heading', 180],
      ['attitude.turnRate', 0.2],
      ['motion.gLoad', 1.0],
      ['motion.lateralG', 0],
      ['position.groundspeed', 74],
      ['position.altitudeGeometric', 1180],
      ['vsi.rate', -40],
    ],
    stale: ['position.groundspeed', 'position.altitudeGeometric'],
  },
];

const { values: argv } = parseArgs({ options: { out: { type: 'string' } } });
const OUT = path.resolve(argv.out ?? path.join(HERE, '..', '.preview'));
await mkdir(OUT, { recursive: true });

const server = await createStaticServer();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: EXECUTABLE });

try {
  for (const scene of SCENES) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 720 }, permissions: [] });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('[data-dismiss-gate]').click());
    await page.waitForTimeout(200);

    await page.evaluate(async ({ writes, stale }) => {
      const { state } = await import('/src/core/state.js');
      // The app's own derived subscriber runs every publish and would overwrite
      // the attitude fields from the (unconverged) filter. Stopping the loop
      // first is what lets a scene hold still long enough to be photographed.
      state.stop();
      for (const [pathName, value] of writes) state.write(pathName, value);
      for (const pathName of stale ?? []) state.markStale(pathName, 'network lost — held from the last fetch');
      state.publishNow();
    }, scene);

    await page.waitForTimeout(150);
    const file = path.join(OUT, `${scene.name}.png`);
    await page.screenshot({ path: file });
    process.stdout.write(`${scene.name}: ${scene.story}\n  ${file}\n`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
