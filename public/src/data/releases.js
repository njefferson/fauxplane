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
    version: '1.14.1',
    date: '2026-08-03',
    headline: 'Tapping an aircraft on the radar works. It never has before.',
    changed: [
      'Tapping an aircraft on the scope now follows it. It threw an error on every single tap since the feature was added seven releases ago, so it has never worked once — nothing caught it because the checks look at the screen and had never pressed anything.',
      'Power, levelling and clear are one control strip under the horizon now, instead of the power switch floating on its own row attached to nothing.',
    ],
    broken: [
      'The scope is still far more crowded than a real one, and still labels every aircraft with its callsign and absolute altitude. A real flight deck shows relative height in hundreds of feet, filters by an altitude band, and shows no callsigns at all. That is the next change.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-08-03',
    headline: 'Following a flight now centres the radar on it — and the crew readouts are real.',
    changed: [
      'Follow an aircraft and the scope centres on THAT aircraft, not on your desk. Every other instrument had already switched to it; the radar was the last thing still showing where you are standing. The caption names what the centre is, so it no longer says "within 40 nm of this device" while pointing at a 737 over the Sierra.',
      'Confirmed working from your own device: a 737 MAX broadcast its selected altitude (32,992 ft), its selected heading and the altimeter setting its crew was flying to. Those three readouts are real — they were built from published field names without a single real response ever having been seen, and now they have been.',
      'The PWR switch responds the instant it is pressed instead of waiting for the first weather fetch to finish.',
    ],
    broken: [
      'While the feed is rate limiting us, a followed aircraft stops updating and its instruments age out to crossed-out — the panel keeps its last real position rather than inventing a new one, which is right, but it means being turned away breaks following as well as the radar.',
    ],
  },
  {
    version: '1.13.3',
    date: '2026-08-03',
    headline: 'When the aircraft feed turns us away, the panel now says for how long.',
    changed: [
      'A rate-limited reply used to read only "rate limited us (HTTP 429)". The service usually says how long to wait and how much allowance is left, and all of that was being thrown away. It is on the gauge and in the report now.',
    ],
    broken: [
      'Being turned away on the very first request of a session is not something this app can pace its way out of. It reaches the feed through Cloudflare, which shares one address across an enormous number of sites, so the allowance can already be spent by traffic that has nothing to do with you.',
    ],
  },
  {
    version: '1.13.2',
    date: '2026-08-03',
    headline: 'The radar fills in immediately, and the report stops calling healthy things broken.',
    changed: [
      'The plan view beside the horizon asks for aircraft the moment the panel opens instead of waiting out its refresh interval. It used to sit empty for the first fifteen seconds for no reason.',
      'The diagnostics report no longer counts the followed-aircraft autopilot readouts as failures when you are not following anything. They cannot have a value on your own device — there is no autopilot to read — so they are listed as NOT APPLICABLE rather than padding the failure count.',
    ],
    broken: [],
  },
  {
    version: '1.13.1',
    date: '2026-08-03',
    headline: 'The power switch looks like equipment, and lights up when it is off.',
    changed: [
      'PWR is a switch cap now rather than another rounded button hiding among the menu controls — square, bezelled, with the legend on the face.',
      'When the panel is off, the OFF legend is LIT in amber so it draws the eye. Switched on, it goes dark and quiet. That is the way a real flight deck works: a lit annunciator means something is not normal, and nothing lights up to tell you things are fine.',
    ],
    broken: [],
  },
  {
    version: '1.13.0',
    date: '2026-08-03',
    headline: 'The diagnostics report now says what the aircraft feed actually sent.',
    changed: [
      'The report lists which fields the traffic service really provided, and on how many aircraft — so a crossed-out readout can be told apart from a field nobody is broadcasting.',
      'A "Probe the feed once" button asks the service a single time and reports the answer: the status, how long it took, and — if it is rate limiting us — exactly how long it is asking us to wait.',
    ],
    broken: [
      'Whether real aircraft broadcast the autopilot selections at all is still unknown. That readout was built from the published field names without a single real response ever having been seen; this release is how that finally gets answered.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-08-03',
    headline: 'A power switch on the panel, instead of a pop-up you had to get past.',
    changed: [
      'The app opens straight to the instruments. No dialog, nothing to accept — every instrument is honestly crossed out until you switch the panel on, which is what it should have looked like all along.',
      'PWR sits under the horizon beside the levelling controls, and it works both ways: switching off really does stop the sensors, and every instrument goes back to showing why it has nothing.',
      'What the app is, how to install it, and everything else moved into the i menu, where you can read it when you want to rather than being handed it in front of a button.',
    ],
    broken: [
      'Switching the panel off does not stop the weather or aircraft feeds. Those need no permission and no sensor, and stopping them would only cost a volunteer network another round of requests when you switch back on.',
      'The power switch is on the main screen only. From another page you would go back to PFD to reach it.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-08-03',
    headline: 'The panel stops denying a levelling it is actually using.',
    changed: [
      'Fixed: after a reload the panel said "Not levelled" while it was applying your stored levelling to every reading — the horizon badge and the diagnostics were right and the line under the horizon was wrong. It now says what is really being applied, and updates if you rotate the device.',
      'Following an aircraft now shows what its CREW has dialled in, where they broadcast it: the altitude and heading selected on the autopilot, and the altimeter setting they are flying to. It is the closest this panel gets to sitting behind them.',
    ],
    broken: [
      'Most aircraft do not broadcast the autopilot selections at all. Those read as crossed out with the aircraft named, because the panel will not guess at what a crew has set.',
      'The first-run pop-up still buries what the app is behind a big "Switch the panel on" button, so almost nobody reads it. Being fixed next.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-08-03',
    headline: 'Pick an airframe and see what is actually up there.',
    changed: [
      'The "Heard right now" list has a row of airframe buttons — whatever is overhead at that moment, named properly: "Boeing 747-400 (1)", "Airbus A320 (2)". Press one and the list shows only those.',
      'The buttons are built from the sky in front of you, so a type that has flown out of range stops being offered instead of becoming a button that finds nothing. If the one you picked leaves, the panel says so and goes back to showing everything.',
      'Aircraft that do not broadcast a type get their own button rather than being hidden, so the numbers always add up to what the scope is drawing.',
    ],
    broken: [
      'The plan view still draws every aircraft while the list is filtered. That is deliberate — a scope that hides traffic is a scope that lies about the sky.',
      'A type is only as good as what the aircraft transmits. Some send nothing, and the panel will not guess.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-08-03',
    headline: 'Far fewer requests to the aircraft feed, so it stops shutting you out.',
    changed: [
      'The app finally says what it is FOR: follow a real flight, take it on a flight and see roughly what the pilots see, or clamp it in the car while you drive. It only ever described a desk before.',
      'The radar asks for aircraft about a third as often. The cache in front of the aircraft feed was set shorter than the panel\'s own refresh, so it expired moments before every single request and never once saved one — the panel was asking a volunteer network eighteen times a minute.',
      'The version number moved to the bottom of the screen, giving the menu row back the space it was fighting for. Pressing it still opens the full diagnostics report.',
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
