/**
 * info.js — the (i) menu. One place for everything that is not an instrument.
 *
 * WHY IT EXISTS. Six things a reader might want were in five different places
 * and none of them was called "information": what the app IS and how to install
 * it had been parked on the SETUP page (filed under levelling), the release
 * notes sat under "Built-in test", the diagnostics report hid behind a tap on
 * the version stamp, the accessibility statement was a footer link, and who
 * supplied the traffic was at the bottom of RADAR. Noah asked where the (i)
 * menu was; there wasn't one.
 *
 * IT MOVES CONTENT, IT DOES NOT COPY IT. The first-run instructions are the
 * SAME NODE that the power gate shows, relocated here when the gate is
 * dismissed — not a second copy of the same prose that would drift from it.
 * Same for the release notes, which are built from `releases.js` exactly as
 * they were on BITE.
 *
 * A DIALOG RATHER THAN A SIXTH TAB, for the same reason diagnostics is one: the
 * tab strip is for instruments, and Noah has already said the header must not
 * push the panel down. `<dialog>` also brings focus containment, Escape, and a
 * backdrop without this file implementing any of them.
 */

import { el } from '../render/dom.js';
import { VERSION } from '../core/version.js';
import { createWhatsNew } from './whatsnew.js';

/**
 * Where the numbers come from, and under what terms.
 *
 * TRAFFIC IS DELIBERATELY NOT CREDITED HERE. Two providers can answer and the
 * panel credits WHICHEVER ONE DID, from the response itself, on the radar page.
 * A fixed credit in a static menu is exactly the bug that shipped once — a
 * citation that is present, checked, and naming the wrong service. This section
 * says where to look instead.
 */
const SOURCES = [
  {
    name: 'Live aircraft',
    detail:
      'Volunteer ADS-B receivers, via adsb.lol or adsb.fi. The radar page credits whichever one answered, because either may, and crediting the wrong one is worse than crediting none.',
    href: 'https://www.adsb.lol/docs/open-data/api/',
  },
  {
    name: 'Airport weather (METAR)',
    detail: 'The US National Weather Service aviation weather service, reported as the observation actually reads.',
    href: 'https://aviationweather.gov/data/api/',
  },
  {
    name: 'Winds and temperature aloft',
    detail: 'Open-Meteo.',
    href: 'https://open-meteo.com/en/terms',
  },
  {
    name: 'Magnetic declination',
    detail:
      'The NOAA World Magnetic Model 2025, bundled with the app and checked against NOAA’s own published test values at 100 points.',
    href: 'https://www.ncei.noaa.gov/products/world-magnetic-model',
  },
];

/** A titled block inside the dialog. */
function section(title, children) {
  return el('section', { class: 'info-section' }, [
    el('h3', { class: 'info-h', text: title }),
    ...[].concat(children),
  ]);
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.trigger the (i) button, focused again on close
 * @param {() => void} opts.onDiagnostics opens the diagnostics report
 */
export function createInfo({ trigger, onDiagnostics }) {
  const closeTop = el('button', { class: 'info-close', type: 'button', text: 'Close' });
  const closeBottom = el('button', { class: 'info-close info-close-foot', type: 'button', text: 'Close' });

  // The first-run instructions land here. Empty until the gate hands them over,
  // which is why this is a container and not the content itself.
  const firstRunHost = el('div', { class: 'info-firstrun' });

  const whatsNew = createWhatsNew();

  const sourcesList = el(
    'ul',
    { class: 'info-sources' },
    SOURCES.map((s) =>
      el('li', {}, [
        el('strong', { text: s.name }),
        el('span', { text: ` — ${s.detail} ` }),
        el('a', { class: 'info-link', href: s.href, rel: 'noopener', target: '_blank', text: 'Terms' }),
      ]),
    ),
  );

  const diagBtn = el('button', {
    class: 'info-action',
    type: 'button',
    text: 'Open the diagnostics report',
  });
  diagBtn.addEventListener('click', () => {
    close();
    onDiagnostics?.();
  });

  const dialog = el('dialog', { class: 'info', 'aria-labelledby': 'info-h' }, [
    el('div', { class: 'info-head' }, [
      el('h2', { class: 'info-title', id: 'info-h', text: 'About this panel' }),
      closeTop,
    ]),

    firstRunHost,

    // NOT wrapped in section(): the card carries its own heading, and wrapping
    // it produced "WHAT'S NEW" immediately above "What's new".
    whatsNew.root,

    section('Where the numbers come from', [
      el('p', {
        class: 'info-body',
        text:
          'Every value on screen comes from a sensor in this device or from one of these feeds. Nothing is simulated, and a reading that is missing says so rather than being filled in.',
      }),
      sourcesList,
    ]),

    section('If something looks wrong', [
      el('p', {
        class: 'info-body',
        text:
          'The diagnostics report is the whole panel state as text, including why each missing value is missing. Send that rather than a photograph — a picture cannot show the reasons.',
      }),
      diagBtn,
    ]),

    section('Accessibility, and the small print', [
      el('p', { class: 'info-body' }, [
        el('a', {
          class: 'info-link',
          href: 'https://noahjefferson.pages.dev/accessibility',
          rel: 'noopener',
          target: '_blank',
          text: 'Accessibility statement',
        }),
      ]),
      el('p', {
        class: 'info-body info-small',
        text: 'Not a simulator · not certified for anything · never for navigation.',
      }),
      el('p', { class: 'info-body info-small', text: `Version ${VERSION}` }),
    ]),

    closeBottom,
  ]);

  document.body.append(dialog);

  function close() {
    dialog.close?.();
    dialog.hidden = true;
    trigger.focus();
  }
  for (const b of [closeTop, closeBottom]) b.addEventListener('click', close);

  function open({ scrollTo = null } = {}) {
    dialog.hidden = false;
    try {
      if (typeof dialog.showModal === 'function' && !dialog.matches(':modal')) dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
    // Focus the close control, not the first link: a reader who opened this by
    // accident must be one key from leaving.
    closeTop.focus();
    if (scrollTo) dialog.querySelector(scrollTo)?.scrollIntoView({ block: 'start' });
  }

  dialog.hidden = true;

  return {
    root: dialog,
    open,
    close,
    /** Adopt the first-run instructions from the power gate. */
    adoptFirstRun(node) {
      if (node) firstRunHost.append(node);
    },
  };
}
