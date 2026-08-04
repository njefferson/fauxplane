/**
 * invariants.test.mjs — properties that must hold in EVERY state, checked by
 * walking the states rather than by inspecting one function.
 *
 * WHY THIS FILE EXISTS. Noah, 2026-08-04: *"Can you not just build simple tests
 * for some of this shit??"*
 *
 * He was right, and the audit is unflattering. Of the last five defects HE
 * found on his own device, four were reachable by a unit test:
 *
 *   · heading's staleness limit (5 s) was half the poll that filled it (10 s),
 *     so the field could never be anything but FAIL — pure arithmetic;
 *   · the panel said "this device reports no magnetic heading" while the same
 *     report showed the compass reading 278.3° — a pure function;
 *   · the FOLLOW banner claimed to be showing a broadcast that had never
 *     arrived — a pure function;
 *   · a field kept the PREVIOUS aircraft's name after switching — a two-step
 *     state machine.
 *
 * In every one of those a test was written AFTERWARDS, as a regression guard.
 * That is the wrong job: regression guards prove a fixed bug stays fixed, and
 * nothing in the suite was looking for the NEXT one. The plant sweep does not
 * help either — it proves the gates catch faults that are deliberately planted,
 * not that the app is free of faults nobody thought of.
 *
 * So these are INVARIANTS, not examples. Each one is a sentence that must be
 * true of every field in every state, and the test drives the app through the
 * states Noah actually puts it in and checks all of them at each step. A new
 * defect of the same SHAPE gets caught without anyone having predicted it.
 *
 * The fifth defect — the route feed answering 201/text/html/0 bytes — needs the
 * network and is genuinely out of reach here: this sandbox's proxy denies every
 * outbound host (google included, verified 2026-08-04). That one costs a round
 * trip through his device and no test can replace it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELDS } from '../public/src/data/../core/state.js';
import {
  FOLLOW_POLL_MS,
  FOLLOW_WINDOWS,
  createTrafficSource,
  followBannerText,
} from '../public/src/data/traffic.js';

/** Every callsign this file ever follows, so a stray one is recognisable. */
const CALLSIGNS = ['N460DF', 'N81AB', 'UAL328'];

/** A store that records everything written or failed, for inspection. */
function recorder() {
  const fields = new Map();
  return {
    fields,
    write: (path, value, opts = {}) => fields.set(path, { path, value, reason: opts.reason ?? null, windows: opts.windows ?? null, failed: false }),
    fail: (path, reason) => fields.set(path, { path, value: null, reason, windows: null, failed: true }),
    peek: () => null,
  };
}

const aircraft = (callsign) => ({
  hex: 'a599ec',
  callsign,
  registration: callsign,
  type: 'C130',
  lat: 38.44,
  lon: -121.3,
  altBaroFt: 4200,
  altGeomFt: 4325,
  onGround: false,
  groundspeedKt: 213.6,
  trackDeg: 126.8,
  headingDeg: null,
  verticalRateFpm: 896,
  seenPosS: 0.13,
});

function sourceFor(answer) {
  const store = recorder();
  const traffic = createTrafficSource({
    state: store,
    clock: () => 1_000_000,
    fetchImpl: async () => ({ ok: true, json: async () => answer }),
  });
  return { store, traffic };
}

/* ------------------------------------------------------------------ I1 --- */

/**
 * NO FIELD MAY NAME AN AIRCRAFT THE PANEL IS NOT FOLLOWING.
 *
 * The 1.24.0 defect, generalised: it is not about `attitude.heading`, it is
 * about every field, in every transition. A reason naming the wrong aeroplane
 * is a fabricated fact whichever field carries it.
 */
test('invariant: no reason names an aircraft other than the one being followed', async () => {
  const { store, traffic } = sourceFor({ ok: true, source: 'adsb.lol', count: 1, aircraft: [aircraft('N460DF')] });

  for (const cs of ['N460DF', 'N81AB', 'UAL328']) {
    traffic.follow({ callsign: cs });
    traffic.apply();                    // before any report for the NEW callsign
    await traffic.refreshFollowed();
    traffic.apply();                    // and after

    /**
     * THE RULE IS NOT "never mention another callsign" — refining it, because
     * the first run made the distinction obvious.
     *
     * A field REFUSING data and saying why may name the aircraft it refused:
     * "the feed answered about N460DF when asked about N81AB — not showing it"
     * is the honest sentence, and it has to name both to be honest at all.
     *
     * The violation is presenting another aircraft's data AS the followed one,
     * or naming another aircraft in a way that does not admit the panel is
     * following something else. Both forms below; the 1.24.0 defect — heading
     * FAILING with "N460DF is not broadcasting a heading" while following
     * N81AB — is caught by the second, because that sentence never mentions
     * N81AB.
     */
    const strays = [...store.fields.values()].filter((f) => {
      const reason = String(f.reason ?? '');
      const other = CALLSIGNS.find((c) => c !== cs && new RegExp(`\\b${c}\\b`).test(reason));
      if (!other) return false;
      if (!f.failed) return true;                       // a VALUE credited to the wrong aircraft
      return !new RegExp(`\\b${cs}\\b`).test(reason); // or a refusal that hides which one we follow
    });
    assert.deepEqual(
      strays.map((f) => `${f.path}: ${f.reason}`),
      [],
      `while following ${cs}, these fields present or imply a different aircraft`,
    );
  }
});

/* ------------------------------------------------------------------ I2 --- */

/**
 * EVERY FIELD THE FEED OWNS MUST OUTLIVE THE POLL THAT FILLS IT.
 *
 * The 1.22.0 defect, generalised past the one field that happened to show it.
 * Any followed field whose window is shorter than the cadence is structurally
 * incapable of being anything but FAIL, and it would reach a real panel looking
 * exactly like a broken feed.
 */
test('invariant: every followed field outlives its own poll', async () => {
  const { store, traffic } = sourceFor({ ok: true, source: 'adsb.lol', count: 1, aircraft: [aircraft('N460DF')] });
  traffic.follow({ callsign: 'N460DF' });
  await traffic.refreshFollowed();
  traffic.apply();

  const written = [...store.fields.values()].filter((f) => !f.failed);
  assert.ok(written.length, 'the feed wrote nothing — this test is measuring nothing');

  for (const f of written) {
    const w = f.windows ?? { freshMs: FIELDS[f.path]?.freshMs, staleMs: FIELDS[f.path]?.staleMs };
    assert.ok(
      w.staleMs > FOLLOW_POLL_MS,
      `${f.path} dies after ${w.staleMs}ms but is refilled every ${FOLLOW_POLL_MS}ms — it can never be anything but FAIL`,
    );
    assert.ok(w.freshMs > 0 && w.staleMs > w.freshMs, `${f.path} has a nonsensical window`);
  }
});

/* ------------------------------------------------------------------ I3 --- */

/** The registry itself must never carry a window that cannot be satisfied. */
test('invariant: the field registry has no impossible windows', () => {
  for (const [path, spec] of Object.entries(FIELDS)) {
    assert.ok(spec.freshMs > 0, `${path}: freshMs must be positive`);
    assert.ok(spec.staleMs > spec.freshMs, `${path}: FAIL (${spec.staleMs}) must come after STALE (${spec.freshMs})`);
    assert.ok(spec.label, `${path}: every field needs a human label — BITE and the report both print it`);
  }
});

/* ------------------------------------------------------------------ I4 --- */

/**
 * NOTHING MAY CLAIM DATA IT DOES NOT HAVE.
 *
 * The 1.22.1 banner defect, as a property: whatever the panel says about what
 * it is showing has to agree with whether anything actually arrived.
 */
test('invariant: the banner never claims a broadcast before one arrives', async () => {
  const { traffic } = sourceFor({ ok: false, reason: 'rate limited' });
  traffic.follow({ callsign: 'N460DF' });
  await traffic.refreshFollowed();

  const said = followBannerText(traffic.followLabel ?? 'N460DF', {
    followed: traffic.followed,
    followError: traffic.followError,
  });
  if (!traffic.followed) {
    assert.doesNotMatch(said, /is showing that aircraft/, 'nothing arrived, so nothing may be claimed');
  }
});

/* ------------------------------------------------------------------ I5 --- */

/** A failure that does not explain itself is the one thing this app forbids. */
test('invariant: every failed field carries a reason', async () => {
  const { store, traffic } = sourceFor({ ok: false, reason: 'rate limited' });
  traffic.follow({ callsign: 'N460DF' });
  await traffic.refreshFollowed();
  traffic.apply();

  const mute = [...store.fields.values()].filter((f) => f.failed && !String(f.reason ?? '').trim());
  assert.deepEqual(mute.map((f) => f.path), [], 'these fields failed without saying why');
});
