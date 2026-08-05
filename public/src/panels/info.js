/**
 * info.js — the (i) menu. One place for everything that is not an instrument.
 *
 * WHY IT EXISTS. Six things a reader might want were in five different places
 * and none of them was called "information": what the app IS and how to install
 * it had been parked on the SETUP page (filed under levelling), the release
 * notes sat under "Built-in test", the diagnostics report hid behind a tap on
 * the version stamp, the accessibility statement was a footer link, and who
 * supplied the traffic was at the bottom of RADAR. The owner asked where the (i)
 * menu was; there wasn't one.
 *
 * IT MOVES CONTENT, IT DOES NOT COPY IT. The first-run instructions are the
 * SAME NODE that the power gate shows, relocated here when the gate is
 * dismissed — not a second copy of the same prose that would drift from it.
 * Same for the release notes, which are built from `releases.js` exactly as
 * they were on BITE.
 *
 * A DIALOG RATHER THAN A SIXTH TAB, for the same reason diagnostics is one: the
 * tab strip is for instruments, and the owner has already said the header must not
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
    name: 'Pilot reports, advisories and forecasts',
    detail:
      'The same service, and shown exactly as filed — nothing is summarised or reworded, because paraphrasing a hazard report is inventing one. A block with nothing in it says which nothing: a quiet sky and a service that did not answer are different facts.',
    href: 'https://aviationweather.gov/data/api/',
  },
  {
    name: 'Winds and temperature aloft',
    detail: 'Open-Meteo.',
    href: 'https://open-meteo.com/en/terms',
  },
  {
    name: 'Flight routes',
    detail:
      'adsb.lol, under the same ODbL grant as their aircraft data. Routes are inferred from the callsign and adsb.lol call them PLAUSIBLE — they are not a filed flight plan, and the panel says so wherever one is shown.',
    href: 'https://api.adsb.lol/docs',
  },
  {
    name: 'The ground on the MAP page',
    detail:
      'Natural Earth, released into the public domain by its authors. The coastline, lakes, rivers and built-up areas for this region are bundled with the app, clipped to Northern California, so the map draws with the radio off and cannot be rate limited.',
    href: 'https://www.naturalearthdata.com/about/terms-of-use/',
  },
  {
    name: 'Airports',
    detail:
      'OurAirports, released into the public domain by its contributors. 702 Northern California fields are bundled with the app, so the radar’s centre picker works with the radio off.',
    href: 'https://ourairports.com/data/',
  },
  {
    name: 'Where a hazard advisory is',
    detail:
      'OurAirports again, under the same public-domain dedication. A SIGMET draws its area as a line of navigation beacons, so a nationwide list of those beacons and their positions is bundled with the app — that is what lets the advisories be sorted into the ones over you and the ones that are not. It works with the radio off, and an advisory naming a place the list does not carry is shown as unplaced rather than guessed at.',
    href: 'https://ourairports.com/data/',
  },
  {
    name: 'Magnetic declination',
    detail:
      'The NOAA World Magnetic Model 2025, bundled with the app and checked against NOAA’s own published test values at 100 points.',
    href: 'https://www.ncei.noaa.gov/products/world-magnetic-model',
  },
];

/**
 * WHAT EACH MARK ON THE TRAFFIC SCOPE MEANS, and — the part that matters — what
 * the scope deliberately does NOT draw.
 *
 * A real display has four traffic categories. This one has two, and somebody
 * who knows the instrument will notice the amber circle and the red square are
 * missing. The honest thing is to say why in the place a reader looks things up,
 * rather than let it read as an unfinished display.
 */
const SYMBOLS = [
  {
    name: 'A triangle',
    detail: 'An aircraft broadcasting which way it is going. The triangle points along its track.',
  },
  {
    name: 'A diamond',
    detail: 'An aircraft that is not broadcasting a track. The shape says the direction is unknown rather than guessing one.',
  },
  {
    name: 'Filled in',
    detail: 'Proximate traffic — within 6 miles of the centre of the scope and 1200 feet of your altitude. This is the real definition a flight deck uses.',
  },
  {
    name: 'Larger, filled, with a ring',
    detail: 'The aircraft you are following. The whole panel is showing its flight, not this desk’s.',
  },
  {
    name: 'PLAN and MAP',
    detail:
      'Two ways to draw the scope beside the horizon. PLAN is centred and north up — what a crew uses to review a route. MAP turns the whole display so the direction of travel is at the top and puts the aeroplane near the bottom, which is what they actually fly with. MAP always says which reference is up: the ground track if there is one, the magnetic heading if not, and north with the reason when the device has neither — which on a desk is most of the time.',
  },
  {
    name: '+03↑',
    detail:
      'How far above or below you it is, in hundreds of feet, and whether it is climbing or descending faster than 500 feet a minute. Three hundred feet above and climbing, here.',
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
  const closeTop = el('button', { class: 'info-close', type: 'button', text: 'Close', 'aria-label': 'Close information' });
  // A SECOND name, not a second "Close". Two controls answering to one name is
  // ambiguous to voice control — "tap close" has no single answer — and the
  // gate caught it the moment this dialog was first measured.
  const closeBottom = el('button', {
    class: 'info-close info-close-foot',
    type: 'button',
    text: 'Close',
    'aria-label': 'Close information and return to the panel',
  });

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
        el('a', {
          class: 'info-link info-link-target',
          href: s.href,
          rel: 'noopener',
          target: '_blank',
          // NAMED, because four links all reading "Terms" are four controls
          // with one name — unusable by voice and meaningless read aloud.
          text: `Terms — ${s.name}`,
        }),
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

    section('Reading the traffic scope', [
      el('ul', { class: 'info-sources' }, SYMBOLS.map((s) => el('li', {}, [
        el('strong', { text: s.name }),
        el('span', { text: ` — ${s.detail}` }),
      ]))),
      el('p', {
        class: 'info-body info-small',
        text:
          'A real display also draws an amber circle and a red square for traffic it wants you to act on. This one never will, and that is not a gap being filled in later: those two are decided by how fast an aircraft is closing on you, and an ADS-B broadcast does not carry it. It says where an aeroplane is, not when it will reach you. Colouring one red from a guess would be exactly the invented number this panel refuses to show.',
      }),
    ]),

    section('If something looks wrong', [
      el('p', {
        class: 'info-body',
        text:
          'The diagnostics report is the whole panel state as text, including why each missing value is missing. Send that rather than a photograph — a picture cannot show the reasons.',
      }),
      diagBtn,
    ]),

    /**
     * THE LINK BACK TO THE HUB ( )
     *
     * The hub's own rule: "This hub links OUT to every sibling app, and each
     * app links back." Only the accessibility statement pointed there, buried
     * in the small print, which is a link to a POLICY rather than to the place
     * the other apps live. Somebody who likes this one had no way to find out
     * there are others.
     *
     * Its own section rather than a line in the small print, because it is an
     * offer and the small print is the disclaimers.
     */
    section('More of the owner’s apps', [
      el('p', { class: 'info-body' }, [
        el('span', { text: 'This is one of several free apps. They all live in one place: ' }),
        el('a', {
          class: 'info-link info-link-target',
          href: 'https://noahjefferson.pages.dev',
          rel: 'noopener',
          target: '_blank',
          text: 'noahjefferson.pages.dev',
        }),
      ]),
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
      // The licence, required by §7e item 7. It was missing from the first
      // build of this menu — caught by checking this app against the doctrine
      // section written from it, which is the only reason it is here.
      el('p', { class: 'info-body info-small' }, [
        el('span', { text: 'Free to use, never sold. Licensed PolyForm Noncommercial 1.0.0. ' }),
        el('a', {
          class: 'info-link',
          href: 'https://github.com/njefferson/fauxplane',
          rel: 'noopener',
          target: '_blank',
          text: 'Source on GitHub',
        }),
      ]),
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
