# CLAUDE.md — fauxplane (the jet panel PWA)

> **Inherits the Universal App Doctrine** — the canonical copy lives in the
> **noahjefferson** hub at [`DOCTRINE.md`](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md).
> It is the single source of truth for the rules shared across all of Noah's
> apps: product values, taste, accessibility, honesty, verification, release
> discipline & taxonomy, licensing (PolyForm Noncommercial), privacy, the
> permanent **AskUserQuestion ban** (§0), and the **repo-metadata confirm rule**
> (§10). **Where anything below overlaps the Doctrine, the Doctrine wins.**
> This file keeps only what is specific to this repo. Never fork the doctrine
> here — link to it. The same goes for the hub's `LESSONS.md` and `PALETTES.md`.
>
> To work on this repo, start the session with **both** `njefferson/fauxplane`
> and `njefferson/noahjefferson` selected — the doctrine lives in the hub and
> session repo access cannot be changed mid-session (Doctrine §11).

## Read first
[`NOTES.md`](NOTES.md) is this repo's source of truth — thesis, settled
decisions, open items and what a session is currently blocked on. Read it
before anything else, every session.

## What this repo is
A glass-cockpit PWA: a phone or tablet clamped where a panel would be, showing
instruments driven by the device's own sensors and by fetched aviation feeds.
It is not a simulator and it is not certified for anything.

## The rule that shapes the whole app
**There is no synthetic data path at all.** Every value on screen traces to a
device sensor or a fetched feed. Provenance is one of LIVE, DERIVED, STALE or
FAIL, and it is shown. Any code path that would produce a value from neither a
sensor nor a feed is a defect, not a placeholder — this includes "reasonable"
defaults standing in for a reading that is missing. A missing reading is FAIL,
and it says so.

**FOLLOW mode does not bend this and must not be read as an exception.** A real
flight's ADS-B broadcast is a FEED, in the same category as METAR: an
observation of an aircraft, never a simulation of one. It is held to the rule
rather than excused from it, which is why it crosses out pitch, slip, TAS, CAS
and indicated altitude, each with the reason ADS-B or local weather cannot
answer it. Exactly one source owns each field at a time — following an aircraft
moves ownership wholesale rather than blending, because a panel showing a real
747's groundspeed beside this desk's accelerometer would be two aircraft at once.

## Stack
Static, self-contained, **no build step** — `public/` is the deployed app,
exactly as written. The module tree lives at `public/src/` (not repo-root
`/src`) precisely so that stays true: native ES modules need no bundler, and
`public/` is the deploy root. Pages Functions are at repo-root `/functions/api/`,
which is where Cloudflare expects them.

**No runtime dependencies, and that is a rule.** The two devDependencies
(`playwright-core`, `axe-core`, pinned to match the sandbox's Chromium 1194)
exist only for the accessibility gate and the icon renderer; nothing they touch
is deployed. Automation uses `npm ci` against the committed lockfile.

Data the app bundles is generated, never hand-written:
- `npm run geodata` — the WMM 2025 coefficients and the EGM96 geoid grid, plus
  NOAA's own test fixture. Reads two npm packages once and commits the extracted
  data; neither becomes a dependency.
- `npm run navdata` — the OurAirports database. Still refuses to fetch until
  someone reads the published terms; no v1 panel needs it.

Live traffic comes from **adsb.fi** (`/api/traffic`), whose terms are personal,
non-commercial, and **require a citation with a link to their home page**. That
citation is enforced by the accessibility gate and by a planted fault; do not
remove it. Their published limit is 1 request/second, so every parameter is
validated in the Function before anything is sent and the edge cache carries the
panel's refresh rate.

Every gate, and each one exits non-zero:
- `npm test` — 160 unit tests over the pure logic, including the magnetic model
  against NOAA's published test values at 100 points.
- `npm run a11y` — axe plus the checks axe cannot make, over 3 viewports x 2
  palettes x 5 pages, including the acceptance criteria.
- `npm run palette` — the hub's `palette-check.mjs` against
  `palettes/fauxplane.json`. The gate is never forked; it is run from the hub.
- `node scripts/plant.mjs` — breaks one thing at a time and proves the gate
  goes red **about that thing**. A check nobody has watched fail is not evidence.
  Each plant names the gate that should catch it: `a11y` (the default) or
  `tests`. Sensor-logic plants MUST use `tests` — a headless browser has no
  accelerometer, so the accessibility gate is structurally blind to them and
  would stay green. It takes a pid lock; never run two at once, because the
  second restores the first's injected code into the tree. **Do not edit or
  commit while it runs either** — the lock cannot stop a session, and mid-run
  the tree genuinely contains a planted fault. `git diff` during a run looks
  alarming and is meant to; wait for it to finish.
- `node scripts/preview.mjs` — renders the panel in live states a sandbox cannot
  reach. Not shipped, not imported by the app; it drives the store from outside
  through the same public write the sensors use.

## Who this is for
A friend of Noah's who is 3-D printing his own **747 cockpit** at home, for
simulation. **He is not a pilot.** He loves planes and jets.

**Design questions resolve toward giving him the most JOY.** That is the
tie-breaker, and it outranks a session's instinct toward instrument realism or
completeness. The device is CLAMPED AND STATIONARY on a desk indoors, which is
a very different thing from one in a moving aircraft — NOTES.md records exactly
which instruments are alive in that setup and which are correctly crossed out.
The honesty rule still stands: a panel that invents numbers is a worse toy, not
a better one.

## Deploying
`.github/workflows/deploy.yml` deploys `public/` plus the Pages Functions on
every push to `staging` and `main`, and creates the Pages project on first run.
It needs two repo secrets — `CLOUDFLARE_API_TOKEN` (Pages:Edit) and
`CLOUDFLARE_ACCOUNT_ID` — and skips the deploy without failing if they are
absent. `staging` lands at `staging.fauxplane.pages.dev`.

**`public/boot.js` is why a released build can be replaced at all, and it must
stay first in `index.html`.** The worker takes its version from its registration
URL, so `sw.js` is byte-identical between releases — and a browser replaces a
worker only when those bytes change. Nothing would ever have registered the new
one, because the old worker serves the old `app.js` that re-registers it. A
navigation is the one request `sw.js` handles network-first, so `boot.js` rides
in on `index.html`, asks the network which release is current, and drops a worker
belonging to any other one. Do not inline it (the CSP forbids that), do not move
it below `app.js`, and do not "simplify" its empty cases — each one exists to
stop it forcing a reload it should not.

The workflow runs `npm test`. It does NOT run the accessibility gate, which
needs a browser the runner would have to download; that gate is run locally
before every push and its result is reported in the handoff. Do not describe CI
as covering it.

## Branches
`staging` and `main` only (Noah, 2026-08-02). Staging is a **hard release gate**
(Doctrine §7): every product change lands on `staging`, waits for Noah's pass on
his actual device, and reaches `main` only on his explicit "promote" — never on
a session's own read of "it's ready". Docs-only changes (this file, `NOTES.md`)
may skip the gate.

**Ignore the harness-designated `claude/*` branch** (Doctrine §11). The web-task
harness keeps naming one; this repo's policy is staging and main, so work lands
on `staging` and the session says so.

## Diagnostics — use this instead of asking for screenshots
Pressing the **version stamp** opens a report of the whole panel state as text,
with Copy / Share / Save. It leads with the diagnosis (root causes separated
from what they knocked over), then the attitude filter's internals including the
learned gyro zero-offset, then every field, then console errors captured since
boot. Position is rounded to ~1 km unless the box is ticked.

**Ask Noah for that report, not for a photograph.** Reading pixels off a phone
loses every reason string and cannot show the filter at all.

## Standards, and where this app knowingly departs
The physics is referenced, not invented: a **Mahony PI complementary filter**
with gains chosen by computing the damping ratio, static alignment as every AHRS
does on the ramp, and the textbook coordinated-turn relations. WMM/EGM96 are
held to NOAA's published test table.

The flight-deck **colour convention** is followed: RED for a condition needing
immediate action, AMBER for one the reader should merely be aware of. A usable
but degraded parameter is amber, never red and never a provenance tone.

**One deliberate departure, documented in NOTES.md:** a real EFIS clears the
entire artificial horizon when attitude is lost, and no certified aircraft draws
bank without pitch. This app does, in FOLLOW mode, because the case does not
arise in an aeroplane — a certified AHRS gives both angles or neither, while
ADS-B gives a recoverable bank and no pitch at all. It is guarded against the
hazard the convention protects by removing the sky/ground split AND the pitch
ladder, so nothing on it can be misread as a horizon. Do not "tidy" this into
either a full horizon or a full ATT flag without reading that note.

## Levelling to a mount (SETUP page)
**Boresight calibration**, the same procedure a Garmin G5 or a Dynon uses: park
level, hold still, press once, and the rotation between the phone and whatever
it is clamped in is recorded and subtracted. Built for a car cradle, which sits
a phone back ten to thirty degrees.

It is a ROTATION, never a subtraction of Euler angles — those do not compose
when both pitch and roll are non-zero, which is exactly the cradle case. It is
applied at the INPUT, to gravity AND to the rotation rates, so the whole filter
runs in the vehicle frame. The offset is shown on the ADI, on SETUP, on BITE and
in the diagnostics report, because an instrument whose zero has moved must say
so. Do not make it silent.

Levelling cannot set which way is FORWARD — gravity carries no yaw information —
so a phone twisted in its cradle keeps twisted axes. Say so; do not invent one.

## Repo metadata (manual, confirm — see Doctrine §10)
Description / website / topics / social-preview are GitHub-UI steps the session
token cannot perform. None are set. List the exact values and ask Noah to
confirm each; never report this repo "set up" while any is unconfirmed.
