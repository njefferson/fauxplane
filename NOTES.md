# NOTES.md — fauxplane

The source of truth for this repo. Read it first, every session (Doctrine §12).

## Thesis
A glass-cockpit PWA for a phone or tablet clamped where a panel would be. The
instruments are driven by the device's own sensors and by fetched aviation
feeds. It is not a simulator and it is not certified for anything.

---

## UNBLOCKED — the base spec arrived, 2026-08-02

The previous session recorded this repo as BLOCKED: an amendments document had
arrived without the base spec it amended, and building the panels from the
amendment alone meant inventing the spec and presenting the invention as Noah's.

**Noah supplied the full Jet Panel PWA spec on 2026-08-02.** Every item that
block listed is now answered — the acceptance criteria, the attitude stability
test, the PFD/ATIS/BITE page definitions, the sensor mapping, the four
derivations, and the feed contracts. v1 is built.

---

## Who this is for (Noah, 2026-08-02) — read before any design decision

**A friend of Noah's who is 3-D printing his own 747 cockpit at home, for
simulation. He is NOT a pilot. He loves planes and jets.**

**Design questions resolve toward giving him the most JOY.** That is the tie-
breaker, and it outranks a session's instinct toward instrument realism,
completeness, or engineering neatness. Where two options are both honest and
both correct, pick the one that is more of a delight to sit in front of.

What that changes in practice:
- Language is for an enthusiast, not for a certificated pilot. BITE already
  explains itself in sentences; keep it that way and do not let it drift toward
  avionics shorthand.
- The panel is CLAMPED AND STATIONARY, indoors, on a desk. That is a very
  different device from one in a moving aircraft, and it is the case to design
  against. See the note below on what is alive in that setup.
- It is not safety equipment for him and never will be — but the honesty rule
  stays, because a panel that invents numbers is a worse toy, not a better one.
  A crossed-out instrument that explains itself is more interesting than a fake
  needle, and it is the difference between a real instrument and a picture of one.

### What is actually ALIVE on a stationary desk cockpit

Measured against the v1 build, this is what his friend will see with the tablet
clamped indoors and not moving. It matters because half the panel is the two
big tapes either side of the horizon.

Alive: the artificial horizon, the heading tape (real compass), the G-meter
(reads 1.00 g, correctly), the slip/skid ball, the turn needle, and the WHOLE
ATIS page — real weather from the nearest station that reports an altimeter
setting, with its distance. Magnetic declination now works too.

Crossed out, and correctly so: groundspeed and track (GPS reports no speed and
no track at rest, by design), the altitude tape and MSL (a GPS fix indoors is
poor or absent), vertical speed, TAS, CAS, and angle of attack (forced to FAIL
below 20 kt, as specified).

**So the centre of the panel and the whole ATIS page are alive, and the two
flanking tapes plus the VSI are red.** That is honest and it is exactly what
the spec asks for — and it is also the single biggest question for whether this
is a joy to sit in front of. It needs Noah's call, not a session's; see the open
items.

---

## 1.7.4 — the icon-art card is canonical

**The intermittent gate-contrast flake struck a second time**, during this
release's first a11y run: `first-run page description measured 1.46:1` and
`gate small print measured 1.21:1` — on a commit that touched only `<head>`
meta tags, and green on the immediate re-run. First strike was 0.4.5's
`PANEL POWER button measured 3.52:1`. Both are POWER-GATE-surface rows, and
ratios that low mean the text was measured against nearly its own colour —
consistent with the backdrop screenshot (taken with the text hidden) racing
the dialog's paint. Two data points now, both on the gate dialog, none on a
panel page. The check to suspect is the gate-surface screenshot timing, and
this line exists so the next session starts there instead of at zero.

Noah picked the icon-art card. og:image now renders from it (with width,
height and alt for parity with the hub), and METADATA.md names it as the
chosen tile. The concept-render card stays in the repo as the alternate.

---

## 1.7.3 — tiles served from the site, and an icon-art variant

Noah could not download the tile from GitHub on his iPad, which makes the
deployed site the right distribution channel for its own artwork: both card
designs now ship at `/social-preview.jpg` (concept render) and
`/social-preview-icon.jpg` (drawn purely from the app icon — nothing
borrowed). Long-press, save, upload. Repo metadata values now live in the
hub's `METADATA.md`, per Noah: one file, every app, §10 status tracked.

---

## The roadmap, judged — 2026-08-03

Thirty ideas from a five-lens generation pass (the friend, the sensors, the
feeds, the real 747 deck, the long-lived app), judged against honesty first,
then joy, then feasibility. The full ranking lives in the session; what matters
here is the order and the rulings Noah owes.

### Build next, in order

1. **HEAVY INBOUND** — a watch list: when a 747 (or any chosen type / any
   "heavy") enters radar range, the ND flags it with a callout strip — "HEAVY:
   B748, UPS94, FL340, 22 nm NE" — one tap to follow. Entirely from fields the
   existing poll already carries; a missing type code cannot match, never
   guessed. Peak joy for this specific friend.
2. **Patch notes behind the version stamp** — the owed §7d surface. Small,
   offline, generated from one source, says what is still broken.
3. **MCP readout in FOLLOW** — the selected altitude/heading/speed the real
   crew has dialled in, from nav_* fields already in the follow response;
   absent broadcast renders FAIL with its reason. Jumpseat joy for a man
   printing an MCP.

### Strong, roughly in order

Captain's 747-400 chronometer (CHR/ET/UTC — zero feed, fully offline) · TAF on
ATIS (same NOAA source as METAR, zero new terms) · transponder panel (squawk
already parsed, unconsumed; emergency reads AMBER for an observer) · overflight
log (diary of the sky from polls already paid for; foundation for the life
list and follow records) · long-exposure decaying trails · type life list ·
climb staircase (side profile of a followed flight) · DATALINK comm-status
page (renders the 1.7.0 backoff visibly) · MOUNT VIB (accelerometer RMS,
labelled honestly) · follow records · pressure diary · military layer (terms
of /v2/mil unread — §15.1 first) · SIGMET polygons on the ND · INT LTS manual
dimmer (SETUP has no manual brightness at all).

### Needs Noah's ruling before anyone builds

- **Is an on-device ephemeris a feed or synthesis?** Sun/moon/terminator hangs
  on whether computed astronomy is DERIVED like WMM or invented data. Precedent
  call, his to make.
- **Microphone** (cabin-noise meter): loosens Permissions-Policy from
  microphone=() — a privacy-posture change needing explicit sign-off.
- **Where does the friend live?** Weather radar, PIREPs and TAF coverage all
  gate on it.
- **Which tablet sits in the printed panel?** The lower-EICAS systems page is
  alive on Android and mostly FAIL on iPad, so the device decides the feature.
- **Aircraft photos** (planespotters.net): terms unread, §15.1 blocks.

### Rejected for honesty, recorded so nobody re-litigates

- **Barometer tapes** — no browser exposes a pressure sensor; revisit only if
  platforms change.
- **Engine gauges (EPR/N1/EGT)** — nothing broadcasts them; relabelling device
  metrics as engines is invention. The only legitimate route is sim telemetry,
  a separate workstream with its own recorded blocker.

---

## 1.7.2 — the card leads with the icon

The ADI-face icon replaces the hub-style mark bars on the share card, at
Noah's call ("I really like the icon"). It is the same artwork as the
home-screen tile, so the card and the installed app now share a signature.
Regenerated both outputs from the one card source.

---

## 1.7.1 — words on the share card, in the family style

Noah: "I want words on the social preview like my other repos." The hub has a
card pipeline (`social-card.html` + a Playwright renderer); fauxplane now has
the same, at `scripts/social-card.html` + `scripts/render-social.mjs`, emitting
both `docs/social-preview.jpg` (1280x640, the GitHub tile) and
`public/og-image.jpg` (1200x630, behind og:image).

The family layout — mark bars, name at 84px, gradient rule, tagline, value
chips, URL — over his concept render behind a left-weighted scrim. The mark and
chips use the PANEL'S provenance tones (LIVE green, DERIVED cyan, STALE amber)
rather than the hub's photography palette: same family, this member's colours.
The honesty line rides under the tagline: not a simulator, not certified for
anything, never for navigation.

Uploading the GitHub tile stays a UI step the token cannot perform (§10):
Settings → General → Social preview → upload `docs/social-preview.jpg`.

---

## 1.7.0 — tap to follow, restart, and obeying the rate limit

Noah's report, following UAL2436: the follow poll was refused with HTTP 429 and
the panel KEPT ASKING every five seconds through the refusal — while the nearby
poll (a different cache key) worked. Doctrine §15.3 calls a 429 an instruction;
the panel was treating it as an obstacle.

**Backoff now.** Any rate-limited traffic round doubles the wait before traffic
is asked again — nearby and follow both, because the limit belongs to the
provider, not to an endpoint — up to two minutes; one success clears it. The
failure string on the follow row was already honest; the BEHAVIOUR now is too.

**Tap an aircraft to follow it.** A tap within a finger (~24 px) of a symbol
fills the follow box and follows, through the same `startFollowing` the form
uses. The hit test is a pure function using the exact geometry `drawPlan`
paints with, tested for the miss, the empty sky, and the two-close-symbols case
where the NEAREST must win regardless of list order. The "Heard right now"
list remains the accessible route to the same action, so the canvas tap is an
enhancement, never the only way.

**Restart the panel**, on SETUP. A reload is this app's power cycle: the worker
serves the shell offline, boot starts clean, the PANEL POWER gate re-asks for
sensors. Noah asked for exactly this mid-wedge, and one honest control beats a
panel that can only be unwedged from the browser chrome.

### Verified

**215 unit tests, 35/35 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.** Not verifiable here: a live 429 from adsb.lol (the sandbox cannot
reach them), so the backoff is covered by tests of nothing — it is three lines
reviewed, not proven, and the next rate-limited follow on a real device is the
test.

---

## 1.6.0 — four answers off two screenshots, and a social tile

**"Why is the g-gauge always left of center?"** Because the scale runs −1 to
+4 g — what a load factor actually does — so normal rest sits at forty percent
of the arc. The scale is right and the question was fair: what was missing is
the reference mark a real G-meter carries at 1 g, which now says the resting
spot IS normal.

**"The horizon degrees stop at 30?"** They did, for fifteen releases — a device
pitched past thirty showed featureless sky with no scale at all. Rungs now run
to ±90: 5° spacing to thirty where a pilot flies, 10° beyond, matching a real
PFD. Fusion clamps pitch at ±90, so the ladder now covers everything the filter
can report.

**"Put range options on the side of the radar on the main screen."** Done — a
vertical 10/25/40/80 stack beside the navigation display, driving the SAME
value as the RADAR page through one setter with listeners, because two controls
are fine and two copies of a value is how they disagree. The gate checks it AS
RENDERED: click the PFD button, read the RADAR page's pressed state. Planted
both ways. The baseline of the first plant run caught a real crash — the wiring
referenced `radar` before it was created — which is the console-error check
earning its keep before anything shipped.

**"Turning the panel on closes the initial instructions."** It did: the
first-run orientation lived only on the power gate, so the button a new reader
presses first took the instructions away mid-read. The NODE now moves to the
SETUP page on dismissal — moved, not copied, so the two cannot drift — and the
gate says so up front. Checked on the SETUP page after dismissal; planted.

**Social preview.** Noah supplied a concept render (a stylised tablet cockpit —
not a screenshot, and clearly so). Committed as `docs/social-preview.jpg` at
GitHub's 1280×640, and as `public/og-image.jpg` (1200×630) behind og:/twitter:
meta tags so shared links to fauxplane.pages.dev carry it. Uploading the GitHub
tile is a UI step the session token cannot perform (Doctrine §10) — steps in
the handoff, awaiting Noah's confirm.

### Verified

**212 unit tests, 35/35 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor, and the new PFD layout rendered and looked at.**

---

## 1.5.1 — leaning is not launching: the accelerometer loses its vote when it disagrees with the gyro

Noah, hand-holding the panel: *"Leaning backward and forward with my phone make
it look like I'm a fucking rocket and X goes up again."* His diagnostics showed
the whole defect in two numbers: **1.01 g beside a 26.7° residual**.

### Magnitude was the wrong discriminator, and had been from the start

An accelerometer measures SPECIFIC FORCE — gravity plus every linear
acceleration of the hand holding it. Lean a phone back and forth and the
measured vector SWINGS while its length stays near one g: the corruption
rotates the vector, it does not stretch it. The manoeuvring gate (`accelGateG`)
checks only the length, so the corrupted direction sailed through and was
applied to the horizon at the in-motion gain. The rocket.

The fix is a **direction gate** — the innovation gating a Kalman AHRS applies
to its accelerometer measurements: when the gravity solution departs more than
`accelGateDeg` (10°) from the gyro-propagated attitude, the sample is rejected
and the filter coasts on the gyro, saying the measurement on the face of the
instrument: *"gravity 27° from the gyro — coasting on gyro."* The number, not a
diagnosis — the gate cannot tell device acceleration from its own divergence,
and this repo already records a reason string that could not tell two causes
apart as a defect.

### Adversarially reviewed before ship, and the review earned its keep

Five independent reviewers were set against the first implementation. They
found, and this release fixes:

- **The stillness bypass leaked at every rate reversal.** Stillness was ONE
  sample — and rhythmic leaning crosses zero rate at each turnaround, exactly
  where the translational corruption peaks, so the corrupted sample presented
  as "still" and bypassed the gate at the settled gain, three times the
  in-motion one. The bypass now requires stillness HELD for `alignHoldMs`,
  which is what the comment had claimed all along.
- **The coast window ran on the wrong clock.** Staleness runs on
  `lastAccepted`; the window ran on a private latch, so a magnitude-gated
  coast plus a direction-gated one could STACK past `maxCoastMs` and cross the
  horizon out — a regression the ungated filter did not have, demonstrated
  live in review. The window now closes when EITHER clock expires: the gyro's
  trust is one budget, whichever gate is spending it.
- **The repair of that grew its own standoff**, caught by the new test: the
  budget-escape acceptance refreshed `lastAccepted`, which re-armed the
  rejection at one corrected sample per window — the filter ended 0.6° into a
  30° correction, exactly one sample's worth. The spent budget is a LATCH,
  cleared only when the disagreement itself clears.
- **The accelerometer sign flip kept `aligned`** while discarding the state it
  vouched for, so the gate defended a single unvalidated re-seed sample —
  possibly the corrupted one — for a full window, rejecting TRUE gravity. The
  flip now revokes alignment, as every other state-discarding path already did.
- **The roll half was untested** (a roll-blind gate passed everything), **the
  accepting side was unpinned** (a gate 100× too tight passed everything), and
  the wrap through ±180° was unbound. One test each now: a sideways lean, an
  honest 5° disagreement accepted while moving, and a 2° step through the wrap
  that must not read as 358°.

### The clauses, each with a test

`aligned` — before the first static alignment there is no gyro reference to
disagree with. `!stillHeld` — 400 ms of low rate beside one g leaves no room
for linear acceleration, so a large residual while HELD still means the STATE
is wrong and gravity must win: ramp alignment, the recovery path. The budget —
past `disagreeCoastMs` (4 s, under `maxCoastMs`) the accelerometer is the only
absolute reference left and wins even while disagreeing.

### Known gap, on purpose

After a forced-acceptance episode the residual backstop revokes `aligned`, and
the gate stays dark until the next 400 ms of genuine stillness. Until then
behaviour is exactly pre-1.5.1 — a degradation to old behaviour, never below
it. Recorded rather than patched, because re-arming on anything weaker than
real stillness is how the standoffs above got built.

### Verified

**212 unit tests, planted and watched fail (the direction-gate plant red about
the gated-vs-ungated comparison, then the full sweep), the accessibility gate
green across 3 viewports x 2 palettes x 5 pages, both palettes clearing every
hard floor.** Not verified: the fix on Noah's actual hand — the lean gesture
cannot be produced in this sandbox.

### Also in this release

The changelog had no entries for 0.3.0 through 1.5.0 — eleven releases. The
gap is now marked in CHANGELOG.md itself rather than backfilled, because a
backfilled entry would look contemporaneous with its release. The §7d in-app
patch-notes surface remains OWED for this app and is the natural next
capability release.

---

## 1.5.0 — first-time instructions, on the first surface a reader sees

Noah asked for this in 1.4.2 and it was scoped rather than started. Started now.

It goes on the PANEL POWER gate, which is already the first thing a new reader
meets and already explains why it wants sensors — rather than behind a sixth tab
nobody would open before using the thing. It says what the panel is (a glass
cockpit for people who love aeroplanes, not a simulator, never for navigation),
what each of the five pages does in one line, and what to do first: clamp it,
level the horizon, open RADAR.

### The install problem was smaller than I made it

1.4.2 scoped this as needing per-platform capability detection, because iOS
fires no `beforeinstallprompt` and Android does. **That was over-thinking it.**
Naming both platforms — Share then Add to Home Screen; the browser menu then
Install app — is correct for every reader, cannot go stale the way a capability
sniff can, and needs no script at all on a page whose CSP forbids inline script
anyway.

The one piece of cleverness earns its place: `@media (display-mode: standalone)`
hides the install section once the app HAS been installed. That media query is
true exactly when the page was launched from a home screen, which is the only
condition that matters, and it asks the browser nothing.

**A scoping note that was wrong in the direction of doing less work.** Worth
recording because the usual failure is the opposite.

### The plant found something about the registry itself

The first anchor replaced the "First time here" heading and the gate stayed
GREEN — because `.gate-first-h` is also the class on the install heading, so the
selector still matched something. **A contrast registry row guards a class only
while that class has ONE reason to exist**, and that is true of every row in
there, not only this one. Re-anchored on the page list, which is unique, and
caught.

The registry rows also had to move from `REGISTRY` to `GATE_REGISTRY`: the
per-page loop runs AFTER the gate is dismissed, so a gate selector checked there
matches nothing and fails — correctly, and loudly, which is how it was found.

### Verified

**202 unit tests, 32/32 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

---

## 1.4.3 — a failed refresh is not an empty sky

Noah: *"The radar loses everything when you change range."*

One line: `nearby = result.ok ? withRangeAndBearing(...) : []`. **Any** failed
refresh wiped every aircraft off the plan view.

Changing range is the reliable way to trigger it, which is why it showed up
there rather than at random. Each range is a DIFFERENT cache key upstream, so
tapping through them issues real requests rather than being served by the 8 s
edge cache — and the providers publish a 1 req/s limit. One rate-limited reply
emptied the display.

**And the reader believes it.** A blank plan view does not read as "the refresh
failed", it reads as "there is nothing up there" — which is the one lie a radar
page must never tell. `sw.js` has a comment refusing to invent an empty sky for
exactly this reason, and this path was doing it anyway, three files away.

The aircraft already on the display are real observations that did not stop
being true because the NEXT request failed. They stay, and the failure is
reported beside them, which is the contract every other field in this app
already keeps.

### The second half, which would have been a worse bug

`lastResult.at` is stamped on every attempt including a failed one, and the
display age was reading it. Keeping the aircraft without fixing that would have
had them claim to be **freshly updated** the moment a refresh failed — stale
data wearing a new timestamp, which is worse than blanking them, because
blanking is at least visibly wrong. The age now comes from `nearbyAt`, stamped
only when the aircraft actually changed.

### The test drove a seam that does not exist

The first version stubbed a `fetchJson` option the source has never had, so it
fell through to the real `fetch`, returned nothing, and failed — for a correct
reason and for none of the reasons it was about. It drives `fetchImpl` now, the
same seam the browser uses.

**Third time this session a test has been caught testing something other than
its claim.** The pattern is always the same: the test was written from what the
code ought to look like rather than from what it is.

### Verified

**202 unit tests, 31/31 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

---

## 1.4.2 — the phone header stops eating the panel

On a 402 px iPhone the five tabs wrapped to TWO rows and the brightness control
took a third, so about 150 CSS px of chrome sat above the horizon before
anything useful was drawn.

The tabs are sized by their TEXT rather than by a fixed width, so trimming the
padding, the gap and the letter-spacing under 34rem brings all five onto one
row. **None of it touches the height**, which is the dimension SC 2.5.8 is
actually about — the 44 px target floor is unchanged and the gate confirms it.

Measured rather than eyeballed, at 402x874: header **105 px, tabs on 1 row**,
canvas top at 117 px. The bar still wraps to two lines because the tab row plus
the brightness control genuinely will not fit across a phone, and shrinking
further would start costing target size, which is not a trade this app makes.

### NOT done: first-run instructions

Noah also asked for first-time instructions — what the app is, and how to
install it. **That is not started**, and it is a real piece of work rather than
a paragraph:

- The natural home is the PANEL POWER gate, which is already the first surface a
  new reader sees and already explains why it wants sensors. Adding "what this
  is" and "add to home screen" there needs no new page and no new navigation.
- **Install instructions are per-platform and cannot be faked.** iOS is Share →
  Add to Home Screen and has no `beforeinstallprompt`; Android fires that event
  and can offer a real button. Telling an iPhone reader to press a button that
  does not exist would be exactly the kind of confident wrong answer this panel
  is built not to give, so the copy has to branch on what the browser actually
  supports and say so.
- It needs the accessibility gate treatment like every other surface: contrast
  registry rows, target sizes, and a planted fault.

Scoped here so the next session starts from the decision rather than the blank
page.

### Verified

**200 unit tests, the accessibility gate green across 3 viewports x 2 palettes x
5 pages, both palettes clearing every hard floor, and the phone header measured
directly.**

---

## 1.4.1 — the horizon settles, and the G-meter says what it is

Two things off one photograph.

### "What is the white gauge in the upper left?"

The load-factor meter, reading 1.04 g. **The question is the defect.** It was
labelled `G` — one letter, at the smallest size the palette has, in `text-3`,
the dimmest token available. That is a label only to somebody who already knows
what it says, and the reader this app is built for is explicitly NOT a pilot.
It reads **LOAD G** now, a size up, in `text-2`.

An instrument nobody can name is not an instrument, it is decoration.

### "Settle the horizon jitter"

The static gain applies **a quarter of every accelerometer sample**, sixty times
a second, for as long as the panel is on. That gain is right for ALIGNING — a
device set down levels in a fraction of a second, which is what it was added for
— and wrong for HOLDING, because the accelerometer is exact at rest and noisy at
rest, and both of those are true at once.

Alignment is a transient. Once it is done there is only slow drift left to
track, so the gain now drops to a tenth once `aligned` — about a 280 ms time
constant instead of 67 ms, still four times quicker than the in-motion gain, and
quick enough that a shifted mount is followed within a second. The fast gain
still applies on the way there, which a test pins separately.

### The test that looked like evidence and was not

The first version asserted an ABSOLUTE bound: the horizon must wander less than
0.35° on synthetic noise. It passed. **It also passed with the fix removed** —
the synthetic noise never crossed that bound either way, so the number was real
and the test was worthless. The plant caught it, which is the entire reason the
plant exists.

Rewritten to compare the filter AGAINST ITSELF: two filters differing only in
`settledAlpha`, fed identical samples, asserting the settled one wanders less.
That isolates exactly the thing that changed and cannot pass when the change is
reverted. Planted and watched fail.

**Two tests in two releases have now been caught measuring something adjacent to
their claim.** A threshold nobody has seen crossed is the same failure as a gate
nobody has seen go red.

### And the harness fix earned itself back immediately

The plant's first failure said `red, but not about this: not ok 146 — JITTER:
an ALIGNED, still filter...` — which named the real failing test, in the same
run where the old code would have quoted a passing one. The `expect` pattern was
simply stale after the rewrite. That is a five-second diagnosis instead of a
wrong turn.

### Verified

**200 unit tests, 30/30 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

---

## The plant harness named an innocent check, twice — fixed (scripts only)

Flagged in 1.3.1 as the most valuable thing outstanding, because it weakened
every plant number in this file. It turned out to be TWO bugs that looked like
one, and only one of them was the harness.

**The harness bug.** When a plant made the gate go red for the wrong reason, it
described that reason by grepping the output for the string `FAIL`. A PASSING
unit test whose NAME contains the word — `a FAIL field CANNOT carry a value` —
matched that filter, so the harness quoted a green line as the cause of a red
run. **A diagnosis that names an innocent check is worse than "it went red",
because it gets followed**, and it was: two anchors were tried on the same plant
and both were abandoned on the strength of it. It now keys on `not ok`, the TAP
marker a passing test cannot carry, and on the accessibility gate's own
line-initial `FAIL ` prefix, which a test name never has.

**The test bug, which was mine.** The 1.3.1 plant was genuinely not caught, and
not because of the harness. The test asserted `assert.match(out.reason, ...)`
against a reason that is NULL in the planted case — and `assert.match(null, ...)`
throws a TypeError, which quotes nothing. The expected pattern was therefore
absent from the output and the plant was correctly reported as unproven. The
assertion now coerces, so a null reason fails as an ASSERTION naming the pattern
it wanted.

The lesson is the second one. **An assertion that can throw instead of failing
is invisible to anything reading the failure**, and a fault-injection harness
reads failures for a living. The misleading message hid it; the brittle
assertion caused it.

Re-added the plant that could not be proven before. **It is caught now**, and the
sweep is 29 for 29 — one more check than before, because a check that had never
been shown to work is now shown to work.

*(Scripts only. No deployed file changed, so no version bump.)*

### Verified

**198 unit tests, 29/29 planted faults caught.**

### Still open

- The overlap check from 1.2.1, still UNPROVEN — a different problem: the fault
  is a PORTRAIT layout defect and `--quick` runs one landscape viewport, so the
  gate stays genuinely green rather than red-for-the-wrong-reason. Not touched
  by this fix.
- The intermittent PANEL POWER contrast failure, cause unfound.
- The airport / location picker, unblocked and scoped in 1.4.0.
- A route for a followed flight, pending adsb.lol's terms.
- Android and desktop, never confirmed by a device.
- Repo metadata: description, website, topics, social preview, all unset.

---

## 1.4.0 — the observed path of a followed flight

Noah asked for two things: an airport (or any location) as the radar centre, and
the flight path/plan of a followed flight. **This release does the flown path.**
The other two pieces are scoped below rather than half-built.

Every point on the trail is a position this panel was TOLD, at the time it was
told it. Straight segments between them, nothing interpolated and nothing
extrapolated ahead — a smooth curve through sparse observations is a DRAWING of
a flight path rather than a record of one, and the gaps are information: a
receiver dropout looks like a gap because it was one. It stops at the range ring
and resumes on the way back in, the same contract the symbols keep.

Appended where a fresh broadcast ARRIVES rather than where it is drawn, so it
records what was heard. Bounded by age and by count, so a long follow cannot
grow without limit, and identical repeated positions are not stored twice —
the followed aircraft is polled harder than it broadcasts, so storing every
reply would weight a parked aircraft's trail by how often we asked.

**It is a PATH and not a PLAN, and the distinction is the honest one.** ADS-B
carries no intent. Where an aircraft has been is in the broadcast; where it
means to go is not, and is not invented here.

### Scoped, not done

**Choosing an airport as the centre.** `npm run navdata` has refused to fetch
OurAirports since the repo was created, pending someone reading the terms. That
is now done: **OurAirports is public domain (CC0)** — no attribution required,
no restriction on redistribution or commercial use — and the data is mirrored as
plain CSV at `davidmegginson.github.io/ourairports-data/`. The blocker is
cleared and the work is: run the generator, ship a trimmed subset (ICAO, name,
lat/lon, size — not all 80,000 rows), and put a type-ahead on the radar page.

**An arbitrary location** is the easier half of the same feature and should
share the control: an airport is a named location, and the picker should accept
either.

**A route (origin and destination).** adsb.lol publish a separate routes API —
"plausible aircraft routes", in their own words, which is a phrasing worth
respecting when the panel labels it. Their terms need reading first, exactly as
adsb.lol's and adsb.fi's did.

None of that is started. It is written here so the next session begins from the
research rather than repeating it.

### Verified

**198 unit tests, 28/28 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

---

## 1.3.1 — the vertical speed says what it cannot resolve

The last correctness item on the list. GPS altitude on Noah's iPad is accurate
to plus or minus 27 m and arrives every 5 s; the panel showed a vertical speed
derived from it without ever saying what that combination can actually
distinguish from noise.

`verticalResolutionFpm()` computes it: each fix carries its own uncertainty, so
their difference carries both in quadrature; divided by the interval that is the
rate resolution, then reduced by the complementary filter's own steady-state
noise gain, sqrt(k/(2-k)) for k = dt/tau. **His iPad indoors: about 1,500 fpm** —
which is most of what a light aircraft ever does. A good fix at 1 Hz gets it to
about 620.

### It SHOWS the bound rather than zeroing the reading, unlike groundspeed

That difference is deliberate and worth writing down, because the two look like
the same situation and are not:

- Two position fixes agreeing inside their accuracy **IS** evidence of standing
  still. Reporting 0 kt there is a measurement.
- An altitude rate under the floor is **NOT** evidence of not climbing. It means
  the GPS half of the filter cannot resolve it, while the accelerometer half may
  be carrying real information. Zeroing it would invent a "not climbing" that
  nothing measured.

So the estimate stays and the bound goes on the face of it: *"GPS altitude
resolves no better than ±1,503 fpm here"*. A number whose uncertainty exceeds
the number is still the best estimate available, and saying so is the difference
between a coarse instrument and a lying one.

### The plant for it is UNPROVEN, and was removed

Two anchors were tried and both made the gate go red for the WRONG reason. The
harness extracts the failure lines by matching "FAIL" in the output — and a
passing test whose NAME contains the word FAIL ("a FAIL field CANNOT carry a
value") matches that filter, so the harness quoted a green line as the cause and
declared the plant unproven.

**That is a defect in the harness's reporting, not evidence about this change.**
Nothing about it says the check does not work; it says the harness cannot
currently tell me whether it does. Fixing the extraction to key on `not ok`
rather than on the string FAIL is the real repair, and it is the next thing on
the list rather than something to bolt on here.

The behaviour itself is covered by five unit tests, including the two cases that
matter — a rate under the floor keeping its value and gaining the caveat, and a
1,200 fpm climb reported without it. The first version of that second test used
30,000 fpm and tripped the runaway guard instead, which is the runaway guard
working.

### Verified

**192 unit tests, 28/28 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

### Still open

- The plant harness misattributes failures containing the word FAIL. Now the
  most valuable thing on this list, because it weakens every future plant.
- The overlap check from 1.2.1, still UNPROVEN.
- The intermittent PANEL POWER contrast failure, cause unfound.
- Android and desktop, never confirmed by a device.
- Repo metadata: description, website, topics, social preview, all unset.

---

## 1.3.0 — labels on a busy plan view stop overprinting

Noah's 40 nm screenshot at 1.0.0: nineteen aircraft, about a dozen of them in
one quadrant, and their labels overprinted into a smear. Worse than unreadable —
it reads as CORRUPTION rather than as density, which makes the whole instrument
look broken at the exact moment it is doing the most work.

The cause was that every label was drawn at a fixed offset below its symbol,
inside the same loop that drew the symbols. Placement that has to account for
other labels cannot happen in a loop that has not seen them yet.

Labels are now collected first and placed once: four candidate positions per
aircraft — below, above, right, left — first one clear of every label already
placed wins. Below is tried first because that is where a reader expects it and
it keeps sparse clusters looking exactly as they did.

**A label that fits nowhere is DROPPED, and its symbol is still drawn.** That is
the honest trade and it is worth stating plainly: the aircraft remains on the
plan view at its true bearing and range, which is what a plan view is FOR, and
its callsign is in the RADAR page's list as selectable text. Drawing the label
anyway would hide a neighbour and help nobody.

Who keeps a label when they cannot all have one: **the followed aircraft first**
— it is the one driving the panel, so it is the one that must stay named — then
whoever is closest to the centre.

### Why this had to be a pure function

The accessibility gate cannot see inside a canvas. That is the same structural
blindness that let the radar page ship as a solid magenta rectangle, and it
means no gate here could ever have caught overprinted labels. So placement takes
its own text measurement as an argument and is tested without a browser: a dozen
aircraft crammed into one small area, and the assertion is that no two resulting
boxes intersect. Planted and watched fail — removing the collision check turns
the suite red naming the overlap.

### Verified

**187 unit tests, 28/28 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

### Still open

- The VSI resolution floor: GPS altitude at plus or minus 27 m every 5 s cannot
  resolve a climb under roughly 1,500 fpm, and the panel does not say so.
- The intermittent PANEL POWER contrast failure, cause unfound.
- The overlap check from 1.2.1, still UNPROVEN.
- Android and desktop, never confirmed by a device.
- Repo metadata: description, website, topics, social preview, all unset.

---

## 1.2.2 — nested failure reasons, fixed where they are MADE

Flagged twice and deferred twice, so it got its own release rather than being
folded into a layout change.

`worstOf` quotes its first failing input's reason — and that reason is often
itself a `worstOf` composition, so the quoting nests. On the panel:

> MSL altitude, altimeter setting, station altimeter unavailable (MSL altitude:
> GPS altitude, geoid separation unavailable (GPS altitude: not yet initialised))

Three levels, every one of them true, and the single fact underneath is the part
hardest to find. 1.0.1 fixed one instance of this by hand in `motion.js`. **The
shape repeats wherever derived values chain**, which is everywhere, so the fix
belongs in the composition and not at each site.

Now:

> MSL altitude, altimeter setting, station altimeter unavailable (GPS altitude:
> not yet initialised)

`rootCause()` unwraps a composed reason to the fact underneath it. The
INTERMEDIATE names are dropped on purpose: a reader needs the names of what is
missing HERE, and the one cause at the bottom — the middle of the chain is noise.

Two things the first attempt got wrong, both caught by writing the test first:
- Unwrapping alone produced `(MSL altitude: GPS altitude: not yet initialised)`
  — two colons, and a name that is not the cause. An unwrapped root already
  carries its own field name, so the prefix is only added when nothing was
  unwrapped.
- The termination cap was 8, which left a deep chain PARTLY stripped. A
  half-unwrapped reason is worse than the original because it looks deliberate.
  It is 32 now — far above any real chain, so the bound only ever guarantees
  termination and never truncates a genuine one.

Planted and watched fail: restoring the raw quoting turns the suite red naming
the nested parenthesis.

### Verified

**181 unit tests, 27/27 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

### The open list, unchanged

- Label collision on a busy plan view.
- The VSI resolution floor — GPS altitude at plus or minus 27 m every 5 s cannot
  resolve a climb under roughly 1,500 fpm, and the panel does not say so.
- The intermittent PANEL POWER contrast failure, cause unfound.
- The overlap check added in 1.2.1, still UNPROVEN.
- Android and desktop, never confirmed by a device.
- Repo metadata: description, website, topics, social preview, all unset.

---

## 1.2.1 — portrait was broken, and asking was the only reason anyone found out

Noah: *"Will the radar move under the pfd in portrait mode?"*

The honest answer was "the DOM order says yes and I have not looked", so I
measured it. **Both portrait cases were wrong.**

- **Phone, 390x844.** The horizon spanned y 179-685 and the navigation display
  y 506-650 — the radar drawn straight over the top of the horizon. The
  stacking media query was written before `.pfd-main` and `.pfd-side` existed,
  so those wrappers kept their ROW flex shares (62 and 38) in a column and
  collapsed under their own content.
- **iPad, 820x1180.** 820px is 51rem, ABOVE the 46rem breakpoint, so a portrait
  iPad never stacked at all — the horizon and the plan view shared the short
  axis and neither had room.

Fixed by stacking on `(orientation: portrait)` as well as on width — orientation
is the thing that actually decides this — and by giving both wrappers
`flex: 0 0 auto` so each is as tall as its own content. Measured again after:
phone 179/692/785/1176, iPad 70/784/840/1383, no overlap in either.

**A question was the entire detection mechanism.** Nothing else would have
caught it: 172 unit tests, the full accessibility gate over three viewports —
one of which, `small-phone-200pct` at 390x640, IS PORTRAIT — and two preview
renders, all green, all through a layout where one instrument was painted over
another.

### The overlap check, and why it is UNPROVEN

The reason the gate missed it is that every check looks at ONE ELEMENT AT A
TIME. Contrast, target size, accessible name and axe all pass happily on two
elements occupying the same pixels. **The gate had no opinion about geometry.**

So there is now a check asserting that the horizon, the plan view, the readouts
and the levelling control do not overlap each other. **It has never been watched
fail, and it is recorded here as unproven rather than counted as evidence.**

Planting the original fault left the gate GREEN. Twice: `--quick` runs one
LANDSCAPE viewport, where the portrait media query never applies; giving it a
portrait viewport as well did not reproduce the overlap either, at 390x640 with
double text. The defect is real and was measured — the conditions that produce
it are simply not the conditions the harness runs.

The plant was REMOVED rather than left reporting UNPROVEN for ever, and the
quick-mode change was reverted rather than kept on a rationale that turned out to
be wrong. What remains is an honest state: a check that exists, has not been
demonstrated, and is written down as such. A check counted as evidence before
anyone has seen it go red is the one thing this file exists to prevent.

### Verified

**172 unit tests, the accessibility gate green across 3 viewports x 2 palettes x
5 pages, both palettes clearing every hard floor, and the portrait layout
measured directly at two sizes.**

---

## 1.2.0 — levelling moved to where the crooked horizon is

Noah: *"Please move the level function out of setup so it's intuitive."*

It was on the SETUP page, which is the one place a reader is NOT looking at the
moment they notice the horizon is wrong. **Level the horizon** now sits directly
under the ADI, with the current state beside it and a Clear button that appears
only once there is something to clear.

**The behaviour did not move — only the reach did.** The capture procedure, the
retroactive still-window, the arm-and-wait, and every refusal string still have
exactly ONE implementation in `setup.js`; the PFD buttons call `setup.capture()`
and `setup.clearLevelling()`. Two buttons doing the same thing is fine. Two
copies of a safety-critical procedure is how they drift apart, and this one
already refuses bad references for reasons that took a release each to get right.

The status wording is read straight off the node SETUP shows it on
(`setup.lastStatus`), so the PFD copy cannot say something different from the
SETUP copy about the same event.

SETUP keeps its controls and, more importantly, keeps the long explanation —
what levelling is, what it cannot do (it cannot set which way is forward), and
what a car does that an aeroplane does not. That text is worth reading once and
does not belong crammed under a horizon.

### What a preview render is for

The gate passed before I looked. `preview.mjs` is what showed the control in
place, correctly sized, with its status text beside it rather than wrapped under
it — none of which a contrast check or an axe pass can tell you. **Two releases
in a row now, the gate has been necessary and not sufficient.**

### Still not fixed, and now visible in the preview render

The nested-reason defect, in the altitude chain:

> MSL altitude, altimeter setting, station altimeter unavailable (MSL altitude:
> GPS altitude, geoid separation unavailable (GPS altitude: not yet initialised))

Unchanged from 1.1.0. It wants a depth limit inside `worstOf`, which is shared
provenance code and deserves its own release rather than being folded into a
layout change.

### Verified

**172 unit tests, the accessibility gate green across 3 viewports x 2 palettes x
5 pages including the 200%-text case — with the new control registered for
contrast, so a selector that stops matching FAILS the build — both palettes
clearing every hard floor, and the layout rendered and looked at.**

---

## 1.1.0 — a navigation display beside the horizon, which is where one goes

Noah: *"The radar would be better next to the PFD than these diagnostics."*

He is describing the layout of an actual airliner. A 747 has the PFD in front of
the pilot and the **Navigation Display** immediately beside it; the plan view
belongs there, and the column of values he was looking at is a debug surface
that had quietly become the main thing on the right half of the screen.

The right column is now the ND over the values: plan view on top, readouts
underneath, the column scrolling as before.

**The readouts STAY, and that is not a compromise.** A canvas is not text. Those
rows are the only screen-reader-accessible copy of these numbers, they are what
the contrast registry measures, and they are what acceptance criterion 1 is
asserted against — "with every permission denied, no readout is showing digits"
cannot be checked against a drawing. Replacing them with a canvas would have
traded an accessibility guarantee for a picture.

**One source, two drawings.** The ND reads the same traffic the RADAR page does,
at the same range, through the same accessor — rather than keeping its own copy,
which is precisely how two pictures of one truth come to disagree.

The fetch rule is unchanged and now simply has one more page under it: traffic is
requested only while a page that DRAWS it is open. The PFD is now such a page.
Two pages open in turn cost one upstream request, not two, because the edge cache
carries the second.

### Seen, not merely gated

`scripts/preview.mjs` rendered it, and that is the only reason this entry can say
the ND draws at all. **The canvas sentinel added in 0.4.7 skips transparent
pixels**, so a plan view that drew nothing whatever would have passed it in
silence — a green gate here proves the absence of magenta, not the presence of a
picture. The preview is what closes that gap.

### Found in the preview render, NOT fixed

The indicated-altitude failure reads:

> MSL altitude, altimeter setting, station altimeter unavailable (MSL altitude:
> GPS altitude, geoid separation unavailable (GPS altitude: not yet initialised))

The same three-level nesting 1.0.1 fixed for vertical speed, still present in the
altitude chain. `worstOf` composes a reason out of its inputs' reasons, and
nothing stops that recursing. The real fix is a depth limit in `worstOf` itself
rather than another one-off unwrapping — which is a change to the shared
provenance code and wants its own release.

### Verified

**172 unit tests, the accessibility gate green across 3 viewports x 2 palettes x
5 pages including the 200%-text case, both palettes clearing every hard floor,
and the layout rendered and looked at.**

---

## 1.0.1 — an error state that looks like a crash is a defect in its own right

Noah, on a 1.0.0 screenshot: *"It doesn't need to look like this to error does
it?"* No, it does not.

**The horizon caption was severed mid-parenthesis.** It read
`gravity reference only — gyro settling (…` — ellipsised on a single line, so
the truncation landed inside the bracket and threw away the one number the
sentence existed to deliver. The panel was working correctly and looked broken.

Fixed with a `wrapText` primitive: the caption wraps to two lines and only the
LAST line ellipsises, and only when the text genuinely does not fit. There had
never been a wrap helper, only `ellipsise`, so every long string in a canvas had
exactly one option and it was the destructive one.

**The failure reason was three levels deep.** The vertical-speed readout said:

> vertical acceleration: attitude not converged — no vertical reference (gravity
> reference only — gyro settling (14.1°))

A prefix from `worstOf`, wrapping a sentence, wrapping a parenthetical, wrapping
a number. Each layer was individually reasonable and the total was unreadable.
The filter's own reason is the more specific of the two and now passes straight
through instead of being nested inside a second description of the same fact.

**The rule this session keeps rediscovering:** honesty is necessary and not
sufficient. Every one of those strings was TRUE. A true explanation that reads
as a crash still costs the reader their confidence in the instrument, and this
app spends its whole budget on being believable.

### Still open, and deliberately not done here

- **Red X density.** On a stationary desk several instruments cannot work, and
  the panel is dominated by full-height red crosses. A real EFIS does cross a
  failed instrument in red, so the convention is being followed — but
  "unavailable in this situation" and "this instrument has failed" are different
  facts and currently look identical. Distinguishing them is a real design
  change and wants Noah's eye, not a session's taste.
- **Label collision on a busy plan view**, unchanged from 1.0.0.

### Verified

**172 unit tests, the accessibility gate green across 3 viewports x 2 palettes x
5 pages, both palettes clearing every hard floor.**

---

## 1.0.0 — adsb.lol answered, and Noah called the version

Nineteen aircraft, real callsigns, real flight levels: FFT3393 at FL360, UAL1730
at FL350, DAL1088 at FL235, SCX396 at FL276, ground traffic marked GND, and the
citation reading "Aircraft data from adsb.lol (ODbL)" with the link their
licence requires. **The first live traffic this app has ever shown.**

Two things that had never been verified now are:
- **adsb.lol serves a Pages Function.** adsb.fi's edge does not, and the
  fallback chain is what made trying cost nothing.
- **The `/v2/lat/{lat}/lon/{lon}/dist/{dist}` path was inferred** from their
  "drop-in replacement for the ADSBExchange shape" claim, because their docs
  host refused this sandbox too. It was right. Recorded as inference confirmed
  by a device, not by a session.

Noah: *"Promote to main as v1.0.0."* Doctrine §7 says he decides what counts as
a VERSION, and the first slot stays 0 until he says otherwise. He said otherwise.

### What v1.0.0 IS

A panel whose every number traces to a sensor on the device or a feed from a
named source, which says which, and which crosses out — with a reason a person
can read — everything it cannot honestly answer. It runs offline, replaces its
own releases, levels itself to whatever it is clamped in, and can hand the whole
panel over to a real aircraft overhead.

### What v1.0.0 is NOT, and none of this is hidden

- **Not certified for anything, and never for navigation.** Said in the footer
  of every page.
- **Android and desktop in landscape have never been confirmed by a device.**
  Every real report so far is iPad or iPhone.
- **Labels collide on a busy plan view.** Visible in the 40 nm screenshot at
  1.0.0: around a dozen aircraft in one quadrant overprint each other into an
  unreadable smear. It is cosmetic, it is real, and it is the first thing worth
  fixing next.
- **The accessibility gate has one intermittent failure** (PANEL POWER contrast,
  three re-runs green, cause unfound) that is recorded rather than dismissed.
- **The VSI resolution floor is still not implemented** — on a desk, GPS
  altitude at plus or minus 27 m every 5 s cannot resolve a climb under roughly
  1,500 fpm, and the panel does not yet say so.

### Verified at the tag

**172 unit tests, 26/26 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor** — and, for the first time, a live third-party feed confirmed on the
target device rather than against a fixture.

---

## 0.5.0 — traffic has a LIST of sources, and the panel credits the one that answered

Noah: *"Why not switch to adsb.lol?"*

No good reason. 0.4.9 wrote the decision up as his to make, which was
over-deferring: he had asked for a working radar page, and which vendor answers
it is the sort of thing a session should work out. The one real prerequisite was
reading the terms from the publisher first (LESSONS 18), and that is done.

**adsb.lol**: ODbL 1.0, no API key at present, dynamic rate limits, and they
describe their API as *"compatible with the ADSBExchange Rapid API — a drop-in
replacement"*, which is the same shape adsb.fi serves. So the existing parser
reads either without a change.

### A list, not a swap

Neither provider has ever been reached from this sandbox — the proxy refuses
CONNECT to both — so replacing one untested source with another untested source
would have been a coin flip. The source became a LIST instead: adsb.lol first,
adsb.fi second, tried in order, first real answer wins.

The distinction that makes it work: a **404 from the callsign endpoint is an
ANSWER** (that flight is not being heard right now) and must not fall through,
while a 403 from a CDN is that provider refusing us and must. If every provider
refuses, all of their reasons are reported together — "adsb.lol returned
HTTP 403" alone would send the next reader to investigate adsb.lol, when the
useful fact is usually that both refused and how each phrased it.

### Crediting the wrong source is worse than crediting none

The citation was rendered with the NAME from the response and the LINK
hardcoded to `https://adsb.fi`. Fine while there was one source; a false
citation the moment there were two. Both now come from the payload.

And the gate that was supposed to protect this **grepped radar.js for the string
`https://adsb.fi`** — which would have passed happily while the panel credited a
provider that had not supplied a single byte. It now reads the rendered anchor
and asserts its href matches the source the response named. Same lesson as the
magenta canvas two releases ago: **a check that reads the source instead of the
output is checking that somebody typed something, not that it works.**

### What is NOT resolved

- **Neither provider has answered this app, ever.** adsb.lol may block a Pages
  Function exactly as adsb.fi does. The first device to open RADAR is the test.
- **The `/v2/lat/.../lon/.../dist/...` path for adsb.lol is inferred** from their
  "drop-in replacement for ADSBExchange" claim, not read off their endpoint list
  — their docs host returned 403 to this sandbox too. If it is wrong the panel
  will say `adsb.lol returned HTTP 404`, which is a clear enough signal.
- **adsb.fi stays in the list.** The block may be theirs to lift, and asking
  them is still the right move.

### Verified

**172 unit tests, 26/26 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

---

## 0.4.9 — the 403 named itself, and it is adsb.fi's FIREWALL, not their API

0.4.7 made the traffic failure carry its own evidence. One tap on RADAR and it
answered:

```
adsb.fi returned HTTP 403 [server: cloudflare] — <!DOCTYPE html> <!--[if lt IE 7]>...
```

**`server: cloudflare` plus a Cloudflare block page.** So the endpoint is right,
the request is well-formed, and adsb.fi's *edge* is refusing it before their API
ever sees it. That is a different problem from a wrong URL and needs a different
answer.

### The reporting was still wrong, in a smaller way

Relaying the first 160 characters of the body put `<!DOCTYPE html> <!--[if lt IE
7]>` on the face of a gauge and truncated just before the only part that
matters. **The fix was not to relay MORE — it was to relay the RIGHT part.** The
Function now extracts the block page's `<title>` (which names the site and the
reason), Cloudflare's four-digit error code, and the `cf-ray` / `cf-mitigated`
headers, and never lets markup through at all.

The code is the actionable bit: **1015 is rate limiting, 1020 is a firewall rule,
1010 is a blocked client signature.** They call for opposite responses.

Tested against the captured block page from Noah's own report rather than a live
call, because the sandbox proxy refuses CONNECT to adsb.fi entirely. That is
better evidence than a live call would have been: it is the failing case.

### NOT going to disguise the client, and this is a decision, not an oversight

The obvious "fix" is to send browser-shaped headers until the bot rule stops
matching. **That is circumventing an access control the operator deliberately
put there**, and it is not something this app is going to do to a service whose
data it is asking for as a favour. It would also be dishonest in exactly the way
the whole panel exists not to be.

The legitimate routes, in order:
1. **Ask adsb.fi.** Their terms permit personal, non-commercial use; a Worker
   being caught by a bot rule is plausibly unintended. They have a public repo
   and a Discord.
2. **Use a provider whose terms and edge both permit it** — adsb.lol publishes
   under ODbL and is explicitly open to this. Switching is a real option and is
   NOISE.md-level, not a session's call to make silently.
3. Accept that RADAR does not work from a Cloudflare Worker and say so on the
   page, which it already does.

Awaiting Noah's decision. Nothing about this is blocked on more diagnosis.

### One fix off the same report

**Groundspeed showed STALE at 8 s while the position it is computed FROM showed
LIVE at the same 8 s.** `position.groundspeed` carried `freshMs: 5000` from when
it came straight off `coords.speed`; since 0.4.6 it is differenced from the very
fixes beside it, which are fresh for 10 s. One fix cannot be two ages at once,
so the freshness now matches its source.

### What is confirmed WORKING on Noah's device

- **Levelling.** `cradle -82.5 deg pitch, 2.7 deg roll` captured and subtracted;
  the horizon reads pitch -0.04, roll -0.06. The retroactive capture works, and
  it worked on a hand-held tablet, which is what it was built for.
- **The radar page renders** — rings, compass, range buttons, no magenta.
- **Groundspeed reads 0.00 kt** instead of a red X.
- **VSI reads 0.00 fpm** instead of crossing itself out. ZUPT works.
- **AoA now fails with its OWN reason** ("groundspeed below 20 kt — flight path
  angle is undefined") rather than a cascade from three fields up.

### Verified

**168 unit tests, 26/26 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

---

## 0.4.8 — the press is the disturbance, so stop measuring at the press

Noah, on the levelling button: *"When I tap the button, it wiggles too much to
work…"*

The check was right and the MOMENT was wrong. Levelling read stillness at the
instant of the click — the one instant guaranteed to be disturbed, because the
press is itself the disturbance. On a tablet held in two hands it could never
succeed, and the panel kept explaining why it was refusing rather than doing the
obvious thing.

**The reference worth having is the one from just before the touch.** A cradled
device is still right up until a finger reaches it, so the filter now records
its attitude whenever it is genuinely still, and levelling reaches back for that
instead. Retroactive, instant, and it needs no countdown.

Two things guard it. The remembered reading must be recent (eight seconds), so a
reference from before the device was moved somewhere else cannot be used. And if
there is no still moment to reach back to at all, the button ARMS rather than
refuses: it waits, and captures by itself the moment the device settles, with a
cancel and a twenty-second give-up. That is how a Dynon or a G5 does it — the
unit does the capturing, the human just holds the aircraft still.

Recorded in the UPDATE path, deliberately not in `read()`. The first attempt put
it in `read()`, which made "when was this last still" depend on somebody
polling — true in the app by accident, and false the moment a test drove the
filter directly. The test caught it immediately, which is the whole argument for
writing it.

### And it turned up something worse

Chasing the test failure exposed a real defect: **`still` stayed TRUE through a
manoeuvre.** The rejection path — the branch that throws away accelerometer
samples too violent to trust — returned BEFORE stillness was recomputed, so
`stillSince` kept whatever it last held. The filter was simultaneously rejecting
samples for being too violent and reporting that the device was sitting on a
desk.

That was mostly cosmetic until 0.4.6, when the vertical-speed integrator started
keying its **zero-velocity update** off exactly this flag. A climb rough enough
to reject samples would have been told its vertical speed was zero. **A ZUPT
firing during a manoeuvre is the one thing a ZUPT must never do**, and it shipped
two releases ago in the change that introduced it.

Worth stating plainly: the wiggle fix in 0.4.6 was correct, and it made a
pre-existing dormant bug dangerous. **Adding a consumer to a flag is a reason to
re-read what sets it.**

### Verified

**162 unit tests, 25/25 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

---

## 0.4.7 — the radar page was a solid magenta rectangle, and every gate was green

Noah opened RADAR for the first time. The plan view was one flat sheet of
`#ff00ff`.

That colour is not a bug, it is the SENTINEL — `canvas.js` takes every gauge
colour from a CSS custom property and falls back to magenta when one cannot be
read, deliberately hideous so that a missing token gets noticed. It worked
perfectly. **Nothing was looking.**

### Why it happened

`createSurface` reads its tokens once, at construction. Every panel except the
one visible at boot is built inside a `[hidden]` element, and
`getComputedStyle` on an element in a hidden subtree returns an **empty string
for every custom property**. So all eighteen tokens fell back to magenta — and
the result was then CACHED for the life of the page, because `tokens` is only
re-read when it is null.

The PFD was fine for one reason: it is the page showing at boot.

Fixed by refusing to cache an incomplete read. The next access retries, which
costs eighteen property lookups until the page is shown and nothing afterwards.
A token genuinely missing from the stylesheet still goes magenta, loudly, which
is the entire point of it.

### Why no gate caught it, which is the part worth keeping

**Axe cannot see into a canvas, and neither could anything else here.** The
accessibility gate ran the radar page across three viewports and two palettes
every release; it checked contrast on DOM nodes, target sizes, names, and that
the panel box was not empty. A canvas is one opaque element to all of it. The
page was one flat colour and every check passed.

This is the same shape as "a headless browser has no accelerometer", and the
same answer applies: **when a check is structurally blind to a whole class of
output, say so and build the check that is not.** The gate now reads pixels back
out of every on-screen canvas and fails on the sentinel colour. Planted and
watched fail: restoring the caching turns the gate red naming the canvas and the
percentage.

The sentinel had existed for many releases. An alarm nobody has wired to
anything is a decoration.

### adsb.fi returns HTTP 403 — NOT diagnosed

The radar page also reported `No traffic: adsb.fi returned HTTP 403`.

Checked and ruled out: the base URL and all three paths are exactly as adsb.fi
publish them (`/v3/lat/{lat}/lon/{lon}/dist/{dist}`, `/v2/callsign/{cs}`,
`/v2/hex/{hex}`), and 250 nm is their documented maximum. So this is not a wrong
endpoint.

**What it actually is, is unknown, and this sandbox cannot find out** — the
proxy refuses CONNECT to adsb.fi, so no request can be made from here. The
remaining candidates are adsb.fi refusing this User-Agent, adsb.fi refusing
Cloudflare Worker egress generally, or a bot rule on their edge.

Rather than guess, the Function now reports what the server said: the response
body, bounded and flattened, plus its `server` header. "HTTP 403" is a status
code, not a reason — and the app enforces "a failure explains itself" on its own
sensors while accepting a bare status from somebody else's. The next report
Noah sends will name the cause.

### Verified

**160 unit tests, 23/23 planted faults caught, both palettes clear, the
accessibility gate green — now including a canvas the gate can finally see.**

---

## 0.4.6 — zero is a measurement, and treating it as a gap was the bug

Noah, looking at a panel with groundspeed crossed out on a stationary desk:
*"Why can you not show ground speed of zero?? Why the fuck can't you tell a
wiggle isn't vertical acceleration when stationary?!"*

He is right on both, and they are the same defect. The no-synthetic-data rule is
correct and stays — but **"the platform handed me null" is not the same fact as
"the quantity is unknowable"**, and this app had been treating them as one.

The old reason string named its own defect and nobody read it:

> `this fix carried no speed (stationary, or the platform does not report it)`

It could not tell those two apart, and did not try — while holding two position
fixes and a clock, which is everything a groundspeed is made of.

### Groundspeed is differenced from the fixes

`coords.speed` is null on a stationary iOS receiver. When it is, the speed is
now differenced from consecutive fixes, and the **resolution bound is computed
and shown**: each fix carries its own accuracy, so their difference carries both
in quadrature, and divided by the interval that is the smallest speed
distinguishable from standing still. Below it the answer is **0 kt**, DERIVED,
with the bound on the face of it. It is a measurement of not moving, not the
absence of one.

The floor is not a formality. Writing the tests, a "walking pace is obviously
motion" case FAILED: two ±5 m fixes 5 s apart resolve to ±1.41 m/s, and a
1.40 m/s walk is inside that. The physics was right and the expectation was
wrong. That case is kept as a test of the limitation — a slow walk on an indoor
fix genuinely cannot be told from standing still, and the panel says so with the
number rather than pretending either way.

**Track stays crossed out, and that is the distinction.** A stationary receiver
has a groundspeed of zero, but it has no direction of travel at all — there is
no true value to report, not merely one below the noise. Zero speed is a
measurement; zero track is a category error.

### A wiggle is not a climb — ZUPT

The vertical-speed integrator had no **zero-velocity update**, which is what
every inertial system does about exactly this. A wiggle is bounded oscillation
with no net displacement, but an integrator cannot tell it from the start of a
climb, so a shaken desk accrued vertical speed until it tripped the runaway
bound and crossed itself out. That is the X Noah saw.

The fix is not a better integrator. It is to use the independent evidence that
the device is not translating: the attitude filter ALREADY detects stillness
from gyro rate and gravity magnitude, and that detection was sitting there
unused by the VSI. When it says still, vertical velocity **is** zero and the
integrator is told so. Same correction a pedestrian dead-reckoning system
applies at every footfall; a parked aeroplane gets it too and correctly reads
zero rather than drifting.

The stationary path deliberately does **not** consult GPS altitude. The evidence
for "not moving" is the motion sensors, and a fix that stopped arriving cannot
make a stationary device's vertical speed unknown — inheriting that fix's
provenance is what crossed the instrument out indoors.

### Verified

**160 unit tests, 22/22 planted faults caught, both palettes clear.** Two new
plants, one per direction: groundspeed going back to failing instead of reading
zero, and the zero-velocity update no longer being applied.

---

## 0.4.5 — the diagnostics report crashed on exactly the device that needed it

Found while writing the report's first test. It had none, which is how a tool
used to diagnose everything else went eight releases without being diagnosed.

**A device that never got a position fix got no report at all.** The rounding
that keeps a pasted report from carrying a precise location was guarded like
this:

```js
if (!precisePosition && (p === 'position.lat' || …) && field?.provenance !== 'FAIL') {
  value = String(coarse(field.value));
}
```

An unwritten field is `undefined`. `undefined?.provenance` is `undefined`, and
`undefined !== 'FAIL'` is **true** — so it took the rounding path on a field that
did not exist and threw on `field.value`, taking the whole report down. The
optional chain reads as a guard and is the opposite of one: it converts "no
field" into "a field that is not failing".

The device with no position fix is precisely the device somebody presses the
version stamp on. This is a candidate for "touching the version number does
nothing", reported on the iPad at 0.4.1 and then attributed entirely to the
stale worker.

The same shape twice more in the attitude block: `att.pitch === null ? … :
att.pitch.toFixed(2)` throws on `undefined`, which is what a half-dead filter
returns. All of them now go through `Number.isFinite`.

### The negative coasting was never a clock mismatch

Every report Noah has sent showed `coasting -9ms`, `-21ms`, `-34ms`. 0.4.3
attributed that to two clocks and made the app use one — a real fix for a real
problem, and **it did not fix this**, which the next report proved by still
saying `-11ms`.

The actual cause: `buildReport` read the LIVE filter at `snapshot.t`, the
timestamp of the last publish. The store publishes at 25 Hz, so that stamp is up
to a frame old when somebody presses the stamp, and the filter has gone on
accepting samples in the meantime. Then "now minus last accepted sample" ran
backwards.

Field ages are still measured against the snapshot, because that is when those
values were true. The filter is not a field — it is live, and it is now read at
the moment the report is asked for.

**The lesson is about the diagnosis, not the bug.** "Both timestamps are epoch
milliseconds and one is negative" had two candidate causes, and the first one
checked was plausible, real, and wrong. It was closed on plausibility rather
than on the number going away, and the number did not go away.

### Verified

**150 unit tests, 20/20 planted faults caught, both palettes clear.**

### FLAKY, and it is recorded rather than left to be rediscovered

The accessibility gate failed once, on `power-gate: PANEL POWER button measured
3.52:1 against the real backdrop (floor 4.6)`, and passed on both re-runs and on
a direct run. Nothing in this change touches that button. The check composites
the control against what is actually painted behind it, so the likely cause is
that it measures before the backdrop has finished painting.

**A gate that fails at random is worse than one that is merely absent**, because
a random red trains the reader to re-run until green — which is exactly how a
real red gets waved through. Not fixed here, and not to be dismissed as noise
next session.

---

## 0.4.4 — the iPad was stuck on 0.4.1, and it was never going to unstick itself

Noah's iPad reported `v0.4.1` and `service worker controlled (fauxplane-0.4.1)`
after two green deploys of 0.4.2 and 0.4.3. Both deploy runs succeeded, and the
"Deploy to Cloudflare Pages" step ran in each — this was not a deploy that
failed, it was a device that could not be reached.

### The loop, which was permanent and not a delay

`sw.js` reads its own version out of its registration URL (`/sw.js?v=0.4.3`) so
the version is typed in exactly one place, per Doctrine §7b. The cost of that,
invisible until now, is that **`public/sw.js` is byte-identical from one release
to the next** — confirmed: the file had not changed since 0.4.1.

A browser decides whether to replace a service worker by re-fetching the
registered script and **comparing bytes**. Identical bytes mean no update. Ever.

So the only thing that could ever register the new URL was `app.js` — and
`app.js` is served by the running worker, cache-first, out of its own release's
cache. The old worker served the old `app.js`, which asked for the old worker,
which served the old `app.js`.

Worth being precise about what this was NOT: not a propagation delay, not a CDN
cache, not iOS being slow to update a PWA. Waiting would never have fixed it.

**The 0.3.0 fix is what closed the loop.** Serving from `caches.match()` used to
search every cache on the origin, so a new `index.html` would arrive with old
modules mixed in — the bug where the page ran old code and showed the old stamp.
Scoping the lookup to the running worker's own cache fixed the mixing and, in
doing so, sealed the only crack new code had been getting through. A correct fix
to a real bug is what made this one total.

### One request escapes a cache-first worker

Navigations. `sw.js` has always handled `request.mode === 'navigate'`
network-first, so `index.html` reaches a stuck device on every load. That is the
entire repair channel, and anything that unsticks a device has to be reachable
from it.

Hence `public/boot.js`, loaded from `index.html` ahead of the app. It is a new
path, so no previous release's cache can hold a copy of it. It asks the network
what the current version is — on `/src/core/version.js?boot=<n>`, a URL no
cache can match, so the request goes through the very worker that is refusing to
let anything new through — and if the caches on the device belong to some other
release, it unregisters the worker, deletes those caches and reloads once. The
reloaded page is uncontrolled, so `app.js` comes from the network and registers
the new worker itself.

The CSP made this cleaner rather than harder: `script-src 'self'` forbids inline
script, so the escape hatch had to be its own file, which is exactly what makes
it invisible to old caches.

### The dangerous direction is the false positive

This code can force a reload, so a version of it that fires when it should not
is a **reload loop** — worse than the stale panel it fixes. The decision is a
pure function with the empty cases tested harder than the acting one: a first
visit does nothing, the current release does nothing, a worker part-way through
installing does nothing (both caches exist between install and activate, and
tearing down there would interrupt the fix in progress), another app's caches on
the same origin are never touched, and an unreadable version — the offline case
— does nothing. A session-scoped guard keyed to the version means a reset that
does not take leaves the reader on a working older panel instead of spinning.

Two plants cover it, one per direction: loosening the condition so it fires when
it should not, and gutting it so a genuinely stuck device is no longer detected.

### The plant gate was running fewer tests than `npm test`

`plant.mjs` held a hand-written list of five test-file names. Adding
`boot.test.mjs` did not add it to that list, so the gate the plants are checked
against would have silently skipped the tests covering the new work — a gate
that runs a subset of the suite will bless a fault the suite would have caught.
It now reads `scripts/` from disk and filters on the `.test.mjs` suffix. Filters,
rather than being handed the directory, because `node --test scripts/` once swept
in every non-test script in there and ran it as a test.

That is the second hand-maintained list to go stale in this repo in one session,
after the plant anchored to a line that got rewritten. Both had the same shape:
a list that has to be updated by someone who remembers it exists.

### Verified

**144 unit tests, 19/19 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.**

### NOT verified

- **The repair itself cannot be tested from here.** It needs a device holding a
  real older worker against a real deploy — the sandbox has no persistent
  service worker and the proxy blocks the deployed origin. The decision function
  is unit-tested against the exact cache names Noah's iPad reported, and the
  wiring is exercised by the accessibility gate, but the end-to-end unstick is
  confirmed only when a stuck device loads it.
- Android and desktop in landscape, still.
- No live adsb.fi response body has ever been seen from this sandbox.

---

## 0.4.2 / 0.4.3 — the iPad roll defect, FOUND, and it was two bugs

Noah's iPad read roll about ninety degrees out **in both orientations**, which
is what ruled out the obvious cause: a missing screen rotation would be right in
portrait and wrong only in landscape.

The diagnostics report added in 0.4.1 answered it in one paste. Held in
landscape it said, all at once:

```
screen.orientation.angle   0                   "not rotated"
screen.orientation.type    landscape-primary
window.orientation         90                  "rotated a quarter turn"
screen                     820 x 1180          natural shape is PORTRAIT
viewport                   1180 x 688          currently LANDSCAPE
accelerationIncludingGravity  x -6.887  y -0.351  z -8.936
```

### Bug one: the app believed the wrong API

Everything except `screen.orientation.angle` agreed the device was turned.
Safari 26.5 on that iPad reports `angle` 0 in landscape. The app preferred
`angle` and fell back to `window.orientation` only if it was absent — so the
fallback, which was the one telling the truth, was never reached.

**The rule is now deliberately narrow: where `window.orientation` exists, prefer
it.** That property is iOS-only — Android Chrome and every desktop removed it
years ago — so this reads as "on iOS use the iOS answer, and the standard one
everywhere else", which is exactly as far as the evidence goes.

**What was tried and discarded:** deriving the angle by comparing the viewport
against `screen`'s natural shape. It looks more principled and is not. iOS keeps
`screen` at the natural dimensions while Android swaps it with the current
orientation, so the identical comparison means opposite things on the two
platforms. Building a cross-platform theory out of one device's report is the
guess this whole exercise existed to avoid. The report now prints WHICH source
won, so the next device either confirms the rule or widens it on evidence.

### Bug two: the rotation was applied backwards, and had been for two releases

With the true angle of 90 the horizon was still wrong — 177 degrees of roll
instead of 89. The screen rotation had the wrong sign.

**Nothing could see it.** Every device tested had been in PORTRAIT, where the
angle is zero and the rotation is the identity whichever way round it goes. And
the test that should have caught it could not: `screenToDevice` was written as
the exact inverse of the rotation inside `attitudeFromGravity`, so the round-trip
test asserted the two agreed with **each other** while both disagreed with the
world. That is the same structural blindness as the degree-1 magnetic tests,
which passed while the Schmidt normalisation was wrong at every degree above
one, and it is now the third time this repo has been bitten by a
self-consistency test standing in for a correctness one.

Worked from Noah's own raw axes: earth-up in device coordinates
(0.610, 0.031, 0.792) at a reported angle of 90.

- **The app as shipped (angle 0)** — pitch −52.3, roll **−87.1**. Reproduces the
  fault.
- **True angle, old sign** — pitch −52.3, roll −177.1.
- **True angle, corrected sign** — pitch −52.3, roll **+2.9**. An iPad held
  square.

The sign flip carried into three other places that had to move with it —
`screenToDevice`, `applyScreenAngle`, the gyro's rate vector, and the gyro
zero-offset's projection back onto the device axes. All four were derived, not
guessed, and the landscape fixtures in the test suite changed sign with them.

**The tests are now pinned to the measured device**, not to self-consistency:
the old behaviour must still reproduce roll beyond 80 degrees, and the fixed
behaviour must put an iPad held square inside 8 degrees of level. Both halves
are planted against.

### CONFIRMED on two devices, both orientations

Three more reports arrived and they isolate the two bugs cleanly, which is
better evidence than either alone would have been.

**`screen.orientation.angle` on that iPad is exactly 90 degrees out in BOTH
orientations**, and `window.orientation` is right in both:

- **iPad portrait** — `angle` **90**, type portrait-primary, `window.orientation`
  0. Truth: 0.
- **iPad landscape** — `angle` **0**, type landscape-primary,
  `window.orientation` 90. Truth: 90.
- **iPhone portrait** — `angle` 0, type portrait-primary, `window.orientation`
  0. Truth: 0.
- **iPhone landscape** — `angle` 90, type landscape-primary,
  `window.orientation` 90. Truth: 90.

That is why the iPad was ninety out in both orientations, and it confirms the
rule: on iOS, `window.orientation` told the truth on both devices in all four
positions.

**And two of the reports isolate one bug each**, which is what makes this
convincing rather than merely consistent:

- **iPad PORTRAIT** — the true angle is 0, where the rotation is the identity
  and the sign cannot matter. It was wrong purely because the app used the
  lying `angle` of 90. Bug one alone.
- **iPhone LANDSCAPE** — all three sources agreed on 90, so the angle was
  right. It read roll −145 anyway. Bug two alone.

Checked against every one of the four raw vectors:

- **iPad portrait** — app reported −90.8; with both fixes **−5.5**.
- **iPad landscape** — app reported −89.0; with both fixes **+2.9**.
- **iPad landscape, second report** — app reported −88.6; with both fixes
  **+3.1**.
- **iPhone portrait** — app reported −0.9; with both fixes −0.9, unchanged
  because it was already right.
- **iPhone landscape** — app reported −145.5; with both fixes **+2.1**.

All five are now a **table-driven test** in `fusion.test.mjs`, asserting each
solves to under ten degrees of roll. They are kept as a table rather than folded
into one representative case because their value is that they came off real
hardware: none of these vectors was constructed to pass, and four of the five
are numbers the app itself got wrong.

That test also exists because of *how* the sign bug survived two releases. There
WAS a round-trip test over the rotation, and it passed throughout — it asserted
that `screenToDevice` was the exact inverse of `attitudeFromGravity`'s rotation,
which stayed true when both were flipped together. **A test that checks two
functions against each other cannot see an error they share.** The fix for that
class of blindness is not a better round-trip; it is one measurement from
outside the system.

Still unverified: Android and desktop, in landscape. The report names which
angle source it used, so the first such report either confirms the rule or
widens it on evidence.

### Three more defects the same reports exposed

**1. The gyro zero-offset integrator had no anti-windup.** Noah's iPhone
reported `alpha -10.00 deg/s` — dead on the clamp — and the iPad `gamma -9.19`.
A real gyroscope offset is a degree or two. What those numbers actually were is
the integrator eating a fifty-degree residual caused by the mis-signed rotation:
an integrator handed a large PERSISTENT error reads it as a large constant
offset, which is exactly what it is designed to do and exactly wrong here.

Fixed with the standard gate: the integrator does not learn from a residual it
cannot explain (`biasGateDeg`, ten degrees). It costs nothing, because the
proportional term pulls a diverged filter back inside that in about a second,
and a genuine offset produces a standing residual well under one degree. Tested
both ways — it must refuse the fake and must still learn the real one.

**2. The VSI could reach 344,570 fpm, and now cannot.** The cause was the
attitude bug downstream, and the exact path is worth recording because it was
not obvious: a GPS fix arrives, then stops for a while — routine indoors. The
FIELD stays LIVE for its full sixty-second window so the gauge keeps answering,
but `updateAltitude` is never called, so nothing corrects the integrator. With
the "vertical" accelerometer reading a horizontal axis it was being fed a full
g, and the rate climbed without bound.

The cause is fixed, but an instrument that CAN display three hundred thousand
feet per minute should not, whatever is feeding it. Past 20,000 fpm the reading
is refused AND the filter is reset — refusing without resetting would leave the
integrator sitting at the runaway value and cross the instrument out for ever.
Twenty thousand is far beyond an airliner's four and this app's own six-thousand
full scale, so nothing real is refused.

**3. Two clocks, disagreeing by milliseconds.** Every report showed a NEGATIVE
coasting time (`-9ms`, `-21ms`, `-34ms`). The store ages fields against
`performance.timeOrigin + performance.now()`; the sensors were being handed
`Date.now()`. Both are epoch milliseconds and they agree to within a few — but
they are not the same clock, so a reading could be stamped just AFTER the
publish that measured its age. A negative age is a small lie about a timestamp,
in an app whose whole contract is timestamps. One clock now, the store's.

### Verified

**136 unit tests, 17/17 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.** Two of the seventeen plants are new and guard this release
specifically: one puts the screen angle back on the lying API, the other applies
the rotation backwards again. Both are checked against the UNIT suite, not the
accessibility gate — a headless browser has no accelerometer, so the gate is
structurally blind to the entire class of bug this release is about and would
have stayed green through both.

**One plant had silently stopped working, and that is worth recording.** The
plant proving the gyro zero-offset keeps being learned was anchored to the line
`const ki = cfg.biasKi * …`. Adding the anti-windup gate above rewrote that line,
so the plant no longer matched anything — the app was no worse, but the evidence
was gone. It surfaced as `UNPROVEN … this script has gone stale` and dropped the
run to 16/17. Re-anchored and re-run green. The harness reporting an unmatchable
plant as a LOUD FAILURE rather than skipping it is the only reason this was seen
at all; a harness that skipped would have printed a clean 16/16.

### NOT verified

- **Android and desktop in landscape.** The rotation sign was wrong on every
  platform, and only the fact that every device tested was in portrait hid it.
  iOS is now confirmed in both orientations on two devices; nothing else is.
- **No adsb.fi response body has ever been seen from this sandbox.** The field
  mapping in `data/traffic.js` is written from their published schema and
  exercised against a fixture, not against a live reply.

---

## 0.4.0 — levelling the panel to whatever it is mounted in

Noah: *"Begin working on the capability of calibrating the horizon to match a
cell phone holder in a car so someone can use it when they're driving."*

**This has a name and a standard procedure, and it is not a new idea.** It is
BORESIGHT CALIBRATION — what every installed attitude reference does. A Garmin
G5 calls it Pitch/Roll Offset; a Dynon calls it Level Calibration. Put the
vehicle somewhere level, hold still, press a button, and the unit records the
rotation between its own case and the vehicle. A phone cradle is the same
problem with a worse mount: cradles sit a phone back ten to thirty degrees and
are rarely square.

**Nothing is invented by it.** The reading is still entirely the
accelerometer's. What changes is which direction the instrument has been told to
call level — the same category of thing as a Kollsman setting, and it is
displayed for the same reason.

### It is a ROTATION, not a subtraction, and that is the whole implementation

The obvious approach — remember the offending pitch and roll, subtract them from
every later reading — is wrong, and wrong in a way that looks fine. Euler angles
do not compose additively once more than one is non-zero. A cradle 20 degrees
nose-up AND 15 degrees rolled is not "subtract 20 from pitch, subtract 15 from
roll"; that is exact only when one of the two is zero, and a phone cradle is
precisely the case where neither is.

So the reference gravity vector is captured and the MINIMAL rotation carrying it
onto level is derived (Rodrigues). `scripts/fusion.test.mjs` asserts both halves:
that the rotation is exact at every attitude tested, and that **the naive
subtraction is measurably wrong on the same input** — if that second assertion
ever stops failing, the test has stopped proving anything and says so.

**Applied at the INPUT**, to the gravity vector and to the rotation-rate vector
alike, so the whole filter runs in the vehicle's frame. Correcting the output
instead would leave the gyro integrating in one frame while the accelerometer
corrected in another — the same standoff the zero-offset work removed.

**The rotation is minimal, and that has a consequence worth stating.** Aligning
one vector to another leaves rotation about the vector itself unconstrained:
gravity says which way is DOWN and nothing whatever about which way is FORWARD.
Inventing a yaw there would be inventing data. So levelling fixes pitch and
roll, and a phone sitting twisted in its cradle keeps twisted pitch and roll
axes. The setup page says exactly that.

### It refuses a bad reference

The capture is declined unless the filter reports the device genuinely STILL.
A calibration taken while moving bakes the movement into every subsequent
reading, and the failure is invisible — the horizon looks perfect and is wrong
for ever. Refusing costs a second; a silently bad zero does not announce itself.

It reads the FILTER's settled attitude rather than one raw accelerometer sample,
because the filter has already rejected manoeuvring samples and removed the
gyro's zero-offset. Pressing twice composes rather than discards, so a small
touch-up does not throw the first calibration away.

### What a car does that an aircraft does not

**Sustained longitudinal acceleration reads as pitch, and there is no fixing
it.** An accelerometer cannot tell braking from tilting — both press you into
the seat the same way. Braking at a third of a g reads like nineteen degrees of
nose-up. The manoeuvring gate already rejects the strongest of those and coasts
on the gyroscope, saying so while it does, which is the correct behaviour and
will fire constantly in traffic. Steady acceleration still leans the horizon.

That is on the SETUP page in plain words, in the caution amber, rather than
being merely true. The page also says what the thing is for: an instrument for a
passenger to enjoy, not something to drive by.

### Where it is visible

An instrument whose zero has been MOVED has to say so, and it says so in four
places: a `LVL +18° −3°` tag on the ADI itself, the state on the SETUP page, a
BITE row under Sensors, and a line in the diagnostics report. A horizon reading
level at an attitude the device is not at, with nothing saying why, would be the
most plausible-looking wrong instrument this app could ship.

**Persisted on the device** and re-applied at boot, so a cradle that has not
moved does not need re-levelling after a reload. Stored as the measured GRAVITY
REFERENCE rather than the derived rotation: the reference is the observation,
the rotation is a consequence, and a later change to the maths then needs no
migration. If the screen orientation differs from the one it was captured in,
the offset is **kept but not applied**, and every one of those four places says
so — a calibration taken in portrait says nothing about the same phone lying in
a landscape cradle.

### What the gate caught

Adding a fifth tab put five targets at the 44px floor into one row, and at 200%
text on a 390px phone that wrapped to three rows and left the panel **48 pixels
tall**. The fix is not to shrink the tabs below the target floor — it is to let
the document scroll at narrow widths, because a reader at 200% text genuinely
has a large header and crushing the instruments is the wrong trade.

---

## 0.3.1 — diagnostics, and what checking the standards changed

Noah, plainly: *"ARE YOU LOOKING FOR INDUSTRY STANDARDS OR JUST DOING A
GUESS-AND-CHECK?"* and *"create a debug info page or overlay ... so I stop
screenshotting like a fucking tool."*

Both were fair. The honest split at the time: **standards for the physics,
invention for the presentation.**

### Where it WAS a standard (and this is checkable)

- The attitude filter is a **Mahony PI complementary filter** — the standard
  low-cost AHRS approach. Estimating gyro bias AS THE INTEGRAL TERM is the
  textbook method.
- `Ki` was chosen by computing the loop damping ratio, ζ = Kp·f / 2√(Ki·f) = 1.0
  at 50 Hz, critically damped. Not by trying numbers until a test passed.
- **Static alignment** on a stationary IMU is what every AHRS does on the ramp.
- `tan(bank) = V·ω/g` and `n = 1/cos(bank)` are textbook coordinated-turn
  relations.
- WMM 2025 and EGM96 held to NOAA's own 213-row published test table.
- WCAG 2.2, including SC 2.5.3 and SC 2.5.8, measured by the gate.

### Where it was NOT, and what checking changed

The **display** conventions were reasoned, not referenced. Checking took ten
minutes and contradicted something already built.

**A real EFIS clears the ENTIRE artificial horizon when attitude is lost.** No
transport aircraft draws bank without pitch. That is the opposite of the
bank-only ADI added in 0.3.0.

Kept anyway, but **relabelled in the code as a knowing departure**, because the
standard does not decide this case: a certified AHRS gives both angles or
neither, so "a measured bank and no pitch source in existence" is not a failure
mode the convention was written against. It is simply what an ADS-B broadcast
is. And it is guarded against the hazard the convention protects — a partial
ball being misread as a whole one — by removing BOTH the sky/ground split and
the pitch ladder, so there is no horizon on it to misread.

**The colour standard is specific, and one thing was wrong.** RED is reserved
for a condition needing immediate action; AMBER for one the crew should be aware
of. A usable-but-degraded parameter is the amber case exactly — it is the same
channel a real PFD uses for CHECK ATT over a horizon it is still drawing. The
"gravity reference only — gyro settling" caption was being drawn in the cyan
DERIVED tone, which says nothing about severity. **It is amber now.**

Not read directly: `faa.gov` and `skybrary.aero` are both blocked from the build
sandbox at the CONNECT layer, so AC 25-11B itself was NOT opened. The findings
above come from search summaries and manufacturer documentation, which is weaker
than the publisher's own text and is recorded as such rather than rounded up.

### The diagnostics report — one tap on the version stamp

Every defect this app has had was found by photographing a phone. That channel
loses the reason strings, cannot show a field that is off screen, cannot show
the filter's internals at all, and makes Noah do OCR for me.

Pressing the version stamp now produces the whole state as text, with **Copy**,
**Share** and **Save as file**. What makes it worth more than a dump:

- **The first lines are the diagnosis**, and root causes are separated from what
  they knocked over. A derived field names the inputs it is missing, so its
  reason contains "unavailable (" — that makes it a consequence. In the
  all-permissions-denied state that collapses 38 failures to 3 real ones.
- **The attitude filter's internals**: quality, residual, accepted samples,
  coasting, the learned gyro zero-offset per axis, and which accelerometer
  convention was detected.
- **Console errors captured from BOOT**, by wrapping `console.error` at module
  load rather than inside `boot()` — "the panel failed to start" is exactly the
  case worth capturing, and `boot()` may never run.
- **Position rounded to ~1 km by default**, with a tick box for the exact fix,
  because a report built to be pasted should not carry a precise location by
  accident. The report says which mode it is in.

The stamp became a **button**, which is a better reading of Doctrine §7b than
its literal text: the rule wants the version pasteable rather than transcribed,
and this yields the version *and everything else* as selectable text. Its
accessible name is built from the same constant as its visible text, because
**SC 2.5.3 (Label in Name)** requires the name to contain the label — the gate
caught that violation the moment the button was added.

### What the gate caught in the new work, immediately

Three real defects, none visible by looking:
1. **SC 2.5.3**: the stamp showed "v0.3.0" while its accessible name said "Build
   version" — someone driving the panel by voice could not address it.
2. **SC 2.5.8**: the "include exact position" checkbox was 22x22.
3. **Two controls answering to the accessible name "close"** — ambiguous for
   voice control. The bottom one is "Close diagnostics" now.

The gate now opens the diagnostics dialog and checks it in every
viewport/palette combination, and asserts the report actually leads with the
diagnosis. A surface nobody checks open is a surface nobody has checked.

---

## 0.3.0 — the horizon works, and there is a radar page

Noah's 0.2.4 screenshot showed the panel he did not want: `ATT FAIL` and
`HDG FAIL` crossed out across the middle, "converging (residual 14.8 deg)", and
the two flanking tapes plus the VSI red. His instruction: *"I want something
other than red X panels to show him. Even the ground/air center one is
inconsistent and slow to load if it ever does."*

Three things came out of that, and the first is a real defect.

### 1. THE HORIZON WAS BEING WITHHELD, NOT MISSING

The filter published NO attitude at all until a smoothed residual held under two
degrees for 1.5 s. On his device that residual sat at 14.8 and stayed there, so
the horizon never appeared — and the panel said "converging" for as long as
anyone cared to watch.

**Two separate mistakes, and they compound.**

**A gyroscope reads a degree or two per second while sitting perfectly still.**
Integrated, that is drift the accelerometer has to keep dragging back, and the
two halves of the filter settle into a standoff at
`residual = offset / (rate x (1 - alpha))` and simply stay there. Nothing about
that converges, ever. The fix is the integral term of a PI complementary filter
(Mahony): the accelerometer residual is evidence about the RATE, not only about
the angle, so accumulating it recovers the offset — in about four seconds,
in motion or at rest. `Ki` rides the proportional gain so the loop keeps its
shape under both.

**And convergence was being used as an EXISTENCE test when it is a QUALITY
test.** Gravity alone is a real measurement of which way is down — that is the
entire basis of a pendulous attitude reference, and on a device sitting still it
is not an approximation, it is exact. The panel knew its own attitude to a
fraction of a degree and refused to draw it. Attitude now publishes on the first
good gravity sample and carries its caveat as a caption on the horizon
(`gravity reference only — gyro settling`), which is what the provenance system
was for in the first place.

Also: **static alignment**, which is what every real AHRS does on the ramp. Held
still (gyro quiet AND accelerometer at a steady 1 g — both, because a steady
turn passes the second test and freefall passes the first), the filter is pulled
onto gravity hard instead of creeping at 2% a sample. The design case for this
app is a device CLAMPED ON A DESK, so the still case is the common one.

And **the compass now fails separately from the accelerometer.** Heading used to
ride the accelerometer's freshness, so a device with a working magnetometer and
a sulking accelerometer crossed out a heading it genuinely had.

### 2. A RADAR PAGE, ON adsb.fi

**Their terms were read in full first** (github.com/adsbfi/opendata), which the
previous session had recorded as the outstanding blocker:

> "adsb.fi open data is for personal, non-commercial use only. You may not
> license, sell, rent, or lease any part of the data or the service... You must
> cite adsb.fi and include a link to our home page."

Personal and non-commercial matches this app's own PolyForm Noncommercial
licence exactly. **The citation is a REQUIREMENT and is now enforced by the
accessibility gate and by a planted fault** — a licence condition nobody watches
lapses in the next tidy-up.

Published limit is **1 request/second**, and 400s and 404s count against it. So
every parameter is validated in the Function BEFORE anything is sent, and the
edge cache (8 s by area, 5 s by callsign) is what the panel's refresh actually
hits. The plan view is fetched only while the radar page is the one being
looked at.

`/api/traffic` **no longer needs any credential at all** — the OAuth chain, the
KV namespace and the two unset OpenSky secrets are gone. It answers by area
(`/v3/lat/lon/dist`), by callsign (`/v2/callsign`) and by Mode-S hex.

**The position sent upstream is deliberately coarse.** A radius query needs a
centre, so unlike the METAR path this one cannot keep the fix on the device. It
is quantised to a tenth of a degree — about six nautical miles — which is
uninformative about a person and, not by coincidence, makes everyone within the
same six miles share one cache entry. Range and bearing are then computed ON THE
DEVICE from the precise fix, so the display is not degraded by the privacy
measure.

### 3. FOLLOW — a real flight drives the panel

Type a flight number, or tap an aircraft on the radar, and the panel shows what
that aircraft is broadcasting. **This is not a synthetic data path**: every value
came off a real transponder, was heard by a real receiver, and arrived through a
fetch — the same category as a METAR. It is an observation of an aircraft, not a
simulation of one.

What matters more is **what it refuses to write**, each FAILing with its reason
on screen:

- **pitch** — ADS-B carries no attitude. Flight path angle is not pitch.
- **slip / skid** — not broadcast, and coordinated flight is the assumption the
  bank was derived FROM.
- **TAS / CAS** — need winds aloft where the AIRCRAFT is, not where this device
  is.
- **indicated altitude** — the Kollsman setting is a local station's.

And what it honestly derives: **bank** from `tan(bank) = V·ω/g` with ω the rate of
change of the broadcast track, **load factor** from `n = 1/cos(bank)`, and the
**rate of turn** from two successive tracks. Both derivations state the
coordinated-flight assumption on the field itself.

**The ADI now degrades instead of dying.** Bank without pitch is a real partial
instrument — a real EFIS removes the element it has lost and keeps the rest — so
the roll scale, pointer, aircraft symbol and turn needle stay, the sky/ground
split and pitch ladder (both of which state where the horizon is) go, and the
middle says `NO PITCH` with the reason. Crossing out a measured bank to keep a
tidier rule would have been the wrong trade.

**The heading tape got the altitude tape's ladder treatment.** It shows HDG
(magnetic) or TRK (ground track) and its label says which — they differ by the
drift angle, routinely ten degrees or more, and most aircraft broadcast a track
and no heading at all.

A standing FOLLOW banner sits on the PFD the whole time with the exit beside it
(Doctrine §3), because a panel showing somebody else's aeroplane must say so
where the numbers are.

### What this cost to get right — four bugs the previews caught

None of these were visible to any test; all four came from actually looking at
`node scripts/preview.mjs` output.

1. **The follow banner became a third flex column**, taking a third of the width
   as empty space and squeezing the horizon into a strip.
2. **Fixing that with `flex-wrap` broke the height instead.** A wrapped line
   sizes to its tallest item, and the readouts are ~1000px of content, so the
   canvas stretched to match and the horizon went below the fold. The answer was
   a nested row, which is one flex item with a definite height.
3. **`hidden` stopped hiding.** An author `display: flex` on `.follow-banner`
   outranks the user agent's `[hidden] { display: none }`, so the banner showed
   with an empty label on every page that was not following anything. Any rule
   that sets `display` on an element the code toggles with `hidden` needs a
   `[hidden]` companion.
4. **A second `publishNow()` destroyed the scene it was meant to redraw**,
   because every publish runs the app's own derived subscriber.

### Two the new tests found immediately

**Exactly one source must own a field, and two were writing.** The device's
geolocation and motion sensors kept writing position, groundspeed, altitude,
load factor and turn rate while FOLLOW was writing the same fields from the
aircraft. Both would land, at different rates — geolocation on its own schedule,
the follow source at 25 Hz — so the panel would have shown whichever was most
recent, alternating between a desk in Cameron Park and a 737 over the Sierra
several times a second. Every sensor now takes an `owns` predicate and stops
WRITING (never stops running: the attitude filter and the VSI stay fed, so both
are already settled when the reader stops following).



**A derived value was claiming to be more certain than its own input.** The turn
rate is a SENSOR field in the registry — on this device it comes from the gyro —
so when FOLLOW filled it by differencing two broadcast ground tracks, the store
labelled it LIVE. The bank angle *derived from it* was correctly labelled
DERIVED. That inverts `worstOf`'s whole principle.

`write()` gained a `derived` flag, sticky through ageing exactly like
`forcedStale`. The registry's `kind` says what a field NORMALLY is; the flag says
what THIS value actually is. It can only ever weaken a claim — there is no
option that strengthens one, and there should never be.

### And one the harness itself had

**Two `plant.mjs` runs overlapped.** The second read a file the first had already
planted, kept that as its "original", and faithfully restored the planted fault
into the working tree — leaving a broken BITE page that every gate then passed,
because the plant it came from had been retired. It surfaced only as a STALE
plant on the next run. A harness whose whole purpose is to leave the tree as it
found it now takes a pid lock and refuses to run twice at once.

`plant.mjs` also gained a **second gate**. It only ever ran the accessibility
gate, and a headless browser has no accelerometer — so it is structurally blind
to every attitude bug, including the one this release is about. Sensor-logic
plants now run against the unit suite instead.

### Verified

**125 unit tests, 15/15 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 4 pages, both palettes clearing every hard
floor.** The radar page is in the gate against a response fixture, so the plan
view is checked WITH aircraft on it rather than empty.

### NOT verified — and this is the honest list

- **No adsb.fi response has ever been seen.** Their host is blocked from the
  build sandbox (`000` to CONNECT); the Pages Function runs on Cloudflare, which
  is not, so it should work in production — but the field mapping was written
  from the published ADSBexchange-v2 schema and NOT against a live body. This is
  the same class of risk as the METAR mapping in 0.2.0, which turned out to be
  right. **The tell is the RADAR page:** aircraft with sensible callsigns,
  altitudes and distances means the mapping is right; an empty list with the
  reason "adsb.fi returned a body with no aircraft array" means a field name is
  wrong.
- Whether the horizon actually settles on Noah's device, and how big its gyro's
  zero-offset turns out to be. **BITE now prints it** — Sensors → Gyroscope
  zero-offset.
- Whether FOLLOW finds a flight. Needs a real callsign of an aircraft that is
  airborne and being heard right now.

---

## 1.13.3 — a 429 on the FIRST request, 2026-08-03

Noah's report, panel up 36 s, one traffic request made:

> `traffic  FAILED — adsb.lol rate limited us (HTTP 429) | adsb.fi returned
> HTTP 403 — server: cloudflare; ray a25790806923af1b-SJC`

**ONE request. That settles it.** 1.9.0's pacing fix was real and necessary — the
edge cache genuinely never worked — but it cannot be the cause here and neither
can any future pacing change. A single request at boot is refused. The allowance
was already spent before this app asked for anything, which is exactly what the
shared-egress theory predicted and is now observed rather than argued.

**The 429 handler threw away the instruction.** Doctrine §15.3 says a 429 IS an
instruction, and the instruction lives in `Retry-After` — which this code read
inside `politeFetch` for short waits and then discarded on the way out. So the
panel could say it was rate limited and never how long for, and nobody could
tell "we are asking too often" from "this address is exhausted". Now carried:
`retry-after`, the `x-ratelimit-*` family, and the ray id.

**The backoff IS engaging** — the composed reason still matches the client's
rate-limit test, so each refusal doubles the wait up to two minutes. We are not
adding to their load.

**What is left is not a code change.** Two honest options, both needing someone
who can reach the network:

1. **Ask adsb.lol for an allowance under this app's own identity.** They are
   volunteer-run, the app already identifies itself in its User-Agent with a
   contactable URL (§15.2), and this is the polite route.
2. **A provider that does not blanket-block Cloudflare origins.**
   `airplanes.live` publishes a free community API and is the obvious candidate
   — but its terms are UNREAD, and §15.1 says the published policy is the
   authority before a single request is written. Not to be added until someone
   has read them.

**What is NOT an option**, and stays that way: retrying harder, rotating
providers to dodge a 429, or sending browser-shaped headers to get past
adsb.fi's bot rule (CLAUDE.md, verbatim).

**Still unanswered, for the same reason:** whether any aircraft broadcasts the
autopilot selections. The feed-shape block rides on a SUCCESSFUL response, and
there has not been one from his device yet.

## 1.13.2 — two things Noah's report exposed, 2026-08-03

The report he sent could not answer the question it was built for, and that is
itself the finding.

**`traffic: not asked yet` at nine seconds of uptime.** Opening RADAR re-asks
immediately, but the PFD — which carries a navigation display and is the page a
reader LANDS on — waited out a full fifteen-second interval before its first
fetch. The page that is already open was the one that waited. One `refreshTraffic()`
at boot fixes it, and it costs a single request the reader was expecting anyway.

**"8 of 41 fields failed" on a working panel.** Five had genuinely failed. Three
were `nav.selectedAltitude`, `nav.selectedHeading` and `nav.crewQnh` — the
autopilot readouts added in 1.11.0, which cannot have a value unless an aircraft
is being followed, because this device has no autopilot to read.

**A count that treats "inapplicable" as "broken" teaches the reader to discount
the number**, and this report cannot afford that: it is the instrument used to
diagnose every other instrument. `FIELDS` now carries `onlyWhen: 'following'`
and the report sets those aside under NOT APPLICABLE, excluded from the count.

**The first implementation of that was wrong in the opposite direction** and a
test caught it: it set the fields aside on their declared MODE alone, regardless
of provenance, so a field carrying a real value would have been hidden as "not
applicable". That is the worse failure of the two — the report exists to show
readings, not to suppress them. It now requires the field to be genuinely empty,
and there is a test that fails if a LIVE value is ever hidden this way.

**Still unanswered:** whether any aircraft broadcasts the autopilot selections.
The feed-shape block only prints once traffic has been fetched, which had not
happened when the report was captured. The boot fetch above means the next
report will carry it without anyone having to remember to open RADAR first —
which is the same lesson as §7f: build the check so it runs itself.

## 1.13.1 — the switch annunciates, 2026-08-03

Noah: *"The power button looks like a menu button rather than equipment button.
It hides among the others and draws no attention when it's off. Maybe a
red/green 'LED' on it? What does it look like in a normal jet?"*

**The answer to the last question changed the design.** There is no power button
in an airliner. The nearest equivalents are the battery switch and the IRS mode
selectors on the overhead panel — the IRS being the closer analogue, since that
is what actually brings attitude and nav data alive. Physically they are guarded
toggles or SQUARE BACKLIT PUSHBUTTONS with the legend on the cap.

**And the governing convention is the DARK COCKPIT.** A lit annunciator means
something is NOT normal; a Boeing overhead panel is dark when all is well, and
nothing illuminates to say "OK". So a green power lamp is backwards for a system
switch — what lights is the OFF legend.

That inversion is exactly what was asked for, arrived at from the convention
rather than from taste: the panel being off IS the non-normal state, so off is
the state that annunciates. Switched on, it goes dark and stops competing with
everything around it.

**AMBER, NOT RED** (§4). Red is for a condition needing immediate action; a
panel nobody has switched on yet is crew awareness. `--caution` is a semantic
alias of the one measured amber this palette has, because a flight deck uses ONE
caution colour across every annunciator rather than a different one per system —
which also means no new colour had to be measured.

**Both non-hue channels first, colour second.** The WORD changes (OFF / ON) and
the lit cap changes its fill and its border. It reads correctly in grayscale and
to a colour-blind reader before hue is counted at all. Both states are in the
contrast registry, added in this commit as §4 requires.

## 1.13.0 — the probe, because the sandbox cannot reach the provider, 2026-08-03

Noah: *"If you want to test something, put it in the damn debug screen behind
the version number."* Now Doctrine §7f, and this is the first app to obey it.

**THE THING THAT COULD NOT BE VERIFIED.** 1.11.0 added a readout for what a
followed aircraft's CREW has dialled in — selected altitude, selected heading,
crew altimeter setting — built entirely from adsb.lol's published field names.
No real response had ever been seen. `pages.dev` is refused by this sandbox's
proxy (`connect_rejected`, gateway 403), so it could not be seen from here
either. That is precisely the shape §7f now forbids leaving as a caveat.

**The shape rides on every response, at no cost.** `observeShape()` runs in the
Pages Function, which is THE ONLY PLACE THE RAW PAYLOAD EXISTS — by the time the
client sees an aircraft the field is a number or a null, and "not broadcast",
"always null" and "we spelt the key wrong" are indistinguishable. It reports:

- how many of the sampled aircraft carried each field we make claims about
- every key the provider sent, including ones this app does not read, so a
  field we could be using and are not is visible rather than invisible
- COVERAGE, NOT VALUES. "nav_altitude_mcp on 0 of 34" is the answer, and it
  cannot be inferred from a panel showing a crossed-out row.

**A key present with a null is NOT coverage**, and that is the distinction the
unit suite protects. Counting key presence would have reported healthy coverage
for a field that is always empty — the exact false negative that makes a parser
written from documentation look correct.

**The one-shot probe is separate and deliberate.** The stored result cannot
answer "is it rate limiting us RIGHT NOW, and what is it asking us to wait" —
so one button, ONE request (§15.6), reporting status, timing and any
`Retry-After`. A 429 is an instruction (§15.3) and the instruction lives in a
header no panel can show. It APPENDS to the report rather than replacing it,
because a probe result is only interpretable beside the rest of the state.

**A shadowing bug, caught before it shipped.** Inside the probe handler the JSON
response was named `body` — which is also the `<pre>` the report is written
into. The append would have written the probe onto the JSON object instead of
onto the screen, silently doing nothing. Renamed to `payload`.

## 1.12.0 — the gate becomes a switch, 2026-08-03

Noah: *"Should there just be a 'power' button on the display?"* — after
reporting that *"'Switch the panel on' still takes all attention on the initial
pop-up and reads like 'accept the terms' and even *I* don't read the panel
then."*

**He was right, and the fix was not shorter copy.** A wall of text above a big
primary button is a consent form, and nobody reads a consent form. The panel now
opens AS ITSELF — every sensor-driven instrument crossed out, each saying why —
which makes acceptance criterion 1 the DEFAULT state rather than an escape hatch
someone has to find behind a dialog.

**A press is still required and always will be.** iOS grants motion and
orientation permission only from inside a user gesture. That is the one thing
the dialog existed to satisfy, and a switch satisfies it just as well.

**It is a real two-way switch**, because all four sensors already had `stop()`.
PWR OFF genuinely stops them and the store ages each field to FAIL carrying its
own reason — nothing is faked, "no motion events" becomes true because it IS
true. The state is a WORD, ON or OFF (§4), not a colour.

**It ended up ON THE DISPLAY rather than in the header, and the measurement is
why.** Put in the header first, the right-hand group went 216px to 341px and
wrapped the bar onto two rows on a 740px landscape phone; the panel paid for the
extra row by overlapping its own footer, and the gate caught two targets
overlapping. The header has now been one control away from wrapping three times
— the (i) menu pushed it over, moving the build stamp out bought it back, PWR
pushed it over again, moving PWR onto the display bought it back again. The
short-viewport tab-padding trim is kept as deliberate headroom rather than
removed a second time.

### What replacing a gate cost, and what it found

**The whole `checkPowerGate` suite went.** It tested a modal: two dismiss
controls, one visible in the first frame, one reachable at the very bottom, a
hit test proving nothing sat on top, and that activating it removed the surface.
Every one existed because a gate you cannot leave is the worst failure a gate
has. There is no gate, so there is nothing to leave — and the property they were
all protecting is asserted by `checkDeniedState` already.

**The (i) menu had never been measured, and failed four ways the first time it
was.** Its scroll container was not in the EXPAND list so backdrops could not be
determined at all; the accessibility-statement link was 163x16 against a 44px
floor; two buttons both answered to "Close"; and four source links all answered
to "Terms". The contrast rows MOVED from the gate registry to an info registry
rather than being deleted — deleting them would have quietly removed coverage at
the same moment the content moved somewhere harder to reach.

**A 503 storm appeared, and it was a real consequence.** Pressing a real PWR
switch starts the METAR and winds feeds; the old check pressed DISMISS, so those
feeds never started and never failed. They are stubbed as honest refusals — the
endpoints genuinely are not deployed in the harness — rather than as invented
weather, which would put a synthetic altimeter setting into a panel whose whole
contract forbids one.

**Two plants went stale and had to be re-anchored — the second time in one
session.** `radar: a failed refresh empties the plan view` lost its anchor to the
single-radius change, and `first run: power-on throws the instructions away` was
anchored to a gate that no longer exists. Both reported UNPROVEN rather than
failing, which is the harness working: **a plant whose anchor has drifted proves
nothing while still looking like coverage.** Re-anchored and each watched going
red individually, along with the new power-switch plant. 33/35 on the full run,
35/35 after.

## 1.11.0 — the panel denied a levelling it was applying, 2026-08-03

Noah: *"On reload, the app lies and says level is not set when it is actually
using a previously stored level."* His diagnostics and the ADI badge both said
`cradle -46.0 deg pitch, 3.2 deg roll — being subtracted from every reading`
and `LVL -46 +3`. The line under the horizon said *"Not levelled — the horizon
shows the device's own angle."* Three surfaces, one truth, one of them wrong.

**TWO FAULTS, and the second is the one worth carrying forward.**

The first is timing: a stored calibration is re-applied AFTER boot, and the PFD
wrote its line once, at boot, before the offset existed. Nothing ever looked
again. It is re-derived on every publish now, which also means rotating the
device updates the sentence — a calibration captured at another screen angle no
longer applies, and that is a third state the old code could not express.

The second is the shape of the writer. It wrote text ONLY in the not-levelled
branch:

    if (!applied && !levelStatus.dataset.tone) { levelStatus.textContent = '...' }

**A branch that produces nothing in one state leaves the previous state's
sentence on screen.** That is how a panel ends up asserting something it knows
to be false — not by computing a wrong answer, but by declining to compute one
and inheriting an old one. Every state writes its own sentence now, and a test
asserts all three are distinct and non-empty.

**One description, three readers.** SETUP already computed this correctly and
recomputed it every render; the PFD had a second implementation that handled one
case. `describeLevelling()` is exported from setup.js and both use it. The
comment on the PFD version literally said *"Mirror setup's own wording rather
than inventing a second vocabulary"* — mirroring by hand is what drifted.

**Why no unit test caught it, and what does now.** The fault was DOM timing, so
`levelling-report.test.mjs` covers what is testable — every state produces its
own sentence, an applied offset never reads as "not levelled", the numbers are
in the text so it can be reconciled with the badge — and a new accessibility
check seeds a real calibration into storage, loads the real app, and reads the
rendered line. It also cross-checks the button label and the clear control,
because the bug was surfaces disagreeing and any one of them could be the liar.

### What the crew has dialled in

FOLLOW now writes `nav.selectedAltitude`, `nav.selectedHeading` and
`nav.crewQnh` from Mode S BDS 4,0 — the altitude and heading selected on the
mode control panel, and the altimeter setting the crew is flying to. Intent
rather than state, and the closest this panel gets to sitting behind them.

`nav_altitude_fms` is DELIBERATELY NOT a fallback for `nav_altitude_mcp`. They
are different quantities from different boxes, and substituting one for the
other is the same error as filling a geometric altitude with a barometric one.

The rows are HIDDEN unless following, because this device has no autopilot to
read and three permanently-crossed-out rows on the normal panel would be noise
dressed as instrumentation.

**A false citation found in the same block.** Every followed field's reason
string said `via adsb.fi`, hardcoded, so a field served by adsb.lol credited the
wrong provider — the same bug the radar link had, surviving in a reason string
where no gate looked. Worse, a test PINNED it: it asserted the reason matched
`/adsb\.fi/` against a string that said adsb.fi unconditionally, and the rig's
stub never declared a source at all. The rig declares one now, and a second test
proves the citation follows the response rather than any constant.

**Still unexplained: the power-gate contrast flake, fourth occurrence.** Two
GATE_REGISTRY rows failed mid-session at 1.13:1 and 1.87:1 and were green on the
next run with no change to any colour. Earlier occurrences were 1.46:1 and
1.21:1. Every occurrence is a power-gate surface row, which is the one surface
whose sampling depends on a modal dialog's geometry — see the top-layer entry
above. The mechanism is plausible and NOT proven, and it is not being called
fixed.

## 1.10.0 — the airframe picker, 2026-08-03

Noah, choosing it over a hardcoded 747 callout: *"instead of heavy-inbound, an
airframe picker from all aircraft on the radar, and he can choose to see what's
up there... Types currently in range only, and filters its own list."* His idea
is better than the one it replaced: a callout only fires for the type someone
guessed in advance, while a picker built from the live sky offers whatever is
actually there — and it puts "Boeing 747-400 (1)" on the panel of the man
building one, without anything in the code knowing about 747s.

**Built from the aircraft in range at that moment, never accumulated.** A type
that has flown away stops being offered rather than becoming a button that finds
nothing. That has a consequence worth stating: the selected button can be the
one that disappears, so the selection is released and ANNOUNCED — *"No Boeing
747-400 in range any more. Showing every aircraft."* Silently keeping the filter
would leave an empty list under a control that no longer exists, and the reader
would read that as an empty sky.

**Aircraft broadcasting no type get their own bucket, sorted last.** Not folded
into a real type, which would be an invention, and not dropped, which would make
the picker's counts disagree with what the scope is drawing. It sorts last
whatever its count, because it is an absence of information rather than an
airframe. The tested invariant is that every group's count equals what selecting
it shows — a picker whose number disagrees with its list is worse than none.

**The LABEL is the description, not the code.** "Boeing 737-800", not "B738",
because the reader loves planes and does not speak ICAO. One type can carry
slightly different description strings between aircraft, so the most common wins
and ties break alphabetically — deterministic, so a button does not flicker
between two spellings as aircraft come and go. There is a test that runs the
same set in two orders and asserts the label is identical.

**The scope keeps drawing everything while the list is filtered**, and that is
deliberate rather than unfinished. A plan view that hides traffic is a plan view
that lies about the sky.

**A wrong assumption, corrected before it cost anything.** This session assumed
the accessibility sweep was blind to the picker because a sandbox hears no
aircraft, and started building a fixture — the gate has served one through
`apiStubs` since the radar page was written. The picker was covered all along.
What WAS missing is the §4 obligation: its two colour states are now in the
contrast registry, and since a registry selector matching nothing fails the
build, the gate passing is itself proof the control renders in both states.

## 1.9.0 — the cache that never once worked, 2026-08-03

Noah, with a screenshot of an empty scope: "I am getting rate limited far too
much from the radar source. Are we doing it wrong?" Yes, in two ways that were
ours, and a third that is not.

**THE EDGE CACHE WAS SHORTER THAN THE POLL INTERVAL, SO IT NEVER SERVED ANYONE.**
Nearby was an 8 s TTL against a 10 s poll; followed was 5 s against 5 s. Each
entry expired a moment BEFORE the request that would have used it, so a single
user hit upstream on essentially every poll — eighteen requests a minute while
following on the radar page. Both files asserted the opposite in prose: app.js
said the extra requests "land on Cloudflare rather than on adsb.fi", and
`_lib.js` called 8 s "comfortably inside the tightest published limit". Neither
claim was ever true, and a comment cannot be a gate.

Now 30 s and 20 s against 15 s and 10 s — each TTL twice its poll, so at most
every other poll can leave the edge. `traffic-pacing.test.mjs` fails the build
if the relationship inverts, and was watched failing on the shipped numbers
before being trusted.

**`dist` IS PART OF THE CACHE KEY, so four range buttons meant four upstream
requests for the same sky.** Tapping through the ranges — the obvious thing to
do with four buttons — quadrupled what a volunteer network was asked for. The
old code KNEW: the comment on the failed-refresh path said "each range is a
different cache key upstream, so tapping through them issues real requests",
and then fixed the symptom. One radius is fetched now, always the widest, and a
narrower scope is a filter over aircraft already in hand. The renderer already
clipped to the drawn circle, so nothing about the display changed — and range
switching is now instant and free, which fixes "the radar loses everything when
you change range" at the root rather than by keeping stale aircraft.

**The part that is NOT ours.** A Pages Function egresses from a Cloudflare colo
address shared with an enormous number of other tenants, and adsb.lol limits by
address. So perfect pacing on our side can still be refused because of traffic
we neither sent nor can see. It is the same phenomenon as adsb.fi's blanket 403
— his screenshot shows ray ...-SJC, a Cloudflare San Jose edge being turned away
by another Cloudflare edge. Doctrine §15.3 forbids the obvious workarounds and
they stay forbidden: no retrying harder, no rotating providers to evade a 429,
no browser-shaped headers to get past adsb.fi's bot rule. The legitimate moves
are to ask for less (done) and to ask adsb.lol for a key or a higher allowance
under our own identity (not yet done, and it is the right next step).

**adsb.lol's published limit is still unread.** `_lib.js` quotes adsb.fi's 1
req/s in full from their own repository, but the adsb.lol figure has never been
quoted anywhere — the docs URL is 403 from this sandbox, the same block that
stops the API working. The comment claiming we sit "comfortably inside the
tightest published limit" was therefore comparing against a number nobody here
has read. Doctrine §15.3 point 1 says read the published policy before writing
or changing any pacing; that is outstanding and Noah can open the page.

**A test agreed with the code and both were wrong.** `withinRange` filtered on
`a.rangeNm`; the producer writes `a.distanceNm`. Every aircraft was silently
dropped. The new unit test passed, because its fixtures were written from the
same invented name — self-consistent and measuring nothing. The RADAR test
caught it. The fixture now runs real aircraft through `withRangeAndBearing`
first, so a rename breaks it loudly instead of emptying the sky.

**The app's own copy described only the desk.** Noah, explaining fauxplane to
friends: *"You can follow a flight, or use it on a flight to see like the pilot,
or use it in a car while you drive! Install it to your Home Screen and it works
like an app."* Three uses. Every version of the first-run text described one —
the stationary desk, which is the ONE reader's case — and the repo description
still says "for your desk". The two omitted uses are the ones where the panel
comes alive: in a car or on an aircraft, groundspeed, track, vertical speed,
turn rate and G are all real, and the boresight levelling was built for a car
cradle in the first place. An app whose own description is narrower than the app
is undersold by the only text anybody reads. The three uses are now in the
first-run block and the (i) menu, in his words; the repo description is proposed
in the hub's METADATA.md for him to apply (§10).

**The accessibility gate could not see a modal dialog below the fold, and did
not know.** Adding those four lines pushed the registered first-run text past
the bottom of the screen, and the contrast check reported 1.37:1 — measuring a
pixel the text is not painted on. A modal `<dialog>` is in the TOP LAYER:
composited against the viewport, absent from document flow, so `fullPage`
screenshots contain only the on-screen part. `position: static` does not fix it
because top-layer membership is not a positioning property; the dialog is now
demoted with `close()` + `open` for sampling and promoted again afterwards.

The check had been green for weeks and WAS genuinely measuring — while the gate
content happened to fit on screen. Content length silently decided whether the
check worked. A dark wrong pixel would have produced a false PASS just as
easily. Because the fix turned a red into a green, which is the exact shape of a
fix that disables a check rather than repairing it, a bad colour was planted and
the gate was watched reporting 1.08:1 before the pass was believed.

**The build stamp moved to the footer.** Noah: *"The version number can go to
the bottom of the display instead of the menu row. There is no reason it has to
stay there when we are fighting for space."* Correct, and §7b is satisfied
either way — it asks for always on screen and never behind a tap, not for a
particular corner. Pressing it still opens diagnostics.

**It also let an earlier compromise be undone.** Adding the (i) button had
wrapped the header onto two rows on a landscape phone (451px of tabs + 293px of
controls against 740px), and the fix at the time was to shave tab padding on
short viewports. With the stamp gone the right-hand group is 216px and the total
is 667px — 73px of headroom — so the padding went back to full size. Undo a
compromise when the pressure that forced it is gone, rather than leaving a
smaller touch target behind as a fossil nobody remembers the reason for.

## 1.8.0 — the panel says what changed (Doctrine §7d), 2026-08-03

**`public/src/data/releases.js` is the only place release notes are written.**
The version stamp, the service-worker cache name and this list all resolve to
`VERSION`, and `releases.test.mjs` fails the build if the newest entry is not
that version. That test failed on its FIRST run — notes for 1.8.0 had been
written while `version.js` still said 1.7.4 — which is the drift it exists to
catch, caught before anything shipped.

**The notes live in the (i) menu, not on BITE.** They were on BITE for one
release and that was the wrong home: BITE's one job is answering "what is
broken", and a reader who opened it because an instrument is crossed out should
not scroll past a changelog to get there.

**The (i) menu is the answer to a question Noah asked: "Where is my (i) menu
that could carry a lot of things?"** There wasn't one. Six things a reader might
want were in five places and none was named information — what the app is and
how to install it had been parked on SETUP under the levelling controls, the
release notes were under "Built-in test", the diagnostics report hid behind a
tap on the version stamp, the accessibility statement was a footer link, and the
traffic credit was at the foot of RADAR.

It MOVES content rather than copying it: the first-run instructions are the same
node the power gate shows, relocated, so the two cannot drift.

Discovery of the notes is the banner's job: it appears once after an update, on
the PFD, and records the version as seen the moment it is SHOWN rather than when
it is dismissed — someone who ignores it has still been told, and nagging every
launch is worse than being missed once.

**Adding one 44px control to the header cost 51px of header and broke the PFD**,
which is worth recording because the failure was two steps away from the change.
The bar is `flex-wrap: wrap`; tabs measured 451px and the right-hand controls
293px against a 740px landscape phone — over by FOUR pixels, so the bar wrapped
to two rows. The panel absorbed the loss by overlapping the footer. Two fixes,
both about the real invariant rather than the symptom: `.readouts` had
`min-height: 0`, which let a FOCUSABLE SCROLL REGION be crushed to 19px under
flex pressure (SC 2.5.8 applies to it, so its floor is one target); and tab
padding gives way on short viewports, reclaiming ~56px while leaving both the
44px min-width and min-height untouched. The overlap check — previously
UNPROVEN, never having fired — caught the second half.

**A first-ever run gets no banner.** There is no "before" to report, and it
would compete with the first-run instructions for the same screen.

**`broken` is a required key and may be empty.** An empty array claims nothing
is outstanding; a missing key is an author who never considered the question.
The test enforces the difference, because only the first is honest.

**Two gates were added on the way, both proven red before being trusted:** the
no-grid gate (the hub's `docs-check.mjs`, run as `npm run docs`), and a check
that every module under `public/src` is in the service worker's precache list.
The second was written because this release added two modules and the list is
maintained by hand — the app would have worked perfectly online and failed only
offline, on someone else's device, with nothing on screen to explain it.

**The accessibility gate caught a real defect here**: the sub-headings jumped
h2 → h4, because a `<summary>` is a disclosure control and not a heading, so
nothing filled the level. Each release's version is now a real `h3` inside its
summary, which also lets a screen reader jump between releases.


## Flight tracking as a SOURCE — what was checked, 2026-08-02

Noah asked whether a flight number could drive the panel, and whether
FlightRadar24 or adsb.fi could feed it. **Framing first, because it decides
whether the feature is allowed at all: this is not simulation.** A live flight's
position, altitude, speed and vertical rate off ADS-B is a fetched feed from a
real source — the same category as METAR. It extends the no-invented-values rule
rather than bending it.

### FlightRadar24 — NO, and the reason is their terms, not the technology

FR24's terms prohibit scraping and automated access outside their own API. The
widely-circulated trick of hitting their internal JSON endpoints is a terms
violation, and Doctrine §15.1 makes the publisher's policy the authority — a
session does not get to route around it because it is convenient. Their official
API is a paid commercial product.

Worth stating the real trade rather than pretending there is none: **FR24 has
materially better coverage than community networks**, including satellite ADS-B
over oceans. That is what the money buys. For a free, noncommercial hobby panel
it is a poor trade against a community feed that costs nothing.

### adsb.fi — YES, and it is better than OpenSky for this

VERIFIED from `github.com/adsblol/api`, whose README states the API is **"a
drop-in replacement" for the ADSBExchange RapidAPI**. adsb.fi, adsb.lol and
airplanes.live all implement that same shape, which means:

- **There is a lookup BY CALLSIGN** (`/v2/callsign/{cs}`). OpenSky has no such
  endpoint — confirmed by reading its Python client, which exposes only
  `get_states(icao24, bbox)`. That single missing endpoint was the awkward part
  of the whole design, and this removes it.
- **There is a lookup by position and radius** (`/v2/lat/{lat}/lon/{lon}/dist/{nm}`),
  which is exactly the query a radar page wants.
- **No OAuth, no credentials, no KV.** That removes the one thing currently
  blocking the flight-number feature: `/api/traffic` needs OpenSky secrets that
  are not set.

**RESOLVED in 0.3.0: adsb.fi's own terms HAVE now been read**, in full, from the
publisher's own repository (`github.com/adsbfi/opendata`), which is the authority
Doctrine §15.1 asks for. Personal and non-commercial use, citation with a link
required, no warranty. See the 0.3.0 section above. adsb.lol's README also says an API key obtained by FEEDING the network
is coming, which tells you the posture these projects expect: they are
volunteer-funded, so poll lightly, identify the client, and cache hard.

**Coverage honesty for any of them:** community ADS-B is receiver-based. Strong
over Europe and North America, **gaps over oceans and remote terrain**. A
transatlantic flight will drop out mid-ocean, which the store already handles
correctly — STALE with a visible age, then FAIL.

### What ADS-B cannot give, and what may honestly be derived from it

No attitude is broadcast. Neither pitch nor roll.
- **Bank IS derivable**: in a coordinated turn `tan(bank) = V·omega/g`, with V
  from the velocity and omega from the rate of change of track. Airliners are
  always coordinated. Two measured inputs, textbook physics — DERIVED, honest.
- **Pitch is NOT.** Flight path angle is (`vertical rate` against groundspeed),
  and a flight-path marker is a real EFIS element, so the ladder would honestly
  read flight path rather than pitch.

### The radar page is v2, and its gate is now actually runnable

A plan-view traffic display is the v2 traffic page, gated behind the attitude
stability test — "fusion holds attitude within 2 degrees over a 60 s static
test". Until 0.2.2 that test could not even be attempted, because the filter
never converged. It can now: clamp the device, leave it a minute, watch whether
the horizon drifts.

---

## THE USE CASE THAT CHANGES THE ANSWER — on an aircraft, 2026-08-02

Noah asked whether this duplicates something that exists. For a SIMULATOR-driven
panel the honest answer is yes: Air Manager and its peers serve home cockpit
builders well, and a session should not pretend otherwise. **But that answer is
wrong for the case he then raised, and it is worth writing down because it
reframes what this app is FOR.**

**Taken on a real flight as a passenger, with no wifi, the panel comes alive —
and nothing simulator-driven can do that at all.** What works offline, from the
device's own sensors:

- Groundspeed, track and MSL altitude from GPS (the bundled geoid is what makes
  MSL work with the radio off). GPS receivers are passive, so airplane mode is
  fine as long as Location Services stays on.
- Vertical speed, from GPS altitude against the vertical accelerometer.
- Attitude. A phone wedged or clamped is rigidly coupled to the airframe. In a
  coordinated turn the accelerometer reads "down" through the floor — which is
  precisely why a passenger cannot feel the bank — and the manoeuvring gate
  rejects exactly those samples and coasts on the gyro, so the horizon shows the
  real roll-in. It will drift over a long turn; there is nothing to correct it.
- G-meter, turn needle and slip ball, all real.

What does not work, and says so: **magnetic heading**, because an aluminium tube
full of wiring is a poor place for a magnetometer — the GPS track is the
trustworthy direction. And METAR, winds aloft, TAS and CAS need a network, so
they age to STALE with a visible age and then FAIL.

**The reframe.** The no-synthetic-data rule is what makes the desk cockpit half
red, and it is the same rule that makes a real flight read as an actual
instrument rather than a picture of one. That is the distinctive thing here, it
is not served by any simulator product, and it should shape what gets built next.

---

## 0.2.1 — what Noah's device found, 2026-08-02

He opened 0.2.0 on his phone and the screenshots found four real defects in
about a minute. All four are fixed on `staging` and each is pinned by a test
that fails without the fix. Recorded because of what they have in common:
**every one of them was invisible to 84 passing unit tests, because each test
used inputs that a real device never produces.**

1. **Indicated and pressure altitude could NEVER be shown.** A derived value was
   stamped with its OLDEST input's timestamp, then aged against its OWN, much
   shorter window. A METAR is always minutes old; the altitude window is 60 s.
   His screen read "no update for 806s (limit 60s)" — 806 s being exactly the
   age of the observation. Every unit test passed because they all used
   same-instant inputs. Fixed: derived values are stamped at COMPUTE time, and
   input staleness rides an explicit flag, so it still cannot be laundered.
2. **The attitude filter could never converge.** The convergence check compared
   the filter against the INSTANTANEOUS accelerometer solution, which in a hand
   jitters by several degrees continuously — it was measuring hand-shake. It now
   uses the smoothed SIGNED residual, which is the filter's bias against gravity:
   jitter cancels, a real misalignment does not. (An intermediate version
   smoothed the reference instead, which then lagged a turning device and scored
   a perfectly-tracking filter as 3.8 deg out. Both wrong versions measured
   something adjacent to the claim.)
3. **The gyro's roll axis was integrated with the wrong sign**, so the two halves
   of the filter fought continuously — the cause of the residual above. Derived
   from the rotation matrices rather than guessed, and written out in the code.
   The gyro also ignored the screen angle entirely, which would have broken any
   device clamped in landscape: the mounting this app is FOR.
4. **Winds aloft gave up for 15 minutes on the first fix.** `onFix` runs inside
   the geolocation callback, before the 25 Hz loop has published the fix, so the
   winds fetch read a snapshot with no position, correctly refused to fetch for a
   surrogate, and then waited out its interval. Fixed by publishing first.

Also: BITE listed battery and network twice each (static probe and live probe
both rendering); calm wind now reads CALM; one BITE explanation was three times
too long.

**The lesson, and it is now in the hub's LESSONS.md:** a test suite whose inputs
all share a timestamp cannot find a bug about differing ages, and a filter test
that never moves cannot find a bug about movement. Fifteen fusion tests passed
while the gyro sign was inverted, because every one of them fed a zero rotation
rate.

**What worked.** The geoid, the magnetic model and GPS were all PASS on his
device on the first try, and the METAR mapping — the part I could not verify
from the sandbox and flagged as the likeliest thing to be wrong — was correct:
`A2999` in the raw report, `29.99` on the dial.

---

## SHIPPED TO PRODUCTION — 0.2.0, 2026-08-02

Noah promoted `staging` to `main` on 2026-08-02. This is the first release to
reach production; `fauxplane.pages.dev` served nothing before it.

**Promoted WITHOUT an on-device pass.** Recorded plainly because the staging
gate exists to require one and a later session must not read this as the gate
having been satisfied. Noah made the call knowingly.

**The one live risk that carries into production.** The METAR field names in
`functions/api/metar.js` were written from memory and have NEVER been checked
against a real response — `aviationweather.gov` is blocked from the build
sandbox. The tell is the Kollsman window on the ATIS page: about `29.9x` means
the mapping is right; about `1013`, or a station line saying none was found,
means a field name or a unit is wrong. Worst case the page shows FAIL with its
reason, which is the app behaving correctly.

**Version note.** The on-screen stamp went 0.1.0 -> 0.2.0 at the promotion. The
tree carried two capabilities — the panel itself, then MSL altitude and magnetic
declination — and 0.1.0 had already been stamped before the second landed, so it
no longer identified this build. Bumping also renames the service-worker cache,
which forces a clean shell at the cutover.

---

## What is built — v1, release 0.2.0 (CAPABILITY)

The whole v1 scope: **PFD, ATIS/Kollsman, BITE.** Nothing outside it.

### The core contract came first, before any gauge
`public/src/core/state.js` owns one normalized aircraft-state object, published
at a fixed 25 Hz via rAF, decoupled from sensor callback rate. Sensors and feeds
write; panels only subscribe. Every field is
`{ value, unit, provenance, ageMs }` plus a `reason` — FAIL and STALE both have
to explain themselves, and BITE and the instrument flags both print it.

**Ageing is structural, not per-instrument.** Each publish re-derives every
field's provenance from its age against a freshness window declared once in the
`FIELDS` registry. That is why "kill the network and watch the feeds go STALE
then FAIL with a visible age" is a property of the store rather than something
seven instruments each have to remember. Acceptance criterion 3 is satisfied by
construction.

**A FAIL field cannot carry a value.** `makeField` throws on it, on a value with
no source timestamp, and on a FAIL with no reason. The no-synthetic-data rule is
a type error, not a convention.

### Deviations from the spec, each deliberate, with the reason

1. **The module tree lives at `public/src/`, not at repo-root `/src`.** Decided,
   not open. The spec allows esbuild "if bundling is required" — it is not.
   Native ES modules load without a bundler, `public/` is the deploy root, and a
   browser cannot fetch `/src` from outside it. Bundling to satisfy the letter of
   a directory drawing would add a build step this repo has settled against, add
   a dependency, and make the deployed artifact stop being the source. The tree
   below that is exactly as specified: `core/ sensors/ data/ panels/
   render/gauges/`.

2. **The turn needle projects the body rate onto the earth vertical**, rather
   than reading `rotationRate.alpha` directly. For a device clamped vertical as
   a panel — the mounting this app is *for* — alpha is rotation about the screen
   normal, which is the aircraft's ROLL axis, so the spec's mapping would make
   the turn needle show roll rate. The projection is what that mapping means,
   and it reduces to exactly alpha when the device lies flat, so nothing is lost
   in the case the mapping was written for. Asserted both ways in the tests.

3. **`core/derive.js` and `core/region.js` are additions** to the listed core
   files. `derive.js` holds the four derivations as pure functions so a missing
   input can be *proved* to produce FAIL without a browser. `region.js` is the
   home reference and the boxes, which used to live inside
   `scripts/build-navdata.mjs`; the app needs the same numbers and a
   hand-written carry list is a bug with a delay fuse, so the build script now
   imports it.

4. **`data/manifest.json` and `data/manifest.js` are additions.** Three data
   bundles are deliberately absent (below); reaching for them produced a console
   404 on every boot, and acceptance criterion 1 is *no console errors*. The app
   now asks a committed manifest first, so an absent bundle is answered from a
   written reason instead of an HTTP status.

### The altitude chain, and the one thing worth reading carefully

**The tape carries one of three genuinely different altitudes, best first, and
its own heading names which:**

- `ALT` — indicated altitude. Needs the geoid AND a station altimeter setting,
  so it needs the METAR feed, so it needs a deploy.
- `MSL` — height above mean sea level. Needs only the geoid, so it works with
  the radio off, which matters for an offline-first app.
- `GPS ALT` — geometric height above the WGS84 ellipsoid. The raw sensor value.

GPS reports ellipsoidal height; altimeters, charts and terrain are referenced to
mean sea level, and the two differ by about **-105 ft** in this region. Worse,
the platforms disagree about which one they hand you — iOS applies the
correction internally, Android does not — so there is no safe assumption
available, only a real geoid model.

**The geoid model is now bundled** (see the data section below), so MSL works
offline. Indicated and pressure altitude, TAS and CAS still read FAIL until the
Pages Functions are deployed and a station altimeter arrives; each names the
input it is missing.

This is a SELECTION shown on the tape's label, never a substitution. The gate
asserts the ladder rather than trusting it.

### The Kollsman window is a real control
It defaults to the selected station's setting and can be dialled by hand; the
indicated altitude moves exactly as a real altimeter's would, because the
derivation is `MSL + [offset(station setting) - offset(dialled setting)]`. Dial
it away from the station and the panel says so. Once touched by hand it stops
auto-syncing — moving a control the user just set is silent mutation.

The amendment's fallback is implemented as written: no station in the box
reporting an altimeter setting means 29.92, flagged, with the reason on screen.

### The bundled geophysical data, and how it was verified

`npm run geodata` (`scripts/build-geodata.mjs`) emits both files and the test
fixture, and is reproducible.

- **`public/data/wmm-cof.json`** — World Magnetic Model 2025, degree 12, from
  NOAA NCEI and the British Geological Survey. Held to NOAA's own published test
  values at 100 points.
- **`public/data/geoid-norcal.json`** — EGM96 geoid heights, a 17x21 grid at
  0.25 degrees (which is EGM96's own 15-arc-minute resolution, so it is a
  resample and not a smoothing), spanning -37.8 to -21.2 m across the region.
  From NGA and NASA.

Both are US Government works. **How their terms were read, precisely:** the
publishers' own sites (`ncei.noaa.gov`, `earth-info.nga.mil`) are blocked by the
build sandbox and were NOT reached. The public-domain statements come from the
redistributing packages' own LICENSE and README files. That is weaker than
reading the publisher's page and is recorded as such in the script header and in
the emitted files rather than rounded up.

Neither package is a dependency. They are read once, the data is committed, and
the deployed app still has zero runtime dependencies.

### Feeds and the services behind them
All three Pages Functions declare the policy they operate under, identify
themselves with a contactable User-Agent, honour `Retry-After` exactly, refuse
an over-wide bbox, and cache at the edge so load does not scale with how many
people open the app (Doctrine §15).

**METAR station selection** is the settled rule, implemented exactly and tested:
the nearest station **that reports an altimeter setting**, not simply the
nearest. A station three miles away reporting no altimeter is useless to an
altimeter page.

**Station selection happens on the CLIENT, deliberately.** It needs the device's
position, and the device's position is not something to send to a server for an
app whose posture is that nothing leaves the device. The bbox is coarse enough
to be uninformative; a GPS fix is not.

**`/api/traffic` is built and testable; no panel consumes it.** The traffic
display is v2, gated behind the attitude stability test. `data/traffic.js`
writes no state field at all — that is the structural way of saying "not an
instrument source in v1", so a later session cannot wire a gauge to it without
first adding the field, which is exactly the moment to remember the gate.

### Security posture
- **A real Content-Security-Policy**, not a decoration: `default-src 'self'`,
  `script-src 'self'`, `connect-src 'self'`. It is possible because the app was
  written with **no inline script and no inline style** from the first commit —
  a CSP is a refactor, not a header. `connect-src 'self'` means the browser
  itself enforces that every third-party call goes through `/api/*`; if a later
  session adds a direct fetch, that line is what breaks first.
- OpenSky credentials are read from `env` bindings inside the Function, the
  bearer token is cached in KV server-side, and the gate greps the **served**
  client files for secret patterns and for direct third-party hostnames.
- All DOM is built with `createElement` and `textContent`. There is no
  `innerHTML` anywhere in the app.

---

## Verified, and how

**77 unit tests, 10/10 planted faults caught, the accessibility gate green
across 18 combinations, both palettes clearing every hard floor.**

Run: `npm test` · `npm run a11y` · `npm run palette` · `node scripts/plant.mjs`

### Defects the tests found before anything shipped

These are listed because a green tree is where the worst defects hide, and
because each one was invisible on screen.

- **The roll sign was inverted in `attitudeFromGravity`.** It returned +30 for a
  30-degree LEFT bank, disagreeing with `attitudeFromMatrix` by exactly a sign
  and mirroring every roll on the horizon. Neither route looks wrong on its own;
  it was caught by deriving the gravity vector *from* the rotation matrix and
  asserting the two agree. The test now also pins the aviation convention
  itself, so a future refactor that mirrors both routes together still fails.
- **THREE separate bugs in the magnetic model, and the first two synthetic
  tests could not see the worst of them.** In order found:
  1. The north component was 180 degrees out — X is the *northward* component
     but theta-hat points *south*. Caught by a pure-dipole invariant.
  2. The Schmidt normalisation for m=0 was 1 at every degree, where it should
     accumulate (2n-1)/n. This mis-scales every zonal term differently and put
     declination **three to five degrees out** — while total intensity and
     inclination stayed close, because the dipole dominates both. **The
     synthetic dipole tests were structurally blind to it: they are degree 1,
     and every Schmidt factor at degree 1 is exactly 1.**
  3. The geocentric-to-geodetic rotation used geodetic-minus-geocentric where it
     needed geocentric-minus-geodetic. Zero error at the equator, degrees of it
     at high latitude — the exact signature the official table showed.

  Only real published test values found 2 and 3. `scripts/wmm.test.mjs` now runs
  the model against NOAA's own 213-row table (100 rows inside the WMM2025
  window, including polar and high-altitude points) and holds it to 0.05 degrees
  of declination and inclination and 5 nT of intensity.
- **`markStale` was undone 40 ms later.** Ageing re-derived provenance from the
  timestamp, saw the reading was still fresh, and called it LIVE again — so
  "mark the sensors stale the moment we are backgrounded" survived exactly one
  publish. Fields now carry a sticky flag a real new reading clears.
- **A panel throwing on its FIRST render took the rest of the wiring with it.**
  The publish loop guarded subscribers; the immediate call inside `subscribe`
  did not.
- **A converged filter went silent about coasting.** While rejecting
  accelerometer corrections in a manoeuvre it reported no reason at all, so BITE
  could not answer "why did the horizon stop responding".
- **Chained FAIL reasons were a paragraph on the face of a gauge.** Four failed
  inputs each carrying a full sentence turned one altitude readout into eight
  lines. `worstOf` now names every failing input and quotes only the first
  reason; the long-form explanation lives on BITE.

### Verified headless
- All permissions denied: the app loads, every instrument shows its failure
  flag, **no readout anywhere displays digits**, every failure carries a reason,
  and BITE explains each one. **No console errors** — asserted, not assumed.
- No secret or third-party hostname in any served client file.
- Every published field carries a provenance from the allowed set, no FAIL
  carries a value, no value lacks a source timestamp.
- The PANEL POWER surface against all six of Doctrine §4's requirements.
- The panel rendered in three live states (`node scripts/preview.mjs`), because
  a headless browser has no sensors and every automated look would otherwise see
  the same all-FAILED screen — the one state where a mis-signed roll or an
  upside-down tape is completely invisible.

### NOT verified — needs Noah's hands on the real device
None of this can be reached from a sandbox, and none of it should be reported as
working until he has looked.

- **Does the horizon move the right way when you tilt the iPad?** Everything
  about the geometry is asserted in tests, and the tests were wrong once already.
- iOS `DeviceMotionEvent.requestPermission()` from the PANEL POWER gesture.
- `webkitCompassHeading` actually arriving, and the heading being correct.
- Real GPS: groundspeed, track, altitude, and the null-track-at-rest fallback.
- The three feeds against the real services. **The Pages Functions have never
  run** — there is no Cloudflare deployment yet and the sandbox cannot reach any
  of the three upstreams.
- Install as a PWA, the wake lock, and the landscape lock.
- VoiceOver on the live regions and the canvas alternative.
- Whether the panel is readable in a real cockpit in daylight.

---

## Open — needs Noah

1. **Two repo secrets, and then it deploys itself.**
   `.github/workflows/deploy.yml` now builds and deploys on every push to
   `staging` and `main`. It CREATES the Pages project on its first run, so there
   is no dashboard step beforehand. All it needs is:
   - `CLOUDFLARE_API_TOKEN` — scoped to Pages:Edit and nothing else.
   - `CLOUDFLARE_ACCOUNT_ID`.

   Set those two in Settings → Secrets and variables → Actions, and the next
   push to `staging` lands at **https://staging.fauxplane.pages.dev**. Without
   them the workflow skips the deploy and still runs the tests, rather than
   failing red.

   `/api/metar` and `/api/winds` need NO key and no KV — the weather works from
   the first deploy. `/api/traffic` alone wants `OPENSKY_CLIENT_ID`,
   `OPENSKY_CLIENT_SECRET` and a KV namespace bound as `FAUXPLANE_KV`, and it
   reports itself unconfigured on the BITE page until it has them. No v1 panel
   consumes traffic, so that can wait indefinitely.

2. **THE JOY QUESTION, and it is the one that matters most now that the
   audience is known.** On a stationary desk cockpit, the speed tape, altitude
   tape and VSI are permanently crossed out (see the section above). Everything
   about that is correct and specified. The question is whether it is what you
   want your friend to look at.

   Three ways forward, and this is Noah's call because it turns on what the
   thing is FOR:

   - **Ship it exactly as is.** The most honest panel, and the horizon, compass
     and live weather are genuinely satisfying. Half the panel stays red.
   - **A declared SIM MODE**, announced by a standing indicator with an obvious
     exit (Doctrine §3), feeding invented values. This BREAKS the v1 rule that
     there is no synthetic data path at all, so it is not a session's decision
     to make — but it is the obvious lever and it should be named rather than
     quietly avoided.
   - **REAL SIM TELEMETRY, which is the recommendation.** A panel driven by the
     simulator he is actually flying is NOT synthetic — it is a fetched feed
     from a real source, exactly like METAR, and it carries provenance LIVE with
     complete honesty. Every instrument comes alive. It serves joy AND the rule
     at once. Outside v1 scope; not built.

### Sim telemetry — what is actually known, 2026-08-02

**He plays DCS World** (Noah). There is a second program driving the mock
cockpit and Noah is getting its name; that name changes the design, so do not
start building until it arrives. See the open question below.

**VERIFIED this session by reading the source, not from memory:**

- **DCS-BIOS** (github.com/DCS-Skunkworks/dcs-bios, MIT) is the standard data
  exporter for DCS cockpit builders, and it is actively maintained. It is an
  `Export.lua` script that runs inside the sim.
- It uses LuaSocket and opens **both UDP and TCP servers**, configured in
  `BIOSConfig.udp_config` and `BIOSConfig.tcp_config` — confirmed in
  `Scripts/DCS-BIOS/BIOS.lua`, which requires `lib/io/TCPServer` and
  `lib/io/UDPServer` and adds a connection per configured entry.
- **A TCP stream is the important part.** UDP multicast is awkward to bridge;
  a TCP stream is trivial.
- Its README documents CHAINING: if a user already has an `Export.lua`, you add
  a line to the end of theirs rather than replacing it. So adding an exporter
  cannot break a working rig, which matters when the rig is someone's hobby.

**The architecture that follows.** A browser cannot speak raw UDP or TCP, so a
small local bridge is unavoidable on any route — it reads the sim's stream and
serves a WebSocket the PWA connects to. That is one small process, and a
cockpit builder is already running several.

Two routes, and the second is probably better:
- **A custom `Export.lua`** using DCS's own `LoGet*` flight-data API. Gives
  exactly the PFD values and nothing else. Safe to add because of chaining.
  NOTE: the specific `LoGet*` function names were NOT verified this session —
  verify against current DCS docs before writing any of them down as fact.
- **Consume DCS-BIOS's existing TCP stream.** If he already runs DCS-BIOS, this
  needs **no change to his DCS installation at all**. Strongly preferred: never
  ask someone to modify a working cockpit rig if you can read what it already
  emits.

**What the state store already gives us for free:** a sim source writes into the
same store as every sensor, through the same public `write`. Provenance, ageing,
STALE-then-FAIL when the sim pauses or the bridge dies, and the whole BITE page
all work with no changes. The panel would show LIVE from the sim and correctly
fall back to FAIL the moment it stops — which is the honest behaviour and is
already implemented and tested.

### ANSWERED: X-Plane + SimVimX (Noah, relaying his friend, 2026-08-02)

**The simulator is X-Plane. The cockpit interface is SimVimX driving Arduino
Mega boards.** He also plays DCS, but X-Plane is what flies the 747.

**SimVimX is not the data route.** It is a hardware I/O system — an X-Plane
plugin that drives switches, encoders, steppers and displays over USB serial to
Arduino boards. It exists to get X-Plane's state INTO physical hardware, not to
broadcast it to other software. Nothing to hook into, and nothing to disturb.

**X-Plane's own Web API is the route, and it is better than anything expected.**
VERIFIED from the `xp-command` package's own documentation (npm, targets
X-Plane 12): *"X-Plane 12 runs a local Web API automatically on
`http://localhost:8086`"* — no plugin to install, no `Export.lua` to chain, no
configuration beyond leaving it enabled. It serves datarefs over REST, and
datarefs are exactly the values this panel needs. It can be disabled in X-Plane
settings, which is the first thing to check if nothing connects.

**THE OBSTACLE, and it is a real one that shapes everything.** The panel is
served over HTTPS from `pages.dev`. A browser will not let an HTTPS page fetch
`http://<sim-pc>:8086` — that is mixed content, and it is blocked outright. The
`localhost` secure-context carve-out does NOT extend to a private LAN address,
so it does not help a tablet talking to a different machine.

Options, none of them free, and this needs a decision before any code:
- **Serve the panel over plain HTTP from the sim PC** on the LAN. No mixed
  content, no certificates, no internet needed. Costs the installed-PWA and
  offline behaviour, because a service worker needs a secure context. The
  `pages.dev` build stays the real-sensors version for portable use, and the
  LAN build is the sim version. Cleanest split, probably the right answer.
- **A local bridge that terminates TLS.** Requires a certificate the tablet
  trusts. Too much to ask of a hobbyist.
- **A tunnel** exposing the sim PC over HTTPS. Works, but sends cockpit
  telemetry through a third party for a machine sitting in the same room, which
  is the wrong shape for this app's privacy posture.

**NOT verified, and it decides the first option's feasibility:** whether
X-Plane's Web API binds to all interfaces or to loopback only. If loopback only,
a tablet on the LAN cannot reach it at all and a small forwarding process on the
sim PC becomes mandatory regardless. `developer.x-plane.com` is blocked from
this sandbox (`000` to CONNECT) so the API's own documentation could not be
read; this came from a third-party package instead. Check it before building.

**Nothing has been built.** The state store already accepts a sim source with no
changes — it writes through the same public `write` as every sensor, and gets
provenance, ageing and STALE-then-FAIL for free when the sim pauses.

3. **Navdata is the only bundle still absent, and it needs nothing from you
   right now.** The geoid and the magnetic model are both bundled and verified
   (below). Navdata backs the HSI and nav pages, which are v2, so nothing on
   screen depends on it.

   Its reason CHANGED and the old one was recorded as false: the CSVs *are*
   reachable, from `raw.githubusercontent.com`, which is noted in
   `scripts/build-navdata.mjs` as `MIRRORS`. What is not reachable is
   `ourairports.com/data/`, the page carrying the published terms — so
   `SOURCE_POLICY.policyReadOn` stays null and the fetch path still refuses.
   Pulling 18 MB from a volunteer-run project for a file nothing displays is
   also the wrong shape (§15.5). Read the terms, then `npm run navdata`.

4. **The attitude stability test, which gates all of v2.** The spec sets it at
   "fusion holds attitude within 2 degrees over a 60 s static test". That needs
   a real device sitting still for a minute; it cannot be run here. Until it
   passes, HSI, traffic and EICAS stay unbuilt.

5. **Branches.** `staging` and `main` are the only branches, as instructed. See
   the branch note below for what happened to the old ones.

6. **Repo metadata** (manual, GitHub UI — Doctrine §10). None of it is set.
   Proposed values, each needing a yes:
   - Description, written for what the app IS and naming no current feature:
     *"A glass-cockpit instrument panel for a phone or tablet, driven by the
     device's own sensors and live aviation data. Free, offline-first, no
     account."*
   - Website: nothing to set until it is deployed. Revisit at first deploy.
   - Topics: `pwa`, `aviation`, `offline-first`, `glass-cockpit`, `no-account`.
   - Social preview: not made yet. Doctrine §10 requires the tile carry the
     app's NAME in real type, with measured contrast.

7. **A day palette, if the panel proves unreadable in sunlight.** v1 ships two
   measured dark palettes because a glass cockpit is a dark instrument. That is
   a scope decision, not an oversight — say if it is wrong on the ramp.

---

## Settled — from the amendments, 2026-08-02

Unchanged, and now expressed in `public/src/core/region.js`, which is the single
source. Nothing else retypes these.

### Navdata region
- Home reference: Cameron Park, CA — **38.68 N, -121.00 W**.
- Bounding box, roughly a 100 nm radius: latitude **37.00 to 40.40**, longitude
  **-123.20 to -118.80**.
- Built from the OurAirports airports / runways / navaids CSVs, emitted as
  `public/data/navdata.json`, precached by the service worker, KV copy under
  `navdata:norcal`. The raw CSVs are never committed.

Worth knowing, because it is easy to assume otherwise: **the box reaches past
the Sierra to Reno.** A fixture written on the assumption that it does not was
the one test that failed on first run.

### Map and traffic
- Default map centre and HSI home waypoint: **38.68 / -121.00**.
- Default OpenSky bbox before the first GPS fix:
  `lamin=38.10 lomin=-121.85 lamax=39.25 lomax=-120.15`.
- Once a fix exists, derive the bbox from current position with a **40 nm
  half-width**, and stop using the default.

### METAR station selection
- **No hardcoded identifier**, ever.
- Query `/api/metar?bbox=38.2,-121.9,39.2,-120.2`.
- Nearest station **with a valid altimeter setting**, by great-circle distance
  from current position — or from the home reference before the first fix.
- Show the chosen station ID **and its distance** on the ATIS page.
- No station reporting an altimeter setting: Kollsman falls back to 29.92, and
  the altitude tape is flagged with the reason shown.

### Scope
- No SYNTHETIC engine / fuel / hydraulic pages in v1, and they are **not
  stubbed**.
- **v1 contains no synthetic data path at all.**
- Battery Status and Network Information appear only as **BITE capability
  entries**, and neither writes a state field.

### v1 panel set — final
PFD, ATIS/Kollsman, BITE. Traffic and navdata pages stay gated behind the
attitude stability test.

### Branches (Noah, 2026-08-02)
`staging` and `main` only. Staging is a hard release gate: product changes land
on `staging`, wait for Noah's pass on his actual device, and reach `main` only
on his explicit "promote". Docs-only changes may skip it. The
harness-designated `claude/*` branch is ignored (Doctrine §11).

**Branch note, 2026-08-02.** The previous session recorded that `staging` and
`main` both existed. **They did not.** `git ls-remote` showed the remote
carrying exactly one ref, `claude/jet-panel-pwa-amendments-f07ygu`, which was
also the default branch. Both are now created and pushed for real:

- `staging` — v1, waiting on Noah's device pass.
- `main` — deliberately still at the pre-UI foundation commit `7cb4e4f`, so
  promoting is a clean fast-forward rather than a merge of divergent histories.
  Nothing has ever been deployed, so that is also just true.

**SETTLED: this session's git transport cannot delete ANY remote branch.** The
previous session hit a 403 deleting the default branch and could not tell
whether the proxy denies ref deletion outright or GitHub was refusing to remove
a default branch. That is now separated by a control: a throwaway branch
`zz-delete-probe` was **created successfully** and then **failed to delete with
the same HTTP 403**, in both refspec syntaxes. Creation and force-update work;
deletion does not, for any ref. It is the transport, not the default-branch rule.

Consequences, and a session should not spend time re-deriving these:
- Deleting a branch here is a GitHub-UI step for Noah, always.
- There is no MCP tool for it either — the GitHub tools available cover files,
  PRs and issues, not branch deletion or repo settings.
- The probe branch is identical to `main`, so it is inert while it waits.
- **Do not run the probe again.** This is the answer.

---

## Bootstrap status (Doctrine §13)

Done: `CLAUDE.md`, `LICENSE.md` (PolyForm Noncommercial 1.0.0 with a scope block
separating the app's own licence from OurAirports data and runtime METAR),
`NOTES.md`, `ACCESSIBILITY.md`, the on-screen build stamp (§7b — written at
boot, dimmed with a colour token, its contrast pair in the gate), branches.

Not done, and why:
- **Hub wiring (§13.6)** — the hub links out to the app, the app links back, and
  its About links the shared accessibility statement. The app already links to
  `noahjefferson.pages.dev/accessibility` in its footer. The hub's outbound link
  waits on a deploy; there is no URL to point at yet.
- **Repo metadata** — item 6 above.
