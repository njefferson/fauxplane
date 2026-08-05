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
export const KINDS = Object.freeze({
  pirep: { path: 'pirep', cacheSeconds: 300, label: 'Pilot reports', hours: 3 },
  airsigmet: { path: 'airsigmet', cacheSeconds: 900, label: 'SIGMETs and AIRMETs', hours: null },
  taf: { path: 'taf', cacheSeconds: 1800, label: 'Forecasts', hours: null },
});

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
  if (!text) return { reports: [] };
  // A 200 carrying a web page is a question, not an answer.
  if (/^\s*<(?:!doctype|html|\?xml)/i.test(text)) {
    return { error: 'the service answered with a document rather than reports' };
  }
  /**
   * A REPORT MAY WRAP. AIRMETs in particular run to several lines, and the
   * blank line between them is what separates one from the next; single-line
   * feeds have no blank lines and split per line. Both are handled by
   * preferring the blank-line split when there IS one.
   */
  const chunks = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split('\n');
  const reports = chunks.map((c) => c.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
  return { reports };
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
     * the diagnostics report, which is what the owner sends instead of a
     * photograph.
     */
    const observed = {
      contentType: res.headers.get('content-type'),
      bytes: body.length,
      firstLine: body.slice(0, 160).split('\n')[0],
    };

    const { reports, error: shapeError } = splitReports(body);
    if (shapeError) return problem(`${kindId}: ${shapeError} (${observed.contentType ?? 'no content-type'}, ${observed.bytes} bytes)`);

    return json(
      {
        ok: true,
        kind: kindId,
        label: kind.label,
        source: POLICIES.wxtext.source,
        sourceUrl: POLICIES.wxtext.policyUrl,
        bbox,
        fetchedAt: new Date().toISOString(),
        count: reports.length,
        // AS FILED. Nothing here is parsed, summarised or reordered.
        reports,
        observed: { ...observed, lines: reports.length },
      },
      { cacheSeconds: kind.cacheSeconds },
    );
  });
}
