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

## What is built — v1, release 0.1.0 (CAPABILITY)

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

1. **The module tree lives at `public/src/`, not at repo-root `/src`.** The repo
   has no build step (settled, and in CLAUDE.md), and a browser cannot fetch
   `/src` if only `public/` is deployed. Adding esbuild to satisfy the letter of
   the layout would add a bundler dependency and make the deployed artifact stop
   being the source. The tree is otherwise exactly as specified —
   `core/ sensors/ data/ panels/ render/gauges/`. **Say the word and it becomes
   a root `/src` with an esbuild step instead.**

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

**The altitude tape shows GPS GEOMETRIC altitude and is labelled `GPS ALT`.**
It is not indicated altitude, and it does not pretend to be.

GPS reports height above the WGS84 ellipsoid; altimeters, charts and terrain are
referenced to mean sea level, and the two differ by about -100 ft here. Worse,
the platforms disagree about which one they hand you — iOS applies the
correction internally, Android does not — so there is no safe assumption
available, only a real geoid model or an admission.

There is no geoid model bundled (the CSVs and grids could not be fetched, see
below), so:

- `altitude.geoidSeparation` is FAIL with the reason.
- Indicated altitude, pressure altitude, TAS and CAS are all FAIL, each naming
  the input it is missing.
- The tape falls back to a **different, honestly-titled quantity** rather than a
  substitute wearing the altimeter's label. The heading on the tape changes with
  the source; the panel never silently swaps one for the other.

Drop a real `public/data/geoid-norcal.json` in, flip its manifest entry, and all
four light up with no other change. The expected shape is documented at the top
of `src/data/geoid.js`.

### The Kollsman window is a real control
It defaults to the selected station's setting and can be dialled by hand; the
indicated altitude moves exactly as a real altimeter's would, because the
derivation is `MSL + [offset(station setting) - offset(dialled setting)]`. Dial
it away from the station and the panel says so. Once touched by hand it stops
auto-syncing — moving a control the user just set is silent mutation.

The amendment's fallback is implemented as written: no station in the box
reporting an altimeter setting means 29.92, flagged, with the reason on screen.

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
- **The WMM north component was 180 degrees out.** X is the *northward*
  component but theta-hat points *south*, so the sign flips — Y and Z were both
  right, which put the horizontal field exactly reversed. A pure axial dipole
  reported a declination of 180 everywhere on earth. Nothing about the number
  looked wrong: finite, stable, varying sensibly with position.
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

1. **Deploy it.** Nothing here has run on Cloudflare. Needed: a Pages project
   with build output `public/`, and for `/api/traffic` only, a KV namespace
   bound as `FAUXPLANE_KV` plus `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`.
   METAR and winds need no key and no KV. Per Doctrine §16.4 those two secrets
   go on the step that needs them, never through `$GITHUB_OUTPUT`.

2. **The three absent data bundles.** All three are absent for the same reason —
   the egress proxy denies the hosts, and Doctrine §15 says report that rather
   than route around it. `public/data/manifest.json` carries a written reason for
   each, which is what BITE prints. Two are cheap to fix from anywhere with
   egress:
   - **navdata** — `node scripts/build-navdata.mjs --from <dir>` with the three
     OurAirports CSVs. Updates the manifest itself. No v1 panel reads it.
   - **geoid** — a real EGM96/EGM2008 grid over the region. This one unlocks
     indicated altitude, pressure altitude, TAS and CAS.
   - **WMM** — NOAA's `WMM.COF` wrapped as `{"cof": "<file text>"}`. Unlocks
     declination and true/magnetic conversion.

3. **OurAirports' published terms still have not been read** — same block. The
   code says "believed" by holding `SOURCE_POLICY.policyReadOn = null`, which
   makes the fetch path refuse to run until someone fills it in.

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
`main` both existed. They did not: `git ls-remote` showed the remote carrying
only `claude/jet-panel-pwa-amendments-f07ygu`, which was also the default
branch. Both branches have now been created and pushed for real, and the
`claude/*` branches removed — see the handoff for what needed Noah's hand.

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
