// Render scripts/social-card.html to the two share images:
//   docs/social-preview.jpg  1280x640 @2x — GitHub Settings -> Social preview
//   public/og-image.jpg      1200x630 @2x — og:image on the deployed site
// Same card, the hub family's layout. Regenerate after editing the card.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

// Both cards, every size. The tiles also DEPLOY (public/) so Noah can save
// them straight off the site — downloading a file out of the GitHub UI on an
// iPad turned out to be the hard part of the whole feature.
for (const [card, w, h, out] of [
  ['social-card.html', 1280, 640, path.join(HERE, '..', 'docs', 'social-preview.jpg')],
  ['social-card.html', 1280, 640, path.join(HERE, '..', 'public', 'social-preview.jpg')],
  ['social-card-icon.html', 1200, 630, path.join(HERE, '..', 'public', 'og-image.jpg')],
  ['social-card-icon.html', 1280, 640, path.join(HERE, '..', 'public', 'social-preview-icon.jpg')],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.join(HERE, card)).href, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log('wrote', out);
}
await browser.close();
