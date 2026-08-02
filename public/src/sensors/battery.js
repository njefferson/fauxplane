/**
 * battery.js — Battery Status, as a BITE CAPABILITY ENTRY ONLY.
 *
 * v1 has no instrument driven by host telemetry. The engine/fuel/hydraulic
 * pages that would have consumed this are v2, and they are explicitly NOT
 * stubbed. So this module reports whether the API exists and what it says, and
 * nothing on the PFD reads it. It writes no state field, which is the
 * structural way of saying "not an instrument source" rather than the
 * documentary way.
 */

import { DEGRADED, FAILED, PASS } from '../core/capability.js';

export async function probeBattery() {
  if (typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') {
    return {
      status: FAILED,
      reason: 'Battery Status API not implemented (expected on iOS and in Safari everywhere)',
      detail: null,
    };
  }
  try {
    const b = await navigator.getBattery();
    const pct = Math.round(b.level * 100);
    return {
      status: PASS,
      reason: `${pct}% ${b.charging ? 'charging' : 'on battery'} — BITE entry only, drives no instrument in v1`,
      detail: { levelPct: pct, charging: b.charging },
    };
  } catch (err) {
    return { status: DEGRADED, reason: `Battery Status API present but refused: ${err.message}`, detail: null };
  }
}
