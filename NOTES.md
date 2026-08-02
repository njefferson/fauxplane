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
