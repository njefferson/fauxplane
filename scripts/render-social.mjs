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
const card = pathToFileURL(path.join(HERE, 'social-card.html')).href;

for (const [w, h, out] of [
  [1280, 640, path.join(HERE, '..', 'docs', 'social-preview.jpg')],
  [1200, 630, path.join(HERE, '..', 'public', 'og-image.jpg')],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(card, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log('wrote', out);
}
await browser.close();
