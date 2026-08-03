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
   * How far back a still moment may be and still count as "this mount, now".
   * Long enough to cover reaching for the button, short enough that a reading
   * from before the device was moved somewhere else cannot be used.
   */
  const STILL_WINDOW_MS = 8000;

  let armedTimer = null;

  /** Stop waiting, whatever the reason. */
  const disarm = () => {
    if (armedTimer !== null) clearInterval(armedTimer);
    armedTimer = null;
    levelBtn.textContent = 'Set this as level';
  };

  /**
   * Wait for the device to be still, then capture on its own.
   *
   * Polled rather than driven off the publish loop so this panel keeps owning
   * its own behaviour; it stops itself on success, on timeout, and whenever the
   * reader presses again.
   */
  const arm = () => {
    if (armedTimer !== null) {
      disarm();
      status.textContent = 'Levelling cancelled.';
      status.dataset.tone = null;
      return;
    }
    const startedAt = Date.now();
    levelBtn.textContent = 'Waiting for it to settle…';
    status.textContent =
      'Waiting for the device to be still — let go of it, or set it down in its mount. It will level itself the moment it settles. Press again to cancel.';
    status.dataset.tone = null;
    announcer.say('Waiting for the device to be still.');
    armedTimer = setInterval(() => {
      const now = Date.now();
      const recent = fusion.lastStillAttitude;
      if (recent && now - recent.at <= 1200) {
        disarm();
        capture();
        return;
      }
      if (now - startedAt > 20000) {
        disarm();
        status.textContent =
          'Gave up waiting — the device never settled. It has to rest still for about a second; a hand-held tablet rarely does, so put it in its mount first.';
        status.dataset.tone = 'bad';
      }
    }, 200);
  };

  /**
   * Capture. Reads the filter's SOLVED attitude rather than a single
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
    // THE PRESS IS THE DISTURBANCE, so do not measure at the press.
    //
    // This used to read stillness at the instant of the click and refuse if the
    // device was moving — which, on a tablet held in two hands, it always was.
    // Noah: "when I tap the button, it wiggles too much to work." The check was
    // right and the moment was wrong.
    //
    // A device in a cradle is still right up until a finger reaches it, so the
    // reference worth having is the one from just before the touch. The filter
    // remembers it continuously; this reads it back.
    const recent = fusion.lastStillAttitude;
    const age = recent ? Date.now() - recent.at : Infinity;
    const usable = recent && age <= STILL_WINDOW_MS ? recent : att.still ? att : null;

    if (!usable) {
      // Nothing still to reach back to. Rather than refusing outright, ARM:
      // capture by itself the moment the device does settle, so the reader can
      // simply put it down. Standard practice on a Dynon or a G5 — the unit
      // does the capturing, the human just holds the aircraft still.
      arm();
      return;
    }

    // The attitude the filter currently holds, expressed as the gravity
    // direction it corresponds to. That vector IS the reference.
    //
    // Composed with any offset already in force, so pressing the button twice
    // does not throw the first calibration away — the second reading is
    // relative to the first, and what gets stored is the total.
    const existing = fusion.mountOffset;
    const totalPitch = usable.pitch + (existing?.pitchDeg ?? 0);
    const totalRoll = usable.roll + (existing?.rollDeg ?? 0);
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
  // POWER OFF AND ON. Noah, mid-wedged-follow: "It needs a reset/reload, or
  // power off/on." A reload IS the power cycle for this app: the worker serves
  // the shell offline, boot starts clean, and the PANEL POWER gate re-asks for
  // the sensors. One honest control beats a panel that can only be unwedged
  // from the browser chrome.
  const restartBtn = el('button', { class: 'setup-btn', type: 'button', text: 'Restart the panel' });
  restartBtn.addEventListener('click', () => {
    announcer.say('Restarting the panel.');
    globalThis.location?.reload();
  });

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
      el('div', { class: 'setup-actions' }, [levelBtn, clearBtn, restartBtn]),
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
    /**
     * The two actions, exposed so the PFD can carry them.
     *
     * LEVELLING BELONGS WHERE THE CROOKED HORIZON IS. Noah: "move the level
     * function out of setup so it's intuitive" — and he is right, because the
     * moment a reader wants it is the moment they are looking at a horizon that
     * is wrong, which is never the moment they are on a settings page. The
     * BEHAVIOUR stays here, in one implementation, and the PFD calls it: two
     * buttons doing the same thing is fine, two copies of the logic is not.
     */
    capture,
    clearLevelling: clear,
    /** The wording of the last outcome, read straight off the node that shows
     *  it, so the PFD copy cannot drift from the SETUP copy. */
    get lastStatus() {
      return { text: status.textContent ?? '', tone: status.dataset.tone ?? '' };
    },
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
