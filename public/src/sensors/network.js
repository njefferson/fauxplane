/**
 * network.js — Network Information, as a BITE CAPABILITY ENTRY ONLY.
 *
 * Same rule as battery.js: v1 has no instrument driven by host telemetry, so
 * this writes no state field. What it DOES do is give the BITE page something
 * genuinely useful — whether the browser believes it is online — which is the
 * first question anyone asks when the feeds go STALE.
 *
 * `navigator.onLine` is famously optimistic: it reports true for a device
 * attached to a network that goes nowhere. It is reported as what it is, a
 * claim by the browser, and the feed ages are what actually prove reachability.
 */

import { DEGRADED, FAILED, PASS } from '../core/capability.js';

export function probeNetwork() {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : null;
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;

  if (!c) {
    return {
      status: FAILED,
      reason:
        online === false
          ? 'Network Information API not implemented; the browser reports OFFLINE'
          : 'Network Information API not implemented (expected on iOS) — feed ages are the real reachability test',
      detail: { online },
    };
  }

  const bits = [c.effectiveType, c.downlink ? `${c.downlink} Mb/s` : null, c.saveData ? 'data saver on' : null].filter(
    Boolean,
  );
  return {
    status: online === false ? DEGRADED : PASS,
    reason: `${online === false ? 'browser reports OFFLINE — ' : ''}${bits.join(', ') || 'connection details unavailable'} — BITE entry only`,
    detail: { online, effectiveType: c.effectiveType ?? null, downlink: c.downlink ?? null },
  };
}

/** Subscribe to online/offline transitions so BITE updates without a reload. */
export function watchNetwork(onChange) {
  if (typeof window === 'undefined') return () => {};
  const fire = () => onChange(probeNetwork());
  window.addEventListener('online', fire);
  window.addEventListener('offline', fire);
  navigator.connection?.addEventListener?.('change', fire);
  return () => {
    window.removeEventListener('online', fire);
    window.removeEventListener('offline', fire);
    navigator.connection?.removeEventListener?.('change', fire);
  };
}
