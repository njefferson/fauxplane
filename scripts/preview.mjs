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
  {
    name: 'gravity-only',
    story: 'the horizon on the gravity reference alone — the state that used to be a red X',
    writes: [
      ['attitude.pitch', 2.5],
      ['attitude.roll', -8],
      ['attitude.heading', 91],
      ['attitude.turnRate', 0],
      ['motion.gLoad', 1.0],
      ['motion.lateralG', 0],
      ['position.altitudeGeometric', 1533],
    ],
    // The caveat rides on the FIELD, so it reaches the horizon as a caption
    // rather than living only in a log. This is the case the owner photographed.
    reasons: {
      'attitude.pitch': 'gravity reference only — gyro settling (3.2°)',
      'attitude.roll': 'gravity reference only — gyro settling (3.2°)',
    },
  },
  {
    name: 'levelled-in-a-cradle',
    story: 'levelled to a car cradle — the horizon reads zero at a mount that is 18 deg nose-up',
    writes: [
      ['attitude.pitch', 0.4],
      ['attitude.roll', -1.2],
      ['attitude.heading', 274],
      ['attitude.turnRate', 0.1],
      ['motion.gLoad', 1.01],
      ['motion.lateralG', 0.01],
      ['position.groundspeed', 38],
      ['position.track', 271],
      ['position.altitudeGeometric', 512],
      ['altitude.msl', 617],
      ['vsi.rate', -20],
    ],
    mount: { pitchDeg: 18.4, rollDeg: -3.1 },
  },
  {
    name: 'following',
    story: 'following a real flight: the tapes alive from ADS-B, and pitch honestly crossed out',
    writes: [
      ['attitude.roll', 21.4],
      ['attitude.turnRate', 2.6],
      ['motion.gLoad', 1.07],
      ['position.groundspeed', 452],
      ['position.track', 118],
      ['position.altitudeGeometric', 34350],
      ['altitude.msl', 34455],
      ['vsi.rate', -1216],
      ['position.lat', 38.9],
      ['position.lon', -121.15],
    ],
    // Everything ADS-B does not carry. The point of this scene is that the
    // panel is MOSTLY ALIVE while still crossing out the things it has no
    // source for — pitch above all, and the heading tape falling back to TRK.
    fails: {
      'attitude.pitch': 'ADS-B carries no attitude — pitch is not broadcast',
      'attitude.heading': 'UAL328 is not broadcasting a heading — the tape is showing its ground TRACK instead',
      'motion.lateralG': 'ADS-B carries no slip information',
      'speed.tas': 'true airspeed needs winds aloft where the AIRCRAFT is',
      'speed.cas': 'calibrated airspeed needs a pressure altitude from the aircraft position',
      'altitude.indicated': 'the Kollsman setting is from a station near this device',
      'aoa.angle': 'angle of attack needs pitch, and ADS-B does not broadcast it',
    },
    follow: 'UAL328',
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
    // No gate to dismiss: the panel is the first surface (PWR is a switch on it).
    await page.waitForTimeout(200);

    // THE LAYOUT IS SETTLED FIRST, BEFORE ANY STATE IS WRITTEN.
    //
    // Un-hiding the follow banner reflows the page; the ResizeObserver then
    // re-measures the canvas, and re-measuring sets canvas.width, which CLEARS
    // it. Doing this after the writes photographed a blank instrument.
    //
    // And it cannot be fixed by publishing a second time: every publish runs the
    // app's OWN derived subscriber, which recomputes the attitude and altitude
    // chains from live sensors that do not exist here and overwrites the scene.
    // One publish, after the boxes have stopped moving.
    if (scene.follow) {
      await page.evaluate((label) => {
        const banner = document.getElementById('follow-banner');
        banner.hidden = false;
        document.getElementById('follow-what').textContent =
          `${label} — this panel is showing that aircraft's broadcast, not this device`;
      }, scene.follow);
      await page.waitForTimeout(120);
    }

    if (scene.mount) {
      await page.evaluate(async ({ pitchDeg, rollDeg }) => {
        const { upVectorScreenFrame } = await import('/src/core/fusion.js');
        // Drive the REAL calibration entry point, not a painted-on tag: the
        // scene has to exercise the same path the button does.
        globalThis.__previewFusion?.setMount(upVectorScreenFrame(pitchDeg, rollDeg), 0);
      }, scene.mount);
      await page.waitForTimeout(80);
    }

    await page.evaluate(async ({ writes, stale, reasons, fails }) => {
      const { state } = await import('/src/core/state.js');
      // The app's own derived subscriber runs every publish and would overwrite
      // the attitude fields from the (unconverged) filter. Stopping the loop
      // first is what lets a scene hold still long enough to be photographed.
      state.stop();
      for (const [pathName, value] of writes) state.write(pathName, value, { reason: reasons?.[pathName] ?? null });
      for (const pathName of stale ?? []) state.markStale(pathName, 'network lost — held from the last fetch');
      // A FAIL with its reason is half of what these scenes are for: the panel
      // saying what it does NOT have is as much a rendering path as the tapes.
      for (const [pathName, why] of Object.entries(fails ?? {})) state.fail(pathName, why);
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
