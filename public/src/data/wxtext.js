/**
 * wxtext.js — pilot reports, hazard advisories and forecasts, as filed.
 *
 * WHY THIS IS NOT A STATE FIELD. Everything else the panel shows is a single
 * value with a provenance and an age, which is what `state.js` is built for.
 * These are LISTS OF TEXT — a dozen PIREPs, three AIRMETs — and forcing them
 * into a scalar registry would mean either one field holding an array (a value
 * whose staleness says nothing about the reports inside it) or a field per
 * report (a registry that changes shape every fetch). So the ATIS panel reads
 * the result directly, exactly as it already reads `metar.last`.
 *
 * The honesty rule is unchanged and is carried per KIND: each block says when
 * it was fetched, how many reports it has, and — when it has none — whether
 * that means the sky is quiet or the service did not answer. Those are two
 * different facts and this app does not let one stand in for the other.
 *
 * NOTHING IS PARSED. A PIREP is shown as filed, because paraphrasing a hazard
 * report is inventing one, and because the raw form is what a briefing shows.
 */

import { REGION } from '../core/region.js';
import { placeAdvisory } from './fromline.js';

/** The three blocks, in the order a crew would read them: what is happening
 *  now, what is being warned about, then what is forecast. */
export const WX_KINDS = [
  { id: 'pirep', label: 'Pilot reports', empty: 'No pilot reports in the last three hours.' },
  { id: 'airsigmet', label: 'SIGMETs and AIRMETs', empty: 'No hazard advisories in force.' },
  { id: 'taf', label: 'Forecasts', empty: 'No forecast published for this area.' },
];

/**
 * WHEN A FEED DOES NOT NARROW TO THE AREA, SAY SO — on the block, every time.
 *
 * The request carries the same box for all three kinds. Two of them honour it;
 * the advisories come back covering the whole country, and the first real
 * response put Phoenix, Nebraska, Cleveland and Key West on a panel in
 * Sacramento. There is no honest way to filter them from the raw text (the
 * issuing office is Kansas City for all of them, and the west/central/east
 * bulletin split still puts Arizona in ours), so the choice is between hiding
 * real advisories on a guess and telling the reader what they are looking at.
 *
 * This app tells them. Doctrine §5: a panel says what it is showing, and
 * "everything the service publishes" is a different claim from "everything near
 * you" — a reader who assumed the second would read a Florida SIGMET as local.
 */
export const UNFILTERED_NOTE = 'This service does not narrow these to your area — they cover the whole country.';

/**
 * The box to ask about. WIDER than the METAR box on purpose: a METAR query is
 * looking for the NEAREST reporting station, and one station is enough. A PIREP
 * of severe turbulence forty miles away is worth reading, and a SIGMET's whole
 * point is that it covers an area.
 *
 * Still the navdata region rather than anything larger — the Function refuses a
 * box over twelve degrees a side, and asking a public service to sweep half a
 * continent is the shape §15.5 forbids.
 */
export const wxBboxParam = () => {
  const b = REGION.bbox;
  return `${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}`;
};

export function createWxTextSource({ fetchImpl = null, clock = () => Date.now() } = {}) {
  const doFetch = (...args) => (fetchImpl ?? fetch)(...args);
  /** Per kind: the last result, good or bad. Never cleared on a failure — the
   *  reports we DID get are still real observations, and dropping them because
   *  a later fetch was refused would lose data to a network event. */
  const last = new Map();
  let inFlight = null;

  const one = async (kind) => {
    let res;
    try {
      res = await doFetch(`/api/wxtext?kind=${kind}&bbox=${encodeURIComponent(wxBboxParam())}`, { cache: 'no-store' });
    } catch (err) {
      return { ok: false, kind, reason: `not fetched: ${err.message}` };
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.reason) detail = body.reason;
      } catch {
        /* a non-JSON error body is still a status worth reporting */
      }
      return { ok: false, kind, reason: detail };
    }
    try {
      const body = await res.json();
      /**
       * THE BODY'S OWN VERDICT WINS. A 200 carrying `{ok: false, reason}` is
       * how the Function reports a refusal it wants the reader to see — the
       * upstream answered with a document, say — and the first version of this
       * spread the body and then wrote `ok: true` over the top of it, so a
       * stated refusal arrived as a success with no reports in it.
       *
       * Found by the accessibility gate, whose harness stubs every endpoint as
       * exactly that shape.
       */
      if (body?.ok === false) return { ok: false, kind, reason: body.reason ?? 'refused with no reason given' };
      return { ...body, ok: true, kind, at: clock() };
    } catch (err) {
      return { ok: false, kind, reason: `the response was not JSON: ${err.message}` };
    }
  };

  return {
    /** Everything fetched so far, for the ATIS page and the diagnostics report. */
    get all() {
      return WX_KINDS.map((k) => ({ ...k, result: last.get(k.id) ?? null }));
    },

    /**
     * THE THREE ARE FETCHED TOGETHER AND SEQUENTIALLY, not in parallel.
     *
     * Three simultaneous requests to one free public service, from an address
     * shared with every other Cloudflare tenant, is precisely the burst §15.3
     * asks us not to send. They are cheap and heavily cached; one after another
     * costs a few hundred milliseconds nobody is waiting on.
     */
    async refresh() {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        for (const k of WX_KINDS) last.set(k.id, await one(k.id));
        return this.all;
      })();
      try {
        return await inFlight;
      } finally {
        inFlight = null;
      }
    },
  };
}

/**
 * The three groups an unfiltered block is sorted into, in the order they are
 * read. The order is the design: what is over the reader first, what could not
 * be worked out second — because an unknown is closer to a hazard than to a
 * filed-away one — and the rest last, behind a disclosure.
 */
export const PLACEMENT_GROUPS = [
  { where: 'near', label: 'Over your area', open: true },
  { where: 'unknown', label: 'Could not place', open: true },
  { where: 'far', label: 'Elsewhere', open: false },
];

/**
 * Sort a block's reports into those three groups.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS EVER DROPPED, and that is not a nicety
 * ---------------------------------------------------------------------------
 *
 * `Elsewhere` is COLLAPSED, never removed — it is behind a disclosure control
 * the reader can open, and the count is on the summary line either way. An
 * advisory this could not place goes in its own group WITH its reason, next to
 * the ones that are overhead, because "we do not know where this is" is not
 * "it is not near you". Hiding a hazard advisory on a parser's failure would be
 * a worse defect than the nationwide list this replaces.
 *
 * WITHOUT THE TABLE, NOTHING IS GROUPED AT ALL. If the navaid bundle is absent
 * there is no geography to sort on, and inventing an order would be worse than
 * the honest nationwide list — so it returns `placed: false` and the block goes
 * back to showing every report under `UNFILTERED_NOTE`. That is the same
 * mechanism as every other absent bundle: a stated reason, never a guess.
 */
export function placeReports(reports, box, lookup) {
  const list = Array.isArray(reports) ? reports : [];
  if (typeof lookup !== 'function' || !box) {
    return { placed: false, groups: [], all: list, near: 0, unknown: 0, far: 0 };
  }
  const byWhere = { near: [], unknown: [], far: [] };
  for (const text of list) {
    const out = placeAdvisory(text, box, lookup);
    (byWhere[out.where] ?? byWhere.unknown).push({ text, where: out.where, reason: out.reason });
  }
  return {
    placed: true,
    groups: PLACEMENT_GROUPS.map((g) => ({ ...g, reports: byWhere[g.where] })).filter((g) => g.reports.length),
    all: list,
    near: byWhere.near.length,
    unknown: byWhere.unknown.length,
    far: byWhere.far.length,
  };
}

/**
 * What one block says about itself, in one line. Pure and exported, so every
 * sentence this feature can produce is testable without a browser or a feed —
 * and so that "the sky is quiet" and "the service did not answer" can be held
 * apart by a test rather than by care.
 *
 * `placement` is the fourth state of the area caveat. Unfiltered and unplaced
 * still says the service covers the whole country; unfiltered and PLACED says
 * how many of them are actually over the reader, which is the sentence the
 * whole feature exists to be able to write.
 */
export function wxSummary(kind, result, now = Date.now(), placement = null) {
  if (!result) return { tone: 'wait', text: 'Not asked yet.' };
  if (!result.ok) return { tone: 'fail', text: `Not available — ${result.reason}` };
  const ageS = Number.isFinite(result.at) ? Math.max(0, Math.round((now - result.at) / 1000)) : null;
  const age = ageS === null ? '' : ageS < 90 ? ' · just now' : ` · ${Math.round(ageS / 60)} min ago`;
  if (!result.count) return { tone: 'empty', text: `${kind.empty}${age}` };

  // The area caveat rides on the COUNT line, where the number that would
  // otherwise be misread is. Put anywhere else it is a note nobody connects.
  let area = '';
  if (result.area === 'unfiltered') {
    area = placement?.placed
      ? ` · ${placement.near} over your area${placement.unknown ? `, ${placement.unknown} that could not be placed` : ''}`
      : ` · ${UNFILTERED_NOTE}`;
  }
  return {
    tone: 'ok',
    text: `${result.count} ${result.count === 1 ? 'report' : 'reports'}${age}${area}`,
  };
}
