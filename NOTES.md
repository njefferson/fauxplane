# NOTES.md — fauxplane

The source of truth for this repo. Read it first, every session (Doctrine §12).

## Thesis
A glass-cockpit PWA for a phone or tablet clamped where a panel would be. The
instruments are driven by the device's own sensors and by fetched aviation
feeds. It is not a simulator and it is not certified for anything.

---

## STAGED NOW — 1.28.7, the range buttons follow the scarce axis, 2026-08-05

**1.28.7 is on staging: https://staging.fauxplane.pages.dev** — `main` is on
1.28.3.

Noah: *"Why must the range markers go on the right side instead of the top or
bottom of the radar?"*

**Answered with measurement rather than a rationale, and the answer turned out
to be "it depends, and one of the two cases was wrong".** The scope is a CIRCLE,
so its size is the smaller side of its box — four buttons take nothing off the
long side and a quarter of the circle off the short one. Diameter, both ways:

- **874x402** — beside **213**, below 163
- **740x360** — beside **151**, below 128
- **1024x768** — beside 326, below **331**
- **390x844** — beside 316, below **330**

On a landscape phone the scope is height-bound and a column beside it is free.
On a tablet or in portrait it is width-bound and the opposite holds. So the
buttons follow the scarce axis now — which also puts them where the RADAR page
has always had them on the devices where that applies.

**Neither position is a taste call and both sets of numbers are in the
stylesheet**, so the next session can argue with them instead of re-deriving.

### Two plants that were not plants

- `flex: 62 1 0;` occurs **twice** in `styles.css`, so the horizon-share plant
  was injected into the wrong rule and the gate stayed green. **A `find` that is
  not unique is not a plant, it is a coin toss** — and nothing but the sweep's
  UNPROVEN line would ever have said so.
- The second plant went stale mid-run because the file was edited while it ran.
  The harness detected that and said so rather than reporting a result, which is
  exactly what it should do.

---

## 1.28.6 — the horizon is the primary instrument again, 2026-08-05

Noah: *"The PFD still looks wrong because you insist on trying to make the
horizon and the radar the same height."*

**Measured, it was worse than a coupling — the RADAR WAS BIGGER.**

- 874x402 — horizon **520x217**, radar **269x269**
- 1024x768 — horizon **613x387**, radar **326x437**

The controls sat INSIDE the horizon's column, so the left column spent 45px of
its share on PWR, the levelling button and the levelling message, while the
right-hand column stretched past them. **The horizon paid for the buttons and
the radar did not**, on a display whose whole name is PRIMARY FLIGHT.

The controls are a sibling of the instrument row now, under both. Both
instruments take the full row height, the horizon is **1.9x the radar by area**
at every size, and the levelling message fits on ONE line instead of three now
that it has the full width rather than the tail of a column.

### Two regressions made while fixing it, both caught by measurement

- **The new `.pfd-screen` wrapper cost the TABLET 40% of its horizon** — 613x381
  down to 613x227 — because a new box between a flex child and its parent
  inherits none of the child's growth. Every existing check stayed green: they
  are all about existence, not size. There is a check for the horizon's SHARE of
  the panel now, and the tablet is in the layout viewport list because of it.
- **The wrapper was then shrunk below its own content** on a 740x360 night pass,
  so the controls hung out of it and through the value strip. `flex: 1 0 auto` —
  grow, never shrink — and the page scrolls on a screen genuinely too short,
  rather than the panel overlapping itself to pretend otherwise.

### The invariant is stated as AREA, deliberately

`checkHorizonIsPrimary` asserts the attitude indicator is the biggest instrument
and that the scope is never taller — not that the two are equal. **Noah asked
for them to stop being forced to the same height**, and a check that pins the
current arrangement would forbid the thing he actually asked for. The rule is
which instrument is primary; the arrangement is free to change.

---

## 1.28.5 — the list count, and a confident wrong diagnosis, 2026-08-05

**1.28.4 claimed to fix the aircraft list count and did not.** It named a cause,
the cause was wrong, and the fix that followed addressed something that was
never happening. The check written to prove it passed **vacuously** — and the
only reason any of this was noticed is that the plant sweep reported both of its
plants `UNPROVEN`.

### The wrong diagnosis, and why it survived

The story in 1.28.4 was: the list is built while the RADAR page is `hidden`,
everything measures zero, so every row counts as below the fold. Plausible,
consistent with the symptom, and **completely wrong**.

**The actual cause is one line of CSS.** `offsetTop` is measured from the
nearest POSITIONED ancestor, and `.radar-list` was not positioned — so the
nearest one was somewhere up the page and every row reported a PAGE coordinate.
Measured: the first row's `offsetTop` was **1187** on a 390px-wide phone, against
a scroller `clientHeight` of 318. Every row is "below the fold" when compared
that way, so the count came out as the TOTAL every single time, on any page, in
any state. The row-cap was computed from the same offsets and was nonsense too,
which is where the sliced row came from.

`position: relative` on the list fixes both numbers. Measured after: 6 rows
visible, `13 more below`, 6 + 13 = 19, nothing sliced.

### The check passed because its FIXTURE could not produce the defect

`checkHeardList` used the shared `TRAFFIC_FIXTURE` — which has **three
aircraft**. Three rows never reach the bottom of a scroller, so nothing is ever
below the fold and nothing is ever sliced. The check ran, asserted, and reported
green over a condition it could not reach.

**This is the third shape of hub LESSONS §54 in one session**, and the shapes
are worth naming together because they do not look alike while you are writing
them:

- a check measured on a VIEWPORT where the defect cannot appear (the scope
  check, at 1024x900),
- a check that cannot fail in the HARNESS meant to prove it (the (i) placement,
  under `--quick`),
- a check whose FIXTURE cannot produce the condition (this one, three aircraft).

Each is invisible in a green run. Each was caught by `plant.mjs` and by nothing
else. **The sweep is not a formality — it has now found four defects in checks
in a single day, three of them in checks written the same hour.**

### And the deeper one: a plausible cause is not a cause

The hidden-page story explained the symptom, matched the code, and was written
into a release note as fact. The measurement that would have refuted it —
printing an actual `offsetTop` — took one probe and was not run, because the
explanation already felt finished. **A diagnosis that has not been measured is a
guess wearing a diagnosis's clothes**, and this repo has the same lesson written
about airplanes.live's terms from a different direction.

---

## 1.28.4 — a cut-off reason, and a list fix that did not work, 2026-08-05

Noah, with two photographs: *"The red text is cutoff on the PFD when following
an aircraft. The list of aircraft is not looking correctly due to text alignment
on the background or something."*

### The reason was truncated, and the fix already existed twenty lines away

The ADI read `ADS-B carries no attitude — pitch is n…`, severed mid-word.

**A reason is the one string on a gauge that must not be abbreviated.** The
whole argument for crossing an instrument out rather than blanking it is that
the panel says WHY; half a why looks like a fault in the panel rather than an
honest answer about what a broadcast carries.

**The interesting part is WHERE it was.** `wrapText` exists, it is correct, and
it was written for exactly this defect — in the branch that runs when attitude
is lost ENTIRELY. The branch beside it, which runs when only PITCH is missing,
kept calling `ellipsise`. One is reachable by denying permissions; the other
needs a real aircraft being followed, which no sandbox can do. **So the fix went
to the case that was on screen and never to the case beside it** — and nothing
was watching, because the check that would have caught it did not exist either.

Now `reasons.test.mjs` wraps EVERY string in `FOLLOW_FAILS` at the width the ADI
actually gives it and fails on any that carries a truncation mark. Over the
data, not the drawing, with a deliberately over-wide monospace stand-in for
`measureText` so anything passing here cannot fail on the real font.

### "19 more below" with nineteen aircraft and seven on screen

The count was taken one frame after the rows were added — and the list is built
whenever the feed answers, **including while the RADAR page is `hidden`, where
every element measures zero**. At `clientHeight` 0 every row is below the fold,
so the count equals the TOTAL and stays wrong until something re-renders.

**A number measured against an unlaid-out element is not slightly off, it is a
different quantity.** It now refuses to answer without layout, and re-measures
on the two events that change the answer: the reader scrolling, and the list
gaining a size — which is what happens the moment the page stops being hidden.

The gate check reproduces it the only way it can be reproduced: land on the PFD,
let the traffic fixture arrive while RADAR is hidden, and only then switch.
Measuring after a direct visit passes happily.

**And the list ends on a row boundary now.** A fixed `max-height` cut whichever
row straddled it, and a row sliced through its own text against a hard container
edge reads as broken rather than scrollable — the same complaint, in the same
session, as the value strip under the horizon.

### The ResizeObserver that nearly became the bug it was fixing

The first version of the re-measure cleared the cap and blanked `max-height`
before measuring — which resizes the element being observed, on every
notification, forever. That is precisely the *"ResizeObserver loop completed
with undelivered notifications"* warning this app **already logs on an iPad and
has never explained**. Writing a second source of it would have made the
original impossible to find. `measureList` sets the cap only when it is not
already set, so the one resize it causes settles on the next notification.

---

## 1.28.3 — the instruments get the landscape screen, 2026-08-05

Noah, with a photograph of the PFD on an iPhone in landscape: *"This layout is
unacceptable."* Reproduced at his exact size — **874x402** — and the numbers
were damning: the value strip was **354px of a 659px page**, so more than half
the panel was below the fold and what was visible ended in a sentence sliced
through the middle, directly above a solid footer bar.

**Three attempts went by before the right question got asked**, and all three
were answering the wrong one — how to fit a row of values onto a screen with no
room for one:

- `min-height: auto` on the instrument row never shrinks, so the strip stayed
  under the footer.
- `0` shrinks without limit, and the a11y gate caught it inside a minute:
  `.pfd-canvas and .readouts overlap by 436x33px`, by name, at 740x360.
- `min-content` split the difference and still sliced a sentence.

Then Noah: *"Why are you bounding everything to the circle inside the radar
instead of pushing everything down so I don't have to see all the
diagnostics?"* — which is the actual answer. **The instrument row is a full
panel tall.** The strip begins AT the fold rather than through it, so nothing is
half on screen and there is nothing to look cut. The values are text because a
canvas is non-text content and they must exist as text somewhere; nothing
requires them to be what fills the glass.

**And the scope got a quarter of its width back.** With the instruments owning
the height, the four range buttons stack into a 44px column instead of a 94px
2x2 block, and the plan view goes from 215px across to a square 269.

### The three checks this cost, and the one that was unprovable

`plant.mjs` runs the a11y gate with `--quick`, which is **ONE viewport,
1024x768** — and at that width the (i) sits beside the tabs whatever
`flex-wrap` says. So the (i)-placement check written into the per-page sweep
could not fail in the harness meant to verify it, and the sweep said so:
`UNPROVEN`. **Hub LESSONS §54 for the third time in one day**, and the third
time it was caught before anything was claimed rather than after.

Both layout checks now pin their own contexts, like `checkRadarTap` does:

- **874x402**, the device in the photograph. Short enough for the panel rules
  and tall enough for the stacked range column — a combination NO viewport in
  the sweep exercises.
- **390x640 at 200% text**, where the tab strip wraps to three rows and the (i)
  has somewhere to fall.

The second check also failed correctly on its first run, by 24px, because it
compared the row against the page's PADDING box rather than its content box.
`min-height: 100%` resolves against the content height. Fixed, and the check
now measures what the rule actually promises.

---

## 1.28.2 — brightness to SETUP and the (i) up, 2026-08-05

Noah: *"I think brightness can go in setup, and then (i) moved up?"*

Both done. Brightness is a card on SETUP beside the levelling controls, with
room to say what it is doing — two measured colour schemes rather than a
slider, Auto following the light sensor where there is one and the sun's
computed elevation where there is not. **The ELEMENT moved; the logic did not.**
Dimming reads the ambient field, the store and the token surface, all held in
`app.js`, and a copy of the day/night decision living on SETUP would be a second
answer to "is it night" — the exact shape of the `levellingLine` duplication
this repo already paid for.

The (i) rides the tab row, and is deliberately NOT inside the tablist. That is
the tempting way to get it there and it makes the (i) a sixth page — which §7e
names as the thing it must not become — while breaking the arrow-key contract
for anyone driving the tabs from a keyboard. There is a plant for it, because
axe does not reliably fail on a stray child of a tablist.

### The header change is height-NEUTRAL, and the first version of this note said otherwise

`flex-wrap: nowrap` was written first with a comment claiming the header went
from 397 to 286 on a phone at 200% text. Then it was measured:

- **200% text, 390 wide** — 406px against 407px wrapped. Pinning the (i) to the
  tab row takes width from the tabs, which pushes them from three rows to FOUR.
  It gives back the row it removed and charges the same for it.
- **normal text, 390 wide** — 104px against 105px.

So it was reverted to `wrap`, and then reverted BACK to `nowrap` on the totals:
neutral everywhere, and the only arrangement that puts the (i) beside the tabs
at every size, which is the thing actually asked for. **The real numbers are in
the CSS** rather than a claim, so the next person can argue with them — hub
LESSONS §54.

**And it means the 200%-text problem is untouched.** That was never the header:
it is five tab targets at 88px each, and those are navigation. Still open, still
said in the release notes.

### Two new gate checks, three plants

- **The (i)'s placement**, asserted on every page and every viewport: in the
  header, sharing a row with the tab strip, and not a descendant of the tablist.
- **Brightness on SETUP, PRESSED.** A control that changes surface and renders
  perfectly while doing nothing is the specific risk in a move like this, so the
  check clicks it and requires the palette to actually change — not merely that
  the markup is present and the contrast passes.

---

## 1.28.1 — the release notes were a support thread, 2026-08-05

Noah, on opening What's New: *"WHAT THE **FUCK** ARE THESE RELEASE NOTES?!"*

He was looking at ten releases of a **development diary published inside the
product**. Three distinct failures, all of which read as reasonable while being
written:

- **"You" had quietly stopped meaning the reader.** *"You asked why every runway
  looks the same."* *"You held the panel up next to your home screen and said it
  did not match."* *"You sent a photo of DAL2229."* *"Five things you said were
  wrong with the radar."* The reader is a friend of Noah's building a 747
  cockpit. He opens the list and is addressed as somebody else, about events he
  was not present for.
- **"I" appeared at all.** *"I measured both."* *"It covers exactly what I cannot
  reach from here."* *"I only wrote the test AFTER you found it. That is
  backwards."* A session narrating its own process, under Noah's name, to a
  stranger. There is no author character in a patch note.
- **The reader was given homework, in eight consecutive releases.** *"Send me
  that."* *"Follow a flight and send the report."* *"That is the thing to send
  me."* Telling a reader HOW to report a problem is §7e and belongs in the (i)
  menu; making the next release conditional on him doing it is an arrangement
  between two other people, leaking onto his screen.

Plus raw protocol on the face of it — `HTTP 201`, `content-type: text/html`,
`cf-ray`, "24 pixels", "below the fold".

**1.0.0 through 1.19.1 are clean.** The rot starts at 1.19.2, is total by 1.24.0,
and tracks exactly the period when the work became a fast back-and-forth with
Noah — the notes were being written from the SESSION's memory of the day rather
than from the diff. Every one of them has been rewritten for the reader. No claim
changed and nothing was dropped; the same releases, described from the other side
of the screen.

### The rule was in the file's own header the whole time

`releases.js` opens with *"THE READER IS NOT A DEVELOPER… what he can now see or
do."* That paragraph was written from this app and then walked past for ten
releases. **A rule that lives in a comment at the top of the file being edited is
not enforcement** — it is read once and then the file is edited from the bottom.

So it is a gate: `releases.test.mjs` now fails on the reporter-address forms, on
first person, on "send me", and on raw protocol and pixel counts. Deliberately
narrow — ordinary second person is how the whole file speaks to its reader ("the
aircraft over your desk", "you decide when"), and banning "you" outright would
make the notes worse. There is a test asserting that narrowness, and another
asserting each pattern still catches the **verbatim shipped sentence** it was
written from.

**It went red on six lines immediately — two of them written minutes earlier, in
the very release that adds the gate.** "Below the fold" in 1.28.1's own `broken`
list. That is the value of writing the check from real sentences rather than
imagined ones.

### And `--changed` had never once run in its normal mode

Found while running the selective sweep for this release. `plant.mjs --changed`
asks git which files moved, then re-runs itself inside a scratch copy of the
tree — a copy that deliberately excludes `.git`, correctly, because it is the
largest thing here and no plant touches it.

**The child then re-ran the selection.** git printed its usage text into the log
and the harness exited 2. From a fault-injection harness, exit 2 reads as *a
plant failed*, so the flag built to make the common case cheap looked like it
was finding real problems while never having run at all.

Every verification of that flag had used `--dry`, which prints the selection and
exits **before** the isolation step. The fast path used to check the feature was
not the path the feature runs on.

The selection is computed ONCE now, in the parent, and handed to the child
through `PLANT_SELECTED` — by NAME rather than by index, because an index means
a different plant the moment the data file is reordered and nothing would catch
it across a process boundary. The git path is now only reachable from a genuinely
bad ref, and says so.

**A zero-plant selection also says what it means.** It used to print
`0/0 planted faults were caught by the gate`, which is true and reads as a clean
sweep. It now says NOTHING was verified by this run, and that the gates are
unproven since the last whole sweep — the same reason the selector already prints
what it skipped.

---

## 1.28.0 — five things wrong with the RADAR page, 2026-08-05

Noah, 2026-08-05, in one message: *"The radar is pushed down by the airport
picker. The ranges still need to be made right. Tapping the planes on the bottom
is a different path than pasting their data into the box above it. Tapping the
planes on top is still inconsistent in whether they will respond or not.
Clicking follow does not indicate it did anything."*

Five separate defects. **Every gate on that page was green through all five**,
and that is the thing worth keeping from this release.

### 1. The picker was standing in front of the instrument

The centre picker — a label, a text field and a two-line hint — was rendered
ABOVE the scope, and the four range buttons and four altitude bands were
flex-wrapped, so on a 402 px phone each pair took two rows instead of one. The
scope began past the half-way point of the viewport and ran off the bottom.

The picker moved BELOW the canvas. It is a setup action, used once to aim the
thing; range and band are used *while* looking at it, so they stayed above and
became four-column grids that fit on one line at every width this app supports.

**It was not made smaller.** Shrinking a control to make room is how it stops
being readable instead of merely being lower down.

### 2. The rings printed a distance the circle is not at

`Math.round(rangeNm * frac)`. At 10 nm the quarter and three-quarter rings sit
at **2.5 and 7.5 nm** and were labelled **3 and 8** — on a display whose entire
contract is distance. 20, 40 and 80 all divide evenly by four, so three of the
four ranges were correct by arithmetic accident and the fourth was the only
witness. Now `ringLabelFor`: one decimal where the number needs one, none where
it does not.

**It is EXPORTED so the test calls the real thing.** Written inline the formula
was six characters, and the first version of the test re-typed those six
characters — which would have gone on passing with `Math.round` restored
underneath it. A plant proves it does not. **A test that re-implements the
thing it is testing is a test of itself**, and it is easiest to write exactly
when the logic is small enough to look harmless.

### 3 and 4. Two tap paths, and a target that excluded the part people press

Tapping a row in the list followed the flight but did NOT fill the box; tapping
the same aircraft on the scope did both. The same action left the page in two
states depending on which surface it was touched from. The list now fills the
box too.

The canvas taps were never flaky. `placeLabels` offsets a label by
`size + lineHeight * 0.9` — about 20 px — and the label has its own height on
top of that, so **a finger going for the altitude readout lands 20 to 28 px from
the mark**. The slop radius was 24. The biggest, most inviting thing on the
scope was half outside its own target, which is exactly what "inconsistent"
looks like from the outside. `TAP_SLOP_PX = 34`; nearest-wins still resolves a
cluster, so the wider radius only helps where there was nothing closer to pick.

### 5. Follow answered where nobody could see it

Pressing **Follow this flight** wrote to `status` — which sits ABOVE the scope,
several hundred pixels off the top of the screen at the moment a thumb is on the
button at the bottom. An empty box produced a sentence nobody could read, and a
typo replaced the traffic feed's own line ("86 aircraft within 40 nm") with a
spelling lesson.

There is a `role="status"` note inside the form now. Empty box says what to do;
a bad entry quotes what was typed; a successful follow says *"Following X. Open
PFD to see its instruments."*

### The lesson: every check asked whether things EXIST

Contrast, target size, accessible names, the citation, the readiness chip, the
FOLLOWING indicator — all green, all release. **Not one of them asked where the
instrument starts**, which is the only question a reader has when they open the
page.

### And the first version of THAT check was the same mistake again

It asked whether the scope began past half the viewport, and it lived inside
`checkRadarTap` — which pins **1024x900**. Measured there the scope starts 27%
down **with the fault planted**, so the check could not fail. It went green on a
build I had already claimed was fixed, and the sweep called it:

    GREEN  layout: the centre picker goes back above the scope  <-- the check does not work
    UNPROVEN  the gate stayed GREEN with the fault planted

**A threshold nobody measured, on the one viewport where the defect cannot
appear.** That is the same shape as the five defects it was written for — a
check that asks a question in a place where the answer is always yes. It is also
exactly what `plant.mjs` exists for: nothing else in the pipeline would have
said a word.

Rewritten around two MEASURED questions, both about what this page controls:

- **What may sit above the canvas, by name.** Range, band and the readiness chip
  are read *while* looking at the scope; the centre picker aims it once. This is
  DOM order, so it fires at every viewport including the single one `--quick`
  runs — which is what lets a plant prove it at all.
- **How much room they take, in rem**, so it scales with the reader's text size.
  Measured 2026-08-05: **11.1rem** at every normal-text viewport and **11.88rem**
  at 200% text. Before the fix: **17.45rem**, **21.73rem** on a portrait phone,
  **41.59rem** at 200%. The ceiling is 13.

Watched going red. The message names the element it found.

### Still open: at 200% text the scope is below the fold, and this page cannot fix it

Measured at 390x640 with 200% text: the header and tab strip take **407px of a
640px screen** before the radar card begins. The card's own stack is 380px more.
So the scope starts at 812 and the reader must scroll to see any of it.

**The card is not the cause** — it more than halved its own contribution this
release (1331px to 380px), and even at zero the scope would still start past the
fold. This is a navigation-height question at large text sizes, and the gate
deliberately does NOT assert total distance down the page: it would either fail
on something the radar page cannot fix, or be set loose enough to mean nothing.
Recorded here rather than hidden behind a lenient threshold.

---

## 1.27.0 — the route question is CLOSED, 2026-08-05

### The route: three probes, three hypotheses killed, one answer

From Noah's 1.26.0 report, the self test's first real run:

    callsign SKW3107   HTTP 201
    content-type text/html
    answered by https://api.adsb.lol/api/0/routeset
    server: cloudflare
    cf-ray: a261a4b65dc369a0-SJC
    body 0 bytes   parsed as JSON: NO

- **201, not 422** — the request SHAPE is accepted. That branch never fired.
- **0 bytes, text/html** — nothing to parse. Not a shape misread; nothing at all.
- **No redirect, `server: cloudflare`, a `cf-ray`** — **Cloudflare answered, not
  the API.** The same shape as adsb.fi's 403: intercepted at the edge before
  adsb.lol's application sees us.

**So the call is off**, per the commitment NOTES made before the evidence
arrived: a request that cannot succeed still spends an allowance shared with the
AIRCRAFT feed, which is the thing on screen. 1.21.1 was this same mistake in
another form.

**Nothing is deleted.** `parseRoute`, the probe and the client are intact and
tested. `ROUTE_UPSTREAM_ENABLED`, or `ROUTE_UPSTREAM=on` in the Pages
environment, re-enables it — **without a deploy**, so if their edge ever stops
swallowing it, one variable re-probes the whole thing.

### The self test caught a bug in ITSELF, first run

    FAIL /api/metar HTTP 400 — bbox is required

…while `metar.station` read **LIVE KPVF** three lines above it in the same
report. The self test built `/api/metar?lat=..&lon=..` by hand; the Function
takes a `bbox`.

**It accused a working feed.** That is the one failure a diagnostic cannot have,
and it is worse than a missing check because somebody acts on it. It calls
`metarBboxParam()` — the app's own builder — now, so it cannot drift again. The
general rule: **a diagnostic that constructs its own requests will drift from
the app, and the drift surfaces as a false accusation.**

### The backgrounding question is now measurable rather than arguable

Twice, `orientation.beta/gamma/compass` FAILED with *"no update for 3s (limit
3s)"* while the raw block held a good gravity vector. That reason describes a
CLOCK, not a CAUSE, and two sessions correctly refused to guess which.

The `visibilitychange` handler existed but **did not cover `orientation.*`** —
so those fields aged out unmarked. They are marked now, and the report carries a
**FOREGROUND** block: current state, how many times the app has been
backgrounded since boot, and when. If a future report shows the clock reason
with no recent visibility change beside it, the cause is something else — a
distinction the panel can now make on its own.

### Confirmed working, from the same report

The traffic feed answered: **86 aircraft**, `provider adsb.lol`, with the
coverage table showing `nav_qnh` on 34 of 60 and `nav_altitude_mcp` on 29 of 60
— the crew readouts are real and populated. 1.23.0's countdown reads
*"not asking again for 8m 49s"*. The offline shell holds `fauxplane-1.26.0`.

---

## PROMOTED — main is on 1.26.0, and four releases had never deployed, 2026-08-04

**Noah said "Promote to main."** `main` fast-forwarded from 1.23.1 to **1.26.0**
and — this time — **the DEPLOY was verified green for that exact SHA**, not the
push. Live at https://fauxplane.pages.dev. Staging is the same commit.

### The failure that made him ask

He sent a screenshot of BITE with no self-test button on it and asked:
*"What. Button."*

He was on **1.24.0**. Four releases — 1.24.1, 1.25.0, 1.25.1, 1.26.0 — had been
pushed, reported as shipped, and **never deployed**. Every one of those pushes
was genuinely verified the way LESSONS §2 demands: read the remote, confirm the
range line, confirm the SHA. All true. All about the wrong thing. **A push
landing and the site updating are different facts** and only the first was ever
checked.

### What blocked them was a gate this session wired that afternoon

The privacy check, newly added to `deploy.yml`, failed on a release note reading
*"they are still not diagnosed, only absent"* — about ResizeObserver warnings.
The pattern read `they are ... diagnosed` as a disclosure about a person.

**The compounding shape is the part worth carrying:** a session that adds a hard
gate to a pipeline has just added a new way for its own work to silently not
arrive, and is at its LEAST likely to check, because it has just watched that
gate pass locally. The gate ran on the runner against a file the local run had
not yet seen.

### Fixed in the gate, not in the sentence

Rewording the note would have unblocked him in a minute and left the same
landmine in a SHARED gate for every repo that adopts it — and taught the next
session that the way past a privacy check is to rephrase. `diagnosed` now
requires a following `with`, which keeps every real disclosure and releases the
ordinary engineering sense (a bug is diagnosed; a cache is diagnosed). **Tested
both directions on a scratch repo** — six real disclosures still caught, five
engineering sentences now pass.

### What stops it recurring

`handoff-check.mjs` gained a fifth obligation, **`deploy-green`**: for every
branch pushed, check the deploy for that exact SHA and see it CONCLUDE, before
saying anything shipped. `deploy-url` already covered misreading a log you
opened; this covers never opening one, which is the failure that hid for four
releases. Hub LESSONS §53, and it is in both CLAUDE.md indexes because those are
loaded every session while LESSONS must be opened.

---

## STAGED NOW — 1.26.0, a self test Noah runs, 2026-08-04

**1.26.0 is on staging: https://staging.fauxplane.pages.dev** — `main` is on
1.23.1.

Noah: *"You could build a simple test that I run, like the debug sheet, instead
of redoing the whole app every fucking time."*

He was describing the real cost of how this was being worked. Learning one fact
about a live feed took a release, a follow, a report and a wait — **three times
over for the route endpoint alone.** Every round trip spent HIS time answering a
question a machine could ask.

### It lives on BITE, because BITE already IS this

"Built-in test" is what BITE means on a flight deck, and the page has always
reported what every sensor and feed is doing. The only thing missing was the
ability to ACTIVELY go and ask rather than report what happened to arrive. A
sixth page would have been a second home for one idea.

### It covers exactly what the sandbox cannot reach

That boundary is the whole justification for a device-side test rather than
another unit test:

- **the real feeds**, through the real Functions, from a real Cloudflare edge —
  this sandbox's proxy denies every outbound host, google included (verified,
  not assumed);
- **iOS Safari** — its permission model, its screen-angle reporting, and
  `maxTouchPoints`, which is the only thing that tells an iPad from a Mac
  because iPadOS reports itself as `Macintosh`;
- **the service worker and its caches**, which exist only in a real browser.

Everything else was already testable here and should have been tested here.

### The distinctions it is built to keep

**SKIPPED is not PASS.** Without a position the traffic check says skipped;
without a followed flight the route check says skipped rather than inventing a
callsign — asking about a made-up aeroplane is the synthetic-input form of the
rule this app is built on. A plant flips that skip to a pass and the tests go
red.

**UNKNOWN is not PASS.** Anything it could not determine reports `????` with the
reason, because "I could not tell" and "it is fine" are different answers and
only one is earned.

**It records the SHAPE of a reply, not just the status** — bytes, content type,
whether it parsed. That is the exact gap that made the route question take three
releases instead of one.

### One paste, not two

The result folds into the diagnostics report. A finding that lives only on the
BITE page is a finding that arrives as a screenshot, and this project has spent
enough on screenshots.

---

## STAGED NOW — 1.25.1, runways measured rather than eyeballed, 2026-08-04

**1.25.1 is on staging: https://staging.fauxplane.pages.dev** — `main` is on
1.23.1.

Noah: *"Why does every runway look exactly the same even at different scales?"*

### Measured against the real navdata, and he was right twice over

Computed from `navdata.json` at a 350px scope radius, for the runways actually
near his home reference:

- at **10 nm**, the closest runway draws **24px**
- at **20 nm**, 8.6–17.3px
- at **40 nm**, 4.3–8.6px, several culled
- at **80 nm**, 2.2–4.3px, nearly all culled

**And the width was 1.5px in every one of those cases.** The formula was
`max(1.5, min(5, len * 0.06))`; `len * 0.06` reaches 1.44 at the largest size a
real runway ever draws, so the `max` pinned it at 1.5 permanently. It had never
varied once since it shipped.

**The precision matters and the first test got it wrong.** The formula is not
constant for arbitrary lengths — at 40px it gives 2.4 — it is constant across
**the lengths real runways reach**. A test asserting the general claim failed,
correctly, and was rewritten around the ten measured sizes.

### The honest fix is two marks, not a bigger line

Drawing a runway larger than it is would be a lie about a distance, which this
panel does not tell. So below `RUNWAY_MIN_PX` — the length at which a line can
carry an ORIENTATION at all — the mark becomes an **airport symbol**: a small
open circle, the convention every aeronautical chart uses, drawn **once per
airport** rather than once per runway (a field with three runways was three
specks stacked in the same place).

Above it, the runway is drawn from real threshold coordinates as before, with a
width that now actually scales.

**A symbol is not a scale drawing and does not claim to be one.** That is
precisely why it is honest at range, and why this is not the same as inflating
the line.

### The test caught a flaw in the test

The width test declared its OWN copy of the formula. Planting a constant into
`plan.js` left it green — a check on a decision the shipped code never
consults, which is hub LESSONS §42 in miniature. `runwayWidthPx` is exported
now and the test imports it; the plant then goes red as it should.

---

## STAGED NOW — 1.25.0, and a test found a bug nobody reported, 2026-08-04

**1.25.0 is on staging: https://staging.fauxplane.pages.dev** — `main` is on
1.23.1.

Noah: *"Can you not just build simple tests for some of this shit??"*

### The audit, which is not flattering

Of the last five defects **he** found on his own device, four were reachable by
a plain unit test:

- heading's staleness limit (5 s) was half the poll that filled it (10 s) —
  arithmetic;
- "this device reports no magnetic heading" printed while the same report showed
  the compass at 278.3° — a pure function;
- the FOLLOW banner claiming a broadcast that had never arrived — a pure
  function;
- a field keeping the PREVIOUS aircraft's name after a switch — a two-step state
  machine.

**In every one, a test was written AFTERWARDS as a regression guard.** That is
the wrong job. Regression guards prove a fixed bug stays fixed; nothing in the
suite was looking for the NEXT one. The plant sweep does not help either — it
proves the gates catch faults that are deliberately planted, not that the app is
free of faults nobody thought of.

The fifth — the route feed's 201/text/html/0 bytes — genuinely needs the
network. **Verified rather than assumed this time**: the sandbox's proxy denies
every outbound host, google included. That one costs a round trip through his
device and no test replaces it.

### What was built, and what it found in its first run

`scripts/invariants.test.mjs` — properties that must hold in EVERY state,
checked by driving the app through follow, switch, refresh and refusal:

- no field presents or implies an aircraft the panel is not following;
- every field the feed owns outlives the poll that fills it;
- the registry carries no impossible window;
- nothing claims data before it arrives;
- every failure explains itself.

**The first one failed on its first run, on a defect nobody had reported.**
`refreshFollowed` did `followed = list[0]` — whatever came back, adopted as the
followed aircraft **without checking it was the aircraft we asked about**.

That is the app's central rule broken at the source, and it would have been
INVISIBLE: real numbers, real provenance, real timestamps, wrong aeroplane.
Callsigns are reused, a callsign query can match more than one airframe, and a
cache can outlive a switch. It costs one comparison. The panel now refuses a
broadcast that is not about the followed aircraft and says so.

### The invariant was refined by contact, not weakened

Its first form flagged the honest refusal sentence — *"the feed answered about
N460DF when asked about N81AB — not showing it"* legitimately names both. The
rule is not "never mention another callsign"; it is **never present another
aircraft's data as the followed one, and never name one without admitting which
you follow**.

**Both original defects were re-injected to confirm the refined form still
catches them.** It does — the 1.24.0 heading bug trips the second clause,
because that sentence never mentions the aircraft actually being followed.

### The rule going forward

**Write the invariant, not the example.** When a defect is found, ask what
SENTENCE it violated, and test that sentence over every field in every state —
not the one field that happened to show it.

---

## STAGED NOW — 1.24.1, and THE PANEL IS FLYING A REAL AEROPLANE, 2026-08-04

**1.24.1 is on staging: https://staging.fauxplane.pages.dev** — `main` is on
1.23.1.

### First: it works

Noah's 1.24.0 report is the panel doing the thing it was built for. Following
**N460DF, a C-130**, `seen_pos 0.13s ago`:

- groundspeed **214 kt LIVE**, GPS altitude **4,325 ft LIVE**, track **127°T
  LIVE**, vertical speed **+900 fpm DERIVED**, MSL **4,426 ft DERIVED**
- winds aloft LIVE, METAR LIVE, declination DERIVED
- 13 FAIL, and every one is a legitimate "ADS-B does not carry this" — pitch,
  slip, TAS, CAS, AoA, the three autopilot fields, indicated and pressure
  altitude
- **zero console errors**

The scope behind it is full of real traffic with real flight levels. This is the
first report in the whole project where nothing is wrong with the app.

### The route probe is ANSWERED, and it is not our request

    callsign N460DF   HTTP 201
    content-type text/html
    body 0 bytes   parsed as JSON: NO

**201, `text/html`, zero bytes.** A routes endpoint returning routes sends
`application/json` with something in it. Whatever answered is not the JSON API,
and `parseRoute` correctly reported "no entries" because there were none to
find — the client behaved perfectly on a reply that contained nothing.

Two probe rounds have now each converted a guess into a fact: round one killed
"the request shape is wrong" (a 422 never came), round two killed "the reply is
JSON we cannot parse" (there is no reply at all).

**1.24.1 captures the last discriminator and NOTHING IS GUESSED PAST IT.**
`finalUrl`, `redirected`, and the `server` / `cf-ray` / `location` / `allow`
headers. Three possibilities remain and these separate them:

- an edge or proxy intercepting before the API sees us — `server` names it and a
  `cf-ray` is present, the same shape adsb.fi's 403 has;
- a REDIRECT that turned our POST into a GET — Workers' `fetch` follows
  redirects and a 301/302 converts the method, landing on an HTML page exactly
  like this. `redirected: true` or a `finalUrl` that differs proves it outright;
- the endpoint genuinely answering 201-with-no-content, in which case the route
  is not in the response body and the whole approach needs rethinking.

**The next report decides it.** If it shows an intermediary rather than
adsb.lol, the honest move is to STOP CALLING the endpoint — a request that
cannot succeed is spending the shared rate-limit allowance the radar needs
(1.21.1's lesson), and this feature is a nicety while the aircraft are the
instrument.

### Also fixed in 1.24.0, from the same report

`attitude.heading` kept the PREVIOUS aircraft's name across a switch — following
N81AB while heading read "N460DF is not broadcasting a heading". It is written
outside `FOLLOW_WRITES` (it has its own two-case message) and that write only
happens where a report exists. Failed with the waiting reason now, with a test
that follows two aircraft and asserts no field names the abandoned one.

### Open, and NOT guessed at

**`ResizeObserver loop completed with undelivered notifications`** — nine on the
iPad in the 1.23.1 report, **zero in the 1.24.0 report**. Absent is not
diagnosed. Do not close this on one clean report.

**`position.accuracy` FAIL "no update for 120s (limit 120s)"** while following:
the device's own geo sensor ageing out because follow mode stops it writing.
True, but it does not SAY that, which is the same half-true sentence 1.22.1
fixed twice elsewhere.

---

## STAGED NOW — 1.24.0, and the route probe ANSWERED, 2026-08-04

**1.24.0 is on staging: https://staging.fauxplane.pages.dev**

### HTTP 201 — the request shape is ACCEPTED

Noah's 1.23.1 report carried the first real probe:

    WHAT THE ROUTE FEED ACTUALLY SENT
      callsign N460DF   HTTP 201   entries —
      the reply carried no readable keys — see the HTTP status above

**201, not 422.** The whole probe was designed around a 422 — FastAPI names the
rejected field in `detail`, so a wrong body diagnoses itself. That branch never
fired, which means `{planes:[{callsign, lat, lng}]}` is a shape adsb.lol
ACCEPTS. The guess was right and the remaining problem is elsewhere.

**And the probe could not say where**, which is the lesson. "No readable keys"
cannot distinguish:

- an EMPTY body,
- a body that is not JSON at all,
- valid JSON of a shape `parseRoute` does not recognise.

Those need three different fixes and the report collapsed them into one
sentence. `describe()` was built for the failure case and had nothing to say
about success. **A probe that reports a status without the body is half a
probe**, and it took a full round trip through Noah's device to find that out.

It now reads `res.text()` FIRST and parses after, and carries `contentType`,
`bodyLength`, `parsed` and a 400-character `bodyPrefix`. The unit tests assert
the three states are tellable apart, and that a 50 KB reply reports its true
length while only a bounded prefix travels.

### A real defect in the same report: a field naming the wrong aircraft

Following **N81AB**, every field read "waiting for the first report from
N81AB" — and `attitude.heading` read **"N460DF is not broadcasting a heading"**.

`attitude.heading` is not in `FOLLOW_WRITES`: it has its own two-case message
(the aircraft broadcasts a heading, or it does not) and that write only happens
in the branch where a report EXISTS. So switching aircraft before the first
report kept the previous one's sentence. It is failed with the waiting reason
now, and a test drives two `follow()` calls and asserts no field mentions the
abandoned callsign.

The diagnostics report also NAMES a stale probe rather than showing it silently:
the block said `callsign N460DF` under a heading that never admitted the panel
had moved on.

### Working, confirmed on his device

- **1.23.0's countdown**: `adsb.fi not asked — refused us (HTTP 403), not asking
  again for 6m 17s` — the remaining time, not the recorded length.
- **1.22.0's follow windows**: the filter reads ALIGNED, converged, residual
  0.04°, with `MOUNT LEVELLING cradle -38.4 deg pitch` being subtracted.
- **1.23.1's icon**: he is on `fauxplane-1.23.1` with no complaint about it.

### Open, not fixed

**`ResizeObserver loop completed with undelivered notifications`** — nine of
them, in one burst, on the iPad. Benign in the sense that nothing visibly
breaks; not benign in that it fills the console-capture block that exists to
show REAL errors. Not diagnosed yet, and deliberately not guessed at.

**`position.accuracy` and `position.altitudeAccuracy` FAIL with "no update for
120s (limit 120s)"** while following. That is the device's own geo sensor ageing
out because follow mode stops it writing — arguably correct, but the reason does
not SAY that, which is the same class of half-true sentence 1.22.1 fixed twice.

---

## STAGED NOW — 1.23.1, waiting on Noah

**1.23.1 is on staging: https://staging.fauxplane.pages.dev** — `main` is on
1.23.0.

Noah, 2026-08-04: *"The icon at the top of the (i) panel does not match the
app's icon close enough, and looks like an error because it is different."*

### The mark was a REDRAW, under a comment claiming it was not

`.gate-mark` at the top of the first-run card was a hand-inlined SVG. Against
`icons/icon.svg` it differed in every particular: no dark rounded-square plate,
a LEVEL horizon rather than the icon's deliberate 12-degree bank, no pitch
ladder, no dark outline under the aircraft symbol, and palette tokens
(`var(--sky)`, `var(--symbol)`) instead of the icon's own fixed colours.

Same idea. Different drawing. And the comment directly above it read *"The mark
is the SAME attitude indicator the app icon is"* — **an assertion that was
false, which is almost certainly why nobody ever checked it.**

It is now `<img src="/icons/icon.svg">` — the file the manifest declares and the
browser uses as the favicon. **A redraw that RESEMBLES the icon is the defect**,
because it drifts the moment either copy is touched; the only version that
cannot drift is the identical file. It is already in the service worker's
precache, so it still needs no network, which was the only thing the inline copy
was buying.

The gate reads `manifest.webmanifest`, compares its first icon's `src` against
the mark's, and fails on a mismatch, a 404, or a mark under 16px. The plant
swaps in `icon-192.png` — a real icon **of this same app** — and it goes red,
because resembling it is not the requirement.

### How this session got it wrong first, which is the part worth keeping

Asked about "the icon at the top of the (i) panel", the session grepped
`info.js` for "icon", found none, and told Noah **"nothing in that panel carried
the app's identity at all"**. The mark was in `index.html`, in the first-run
card. One file was searched and a claim was made about the whole surface.

Then, acting on that invented finding, it ADDED A SECOND ADI MARK to the panel
header — which would have shipped two different attitude indicators in one
dialog — and separately reshaped the header (i) button, which Noah had not
mentioned and which his words explicitly excluded.

Noah: *"FUCKING ASK IF YOU DO NOT IMMEDIATELY KNOW"* and *"DON'T EVER FUCKING
GUESS."* Both additions were backed out to the byte before the real fix went in;
`index.html`'s header block and `styles.css` match 1.23.0 exactly.

**The rule: a grep that finds nothing proves nothing about a surface you have
not looked at.** "I did not find it" and "it is not there" are different
statements, and only one of them was earned. Where a screenshot exists, read the
screenshot.

---

## PROMOTED — main reached 1.23.0, and the sweep got a selector, 2026-08-04

**Noah said "Promote to main" on 2026-08-04**; `main` fast-forwarded cleanly
from 1.22.1 to **1.23.0**, live at https://fauxplane.pages.dev. Every gate ran
against the exact commit, including the plant sweep WHOLE at 57/57 — a promote
is the one moment that cost is obviously worth it.

### Why the sweep got a selector, and why the split matters

Noah, the same day: *"you make a small change and then rescan everything else
that has no relationship and could not have changed… I think you are wasting a
lot of time if you are."*

He was right. Measured here: the unit suite is **1.2 s** for all 366 tests,
palette 0.2 s, docs 0.2 s — and the plant sweep is **~45 minutes**, of which the
24 browser-driven plants are ~95%. Four whole sweeps ran that day; two of them
proved that a build-stamp contrast plant still worked after an edit to a
countdown.

The reasoning behind that was hub LESSONS §38 — a targeted re-run tests the
plants you SUSPECT, which is the reasoning a fault-injection harness exists to
replace — and it was being over-read. **§38 came from a case where the GATE
ITSELF changed.** It argues for sweeping whole when the thing doing the
measuring moves, not when a leaf module does. That refinement is now hub
LESSONS §51.

`--changed=<ref>` asks git which files moved and runs the plants targeting them.
Mechanical, because judgement is the part that drifts. It escalates on anything
that can blunt a plant which does not name it, and it PRINTS what it skipped — a
partial run closing with a full run's line is a silent cap.

**Then the split, because the first version did not help where it mattered.**
`plant.mjs` is on its own escalation list — editing the injector can break any
plant — and almost every release ADDS a plant, so almost every release escalated
and the selector saved nothing on exactly the changes it was built for. The
plants are now DATA in `scripts/plants.data.mjs`; the harness is CODE in
`plant.mjs`. Adding a plant is a data change and does not escalate.

**KEEP THE DATA FILE INERT.** Nothing in it may import, branch or compute. The
moment a `find` string is built rather than written, it stops being data and the
escalation rule it exists to satisfy is quietly false.

**The split opened a hole and it is closed.** Selecting purely by target file
would skip a plant added in the same commit unless its target happened to change
too — and a plant nobody has watched fail is not evidence, which is this
harness's entire premise. A plant new or edited in the data file now always
runs, found by parsing the diff for added `name:` lines.

Verified: the whole sweep is 57/57 through the split harness, `--dry` selects 57
by default and 1 under `--only`, and one plant was driven end to end — injected,
caught, restored, backup directory empty.

---

## Previously staged — 1.23.0, the countdown

**1.23.0 is on staging: https://staging.fauxplane.pages.dev** — `main` is on
1.22.1 (promoted 2026-08-04; the record of that promote is below).

Noah, on a 1.22.1 screenshot showing `NO CONTACT` above *"Standing off from the
aircraft feeds for a moment"*: **"No indication of how long I'll wait before the
radar will work…like the delay countdown, maybe?…. Just looks broken."**

He is right, and the app already knew the number. `trafficAllowedAt` in `app.js`
is the client's own exponential backoff clock and has existed since the 429
work; nothing ever put it on screen. A wait with no number is indistinguishable
from a hang, which is exactly what he read it as.

### The countdown is about the ATTEMPT, never the RESULT

`NO CONTACT · RETRY 12s` means WE WILL ASK in twelve seconds. It does not mean
the radar will work in twelve seconds — the next answer may be another refusal.

That distinction is the whole design and it is gated: one plant swaps "Asking
again in 12s" for "Working again in 12s" and the tests go red. **A panel that
will not invent a groundspeed does not get to invent an ETA**, and a countdown
that promised a working scope would be a fabricated fact of exactly the kind
1.22.1 removed two of.

### It counts to the right instant, which is not the obvious one

The countdown targets **the next TICK**, not `trafficAllowedAt`. The interval
fires every `TRAFFIC_INTERVAL_MS` regardless and returns early while the backoff
holds, so the moment the backoff expires is NOT when a request happens — the
first tick at or after it is. Counting down to the wrong one would reach zero
and then sit there, which is the precise failure Noah was already describing.

`nextAttemptAt()` rounds up to that tick. `nextSweepAt` is stamped on every
tick including the ones that return early, because the cadence is what the
countdown measures against.

### The server's half of the same complaint

`inCooldown` returned the stand-off's length AS RECORDED, so the panel said
"standing off for up to 600s" for the whole ten minutes — including the last
thirty seconds. The record now stores an absolute `until` and `inCooldown`
returns `remainingS`; `standoffPhrase()` is one helper used by both endpoints so
the wording cannot drift.

**A record with no `until` reports "no expiry recorded" rather than zero**,
because zero means "ask now" — an instruction, not an admission of ignorance.

### Also in this report, and NOT a defect

The 1.22.1 report is a healthy panel: 5 of 41 fields failed and every one is
correct. `position.track` FAILs because GPS reports no track at rest and the
panel says the magnetic heading is shown instead; TAS and CAS fall out of that;
AoA needs a groundspeed over 20 kt; there is no ambient light sensor. The three
`nav.*` fields are listed as NOT APPLICABLE rather than failures. The filter is
`ALIGNED`, `converged true`, residual 0.16°. Nothing to fix.

**Note the device**: the user-agent says `Macintosh` — that is an iPad, which
1.22.1's own DEVICE block resolves correctly via `window.orientation` and a
1180x734 landscape viewport. Do not read that string as a Mac.

---

## PROMOTED — main reached 1.22.1, 2026-08-04

**Noah said "Promote to main" on 2026-08-04.** `main` fast-forwarded cleanly
from **1.15.0 to 1.22.1** — eleven releases, eighteen commits, no merge. Live at
**https://fauxplane.pages.dev**; staging is the same commit.

Every gate was run against the exact commit being promoted, not against an
earlier one: 359 tests, the accessibility gate over three viewports and two
palettes and both input modes, palette, no-grid, and the §7h PWA gate. The
54/54 plant sweep behind 1.22.1 is recorded in that release's entry.

**What went out, in one line each:**

- **1.16.0** point the radar at any airport (702 bundled, Unlicense)
- **1.17.0** the panel can say it has gone out of date (§7h)
- **1.18.0** the instruments get their screen back
- **1.19.0** runways on the scope, and the horizon's root cause — the gyro
  propagation was using a small-angle shortcut only exact bolt upright
- **1.19.1** landscape gets its instruments back
- **1.19.2** stop knocking on a door we know is locked (provider stand-off)
- **1.20.0** the refusal, in words the reader can use
- **1.21.0** the followed flight says where it is going, and says it is a guess
- **1.21.1** the route feed was eating the radar's allowance
- **1.22.0** the panel stops crossing itself out on a working feed
- **1.22.1** two sentences the panel was saying that were not true

**THE ONE THING STILL WANTED FROM A REAL DEVICE:** follow a flight, then open
the diagnostics report behind the version stamp and send it. The route feature
ships with a request shape that is a REASONED GUESS — see the 1.21.0 entry for
why nothing here could confirm it — and the report carries
`WHAT THE ROUTE FEED ACTUALLY SENT`. If the route reads as unavailable, that
block is the answer rather than a bug report.

**Still open, and NOT understood:** in the 1.21.1 report, orientation stopped
32 s before capture and geolocation 57 s before, with a good gravity vector
still in the raw block. That looks like backgrounding, but `markStale` should
have caught it and did not. A report taken immediately after returning to the
app would settle it. No reason string has been written for it, deliberately —
see the 1.22.1 entry.

**The next session stages onto `staging` as usual.** This block is rewritten by
whichever session stages the next candidate; a staged build nobody can see is
the failure it exists to prevent (Doctrine §7).

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

**A route (origin and destination).** Noah asked for this the day the airframe
picker landed — *"a 'flight plan' page with a map and details sounds good if
that's real and possible?"* — and it sat here blocked on terms nobody could
read, because this sandbox cannot reach `api.adsb.lol` at all.

**UNBLOCKED 2026-08-04.** Noah opened adsb.lol's OpenAPI page in Safari and sent
it. Their Terms of Service, verbatim:

> "You can use the API for free."
> "In the future, you will require an API key which you can get by feeding to
> adsb.lol."
> "If you want to use the API for production purposes, please contact me so I do
> not break your application by accident."

And the licence, which is the part that settles it:

> "The license for the API **as well as all data ADSB.lol makes public** is
> ODbL. This is the same license OpenStreetMap uses."

A blanket ODbL grant over the API and its data. No non-commercial restriction —
this app is PolyForm Noncommercial by its own choice, not theirs — and the
attribution ODbL requires is already rendered from whichever provider answered.

**The endpoint is `POST /api/0/routeset`**, listed on that page as "Api
Routeset", beside `GET /api/0/airport/{icao}` for airports by ICAO. The schema
list names `PlaneInstance` and `PlaneList`, so it takes a SET of aircraft rather
than one — almost certainly callsign plus position, returning a route per plane.

**"Plausible" is their word and it belongs on screen.** A route inferred from a
callsign is not a filed flight plan, and a panel whose entire contract is that
values trace to a source must not present an inference as a clearance.

**What is still not known: the exact request and response shape.** The schemas
are collapsed in the capture and the sandbox cannot fetch the spec. Two honest
routes, and the first is the one this repo has used before:

- **Build it with a shape probe**, exactly as the traffic feed was. The Function
  calls the endpoint and the diagnostics report gains a "WHAT THE ROUTE FEED
  ACTUALLY SENT" block listing the keys that came back, so Noah's device
  reports the contract on its first real run. Until a route is understood the
  panel says so rather than inventing one. This is what confirmed the Mode S
  crew readouts, which had been built from published field names without a
  single real response ever having been seen.
- Or expand `PlaneList` / `PlaneInstance` on the docs page and screenshot them,
  and it can be built against the real contract immediately.

**And the production courtesy is a real instruction, not boilerplate.** "Please
contact me so I do not break your application by accident" is an invitation
worth taking up if this ever goes beyond a hobby panel — recorded here so a
later session does not have to decide whether it counted.

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

## 1.22.1 — two sentences the panel was saying that were not true, 2026-08-04

Noah sent a **1.21.1** diagnostics report — so it predates 1.22.0's window fix
and does not test it. It contains two DIFFERENT defects, both of them fabricated
reason strings, and both found by reading the report against itself.

### "This device reports no magnetic heading" — on a phone with a compass

The report's root-cause list:

    attitude.heading   no earth-referenced heading source (this device reports
                       no magnetic heading)

Twenty lines below, in the raw block:

    webkitCompassHeading   278.3

and in the filter: `heading 279.5`. **His iPhone has a compass and was reporting
278.3°.** It had stopped SENDING while the page was backgrounded —
`orientation.compass` had aged out five seconds earlier.

`fusion.read()` returns `hasHeading` false for two unrelated reasons — no
heading at all, and a heading too old to use — and `app.js` printed the same
sentence for both. The one it printed was the wrong one.

**A reason string is a value like any other on this panel, and inventing one is
the same defect as inventing a number.** It is worse in one respect: a wrong
number looks wrong, while a confident wrong sentence sends the reader off to
replace hardware that works. The filter now returns `headingReason` saying which
of the two it is, and the quiet-compass branch carries the last reading it
actually had.

### The FOLLOW banner claimed a broadcast that had never arrived

Same report. Every followed field:

    position.groundspeed   waiting for the first report from PXT466

and the traffic feed:

    traffic   FAILED — adsb.lol rate limited us (HTTP 429...) | adsb.fi not
              asked — refused us (HTTP 403), standing off for up to 600s

So the aircraft had never reported once. And the banner across the top said
*"PXT466 — this panel is showing that aircraft's broadcast, not this device"*.

**It was showing nothing.** That sentence sits at the top of a panel of red
crosses, which is exactly why the display "looks broken without any data" — the
app was insisting it HAD data. The wording is now a pure function
(`followBannerText`) with both branches tested; before the first report it says
so and carries the feed's own reason.

### What this report does NOT show

**It is not a test of 1.22.0.** The wall of crosses here has a different cause
from the one 1.22.0 fixed: the freshness-window bug crossed out fields whose
data HAD arrived, and this is a followed aircraft that never reported at all
because the feed was refusing us. Both produce the same screen. Only the first
is fixed by the windows; the second is a fact about the feed, and 1.22.1 makes
the panel say so instead of contradicting itself.

Worth noting for the next session: **his device was still on 1.21.1 and the
report says `a newer version is not waiting` as of 15:28**, so 1.22.0 had not
reached it. Do not read an old report as a verdict on a new release.

### The other thing in the report, unresolved

`orientation.beta` and `.gamma` FAIL at `no update for 3s (limit 3s)`, the
filter coasting 32 s with "no gravity reference", and position 57 s old — while
the raw block holds a perfectly good gravity vector (`|g| 1.011`). Sensors and
geolocation both stopping, at slightly different times, on an iPhone in Safari
with `standalone false`, is what BACKGROUNDING looks like. `markStale` on
`visibilitychange` exists but these aged out rather than being marked, so either
the event did not fire or the app was foregrounded again by the time the report
was taken.

**Not fixed here, because it is not yet understood** — and the honest reason
string for it would be "this device stopped sending sensor events while the
panel was in the background", which is a claim no session has evidence for yet.
It needs a report taken immediately after returning to the app.

---

## 1.22.0 — the panel was crossing itself out on a working feed, 2026-08-04

Noah, with three screenshots: *"It works, but the aircraft have a delay before I
can touch them? Seems to pull extra data first? It would be nice to have an
indicator that shows when the radar is populated and another for any other
states like being ready to tap. This aircraft makes the whole display look
broken without any data, despite being 'turned on.'"*

### The wall of crosses was ARITHMETIC, not a broken feed

The third screenshot is following DAL2229 with GS, LOAD G, ATT, GPS ALT, VS,
HDG and TURN all crossed out at once, PWR ON, banner reading FOLLOWING. The
heading flag said it outright: **`no update for 5s (limit 5s)`**.

`attitude.heading` has `staleMs: 5000` in the field registry. That is the right
number for a magnetometer this device reads many times a second. **A followed
aircraft fills the same field from a poll that runs every 10 s** — so the limit
was HALF the cadence, and the field was structurally incapable of being anything
but FAIL. Every followed field had a version of this; heading was simply the one
that could never win at all.

The registry's own comment explains how it happened: *"Windows are chosen from
how fast the underlying quantity actually changes, not from how often we happen
to poll."* That is correct for a sensor and wrong for a feed. **An observation
cannot arrive faster than the thing observing it reports**, and provenance
describes the observation.

### The fix: the OWNER of a field declares its window

`state.write` takes `windows`, the field carries them, and `publishNow` prefers
them over the registry's. The registry is the default rather than the authority.

That is not a softening of the honesty rule — it is the honesty rule applied
properly, and it lands exactly where this app already says it should: *"exactly
one source owns each field at a time — following an aircraft moves ownership
wholesale."* Ownership now moves the freshness window with it.

`FOLLOW_POLL_MS` and `FOLLOW_WINDOWS` are declared TOGETHER in `traffic.js`, and
`app.js` imports the poll rather than declaring its own copy — the two numbers
being in different files is the entire reason they were allowed to contradict
each other. The test asserts the RELATIONSHIP (`freshMs >= 2 polls`,
`staleMs >= 6 polls`), never the numbers, so changing the cadence cannot quietly
re-create the defect.

**The windows themselves are not invented**: 20 s / 90 s is what the registry
already chose for the other ADS-B fields (`nav.selectedAltitude` and friends).
This is matching a precedent, not picking a threshold that makes a screenshot
look better.

### The indicator he asked for

A chip above the scope, in five states, driven by `radarReadiness()`:

- **LISTENING** — no sweep yet
- **CONTACT · n** — aircraft on the scope, tap one
- **AGEING · n** — the feed stopped answering; these are the last ones really
  heard, with their age, and they are still tappable
- **NO CONTACT** — which is TWO different facts and says which: a sweep that
  worked and found nothing, or a feed that will not answer
- **FOLLOWING <callsign>**

`tappable` is a SEPARATE channel from the state, because "populated" and "ready
to tap" are different questions — an ageing scope is tappable and a fresh sweep
over an empty sky is not. That was Noah's distinction and he was right to draw
it.

**One function, read by the chip AND by the tap handler.** An indicator that
computes "ready to tap" separately from the code handling the tap is two
opinions about one fact — hub LESSONS §42 — and it would drift into saying CONTACT
over a scope that ignores taps. Which is worse than no indicator, because then
the reader concludes the fault is theirs.

**And that drift happened INSIDE the function while it was being written.** The
`contact` branch returned `tappable: true` as a literal rather than the computed
value, so a healthy sweep with no centre yet would have advertised a tap that
returns immediately. A unit test caught it. The lesson had been written down the
day before and was still committed one function later.

### On the delay before a tap registers

Not reproducible as a broken handler: tap-to-follow was driven under real touch
emulation at phone size across the canvas tap, the heard-now list and the centre
picker, and all three work. What he was seeing is the two states above being
indistinguishable — a scope drawn but not yet swept looks exactly like one that
is ready. The indicator is the fix for that, not a change to the tap.

---

## 1.21.1 — the route feed was starving the radar, 2026-08-04

Noah, within the hour of 1.21.0 landing: *"You broke touch to add on the
radar."*

**He was right, and the touch handling was not the fault.** Tap-to-follow was
driven under real touch emulation — canvas tap, the "heard right now" list and
the centre picker, at phone size — and all three work. What 1.21.0 broke was
the thing that puts aircraft ON the scope, and an empty scope has nothing to
tap. The report was accurate; my first instinct to look at the tap handler was
not where the defect lived.

### The defect, in one string

`functions/api/route.js` recorded and read its provider stand-off under
`adsb.lol:route` instead of `adsb.lol`.

That reads like careful scoping and is exactly backwards. **adsb.lol rate limit
per IP across their whole API**, so a per-endpoint cooldown is not a cooldown.
It failed in both directions:

- a 429 earned by a ROUTE request never told the TRAFFIC feed to back off, so
  the traffic feed kept asking and kept being refused;
- a traffic feed already standing off from adsb.lol still got asked for routes,
  spending the very allowance the stand-off existed to protect.

`inCooldown`'s own docstring says *"the standing refusal for a PROVIDER"*. The
call site ignored it.

**The symptom is not a missing route.** It is an EMPTY SCOPE, because the
aircraft feed is the one running every ten seconds behind the surface the
reader is actually looking at.

### What else changed

The client will not ask for a route at all while the traffic feed is failing.
Both endpoints are one service on one shared Cloudflare address; a route is a
nicety and the aircraft ARE the instrument. Buying a line of text with the
contents of the radar is the wrong trade, and now it cannot happen.

### Why nothing caught it, and what does now

Three tests were written for this and the first two were worthless. They called
`noteRefusal` with the right id and asserted the right consequence — **and they
both passed while route.js was writing the wrong key**, because they never went
near route.js's call site. That is hub LESSONS §42 in this repo, one day after
it was written down: *a gate on the decision function cannot see the path that
never asks it.*

The third drives `onRequestGet` itself with a stubbed `caches` and a 429, and
reads the key the handler actually wrote. It was watched failing on the shipped
bug before being kept. There is a plant for it too.

**And the accessibility gate only ever drove a MOUSE.** It ran `checkRadarTap`
with `page.mouse.click`, was green throughout, and the device this app exists
for has no mouse. The check now runs under both input modes, so a touch-only
break has something watching it. That gap was invisible for as long as the
check has existed.

---

## 1.21.0 — the route, shipped as a probe rather than as a guess, 2026-08-04

Noah asked for this the day the airframe picker landed: *"a 'flight plan' page
with a map and details sounds good if that's real and possible?"* It is real.
It took until 2026-08-04 to build because the terms had to be read first, and
then because the endpoint's request shape turned out not to be knowable from
here.

### What shipped

Follow an aircraft and the banner shows `KSFO → KJFK`, with every intermediate
stop if the flight has any, and the word **plausible** beside it. adsb.lol serve
it from `POST /api/0/routeset` under the same ODbL grant as their aircraft data.

### The word "plausible" is the feature, not a disclaimer on it

adsb.lol infer a route FROM THE CALLSIGN — UAL328 flies the sector United
usually fly it on. That is a good inference and it is not a filed flight plan.
The aircraft may be on a diversion, a repositioning leg, or a different sector
under a reused callsign. This app crosses out a pitch angle it cannot measure;
it is not going to present an inference as a clearance.

So `plausible` is carried in the payload from the Function rather than added by
the client, exactly as the traffic attribution is — if adsb.lol ever report a
route as confirmed, the panel will say confirmed BECAUSE THEY DID.

**It is visible text, and the first draft got that wrong.** The caveat went into
a `title` attribute, which is no attribute at all on a phone or an iPad: there
is no hover on a touch screen. It is a `<span>` beside the route now, it wraps
onto its own line rather than being hidden at a narrow width, and the a11y gate
measures its bounding box rather than reading `textContent` — because
`textContent` would have found the `title` version and passed.

### The request shape is a HYPOTHESIS and the release says so

adsb.lol's OpenAPI page names the schemas `PlaneList` and `PlaneInstance`
without expanding them in the capture we have, and this sandbox cannot reach
`api.adsb.lol` at all. Three options existed:

- Ask Noah for a fourth screenshot, of a page he had already screenshotted
  twice, hoping the schema expanded this time.
- Wait, and ship nothing.
- **Send the best-reasoned shape and report what comes back.**

The third is strictly better and it is what shipped. The Function sends
`{planes:[{callsign, lat, lng}]}` — the shape the tar1090 family uses, which
adsb.lol's lineage descends from — and the diagnostics report gained a
`WHAT THE ROUTE FEED ACTUALLY SENT` block carrying the HTTP status, the
top-level keys, the per-entry keys and, critically, the **validation detail**.

The endpoint is FastAPI. FastAPI answers a body it does not like with a 422 and
a `detail` array naming the exact field it rejected, with `loc`, `msg` and
`type`. So a wrong guess is SELF-DIAGNOSING: the report will say
`REJECTED at: body.planes.0.lat says: field required`, and the next release is
a correction rather than another guess. The same method settled the Mode S crew
readouts, which had been built from published field names without a single real
response ever having been seen.

**If the route does not appear on this build, that is the expected outcome of
an unconfirmed hypothesis, not a fault.** What it will never do is invent one:
an unreadable reply reads as unavailable.

### The cost to a volunteer service is one request per flight

A position changes every second and a route does not change at all. The client
guards on the CALLSIGN rather than on a timer, so following one flight for an
hour asks once and switching flights asks again immediately — the shape of the
question rather than a rate the client made up. The Function caches a
successful answer for ten minutes; an unsuccessful one for nothing, so a fix
upstream is picked up at once.

**The announcement needed its own guard, and that is a real distinction.**
Stopping the REQUEST is not stopping the SPEECH: the cached answer still came
back every sweep, so `announcer.say` fired every ten seconds for as long as the
flight was followed. A screen-reader user would have heard the route read out
six times a minute. The guard is on what is currently on screen, not on what
was last fetched.

### What the gates now hold

- Two plants, both watched going red. One deletes the caveat while leaving the
  route — **the way this feature actually rots**, because the banner is cramped
  and the caveat is the longest thing in it, so "tidying" it is the obvious
  edit. One makes the parser accept a single airport, which would render
  `KSAC → KSAC`: a departure and an arrival at the same field, produced by
  arithmetic rather than reported by anyone.
- The a11y gate follows an aircraft, **switches back to the panel**, and
  measures both elements. Without the switch it read 0x0 for a perfectly
  visible element, because the banner lives inside `#page-pfd` and that page is
  `[hidden]` while the scope is up. The fix was to make the check walk the
  reader's path, not to weaken the assertion.
- It also counts the route requests and fails above one per flight.
- Nine more unit tests over the wording, because the wording IS the
  implementation here: a reader who is not a pilot has to be able to tell "we
  have not asked yet" from "there is no route" from "here is a guess", and
  those are three different facts about a flight.

### The sweep found a flaky gate, which is the thing it is FOR

The full 49-plant sweep came back **48/49**, with
`update: a waiting version is never mentioned to the reader` marked UNPROVEN —
the gate went red, but about the wrong thing: *"a second worker was served,
none is waiting, and no controllerchange fired"*. Run on its own, that same
plant is caught cleanly.

**The cause was a fixed sleep pretending to be a wait.** `checkUpdateStrip`
called `reg.update()` and then `waitForTimeout(1200)`. Installing this app's
worker means precaching forty-nine shell files plus a 317 KB airport database;
1200 ms covers that on an idle machine and does not cover it on the
forty-ninth browser of a sweep. So the check asked "is anything waiting?" of a
worker that was still installing, and reported a browser that had not seen an
update — a sentence that was simply false.

It polls for the state now, with both exits being real answers (something is
waiting, or a worker seized the page) and a twenty-second deadline that means
a genuine failure rather than a slow machine.

**Nothing was wrong in the app**, and that is the uncomfortable part: an
intermittently-wrong check is worse than one that never worked, because its
green reads as coverage. The harness is what caught it — the plant's verdict
was UNPROVEN rather than "caught", which is precisely the distinction it exists
to draw. This is the second time in this repo that fixing or running a check
has exposed the check rather than the code (hub LESSONS §37, §38), and the same
conclusion holds: **run the sweep whole.** The gate changed in this release, so
it was run whole again afterwards.

### Still owed

No map. The route is two airport codes, not a drawn line — that waits until the
shape above is confirmed, because drawing a line is only worth doing once there
is reliably something to draw.

---

## 1.20.0 — the refusal, in words the reader can use, 2026-08-04

Noah, 2026-08-04: *"I'm not getting a receiver."* That is the right call and it
settles the rate limiting as a PERMANENT CONDITION rather than an open problem —
which changes what the app owes the reader about it.

**What was on the face of a gauge**, photographed on his phone:

    No traffic: adsb.lol rate limited us (HTTP 429; cf-ray a258e8a82ff1fa4e-SJC)
    | adsb.fi returned HTTP 403 — server: cloudflare; ray a258e8a9483dfa4e-SJC;
    Attention Required! | Cloudflare

Every word true, and every word written for whoever is debugging the Pages
Function. A Cloudflare ray ID is not a thing the reader can act on, and this
panel is for someone building a 747 cockpit in his house.

**Three things the sentence now carries, and one it deliberately does not.**

It says WHAT happened, in the reader's terms — rate limited, refused, standing
off, or unreachable.

It says WHY, **but only for the case where the cause is actually settled.** A
429 on a shared Cloudflare egress address is a diagnosis this repo has done the
work to earn; a 403 from a firewall or a dead network is not, and guessing would
repeat the groundspeed reason that could not tell two causes apart and said so
in a way that read as if it could. A test asserts the cause is NOT offered for
those.

It says what is still true on screen: the aircraft already drawn are real
observations that did not stop being true because the next request failed. A
stale scope and an empty sky mean completely different things and the panel has
to say which it is showing.

And it does not HIDE anything. The full chain is still in the diagnostics report
(§7f) and on the element's `title`, which is a long-press away and a paste away.
**Summarising an error is help; hiding one is not, and the difference is whether
the detail is still reachable.**

### Verified

**326 unit tests, 47/47 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor, `pwa-check.mjs` green.**

The new plant puts the raw upstream chain back on the gauge, which is the exact
regression this release is about.

---

## 1.19.2 — the provider terms, read properly, and what they changed, 2026-08-04

Noah sent adsb.fi's terms page as a screenshot after asking for the providers'
terms. Two of the three sources are now READ FROM THE PUBLISHER, and one is
still not, which is stated rather than papered over.

### adsb.fi — read, from their own repository

`github.com/adsbfi/opendata`, and the screenshot of the rendered page agrees
with it word for word:

- "adsb.fi open data is for personal, non-commercial use only. You may not
  license, sell, rent, or lease any part of the data or the service."
- "The data and the service are provided as-is, without any warranty. You must
  cite adsb.fi and include a link to our home page."
- "The public endpoints are rate limited to 1 request per second, and the feeder
  endpoint to 1 request every 30 seconds."
- "Please contact us if you have commercial or higher request rate requirements."
- "These endpoints are publicly accessible, but we kindly ask you to support
  adsb.fi by setting up a receiver."

**And the sentence that changed the code:** "Making excessive invalid HTTP
requests results in a temporary IP address restriction. Requests returning a
400, 401, 403, 404, or 429 status code count toward the limit."

The panel already validated every parameter before sending, for exactly that
reason. What it did NOT do was stop asking a provider that had just refused —
and adsb.fi's refusal is a 403 from their firewall, returned on every single
attempt, before their API sees the request. So the failover was spending a
strike against an abuse threshold on every fetch, for a call that could not
succeed, from an egress address shared with every other Cloudflare tenant.

Retrying a refusal you can predict is not persistence. It is the thing that
sentence describes.

**The stand-off** lives in the edge cache rather than in a variable, because a
Worker isolate is short-lived and a per-isolate memo forgets between requests. A
403 gets ten minutes — a firewall block is a decision about who we are and will
not have changed in thirty seconds — and a 429 gets whatever `Retry-After` said,
because a 429 is an instruction (§15.3). Bounded at fifteen minutes so nothing
here can blind the panel, and the marker expires on its own.

**The skip is REPORTED.** "not asked — refused us (HTTP 403), standing off for
up to 600s" is a different fact from "they said no", and a reader deserves to
know which. The panel's contract is that a failure explains itself; that has to
include failures we chose not to incur.

**Also checked against the page and already correct:** adsb.fi's v2
`/lat/lon/dist` is deprecated in favour of v3, and this repo is already on
`/v3/lat/lon/dist`.

### adsb.lol — read, and it names the real fix

`github.com/adsblol/api`: "Rate limits are dynamic based on the environment
load." "If you get 4xx errors, you are doing something wrong." And:

> "In the future, you will require an API key which you can obtain by feeding
> adsb.lol. This will be a way to ensure that the API is being used responsibly
> and by people who are willing to contribute to the project."

**Both providers converge on the same answer, and it is not a third provider.**
The 429-on-first-request is a shared-IP problem: adsb.fi is 1 req/sec per
address and ours is shared, so a stranger's traffic spends our allowance. A key
is per-account, which is exactly what defeats that — and both services issue
access to feeders. adsb.fi go further and give feeder IPs automatic access to a
snapshot endpoint that is otherwise closed.

So the open item has moved from "find a better provider" to "run a receiver",
which is hardware and therefore Noah's call. It is in Open — needs Noah.

### airplanes.live — BOTH documents read, and they contradict each other

**CORRECTION, same day.** The section below was written from the Legal Terms
alone and concluded "the answer is NO... not an open question". Noah then sent
the API GUIDE, which is the document that actually governs the API, and it says:

> "No SLA. No Uptime Guarantee. Non-Commercial Use. Airplanes.live REST API
> lives @ https://api.airplanes.live/v2/. **Access does not currently require a
> feeder.** That might change in the future. Contribute to Airplanes.live if use
> the API."

> "RATE LIMITING — The Airplanes.live REST API is rate limited to 1 request per
> second."

> "TERMS — Read the terms of use."

**That is an invitation to automated access.** A published endpoint list, a
stated rate limit, and an explicit sentence about who may access it is a grant
you can point at — which is exactly the standard this repo set with OurAirports
and then failed to apply here.

**And it does not resolve the contradiction, because it defers to the document
that creates it.** "Read the terms of use" points AT the Legal Terms, which
prohibit "any automated system... that accesses the Services". The API guide
does not carve itself out of that sentence; it sends you to it.

So the position is: **their two documents disagree, and it is not ours to
resolve in our own favour.** The judgement below about not assuming the API page
overrides the Legal Terms still stands — but the reverse assumption, which is
what the old wording amounted to, is no better. What was wrong was the
certainty, not the caution.

**The decision is unchanged and the REASON has changed.** Not "they forbid it" —
"their documents contradict each other, only they can settle it at
`contact@airplanes.live`, and it would not fix anything anyway". A third
provider was never the answer to a shared-address rate limit: airplanes.live is
1 request per second per IP like everyone else.

**A lesson worth the embarrassment: a definitive ruling from one of two
documents is a guess wearing a verdict's clothes.** "Not an open question" was
written before the question had been fully asked, and the person who had to
correct it was Noah, with a screenshot.

### What the Legal Terms say, which is the other half

Their site 403s every automated fetch, so Noah opened the Legal Terms in Safari
and sent the whole thing back as a fourteen-page capture. **This is settled now,
and it is settled against using them.**

Under PROHIBITED ACTIVITIES, verbatim:

> "Except as may be the result of standard search engine or Internet browser
> usage, use, launch, develop, or distribute any automated system, including
> without limitation, any spider, robot, cheat utility, scraper, or offline
> reader that accesses the Services, or use or launch any unauthorized script or
> other software."

> "Engage in any automated use of the system, such as using scripts to send
> comments or messages, or using any data mining, robots, or similar data
> gathering and extraction tools."

And under intellectual property:

> "The Content and Marks are provided in or through the Services 'AS IS' for
> your personal, non-commercial use or internal business purpose only."

> "...no part of the Services and no Content or Marks may be copied, reproduced,
> aggregated, republished, uploaded, posted, publicly displayed, encoded,
> translated, transmitted, distributed, sold, licensed, or otherwise exploited
> for any commercial purpose whatsoever, without our express prior written
> permission."

> "If you wish to make any use of the Services, Content, or Marks other than as
> set out in this section or elsewhere in our Legal Terms, please address your
> request to: contact@airplanes.live."

**The non-commercial clause is not the problem** — this app is PolyForm
Noncommercial and clears it. The automated-access clause is, and a Pages
Function polling a REST endpoint is an automated system accessing their Services
by any reading of that sentence.

**The tension is real and it is not ours to resolve.** They publish a REST API
whose entire purpose is automated access, and this document is plainly a
website-terms template rather than something written for it — the giveaways are
a "Contribution License" section about posting comments and a clause about using
"a buying agent or purchasing agent to make purchases". A published API is an
invitation to automated access, and generic anti-scraper boilerplate probably
was not aimed at it.

**But we do not get to decide that on their behalf.** The rule this repo has
already paid for once is that a grant must be something you can point at.
OurAirports' README called the files "open-data downloads" and an earlier
session correctly rejected that as insufficient; what settled it was an
Unlicense committed to the repository. Here the only terms obtainable say the
opposite of what a grant would say. Assuming the API page overrides them, when
that page is the one we cannot read, is the same error with the sign flipped.

**So: not used, and there is nothing to do about it in code.** Their own terms
name the route if Noah ever wants it — `contact@airplanes.live` is the address
that document tells you to write to — and one email describing a free
non-commercial hobby panel would settle it either way.

**And it would not have helped anyway.** Their limit would be per-IP like
everyone's, and the 429 is a shared-address problem. A third provider was never
the fix; §0 in Open — needs Noah is.

### Verified

**321 unit tests, 46/46 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor, `pwa-check.mjs` green.**

The cooldown's pure parts take an injectable cache, so the stand-off, its
bounds, the Retry-After precedence and the per-provider isolation are all tested
in Node rather than asserted about a Worker nobody can run here.

---

## 1.19.1 — landscape gets its instruments back, 2026-08-03

Noah, on a landscape iPad: "Landscape is too cramped now." 1.18.0 moved the
value strip to the bottom, which was right, and then let it take a third of the
height, which was not — the horizon came out a letterbox, wider than it was
tall, and the strip STILL cut off mid-row.

**Measured before touching anything.** On a 1180x700 landscape iPad: panel 584px,
instruments 358px, strip 191px — a third — with 426px of content inside it. Each
row was **110px tall**, for "Groundspeed 0 kt LIVE".

**The row was the problem, not the cap.** `.ro-label` was `flex: 1 1 8rem` and
GREW to 190px of a 285px column, which pushed the provenance chip onto a second
line and the failure reason onto a third. The label takes its own width now and
the reading is pushed right with `margin-left: auto`, so a row is one line and
about 34px. Twenty-six of them need 238px instead of 770px.

After: instruments 358 → **431px**, horizon canvas 308 → **380px**, strip 191 →
**118px**. The cap came down from 34% to 21% as well, but the compaction is what
made that affordable rather than merely tighter.

The reason still gets its own line when there is one. That text is the entire
point of a crossed-out row and is never the thing that gets squeezed.

### Two defects found underneath it, and neither was the layout

**`.pfd-row { min-height: 0 }` lets the row be crushed below its own children.**
The zero is there so the horizon can shrink rather than overflow, and it does
that job right up until the row is handed less than the canvas and the plan view
declare as their floors — at which point they hang out of their parent and paint
over whatever is below. Found on a landscape phone in 1.18.0 (the gate named
both overlaps), and again here. `min-height: min-content` keeps the shrinking
and stops the overflow: the row gives up every pixel down to its children's
floors and no further.

**THE CONTRAST SAMPLER WAS READING TWO DIFFERENT LAYOUTS.** This is the one
worth remembering.

`page.screenshot({ fullPage: true })` grows the viewport to the document height
to take the shot, and any layout that depends on viewport height — percentage
heights, flex distribution down a column, a panel sized to fill the screen —
reflows while it does. Coordinates were being read at a 768px viewport and
sampled out of an image laid out at 1030px.

It surfaced as `power annunciator measured 1.00:1` — a foreground compared
against its own colour, which is exactly what happens when the pixel sampled for
the BACKDROP is the element's own text, still painted a hundred pixels from
where the measurement said it was. Nothing was wrong with the colour, the
element, or the hiding. Three separate investigations went past it: the DOM said
the element was hidden, `elementsFromPoint` said nothing amber was behind it,
and a hand-rolled replication of the sampler measured a perfectly good 10:1. All
three were right, and all three were looking at the DOM while the gate was
looking at a screenshot.

Growing the viewport BEFORE measuring makes the later capture a no-op and the
two agree by construction. Capped at 4000px so a tall document cannot mint an
enormous screenshot per registry row per page.

**The general shape, and it is the third time this file has recorded it: when a
check disagrees with your reasoning, suspect the CHECK'S INSTRUMENT before the
reasoning.** A gate that measures pixels has to be asked whether the pixels it
measured are the ones it thinks.

### And the sampler fix blunted a different check, which the sweep caught

The four contrast and target plants were re-run individually after the sampler
change, on the reasoning that a fix to an instrument can quietly blunt it. All
four still went red about their own thing, and that was the wrong four.

**The full sweep came back 44/45, with the magenta canvas sentinel UNPROVEN** —
the gate stayed GREEN with its fault planted. Nothing was wrong in the app. The
new viewport growth fires a `resize`, this app re-reads its canvas colour tokens
on one, and re-reading them HEALS the exact fault that sentinel exists to catch.
`checkContrast` ran before the sentinel in the page loop, so the sentinel was
looking at a page another check had already repaired.

**The fix is ORDERING, not un-doing the perturbation.** `checkContrast` expands
scroll containers, demotes modals, hides text and grows the viewport; any of
those could heal something, and a list of exemptions here would go stale on the
next one added. So the pixel checks now run first and the contrast pass last:
measure what the app produced, then mutate it.

**The general shape, and it is why the sweep is run whole rather than
selectively: a targeted re-run tests the plants you SUSPECT.** Picking the four
that seemed related was reasoning, and reasoning is what the harness is there to
replace.

### Verified

**315 unit tests, the accessibility gate green across 3 viewports x 2 palettes
x 5 pages, both palettes clearing every hard floor, `pwa-check.mjs` green.**

**Planted faults: 45/45.**

That number took two sweeps and the first one is the interesting half. The first
came back 44/45 with the canvas sentinel UNPROVEN — the blunting described
above. The ordering fix landed after it, so for a while the honest claim was
"44 from a sweep plus one re-proven individually", and this file said exactly
that rather than rounding up: a whole-sweep number would have been a claim about
a run that had not happened. The second sweep, against the new ordering, is
where the 45 comes from.

**Worth keeping as a habit: when a fix lands after the sweep that justified it,
the sweep is stale.** Both times this file has recorded a number it had not
earned, it was earned a few minutes later and nobody would have known the
difference — which is the whole argument for writing the smaller true number
down in between.

---

## 1.19.0 — runways, and bounding the horizon error, 2026-08-03

Six items off Noah's screenshots. Five were straightforward; the sixth is the
attitude filter and is only half done, which is stated rather than glossed.

### The horizon — ROOT CAUSE FOUND, and it was the kinematics

His ADI read `gravity 51° from the gyro — coasting on gyro` with the horizon
dozens of degrees over, after a gentle rotation. A first pass could only BOUND
it; the diagnostics report he sent afterwards is what made the cause findable.

**The gyro propagation used the small-angle shortcut.** It integrated
`pitch += q·dt` and `roll += p·dt` — φ̇ = p, θ̇ = q — which is exact at
wings-level and nose-level and wrong everywhere else. The real relations are

    φ̇ = p + (q sinφ + r cosφ) tanθ
    θ̇ = q cosφ − r sinφ

and the missing term is a **tan θ**. Measured, for a device turned about true
vertical at 20°/s for three seconds — a gesture during which the true pitch and
roll do not change at all:

- at a −10° tilt the old code integrated **−10.4°** of roll that was not happening
- at −30°, **−30.0°**
- at −45°, **−42.4°**
- at −60°, **−52.0°**

The full relations give 0.0° at every one. Fifty-two degrees against his
photographed fifty-one, at the tilt a phone sits at in a cradle or a hand.
Gravity was correct the whole time; the gyro invented the roll, and the
direction gate then rejected the one instrument telling the truth — which is why
the symptom presented as a gate problem and the first pass went after the gate.

**Why it survived eighteen releases.** His HEALTHY capture is at pitch −4.2°,
where tan θ is 0.07 and the missing term is worth a fraction of a degree. Every
report that looked fine was taken near upright. The failure needed a tilt, and
nothing recorded the tilt at the moment it went wrong.

**A second defect fell out of the same line.** At screen angle 0 the old form
used `omega.x` and `omega.z` and never touched `omega.y`, so gamma's zero-offset
could not be estimated — his report shows `gamma 0.00 deg/s` after 207 samples
beside two siblings that had both learned one. The yaw rate uses it now.

**Euler, not quaternion, and that is a decision rather than an oversight.** A
quaternion state has no singularity and is the better answer; swapping the state
representation of the filter this app's whole horizon depends on, with no
hardware to test against, is not a change to make in the same release that fixes
the thing it was hiding. `tanPitchClamp` bounds the term at a pitch of about
79°, past which Euler roll is undefined rather than merely large.

### The bound, kept as well `disagreeCoastMs` is how long the gyro is trusted
with no absolute reference, and it was four seconds. The error a reader sees is
roughly linear in it, because that is exactly what it bounds — measured on a
filter driven into divergence, four seconds lets the state reach 53° and two
seconds stops it at 32°, recovering inside half a second instead of four. Both
ROCKET tests still hold at 2000, because the hand-held lean they encode is about
a second long.

**Three wrong turns on the way, and every one was caught by a test or a plant
rather than by thinking harder.**

First: an `accelGateMaxDeg` that stood the gate down above 35°, on the argument
that rotating measured gravity that far while it still reads 1 g needs most of a
g sideways. The ROCKET test failed immediately — its corrupted sample is 60° off
at exactly 1 g, so the threshold readmits the precise defect the gate exists for.
The physics argument was fine and the discriminator was not: angle alone cannot
separate "the sample is corrupted" from "the state is wrong".

Second: correcting at the still gain once the budget expires, described in the
commit draft as the fix. Measured, it moves the two-second error from 5.7° to
4.3° — a real but marginal improvement, and nothing like the fix. The plant
written for it stayed GREEN, which is the harness saying so. It is kept, at its
actual size, and the plant now breaks the budget instead.

Third: the pitch half of the new kinematics shipped with a test that could not
see it. The wings-level scenario has φ = 0, where θ̇ = q cosφ − r sinφ reduces to
θ̇ = q exactly — so the correct form and the shortcut are indistinguishable, and
the plant for it sat GREEN. A banked scenario was needed before the assertion
meant anything.

**The lesson under all three: a number measured beats a mechanism argued.** Each
sounded right and was settled in one command by running the filter.

**And the harness caught an anchor drift, for the third time in this file.**
Adding the conceded-gate branch rewrote the `gain` expression into a nested
ternary, so the jitter plant's one-line anchor stopped matching and it went
STALE — proving nothing while still looking like coverage. It is re-anchored,
and the comment there now says which edit broke it.

### Runways (Noah: "Show the runway at airports.")

The bundle has carried 407 of them since 1.16.0 and nothing drew any — the
airports were only ever a type-ahead for the centre picker. Real thresholds,
both ends, so a line is the runway where it is and pointing where it points.

Closed runways are dropped, and so is any runway missing a threshold: drawing a
closed runway identically to an open one is the panel asserting something false
about a place. A runway under six pixels long is not drawn, because at 80 nm an
8,600 ft runway is a speck indistinguishable from a traffic symbol on a scope
whose job is telling marks apart. It reappears as the reader zooms in, which is
what a real ND does.

### Ground traffic is not traffic (Noah: "things are below me at ground level")

Right arithmetically, wrong as an instrument. This panel sits at a few hundred
feet on a desk, so an airliner parked 700 ft lower genuinely IS below by the
subtraction — and TCAS still would not draw it, because the question a traffic
display answers is what might come near you in the air. Sacramento's ramp was
filling his BELOW band with parked aeroplanes. Suppressed in the real bands
only; ALL is marked as ours and still shows everything the feed heard.

### The list, the archive, the welcome, the hub link

The aircraft list always scrolled — `max-height: 22rem; overflow-y: auto` — but
iOS hides a scrollbar until something is moving, so fifteen aircraft ended
mid-row at a hard edge with nothing to say the other eight existed. The count is
stated above the rows and the number below the fold under them, measured from
the DOM rather than from a row-height constant that would go stale the first
time the reader enlarges their text.

What's new listed every release ever cut, each a collapsed row, all stamped the
same day because they all shipped in a day. Three, then the rest behind one more
press. Nothing is deleted — a release note that disappears is worse than a long
list.

The welcome screen opened with housekeeping about where the instructions would
live afterwards. It opens with the app's own attitude indicator now, in the
app's own measured tokens.

And the hub link: the hub's rule is that every app links back, and only the
accessibility statement pointed there — a link to a POLICY, buried in the small
print, rather than to the place the other apps live.

### Verified

**315 unit tests, 45/45 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor, `pwa-check.mjs` green on all six §7h properties.**

The kinematics are asserted through `updateGyro` ALONE, with no accelerometer
corrections at all. The gate and the complementary blend both exist to paper
over exactly this class of error, and a test that let them run would have passed
with the bug in.

Not verifiable here: the horizon on real hardware. The maths is now right and
the arithmetic is checked, but this sandbox has no accelerometer and the next
report from Noah's device is the test that matters.

---

## 1.18.0 — the instruments get their screen back, 2026-08-03

Three things Noah asked in one message, and all three were defects rather than
preferences.

### "All the voice-over data does NOT need to fill MY screen"

He was looking at an iPad where the right-hand column of value cards took a
third of the display and the navigation display was a small box above it. The
CSS said it outright: `.readouts` had `flex: 56` against the plan view's 44, so
the text had a BIGGER share than the instrument, on the axis where the
instrument had least to spare.

**The reason given for the stacking was wrong on its own terms.** A canvas is
non-text content, so these numbers must exist as text somewhere — that part is
real and is not negotiable. Nothing about SC 1.1.1 says the text must be the
largest thing on the page or must sit beside the picture it describes. It is a
strip along the bottom now, auto-fitting into as many columns as the width
allows: two lines on a landscape iPad, one per line on a phone, no breakpoint
deciding which.

**Most of it was duplication.** Groundspeed is the GS tape, indicated altitude
is the ALT tape, vertical speed is the VS tape, heading is the compass rose,
pitch is the horizon — five of eight rows repeating what is drawn a few inches
to their left.

**What it broke on the way, and how it was found.** `.pfd-row` carries
`min-height: 0` so the horizon can shrink rather than overflow. That is correct
while the row is the only thing competing for the panel's height, and became
wrong the moment the value strip left the row and started taking a share of the
same column: on a landscape phone the row was handed 95px while its children
hold 12rem floors, so the canvas and the plan view hung 50px out of their parent
and straight through the strip below. The gate named both overlaps and the
measured boxes are in the fix's comment.

### "Why am I not seeing my first-time-run pop-up anymore?"

Because 1.12.0 moved it into the (i) menu at boot and nothing ever opened it.
The orientation SURVIVED — which `plant.mjs` has been proving for six releases —
and was never PRESENTED, which nothing checked. **Passing one half of a rule
while failing the other is exactly what shipped.**

It opens the (i) dialog on a profile that has not seen it, which is what keeps
it from becoming the thing he rejected before ("'Switch the panel on' still
takes all attention on the initial pop-up and reads like 'accept the terms'").
It gates nothing: the panel is live behind it, every control works, and closing
it is the only thing it asks. Being the same dialog the (i) button opens means a
reader who closes it has already learned where to find it again.

### "Why is home reference hard coded and not matched to user location?"

The constant exists for a real reason — acceptance criterion 1 is that the panel
comes up and is useful with every permission denied, so something has to be the
centre before a fix exists. What was wrong is that it never LEARNED. A reader in
Denver was anchored to a town in California for ever, on every cold start, no
matter how many fixes their device had given us.

A fix is now remembered, coarsened to two decimals — about a kilometre, which is
a privacy decision and not a storage one. This is a map centre and a query box
tens of miles across; storing a doorstep to centre a scope is a trade nobody
asked for. It outranks the constant and is beaten by a live fix, and it is
**never reported as a fix**: `fromFix` stays false and the label says it is the
last known position.

**And the footer stopped lying.** His screenshot has "Home reference Cameron
Park, CA 38.68, -121.00" along the bottom while GPS altitude read 88 ft from a
live fix a few inches above. Both sentences were on screen and only one was true
of the panel he was looking at. The line exists so nobody reads a pre-fix
distance as a distance from where they are, which means it has to stop saying it
the moment there is a fix. It names the centre in force now: your position, a
chosen airport, a followed flight, the last known position, or the constant.

### The defect underneath all of this: `hidden` did not mean hidden

The screenshot taken to check the new layout showed the UPDATE STRIP on a
first-ever visit — an offer to install the version that had just been installed,
which is the §7h.3 failure the gate had been asserting against for a whole
release. The probe said `hidden: true` while the element was painted at full
size.

**The user agent hides `[hidden]` with `display: none`, and any author rule
setting `display` outranks it.** `.update { display: flex }` did. Every check
that asks the DOM agreed nothing was shown.

It has now happened to `.page`, to `.follow-banner` and to `.update`. The first
two were each patched with their own `.thing[hidden] { display: none }` and the
next new element repeated it, because nothing was LOOKING. There is one global
`[hidden] { display: none !important }` now, and a check on every page and
viewport that fails on any element carrying the attribute with a non-zero box —
so the next component that sets `display` and forgets is caught on the release
that introduces it.

The gate's own §7h.3 assertion read `el.hidden` — the attribute — and passed
while the strip was on screen. It measures the box now. **A check that asks the
DOM what it was told is not checking what the reader sees.**

### Verified

**303 unit tests, 42/42 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor, and `pwa-check.mjs` green on all six §7h properties.**

Three new plants, each watched going red about its own thing: the orientation
never shown, the orientation shown every time, and an author `display` rule
outranking `[hidden]`.

Not verifiable here: whether the strip along the bottom is the right size on
Noah's actual iPad. It is capped at a third of the panel in the side-by-side
layout and scrolls beyond that; the failure state is the worst case, because
every crossed-out value carries a reason paragraph.

---

## 1.17.0 — the panel can say it has gone out of date, 2026-08-03

Doctrine §7h, which landed in the hub while 1.16.0 was being built and which
this repo failed on three counts the moment `pwa-check.mjs` was pointed at it.

**The defect is invisible by construction.** Caching is the business of not
asking the network, so a stale app looks perfectly fine. Nothing errors, nothing
is missing, and the version stamp reports the old version with complete honesty.
There is no symptom.

**`skipWaiting()` on install made it actively worse**, and it is the default
advice everywhere. The new worker claimed the OPEN page — a page already built
from the previous release's HTML and modules — and `activate` then deleted that
release's cache, so everything the page asked for afterwards came from the new
one. On this app that means 1.17.0's renderer drawing into 1.16.0's canvas
element. It is gone; the worker waits, and a `message` handler promotes it on
`SKIP_WAITING` and on nothing else.

**The strip lives in `index.html`, not in a module, and that is load-bearing.**
On a device stuck across releases the old worker serves the old `app.js` from
its own cache — so any code added to a module is precisely the code a stuck
device cannot run. `index.html` is fetched network-first, which makes it and
`boot.js` the only two things a stuck device is guaranteed to receive, and
therefore the only two things that can tell it it is stuck.

**`boot.js` stops reloading behind the reader's back.** It used to detect a
stale shell and silently drop the worker, delete the caches and reload. That is
the same class of thing §7h.2 forbids: the reader could not tell the fix from
the app blinking. It now raises the strip naming both versions, and the reload
happens on their press. It keeps its once-per-release guard, which now bounds
how often the reader is ASKED rather than how often the page reloads itself.

**A first-ever visitor is told nothing** (§7h.3), gated on `hadController` read
BEFORE registering — because registering is what changes the answer. The same
flag removed a reload first-time visitors used to get for nothing: the worker
claimed the page, the page reloaded, and the panel they were already looking at
flickered away and came back identical.

### Two gate defects the plants found, and neither was in the app

**The check misdiagnosed the exact failure it exists for.** With `skipWaiting()`
planted, `reg.waiting` is false — and the first draft reported that as "the
browser did not see it as an update", which is the correct reading of one cause
and a completely misleading reading of the other. The plant came back UNPROVEN
rather than caught, which is the harness working: a check that names the wrong
thing is worse than one that says only "it went red".

**And it could not tell the two workers apart.** It compared
`controller.scriptURL` before and after, which can never work here — both
workers are registered at `/sw.js?v=<version>`, so the string is identical
whichever is in charge, and a takeover reloads the page and wipes any variable
holding the answer. A takeover has to be observed as an EVENT: a
`controllerchange` listener installed before page code, writing to
`sessionStorage`, which survives the reload.

**Then it crashed intermittently.** Every read happens while a reload may be in
flight, and a `page.evaluate` whose context is destroyed throws — taking the
gate down with an uncaught exception instead of a failure line. The same planted
fault was diagnosed correctly on one run and crashed on the next.

**`pwa-check.mjs` failed this repo for a COMMENT.** Its install-block rule
greps for `skipWaiting`, and the comment left where the call used to be says
"NO skipWaiting() HERE, and that is Doctrine §7h.1" — the comment that should be
there, because the next reader will wonder why the line everyone else has is
missing. Fixed in the hub by stripping comments before the test: the only ways
to go green otherwise were to delete a useful comment or reword around a
substring, and both teach an author to write for the grep.

### Verified

**299 unit tests, 39/39 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor, and `pwa-check.mjs` green on all six §7h properties.**

The update path is tested with a REAL SECOND WORKER, which §7h asks for in those
words — the harness serves a byte-different `sw.js` on the second fetch and lets
the browser's own update machinery run. A mocked registration proves the mock
works.

Not verifiable here: what it looks like when Noah actually has 1.16.0 installed
and 1.17.0 lands on staging. That is the first real run of this path, and it is
the thing to watch for on his device.

---

## 1.16.0 — point the radar at any airport, 2026-08-03

Noah: *"I want to be able to set an airport on the radar page? Or another
location. Airports should be easy to pick."* Both halves are one control,
because an airport IS a named location — a box that takes a code, a town or a
coordinate and offers what it found.

**The airports are BUNDLED, and that is the interesting part.** 702 Northern
California fields, 317 KB, generated by `npm run navdata` from OurAirports and
committed. Two consequences worth stating: the picker works with the radio off,
and **it cannot be rate limited** — which is what has been breaking the live
traffic feed all day. A dataset in the repo is not a favour anyone can withdraw.

**How the licence question was actually settled**, because the entry that used
to sit here over-claimed twice. It said the terms had been read and that the
licence was CC0; neither was true. `ourairports.com/data/` is refused by the
sandbox proxy at CONNECT and has never been read by any session. What IS true:
the publisher commits a LICENSE file to the data repository the CSVs come from,
and it is the **Unlicense** — "free and unencumbered ... released into the
public domain ... for any purpose, commercial or non-commercial". A primary
licence grant attached to the artifact is a different and stronger thing than a
README calling them "open-data downloads", which an earlier session had
correctly rejected as insufficient. Judged sufficient to proceed, with the
judgement and its evidence recorded in `SOURCE_POLICY.policyReadEvidence` rather
than hidden. The CSVs are read from the mirror at `raw.githubusercontent.com`.

**Ranking, not filtering.** An exact code beats a partial code beats a name that
starts with the query beats a name that contains it, and within a tier the big
airports come first — "san" offers San Francisco International before somebody's
airstrip. The small fields are still there, further down. Five matches are shown
rather than eight: eight buttons pushed the scope itself off the bottom of a
phone, and a picker that hides the instrument it aims is the wrong trade.

**Precedence is followed > chosen > fix > home.** A followed aircraft outranks a
chosen airport because the whole panel has become that aircraft. A chosen
airport outranks the device's own fix because choosing it was a deliberate act
and a GPS fix arriving must not silently undo it.

**A typed coordinate is refused rather than guessed at.** `parseLatLon` returns
null for anything it cannot read; a mis-parsed coordinate would centre the scope
somewhere real and wrong, which is worse than not moving.

**What choosing an airport does NOT do:** it does not move any instrument. The
phone is still on a desk in Cameron Park, and nothing on it can measure the air
over Sacramento. Only the traffic scope goes there, and the status line says so.

### Two things this change fixed that predate it

**The crosshair said HOME whatever it was centred on.** The RADAR page worked
out its own label and the PFD's navigation display worked out none, so following
a flight named the aircraft under one crosshair and drew HOME under the other —
the same centre, two answers. `radarCentre` now returns a `short` name with
every centre and both scopes draw what it says.

**The PFD's navigation display was fetching-centre blind.** It called
`radarCentre` without the chosen place, so it would have drawn a ring around
this desk containing aircraft fetched around KSMF. The comment three lines above
it warns against exactly that — "two pictures of one truth is exactly how they
come to disagree" — and the code underneath it did it anyway.

### Verified

**299 unit tests, 37/37 planted faults caught, the accessibility gate green
across 3 viewports x 2 palettes x 5 pages, both palettes clearing every hard
floor.** The picker is asserted end to end by `checkCentrePicker`: it types,
reads the matches, presses one, and then checks **the outbound query URL** —
because a picker that relabels the scope without moving the fetch is the failure
that matters, and it is invisible on screen. Two plants prove it, each watched
going red about its own thing.

Not verifiable here: whether 702 airports is the right cut. The bundle is
Northern California only, and an airport outside it is simply not found — the
coordinate box is the escape hatch until Noah says he wants a wider region.

---

## 1.15.0 — the scope becomes a TCAS display, 2026-08-03

Noah: *"What does the radar look like in a real jet? This crowded? What info is
shown for each object? Is it static or toggle-able? What are the real life
ranges? ... My desired fix is ALWAYS more like a regular aircraft."*

**The honest answer was that ours was a plane-spotting display.** A real ND's
traffic layer is TCAS and it is austere: a symbol, a RELATIVE altitude in
hundreds of feet, and a vertical trend arrow. No callsign, no registration, no
type code. Fifty-six labelled aircraft on one scope is not a thing a flight deck
has ever shown anyone.

**What landed:**

- `tcasLabel` — signed hundreds of feet relative to own altitude, two digits
  clamped (TCAS never shows a third), with an arrow past the real 500 fpm
  threshold. A MINUS SIGN rather than a hyphen, so the column aligns and reads
  as arithmetic.
- **With no own altitude it falls back to the absolute label** rather than
  inventing a datum. That is the desk case before a fix, and "+340 relative to
  nothing" would be a number computed from an assumption nobody measured.
- **The altitude band**, in the real names and the real numbers: NORM ±2700,
  ABOVE +9900/−2700, BELOW +2700/−9900. This is the de-clutter, and the thing
  the scope was missing entirely.
- **ALL is marked with a star and `real: false`.** It is not a TCAS setting. It
  exists because this panel lives on a desk at a few hundred feet, where NORM
  would correctly hide every airliner overhead — realistic and useless. Offer
  the real bands, default to the one that serves the reader, and say which is
  which rather than quietly inventing a fourth position on a real switch.
- **Real Boeing range steps**: 10, 20, 40, 80. The old 25 is not a range any
  EFIS control panel offers.

**Two decisions that keep it honest.** An aircraft broadcasting NO altitude is
kept by every band — it is really there, the band cannot judge it, and dropping
it would hide a real aircraft on the strength of a measurement that does not
exist. And the status line says how many the band is hiding, because a count
that silently excludes traffic is the scope lying by omission.

**The tap hit-tests the same set the scope draws.** Filtering the display but
not the hit test would let a tap on empty space follow an invisible aircraft.

### Two things the gate caught that were nothing to do with TCAS

**A second source of truth for the ranges.** `app.js` built the PFD range
buttons from a hardcoded `[10, 25, 40, 80]` sitting beside `RADAR_RANGE_NM`'s
own copy — so the moment the real list changed, the PFD offered a range the
radar page no longer had. It builds from the one list now.

**And the check itself hardcoded "25".** It asked for a button that had stopped
existing and reported a sync failure for a control that was working. Both sides
are read from the DOM now, so the check follows the app instead of a copy of it.

**A test that was wrong rather than the code.** The first band tests asserted
31000 ft was inside NORM from an own altitude of 34000 — 3000 ft, outside 2700.
Expectations written without doing the arithmetic. Corrected, and edge cases at
exactly ±2700 added, because a boundary nobody tested is a boundary nobody knows.

## 1.14.1 — the tap that never worked, 2026-08-03

Noah: *"I cannot tap the radar to add planes to the follow dialogue box like I
asked."*

**`hitTestAircraft` was used in `radar.js` and never imported.** Every tap threw
`hitTestAircraft is not defined`. The feature has not worked ONCE since it
shipped in 1.7.0 — seven releases, described in release notes twice, recorded in
NOTES as done.

**Why nothing caught it, exactly.** The accessibility gate asserts "no console
errors, anywhere" and would have caught this instantly — but it had never
CLICKED anything. It loads pages, reads them, measures them, and looks. **An
error that only fires on interaction is invisible to a sweep that only
observes.** `checkRadarTap` now drives a real pointer at a real aircraft's
painted position, using the renderer's own geometry, and asserts the follow
started. It was watched failing with the import removed, reporting the exact
message, before the fix was believed.

**A wrong diagnosis on the way, corrected in the same session.** The report said
"CONSOLE (0 captured since boot)", so this session concluded the capture was
blind to uncaught errors and wrote a `window.onerror` hook — calling a `push()`
that does not exist, four lines above the existing hooks that already do exactly
that. `installConsoleCapture` has captured `error` and `unhandledrejection`
since it was written. The zero was because he had not tapped in that session,
not because the capture was broken. Reverted.

**Power is part of a control strip now.** Noah: *"Power looks visually tied to
nothing."* It was its own row under the left edge of the panel, in a group of
one, labelled by nothing. Power, levelling and clear are the three things you do
TO the panel, so they share one named group with a divider.

### The radar is not what a real one looks like, and that is now the next job

Noah: *"What does the radar look like in a real jet? This crowded? What info is
shown for each object? Is it static or toggle-able? What are the real life
ranges? My desired fix is ALWAYS more like a regular aircraft."*

**The honest answer is that ours is a plane-spotting display, not a flight-deck
one.** A real ND's traffic layer is TCAS, and it is far more austere:

- **No callsigns. No registrations. No type codes.** TCAS shows a symbol and a
  number, nothing else.
- **RELATIVE altitude in hundreds of feet**, signed, drawn above or below the
  symbol: `+03` is three hundred feet above you. Never an absolute flight level.
- **An up or down arrow** beside it if the aircraft is climbing or descending
  more than about 500 fpm.
- **Symbol shape carries threat, not identity**: open diamond for other traffic,
  filled diamond for proximate, amber circle for a traffic advisory, red square
  for a resolution advisory.
- **An ALTITUDE BAND FILTER is the real de-clutter**, and we have nothing like
  it: normal shows roughly ±2700 ft, with ABOVE and BELOW switches that extend
  it to +9900 or −9900. Most of the fifty-six aircraft in Noah's screenshot
  would simply not be displayed on a real ND.
- **It is toggle-able** — a TFC button on the EFIS control panel.
- **Real Boeing ranges** are 10, 20, 40, 80, 160, 320 and 640 nm. Ours are 10,
  25, 40 and 80; the 25 is not a real step.

**The plan, therefore:** relative altitude and vertical trend instead of
callsign plus flight level, an altitude band filter with ABOVE / NORM / BELOW,
real range steps, and the callsign moved to a tap — which is where the identity
belongs and is now, finally, reachable. The "Heard right now" list keeps every
detail, so nothing is lost: the SCOPE gets austere, the LIST stays rich.

## 1.14.0 — the scope follows the aircraft, 2026-08-03

**ANSWERED AT LAST: the crew readouts are real.** Noah's report, following
UAL1902 (N17254, a 737 MAX 8):

    nav.selectedAltitude   LIVE   32992  ft
    nav.selectedHeading    LIVE   35.16  deg
    nav.crewQnh            LIVE   1014   hPa

The autopilot readout added in 1.11.0 was written entirely from adsb.lol's
published field names, with no real response ever observed, and was carried as
an explicit "might be zeroes across the board, and if so I pull it". It is not.
A real aircraft broadcast its MCP altitude, its selected heading and the
altimeter setting its crew was flying to. §7f's diagnostic-as-test is what
settled it, on his device, in one paste.

**And the bug he found in the same breath.** *"Following a flight doesn't center
it in the radar like I imagine it should?"* — with a screenshot of the scope
centred on Cameron Park, the followed 737 circled near the rim, captioned "56
aircraft within 40 nm of this device".

He is right, and the inconsistency is total: the horizon, the tapes, the
altitude and the speed had ALL switched to that aircraft. The scope was the only
instrument still showing the desk, which is the panel showing two aircraft at
once — the exact failure FOLLOW exists to avoid, and which its own comments say
it avoids.

**It used to reach the right answer by ACCIDENT.** FOLLOW overwrites
`position.lat`/`position.lon`, and `radarCentre` read those fields — so the
centre drifted onto the aircraft on the next successful nearby fetch. Emergent,
never decided. And it failed exactly when the feed was rate limited, because the
centre is only recomputed on a fetch that SUCCEEDS. `radarCentre(fields,
followed)` now takes the aircraft explicitly, so the decision holds when no
request has landed for a minute.

**The centre NAMES itself now**, in three states rather than two: this device,
the home reference before a fix, and the followed aircraft. "Within 40 nm of
this device" was a false sentence being printed while the scope pointed at a 737
over the Sierra, and the label under the centre mark said YOU.

**A followed aircraft with no position must not hijack the centre** — a follow
that has not been heard yet has null lat/lon, and centring on that would put the
scope at the equator with every aircraft off the edge. Tested.

**The accessibility gate caught a real one in the same pass.** `startSensors`
awaits a permission prompt and then the first weather fetch, and the switch was
being redrawn AFTER all of it — so PWR read OFF for as long as the network took.
A switch that does not respond to being pressed. It flips synchronously now and
re-syncs afterwards in case starting actually failed.

**What the rate limiting is now costing, stated plainly:** with the feed
refusing us, a followed aircraft stops updating and its instruments age to
crossed-out. The panel keeps its last real position rather than inventing one,
which is correct — but being turned away breaks FOLLOW as well as the radar, and
that raises the priority of the source work in the inventory above.

## Data sources — the standing inventory, 2026-08-03

Noah: *"If there are other sources, I always want to know about them to know if
they add any other value."* So this is kept as an inventory rather than being
rediscovered each time a provider refuses us, and it is organised by WHAT EACH
ADDS — not by whether it works.

**THE STRATEGIC POINT, which the rate limiting made obvious.** Live positions
have to come from an API: they change every second. **Almost nothing else does.**
Routes, operators, aircraft types and airports are all essentially static, all
published as open DATASETS, and a dataset committed to this repo is immune to
the shared-address rate limiting that no amount of pacing can fix. The feed
problem and the feature backlog are less entangled than they look.

### Same data, another door — adds no capability

- **airplanes.live** — free community ADS-B aggregator, an ADSBexchange-shaped
  API. Its only value here would be that it may not blanket-block Cloudflare
  origins the way adsb.fi does. TERMS UNREAD; §15.1 blocks until they are.
- **adsbexchange** — moved to commercial licensing via RapidAPI. Paid.
- **OpenSky** — already rejected and the reasons stand (no callsign lookup, and
  a useful rate limit needs OAuth). It does have one thing the others lack: a
  historical track API. Only worth revisiting if past tracks become a feature.

### Genuinely new capability

- **Route data — origin and destination.** Two routes to it: adsb.lol publish a
  routes API (their own words: "plausible aircraft routes", a phrasing the panel
  must respect when labelling it), and the open `vrs-standing-data` dataset maps
  callsign to route without any API at all. The dataset is the better shape —
  bundled, no rate limit, no provider to be refused by. UNLOCKS the flight-plan
  page. Terms unread for both.
- **Aircraft and operator database.** hex to registration, operator and full
  type name, as a bundled dataset. UNLOCKS "United Airlines Boeing 737-800"
  where the panel currently says B738, and the airframe picker would read in
  real names without depending on the feed's `desc` field arriving. Terms unread.
- **OurAirports** — TERMS READ, public domain (CC0), blocker CLEARED. Mirrored
  as plain CSV. UNLOCKS the airport picker Noah asked for, an arbitrary map
  centre, and named airports for any route feature. This is the one item on this
  list with nothing blocking it.
- **Aircraft photos (planespotters.net)** — UNLOCKS a photograph of the actual
  airframe being followed, which for a plane lover is probably the highest
  joy-per-line on this entire list. Terms unread.
- **ACARS / VDL2 text (airframes.io)** — real datalink messages, verbatim.
  UNLOCKS the "written transcript of aircraft communications" Noah asked about,
  WITHOUT the speech-to-text guessing that made the ATC-audio version
  unacceptable. Terms unread.
- **TAF, SIGMET, AIRMET, PIREP** — the same aviationweather.gov service already
  in use and already trusted, different endpoints. UNLOCKS forecast weather and
  significant-weather areas rather than only the current observation. Gated on
  knowing where the friend actually lives.

### Rejected, recorded so nobody re-litigates

- **FlightRadar24** — their terms, not the technology (recorded 2026-08-02).
- **LiveATC** — restricts redistribution; an app embedding the stream is not
  personal listening.
- **Speech-to-text over ATC audio** — a machine guessing at clipped VHF, with
  per-word error nobody can show. Refused on this app's own honesty rule.

**Nothing on this list has been verified from a session.** The sandbox proxy
refuses almost all of it, including `pages.dev`. Every "terms unread" above is a
real blocker under §15.1 and none of it gets built until someone reads them.

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

0. **SETTLED 2026-08-04: NO RECEIVER.** Noah: "I'm not getting a receiver."
   That closes this, and it closes it as a PERMANENT CONDITION rather than an
   open problem — which changes what the app should do about it. 1.20.0 is that
   change: the panel now explains the refusal in a sentence a reader can use
   instead of printing a Cloudflare ray ID on the face of a gauge, and says
   what is still true on screen.

   **Do not re-open this as an engineering task.** There is no code fix. The
   reasoning is kept below because a future session will otherwise rediscover
   the 429s and go looking for one.

   **THE RATE LIMITING NEEDED HARDWARE, not a code change.** Both providers say
   the same thing and 1.19.2 was the last thing the code could do about it.

   The failure is a SHARED ADDRESS. adsb.fi rate limit to one request per second
   per IP; this panel reaches them through a Cloudflare Pages Function, whose
   egress address is shared with an enormous number of unrelated sites, so the
   allowance is routinely spent before the panel asks — which is why a 429 can
   land on the very first request of a session. No amount of pacing on our side
   fixes somebody else's traffic.

   **adsb.lol, in their own words:** "In the future, you will require an API key
   which you can obtain by feeding adsb.lol." A key is per-account rather than
   per-address, which is precisely what a shared egress defeats.

   **adsb.fi, in theirs:** "we kindly ask you to support adsb.fi by setting up a
   receiver", and feeder IPs are "automatically given access" to a snapshot
   endpoint that is otherwise closed. Also: "Please contact us if you have
   commercial or higher request rate requirements."

   So the two routes are FEED ONE OF THEM — an RTL-SDR dongle and an antenna,
   roughly £25 to £35, running at the house — or write to adsb.fi and ask. The
   first is the one both services actually want, and it would make part of the
   panel's data come from Noah's own receiver, which is a better story anyway.

   **airplanes.live: both documents read, and they contradict each other.** The
   API guide invites automated access — endpoints, a 1 req/sec limit, "access
   does not currently require a feeder" — and the Legal Terms prohibit "any
   automated system... that accesses the Services". Only they can settle it, at
   `contact@airplanes.live`. Not used either way, because it would not fix the
   rate limiting: they are 1 req/sec per IP like everyone, and this is a shared
   address problem. Worth an email only if Noah wants them for some other
   reason.

   - https://adsb.lol/feed
   - https://adsb.fi/contact and https://github.com/adsbfi/opendata

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

**Hub wiring (§13.6) — DONE, 2026-08-04, on Noah's instruction.** All three
wires are live. The app links back to `noahjefferson.pages.dev` from the (i)
menu and the footer, and to `/accessibility` from both; those two were already
built. The hub's outbound half landed on its `main` as `5ae9e87` — an app row
and icon on the front page, the same row in the noscript list, and an entry in
the shared accessibility statement's app list — and deployed at 19:01 UTC
(3 files uploaded, run 30941323237).

The reason recorded here before — "waits on a deploy; there is no URL to point
at yet" — had been stale for a day. `fauxplane.pages.dev` has been this repo's
website in the hub's `METADATA.md`, applied and verified, since 2026-08-03.

**What it actually waited on was Noah, and that is now a doctrine rule.** He
decides what goes on the hub; a session does not add an app there, propose one,
restore one, or name an unlisted one as a candidate. Doctrine §0c, written the
same day (hub `2ae05bf`), and §13's checklist changed with it — the app's links
BACK are a session's to build, the hub's link OUT is not.

Not done, and why:
- **Repo metadata** — item 6 above.
