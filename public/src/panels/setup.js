/**
 * setup.js — levelling the panel to whatever it is mounted in.
 *
 * THIS IS BORESIGHT CALIBRATION, and the procedure is the one every installed
 * attitude reference uses: put the vehicle somewhere level, hold still, press a
 * button, and the instrument records the rotation between its own case and the
 * vehicle. A Garmin G5 calls it Pitch/Roll Offset; a Dynon calls it Level
 * Calibration. Nothing is invented by it — the reading is still entirely the
 * accelerometer's — but the instrument is told which direction to call level.
 *
 * A CAR CRADLE IS THE SAME PROBLEM WITH A WORSE MOUNT. Cradles sit a phone back
 * ten to thirty degrees and are rarely square, so an uncalibrated horizon in one
 * sits permanently nose-high and slightly banked, which is exactly what it
 * should do and exactly what nobody wants to look at.
 *
 * IT REFUSES A BAD REFERENCE. If the device is not genuinely still, the capture
 * is declined with the reason. A calibration taken while moving bakes the
 * movement into every subsequent reading, and the failure is invisible: the
 * horizon looks fine and is wrong for ever. Refusing is cheap; a silently bad
 * zero is not.
 */

import { el } from '../render/dom.js';
import { mountAnglesDeg, upVectorScreenFrame } from '../core/fusion.js';

const STORE_KEY = 'fauxplane.mount';

/**
 * Read the saved offset. On disk it is the measured GRAVITY REFERENCE, not the
 * derived rotation: the reference is what was actually observed, the rotation
 * is a consequence, and storing the raw observation means a later change to the
 * maths does not have to migrate anything.
 */
export function loadSaved(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (![v?.x, v?.y, v?.z].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    const m = Math.hypot(v.x, v.y, v.z);
    if (!(m > 0.5)) return null; // not a unit vector; not ours
    return { x: v.x / m, y: v.y / m, z: v.z / m, screenAngle: Number(v.screenAngle) || 0, at: Number(v.at) || null };
  } catch {
    // A corrupt or unavailable store is not an error worth surfacing — it just
    // means there is no calibration, which is the normal starting state.
    return null;
  }
}

export function saveMount(value, storage = globalThis.localStorage) {
  try {
    if (!value) storage?.removeItem(STORE_KEY);
    else storage?.setItem(STORE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const fmt = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`;

export function createSetup({ host, fusion, state, announcer, screenAngle, onChange = () => {} }) {
  const status = el('p', { class: 'setup-status', role: 'status', 'aria-live': 'polite' });
  const current = el('p', { class: 'setup-current' });

  const levelBtn = el('button', { class: 'setup-btn setup-primary', type: 'button', text: 'Set this as level' });
  const clearBtn = el('button', { class: 'setup-btn', type: 'button', text: 'Clear levelling' });

  /**
   * Capture. Reads the filter's CURRENT solved attitude rather than a single
   * accelerometer sample: the filter has already rejected manoeuvring samples,
   * removed the gyro's zero-offset and settled, so its answer is a far better
   * reference than whatever one raw reading happens to say.
   */
  const capture = () => {
    const att = fusion.read(Date.now());

    if (!att.hasAttitude) {
      status.textContent = `Cannot level yet — there is no attitude to level. ${att.reason ?? ''}`;
      status.dataset.tone = 'bad';
      return;
    }
    if (!att.still) {
      status.textContent =
        'Cannot level while the device is moving. Park somewhere level, let it settle for a second, and press again — a reference captured while moving is wrong for ever and looks fine.';
      status.dataset.tone = 'bad';
      return;
    }

    // The attitude the filter currently holds, expressed as the gravity
    // direction it corresponds to. That vector IS the reference.
    //
    // Composed with any offset already in force, so pressing the button twice
    // does not throw the first calibration away — the second reading is
    // relative to the first, and what gets stored is the total.
    const existing = fusion.mountOffset;
    const totalPitch = att.pitch + (existing?.pitchDeg ?? 0);
    const totalRoll = att.roll + (existing?.rollDeg ?? 0);
    const reference = upVectorScreenFrame(totalPitch, totalRoll);

    const applied = fusion.setMount(reference, screenAngle());
    if (!applied) {
      status.textContent = 'That orientation cannot be levelled — the device appears to be upside down relative to level.';
      status.dataset.tone = 'bad';
      return;
    }

    saveMount({ ...reference, screenAngle: screenAngle(), at: Date.now() });
    status.textContent = `Levelled. The cradle is ${fmt(applied.pitchDeg)} in pitch and ${fmt(applied.rollDeg)} in roll; the horizon now reads zero here.`;
    status.dataset.tone = 'good';
    announcer.say('Panel levelled to its mount.');
    render();
    onChange();
  };

  const clear = () => {
    fusion.clearMount();
    saveMount(null);
    status.textContent = 'Levelling cleared. The horizon is reading the device itself again.';
    status.dataset.tone = 'good';
    announcer.say('Levelling cleared.');
    render();
    onChange();
  };

  levelBtn.addEventListener('click', capture);
  clearBtn.addEventListener('click', clear);

  host.replaceChildren(
    el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'Level the panel to its mount' }),
      el('p', {
        class: 'setup-body',
        text:
          'A phone in a car cradle or a desk clamp is never square to the thing it is mounted in — most cradles tilt back ten to thirty degrees. Levelling records that tilt once, so the horizon reads zero when the vehicle is level instead of showing the angle of the cradle.',
      }),
      el('p', {
        class: 'setup-body',
        text:
          'Put the device in its mount, park somewhere level, and let it sit still for a second before pressing. It will refuse if it is moving: a reference captured in motion is baked into every reading afterwards and looks perfectly fine.',
      }),
      el('div', { class: 'setup-actions' }, [levelBtn, clearBtn]),
      status,
      current,
    ]),
    el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: 'What this does not fix' }),
      el('p', {
        class: 'setup-body',
        text:
          'Levelling sets pitch and roll. It cannot set which way is forward, because gravity says which way is down and nothing at all about direction — so if the phone sits twisted sideways in its cradle, the pitch and roll axes stay twisted with it. Mount it square and level it.',
      }),
      // THE CAR-SPECIFIC WARNING, on screen rather than only true.
      el('p', {
        class: 'setup-body setup-caution',
        text:
          'In a car the horizon will pitch when you brake or accelerate, and this is not a fault. An accelerometer cannot tell braking from tilting — both push you into the seat the same way. Braking at a third of a g reads like nineteen degrees of nose-up. The panel rejects the strongest of those and coasts on the gyroscope, saying so while it does, but steady acceleration will still lean the horizon. It is an instrument for a passenger to enjoy, not something to drive by.',
      }),
    ]),
  );

  function render() {
    const offset = fusion.mountOffset;
    if (!offset) {
      current.textContent = 'Not levelled — the horizon is showing the device’s own attitude.';
      current.dataset.state = 'off';
      clearBtn.disabled = true;
      return;
    }
    clearBtn.disabled = false;
    const stale = offset.capturedAtScreenAngle !== screenAngle();
    current.dataset.state = stale ? 'stale' : 'on';
    current.textContent = stale
      ? `Levelled at ${fmt(offset.pitchDeg)} pitch, ${fmt(offset.rollDeg)} roll — but the screen has rotated since, so it no longer applies. Rotate back, or level it again here.`
      : `Levelled: cradle ${fmt(offset.pitchDeg)} pitch, ${fmt(offset.rollDeg)} roll.`;
  }

  render();

  return {
    render,
    /** Re-apply a saved calibration at boot. Separate from capture so a stored
     *  value can never be treated as a fresh one. */
    restore() {
      const saved = loadSaved();
      if (!saved) return null;
      if (saved.screenAngle !== screenAngle()) {
        // Kept, not discarded: the reader may simply be holding the phone the
        // other way round at boot and will rotate it back into the cradle.
        render();
        return { restored: false, reason: 'saved in a different screen orientation' };
      }
      const applied = fusion.setMount({ x: saved.x, y: saved.y, z: saved.z }, saved.screenAngle);
      render();
      return applied ? { restored: true, angles: applied } : { restored: false, reason: 'the saved reference is unusable' };
    },
  };
}

export { mountAnglesDeg };
