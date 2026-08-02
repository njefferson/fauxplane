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

## 0.4.2 — the iPad roll defect, FOUND, and it was two bugs

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

| what | pitch | roll |
|---|---|---|
| the app as shipped (angle 0) | −52.3 | **−87.1** ← reproduces the fault |
| true angle, old sign | −52.3 | −177.1 |
| **true angle, corrected sign** | −52.3 | **+2.9** ← an iPad held square |

The sign flip carried into three other places that had to move with it —
`screenToDevice`, `applyScreenAngle`, the gyro's rate vector, and the gyro
zero-offset's projection back onto the device axes. All four were derived, not
guessed, and the landscape fixtures in the test suite changed sign with them.

**The tests are now pinned to the measured device**, not to self-consistency:
the old behaviour must still reproduce roll beyond 80 degrees, and the fixed
behaviour must put an iPad held square inside 8 degrees of level. Both halves
are planted against.

### Still unverified

Only ONE orientation of one device has been seen. Portrait on the same iPad, and
any Android or desktop in landscape, are unconfirmed — the sign was wrong
everywhere and only portrait hid it, so a landscape Android is the obvious next
thing to check. Its report will say which angle source it used.

### Also spotted in the same report, not yet fixed

`vsi.rate` read **344,570 fpm**. That is the attitude bug downstream: with the
horizon ninety degrees over, the "vertical" accelerometer projection was reading
a horizontal axis, so gravity leaked into the integrator and it ran away. The
attitude fix removes the cause — but a vertical speed indicator that can display
three hundred thousand feet per minute has no business doing so whatever the
cause, and that bound is still to be added.

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

| | why |
|---|---|
| pitch | ADS-B carries no attitude. Flight path angle is not pitch. |
| slip / skid | not broadcast, and coordinated flight is the assumption the bank was derived FROM |
| TAS / CAS | need winds aloft where the AIRCRAFT is, not where this device is |
| indicated altitude | the Kollsman setting is a local station's |

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
