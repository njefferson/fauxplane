/**
 * reasons.test.mjs — every reason a gauge can show FITS on the gauge.
 *
 * The owner, 2026-08-05, photographing the ADI while following an aircraft: "The red
 * text is cutoff on the PFD when following an aircraft." It read
 * `ADS-B carries no attitude — pitch is n…`, severed mid-word.
 *
 * A REASON IS THE ONE STRING ON A GAUGE THAT MUST NOT BE ABBREVIATED. The whole
 * argument for crossing an instrument out rather than blanking it is that the
 * panel says WHY; half a why looks like a fault in the panel rather than an
 * honest answer about the data.
 *
 * THE INTERESTING PART IS WHERE THE BUG WAS. The identical defect had already
 * been found and fixed twenty lines away, in the branch that runs when attitude
 * is lost ENTIRELY — and the branch that runs when only PITCH is missing kept
 * calling `ellipsise`. One is reachable by denying permissions; the other only
 * by following a real aircraft, which no sandbox can do. So the fix went to the
 * case that was on screen and never to the case beside it.
 *
 * This test is over the DATA rather than the drawing: every reason string the
 * FOLLOW path can put on the ADI, wrapped at the width the ADI actually gives
 * it, must fit in the lines it actually allows. A canvas cannot be measured
 * here, so `measureText` is a monospace stand-in — deliberately WIDER than a
 * real proportional glyph, so a string that passes here cannot fail there.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { wrapText } from '../public/src/render/canvas.js';
import { FOLLOW_FAILS } from '../public/src/data/traffic.js';

/** A canvas stand-in: every glyph 0.62em wide, which is wider than the real font. */
const ctx = {
  save() {},
  restore() {},
  set font(_v) {},
  measureText(t) {
    const m = /(\d+(?:\.\d+)?)px/.exec(this._f ?? '') ?? [null, '12'];
    return { width: t.length * Number(m[1]) * 0.62 };
  },
};
Object.defineProperty(ctx, 'font', { set(v) { this._f = v; }, get() { return this._f; } });

/**
 * The ADI's own numbers, from adi.js: the reason is drawn at `size * 0.78` into
 * `w - 16`, over 2 lines. `size` is `max(11, r * 0.1)` and `r` is half the
 * smaller side — so the tightest real case is the smallest gauge the layout
 * permits. A landscape phone gives the ADI about 300px across.
 */
const GAUGE_W = 300;
const SIZE = 11;

test('every FOLLOW reason fits the ADI without being cut off', () => {
  const cut = [];
  for (const [field, reason] of Object.entries(FOLLOW_FAILS)) {
    const lines = wrapText(ctx, reason, GAUGE_W - 16, { size: SIZE * 0.78, maxLines: 2 });
    // `wrapText` marks a truncation with a trailing ellipsis. Anything carrying
    // one did not fit, which is the defect this file exists for.
    if (lines.some((l) => l.endsWith('…'))) cut.push(`${field}: "${lines.join(' ')}"`);
  }
  assert.deepEqual(cut, [], `reasons cut off on the ADI:\n  ${cut.join('\n  ')}`);
});

test('the pitch reason is the one that was photographed, and it wraps rather than truncating', () => {
  const reason = FOLLOW_FAILS['attitude.pitch'];
  assert.match(reason, /ADS-B carries no attitude/, 'the reason under test is the one on the gauge');
  const lines = wrapText(ctx, reason, GAUGE_W - 16, { size: SIZE * 0.78, maxLines: 2 });
  assert.ok(lines.length > 1, 'it must use both lines rather than being squeezed onto one');
  assert.ok(!lines.some((l) => l.endsWith('…')), `still truncated: ${lines.join(' | ')}`);
});

test('a reason genuinely too long still SAYS it was cut, rather than stopping', () => {
  // The honesty half: wrapping must not become silent truncation.
  const long = 'word '.repeat(200).trim();
  const lines = wrapText(ctx, long, GAUGE_W - 16, { size: SIZE * 0.78, maxLines: 2 });
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'), 'an over-long reason must end in an ellipsis, not just stop');
});
