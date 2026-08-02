#!/usr/bin/env node
/**
 * render-icons.mjs — render the PNG icons from public/icons/icon.svg.
 *
 * The SVG is the source. Rendering rather than hand-drawing each size is what
 * stops the 192 and the 512 drifting apart, and the maskable variant is the
 * same artwork inside the safe zone rather than a second drawing.
 *
 *   npm run icons
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.resolve(HERE, '..', 'public', 'icons');
const EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** Maskable icons are cropped to a circle of 80% of the canvas by some
 *  launchers, so the artwork is inset to survive it. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0 },
];

const svg = await readFile(path.join(ICONS, 'icon.svg'), 'utf8');
const browser = await chromium.launch({ executablePath: EXECUTABLE });

try {
  for (const { file, size, inset } of TARGETS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const pad = Math.round(size * inset);
    await page.setContent(
      `<!doctype html><meta charset="utf-8">` +
        `<style>html,body{margin:0;width:${size}px;height:${size}px;background:#1a1a1a}` +
        `div{position:absolute;inset:${pad}px}svg{width:100%;height:100%;display:block}</style>` +
        `<div>${svg}</div>`,
      { waitUntil: 'load' },
    );
    const buffer = await page.screenshot({ omitBackground: false });
    await writeFile(path.join(ICONS, file), buffer);
    await page.close();
    process.stdout.write(`wrote icons/${file} (${size}px${inset ? `, ${Math.round(inset * 100)}% inset` : ''})\n`);
  }
} finally {
  await browser.close();
}
