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

  const readTokens = () => {
    const style = getComputedStyle(canvas);
    const out = {};
    for (const name of TOKEN_NAMES) {
      out[name] = style.getPropertyValue(`--${name}`).trim() || '#ff00ff';
    }
    tokens = out;
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
    // One line, clipped. A reason long enough to wrap belongs on BITE, which is
    // where the full sentence lives; the flag says enough to act on.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, y, w - 8, h);
    ctx.clip();
    text(ctx, reason, x + w / 2, y + h / 2 + size * 0.9, { size: size * 0.8, weight: 500, colour: tokens.fail });
    ctx.restore();
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
