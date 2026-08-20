/**
 * /api/wxtext — the TEXT a flight deck actually carries, from the same service
 * this app already asks for METAR.
 *
 *   Source : https://aviationweather.gov/api/data/{pirep,airsigmet,taf}
 *   Key    : none required
 *   Terms  : https://aviationweather.gov/data/api/ — a US Government work, and
 *            the SAME terms already read and recorded in `POLICIES.metar`.
 *            No new licensing question: same publisher, same service, same API.
 *
 * Three kinds, because a crew reads three different things and they age
 * differently:
 *
 *   PIREP     — a real pilot's report of turbulence, icing or cloud tops. The
 *               only observation in aviation made by a person rather than an
 *               instrument, and the reason it is here.
 *   AIRSIGMET — SIGMETs and AIRMETs: hazard advisories with an area and a time.
 *   TAF       — the forecast that belongs beside the METAR already on ATIS.
 *
 * ---------------------------------------------------------------------------
 * THE RESPONSE SHAPE IS NOT KNOWN, AND THIS FUNCTION SAYS SO (Doctrine §7f).
 * ---------------------------------------------------------------------------
 *
 * This sandbox cannot reach aviationweather.gov at all — its proxy refuses
 * CONNECT, exactly as it does for adsb.lol. So no session has ever seen one of
 * these responses, and a field mapping written from memory would be a guess
 * wearing a verdict's clothes. That mistake has been made in this repo once
 * already, on a provider's terms, and it is written down.
 *
 * TWO THINGS FOLLOW, and together they are why this ships rather than waits:
 *
 *   1. IT ASKS FOR RAW TEXT, not JSON. `format=raw` returns the reports as
 *      FILED — which is also exactly what a flight deck shows, so the honest
 *      thing and the safe thing are the same thing here. There is no field
 *      mapping to be wrong about: the only assumption is that the body is text
 *      with one report per line, and that assumption is CHECKED rather than
 *      trusted.
 *
 *   2. WHAT CAME BACK IS REPORTED. `observed` carries the content type, the
 *      byte count, the line count and the first line, so the first real device
 *      to open ATIS teaches us the shape through the diagnostics report rather
 *      than through another round of guessing. A wrong guess here is
 *      self-diagnosing.
 *
 * WHAT IT WILL NOT DO IS INVENT A REPORT. A body that is not text, or is text
 * this cannot split into reports, produces a stated failure and no content.
 * There is no synthetic data path here either.
 *
 * NOTHING IS SUMMARISED OR REWORDED. A PIREP is shown as filed, because
 * paraphrasing a hazard report is inventing one — and because the raw form is
 * what the reader would see in a briefing.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE FIRST REAL RESPONSE TAUGHT US (2026-08-05, from a device)
 * ---------------------------------------------------------------------------
 *
 *   · `format=raw` WORKS and the reports arrive as filed. The guess was right.
 *   · The AIRSIGMET feed PREFIXES each advisory with its own labels —
 *     `Type: SIGMET Hazard: CONVECTIVE ` — so that block is not purely filed
 *     text. It is a reliable document delimiter and `splitReports` uses it.
 *   · The BBOX IS EVIDENTLY NOT APPLIED TO AIRSIGMET. The identical parameter is
 *     honoured by pirep and taf — every observed station was inside the box —
 *     while airsigmet came back with Phoenix, Nebraska, Cleveland and Key West
 *     in it. WHY is NOT established: it may have no geographic parameter, or one
 *     under another name, or `format=raw` may bypass a filter another format
 *     applies. None of that is knowable from here, so none of it is coded as if
 *     it were. What the app does instead is SAY SO — see `AREA_FILTERED` below.
 *
 * The filtering cannot be done honestly from the raw text either, and the
 * near-misses are worth recording so nobody re-derives them:
 *   · `KKCI` is the issuing office (Kansas City) and is on EVERY US convective
 *     SIGMET whatever the weather. It looks like a region and is not.
 *   · `SIGW`/`SIGC`/`SIGE` is a genuine three-way split of the country, and it
 *     does not help: the Phoenix advisory above is itself in SIGW.
 *   · The `FROM` line is the real polygon, and resolving it needs a navaid
 *     database keyed by the two- and three-letter idents it uses.
 */

import { POLICIES, cached, json, parseBbox, politeFetch, problem } from './_lib.js';

const UPSTREAM = 'https://aviationweather.gov/api/data';

/**
 * The three kinds, their upstream paths, and how long each is worth holding.
 *
 * THE TTLs ARE FROM HOW OFTEN THE THING IS ISSUED, not from a preference. A TAF
 * is amended a few times a day; an AIRMET is issued every six hours and amended
 * as needed; PIREPs arrive continuously. Caching a forecast for five minutes
 * would ask a public service for the same unchanged text ten times an hour
 * (§15.4, §15.6).
 */
/**
 * `area` is what the app KNOWS about whether the box was applied, from real
 * responses — not what it hopes. `'unfiltered'` is a statement the reader is
 * shown, because a page quietly listing Florida advisories to somebody in
 * California is worse than one that says the service does not narrow them.
 */
export const KINDS = Object.freeze({
  pirep: { path: 'pirep', cacheSeconds: 300, label: 'Pilot reports', hours: 3, area: 'filtered' },
  airsigmet: { path: 'airsigmet', cacheSeconds: 900, label: 'SIGMETs and AIRMETs', hours: null, area: 'unfiltered' },
  taf: { path: 'taf', cacheSeconds: 1800, label: 'Forecasts', hours: null, area: 'filtered' },
});

/**
 * THE FEED'S OWN DOCUMENT MARKER, learned from a real response.
 *
 * The airsigmet feed prefixes each advisory with its own labels — the observed
 * form is `Type: SIGMET Hazard: CONVECTIVE ` before the WMO header. That is
 * feed-added metadata rather than filed text, and it is also exactly what a
 * document delimiter is for.
 */
const DOC_MARKER = /^Type:\s/m;

/**
 * Split a raw body into reports, and REFUSE rather than guess when it does not
 * look like reports at all.
 *
 * Exported and pure so it is tested against real-shaped input and against the
 * failure this is most likely to meet: an HTML error page answered with 200,
 * which is a body, is text, and is not a weather report. That exact shape has
 * already fooled one adapter in this repo.
 */
export function splitReports(body) {
  if (typeof body !== 'string') return { error: 'the response body was not text' };
  const text = body.trim();
  if (!text) return { reports: [], strategy: 'empty' };
  // A 200 carrying a web page is a question, not an answer.
  if (/^\s*<(?:!doctype|html|\?xml)/i.test(text)) {
    return { error: 'the service answered with a document rather than reports' };
  }

  /**
   * HOW A BULLETIN IS DIVIDED, and the first version got this WRONG in a way
   * that its own test agreed with.
   *
   * The rule was "a blank line separates reports". A convective SIGMET bulletin
   * is ONE document containing several paragraphs — the advisory, then an
   * OUTLOOK, then AREA 1, AREA 2, AREA 3 — separated by blank lines. Splitting
   * on those tore one bulletin into five, so the panel reported 66 "reports"
   * that were fragments, and an `AREA 3...FROM END-ARG-LIT-MCB...` paragraph
   * appeared on its own with no header saying which SIGMET or which hazard it
   * belonged to. That reads exactly like a truncated warning, which is the
   * failure the rule was written to prevent.
   *
   * It survived because the test's fixture was built to match the heuristic
   * instead of from a real bulletin — a check on a decision, written by the
   * same reasoning that made the decision.
   *
   * So: when the feed marks its own documents, USE ITS MARKER. Only when it
   * does not is the shape genuinely unknown, and only then does the old
   * guesswork apply. `strategy` travels back to the client so the diagnostics
   * report says which one ran, rather than leaving it to be inferred.
   */
  if (DOC_MARKER.test(text)) {
    const marked = text
      .split(/\n(?=Type:\s)/)
      .map((c) => c.trim().replace(/\s*\n\s*/g, ' '))
      .filter(Boolean);
    if (marked.length) return { reports: marked, strategy: 'document-marker' };
  }

  /**
   * NO MARKER. A single-line feed — PIREPs, METARs — splits per line. A feed
   * with blank lines in it and no marker is split on those, which is the best
   * available guess and is recorded as one.
   */
  const blanks = /\n\s*\n/.test(text);
  const chunks = blanks ? text.split(/\n\s*\n/) : text.split('\n');
  const reports = chunks.map((c) => c.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
  return { reports, strategy: blanks ? 'blank-line' : 'per-line' };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);

  const kindId = url.searchParams.get('kind');
  const kind = KINDS[kindId];
  // Validated HERE, before anything is sent: an invalid request that reaches
  // upstream is a 400 that counts against a rate limit for no benefit.
  if (!kind) return problem(`kind must be one of ${Object.keys(KINDS).join(', ')}`, { status: 400 });

  const { bbox, error } = parseBbox(url.searchParams.get('bbox'));
  if (error) return problem(error, { status: 400 });

  const key = `/api/wxtext?kind=${kindId}&bbox=${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`;

  return cached(request, key, kind.cacheSeconds, async () => {
    const upstream = new URL(`${UPSTREAM}/${kind.path}`);
    upstream.searchParams.set('format', 'raw');
    // The AWC parameter order is latMin,lonMin,latMax,lonMax — the same one
    // /api/metar uses, from the same service.
    upstream.searchParams.set('bbox', `${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`);
    if (kind.hours) upstream.searchParams.set('age', String(kind.hours));

    let res;
    try {
      res = await politeFetch(upstream.toString(), { headers: { accept: 'text/plain' } });
    } catch (err) {
      return problem(`aviationweather.gov unreachable: ${err.message}`);
    }
    if (!res.ok) return problem(`aviationweather.gov returned HTTP ${res.status} for ${kindId}`, { status: 502 });

    let body;
    try {
      body = await res.text();
    } catch (err) {
      return problem(`aviationweather.gov returned a body that could not be read: ${err.message}`);
    }

    /**
     * WHAT ACTUALLY CAME BACK (Doctrine §7f). Small, and carried on every
     * response including the successful ones, because the shape being right is
     * a thing to CONFIRM rather than to assume once and forget. It goes into
     * the diagnostics report, which is what is sent instead of a
     * photograph.
     */
    const observed = {
      contentType: res.headers.get('content-type'),
      bytes: body.length,
      firstLine: body.slice(0, 160).split('\n')[0],
    };

    const { reports, strategy, error: shapeError } = splitReports(body);
    if (shapeError) return problem(`${kindId}: ${shapeError} (${observed.contentType ?? 'no content-type'}, ${observed.bytes} bytes)`);

    return json(
      {
        ok: true,
        kind: kindId,
        label: kind.label,
        area: kind.area,
        source: POLICIES.wxtext.source,
        sourceUrl: POLICIES.wxtext.policyUrl,
        bbox,
        fetchedAt: new Date().toISOString(),
        count: reports.length,
        // AS FILED. Nothing here is parsed, summarised or reordered.
        reports,
        // WHICH SPLITTING RULE RAN. The shape of these feeds is still being
        // learned from real responses; "66 reports" meant fragments once, and
        // the strategy is what tells the two apart in a report from a device.
        observed: { ...observed, lines: reports.length, strategy },
      },
      { cacheSeconds: kind.cacheSeconds },
    );
  });
}
