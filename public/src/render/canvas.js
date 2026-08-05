/**
 * canvas.js — the drawing surface, and the drawing primitives every gauge
 * shares.
 *
 * NO FIXED SIZES (Doctrine §4). The surface measures the box it is actually in,
 * at the moment it draws, and re-measures whenever that box changes. A size
 * captured once at startup is the bug that stops a panel opening at 200% text —
 * and a reader who enlarges their text is, in layout terms, on a much smaller
 * screen.
 *
 * COLOUR COMES FROM THE STYLESHEET, never from literals in here. The tokens are
 * declared once in styles.css and measured by the palette gate; a gauge that
 * hardcodes `#ff0000` is a colour the gate has never seen.
 */

/** The tokens every gauge may use. Read from CSS custom properties so there is
 *  exactly ONE declaration of each colour in the app. */
const TOKEN_NAMES = [
  'page',
  'surface',
  'surface-2',
  'surface-3',
  'rail',
  'hairline',
  'text',
  'text-2',
  'text-3',
  'live',
  'derived',
  'stale',
  'fail',
  'primary',
  'sky',
  'ground',
  'symbol',
  'symbol-outline',
];

export function createSurface(canvas, { onResize = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let tokens = null;

  const measure = () => {
    // The BOX, not the window. getBoundingClientRect reflects flex/grid sizing,
    // text-size zoom and the safe-area insets all at once.
    const rect = canvas.getBoundingClientRect();
    const nextDpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height && nextDpr === dpr) return false;
    width = w;
    height = h;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    onResize({ width, height });
    return true;
  };

  /**
   * NEVER CACHE A READ TAKEN WHILE THE CANVAS WAS NOT RENDERED.
   *
   * `getComputedStyle` on an element inside a `[hidden]` subtree returns an
   * EMPTY STRING for every custom property, so every token fell back to the
   * missing-token magenta — and the result was cached for the life of the page.
   * Every panel except the one visible at boot is built hidden, so the radar
   * page had been a solid magenta rectangle since it was added, and the sentinel
   * that exists to be noticed was never looked at by anything.
   *
   * An incomplete read is therefore not stored. The next access retries, which
   * costs eighteen property reads on one element until the page is shown and
   * nothing at all afterwards. A token genuinely absent from the stylesheet
   * still goes magenta, loudly, which is the point of it.
   */
  const readTokens = () => {
    const style = getComputedStyle(canvas);
    const out = {};
    let complete = true;
    for (const name of TOKEN_NAMES) {
      const value = style.getPropertyValue(`--${name}`).trim();
      if (!value) complete = false;
      out[name] = value || '#ff00ff';
    }
    tokens = complete ? out : null;
    return out;
  };

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => measure());
    ro.observe(canvas);
  } else {
    window.addEventListener('resize', measure);
  }

  measure();
  readTokens();

  return {
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get tokens() {
      return tokens ?? readTokens();
    },
    measure,
    /** Re-read the palette. Called when the dim level changes, because the dim
     *  levels are different measured palettes, not a brightness filter. */
    refreshTokens: readTokens,
    begin() {
      measure();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
    },
  };
}

// --- primitives --------------------------------------------------------------

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function text(ctx, str, x, y, { size = 14, weight = 500, align = 'center', baseline = 'middle', colour }) {
  ctx.save();
  // System stack: no webfont to load, so the panel renders identically offline
  // and on the first frame. An instrument that reflows when a font arrives is
  // an instrument that was unreadable for the first second.
  ctx.font = `${weight} ${size}px ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/**
 * Break a string across up to `maxLines` lines that each fit `maxWidth`.
 *
 * ELLIPSISING A SENTENCE THAT HAD ROOM TO WRAP IS NOT A TRUNCATION, IT LOOKS
 * LIKE A CRASH. The horizon caption read "gravity reference only — gyro
 * settling (…" on the owner's iPad: cut inside a parenthesis, so the one number the
 * sentence existed to deliver was the part thrown away, and the panel looked
 * broken while working correctly.
 *
 * Only the LAST line is ellipsised, and only if the text genuinely does not fit
 * in the lines allowed. A word longer than the width is left over-long rather
 * than chopped, because a broken word is harder to read than a wide one.
 */
export function wrapText(ctx, str, maxWidth, { size = 12, weight = 500, maxLines = 2 } = {}) {
  if (!str) return [];
  ctx.save();
  ctx.font = `${weight} ${size}px ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace`;
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  ctx.restore();
  // Anything that did not fit is signalled on the last line, where an ellipsis
  // reads as "there is more" rather than as a severed word.
  const used = lines.join(' ');
  if (used.length < String(str).replace(/\s+/g, ' ').trim().length && lines.length) {
    lines[lines.length - 1] = ellipsise(ctx, `${lines[lines.length - 1]} …`, maxWidth, { size, weight });
  }
  return lines;
}

/**
 * Trim a string to fit a width, ending in an ellipsis.
 *
 * Clipping instead — which is what a canvas clip path does — cuts mid-word and
 * gives no sign anything was removed: a reason reading "pitch is not broad"
 * looks like a typo rather than a truncation. The ellipsis says "there is more,
 * and BITE has it", which is the split this app already uses for long reasons.
 */
export function ellipsise(ctx, str, maxWidth, { size = 12, weight = 500 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace`;
  const full = ctx.measureText(str).width;
  if (full <= maxWidth) {
    ctx.restore();
    return str;
  }
  // Binary search rather than a per-character loop: this runs inside the draw
  // path at 25 Hz, and a reason can be a whole sentence.
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${str.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  ctx.restore();
  return lo > 0 ? `${str.slice(0, lo).trimEnd()}…` : '';
}

/**
 * The failure flag every instrument shows when its field is FAIL.
 *
 * A RED CROSS OVER THE INSTRUMENT, not a blank and not a frozen needle. The
 * cross is the non-hue channel: it is a shape, so it survives a grayscale
 * render and it survives being red-green colour blind, both of which a red
 * tint alone would not.
 */
export function failFlag(ctx, { x, y, w, h, tokens, label = 'FAIL', reason = null, size = 13 }) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = tokens.page;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = tokens.fail;
  // A cross over a dead instrument is the convention and it should be
  // unmistakable — but scaled off the SHORT side it swamped the narrow tapes.
  // Weight follows the long side, capped, so a 50px tape and a 500px horizon
  // both read as crossed out rather than as painted over.
  ctx.lineWidth = Math.max(2, Math.min(6, Math.max(w, h) * 0.012));
  const inset = Math.min(w, h) * 0.16;
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(x + w - inset, y + h - inset);
  ctx.moveTo(x + w - inset, y + inset);
  ctx.lineTo(x + inset, y + h - inset);
  ctx.stroke();

  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  text(ctx, label, x + w / 2, y + h / 2 - size * 0.9, { size, weight: 700, colour: tokens.fail });
  if (reason) {
    // One line, TRIMMED rather than clipped. A reason long enough to wrap
    // belongs on BITE, which is where the full sentence lives; the flag says
    // enough to act on and the ellipsis says there is more.
    const rSize = size * 0.8;
    text(ctx, ellipsise(ctx, reason, w - 10, { size: rSize }), x + w / 2, y + h / 2 + size * 0.9, {
      size: rSize,
      weight: 500,
      colour: tokens.fail,
    });
  }
  ctx.restore();
}

/**
 * The STALE band. A field past its freshness window keeps its last value AND
 * shows its age — never a frozen needle with nothing said about it.
 *
 * The non-hue channels are the diagonal hatching and the printed age, so this
 * is distinguishable from a live instrument in grayscale and by touch of the
 * eye alone, not only by the amber.
 */
export function staleBand(ctx, { x, y, w, h, tokens, ageText }) {
  ctx.save();
  ctx.strokeStyle = tokens.stale;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  const step = 8;
  for (let i = -h; i < w; i += step) {
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = tokens.stale;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  if (ageText) {
    text(ctx, `STALE ${ageText}`, x + w / 2, y + h / 2, { size: 12, weight: 700, colour: tokens.stale });
  }
  ctx.restore();
}
