# CLAUDE.md — fauxplane (the jet panel PWA)

> **Inherits the Universal App Doctrine** — the canonical copy lives in the
> **noahjefferson** hub at [`DOCTRINE.md`](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md).
> It is the single source of truth for the rules shared across all of the owner's
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
- `npm run navdata` — the OurAirports database, **now shipped**: 702 Northern
  California airports in `public/data/navdata.json`, behind the RADAR page's
  centre picker. The licence question is settled and the reasoning is in
  NOTES.md — the publisher commits an **Unlicense** to the data repository the
  CSVs come from, which is a licence grant on the artifact rather than a README
  calling them "open-data downloads". `--mirror` reads them from
  `raw.githubusercontent.com`, which is a decision the generator records, not a
  silent fallback. A bundled dataset also cannot be rate limited, which is why
  the picker keeps working on a day the live feed does not.

- `npm run navaids` — the NATIONWIDE ident table, `public/data/navaids-us.json`:
  1158 US VOR-class navaids and 873 airports carrying an IATA code, positions
  only, 50 KB. Same OurAirports CSVs and the same settled Unlicense grant as
  `navdata`, so it raises no new licence question. **It is not a bigger
  `navdata` and the two are not interchangeable** — `navdata` is bbox-clipped to
  the region by design, which is right for the centre picker and cannot place a
  hazard advisory drawn between PHX, BUF and CLE. NDBs are excluded on purpose:
  they treble the file, cause nearly every ident collision, and a `FROM` line
  does not use them. An ident two facilities tie for is REFUSED, not guessed —
  a dropped ident shows as "could not place", and a coin flip would put a hazard
  on the map at a position nobody measured.

**A hazard advisory is placed from its own `FROM` line** (`public/src/data/fromline.js`,
pure, 1.37.0). The service sends every SIGMET and AIRMET in the country whatever
box is asked for, and that line is the only thing in the raw text carrying
geography. The grammar was taken from the REAL captured lines, never from a
specification: offsets precede their ident and both separators must be read at
once, so `PHX-60E PHX` is three tokens.

**The rule that decides a partial polygon errs one way ON PURPOSE.** A missing
vertex can only make the real area bigger, so resolved points that already touch
are `near` and that is certain; not touching with something unresolved is
`unknown`, NEVER `far`; `far` requires a complete polygon. **An advisory that
could not be placed is shown BESIDE the overhead ones with its reason, never
filed under Elsewhere** — an area nobody could work out is not an area that is
somewhere else, and hiding a hazard because a parser failed would be worse than
the nationwide list it replaces. `Elsewhere` is a real disclosure: collapsed,
never removed. Each clause is tested SEPARATELY, because pooling one bulletin's
several areas into a single box claimed all of New Mexico.

**Text reports — PIREPs, SIGMETs/AIRMETs and TAFs — come from the SAME service
as METAR**, so there is no new licensing question: a US Government work whose
terms are already read. `POLICIES.wxtext` is a separate entry only because the
pacing differs, and pacing is what those declarations are for.

**Their response shape has never been seen** — this sandbox cannot reach
aviationweather.gov any more than it can reach adsb.lol. So `/api/wxtext` asks
for `format=raw` rather than JSON, which is what a flight deck shows anyway:
there is no field mapping to be wrong about, and the one remaining assumption
(the body is text that splits into reports) is CHECKED — a body opening with
`<!doctype` is refused rather than displayed, and what actually came back is
reported on every response. `route.js` is the cautionary precedent for building
blind; the difference is that there the REQUEST shape was the hypothesis.

**A quiet sky and a service that did not answer must never produce the same
words.** Both render an empty block, and "no pilot reports" from a feed nobody
reached is an observation nobody made. `wxSummary` has four states and both the
unit suite and the a11y gate hold them apart.

Live traffic comes from a **LIST** of providers, tried in order and declared in
`TRAFFIC_PROVIDERS` (`functions/api/_lib.js`): **adsb.lol** first, then
**adsb.fi**. There is more than one because adsb.fi's Cloudflare edge answers a
Pages Function with a 403 block page before their API sees it — the endpoint is
right and we are simply not welcome from that origin. Both publish an
ADSBexchange-v2-compatible shape, so one parser reads either.

**The panel credits WHICHEVER PROVIDER ANSWERED**, name and link both taken from
the response — adsb.lol require attribution under ODbL, adsb.fi require a
citation with a link to their home page, and crediting the wrong one is worse
than crediting none. The gate checks the citation **as rendered**, not by
grepping the source: the old check passed while the href was hardcoded to a
provider that had not supplied the data. Every parameter is validated in the
Function before anything is sent, because a 400 counts against a rate limit.

**Do not add browser-shaped headers to get past a provider's bot rule.** That is
circumventing an access control its operator set deliberately, on a service
whose data we are asking for as a favour.

**A provider that has just refused is NOT asked again** — see `noteRefusal` in
`_lib.js`. adsb.fi's terms say a 400/401/403/404/429 counts toward a temporary
IP restriction, and ours 403s on every attempt because their firewall blocks a
Pages Function before their API sees it. Retrying a refusal you can predict is
the "excessive invalid requests" that sentence describes, charged to an egress
address shared with every other Cloudflare tenant.

**airplanes.live is NOT USED, and the reason is not that they forbid it.** Both
their documents were read on 2026-08-04 and they CONTRADICT EACH OTHER: the API
guide publishes endpoints, states a 1 req/sec limit and says "access does not
currently require a feeder", which is an invitation to automated access; the
Legal Terms prohibit "any automated system... that accesses the Services" except
by search engine or browser, and the API guide defers to them rather than
carving itself out. Only they can settle that, at `contact@airplanes.live`.

Do not add them without that answer — and do not add them WITH it either
without a reason, because it would not help: they are 1 req/sec per IP like
everyone else, and this app's problem is a shared Cloudflare egress address.

**The first ruling here was written from the Legal Terms alone**, declared the
question closed, and was wrong — the API guide, which had not been read, says
the opposite. A verdict from one of two documents is a guess in a verdict's clothes;
NOTES keeps the whole story.

**adsb.lol's terms and licence are READ and settled** (2026-08-04, from their
OpenAPI page, which this sandbox cannot fetch). Their terms state the API is
free to use; that an API key will be required in future and is earned by
feeding them; and that **the licence for the API and for all data adsb.lol makes
public is ODbL**. A blanket grant with no non-commercial restriction. The
routes endpoint is `POST /api/0/routeset` and is covered by the same grant; its
request and response shape is NOT yet known and must be learned with a §7f probe
rather than assumed. adsb.lol call routes **plausible**, which is their word and
belongs on screen — an inference from a callsign is not a filed flight plan.

Every gate, and each one exits non-zero:
- `npm test` — 449 unit tests over the pure logic, including the magnetic model
  against NOAA's published test values at 100 points.
- `npm run a11y` — axe plus the checks axe cannot make, over 3 viewports x 2
  palettes x 6 pages, including the acceptance criteria, plus the checks that
  must bring their own conditions: the EICAS strip in three states, and the
  navigation display's mode switch actually pressed.

  **A canvas is invisible to it.** Every rotation, symbol and projection is
  drawn on one, so a plant about that maths MUST use `gate: 'tests'`; one aimed
  here stays green forever. What this gate CAN reach is what a surface says
  about itself — its text alternative — which is also the only part a reader who
  cannot see the picture ever gets.
- `npm run palette` — the hub's `palette-check.mjs` against
  `palettes/fauxplane.json`. The gate is never forked; it is run from the hub.
- `node scripts/plant.mjs` — breaks one thing at a time and proves the gate
  goes red **about that thing**. A check nobody has watched fail is not evidence.
  **The plants are DATA in `scripts/plants.data.mjs`; the harness is CODE in
  `plant.mjs`**, and the split is load-bearing rather than cosmetic — see below.
  `--changed=<ref>` runs only the plants whose target file moved, which on a
  typical release is about twenty rather than fifty-seven; `--dry` shows the
  selection without paying for a browser. It ESCALATES to the whole sweep on any
  file that can blunt a plant that does not name it (the gates, the store,
  provenance, the renderers, `styles.css`, `index.html`) and PRINTS what it did
  not run. **A plant new or edited in the data file always runs**, whatever it
  targets. Sweep WHOLE before any promote — hub LESSONS §51.
  Each plant names the gate that should catch it: `a11y` (the default) or
  `tests`. Sensor-logic plants MUST use `tests` — a headless browser has no
  accelerometer, so the accessibility gate is structurally blind to them and
  would stay green.

  **IT RUNS IN A COPY OF THE TREE, so it blocks NOTHING.** A run copies the
  working tree — tracked, untracked and uncommitted, exactly as it stands — to a
  scratch directory and re-runs itself there. Keep editing, keep committing,
  keep pushing while it runs. This used to inject into the real tree, and the
  "do not edit or commit while it runs" rule that followed was an implementation
  detail promoted into a law that made the owner wait for permission to work
  (2026-08-04, and he was blunt about it). `--here` forces the old in-place
  behaviour and is for debugging this harness, never for verifying a release.

  **IT NEVER GATES A PUSH TO STAGING.** Staging exists so the owner can try the
  thing; holding a fix back for a forty-five-minute meta-check inverts the whole
  point of having a staging branch. Push on the FAST gates — `npm test`,
  palette, docs, and `a11y` — and let the sweep run after, or before a promote.
  **The sweep verifies the GATES, not the code**; the code is verified by the
  gates it just ran. Sweep whole before a promote to `main`, and whenever the
  measuring instrument itself moved (hub LESSONS §51).
- **`node ../noahjefferson/privacy-check.mjs --repo .`** — Doctrine §9b: nothing
  personal about the owner lands in this repo, and it is a **HARD CI gate** rather
  than a lint. It runs in `deploy.yml` on every push to staging and main, from a
  checkout of the hub — the gate is NEVER forked here, because five divergent
  copies of a privacy rule is worse than none. The hub is public so it needs no
  token, and the checkout is untracked so `git ls-files` cannot see it.
  **It reads the working TREE only**; git history is out of its reach and
  rewriting public history is the owner's call, never a session's. Wired 2026-08-04,
  and "wired" means the exact CI command was watched going red on a LOCAL plant
  — never a pushed one, because a pushed plant IS the violation.
- `node scripts/preview.mjs` — renders the panel in live states a sandbox cannot
  reach. Not shipped, not imported by the app; it drives the store from outside
  through the same public write the sensors use.

## Who this is for
A friend of the owner's who is 3-D printing his own **747 cockpit** at home, for
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

**A PUSH IS NOT A RELEASE. CHECK THE DEPLOY FOR THAT EXACT SHA.** Four releases
— 1.24.1 through 1.26.0 — were pushed, reported as shipped, and never deployed.
Every push was verified against the remote, correctly; every deploy had failed on
the privacy gate wired that same afternoon, on the phrase *"they are still not
diagnosed"* in a release note. The owner stayed on 1.24.0 through all four and found
out by asking *"What. Button."* about a feature that had never left the branch.

The trap generalises: **a session that adds a hard gate to this pipeline has just
added a new way for its own work to silently not arrive**, and is at its least
likely to look, because it watched that gate pass locally. Nothing on staging or
main is shipped until its run CONCLUDES green — hub LESSONS §53, and
`handoff-check.mjs` will not pass without `--ack=deploy-green`.

The workflow runs `npm test`. It does NOT run the accessibility gate, which
needs a browser the runner would have to download; that gate is run locally
before every push and its result is reported in the handoff. Do not describe CI
as covering it.

## Branches
`staging` and `main` only (the owner, 2026-08-02). Staging is a **hard release gate**
(Doctrine §7): every product change lands on `staging`, waits for the owner's pass on
his actual device, and reaches `main` only on his explicit "promote" — never on
a session's own read of "it's ready". Docs-only changes (this file, `NOTES.md`)
may skip the gate.

**A PROMOTE ENDS BY SWITCHING BACK TO `staging`, and that step is part of the
promote, not an afterthought.** Twice in one hour on 2026-08-05 a session
promoted, stayed on `main`, committed the next change there, and ran
`git push -u origin staging` — which SUCCEEDS, because it pushes the staging ref,
which is already current. The output is indistinguishable from a normal push
while the commit sits on the wrong branch. Both times a hook caught it, not the
session.

The promote is four commands and the last one is not optional:

```
git fetch origin staging main
git checkout main && git merge --ff-only origin/staging
git push -u origin main
git checkout staging          # <- this one
```

**And verify a push by reading the branch you meant to move**, not by the exit
code: `git log --oneline -1 origin/staging` after every push. A push that moved
nothing still prints success — hub LESSONS §2, in a new costume.

**Ignore the harness-designated `claude/*` branch** (Doctrine §11). The web-task
harness keeps naming one; this repo's policy is staging and main, so work lands
on `staging` and the session says so.

## The navigation display: PLAN, MAP, and the space under it
`drawPlan` renders BOTH modes and there is deliberately no second renderer.
**PLAN** is centred and north-up — the TCAS traffic display, which is what the
RADAR page is and stays. **MAP** turns the display so the direction of travel is
up, puts own ship near the bottom, and draws a compass arc instead of a rose.

**The rotation is applied at the PROJECTION** (`project`'s `upDeg`), so traffic,
runways, airports, the flown track and the basemap all inherit it and none can be
left behind. A symbol whose own maths knew about track-up would be a second
opinion about which way is up. Exactly ONE thing turns separately and it is
commented: a traffic symbol's own pointing.

**Which way is up is never claimed without a measurement.** `upReference` prefers
the ground track, falls back to heading and SAYS it is heading, and otherwise
stays north-up with the reason — which on a clamped desk is nearly always. The
label is on the instrument and in the canvas's text alternative both.

`hitTestAircraft` is deliberately north-up and centred, because the only tappable
scope is the RADAR page's. It carries a comment saying what it would need if that
ever changes.

**The space under the ND is EICAS and nothing else.** It was reserved from 1.29.0
and claimed in 1.31.0 by the crew alerting list. The rule that decides what may
go in it is the whole design: **a message earns its place only if the condition is
real, is degrading something, and is NOT already visible on the page the reader is
looking at.** Without that clause it becomes the value strip again. Empty is a
valid state and shows nothing; a panel that is off raises nothing at all.
Nothing emits the red tier, and there is no CSS rule for one — an unemitted
colour cannot be measured, so the tier and its colour arrive together or not at
all, and `alerts.test.mjs` holds that.

## The doctrine baseline this app satisfies (§7e, §7f)
The **(i) menu** in the header carries all seven items §7e requires: what this
app is, what it is NOT, how to install it with both platforms named, what
changed, where every number comes from with its terms, how to report a problem,
and the accessibility statement and licence. First-run orientation MOVES into it
when the power gate is dismissed rather than being copied or destroyed, and the
a11y gate asserts both the control's accessible name and that survival.

Item 7 was missing from the first build and was caught only by checking this app
against the doctrine section written from it. Check the list, do not assume.

## Diagnostics — use this instead of asking for screenshots
Pressing the **version stamp** opens a report of the whole panel state as text,
with Copy / Share / Save. It leads with the diagnosis (root causes separated
from what they knocked over), then the attitude filter's internals including the
learned gyro zero-offset, then every field, then console errors captured since
boot. Position is rounded to ~1 km unless the box is ticked.

**Ask the owner for that report, not for a photograph.** Reading pixels off a phone
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
token cannot perform. **The values live in the hub's
[`METADATA.md`](https://github.com/njefferson/noahjefferson/blob/main/METADATA.md)** —
propose there, never fresh in chat where they evaporate. All five rows —
description, website, topics, social preview and default branch — were applied
by the owner and verified against GitHub on 2026-08-03. Nothing is outstanding.
