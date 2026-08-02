# ACCESSIBILITY.md — fauxplane

The append-only accessibility register (Doctrine §4). Findings are added, never
deleted; a fixed row keeps its release number so the history stays readable.

The gate is [`scripts/a11y-gate.mjs`](scripts/a11y-gate.mjs) — `npm run a11y`.
It **exits non-zero** on any failure. Colour is measured separately by the hub's
`palette-check.mjs` against [`palettes/fauxplane.json`](palettes/fauxplane.json)
— `npm run palette`.

---

## What the gate covers

Three viewports, both palettes, all three pages — 18 combinations per run.

- **Viewports.** Tablet landscape 1024x768. Phone landscape 740x360. Small phone
  390x640 **at 200% text**, which is the case a sibling app's card could not
  open in at all.
- **Palettes.** `day` and `night`. Panel dimming switches between two measured
  palettes rather than applying a brightness filter — see below.
- **axe-core 4.10.2**, violations only, on every combination.
- **A contrast registry read from REAL PIXELS.** The text colour as computed,
  against a backdrop sampled from a screenshot taken with that text hidden.
  A registered selector that matches nothing **fails the build**; renaming a
  class must not silently remove coverage.
- **Touch targets**, with WCAG 2.2 SC 2.5.8's inline-in-a-sentence exemption
  applied *and every exempted element named in the output*, never silently.
- **Target spacing and effective hit area**, because what tremor does is
  overshoot. Only targets that win their own hit test are compared.
- **Distinct accessible names**, and SC 2.5.3 (a visible word must appear in the
  `aria-label` that names it).
- **The PANEL POWER surface**, against all six of Doctrine §4's requirements for
  an interrupting surface.
- **The acceptance criteria**, as assertions rather than claims.

## Making the gate fail before trusting it

[`scripts/plant.mjs`](scripts/plant.mjs) breaks one specific thing at a time and
asserts the gate goes red **about that thing** — a check that goes red for the
wrong reason has still never been shown to work. Ten planted faults, ten caught.

It earned its keep immediately: the first BITE check asserted only that
*something* on the page read FAIL, and the feed rows satisfy that in this build
whatever BITE does — so the check passed with the sensor merge entirely
disabled. It now asserts what the merge itself contributes.

---

## Declared non-hue channels (Doctrine §4)

Stated before the code that draws them. Meaning must survive a grayscale render.

- **Provenance** — LIVE / DERIVED / STALE / FAIL each carry a distinct **glyph**
  (● ◇ ◐ ✕) and the **word**, plus a border on the row. Colour only reinforces.
  A **FAIL removes the digits entirely** and shows `— — —`, which is the
  strongest non-hue signal available and the visible form of "never freeze a
  gauge at its last value".
- **STALE** additionally prints its **age**, which no other state does.
- **The artificial horizon** carries three independent cues: sky and ground are
  **9.8 apart in grayscale ΔE** (four times the 2.3 JND floor), the pitch ladder
  is **solid above the horizon and dashed below**, and every major rung is
  **labelled with its angle**. Any one of the three carries which-way-is-up alone.
- **A failed instrument** is crossed out — a shape, not a tint.
- **BITE status** — PASS / DEGRADED / FAIL each carry a glyph, the word, and a
  left border.

**Known and accepted:** the palette gate reports that a deutan reader cannot
separate `live` from `fail` by hue (ΔE 4.8 day, 3.6 night). That is fine and it
is why the rule above exists — neither has ever been asked to carry meaning by
colour alone.

## Declared drag and gesture interactions

**There are none.** The app has no drag, no pinch, no swipe, no press-and-hold
and no double-tap. Every control is a button, a number input or a tab, all of
which act on pointer-up. The Kollsman window — the only continuous value a user
sets — has two nudge buttons *and* a real number input, so it has a non-drag
path because it never had a drag.

This is a declaration under Doctrine §4, not an absence of thought: if a future
release adds a gesture, it declares its single-pointer alternative here in the
same commit, and the gate is extended to assert it.

## Panel dimming is two measured palettes, not a filter

A `brightness()` filter over the panel is the obvious way to dim a cockpit
display and it silently destroys every contrast pair. The WCAG formula's `+0.05`
term means scaling foreground and background together **reduces** the ratio:
measured on this palette, `brightness(0.45)` takes primary text from **14.5:1 to
about 3.7:1** — a fail state produced by the one control whose entire purpose is
legibility.

So dimming switches between `fauxplane-day` and `fauxplane-night`, both of which
clear every hard floor, and the gate runs the whole sweep in each.

## Measured floors, this release

- `fauxplane-day` — worst text **4.88:1**, worst rail **4.68:1**, peak contrast
  14.5 (under the 15 halation cap), fill separation 1.53, chrome chroma 0.0000.
- `fauxplane-night` — worst text **5.20:1**, worst rail **5.74:1**, peak contrast
  11.5, chrome chroma 0.0000.

**Known soft spot, above the fail line and recorded so nobody rediscovers it:**
`fauxplane-night` page-to-surface fill separation is **1.27**, below the 1.5
aspiration. Near-black has no headroom — the `+0.05` term dominates down there,
so darkening the page buys almost nothing. The rail carries the boundary instead
at 5.74:1, far above its 3.4 floor.

---

## Register

### 0.1.0 — first UI release, 2026-08-02

Everything below was found by the gate during this release and fixed before it
shipped. They are recorded because a register that only lists post-release
findings implies the pre-release ones did not happen.

- **A-0001 · FIXED 0.1.0** — The footer's Accessibility link was 148x28, under
  the 44px floor. A CSS comment claimed SC 2.5.8's inline exemption covered it;
  it does not, because the link is a **flex item**, not a target inline in a
  sentence. The rule was checked against the case before the data was edited to
  please it. Given a real 44px target.
- **A-0002 · FIXED 0.1.0** — No level-one heading in the document. The only `h1`
  was inside the PANEL POWER dialog, which is gone after dismissal. Added a
  visually-hidden `h1` inside the banner landmark, and stepped the dialog's
  title down to `h2`.
- **A-0003 · FIXED 0.1.0** — The `h1` initially sat outside every landmark, so
  landmark navigation could not reach it. Moved inside `<header>`.
- **A-0004 · FIXED 0.1.0** — The PFD readouts region scrolls but was not
  focusable, so it could not be scrolled from a keyboard. Given `tabindex="0"`,
  `role="group"` and a name.
- **A-0005 · FIXED 0.1.0** — **PANEL POWER was a non-modal `<dialog open>`**, so
  everything behind it stayed focusable and a keyboard user could Tab straight
  into the panel the gate is meant to be covering. The markup keeps `open` so
  the surface appears even if the module never runs; `app.js` now upgrades it to
  `showModal()` **after** both dismiss handlers are attached (Doctrine §14 — the
  way out is wired first).
- **A-0006 · NOT A DEFECT, gate corrected** — SC 2.5.3 was reported against the
  Kollsman `+` and `−` buttons. The criterion excludes a control labelled only
  by a symbol, which Doctrine §4 names explicitly; the check now tests for
  visible *words* before applying it. Recorded because editing the buttons to
  satisfy a rule that did not govern them was the available wrong answer.
- **A-0007 · NOT A DEFECT, gate corrected** — Container/child and
  behind-a-modal pairs were reported as overlapping targets. The check now
  compares only elements that win their own hit test, which is
  PALETTES §7's "measure the effective hit area, not the box".

### Not machine-checkable — declared and hand-checked

Doctrine §4 says saying so is the point, because a gate that always passes reads
as coverage it has not earned.

- **Status messages reach assistive tech without stealing focus (SC 4.1.3).**
  The announcer is a polite live region that fires on provenance **transitions
  only**, never on a value every frame — a live region updated at 25 Hz is a
  denial-of-service on a screen reader dressed as compliance. Verified by
  reading the code and the transition log; **not** verified with a real screen
  reader. **Needs Noah's device: VoiceOver.**
- **The canvas text alternative** is rewritten about once a second from the
  current readings and asserted by the gate to be present, substantial, and to
  report unavailable values. Whether it *reads well* aloud has not been checked
  with VoiceOver.
- **Reduced motion** is honoured trivially: nothing in this app animates. Any
  future transition must be wrapped in the existing `prefers-reduced-motion`
  query.
