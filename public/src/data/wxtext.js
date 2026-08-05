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

/** The three blocks, in the order a crew would read them: what is happening
 *  now, what is being warned about, then what is forecast. */
export const WX_KINDS = [
  { id: 'pirep', label: 'Pilot reports', empty: 'No pilot reports in the last three hours.' },
  { id: 'airsigmet', label: 'SIGMETs and AIRMETs', empty: 'No hazard advisories in force.' },
  { id: 'taf', label: 'Forecasts', empty: 'No forecast published for this area.' },
];

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
 * What one block says about itself, in one line. Pure and exported, so every
 * sentence this feature can produce is testable without a browser or a feed —
 * and so that "the sky is quiet" and "the service did not answer" can be held
 * apart by a test rather than by care.
 */
export function wxSummary(kind, result, now = Date.now()) {
  if (!result) return { tone: 'wait', text: 'Not asked yet.' };
  if (!result.ok) return { tone: 'fail', text: `Not available — ${result.reason}` };
  const ageS = Number.isFinite(result.at) ? Math.max(0, Math.round((now - result.at) / 1000)) : null;
  const age = ageS === null ? '' : ageS < 90 ? ' · just now' : ` · ${Math.round(ageS / 60)} min ago`;
  if (!result.count) return { tone: 'empty', text: `${kind.empty}${age}` };
  return {
    tone: 'ok',
    text: `${result.count} ${result.count === 1 ? 'report' : 'reports'}${age}`,
  };
}
