/**
 * whatsnew.js — the patch-notes surface (Doctrine §7d).
 *
 * IT LIVES ON BITE, and that placement is the argument. §7d requires a release
 * to say what is still broken, and BITE is already the page whose entire job is
 * "what is this panel doing and what is wrong with it". Splitting "what changed"
 * from "what is wrong" across two screens would let a reader find the wins
 * without the caveats, which is the failure mode the rule exists to stop.
 *
 * RENDERED AS HEADED LISTS, NEVER A GRID (Doctrine §3). A release-by-release
 * comparison is exactly the shape that tempts a table, and a table is lost
 * silently on the reader's iPad.
 *
 * WHAT IS STILL BROKEN IS NOT STYLED AS AN ALARM. It is amber at most — flight
 * deck convention reserves red for a condition needing immediate action, and a
 * known limitation in a release note is the reader being informed, not being
 * told to act (Doctrine §4). An empty `broken` list says so in words rather
 * than rendering nothing, because a missing section reads as an omission.
 */

import { RELEASES, updateNotice } from '../data/releases.js';
import { VERSION } from '../core/version.js';
import { el } from '../render/dom.js';

/** Where the last-seen release is remembered. */
export const SEEN_KEY = 'fauxplane.seenVersion';

/** Read the last release this reader saw. Storage can be absent or refused. */
export function loadSeen(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SEEN_KEY);
    return typeof raw === 'string' && raw ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Record the running release as seen.
 *
 * SWALLOWING THE FAILURE IS CORRECT HERE. Private browsing and a full quota
 * both throw on setItem, and neither is a reason to break a working panel over
 * a banner. The cost of failing silently is that the notice shows again next
 * launch, which is a mild annoyance rather than a defect.
 */
export function saveSeen(version = VERSION, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SEEN_KEY, version);
    return true;
  } catch {
    return false;
  }
}

/** One release, as a heading and two lists. */
function releaseNode(release, { open }) {
  const body = el('div', { class: 'wn-body' });

  body.append(el('p', { class: 'wn-headline', text: release.headline }));

  if (release.changed.length) {
    body.append(el('h4', { class: 'wn-sub', text: 'What changed' }));
    // h2 (card) → h3 (the release, inside its summary) → h4 (these). The
    // accessibility gate caught this jumping h2 → h4, because a <summary> is a
    // disclosure control and not a heading, so nothing was filling the level.
    body.append(
      el(
        'ul',
        { class: 'wn-list' },
        release.changed.map((line) => el('li', { text: line })),
      ),
    );
  }

  body.append(el('h4', { class: 'wn-sub wn-sub-broken', text: 'Still not right' }));
  if (release.broken.length) {
    body.append(
      el(
        'ul',
        { class: 'wn-list wn-list-broken' },
        release.broken.map((line) => el('li', { text: line })),
      ),
    );
  } else {
    body.append(
      el('p', {
        class: 'wn-none',
        text: 'Nothing known outstanding from this release.',
      }),
    );
  }

  // <details> gives keyboard operation, a real disclosure role and correct
  // behaviour with no script — the older releases collapse without this file
  // owning any open/close state that could disagree with the DOM.
  // The version is a real h3, not a styled span: it is the heading of this
  // release's section, and making it one lets a screen reader jump between
  // releases instead of walking every line.
  const summary = el('summary', { class: 'wn-summary' }, [
    el('h3', { class: 'wn-version', text: `Version ${release.version}` }),
    el('span', { class: 'wn-date', text: release.date }),
  ]);

  return el('details', { class: 'wn-release', ...(open ? { open: '' } : {}) }, [summary, body]);
}

/**
 * The card. Static content — built once, never re-rendered on the 25 Hz frame,
 * because nothing here changes while the app is running.
 */
export function createWhatsNew() {
  const root = el('section', { class: 'card wn-card', 'aria-labelledby': 'wn-h' }, [
    el('h2', { id: 'wn-h', text: "What's new" }),
    el('p', {
      class: 'wn-intro',
      text: 'What each release of this panel actually did, and what it still gets wrong.',
    }),
    ...RELEASES.map((release, i) => releaseNode(release, { open: i === 0 })),
  ]);

  return { root };
}

/**
 * The banner shown once after an update, on the page the reader is already on.
 *
 * IT IS NOT AN ALERT AND MUST NOT STEAL FOCUS. A release note is the lowest
 * possible urgency — the panel is working, it is simply newer. So it is a
 * `status` region, dismissible, and it never interrupts what the reader was
 * doing (SC 4.1.3). Noah's own report that "turning the panel on closes the
 * initial instructions" is the same failure in the other direction: a surface
 * that appears or vanishes without being asked.
 *
 * It records the version as SEEN THE MOMENT IT IS SHOWN, not when it is
 * dismissed. A reader who ignores it and closes the app has still been told;
 * showing it again every launch until they press something is nagging, and the
 * notes stay permanently on BITE for anyone who wants them later.
 */
export function createUpdateBanner({ storage, onOpen, seen = loadSeen(storage), version = VERSION } = {}) {
  const notice = updateNotice(seen, version);
  saveSeen(version, storage);
  if (!notice) return null;

  const root = el('div', { class: 'wn-banner', role: 'status' });
  const missed =
    notice.count > 1 ? ` (${notice.count} releases since you last looked)` : '';

  root.append(
    el('p', { class: 'wn-banner-text' }, [
      el('strong', { text: `Updated to ${notice.version}. ` }),
      `${notice.headline}${missed}`,
    ]),
  );

  const actions = el('div', { class: 'wn-banner-actions' });
  actions.append(
    el('button', {
      type: 'button',
      class: 'wn-banner-open',
      text: 'See what changed',
      onclick: () => onOpen?.(),
    }),
    el('button', {
      type: 'button',
      class: 'wn-banner-close',
      text: 'Dismiss',
      onclick: () => root.remove(),
    }),
  );
  root.append(actions);

  return { root };
}
