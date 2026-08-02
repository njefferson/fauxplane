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

## The rule that shapes the whole v1
**v1 contains no synthetic data path at all.** Every value on screen traces to
a device sensor or a fetched feed. Provenance is one of LIVE, DERIVED, STALE or
FAIL, and it is shown. Any code path that would produce a value from neither a
sensor nor a feed is a defect, not a placeholder — this includes "reasonable"
defaults standing in for a reading that is missing. A missing reading is FAIL,
and it says so.

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

Every gate, and each one exits non-zero:
- `npm test` — 84 unit tests over the pure logic, including the magnetic model
  against NOAA's published test values at 100 points.
- `npm run a11y` — axe plus the checks axe cannot make, over 3 viewports x 2
  palettes x 3 pages, including the acceptance criteria.
- `npm run palette` — the hub's `palette-check.mjs` against
  `palettes/fauxplane.json`. The gate is never forked; it is run from the hub.
- `node scripts/plant.mjs` — breaks one thing at a time and proves the gate
  goes red **about that thing**. A check nobody has watched fail is not evidence.
- `node scripts/preview.mjs` — renders the panel in live states a sandbox cannot
  reach. Not shipped, not imported by the app; it drives the store from outside
  through the same public write the sensors use.

## Branches
`staging` and `main` only (Noah, 2026-08-02). Staging is a **hard release gate**
(Doctrine §7): every product change lands on `staging`, waits for Noah's pass on
his actual device, and reaches `main` only on his explicit "promote" — never on
a session's own read of "it's ready". Docs-only changes (this file, `NOTES.md`)
may skip the gate.

**Ignore the harness-designated `claude/*` branch** (Doctrine §11). The web-task
harness keeps naming one; this repo's policy is staging and main, so work lands
on `staging` and the session says so.

## Repo metadata (manual, confirm — see Doctrine §10)
Description / website / topics / social-preview are GitHub-UI steps the session
token cannot perform. None are set. List the exact values and ask Noah to
confirm each; never report this repo "set up" while any is unconfirmed.
