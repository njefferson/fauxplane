/**
 * manifest.js — which optional data bundles are shipped, read once.
 *
 * WHY THIS EXISTS RATHER THAN JUST FETCHING AND HANDLING THE 404.
 *
 * Three bundles are deliberately absent from this build (navdata, the geoid
 * grid, the WMM coefficients), each for a documented reason. Reaching for a
 * file that is known not to be there produces a console error on every boot —
 * and "no console errors" is acceptance criterion 1, not a preference. Worse,
 * an HTTP status is a poor explanation: "404" cannot tell a pilot the
 * difference between "not generated yet" and "deliberately not approximated".
 *
 * So the reasons live in a committed file, the loaders consult it first, and
 * BITE prints a sentence somebody wrote on purpose.
 */

export const MANIFEST_URL = '/data/manifest.json';

let cached = null;

export async function loadManifest(fetchImpl = fetch) {
  if (cached) return cached;
  try {
    const res = await fetchImpl(MANIFEST_URL, { cache: 'force-cache' });
    if (!res.ok) {
      cached = { ok: false, reason: `data manifest missing (${MANIFEST_URL} -> HTTP ${res.status})`, entries: {} };
      return cached;
    }
    const body = await res.json();
    cached = { ok: true, entries: body };
    return cached;
  } catch (err) {
    cached = { ok: false, reason: `data manifest unreadable: ${err.message}`, entries: {} };
    return cached;
  }
}

/**
 * Ask about one bundle. Returns { present, reason, path }.
 *
 * An entry the manifest does not mention is NOT assumed present — an unknown
 * bundle is an absent one, and it says that rather than trying the fetch and
 * hoping.
 */
export async function bundleStatus(name, fetchImpl = fetch) {
  const manifest = await loadManifest(fetchImpl);
  if (!manifest.ok) return { present: false, reason: manifest.reason, path: null };
  const entry = manifest.entries[name];
  if (!entry) return { present: false, reason: `the data manifest lists no entry for "${name}"`, path: null, detail: null };
  return {
    present: entry.present === true,
    // SHORT — this is what an instrument flag and a readout row show.
    reason: entry.reason ?? null,
    // LONG — BITE has room for the whole explanation, a gauge does not.
    detail: entry.detail ?? null,
    path: entry.path ?? null,
  };
}

/** Test seam: forget what was read, so a test can supply a different manifest. */
export const resetManifestCache = () => {
  cached = null;
};
