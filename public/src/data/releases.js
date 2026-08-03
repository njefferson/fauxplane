/**
 * releases.js — what changed, in one place (Doctrine §7d).
 *
 * THE READER IS NOT A DEVELOPER. He is building a 747 cockpit in his house and
 * he loves planes. Every line here is written for him: what he can now see or
 * do, not what was refactored. "Fixed the residual-based accelerometer
 * rejection" is not a patch note. "Leaning the phone no longer makes the
 * horizon look like a rocket launch" is.
 *
 * THIS IS THE ONLY PLACE RELEASE NOTES ARE WRITTEN. The version stamp, the
 * service-worker cache and this list all resolve to `VERSION` in `version.js` —
 * `releases.test.mjs` fails the build if the newest entry here is not that
 * version, because notes typed twice eventually describe a build that shipped
 * something else.
 *
 * `broken` IS NOT OPTIONAL AND IS NOT A CONFESSION. Doctrine §7d requires every
 * release to say what is still wrong, in the app, where the reader will find it.
 * A panel that only lists wins teaches him to distrust the wins. An entry with
 * nothing outstanding uses an empty array and says so on screen.
 */

/**
 * Newest FIRST. Each entry:
 *   version  the release, matching version.js for the newest
 *   date     ISO day it shipped
 *   headline one short line — what this release IS, in his words
 *   changed  what he can now see or do
 *   broken   what is still wrong, that he might hit
 */
export const RELEASES = [
  {
    version: '1.9.0',
    date: '2026-08-03',
    headline: 'Far fewer requests to the aircraft feed, so it stops shutting you out.',
    changed: [
      'The app finally says what it is FOR: follow a real flight, take it on a flight and see roughly what the pilots see, or clamp it in the car while you drive. It only ever described a desk before.',
      'The radar asks for aircraft about a third as often. The cache in front of the aircraft feed was set shorter than the panel\'s own refresh, so it expired moments before every single request and never once saved one — the panel was asking a volunteer network eighteen times a minute.',
      'Changing range no longer costs a request at all. One fetch covers the widest scope and the smaller ranges filter what is already on the device, so the buttons are instant.',
    ],
    broken: [
      'Being rate limited is still possible and is not entirely ours to fix: the panel reaches the feed through Cloudflare, which shares one address across an enormous number of sites, so other people\'s traffic can use up the allowance.',
      'adsb.fi refuses this app outright — their protection blocks anything arriving from Cloudflare. The panel falls back to it and gets a block page, which is why you sometimes see two failures at once.',
      'You still cannot pick an aircraft type and see only those overhead. That is next.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-08-03',
    headline: 'An i menu at the top, holding everything that is not an instrument.',
    changed: [
      'An "i" button in the header. What this app is, how to put it on your home screen, what changed in each release, where every number comes from, and the diagnostics report — all behind one control instead of scattered across five places.',
      'What\'s new: every release, what it did, and what it still gets wrong.',
      'After an update the panel says so once, on the main screen, instead of changing under you silently.',
      'The first-time instructions now live in that menu rather than being parked on the SETUP page under the levelling controls.',
    ],
    broken: [
      'Following an aircraft still cannot show pitch, airspeed or slip. ADS-B does not broadcast them, and the panel will not invent them.',
    ],
  },
  {
    version: '1.7.4',
    date: '2026-08-03',
    headline: 'The share card is the icon art.',
    changed: [
      'The picture that appears when the app is shared is the instrument icon.',
    ],
    broken: [],
  },
  {
    version: '1.7.0',
    date: '2026-08-03',
    headline: 'Reset the panel without closing it, and tap a flight on the map.',
    changed: [
      'A power off / on control, so a panel that has got itself stuck can be restarted without hunting for the browser tab.',
      'Tapping an aircraft on the radar now starts following it — no more typing a callsign.',
      'The horizon reads all the way to 90 degrees instead of stopping at 30.',
      'Range buttons sit beside the radar on the main screen.',
    ],
    broken: [
      'The radar can take a few seconds to repopulate after a range change on a slow connection.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-08-03',
    headline: 'Leaning the phone no longer launches you into space.',
    changed: [
      'Tipping the device backwards and forwards used to swing the horizon wildly and cross it out. It now recognises that the phone was moved rather than the aeroplane, and rides through it on the gyro.',
      'The horizon sits still when the desk is still.',
    ],
    broken: [
      'A long, slow, deliberate tilt is still read as real — which is correct, because it is indistinguishable from a real one.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-08-03',
    headline: 'A first run that explains itself, and a radar you can aim.',
    changed: [
      'First-time instructions: what this is, how to install it on a phone or tablet, and what it will and will not do.',
      'The radar keeps the aircraft it already found when you change range.',
      'The menu takes less room at the top.',
    ],
    broken: [
      'You cannot yet centre the radar on an airport of your choosing.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-03',
    headline: 'Real aircraft overhead, and a horizon that works.',
    changed: [
      'The radar shows real aircraft near you, from live ADS-B, crediting whichever service answered.',
      'Following a flight drives the panel from that aircraft.',
      'Levelling: clamp the device at any angle, press once, and the horizon learns it.',
      'Pressing the version stamp produces a full text report of the panel state, to send instead of a photograph.',
    ],
    broken: [
      'Groundspeed and vertical speed need the device to actually move; on a desk they correctly read zero or cross out.',
    ],
  },
];

/** The newest release. What the on-screen "what's new" shows by default. */
export const CURRENT_RELEASE = RELEASES[0];

/**
 * Everything newer than a version the reader has already seen, newest first.
 *
 * An UNKNOWN version returns just the current release, never the whole history:
 * a first run, a cleared storage, or a downgrade should not open a wall of text
 * on someone who has never seen the app. An unrecognised string is exactly the
 * case where we know least, so it gets the smallest honest answer.
 */
export function releasesSince(seenVersion) {
  if (!seenVersion) return [];
  const index = RELEASES.findIndex((r) => r.version === seenVersion);
  if (index === -1) return [CURRENT_RELEASE];
  return RELEASES.slice(0, index);
}

/**
 * Should the post-update banner appear, and saying what?
 *
 * A FIRST EVER RUN GETS NO BANNER, and that is the case worth stating. Someone
 * who has never opened the panel is not being told "what changed" — there is no
 * before. They get the first-run instructions instead, and a banner on top of
 * those is two explanations competing on one screen. So a null seen-version
 * returns null here, and the caller still records the current version, which is
 * what makes their NEXT update announce itself properly.
 *
 * Returns null or `{ version, headline, count }` where count is how many
 * releases were missed — a reader who skipped four wants to know that.
 */
export function updateNotice(seenVersion, currentVersion = CURRENT_RELEASE.version) {
  if (!seenVersion) return null;
  if (seenVersion === currentVersion) return null;
  const missed = releasesSince(seenVersion);
  if (!missed.length) return null;
  return {
    version: currentVersion,
    headline: missed[0].headline,
    count: missed.length,
  };
}
