# NOTES.md — fauxplane

The source of truth for this repo. Read it first, every session (Doctrine §12).

## Thesis
A glass-cockpit PWA for a phone or tablet clamped where a panel would be. The
instruments are driven by the device's own sensors and by fetched aviation
feeds. It is not a simulator and it is not certified for anything.

---

## BLOCKED — the base spec is not in this repo

**A session cannot build the v1 panels until Noah supplies the Jet Panel PWA
spec.** This is recorded here rather than only said in chat, because chat does
not survive the session and this blocker will otherwise be rediscovered.

What was searched, on 2026-08-02, all empty:

- `njefferson/fauxplane` — no commits, no branches, no issues, no pull requests.
- `njefferson/noahjefferson` — no match anywhere for jet panel, fauxplane,
  Kollsman, OpenSky, PFD or BITE.

What arrived was an **amendments** document, which is a delta against a base
spec nobody here has. It settles real constants (recorded below, and they are
now in code) but it also refers to things that exist only in the base:

- **Acceptance criterion 4**, which it tightens — the other criteria are unknown,
  and so is the numbering they belong to.
- **The attitude stability test**, which gates the traffic and navdata pages.
  Its pass condition is unstated.
- **The SYNTHETIC engine / fuel / hydraulic pages**, which it removes from v1.
  Nothing here ever contained them.
- **PFD, ATIS/Kollsman and BITE** as page definitions. The amendment names the
  set and calls it final; it does not say what is on them.

Building those from the amendment alone means inventing the spec and then
presenting the invention as Noah's — which is the false-confidence failure
Doctrine §5 forbids, on the one app whose entire premise is that no value on
screen is invented.

**Unblocks with:** the base spec pasted or committed, or Noah saying the
amendment is now the whole spec and the panels are the session's to design.

---

## Settled — from the amendments, 2026-08-02

These are decided and are already expressed in code. `REGION` in
`scripts/build-navdata.mjs` is the single source for the region constants;
nothing else retypes them.

### Navdata region (replaces the earlier "configurable bbox")
- Home reference: Cameron Park, CA — **38.68 N, -121.00 W**.
- Bounding box, roughly a 100 nm radius: latitude **37.00 to 40.40**, longitude
  **-123.20 to -118.80**.
- Built from the OurAirports airports / runways / navaids CSVs.
- Emitted as `public/data/navdata.json`, precached by the service worker.
- KV copy under key `navdata:norcal`.
- `scripts/build-navdata.mjs` regenerates it. The raw CSVs are never committed.

Worth knowing, because it is easy to assume otherwise: **the box reaches past
the Sierra to Reno.** A fixture written on the assumption that it does not was
the one test that failed on first run.

### Map and traffic
- Default map centre and HSI home waypoint: **38.68 / -121.00**.
- Default OpenSky traffic bbox on cold start, before the first GPS fix:
  `lamin=38.10 lomin=-121.85 lamax=39.25 lomax=-120.15`.
- Once a GPS fix exists, derive the traffic bbox from current position with a
  **40 nm half-width**, and stop using the default.

### METAR station selection
- **No hardcoded identifier**, ever.
- Query `/api/metar?bbox=38.2,-121.9,39.2,-120.2`.
- Select the nearest station **with a valid altimeter setting**, sorted by
  great-circle distance from current position — or from the home reference
  before the first fix.
- Display the chosen station ID **and its distance** on the ATIS page, so the
  source is always visible.
- If no station in the box reports an altimeter setting: the Kollsman window
  falls back to 29.92, and the altitude tape is flagged DERIVED/STALE with the
  reason shown.

### Scope — engine and systems pages move to v2
- The SYNTHETIC engine / fuel / hydraulic pages are out of v1 entirely.
- Host-telemetry mapping (battery %, charge rate, thermal, CPU load) is not
  implemented in this pass, and the panels are **not stubbed**.
- Consequence, and it is the load-bearing one: **v1 contains no synthetic data
  path at all.** Every value rendered traces to a device sensor or a fetched
  feed. Provenance may be LIVE, DERIVED, STALE or FAIL, and any code path that
  would produce a value from neither a sensor nor a feed is a defect.
- Battery Status API and Network Information API stay in v1 only as **BITE page
  capability entries**, not as instrument sources.

### v1 panel set — final
PFD, ATIS/Kollsman, BITE. Traffic and navdata pages remain gated behind the
attitude stability test.

### Branches (Noah, 2026-08-02)
`staging` and `main` only. Staging is a hard release gate: product changes land
on `staging`, wait for Noah's pass on his actual device, and reach `main` only
on his explicit "promote". Docs-only changes may skip it. The harness-designated
`claude/*` branch is ignored (Doctrine §11); the one created while this was
still unruled has been deleted, with its commit preserved on both branches.

---

## Built this session

`scripts/build-navdata.mjs` — filters the three OurAirports CSVs to the region
and emits `public/data/navdata.json`.

- Parses CSV to RFC 4180 (quoted commas, escaped quotes, CRLF, BOM, newlines
  inside fields). OurAirports names contain all of these; splitting on `,`
  shifts every later column and produces a file that looks plausible and is
  wrong.
- Indexes columns **by header name**, never by position, and fails loudly when
  a required column disappears. OurAirports has reordered columns before.
- Airports and navaids filter on their own coordinates, inclusive of the edges.
- **Runways join on their parent airport** rather than filtering by bbox: a
  runway row's own `le_`/`he_` coordinates are frequently blank, so a
  geographic filter would silently drop most of them.
- A blank number is `null`, never `0`. An elevation of 0 ft and an unknown
  elevation are different facts, and an altimeter page that cannot tell them
  apart is the synthetic-data defect wearing a plausible number.
- Emits `meta` carrying the region, the KV key, the source, its licence, and a
  SHA-256 of each input file, so a later session can tell whether a rebuild
  would change anything.
- Refuses to write an empty database, and exits non-zero on any failure. It
  never emits a partial file.

Verified: 16 tests pass against fixtures reproducing the real file shapes, and
the CLI path was run end to end with `--from`, emitting a correct JSON file.
One test failed on first run — the Reno assumption above — and was fixed
(Doctrine §6, make a test fail once before trusting it).

Not verified: **the script has never run against the real OurAirports data.**
See below.

---

## Open — needs Noah

1. **The base spec.** See BLOCKED above. Nothing else here is as expensive.

2. **`public/data/navdata.json` does not exist yet.** The egress proxy denies
   `davidmegginson.github.io` (403 to CONNECT, org policy — the proxy README
   says report it, do not route around it), so the CSVs could not be fetched
   and the real file could not be generated. A hand-made stand-in would be
   exactly the synthetic data v1 forbids, so none was committed. Two ways
   forward, both cheap: run `node scripts/build-navdata.mjs --from <dir>` with
   the CSVs downloaded anywhere with egress, or allow the host for a session.

3. **OurAirports' published terms were not read this session** — the same block.
   They are believed to be public domain, and the code says "believed" by
   holding `SOURCE_POLICY.policyReadOn = null`, which makes the fetch path
   refuse to run at all until someone fills it in. Doctrine §15.1 says the
   published policy is the authority and our inference is not, so this stays
   refused rather than assumed.

4. **Repo metadata** (manual, GitHub UI — Doctrine §10). None of it is set.
   Proposed values, each needing a yes:
   - Description, written for what the app IS and naming no current feature:
     *"A glass-cockpit instrument panel for a phone or tablet, driven by the
     device's own sensors and live aviation data. Free, offline-first, no
     account."*
   - Website: not deployed yet, so nothing to set. Revisit at first deploy.
   - Topics: `pwa`, `aviation`, `offline-first`, `glass-cockpit`, `no-account`.
   - Social preview: not made yet. Doctrine §10 requires the tile carry the
     app's NAME in real type, with measured contrast.

---

## Bootstrap status (Doctrine §13)

Done: `CLAUDE.md` (pointer only), `LICENSE.md` (PolyForm Noncommercial 1.0.0,
with a scope block separating the app's own licence from OurAirports data and
runtime METAR), `NOTES.md`, branches (`staging` and `main`).

Not done, and why:
- `ACCESSIBILITY.md` — waits on there being a UI. It is an append-only register
  and an empty one is a claim of coverage that does not exist.
- On-screen build stamp (§7b) — same. It lands with the first UI commit, not
  after, and its contrast pair joins the register in that same commit.
- Hub wiring (§13.6) — the hub links out to the app, the app links back, and
  its About links the shared accessibility statement. Waits on a deploy; there
  is nothing to link to yet.
- Repo metadata — item 4 above.
